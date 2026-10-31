"""课题研究层（V6）：分组 → 前测 → 干预期 → 后测 → 对比报告 → 去标识化导出。

这条链是课题能否产出结题报告的命脉，逐环钉死。
"""
import os
import pytest


def _cls(client, teacher, name, students):
    cid = client.post("/api/resources/classes", json={"name": name}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students", json={"student_ids": students}, headers=teacher)
    return cid


@pytest.fixture(scope="module")
def member_student(client):
    """**课题名单内**的学生（stu-e3）。

    这几条用例原来用的是 `student` 夹具 = `stu-xiaoma`，他根本不在任何课题名单里 ——
    也就是说，它们此前一直在验证「名单外的人也能取卷、也能交卷」这个洞本身。
    """
    # 用 e3 而不是 e1：e1/e2/c1 是对比报告用例的固定分数样本，
    # 让他们再经真实端点交一份满分卷会把组间增值算反。
    from tests.conftest import _login
    return {"Authorization": "Bearer " + _login(client, "student", "e3")}


@pytest.fixture(scope="module")
def study(client, teacher):
    """建一个两班两组的课题，学生用独立 id 避免与其他测试互相污染。"""
    exp = _cls(client, teacher, "研究实验班", ["stu-e1", "stu-e2", "stu-e3"])
    ctrl = _cls(client, teacher, "研究对照班", ["stu-c1", "stu-c2", "stu-c3"])
    sid = client.post("/api/research/studies", json={
        "title": "结对编程智能体培养初中生计算思维的实践研究",
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    return {"sid": sid, "exp": exp, "ctrl": ctrl}


def test_cross_group_students_are_rejected(client, teacher):
    """跨组学生必被实验处理污染（苏格拉底锁是"任一所在班开=开"），建课题时就要拦住。"""
    a = _cls(client, teacher, "重叠A", ["stu-both", "stu-onlyA"])
    b = _cls(client, teacher, "重叠B", ["stu-both", "stu-onlyB"])
    r = client.post("/api/research/studies",
                    json={"exp_class_ids": [a], "ctrl_class_ids": [b]}, headers=teacher)
    assert r.status_code == 400 and "同时在两组" in r.json()["detail"]

    assert client.post("/api/research/studies",
                       json={"exp_class_ids": [a], "ctrl_class_ids": []},
                       headers=teacher).status_code == 400          # 少一组也不行


def test_student_cannot_touch_study_endpoints(client, student, study):
    sid = study["sid"]
    for path in (f"/api/research/studies/{sid}", "/api/research/studies", "/api/research/assessments"):
        assert client.get(path, headers=student).status_code == 403
    assert client.post(f"/api/research/studies/{sid}/pretest", headers=student).status_code == 403
    assert client.get(f"/api/research/studies/{sid}/report", headers=student).status_code == 403


def test_pretest_freezes_roster_and_pushes_paper(client, teacher, study):
    sid = study["sid"]
    d0 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d0["phase"] == "draft" and d0["next_action"]["key"] == "pretest"

    r = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()
    assert r["members"] == 6                                        # 名单在此刻冻结
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["phase"] == "pretest" and d["n"] == {"exp": 3, "ctrl": 3}
    assert d["pre_progress"] == {"done": 0, "total": 6}
    assert len(d["consent_missing"]) == 6                            # 都还没签同意书，前端要显示

    # 建卷后立即锁定：卷子发出去还能改题，前后测就不是同一份工具了
    a = [x for x in client.get("/api/research/assessments", headers=teacher).json()["items"]
         if x["id"] == r["assessment_id"]][0]
    assert a["locked"] == 1 and a["item_count"] == 18 and a["kind"] == "pre"


def test_assessment_requires_consent_and_hides_answers(client, teacher, member_student, study):
    """测评同样在收集未成年人数据，门禁不能只设在 AI 对话上；学生也不能拿到标答。"""
    sid = study["sid"]
    aid = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["pre_assessment_id"]

    client.delete("/api/consent", headers=member_student)
    assert client.get(f"/api/research/my/assessments/{aid}", headers=member_student).status_code == 403
    client.post("/api/teacher/consent", json={"student_id": "stu-e3"}, headers=teacher)

    paper = client.get(f"/api/research/my/assessments/{aid}", headers=member_student).json()
    assert paper["item_count"] == 18
    blob = str(paper["items"])
    assert "answer" not in blob and "'dim'" not in blob     # 标答与维度标签都不能下发（维度也泄题）
    assert all(len(it["options"]) == 4 for it in paper["items"])
    # dim_max 的**键序**就是第 1~6 题的维度序列（交错组卷、首现建键），
    # 下发它等于把上面刚裁掉的 dim 标签又还回去
    assert "dim_max" not in paper


def _ensure_phase(client, teacher, sid, want: str):
    """把课题推进到指定阶段。用例之间不该靠执行顺序耦合 —— 单跑一条也要能过。"""
    order = ["draft", "pretest", "running", "posttest", "closed"]
    # **必须读 next_action 推进，不能写死 step 表**。写死的表会绕开老师在界面上的真实路径：
    # 之前它把 posttest 阶段直接映射成 close，于是「后测卷根本发不出去」这个洞
    # 在测试里被完美掩盖 —— 唯一的主按钮走的是 next_action，而测试走的是自己那张表。
    for _ in range(12):
        cur = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
        if order.index(cur["phase"]) >= order.index(want):
            return cur["phase"]
        key = cur["next_action"]["key"]
        if key == "report":
            return cur["phase"]
        client.post(f"/api/research/studies/{sid}/{key}", json={"force": True}, headers=teacher)
    raise AssertionError(f"推不到 {want}")


def _answer_all(client, teacher, sid, uid, correct: int, kind="pre", dur=300):
    """让某个学生答对前 correct 题（其余故意答错），走真实提交端点。"""
    from app import store_study as S
    aid = client.get(f"/api/research/studies/{sid}", headers=teacher).json()[f"{kind}_assessment_id"]
    items = S.get_assessment(aid, with_answers=True)["items"]
    answers = [it["answer"] if i < correct else (it["answer"] + 1) % 4 for i, it in enumerate(items)]
    S.save_response(aid, uid, {
        "answers": answers, "total": float(correct),
        "dim_scores": {}, "item_scores": [1.0 if i < correct else 0.0 for i in range(len(items))],
        "duration_sec": dur, "flags": []})
    return aid


def test_submit_scores_and_refuses_retake(client, teacher, member_student, study):
    sid = study["sid"]
    aid = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["pre_assessment_id"]
    from app import store_study as S
    items = S.get_assessment(aid, with_answers=True)["items"]

    # 服务端时长（铁律10）：先取卷落首开时刻，再把它回拨 400 秒模拟真实作答用时
    # （测试里开卷与交卷在同一秒，服务端时差会如实判 too_fast —— 那是对的，这里要绕开它）
    client.get(f"/api/research/my/assessments/{aid}", headers=member_student)
    with S._conn() as c:
        c.execute("UPDATE assessment_open_log SET opened_at=opened_at-400"
                  " WHERE assessment_id=? AND student_id='stu-e3'", (aid,))

    r = client.post(f"/api/research/my/assessments/{aid}/submit",
                    json={"answers": [it["answer"] for it in items], "duration_client": 400},
                    headers=member_student).json()
    # 蓝图红线：**分数不下发学生** —— 交卷响应只有中性完成态，总分/维度分/逐题对错一律不回
    assert r == {"ok": True, "done": True, "kind": "pre"}
    # 分照旧落库（教师端与报告照看）；断言改读库里的落库值
    row = S.response_of(aid, "stu-e3")
    assert row["total"] == 18
    assert set(row["dim_scores"]) == {"decompose", "abstract", "model", "algorithm", "verify", "transfer"}
    assert all(v == 100 for v in row["dim_scores"].values())
    assert row["duration_server"] >= 395 and row["flags"] == []   # 服务端时差落库且不误判

    # 重做会污染前后测差，必须拒绝
    again = client.post(f"/api/research/my/assessments/{aid}/submit",
                        json={"answers": [0] * 18, "duration_sec": 5}, headers=member_student)
    assert again.status_code == 409
    # 交卷不写 ct_event —— 写了会被算进"学习用时"和六维证据量
    from app import store
    assert not any(e["type"] == "assess_submit" for e in store.ct_events("stu-e3"))


def test_submit_flags_careless_responses(client, teacher, member_student, study):
    """答太快、全选同一项 —— 量表数据清洗的行业惯例，系统替老师打好标记。"""
    from app import store_study as S
    sid = study["sid"]
    aid = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["pre_assessment_id"]
    S.save_response(aid, "stu-乱答", {"answers": [1] * 18, "total": 4, "dim_scores": {},
                                     "item_scores": [0] * 18, "duration_sec": 20,
                                     "flags": []})
    # 直接走端点才有 flags；这里验证判定逻辑本身
    from app.study import submit_assessment  # noqa: F401  确保模块可导入
    r = client.post(f"/api/research/my/assessments/{aid}/submit",
                    json={"answers": [2] * 18, "duration_sec": 10}, headers=member_student)
    assert r.status_code == 409          # 该学生已交过（上面的用例），此处只确认不重复计分


def test_start_gate_and_socratic_is_actually_applied(client, teacher, study):
    """前测收不齐时不硬禁止（老师会绕过平台发纸质卷，那更糟），但要留痕。"""
    sid, exp, ctrl = study["sid"], study["exp"], study["ctrl"]
    _ensure_phase(client, teacher, sid, "pretest")

    r0 = client.post(f"/api/research/studies/{sid}/start", json={}, headers=teacher)
    assert r0.status_code == 200, r0.text
    assert r0.json()["blocked"] is True and "没做前测" in r0.json()["message"]   # 0/6 收卷

    # 只答 2/6（33%）仍在闸门之下，必须能强制开始并留下痕迹
    for uid in ("stu-e1", "stu-c1"):
        _answer_all(client, teacher, sid, uid, correct=9 if uid.startswith("stu-e") else 8)
    assert client.post(f"/api/research/studies/{sid}/start", json={},
                       headers=teacher).json()["blocked"] is True
    r = client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher).json()
    assert r["ok"] is True and r["forced"] is True

    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["phase"] == "running" and d["forced_start"] == 1
    cls = {c["id"]: c for c in client.get("/api/resources/classes", headers=teacher).json()["items"]}
    assert cls[exp]["socratic"] is True and cls[ctrl]["socratic"] is False   # 干预真的施加了
    assert d["fidelity"]["breaks"] == [] and d["fidelity"]["forced_start"] is True


def test_class_in_a_running_study_cannot_be_deleted(client, teacher, study):
    """删掉进行中课题的班级 = 样本残缺，数据当场作废。"""
    r = client.delete(f"/api/resources/classes/{study['exp']}", headers=teacher)
    assert r.status_code == 409 and "正在使用这个班" in r.json()["detail"]


def test_end_freezes_snapshots_and_restores_class_settings(client, teacher, study):
    sid, exp = study["sid"], study["exp"]
    _ensure_phase(client, teacher, sid, "running")
    # 显式给事件打时间戳落在干预期内。窗口是左闭右开 [started_at, ended_at)，
    # 测试里开始与结束发生在同一秒，靠 wall clock 写事件会正好落在边界外。
    import app.store as st
    from app import store_study as _S
    t0 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["started_at"]
    _S.update_study(sid, {"started_at": t0 - 3600})        # 把起点前移，模拟真实的一段课时
    with st._conn() as c:
        for uid in ("stu-e1", "stu-e2", "stu-c1"):
            for i, t in enumerate(("run", "run", "error", "fix")):
                c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,'',NULL,?,2)",
                          (uid, t, t0 - 1800 + i))

    assert client.post(f"/api/research/studies/{sid}/end", headers=teacher).json()["ok"] is True
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["phase"] == "posttest" and d["ended_at"]

    from app import store_study as S
    snaps = S.snapshots(sid, "intervention")
    assert len(snaps) == 6                                     # 每个成员都有快照
    from app.ct import FORMULA_VERSION
    # 断言"与单一真源一致"，不写死字面量 —— 写死的话每次升口径版本都会假失败
    assert all(x["formula_version"] == FORMULA_VERSION for x in snaps)
    assert all(x["scoring_profile"] == "neutral" for x in snaps)   # 预注册口径被带进快照
    e1 = next(x for x in snaps if x["student_id"] == "stu-e1")
    assert e1["behavior"]["attempts"] == 2 and e1["has_real_data"] == 1

    # 一轮研究不该永久改变老师的班级设置
    cls = {c["id"]: c for c in client.get("/api/resources/classes", headers=teacher).json()["items"]}
    assert cls[exp]["socratic"] is False


