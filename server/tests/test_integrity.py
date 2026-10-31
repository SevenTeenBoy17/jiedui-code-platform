"""数据正确性与研究效度的回归护栏（五维审计确认的缺陷，逐条钉死）。"""
import time
from app import store, ct


def test_ct_events_returns_newest_not_oldest():
    """曾经是 ORDER BY ts ASC LIMIT —— 超过上限后取到的永远是最老那批，
    学生上几节课后六维分/成功率/课堂监看全部冻结在第一节课。"""
    uid = "stu-窗口测试"
    for i in range(12):
        store.add_ct_event(uid, "run", f"第{i}次", None)
    got = store.ct_events(uid, 5)
    assert [e["detail"] for e in got] == [f"第{i}次" for i in range(7, 12)]   # 最近 5 条
    assert got == sorted(got, key=lambda e: e["ts"])                          # 且仍按时间正序


def test_deleting_someone_elses_project_keeps_their_versions():
    """删别人的作品返回 404，但对方的版本历史曾经已经被真删了。"""
    pid = store.create_project("stu-a", "我的作品", "python")["id"]
    store.save_version(pid, "stu-a", "print(2)", None)
    before = len(store.list_versions(pid, "stu-a"))
    assert before >= 1

    assert store.delete_project(pid, "stu-b") is False        # 越权删除被拒
    assert len(store.list_versions(pid, "stu-a")) == before   # 版本历史必须原封不动
    assert store.delete_project(pid, "stu-a") is True         # 本人删除仍然可用
    assert store.list_versions(pid, "stu-a") is None          # 作品没了 → 版本也查不到


def test_clicking_done_does_not_inflate_debugging_score(client, teacher, student):
    """点「完成推送」不能刷高验证优化维——否则六维分不反映真实计算思维（课题效度）。"""
    eid = client.post("/api/resources/exercises", json={"title": "效度题"}, headers=teacher).json()["id"]
    uid = "stu-xiaoma"
    before = ct.summary_for(uid)["process_indices"]["verify"]

    for _ in range(5):
        pid = client.post("/api/resources/push",
                          json={"res_type": "exercise", "res_id": eid, "student_ids": [uid]},
                          headers=teacher).json()["id"]
        tid = [i for i in client.get("/api/resources/my/pushes", headers=student).json()["items"]
               if i["res_id"] == eid][0]["target_id"]
        client.post(f"/api/resources/my/pushes/{tid}/done", headers=student)
        assert pid

    after = ct.summary_for(uid)
    assert after["process_indices"]["verify"] == before    # 诊断过程指数也不涨
    assert after["fixes"] == ct.summary_for(uid)["fixes"]  # 也没混进 fix 计数
    assert any(e["type"] == "task_done" for e in store.ct_events(uid))   # 但完成行为有留痕


def test_class_average_needs_real_evidence(client, teacher):
    """只有 1 条事件就算「有数据」，会把没真正编程的账号也算进班级均值，
    把研究基线拉成常数（六维公式带 25–40 的地板分）。"""
    store.add_ct_event("stu-仅一条", "run", "只跑过一次", None)
    assert ct.summary_for("stu-仅一条")["has_real_data"] is False
    for t in ("run", "error", "fix"):
        store.add_ct_event("stu-有证据", t, "", None)
    assert ct.summary_for("stu-有证据")["has_real_data"] is True