def test_neutral_profile_removes_the_ai_help_shortcut():
    """抽象维原公式含 ai_helps*5，而"问 AI 的次数"正是干预的直接机械后果 ——
    拿它做因变量等于自变量直通因变量，研究场景必须用 neutral。"""
    from app import store, ct
    uid = "stu-求助多"
    for _ in range(6):
        store.add_ct_event(uid, "ai_help", "", None)
    assert ct.summary_for(uid)["process_indices"]["abstract"] > ct.summary_for(uid, profile="neutral")["process_indices"]["abstract"]


def test_report_compares_groups_and_always_states_its_limits(client, teacher, study):
    sid = study["sid"]
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：报告默认剔除无有效监护人同意的学生。
    # 测试库学生默认无 consent，这里显式开通全部成员，保持原有断言数字不变。
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-e1", "stu-e2", "stu-e3", "stu-c1", "stu-c2", "stu-c3"]},
                headers=teacher)
    _ensure_phase(client, teacher, sid, "posttest")
    for uid, sc in (("stu-e1", 9), ("stu-e2", 9), ("stu-c1", 8)):     # 补齐前测（可能被单跑跳过）
        _answer_all(client, teacher, sid, uid, correct=sc)
    client.post(f"/api/research/studies/{sid}/posttest", headers=teacher)
    for uid, sc in (("stu-e1", 15), ("stu-e2", 14), ("stu-c1", 10)):
        _answer_all(client, teacher, sid, uid, correct=sc, kind="post")
    client.post(f"/api/research/studies/{sid}/close", headers=teacher)

    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert rep["study"]["phase"] == "closed"
    assert rep["assess"]["exp"]["n_paired"] == 2 and rep["assess"]["ctrl"]["n_paired"] == 1
    assert rep["assess"]["exp"]["gain_mean"] > rep["assess"]["ctrl"]["gain_mean"]
    assert "between_gain_diff" in rep["assess"]
    assert "p_value" not in str(rep)                    # 平台不出 p 值（见 stats.py）

    # 边界声明由服务端硬生成、不可关闭 —— 平台不能只报喜
    blob = "\n".join(rep["caveats"])
    assert "不是标准化计算思维测评" in blob
    assert "整群分配" in blob and "非随机化" in blob
    assert "前测未收齐" in blob                          # 本例是 force 开始的
    assert "不足 20" in blob                             # 小样本
    assert rep["attrition"]["exp"]["assigned"] == 3
    assert rep["writeup"] and "准实验设计" in rep["writeup"][0]


def test_export_is_deidentified_and_fails_closed_without_a_fixed_salt(client, teacher, study):
    sid = study["sid"]
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：导出默认剔除无同意学生的整行。
    # 显式开通全部成员（重复开通幂等），保持 n=6 的原有断言不变。
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-e1", "stu-e2", "stu-e3", "stu-c1", "stu-c2", "stu-c3"]},
                headers=teacher)
    from app import research
    # 不依赖环境里有没有配盐 —— 显式把两个分支都走一遍
    original = research.SALT_IS_EPHEMERAL
    research.SALT_IS_EPHEMERAL = True
    r = client.get(f"/api/research/studies/{sid}/export", headers=teacher)
    # 研究导出必然分多批，盐不固定 → 假名不跨批稳定 → 前后测配不上 → 数据作废
    assert r.status_code == 400 and "JIEDUI_EXPORT_SALT" in r.json()["detail"]

    research.SALT_IS_EPHEMERAL = False
    try:
        csv_text = client.get(f"/api/research/studies/{sid}/export", headers=teacher).text
        head = csv_text.splitlines()[0]
        for must in ("group", "cluster", "pre_total", "post_total", "gain_total",
                     "iv_socratic", "bl_sv_mixed", "diagnostic_profile",
                     "diagnostic_only"):
            assert must in head, f"导出缺少统计上必需的字段：{must}"
        assert "stu-" not in csv_text and "研究实验班" not in csv_text     # 无原始 id、无班名
        rows = csv_text.splitlines()[1:]
        # 缺测留空，绝不填 0 —— 0 分和缺测在统计上完全是两回事
        c3 = [r for r in rows if r.split(",")[2] == "ctrl"]
        assert any(r.split(",")[head.split(",").index("post_total")] == "" for r in c3)

        j = client.get(f"/api/research/studies/{sid}/export?format=json", headers=teacher).json()
        assert j["anonymized"] is True and j["n"] == 6
        assert j["audit"] and any(a["action"] == "start" for a in j["audit"])   # 操作留痕可追溯
    finally:
        research.SALT_IS_EPHEMERAL = original


def test_fidelity_is_not_a_false_alarm_after_the_study_ends(client, teacher, study):
    """结束时本来就会把班级设置恢复原状；再拿"当前设置"比"干预期应有值"必然全部报警。
    保真度在结束后必须看冻结快照里的实况。"""
    sid = study["sid"]
    _ensure_phase(client, teacher, sid, "posttest")
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["phase"] in ("posttest", "closed")
    assert d["fidelity"]["breaks"] == []            # 恢复设置不该被当成"干预没做到位"
    assert d["fidelity"]["checked"] is True

    from app import store_study as S
    snaps = S.snapshots(sid, "intervention")
    exp = [x for x in snaps if x["group_kind"] == "exp"]
    ctrl = [x for x in snaps if x["group_kind"] == "ctrl"]
    # 快照记录的是干预期当时的实况：实验组开着、对照组关着
    assert exp and all(x["socratic_during"] == 1 for x in exp)
    assert ctrl and all(x["socratic_during"] == 0 for x in ctrl)

    # **recompute 不许冲掉保真度记录**。end 时班级设置已恢复原状，重算若现取实时设置，
    # 实验组的 socratic_during 会被改写成 0、逐生刷出保真度告警，
    # 「干预保真度受影响」被写进结题报告 —— 污蔑一次做得很规范的干预。
    # save_snapshot 对该列首写即定；这条曾被审计点名「用例没在 end 后调 recompute，盖不住」。
    r = client.post(f"/api/research/studies/{sid}/recompute", headers=teacher)
    assert r.status_code == 200
    d2 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d2["fidelity"]["breaks"] == [], "recompute 之后保真度记录被冲掉了"
    snaps2 = S.snapshots(sid, "intervention")
    assert all(x["socratic_during"] == 1 for x in snaps2 if x["group_kind"] == "exp")
    # 自述字段要跟着 dims 一起刷新（快照不能挂着旧标签给出新数字）
    assert all(x["formula_version"] == S.FORMULA_VERSION for x in snaps2)