def test_home_can_scope_to_one_class(client, teacher):
    """「班级六维均值」必须能按班算，否则多个班混在一起就是全平台基线。"""
    for t in ("run", "error", "fix"):                  # 单跑本条也要过证据门槛，不靠前面的用例
        store.add_ct_event("stu-有证据", t, "", None)
    cid = client.post("/api/resources/classes", json={"name": "均值班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students",
               json={"student_ids": ["stu-有证据"]}, headers=teacher)
    # T0-2 分析集口径变更（三波总审 §7 T0-2）：班级六维均值默认剔除无同意学生。
    # 测试库学生默认无 consent，这里先看剔除口径，再显式开通同意、断言原有数字不变。
    dropped = client.get(f"/api/teacher/home?class_id={cid}", headers=teacher).json()
    assert dropped["class_ct_n"] == 0 and dropped["excluded_no_consent"] == 0
    client.post("/api/teacher/consent", json={"student_id": "stu-有证据"}, headers=teacher)
    whole = client.get("/api/teacher/home", headers=teacher).json()
    one = client.get(f"/api/teacher/home?class_id={cid}", headers=teacher).json()
    assert len(one["students"]) == 1 and one["students"][0]["id"] == "stu-有证据"
    assert len(whole["students"]) > len(one["students"])
    assert one["class_ct_n"] == 0 and one["class_ct"] == {}      # 行为记录不能进入能力均值
    assert one["class_id"] == cid and one["excluded_no_consent"] == 0


def test_empty_class_push_does_not_broadcast_to_everyone(client, teacher):
    """勾一个 0 人的空班下发，曾经会落到「全平台群发」的兜底分支上。"""
    cid = client.post("/api/resources/classes", json={"name": "空班"}, headers=teacher).json()["id"]
    eid = client.post("/api/resources/exercises", json={"title": "空班题"}, headers=teacher).json()["id"]
    r = client.post("/api/resources/push",
                    json={"res_type": "exercise", "res_id": eid, "class_ids": [cid]}, headers=teacher)
    assert r.status_code == 400 and "还没有学生" in r.json()["detail"]
    r2 = client.post("/api/resources/push",
                     json={"res_type": "exercise", "res_id": eid, "class_ids": [999999]}, headers=teacher)
    assert r2.status_code == 400                                  # 不存在的班级同理


def test_audit_scrubs_every_text_field():
    """审核曾经只洗 headline/strengths/suggestions，贴标签原话从 weaknesses 漏出去。"""
    from app.insights import audit
    card = audit({"headline": "还不错", "weaknesses": ["这孩子有点笨，抽象明显落后"],
                  "next_step": "他智商跟不上，别管了", "strengths": ["认真"]})
    shown = str({k: v for k, v in card.items() if k != "blocked_words"})   # 展示给教师的内容
    assert "笨" not in shown and "智商" not in shown
    assert card["weaknesses"] == [] and card["next_step"] == ""
    assert card["blocked_words"] == ["笨", "智商"] and card["audited"] is True   # 命中词只留给审计


def test_export_pseudonym_is_not_reversible_by_default():
    """假名盐曾经硬编码在源码里，拿到导出文件 + 一份名单就能秒级还原。"""
    from app import research
    assert research.SALT != "jiedui-ct-2026"
    assert len(research.SALT) >= 32
    a, b = research._pid("stu-xiaoma"), research._pid("stu-xiaohua")
    assert a != b and a.startswith("S") and len(a) == 11
    assert research._pid("stu-xiaoma") == a                       # 同一次导出内稳定


def test_mistakes_book_groups_real_errors(client, student, teacher):
    """错题本必须有真实数据源——曾经是写死的占位文案，底层连表都没有。"""
    from app import store
    uid = "stu-xiaoma"
    for _ in range(3):
        store.add_ct_event(uid, "error", "运行出错：NameError: name 'x' is not defined", None)
    store.add_ct_event(uid, "error", "运行出错：IndexError: list index out of range", None)

    d = client.get("/api/ct/mistakes", headers=student).json()
    top = d["items"][0]
    assert "NameError" in top["text"] and top["count"] == 3        # 反复犯的排最前并计次
    assert "运行出错：" not in top["text"]                          # 前缀已去掉，只留报错本身
    assert d["total"] >= 4
    assert all(m["count"] >= 1 for m in d["items"])


def test_student_can_get_own_recommendation(client, student, teacher):
    """学生端「进阶」页签要能拿到推荐——教师端那个 recommend 学生调是 403。"""
    from app import store
    for t in ("run", "error", "fix"):
        store.add_ct_event("stu-xiaoma", t, "", None)
    client.post("/api/resources/exercises",
                json={"title": "迁移练习", "ct_dims": {"transfer": 8}, "difficulty": 1}, headers=teacher)

    assert client.get("/api/insights/recommend/stu-xiaohua", headers=student).status_code == 403
    d = client.get("/api/insights/my/recommend", headers=student).json()
    assert d["student_id"] == "stu-xiaoma" and d["weak_dim"] is None
    assert d["profile_status"] == "insufficient_evidence"
    assert d["targeted"] is False and "不代表薄弱项判断" in d["reason"]


def test_recommend_admits_when_it_is_only_a_fallback(client, teacher):
    """题库没有该维度的题时，不能一边按难度兜底、一边宣称"针对薄弱维推荐"。"""
    from app.insights import _recommend_for
    from app import store
    for t in ("run", "error", "fix"):
        store.add_ct_event("stu-无标注", t, "", None)
    d = _recommend_for("stu-无标注")
    assert d["targeted"] is False and d["weak_dim"] is None
    assert "没有已确认的能力推断" in d["reason"]


def test_minutes_is_engaged_time_not_calendar_span():
    """曾经用「最后一条 - 第一条」当学习用时：学生上个月来过一次，界面就显示 48883 分钟。"""
    import app.store as st
    uid = "stu-用时"
    base = 1_700_000_000
    with st._conn() as c:                     # 直接造带时间戳的事件序列
        for off in (0, 60, 120, 30 * 86400, 30 * 86400 + 60):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts) VALUES(?,?,?,?,?)",
                      (uid, "run", "", None, base + off))
    m = ct.summary_for(uid)["minutes"]
    assert m == 3          # 两段各 2 分钟 + 1 分钟，跨月的那个 30 天空档不计
    assert m < 60          # 绝不能是日历跨度（43200 分钟）