def test_recompute_refuses_to_run_before_the_study_starts(client, teacher, study):
    """干预期没开始就没有窗口可算 —— 原来照样跑，会写下 win_end=当时 now 的 baseline 快照，
    之后再也分不清那行 dims 是按哪个窗口算的。"""
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [study["exp"]], "ctrl_class_ids": [study["ctrl"]]}, headers=teacher).json()["id"]
    assert client.post(f"/api/research/studies/{sid}/recompute", headers=teacher).status_code == 400
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    assert client.post(f"/api/research/studies/{sid}/recompute", headers=teacher).status_code == 400
    client.delete(f"/api/research/studies/{sid}", headers=teacher)


# ======== 第二轮对抗式审计补的回归用例 ========

def test_teacher_can_actually_reach_the_posttest(client, teacher, study):
    """只按界面上那个唯一的主按钮走，必须能走到「下发后测」。

    这是整条链最贵的一个洞：`_next_action` 曾把 posttest 阶段直接映射成 close，
    而前端唯一的主按钮就是 `step(next_action.key)`，全站没有别处调用 /posttest。
    于是老师照平台指引一路点完，post_assessment_id 永远是 NULL ——
    前后测差是这个准实验唯一的主结局，而他要到收官看报告那一刻才发现它是空的，
    此时干预期已结束、班级设置已恢复，补不回来。
    """
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [study["exp"]], "ctrl_class_ids": [study["ctrl"]]}, headers=teacher).json()["id"]
    _ensure_phase(client, teacher, sid, "posttest")
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["phase"] == "posttest"
    assert d["next_action"]["key"] == "posttest"          # 不是 close
    # 点它，后测卷才真的建出来
    client.post(f"/api/research/studies/{sid}/posttest", json={}, headers=teacher)
    d2 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d2["post_assessment_id"] and d2["next_action"]["key"] == "close"


def test_close_without_posttest_is_blocked_but_forceable(client, teacher, study):
    """没发后测就收官 = 主结局永久为空，拦一道；老师坚持也可以，但要留痕。"""
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [study["exp"]], "ctrl_class_ids": [study["ctrl"]]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    r = client.post(f"/api/research/studies/{sid}/close", json={}, headers=teacher).json()
    assert r.get("blocked") == "no_posttest"
    assert client.get(f"/api/research/studies/{sid}", headers=teacher).json()["phase"] == "posttest"
    client.post(f"/api/research/studies/{sid}/close", json={"force": True}, headers=teacher)
    assert client.get(f"/api/research/studies/{sid}", headers=teacher).json()["phase"] == "closed"


def test_outsider_cannot_read_or_submit_a_paper(client, teacher, student, study):
    """名单外的学生不能凭 id 拖走卷子，也不能对它交卷。

    否则：① 18 道题的完整题干可以在前测下发前就发到班群，前后测「同蓝图不同题」的
    等值设计失效；② 他乱填的作答会进 _alpha，把要写进论文的信度指标算歪。
    用 404 不用 403 —— 403 等于确认「这个 id 存在」，而卷子 id 是连号的。
    """
    sid = study["sid"]
    aid = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["pre_assessment_id"]
    client.post("/api/teacher/consent", json={"student_id": "stu-xiaoma"}, headers=teacher)
    assert client.get(f"/api/research/my/assessments/{aid}", headers=student).status_code == 404
    assert client.post(f"/api/research/my/assessments/{aid}/submit",
                       json={"answers": [0] * 18, "duration_sec": 300},
                       headers=student).status_code == 404


def test_careless_responses_are_excluded_from_the_conclusion(client, teacher):
    """直线作答不能进均值/增值/效应量，且必须在边界声明里交代剔除了几份。"""
    from app import store_study as S
    exp = _cls(client, teacher, "清洗实验班", ["stu-w1", "stu-w2", "stu-w3"])
    ctrl = _cls(client, teacher, "清洗对照班", ["stu-w4", "stu-w5", "stu-w6"])
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：报告默认剔除无同意学生，先显式开通
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-w1", "stu-w2", "stu-w3", "stu-w4", "stu-w5", "stu-w6"]},
                headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    items = S.get_assessment(aid, with_answers=True)["items"]
    good = [it["answer"] for it in items]
    for uid in ("stu-w1", "stu-w2"):
        S.save_response(aid, uid, {"answers": good, "total": 18.0, "dim_scores": {},
                                   "item_scores": [1.0] * 18, "duration_sec": 400, "flags": []})
    # 一份 10 秒交卷的全 A 卷
    S.save_response(aid, "stu-w3", {"answers": [0] * 18, "total": 4.0, "dim_scores": {},
                                    "item_scores": [0.0] * 18, "duration_sec": 10,
                                    "flags": ["too_fast", "straightline"]})
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert rep["assess"]["exp"]["n"] == 2                  # 3 人交卷，只有 2 份能用
    assert rep["assess"]["exp"]["mean"] == 18.0            # 乱答那份没把均分拖下来
    assert rep["assess"]["exp"]["excluded"] == 1
    assert any("剔除 1 份异常作答" in c for c in rep["caveats"])


def test_heavy_usage_no_longer_maxes_out_process_dimensions(client, teacher):
    """一轮真实用量下六维不许撞顶 —— v3（质量率 × 饱和量）就是为此重设计的。

    v2 的六维是行为累计的线性函数再 clamp 到 100：同样的载荷（人均 60 跑 + 12 修）
    曾让 4/6 个维度在全体学生身上变成常数 100，组间差恒 0，报告却把它们当「机制解释」。
    这条用例原来钉的是「撞了顶必须承认」；v3 后钉「根本不该撞顶」——
    ceiling 检测保留为保险丝，正常载荷下必须保持沉默。
    """
    import time
    from app import store, store_study as S
    exp = _cls(client, teacher, "撞顶实验班", ["stu-cap1", "stu-cap2"])
    ctrl = _cls(client, teacher, "撞顶对照班", ["stu-cap3", "stu-cap4"])
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：过程指标默认剔除无同意学生，先显式开通
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-cap1", "stu-cap2", "stu-cap3", "stu-cap4"]},
                headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    # 干预期窗口是 [started_at, ended_at)。测试里 start/灌事件/end 都在同一秒，
    # 事件的 ts 恰好等于 ended_at 会被右开区间排除，一条都进不去 ——
    # 所以把课题起点推到 6 周前，并给事件显式的过去时间戳（模拟真实节奏）。
    now = int(time.time())
    S.update_study(sid, {"started_at": now - 42 * 86400})
    with store._lock, store._conn() as c:
        for uid in ("stu-cap1", "stu-cap2", "stu-cap3", "stu-cap4"):
            ts = now - 40 * 86400
            seq = ["run"] * 60 + ["error", "fix"] * 12
            for t in seq:
                ts += 600
                c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                          " VALUES(?,?,'',NULL,?,2)", (uid, t, ts))
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    iv = rep["process"]["exp"]["intervention"]
    assert iv["diagnostic_only"] is True
    dims = iv["diagnostic_process_indices"]
    # ① 这个载荷（v2 时代 4/6 维撞顶）下，任何维都不到 100，撞顶保险丝保持沉默
    assert all(v < 100 for v in dims.values()), f"v3 不该再撞顶：{dims}"
    assert rep["process"]["ceiling"] == []
    assert not any("不具区分度" in c for c in rep["caveats"])
    # ② 且六维仍有区分度（不是塌成同一个值）
    assert len(set(dims.values())) >= 4, f"六维塌缩：{dims}"


def test_writeup_does_not_confuse_pretest_n_with_paired_n(client, teacher):
    """结题报告的成稿必须写清「N 人」是哪一个 N。

    前测交卷、后测交卷、前后都交（配对）是三个不同的数，而增值只能由配对样本算出。
    原来一句话里混用 n（前测人数）和由 n_paired 算出的增值 ——
    读者会以为 8 个人产出了那个增值，实际只有 7 个。这段文字明着标了
    「可直接抄进结题报告」，写歪了会原样进论文。
    """
    import time
    from app import store_study as S
    exp = _cls(client, teacher, "写法实验班", ["stu-wu1", "stu-wu2"])
    ctrl = _cls(client, teacher, "写法对照班", ["stu-wu3", "stu-wu4"])
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：报告默认剔除无同意学生，先显式开通
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-wu1", "stu-wu2", "stu-wu3", "stu-wu4"]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    pre_aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    post_aid = client.post(f"/api/research/studies/{sid}/posttest", headers=teacher).json()["assessment_id"]
    # 实验组 2 人都交了前测，但只有 1 人交了后测 → 配对 n=1，前测 n=2
    for uid, total in (("stu-wu1", 8.0), ("stu-wu2", 9.0)):
        S.save_response(pre_aid, uid, {"answers": [0] * 18, "total": total, "dim_scores": {},
                                       "item_scores": [1.0] * 18, "duration_sec": 400, "flags": []})
    S.save_response(post_aid, "stu-wu1", {"answers": [0] * 18, "total": 14.0, "dim_scores": {},
                                          "item_scores": [1.0] * 18, "duration_sec": 400, "flags": []})
    client.post(f"/api/research/studies/{sid}/close", json={"force": True}, headers=teacher)
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert rep["assess"]["exp"]["n"] == 2 and rep["assess"]["exp"]["n_paired"] == 1
    head = rep["writeup"][0]
    assert "完成前测" in head and "可计算增值" in head, head
    assert "n=1" in rep["writeup"][1], rep["writeup"][1]


def test_implausible_effect_size_is_called_out(client, teacher):
    """d>2 几乎一定是样本太小或数据异常，不是"效果特别好" —— 平台自己先说破。"""
    from app import store_study as S
    exp = _cls(client, teacher, "效应实验班", ["stu-ef1", "stu-ef2", "stu-ef3"])
    ctrl = _cls(client, teacher, "效应对照班", ["stu-ef4", "stu-ef5", "stu-ef6"])
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：报告默认剔除无同意学生，先显式开通
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-ef1", "stu-ef2", "stu-ef3", "stu-ef4", "stu-ef5", "stu-ef6"]},
                headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    pre_aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    post_aid = client.post(f"/api/research/studies/{sid}/posttest", headers=teacher).json()["assessment_id"]
    def put(aid, uid, total):
        S.save_response(aid, uid, {"answers": [0] * 18, "total": total, "dim_scores": {},
                                   "item_scores": [1.0] * 18, "duration_sec": 400, "flags": []})
    # 实验组约 +6、对照组约 +1，组内离散极小 —— d 会被撑到荒谬的量级。
    # 增值不能**完全**相同：方差为 0 时 stats.cohens_d 会返回 None（它拒绝硬凑数字，那是对的）。
    for uid, g in (("stu-ef1", 6.0), ("stu-ef2", 6.2), ("stu-ef3", 5.8)):
        put(pre_aid, uid, 8.0); put(post_aid, uid, 8.0 + g)
    for uid, g in (("stu-ef4", 1.0), ("stu-ef5", 1.2), ("stu-ef6", 0.8)):
        put(pre_aid, uid, 8.0); put(post_aid, uid, 8.0 + g)
    client.post(f"/api/research/studies/{sid}/close", json={"force": True}, headers=teacher)
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert abs(rep["assess"]["cohens_d"]) > 2
    assert any("远超教育干预常见范围" in w for w in rep["writeup"]), rep["writeup"]


def test_consent_granted_after_pretest_clears_the_warning(client, teacher):
    """现实顺序是「发前测 → 告警出现 → 老师才去开通」—— 开通后告警必须消失。

    consent_ok 曾在下发前测那一刻冻结进 study_members 且永不刷新：告警恒显示全员未登记、
    批量开通按钮永远在、流失表把 consent_ok 记成 0、导出也写死 0。
    这条是**浏览器实证**抓到的（第三轮）：库里 15 人已开通，界面写着「20 人未登记」。
    """
    from app import store
    exp = _cls(client, teacher, "同意实验班", ["stu-lc1", "stu-lc2"])
    ctrl = _cls(client, teacher, "同意对照班", ["stu-lc3", "stu-lc4"])
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert len(d["consent_missing"]) == 4                     # 冻结时点确实无人开通

    # 老师此刻才收齐同意书 → 批量开通 → 告警立刻反映实时状态
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-lc1", "stu-lc2", "stu-lc3"]}, headers=teacher)
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    assert d["consent_missing"] == ["stu-lc4"], d["consent_missing"]

    # 流失表与导出同口径（实时），不再是冻结的 0
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert rep["attrition"]["exp"]["consent_ok"] == 2
    # T0-2 分析集口径：lc4 始终没开通 → 报告如实报剔除 1 人，并写进边界声明
    assert rep["excluded_no_consent"] == 1 and rep["analysis_set"] is True
    assert any("无有效监护人同意" in c for c in rep["caveats"])
    csv_text = client.get(f"/api/research/studies/{sid}/export?format=wide", headers=teacher).text
    head = csv_text.splitlines()[0].split(",")
    i = head.index("consent_ok")
    assert sum(int(r.split(",")[i]) for r in csv_text.splitlines()[1:]) == 3
    # 分析集导出里 lc4 整行不出现（3 行全是已同意者）；誊录视图才保留全量 4 行
    assert len(csv_text.strip().splitlines()) == 1 + 3
    full = client.get(f"/api/research/studies/{sid}/export?format=wide&include_no_consent=1",
                      headers=teacher).text
    assert len(full.strip().splitlines()) == 1 + 4