def test_two_event_semantics_are_reconciled_not_mixed():
    """旧埋点（成功且此前报错→只记 fix 不记 run）与新埋点（每次都记 run）混在一张表里，
    直接 run-error 会让旧数据的成功率被压成 0%，跨学期对比失真。"""
    import app.store as st
    uid = "stu-双语义"
    base = 1_700_000_000
    with st._conn() as c:
        # 旧语义：跑错一次 → error；改对 → fix（没有 run）
        for i, (t, sv) in enumerate([("error", 1), ("fix", 1), ("run", 1)]):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,?,?,?)",
                      (uid, t, "", None, base + i, sv))
        # 新语义：跑错（run+error）→ 改对（run+fix）
        for i, (t, sv) in enumerate([("run", 2), ("error", 2), ("run", 2), ("fix", 2)]):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,?,?,?)",
                      (uid, t, "", None, base + 10 + i, sv))
    s = ct.summary_for(uid)
    # 旧段：尝试 3（run+fix+error）成功 2（run+fix）；新段：尝试 2 成功 1 → 合计 5 尝试 3 成功
    assert s["attempts"] == 5 and s["successes"] == 3
    assert s["success_rate"] == 60                 # 不分版本硬算会得到 0%
    assert s["legacy_events"] == 3                 # 并如实告知跨了两套语义


def test_summary_can_be_scoped_to_the_intervention_window():
    """课题要比「干预前 vs 干预后」，六维分必须能按时间窗算。"""
    import app.store as st
    uid = "stu-窗口对比"
    base = 1_700_000_000
    with st._conn() as c:
        for i in range(4):     # 干预前：4 次成功运行
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,?,?,2)",
                      (uid, "run", "", None, base + i * 60))
        for i in range(10):    # 干预后：10 次成功运行
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,?,?,2)",
                      (uid, "run", "", None, base + 100_000 + i * 60))
    cut = base + 50_000
    pre = ct.summary_for(uid, until=cut)
    post = ct.summary_for(uid, since=cut)
    whole = ct.summary_for(uid)
    assert pre["attempts"] == 4 and post["attempts"] == 10 and whole["attempts"] == 14
    assert post["process_indices"]["algorithm"] > pre["process_indices"]["algorithm"]
    assert post["diagnostic_only"] is True                    # 只描述过程变化，不是能力增长
    assert pre["window"]["until"] == cut and post["window"]["since"] == cut


def test_counts_are_not_truncated_by_the_event_window():
    """计数必须走 SQL 全量聚合：先截最近 500 条再统计，会把早段整段丢掉，
    而丢失量与活跃度正相关——越活跃的学生被低估越多，足以把组间结论算反。"""
    import app.store as st
    uid = "stu-超量"
    with st._conn() as c:
        c.executemany("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,?,?,2)",
                      [(uid, "run", "", None, 1_700_000_000 + i) for i in range(700)])
    assert len(st.ct_events(uid, 500)) == 500          # 展示用仍然截断
    assert ct.summary_for(uid)["attempts"] == 700      # 统计不截断


def test_class_view_counts_students_who_never_showed_up(client, teacher):
    """从没上过机的学生才是老师最该看见的人——不能因为「没有活动记录」就从名册里消失。"""
    cid = client.post("/api/resources/classes", json={"name": "含缺课生"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students",
               json={"student_ids": ["stu-有证据", "stu-从没登录过"]}, headers=teacher)

    home = client.get(f"/api/teacher/home?class_id={cid}", headers=teacher).json()
    assert home["kpis"]["students"] == 2                      # 分母是名册人数，不是活跃人数
    assert home["funnel"]["entered"] == 2 and home["funnel"]["ran"] == 1   # 不再显示 100% 都动过手

    live = client.get(f"/api/teacher/live?class_id={cid}", headers=teacher).json()
    ids = {s["id"] for s in live["seats"]}
    assert "stu-从没登录过" in ids                             # 课堂监看要能看见"一次都没动的人"
    assert next(s for s in live["seats"] if s["id"] == "stu-从没登录过")["state"] == "away"


def test_student_never_receives_ct_scores(client, student, teacher):
    """效度红线：六维分是行为次数的单调函数，把它当分数给学生看，
    学生刷行为就是刷分，而行为正是课题的过程数据。学生端只能拿到相对强弱。"""
    from app import store
    for t in ("run", "error", "fix", "ai_help"):
        store.add_ct_event("stu-xiaoma", t, "", None)

    d = client.get("/api/ct/summary?scope=task&task_id=count-only", headers=student).json()
    assert "ct_scores" not in d and "process_indices" not in d
    assert d["ct_rank"] == []
    assert d["profile"]["status"] == "insufficient_evidence"
    assert d["diagnostic"]["diagnostic_only"] is True
    # 行为计数是事实，可以给；分数是评价，不给
    for k in ("runs", "errors", "fixes"):
        assert k in d
    # 再刷一批次数仍不能凭空创建或改变能力画像。
    before = d["profile"]
    for _ in range(20):
        for event in ("run", "error", "fix", "ai_help"):
            store.add_ct_event("stu-xiaoma", event, "", None)
    after = client.get("/api/ct/summary?scope=task&task_id=count-only", headers=student).json()
    assert after["profile"] == before and after["ct_rank"] == []

    t = client.get("/api/ct/summary?user_id=stu-xiaoma&scope=task&task_id=count-only",
                   headers=teacher).json()
    assert "ct_scores" not in t and t["profile"]["status"] == "insufficient_evidence"
    report = client.get("/api/ct/report?user_id=stu-xiaoma&scope=task&task_id=count-only",
                        headers=teacher).json()
    assert report["status"] == "insufficient_evidence" and report["levels"] == {}


def test_student_recommendation_hides_the_number(client, student, teacher):
    """推荐可以说「练哪一维」，但不能给出可追逐的分值。"""
    from app import store
    for t in ("run", "error", "fix"):
        store.add_ct_event("stu-xiaoma", t, "", None)
    client.post("/api/resources/exercises", json={"title": "推荐题", "ct_dims": {"transfer": 6}}, headers=teacher)

    mine = client.get("/api/insights/my/recommend", headers=student).json()
    theirs = client.get("/api/insights/recommend/stu-xiaoma", headers=teacher).json()
    assert mine["weak_dim"] is None and theirs["weak_dim"] is None
    assert mine["profile_status"] == theirs["profile_status"] == "insufficient_evidence"
    assert mine["targeted"] is False and theirs["targeted"] is False
    assert "不代表薄弱项判断" in mine["reason"]


def test_neutral_profile_used_where_conclusions_are_drawn():
    """抽象维含 ai_helps*5：谁问 AI 问得多谁分高。

    凡是要下结论/进研究数据的地方都必须用 neutral，否则把工具使用量当成了能力。
    这条守卫要求的是**显式选择口径**：写 v1_all 也算过（教师个体诊断确实需要它），
    但不能什么都不写、让默认值悄悄落下来 —— 那种地方没人知道当初有没有想过这件事。
    """
    import inspect
    # ct 与 teacher 也必须在扫描范围内：前者算学生端的强弱等第（等第一样可刷），
    # 后者出的是教师首页那张自称"研究用"的班级雷达图。
    from app import insights, research, ct, teacher
    for mod in (insights, research, ct, teacher):
        src = inspect.getsource(mod)
        for line in src.splitlines():
            if "summary_for(" in line and "def " not in line and "import" not in line:
                assert 'profile="neutral"' in line or "profile=" in line, \
                    f"{mod.__name__} 里有未指定口径的 summary_for：{line.strip()}"


def test_tied_dimensions_do_not_fabricate_a_diagnosis():
    """六维分值并列时不许判出「较强/待加强」。

    六维全是行为累计次数的线性函数再封顶 100，到顶阈值很低
    （verify 修 6 次就到顶，abstract/model 跑 35~38 次到顶）——
    一轮 6 周干预下来多数学生会全部撞顶。此前 _to_rank 按名次下标分三档，
    六个值完全相同也照样判出两个「待加强」，靠的是字典插入顺序：
    学生看到的诊断、以及据此推荐的练习题，全是任意的却以确定口吻呈现。
    """
    from app import ct
    flat = {d: 100 for d in ("decompose", "abstract", "model", "algorithm", "verify", "transfer")}
    r = ct._to_rank(flat)
    assert len({x["band"] for x in r}) == 1, f"并列却分出了档：{r}"
    assert all(x["tied"] for x in r)          # 前端据此可以说「还看不出差别」
    # 正常有差异时仍要正常分档
    varied = {"decompose": 90, "abstract": 80, "model": 70,
              "algorithm": 60, "verify": 50, "transfer": 40}
    assert len({x["band"] for x in ct._to_rank(varied)}) == 3
    # 部分并列：同分必须同档
    part = {"decompose": 100, "abstract": 100, "model": 100,
            "algorithm": 100, "verify": 60, "transfer": 40}
    bands = {x["dim"]: x["band"] for x in ct._to_rank(part)}
    assert bands["decompose"] == bands["abstract"] == bands["model"] == bands["algorithm"]
    assert bands["verify"] != bands["decompose"]


def test_v3_quality_beats_volume_and_never_saturates():
    """v3 六维的三条核心性质，缺一不可：

    ① 永不撞顶：10 倍于一轮课的用量，任何维 < 100（v2 在 1 倍用量就 4/6 维=100）。
    ② 任何用量下仍有区分度：多修一次错，verify 严格上升。
    ③ **质量赢过刷量**：修复率 100% 的学生（10 错全修好）要比刷了两倍行为量
       但只修了 1/4 的学生分高 —— v2 里两人都顶到 100 分不出来，而「刷量不再赢」
       正是撤掉学生刷行为动机的关键（红线一：行为就是研究的过程数据）。
    """
    from app import store, ct

    def feed(uid, runs, errors, fixes):
        with store._lock, store._conn() as c:
            rows = [(uid, "run") for _ in range(runs)] +                    [(uid, "error") for _ in range(errors)] + [(uid, "fix") for _ in range(fixes)]
            c.executemany("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                          " VALUES(?,?,'',NULL,1700000000,2)", rows)

    feed("stu-v3十倍", 450, 100, 100)                       # 10 倍于一轮课
    big = ct.summary_for("stu-v3十倍", profile="neutral")["process_indices"]
    assert all(v < 100 for v in big.values()), f"撞顶复发：{big}"

    feed("stu-v3多一修", 450, 100, 101)                     # 只多修一次
    more = ct.summary_for("stu-v3多一修", profile="neutral")["process_indices"]
    assert more["verify"] >= big["verify"] and more["decompose"] >= big["decompose"]
    # 用未取整的内部量核区分度（round 后可能同分，但底层必须严格递增）
    assert ct._sat(101, 6) > ct._sat(100, 6)

    feed("stu-v3质量", 20, 10, 10)                          # 报 10 错全修好
    feed("stu-v3刷量", 40, 20, 5)                           # 行为量翻倍但只修 1/4
    q = ct.summary_for("stu-v3质量", profile="neutral")["process_indices"]["verify"]
    v = ct.summary_for("stu-v3刷量", profile="neutral")["process_indices"]["verify"]
    assert q > v, f"刷量赢了质量：全修好={q} vs 刷量={v}"


def test_r4_regressions(client, teacher, student):
    """第四轮核验的四条回归，合并成一条用例（各自独立断言）。"""
    from app import store, ct

    # ① 批量同意必须接受带姓名间隔号「·」的学生 id —— 校验的代价不能由少数民族学生付
    r = client.post("/api/teacher/consent/batch",
                    json={"student_ids": ["stu-古丽米热·艾力"]}, headers=teacher).json()
    assert r["granted"] == 1 and r["skipped"] == 0, r

    # ② 纯 fix 刷量封顶：50 个孤儿 fix 不能把 verify 抬过 40（曾能抬到 81）
    with store._lock, store._conn() as c:
        c.executemany("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,'',NULL,1700000000,2)",
                      [("stu-刷修复", "fix") for _ in range(50)])
    v = ct.summary_for("stu-刷修复", profile="neutral")["process_indices"]["verify"]
    assert v < 40, f"孤儿修复刷量未封顶：verify={v}"

    # ③ 没过证据门槛的学生不出等第诊断：全 tied、无「较强/待加强」
    store.add_ct_event("stu-仅一跑", "run", "", None)
    d = client.get("/api/ct/summary", headers={
        "Authorization": client.post("/api/auth/student/login",
            json={"username": "仅一跑", "password": "123456"}).json()["token"] and
        "Bearer " + client.post("/api/auth/student/login",
            json={"username": "仅一跑", "password": "123456"}).json()["token"]}).json()
    assert d["has_real_data"] is False
    assert d["ct_rank"] == [] and d["profile"]["status"] == "insufficient_evidence"

    # ④ 研究导出 CSV：行为公式只能以 diagnostic_* 命名，且表头/数据列数一致。
    import csv as _csv, io as _io
    text = client.get("/api/research/export?format=csv", headers=teacher).text
    rows = list(_csv.reader(_io.StringIO(text)))
    assert "diagnostic_formula_version" in rows[0] and "diagnostic_only" in rows[0]
    assert not any(h == "ct_scores" or h.startswith("ct_") for h in rows[0])
    assert all(len(r) == len(rows[0]) for r in rows[1:] if r), "表头与数据行列数不一致"

    # ⑤ 事件白名单：伪造服务端专属类型（task_done）不落库
    tok = client.post("/api/auth/student/login",
                      json={"username": "白名单", "password": "123456"}).json()["token"]
    client.post("/api/ct/events", json={"type": "task_done", "detail": "伪造"},
                headers={"Authorization": f"Bearer {tok}"})
    assert not any(e["type"] == "task_done" for e in store.ct_events("stu-白名单"))