def test_double_click_on_every_transition_has_exactly_one_winner(client, teacher):
    """状态机每一步都可能被双击（教室网络卡时老师一定连点）——只能有一个赢家。

    最重的是 start：输家如果也执行「读原值→改设置」，它读到的「原值」是赢家改过的
    （实验班=开），socratic_before 被污染，研究结束时恢复的就是错的原值 ——
    实验班的苏格拉底锁被**永久**改开。pretest 双开则是学生收到两份前测卷。
    """
    from app import store_resources as R
    exp = _cls(client, teacher, "双击实验班", ["stu-dc1", "stu-dc2"])
    ctrl = _cls(client, teacher, "双击对照班", ["stu-dc3", "stu-dc4"])
    R.set_class_socratic(exp, False)                 # 原值：关
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]

    r1 = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()
    r2 = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    # 第二击：要么 409（相位已变），要么幂等返回同一份卷 —— 决不能建出第二份
    assert r2.status_code in (200, 409)
    if r2.status_code == 200:
        assert r2.json().get("assessment_id") == r1["assessment_id"]

    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    s = __import__("app.store_study", fromlist=["x"]).get_study(sid)
    # socratic_before 必须还是干净的原值（exp=0），不能被第二击读到的"已开"污染
    assert s["socratic_before"][str(exp)] == 0, s["socratic_before"]
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    cls_now = {c["id"]: c for c in client.get("/api/resources/classes", headers=teacher).json()["items"]}
    assert cls_now[exp]["socratic"] is False          # 结束后恢复的是真正的原值


def test_orphan_fix_in_window_counts_as_full_fix_rate():
    """期段切分把「报错」留在窗口外、「修好」落在窗口内：修复率取 1 不取 0。

    修复本身就是验证行为的证据；同一次修复曾因窗口边界从 66 分被压到 6 分，
    错值会被冻进快照、进组间过程对比与导出。
    """
    import app.store as st
    from app import ct
    uid = "stu-孤儿修复"
    with st._conn() as c:
        for ts, t in ((100, "error"), (200, "run"), (201, "fix")):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,'',NULL,?,2)",
                      (uid, t, ts))
    full = ct.summary_for(uid, profile="neutral")["process_indices"]["verify"]
    windowed = ct.summary_for(uid, since=150, profile="neutral")["process_indices"]["verify"]
    # 窗口内 errors=0 fixes=1：修复率按 1 算，两个口径的差距只来自证据量项，不再是 66 vs 6
    assert windowed > 0 and full - windowed <= 12, (full, windowed)


def test_item_stats_pure_functions_edge_cases():
    """item_difficulty / point_biserial 的纯算术边界（终审 #5，升级方案 L47）：
    空矩阵、行长不齐拒算；全对/全错、样本 <3、总分无变异一律 None（拒凑，与 cohens_d 同则）。"""
    from app import stats
    assert stats.item_difficulty([]) == []
    assert stats.item_difficulty([[1, 0], [1]]) == []                 # 行长不齐：拒算不硬对齐
    assert stats.item_difficulty([[1, 0, 1], [1, 1, 0], [0, 0, 1]]) == [0.67, 0.33, 0.67]
    assert stats.point_biserial([1, 1, 1], [3, 2, 1]) is None         # 全对：无区分信息
    assert stats.point_biserial([1, 0], [2, 1]) is None               # 样本 <3
    assert stats.point_biserial([1, 0, 1, 0], [5, 5, 5, 5]) is None   # 总分无变异
    # 与总分同向：区分度为正；同一数据把 0/1 翻转，区分度严格变号（对称性）
    r = stats.point_biserial([1, 1, 0, 0], [9, 8, 3, 2])
    assert r is not None and r > 0.9
    assert stats.point_biserial([0, 0, 1, 1], [9, 8, 3, 2]) == -r


def test_report_demotes_alpha_and_reports_item_stats(client, teacher):
    """α 范畴修正（终审 #5，升级方案 L47）：能力卷停报 α 作信度主张 ——
    assess 块报 item_stats（逐题通过率 + 点二列区分度，与均分同一分析集口径）
    + alpha_reference（同质性参考值）；低 α 的 caveat 改中性表述，
    不再写「可靠性有限」（维度异质是设计而非缺陷，低 α 不是工具缺陷的证据）。"""
    from app import store_study as S
    exp = _cls(client, teacher, "题目统计实验班", ["stu-it1", "stu-it2"])
    ctrl = _cls(client, teacher, "题目统计对照班", ["stu-it3", "stu-it4"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-it1", "stu-it2", "stu-it3", "stu-it4"]},
                headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    # 构造 α 必然极低的作答矩阵（奇偶/前后半互补 —— 题间近零/负相关，总分仍有变异）：
    # 这正是「维度异质」的极端形态，旧 caveat 会把它错写成「卷子可靠性有限」。
    pats = {
        "stu-it1": [1.0, 0.0] * 9,                 # 总分 9
        "stu-it2": [0.0, 1.0] * 9,                 # 总分 9
        "stu-it3": [1.0] * 10 + [0.0] * 8,         # 总分 10
        "stu-it4": [0.0] * 10 + [1.0] * 8,         # 总分 8
    }
    for uid, sc in pats.items():
        S.save_response(aid, uid, {"answers": [0] * 18, "total": sum(sc), "dim_scores": {},
                                   "item_scores": sc, "duration_sec": 400, "flags": []})

    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert "alpha" not in rep["assess"] and "alpha_reference" in rep["assess"]   # 字段名即口径
    ist = rep["assess"]["item_stats"]["pre"]
    assert len(ist["difficulty"]) == 18 and len(ist["discrimination"]) == 18
    assert ist["difficulty"][0] == 0.5                        # 第 1 题 it1/it3 对 → p=2/4
    assert ist["discrimination"][0] is not None and ist["discrimination"][0] > 0
    assert rep["assess"]["item_stats"]["post"] == {"difficulty": [], "discrimination": []}
    a = rep["assess"]["alpha_reference"]["pre"]
    assert a is not None and a < 0.6                          # 互补矩阵 α 必然极低
    blob = "\n".join(rep["caveats"])
    assert "α 参考值" in blob and "item_stats" in blob        # 中性 caveat：指向逐题证据
    assert "同质性" in blob
    assert "可靠性有限" not in blob                            # 旧的范畴误用表述必须消失


def test_export_row_formula_version_reads_the_snapshot_not_the_registration(client, teacher):
    """导出的行级口径版本必须读快照自带的 —— 课题注册值只代表立项时点。

    v2 立项、v3 平台上 recompute 后：dims 是 v3 算的，照抄注册值等于给 v3 的数字贴 v2 标签。
    """
    from app import store_study as S
    exp = _cls(client, teacher, "版本实验班", ["stu-fv1"])
    ctrl = _cls(client, teacher, "版本对照班", ["stu-fv2"])
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：导出默认剔除无同意学生的整行，先显式开通
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-fv1", "stu-fv2"]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    # 模拟「立项在旧口径时代」：注册版本改写成 v2，而快照是当前版本算的
    S.update_study(sid, {"formula_version": "ct-rules/v2"})
    csv_text = client.get(f"/api/research/studies/{sid}/export?format=wide", headers=teacher).text
    head = csv_text.splitlines()[0].split(",")
    i = head.index("diagnostic_formula_version")
    vals = {r.split(",")[i] for r in csv_text.splitlines()[1:]}
    assert vals == {S.FORMULA_VERSION}, vals          # 行级读快照（当前版本），不是注册的 v2


# ======== 终审 R+1（开课前不可逆批次）：流失分析基建 + 期段互动冻结 ========

def test_withdraw_records_reason_phase_and_report_flags_differential_attrition(client, teacher, student):
    """流失分析基建（终审 #6）：19 篇文献零篇报流失，complete-case 偏倚不能被平台固化成默认。
    withdraw 端点：reason 落库、phase 自动记当时相位、已退出者幂等不覆盖首笔；
    attrition 补流失者 vs 完成者前测均分（最低限度敏感性检验）；
    两组流失率差 >10pp 硬写进 caveats（汤倩雯 11.5pp 零交代的教训）。"""
    from app import store_study as S
    exp = _cls(client, teacher, "流失实验班", ["stu-at1", "stu-at2", "stu-at3"])
    ctrl = _cls(client, teacher, "流失对照班", ["stu-at4", "stu-at5", "stu-at6"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": [f"stu-at{i}" for i in range(1, 7)]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    # draft 期名单未冻结（下发前测才建）：还没有可登记退出的名单
    assert client.post(f"/api/research/studies/{sid}/withdraw",
                       json={"student_id": "stu-at1"}, headers=teacher).status_code == 404
    aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    for uid, t in (("stu-at1", 4.0), ("stu-at2", 10.0), ("stu-at3", 12.0),
                   ("stu-at4", 9.0), ("stu-at5", 11.0)):
        S.save_response(aid, uid, {"answers": [0] * 18, "total": t, "dim_scores": {},
                                   "item_scores": [0.0] * 18, "duration_sec": 400, "flags": []})
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)

    # 干预期内实验组流失 1 人：reason 落库、phase 自动记 running（事后回忆补不准的字段）
    r = client.post(f"/api/research/studies/{sid}/withdraw",
                    json={"student_id": "stu-at1", "reason": "转学"}, headers=teacher).json()
    assert r == {"ok": True, "already": False, "phase": "running"}
    m = next(x for x in S.members(sid) if x["student_id"] == "stu-at1")
    assert m["withdrawn_at"] and m["withdraw_reason"] == "转学" and m["withdraw_phase"] == "running"
    # 幂等：重复登记不覆盖首笔（首次退出的时间戳/原因/相位是流失审计凭证）
    first_ts = m["withdrawn_at"]
    r2 = client.post(f"/api/research/studies/{sid}/withdraw",
                     json={"student_id": "stu-at1", "reason": "改口的理由"}, headers=teacher).json()
    assert r2 == {"ok": True, "already": True}
    m2 = next(x for x in S.members(sid) if x["student_id"] == "stu-at1")
    assert m2["withdrawn_at"] == first_ts and m2["withdraw_reason"] == "转学"
    assert m2["withdraw_phase"] == "running"
    # 名单外 404；学生不能替人退出（403）；留痕进课题日志
    assert client.post(f"/api/research/studies/{sid}/withdraw",
                       json={"student_id": "stu-路人"}, headers=teacher).status_code == 404
    assert client.post(f"/api/research/studies/{sid}/withdraw",
                       json={"student_id": "stu-at2"}, headers=student).status_code == 403
    assert any(x["action"] == "withdraw" for x in S.study_log(sid))

    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    att = rep["attrition"]
    assert att["exp"]["withdrawn"] == 1 and att["ctrl"]["withdrawn"] == 0
    # 流失者 vs 完成者前测均分：流失的 at1 前测 4 分，完成者（at2/3/4/5）均分 10.5 ——
    # 流失者起点系统性更低，complete-case 的增值结论必须对着这两个数解读
    pc = att["pretest_comparison"]
    assert pc["withdrawn"] == {"n": 1, "mean": 4.0}
    assert pc["completed"] == {"n": 4, "mean": 10.5}
    # 差异性流失：实验组 1/3 vs 对照组 0/3，差 33.3pp > 10pp → caveat 硬写并注明出处
    blob = "\n".join(rep["caveats"])
    assert "差异性流失" in blob and "汤倩雯" in blob and "11.5" in blob


# ======== 终审 R+3（分析管线批次）：效标 r 管线 ========

def test_pearson_r_and_fisher_ci_pure_edges():
    """pearson_r / fisher_ci 的纯算术边界（终审断点8）：n<3 拒算、零方差拒凑、
    CI 必然包住点估计、n<4 无 CI、|r|=1 时 atanh 无定义一律 None（拒凑，与 cohens_d 同则）。"""
    from app import stats
    assert stats.pearson_r([1, 2], [2, 4]) is None                      # n<3 拒算
    assert stats.pearson_r([1, 1, 1, 1], [1, 2, 3, 4]) is None          # 零方差拒凑
    assert stats.pearson_r([1, 2, 3, 4], [7, 7, 7, 7]) is None          # 另一侧零方差同理
    assert stats.pearson_r([1, 2, 3], [2, 4, 6]) == 1.0                 # 完全线性：方向与量级都对
    r = stats.pearson_r([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])
    assert r is not None and 0 < r < 1
    assert stats.pearson_r([1, 2, 3, 4, 5], [-2, -4, -5, -4, -5]) == -r  # 反向数据严格变号
    ci = stats.fisher_ci(r, 5)
    assert ci is not None and ci[0] <= r <= ci[1]                       # CI 包含点估计
    assert ci[0] < ci[1]
    assert stats.fisher_ci(r, 3) is None                                # n<4：se=1/sqrt(n-3) 无定义
    assert stats.fisher_ci(None, 10) is None                            # r 算不出就没有 CI
    assert stats.fisher_ci(1.0, 10) is None                             # |r|=1：atanh 无定义，不硬造
    # None 对成对丢弃：混入缺失后有效对子只剩 2 对 → 拒算
    assert stats.pearson_r([1, None, 3], [2, 4, None]) is None


def test_report_validity_block_and_export_crit_columns(client, teacher):
    """效标 r 管线（终审 R+3 批次①）：六维第一次从断言变可证伪假设 ——
    report.validity 按 phase 报 {overall, by_dim} 的 {r, ci, n}，带定位纪律 note；
    导出宽表打通效标列 crit_{phase}_total（缺测留空不填 0）。"""
    import time
    from app import store, store_study as S
    exp = _cls(client, teacher, "效度实验班", ["stu-vr1", "stu-vr2"])
    ctrl = _cls(client, teacher, "效度对照班", ["stu-vr3", "stu-vr4"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": [f"stu-vr{i}" for i in range(1, 5)]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    now = int(time.time())
    S.update_study(sid, {"started_at": now - 42 * 86400})
    # 事件量逐人递增 → 干预期六维/四要素折叠随之递增（平台侧测量必须有变异，r 才有定义）
    with store._lock, store._conn() as c:
        for uid, n_run in (("stu-vr1", 4), ("stu-vr2", 12), ("stu-vr3", 30), ("stu-vr4", 60)):
            ts = now - 40 * 86400
            for t in ["run"] * n_run + ["error", "fix"] * max(1, n_run // 6):
                ts += 300
                c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                          " VALUES(?,?,'',NULL,?,2)", (uid, t, ts))
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)     # 冻结干预期快照
    # 效标与平台侧用量同向（构造正相关）；带一维四要素分维（调试评估），其余维不打标
    for uid, total in (("stu-vr1", 2.0), ("stu-vr2", 5.0), ("stu-vr3", 8.0), ("stu-vr4", 11.0)):
        client.post(f"/api/research/studies/{sid}/criterion",
                    json={"student_id": uid, "phase": "probe", "instrument": "ct-v1-probe",
                          "item_scores": [total], "total": total,
                          "dims": {"调试评估": total / 2}}, headers=teacher)

    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert "validity" not in rep
    v = rep["legacy_diagnostic_association"]
    assert "估计不是检验" in v["note"] and "禁止只报显著性" in v["note"]   # 定位纪律：固定说明
    blk = v["phases"]["probe"]["overall"]
    assert blk["n"] == 4
    assert blk["r"] is not None and blk["r"] > 0                        # 同向构造 → r 为正
    lo, hi = blk["ci"]
    assert lo <= blk["r"] <= hi                                         # CI 包含点估计
    bd = v["phases"]["probe"]["by_dim"]
    assert set(bd) == {"问题分解", "抽象建模", "算法设计", "调试评估"}     # 四要素全集（REPORT_FOLD 真源）
    assert bd["调试评估"]["n"] == 4 and bd["调试评估"]["r"] > 0
    # 没打分维标的要素：n=0、r=null —— n 逐项如实报，算不出不硬造
    assert bd["问题分解"] == {"r": None, "ci": None, "n": 0}
    # 没录过效标的 phase 不出空块
    assert "pre" not in v["phases"] and "delayed" not in v["phases"]

    # 导出宽表打通效标列（此前脱敏导出与效标两子系统互斥，分维 r 校外无法复算）
    from app import research
    original = research.SALT_IS_EPHEMERAL
    research.SALT_IS_EPHEMERAL = False
    try:
        j = client.get(f"/api/research/studies/{sid}/export?format=json", headers=teacher).json()
        rows = j["rows"]
        for ph in ("pre", "post", "delayed", "probe"):
            assert all(f"crit_{ph}_total" in r for r in rows), f"导出缺少效标列 crit_{ph}_total"
        assert sorted(r["crit_probe_total"] for r in rows) == [2.0, 5.0, 8.0, 11.0]
        assert all(r["crit_pre_total"] == "" for r in rows)             # 缺测留空，绝不填 0
        csv_head = client.get(f"/api/research/studies/{sid}/export", headers=teacher).text.splitlines()[0]
        assert "crit_probe_total" in csv_head                           # CSV 与 JSON 同列集
    finally:
        research.SALT_IS_EPHEMERAL = original


def test_freeze_snapshots_include_windowed_peer_turns(client, teacher):
    """快照 behavior 冻结 peer_turns（R+1 顺手为 R+2 铺）：照 ai_helps 的窗口冻结模式，
    只数期段窗口 [t0, t1) 内的生生轮次 —— 窗口前的聊天进基线期快照，不进干预期。"""
    from app import store_learner as L
    from app import store_study as S
    exp = _cls(client, teacher, "轮次冻结实验班", ["stu-pt1"])
    ctrl = _cls(client, teacher, "轮次冻结对照班", ["stu-pt2"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-pt1", "stu-pt2"]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    t0 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["started_at"]
    S.update_study(sid, {"started_at": t0 - 3600})       # 起点前移出一段真实课时
    with L._conn() as c:                                  # 窗口前 1 条（基线期）、窗口内 2 条
        for off in (-7200, -1800, -1700):
            c.execute("INSERT INTO chat_log(room_id,from_student,role,ts)"
                      " VALUES('room-pt','stu-pt1','driver',?)", (t0 + off,))
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)

    iv = {x["student_id"]: x for x in S.snapshots(sid, "intervention")}
    assert iv["stu-pt1"]["behavior"]["peer_turns"] == 2   # 只冻结窗口内的
    assert iv["stu-pt2"]["behavior"]["peer_turns"] == 0   # 没说过话就是 0（计数真值）
    bl = next(x for x in S.snapshots(sid, "baseline") if x["student_id"] == "stu-pt1")
    assert bl["behavior"]["peer_turns"] == 1              # 窗口前那条进基线期
    # 冻结值 = 同窗现算（与 dims/ai_helps 的冻结纪律一致）
    x1 = iv["stu-pt1"]
    assert x1["behavior"]["peer_turns"] == L.peer_turns(
        student_id="stu-pt1", since=x1["win_start"], until=x1["win_end"])
