"""学习者状态层（第三波总审 T0/T1）：跨会话画像、教学轮、报告层折叠、外部效标、互动占比。

这批表是首轮开课前的承重墙：learner_state 是渐退支架的记忆，learning_round 给埋点盖轮号，
ct_criterion 是效标效度的分母（错过开课日无法回溯），互动占比是「支架来源迁移」的唯一验证量。
"""
import pytest


def _login(client, role: str, name: str) -> str:
    """本地登录助手。**不要**在模块顶层 `from tests.conftest import _login`：
    tests/ 没有 __init__.py，那会把 conftest 当第二个模块重跑一遍 ——
    它开头就删测试库，收集期一跑等于把已建好的表全部抹掉。"""
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def stu_lr(client):
    """本文件专用学生（stu-lr1），不与其他测试的事件流互相污染。"""
    return {"Authorization": "Bearer " + _login(client, "student", "lr1")}


# ============ learner_state ============

def test_learner_state_defaults_then_teacher_writes(client, teacher):
    """没写过的学生返回缺省画像（满档起步），教师 PUT 后 GET 如实回读，部分更新不冲掉其余字段。"""
    d0 = client.get("/api/learner/state/stu-ls1", headers=teacher).json()
    assert d0["exists"] is False
    assert d0["scaffold_level"] == 3 and d0["round_index"] == 1 and d0["fallback_count"] == 0

    r = client.put("/api/learner/state/stu-ls1", json={
        "scaffold_level": 2, "fallback_count": 1,
        "mastery_snapshot": {"循环": 0.4}, "stuck_points": ["循环边界条件"]}, headers=teacher)
    assert r.status_code == 200
    d = client.get("/api/learner/state/stu-ls1", headers=teacher).json()
    assert d["exists"] is True and d["scaffold_level"] == 2 and d["fallback_count"] == 1
    assert d["mastery_snapshot"] == {"循环": 0.4} and d["stuck_points"] == ["循环边界条件"]
    assert d["round_index"] == 1                       # 没动的字段保持缺省，不被部分更新冲掉

    # 只改轮次：其余字段原样保留
    client.put("/api/learner/state/stu-ls1", json={"round_index": 2}, headers=teacher)
    d2 = client.get("/api/learner/state/stu-ls1", headers=teacher).json()
    assert d2["round_index"] == 2 and d2["scaffold_level"] == 2 and d2["mastery_snapshot"] == {"循环": 0.4}


def test_learner_state_student_reads_only_self_and_cannot_write(client, stu_lr):
    """学生只读自己的：别人的档位/卡点对同学就是标签；写权限只在教师（及将来的策略层）。"""
    assert client.get("/api/learner/state/stu-lr1", headers=stu_lr).status_code == 200
    assert client.get("/api/learner/state/stu-别人", headers=stu_lr).status_code == 403
    assert client.put("/api/learner/state/stu-lr1",
                      json={"scaffold_level": 3}, headers=stu_lr).status_code == 403


def test_learner_state_rejects_dirty_values(client, teacher):
    """档位 0-3 / 轮次 1-3 是全系统共同语言，脏值一旦落库会被策略层当真。"""
    for bad in ({"scaffold_level": 9}, {"round_index": 0}, {"fallback_count": -1}, {}):
        assert client.put("/api/learner/state/stu-ls2", json=bad, headers=teacher).status_code == 400


# ============ learning_round ============

def test_round_open_exit_and_single_active_per_room(client, teacher, stu_lr):
    """一个 room 同时只能有一轮（否则埋点盖哪个轮号两可）；label 缺省按 R1能跑/R2跑对/R3跑好。"""
    r = client.post("/api/learner/rounds/open",
                    json={"room_id": "room-t1", "round_index": 1}, headers=teacher)
    assert r.status_code == 200
    rid = r.json()["id"]
    assert r.json()["round"]["label"] == "R1能跑"

    # 同房间再开必须 409
    assert client.post("/api/learner/rounds/open",
                       json={"room_id": "room-t1", "round_index": 2}, headers=teacher).status_code == 409
    # 学生不能开轮/结轮
    assert client.post("/api/learner/rounds/open",
                       json={"room_id": "room-x", "round_index": 1}, headers=stu_lr).status_code == 403
    # 轮号越界拦住
    assert client.post("/api/learner/rounds/open",
                       json={"room_id": "room-x", "round_index": 5}, headers=teacher).status_code == 400

    assert client.post(f"/api/learner/rounds/{rid}/exit",
                       json={"exit_task_passed": True}, headers=teacher).json()["ok"] is True
    # 已结束的轮不能再结（exit_task_passed 不许被第二击改写）
    assert client.post(f"/api/learner/rounds/{rid}/exit",
                       json={"exit_task_passed": False}, headers=teacher).status_code == 404

    client.post("/api/learner/rounds/open",
                json={"room_id": "room-t1", "round_index": 2}, headers=teacher)
    items = client.get("/api/learner/rounds?room_id=room-t1", headers=teacher).json()["items"]
    assert len(items) == 2
    assert items[0]["exit_task_passed"] == 1 and items[0]["exited_at"]
    assert items[1]["label"] == "R2跑对" and items[1]["exited_at"] is None


def test_ct_events_are_stamped_with_the_active_round(client, teacher, stu_lr):
    """埋点写入时该 room 有进行中的轮就带轮号；轮外事件 round_index 必须是 NULL ——
    NULL 是真值（不属于任何一轮），不是缺数据。"""
    import app.store as st

    client.post("/api/learner/rounds/open",
                json={"room_id": "room-stamp", "round_index": 3}, headers=teacher)
    client.post("/api/ct/events", json={"type": "run", "roomId": "room-stamp"}, headers=stu_lr)
    with st._conn() as c:
        r = c.execute("SELECT round_index FROM ct_events WHERE user_id='stu-lr1'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["round_index"] == 3

    # 结轮之后同房间的事件不再盖轮号
    rid = [x for x in client.get("/api/learner/rounds?room_id=room-stamp", headers=teacher).json()["items"]
           if x["exited_at"] is None][0]["id"]
    client.post(f"/api/learner/rounds/{rid}/exit", json={}, headers=teacher)
    client.post("/api/ct/events", json={"type": "run", "roomId": "room-stamp"}, headers=stu_lr)
    with st._conn() as c:
        r = c.execute("SELECT round_index FROM ct_events WHERE user_id='stu-lr1'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["round_index"] is None
    # 没做出口任务 = NULL，与 0（做了没过）是两回事
    done = [x for x in client.get("/api/learner/rounds?room_id=room-stamp", headers=teacher).json()["items"]][0]
    assert done["exit_task_passed"] is None


# ============ ct_report 报告层折叠 ============

def test_ct_report_folds_six_dims_into_four_and_keeps_transfer_internal():
    """报告层折叠的正确性：抽象建模=(abstract+model)/2，transfer 不进报告维只留 internal。
    同时钉死红线：六维公式版本必须仍是当前口径版（v4，D3 拍板升位） —— 报告层改呈现，绝不动内部口径。"""
    from app import ct

    scores = {"decompose": 40, "abstract": 30, "model": 50,
              "algorithm": 62, "verify": 21, "transfer": 77}
    rep = ct.ct_report(scores)
    assert rep["report_version"] == "report/v1"
    assert rep["internal_dims"] == scores                      # 六维原样保留（含 transfer）
    assert set(rep["report_dims"]) == {"问题分解", "抽象建模", "算法设计", "调试评估"}
    assert rep["report_dims"]["问题分解"] == 40
    assert rep["report_dims"]["抽象建模"] == 40.0              # (30+50)/2
    assert rep["report_dims"]["算法设计"] == 62
    assert rep["report_dims"]["调试评估"] == 21
    assert "transfer" not in str(rep["report_dims"]) and 77 not in rep["report_dims"].values()
    # 红线：折叠只发生在报告层，六维口径一个字都不能动
    assert ct.FORMULA_VERSION == "ct-rules/v4"


def test_ct_report_endpoint_is_teacher_only(client, teacher, stu_lr):
    """公开能力报告必须显式选范围，且没有确认推断时不能回退到行为评分。"""
    from app import store
    for t in ("run", "run", "error", "fix"):
        store.add_ct_event("stu-rp1", t, "", None)
    assert client.get("/api/ct/report?user_id=stu-rp1", headers=teacher).status_code == 400
    d = client.get(
        "/api/ct/report?user_id=stu-rp1&scope=task&task_id=report-task",
        headers=teacher,
    ).json()
    assert d["status"] == "insufficient_evidence" and d["levels"] == {}
    assert client.get(
        "/api/ct/report?user_id=stu-rp1&scope=task&task_id=report-task",
        headers=stu_lr,
    ).status_code == 403


# ============ ct_criterion 外部效标 ============

def _crit_study(client, teacher):
    a = client.post("/api/resources/classes", json={"name": "效标实验班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{a}/students",
               json={"student_ids": ["stu-cr1", "stu-cr2"]}, headers=teacher)
    b = client.post("/api/resources/classes", json={"name": "效标对照班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{b}/students",
               json={"student_ids": ["stu-cr3"]}, headers=teacher)
    return client.post("/api/research/studies",
                       json={"exp_class_ids": [a], "ctrl_class_ids": [b]}, headers=teacher).json()["id"]


@pytest.fixture(scope="module")
def crit_sid(client, teacher):
    return _crit_study(client, teacher)


def test_criterion_upsert_overwrites_same_key(client, teacher, stu_lr, crit_sid):
    """同一 (study,student,phase,instrument) 重复录入按覆盖处理 —— 誊分改错是常态，
    效标以最后一次录入为准，不许长出第二行把 r 的样本悄悄翻倍。"""
    sid = crit_sid
    assert client.post(f"/api/research/studies/{sid}/criterion",
                       json={"student_id": "stu-cr1", "phase": "考试后",
                             "item_scores": [1]}, headers=teacher).status_code == 400   # phase 白名单
    assert client.post(f"/api/research/studies/{sid}/criterion",
                       json={"student_id": "stu-cr1", "phase": "pre"},
                       headers=stu_lr).status_code == 403                                # 学生不能录

    r1 = client.post(f"/api/research/studies/{sid}/criterion",
                     json={"student_id": "stu-cr1", "phase": "pre",
                           "item_scores": [3.0, 4.0, 5.0]}, headers=teacher).json()
    assert r1["total"] == 12.0                                  # 不传 total 按 item_scores 求和
    r2 = client.post(f"/api/research/studies/{sid}/criterion",
                     json={"student_id": "stu-cr1", "phase": "pre",
                           "item_scores": [5.0, 5.0, 5.0], "total": 15.0}, headers=teacher).json()
    assert r2["total"] == 15.0

    rows = client.get(f"/api/research/studies/{sid}/criterion?include_no_consent=1",
                      headers=teacher).json()["items"]
    mine = [x for x in rows if x["student_id"] == "stu-cr1" and x["phase"] == "pre"]
    assert len(mine) == 1 and mine[0]["total"] == 15.0          # 覆盖而不是追加
    assert mine[0]["item_scores"] == [5.0, 5.0, 5.0]
    # 不同 phase / instrument 是不同的键，可以并存
    client.post(f"/api/research/studies/{sid}/criterion",
                json={"student_id": "stu-cr1", "phase": "probe",
                      "instrument": "silent-probe", "item_scores": [2.0]}, headers=teacher)
    rows = client.get(f"/api/research/studies/{sid}/criterion?include_no_consent=1&student_id=stu-cr1",
                      headers=teacher).json()["items"]
    assert {(x["phase"], x["instrument"]) for x in rows} == {("pre", "criterion-v1"),
                                                             ("probe", "silent-probe")}


def test_criterion_analysis_set_excludes_students_without_consent(client, teacher, crit_sid):
    """无有效监护人同意的学生**不进研究分析集**（T0-2）。
    默认查询即分析集口径：只返回实时同意有效的学生，剔了几人要如实报告；
    include_no_consent=1 是誊录核对视图，逐行带 consent_ok 标记，不冒充分析集。"""
    sid = crit_sid
    client.post(f"/api/research/studies/{sid}/criterion",
                json={"student_id": "stu-cr2", "phase": "pre",
                      "item_scores": [1.0, 1.0]}, headers=teacher)
    # 只给 cr1 开通监护人同意；cr2 没有
    client.post("/api/teacher/consent", json={"student_id": "stu-cr1"}, headers=teacher)

    d = client.get(f"/api/research/studies/{sid}/criterion?phase=pre", headers=teacher).json()
    assert d["analysis_set"] is True
    assert {x["student_id"] for x in d["items"]} == {"stu-cr1"}
    assert d["excluded_no_consent"] == 1                        # cr2 被剔除且如实报告

    d2 = client.get(f"/api/research/studies/{sid}/criterion?phase=pre&include_no_consent=1",
                    headers=teacher).json()
    assert {x["student_id"] for x in d2["items"]} == {"stu-cr1", "stu-cr2"}
    ok = {x["student_id"]: x["consent_ok"] for x in d2["items"]}
    assert ok == {"stu-cr1": True, "stu-cr2": False}


def test_criterion_dims_persist_and_survive_a_dimless_correction(client, teacher, crit_sid):
    """dims 列（终审 #3：分维 r 须录入时打标，事后补不回）：
    键名白名单 = ct_report 的四要素口径，脏键 400；落库原样读回；
    只改总分的誊分改错（不带 dims）不许把已打的分维标抹成 NULL（store 层 COALESCE）。"""
    sid = crit_sid
    # 未知键（六维英文名/笔误）挡在入口 —— 脏键落库会让分维 r 的归维成两可
    bad = client.post(f"/api/research/studies/{sid}/criterion",
                      json={"student_id": "stu-cr1", "phase": "post",
                            "item_scores": [1.0], "dims": {"迁移": 1.0}}, headers=teacher)
    assert bad.status_code == 400 and "四要素" in bad.json()["detail"]
    bad2 = client.post(f"/api/research/studies/{sid}/criterion",
                       json={"student_id": "stu-cr1", "phase": "post",
                             "item_scores": [1.0], "dims": {"decompose": 1.0}}, headers=teacher)
    assert bad2.status_code == 400

    dims = {"问题分解": 2.0, "抽象建模": 1.0, "算法设计": 0.0, "调试评估": 1.0}
    client.post(f"/api/research/studies/{sid}/criterion",
                json={"student_id": "stu-cr1", "phase": "post",
                      "item_scores": [1.0, 1.0, 1.0, 1.0], "total": 4.0, "dims": dims},
                headers=teacher)
    rows = client.get(f"/api/research/studies/{sid}/criterion?phase=post&include_no_consent=1",
                      headers=teacher).json()["items"]
    row = next(x for x in rows if x["student_id"] == "stu-cr1")
    assert row["dims"] == dims                                      # 原样读回（0.0 是真值：考了没得分）
    # 誊分改错只改总分：dims 保留，不被覆盖成 NULL —— 分维标事后补不回，也不许事后被抹掉
    client.post(f"/api/research/studies/{sid}/criterion",
                json={"student_id": "stu-cr1", "phase": "post",
                      "item_scores": [1.0, 1.0, 1.0, 0.0]}, headers=teacher)
    rows = client.get(f"/api/research/studies/{sid}/criterion?phase=post&include_no_consent=1",
                      headers=teacher).json()["items"]
    row = next(x for x in rows if x["student_id"] == "stu-cr1")
    assert row["total"] == 3.0 and row["dims"] == dims
    # 没打过标的行 dims 是 None（真值：录入时未标分维），不硬造空 dict
    client.post(f"/api/research/studies/{sid}/criterion",
                json={"student_id": "stu-cr3", "phase": "post", "item_scores": [2.0]},
                headers=teacher)
    rows = client.get(f"/api/research/studies/{sid}/criterion?phase=post&include_no_consent=1",
                      headers=teacher).json()["items"]
    assert next(x for x in rows if x["student_id"] == "stu-cr3")["dims"] is None


# ============ 人际互动占比 ============

def test_interaction_ratio_by_student_and_room(client, teacher):
    """对抗性指标 peer/(peer+ai)：分子分母都是轮次计数，分母为 0 时 ratio=null（不硬造 0 或 1）。"""
    from app import store
    ix1 = {"Authorization": "Bearer " + _login(client, "student", "ix1")}
    ix2 = {"Authorization": "Bearer " + _login(client, "student", "ix2")}
    for _ in range(3):
        assert client.post("/api/learner/chat/turn",
                           json={"room_id": "room-ix", "role": "driver"}, headers=ix1).json()["ok"]
    client.post("/api/learner/chat/turn", json={"room_id": "room-ix", "role": "observer"}, headers=ix2)
    store.add_ct_event("stu-ix1", "ai_help", "", None)

    d = client.get("/api/learner/interaction?student_id=stu-ix1", headers=teacher).json()
    assert (d["peer_turns"], d["ai_turns"], d["ratio"]) == (3, 1, 0.75)

    # 按房间：peer=房内全部轮次(4)，ai=房内发言人的 ai_help 合计(1)
    d = client.get("/api/learner/interaction?room_id=room-ix", headers=teacher).json()
    assert (d["peer_turns"], d["ai_turns"], d["ratio"]) == (4, 1, 0.8)

    # 零行为学生：分母为 0，ratio 必须是 null —— 填 0 会被读成「从不与人互动」
    d = client.get("/api/learner/interaction?student_id=stu-ix-空", headers=teacher).json()
    assert d["peer_turns"] == 0 and d["ai_turns"] == 0 and d["ratio"] is None

    assert client.get("/api/learner/interaction", headers=teacher).status_code == 400
    assert client.get("/api/learner/interaction?student_id=stu-ix1", headers=ix1).status_code == 403


def test_chat_log_stores_metadata_only(client):
    """chat_log 没有内容列是设计而不是省事：互动占比只需要轮次计数，
    存原文是给未成年人平台凭空多开一个 PII 面。列集合被钉死，谁加 content 列谁触发这条。"""
    import app.store as st
    with st._conn() as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(chat_log)")}
    assert cols == {"id", "room_id", "from_student", "role", "ts"}


def test_interaction_window_filters_numerator_and_denominator_together(client, teacher):
    """since/until 时间窗（R+1 提前钉死 R+2 口径）：peer 与 ai 同窗过滤、左闭右开 [since, until)。
    分子一个窗、分母另一个窗的占比是假的 —— 两边必须同一约定（与 ct_counts 一致）。"""
    import time
    import app.store as st
    from app import store_learner as L
    now = int(time.time())
    uid = "stu-iw1"
    # 窗口外（更早）3 条 peer + 2 条 ai_help；窗口内 2 条 peer + 1 条 ai_help
    with L._conn() as c:
        for off in (-5000, -4900, -4800, -100, -50):
            c.execute("INSERT INTO chat_log(room_id,from_student,role,ts) VALUES('room-iw',?,'',?)",
                      (uid, now + off))
    with st._conn() as c:
        for off in (-5000, -4500, -80):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                      " VALUES(?,'ai_help','',NULL,?,2)", (uid, now + off))

    d0 = client.get(f"/api/learner/interaction?student_id={uid}", headers=teacher).json()
    assert (d0["peer_turns"], d0["ai_turns"]) == (5, 3)            # 无窗口 = 全量，行为与从前一致
    d = client.get(f"/api/learner/interaction?student_id={uid}&since={now - 200}",
                   headers=teacher).json()
    assert (d["peer_turns"], d["ai_turns"]) == (2, 1)              # 分子分母同窗收窄
    assert d["ratio"] == round(2 / 3, 3)
    # until 右开：上界恰等于某条轮次的 ts 时，那条被排除
    d2 = client.get(f"/api/learner/interaction?student_id={uid}&since={now - 200}&until={now - 50}",
                    headers=teacher).json()
    assert (d2["peer_turns"], d2["ai_turns"]) == (1, 1)            # ts=now-50 出窗，ts=now-80 在窗
    # store 层同口径直查（期段冻结走这条路）
    assert L.peer_turns(student_id=uid, since=now - 200) == 2
    assert L.peer_turns(student_id=uid, until=now - 200) == 3
    assert L.peer_turns(student_id=uid) == 5


# ============ cog_load 认知负荷自评（终审 #7 / T1-15）============

def test_cogload_requires_consent_and_validates_score(client, teacher):
    """CONSENT_REQUIRED 门禁对新通道不豁免（负荷自评同样在收集未成年人数据）；
    Paas 式单题只收 1-9 整数、轮号只收 1-3，脏值 400 挡在入口。"""
    h = {"Authorization": "Bearer " + _login(client, "student", "cg1")}
    r = client.post("/api/learner/cogload", json={"score": 7}, headers=h)
    assert r.status_code == 403 and r.json()["detail"] == "CONSENT_REQUIRED"

    client.post("/api/teacher/consent", json={"student_id": "stu-cg1"}, headers=teacher)
    for bad in (0, 10, -3):
        assert client.post("/api/learner/cogload", json={"score": bad},
                           headers=h).status_code == 400
    assert client.post("/api/learner/cogload", json={"score": 5, "round_index": 9},
                       headers=h).status_code == 400
    assert client.post("/api/learner/cogload",
                       json={"score": 7, "room_id": "room-cg", "round_index": 1},
                       headers=h).json() == {"ok": True}           # 响应只有中性完成态


def test_cogload_overwrites_same_round_and_is_teacher_readable_only(client, teacher):
    """同一学生同一轮重复提交**覆盖式**（轮末点错再点是常态，以最后一次为准，不长第二行）；
    不同轮各留一行、轮外（NULL）单独一格；GET 教师可读、学生 403（负荷分对同学也是标签）。"""
    from app import store_learner as L
    h = {"Authorization": "Bearer " + _login(client, "student", "cg2")}
    client.post("/api/teacher/consent", json={"student_id": "stu-cg2"}, headers=teacher)
    client.post("/api/learner/cogload",
                json={"score": 4, "room_id": "room-cg", "round_index": 1}, headers=h)
    client.post("/api/learner/cogload",
                json={"score": 8, "room_id": "room-cg", "round_index": 1}, headers=h)   # 覆盖第 1 轮
    client.post("/api/learner/cogload", json={"score": 5, "round_index": 2}, headers=h)
    client.post("/api/learner/cogload", json={"score": 3}, headers=h)                   # 轮外自评
    client.post("/api/learner/cogload", json={"score": 6}, headers=h)                   # 轮外也覆盖式

    items = client.get("/api/learner/cogload?student_id=stu-cg2", headers=teacher).json()["items"]
    assert len(items) == 3                                          # 第1轮/第2轮/轮外，各一行
    r1 = next(x for x in items if x["round_index"] == 1)
    assert r1["score"] == 8 and r1["room_id"] == "room-cg"          # 同轮覆盖：只留最新
    assert next(x for x in items if x["round_index"] == 2)["score"] == 5
    assert next(x for x in items if x["round_index"] is None)["score"] == 6
    # 学生本人身份从令牌取：库里不存在替他人报的口子
    assert all(x["student_id"] == "stu-cg2" for x in items)
    # RBAC：学生不能读（含自己的查询通道，负荷序列是教师侧证据面板）；student_id 必填
    assert client.get("/api/learner/cogload?student_id=stu-cg2", headers=h).status_code == 403
    assert client.get("/api/learner/cogload", headers=teacher).status_code == 400
    # 表结构与 chat_log 同纪律：只有这六列，谁加自由文本列谁触发这条
    with L._conn() as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(cog_load)")}
    assert cols == {"id", "student_id", "room_id", "round_index", "score", "ts"}


# ============ 服务端支架策略 v1（建议性，不夺权）============

def _feed(uid: str, seq):
    """按 (相对秒偏移, 类型, detail) 直接落原始事件（sv=2），偏移相对当前时刻。"""
    import time
    import app.store as st
    now = int(time.time())
    with st._conn() as c:
        for off, t, detail in seq:
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                      " VALUES(?,?,?,NULL,?,2)", (uid, t, detail, now + off))


def test_policy_suggests_up_on_consecutive_failures(client, teacher):
    """最近 30 分钟内连续 ≥3 次运行失败（其间无成功）→ 建议升一档，理由非空。"""
    uid = "stu-po连败"
    client.put(f"/api/learner/state/{uid}", json={"scaffold_level": 1}, headers=teacher)
    _feed(uid, [(-600, "run", ""), (-599, "error", "NameError: name 'a' is not defined"),
                (-400, "run", ""), (-399, "error", "TypeError: bad operand"),
                (-200, "run", ""), (-199, "error", "ValueError: invalid literal")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["current_level"] == 1 and d["suggested_level"] == 2      # 方向：升一档
    assert d["signals"]["consecutive_failures"] == 3
    assert d["reasons"] and any("升一档" in r for r in d["reasons"])
    # 前缀各不相同 → 同类错误规则不该误触发
    assert d["signals"]["repeated_error_count"] < 3


def test_policy_suggests_up_on_repeated_same_error(client, teacher):
    """最近 10 条 error 里同类（detail 前缀聚类）≥3 次 → 建议升一档。
    事件放在 30 分钟窗外：连败规则不触发，能单独验证同类错误这条规则。"""
    uid = "stu-po同错"
    client.put(f"/api/learner/state/{uid}", json={"scaffold_level": 0}, headers=teacher)
    _feed(uid, [(-4000, "error", "运行出错：IndexError: list index out of range"),
                (-3900, "error", "运行出错：IndexError: list index out of range"),
                (-3800, "error", "运行出错：IndexError: list index out of range"),
                (-60, "run", "")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["signals"]["consecutive_failures"] == 0                  # 窗外报错不算连败
    assert d["signals"]["repeated_error_count"] == 3
    assert d["suggested_level"] == 1 and any("同类错误" in r for r in d["reasons"])


def test_policy_fades_down_after_streak_of_successes(client, teacher):
    """连续 5 次运行成功且无报错 → 建议降一档（渐退方向）。"""
    uid = "stu-po渐退"
    client.put(f"/api/learner/state/{uid}", json={"scaffold_level": 2}, headers=teacher)
    _feed(uid, [(-i * 60, "run", "") for i in range(5, 0, -1)])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["current_level"] == 2 and d["suggested_level"] == 1
    assert d["signals"]["consecutive_successes"] == 5
    assert any("降一档" in r for r in d["reasons"])


def test_policy_keeps_level_and_flags_idle_student(client, teacher):
    """最近 20 分钟无任何事件（无代码增量代理）且此前有活动 → 保持档位并提示教师关注。
    空窗时也不许降档：学生离开了不等于学会了。"""
    uid = "stu-po空窗"
    _feed(uid, [(-1560, "run", ""), (-1500, "run", "")])              # 25 分钟前有过活动
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["current_level"] == 3 and d["suggested_level"] == 3      # 未写过档 → 缺省满档，保持
    assert d["attention"] is True
    assert d["signals"]["idle_minutes"] >= 20 and d["signals"]["had_activity"] is True
    assert any("关注" in r for r in d["reasons"])


def test_policy_clamps_and_never_writes(client, teacher, stu_lr):
    """档位建议夹在 0-3 内；端点**只建议不写库**，查询多少次 learner_state 都纹丝不动。
    学生只能看自己的建议（别人的建议对同学也是标签）。"""
    uid = "stu-po顶档"                                                # 缺省 3 档 + 连败 → 只能停在 3
    _feed(uid, [(-300, "run", ""), (-299, "error", "E1"),
                (-200, "run", ""), (-199, "error", "E2"),
                (-100, "run", ""), (-99, "error", "E3")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["current_level"] == 3 and d["suggested_level"] == 3
    assert any("升一档" in r for r in d["reasons"])                    # 理由仍如实给出
    # 查询不落库：learner_state 里依然没有这个学生（exists=False，档位仍是缺省）
    st = client.get(f"/api/learner/state/{uid}", headers=teacher).json()
    assert st["exists"] is False and st["scaffold_level"] == 3
    # RBAC：学生看自己 200、看别人 403
    assert client.get("/api/learner/policy/stu-lr1", headers=stu_lr).status_code == 200
    assert client.get("/api/learner/policy/stu-别人", headers=stu_lr).status_code == 403


def test_policy_source_never_touches_ct_scores():
    """静态钉死硬约束（scaffold_policy v1，法源 ai.py）：档位建议只吃 ct_events 原始信号，
    绝不引用六维评分 —— 用未验证测量驱动真实干预 = 自反循环（T1-6）。"""
    import inspect
    from app import learner
    for fn in (learner.suggest_scaffold, learner._policy_signals, learner.policy):
        src = inspect.getsource(fn)
        assert "ct_scores" not in src and "summary_for" not in src, \
            f"{fn.__name__} 引用了六维评分，违反 scaffold_policy v1 硬约束"


# ============ ai.py 按 learner_state 读档位（终审 #2）============

def test_ai_chat_reads_scaffold_from_learner_state(client, teacher, monkeypatch):
    """档位权威来源是 learner_state（第二波 §4.0：组装 prompt 前按学生读档位，
    不再透传前端参数）：缺省请求按库里档位拼 system；教师改档下一轮对话即生效；
    req.scaffold 只有显式给值时才作为覆盖生效。"""
    import app.ai as ai_mod
    captured = {}

    def fake_llm(system, messages):
        captured["system"] = system
        return "先说说你的思路？"

    monkeypatch.setattr(ai_mod, "_call_llm", fake_llm)
    client.post("/api/teacher/consent",
                json={"student_id": "stu-sc1", "guardian": "家长"}, headers=teacher)
    tok = {"Authorization": "Bearer " + _login(client, "student", "sc1")}

    # 方案A（决策1 拍板）后档位段只拼给 navigator —— 本测试构造一律用 role=reviewer，
    # 测的构念不变：档位权威来自 learner_state、教师改档即生效、请求体覆盖被拒。
    # 从未写过档：按缺省满档 3 组装（读库缺省，而不是旧的前端缺省 1）
    client.post("/api/ai/chat", json={"message": "这道题该怎么想？", "role": "reviewer"}, headers=tok)
    assert ai_mod.SCAFFOLD[3] in captured["system"]

    # 教师渐退降到 0：不带 scaffold 的下一轮对话立即按 0 档组装 —— 渐退干预真正进场
    client.put("/api/learner/state/stu-sc1", json={"scaffold_level": 0}, headers=teacher)
    client.post("/api/ai/chat", json={"message": "我还是没想出来", "role": "reviewer"}, headers=tok)
    assert ai_mod.SCAFFOLD[0] in captured["system"]
    assert ai_mod.SCAFFOLD[3] not in captured["system"]

    # 越权红线：请求体里的 scaffold **一律被忽略**，仍按教师降到的 0 档组装。
    # 否则学生一个字段就能取消教师刚下的渐退，而这个被顶掉的值还会被 _log_reply 当
    # 「服务端权威档位」写进 ai_reply_log —— 核心自变量在数据层直接失真。
    # 每个档位都试一遍：只要有一档能顶穿，渐退就不是服务端说了算。
    for lv in (1, 2, 3):
        client.post("/api/ai/chat", json={"message": "再给点方向", "role": "reviewer", "scaffold": lv}, headers=tok)
        assert ai_mod.SCAFFOLD[0] in captured["system"], f"scaffold={lv} 顶穿了教师降档"
        assert ai_mod.SCAFFOLD[lv] not in captured["system"]

    # 反向确认：改的是库里的档位才算数（证明上面的「拦住了」不是因为整条链没通）
    client.put("/api/learner/state/stu-sc1", json={"scaffold_level": 2}, headers=teacher)
    client.post("/api/ai/chat", json={"message": "再来一次", "role": "reviewer"}, headers=tok)
    assert ai_mod.SCAFFOLD[2] in captured["system"]


# ============ ct_events 房间维度（终审 #3）============

def test_ct_events_carry_room_id(client, stu_lr):
    """埋点入口把 roomId 写进 ct_events.room_id；无房间的事件 room_id 为 NULL ——
    NULL 是真值（个人练习不属于任何房间），不是缺数据。"""
    import app.store as st
    client.post("/api/ct/events", json={"type": "run", "roomId": "room-rid"}, headers=stu_lr)
    with st._conn() as c:
        r = c.execute("SELECT room_id FROM ct_events WHERE user_id='stu-lr1'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["room_id"] == "room-rid"
    client.post("/api/ct/events", json={"type": "run"}, headers=stu_lr)
    with st._conn() as c:
        r = c.execute("SELECT room_id FROM ct_events WHERE user_id='stu-lr1'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["room_id"] is None


def test_save_event_lands_but_does_not_count_as_participation(client, stu_lr):
    """save 落库（前端 IdeView 一直在发，白名单此前一直丢 —— 发了拿 ok 但 0 行入库），
    但**不进参与者口径**：只保存过一次的学生不该被冻结出一行全 0 的六维快照。"""
    import app.store as st

    client.post("/api/ct/events",
                json={"type": "save", "detail": "保存 v1", "roomId": "room-save"}, headers=stu_lr)
    with st._conn() as c:
        r = c.execute("SELECT type, room_id FROM ct_events WHERE user_id='stu-lr1'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["type"] == "save" and r["room_id"] == "room-save"      # 断线接上：真的落库了

    # 该房里这名学生只有 save —— 参与者名单必须为空
    assert st.ct_room_participants("room-save") == []
    # 同房补一条行为事件后才算参与（证明上面的「排除」不是整条链没通）
    client.post("/api/ct/events", json={"type": "run", "roomId": "room-save"}, headers=stu_lr)
    assert st.ct_room_participants("room-save") == ["stu-lr1"]


def test_context_covariates_land_and_reject_dirty_values(client, stu_lr):
    """创作情境协变量 lang / edit_mode 落独立列（不污染 detail），脏值置 NULL 而不是原样落库。

    为什么需要它：design_create 只在「Python + 积木模式」下才可能触发，而它扛着 model 维 70%。
    不记录情境，事后就分不开「没建模」与「在代码模式下做了但测不到」—— 两者对结论的含义相反。
    脏值必须挡住：分析期按值分组时，一个拼错的 "Python" 会安静地分出第三组。"""
    import app.store as st

    def last():
        with st._conn() as c:
            return c.execute("SELECT lang, edit_mode, detail FROM ct_events"
                             " WHERE user_id='stu-lr1' ORDER BY id DESC LIMIT 1").fetchone()

    client.post("/api/ct/events",
                json={"type": "run", "lang": "python", "editMode": "block"}, headers=stu_lr)
    r = last()
    assert r["lang"] == "python" and r["edit_mode"] == "block"
    assert "python" not in (r["detail"] or ""), "情境被塞进了 detail 自由文本"

    client.post("/api/ct/events", json={"type": "run", "lang": "cpp", "editMode": "code"}, headers=stu_lr)
    assert last()["lang"] == "cpp"

    # 脏值：大小写不符、不存在的语言、不存在的模式，一律 NULL
    for bad in ({"lang": "Python"}, {"lang": "rust"}, {"editMode": "blocks"}, {"editMode": "  block"}):
        client.post("/api/ct/events", json={"type": "run", **bad}, headers=stu_lr)
        r = last()
        assert r["lang"] is None and r["edit_mode"] is None, f"脏值 {bad} 落库了"

    # 不传 = NULL（真值：不在 IDE 情境下产生的事件本来就没有语言/模式）
    client.post("/api/ct/events", json={"type": "run"}, headers=stu_lr)
    assert last()["lang"] is None


def test_context_covariates_reach_the_research_export(client, teacher):
    """协变量必须真的到达分析者手里：落库却不出参，与「写路径断线」是同一个毛病，
    只是断在读的那一端。这条测试钉死 ct_events 落库 → build_dataset 出参这条链。"""
    from app import store

    store.add_ct_event("stu-cov-x", "run", "", None, lang="cpp", edit_mode="code")
    store.add_ct_event("stu-cov-x", "run", "", None)          # 不适用 → null（真值）
    d = client.get("/api/research/export?include_no_consent=1", headers=teacher).json()
    me = [s for s in d["students"] if s["behavior"]]
    seqs = [e for s in me for e in s["events"]]
    assert any(e.get("lang") == "cpp" and e.get("edit_mode") == "code" for e in seqs), \
        "协变量落了库但没进导出"
    # 键必须恒在（不适用时为 null），否则消费方会用 in 判断而把缺键当成 code
    assert all("lang" in e and "edit_mode" in e for e in seqs)


def test_context_covariates_do_not_move_ct_scores(client, teacher):
    """协变量不进六维公式：同一批行为事件，带不带 lang/edit_mode 六维分必须逐字节相同
    （进公式=动口径=必须升 FORMULA_VERSION，红线）。"""
    from app import ct, store

    for t in ("run", "run", "error", "fix", "design_create"):
        store.add_ct_event("stu-cov-a", t, "", None)
        store.add_ct_event("stu-cov-b", t, "", None, lang="python", edit_mode="block")
    a = ct.summary_for("stu-cov-a", profile="neutral")["process_indices"]
    b = ct.summary_for("stu-cov-b", profile="neutral")["process_indices"]
    assert a == b
    assert ct.FORMULA_VERSION == "ct-rules/v4"


def test_save_does_not_move_ct_scores(client, teacher):
    """save 不进六维公式：刷 save 刷不出分（进公式=动口径=必须升 FORMULA_VERSION，红线）。"""
    from app import ct, store

    for t in ("run", "run", "error", "fix"):
        store.add_ct_event("stu-save2", t, "", None)
    before = ct.summary_for("stu-save2", profile="neutral")["process_indices"]
    for _ in range(20):
        store.add_ct_event("stu-save2", "save", "保存", None)
    after = ct.summary_for("stu-save2", profile="neutral")["process_indices"]
    assert after == before
    assert ct.FORMULA_VERSION == "ct-rules/v4"


# ============ 建议留痕两表 + dismiss（终审 #4）============

def test_policy_call_leaves_a_suggestion_row(client, teacher):
    """GET /policy 现算改「算完留痕」：响应带 suggestion_id，policy_suggestion 里有对应行
    （档位/理由 JSON 原样回读，requested_by 记下触发者）；learner_state 仍纹丝不动 ——
    「只建议不写库」的红线只约束档位，不约束审计痕迹。"""
    from app import store_learner as L
    uid = "stu-po留痕"
    _feed(uid, [(-300, "run", ""), (-299, "error", "E1"),
                (-200, "run", ""), (-199, "error", "E2"),
                (-100, "run", ""), (-99, "error", "E3")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["suggestion_id"]
    row = L.get_policy_suggestion(d["suggestion_id"])
    assert row is not None and row["student_id"] == uid
    assert row["current_level"] == d["current_level"]
    assert row["suggested_level"] == d["suggested_level"]
    assert row["reasons"] == d["reasons"]                          # JSON 往返不丢理由
    assert row["requested_by"] == "tea-lishen"
    st = client.get(f"/api/learner/state/{uid}", headers=teacher).json()
    assert st["exists"] is False and st["scaffold_level"] == 3     # 档位红线：建议不写画像


def test_accept_chain_is_traceable_via_suggestion_id(client, teacher):
    """采纳链可回溯：GET /policy → PUT /state 带 suggestion_id → scaffold_log 一行
    source='teacher_accept'，经 suggestion_id join 回 policy_suggestion，
    level_to 恰是当时的建议档位；手动改档 source='teacher'；同档重写不追加流水。"""
    from app import store_learner as L
    uid = "stu-po采纳"
    client.put(f"/api/learner/state/{uid}", json={"scaffold_level": 1}, headers=teacher)
    _feed(uid, [(-300, "run", ""), (-299, "error", "E1"),
                (-200, "run", ""), (-199, "error", "E2"),
                (-100, "run", ""), (-99, "error", "E3")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    assert d["suggested_level"] == 2                               # 连败 → 1 升 2
    r = client.put(f"/api/learner/state/{uid}",
                   json={"scaffold_level": d["suggested_level"],
                         "suggestion_id": d["suggestion_id"], "room_id": "room-adopt"},
                   headers=teacher)
    assert r.status_code == 200 and r.json()["scaffold_level"] == 2

    logs = L.list_scaffold_log(uid)
    assert len(logs) == 2                                          # 手动 3→1，采纳 1→2
    first, second = logs
    assert (first["level_from"], first["level_to"], first["source"]) == (3, 1, "teacher")
    assert first["suggestion_id"] is None                          # 手动改档没有对应建议
    assert (second["level_from"], second["level_to"], second["source"]) == (1, 2, "teacher_accept")
    assert second["room_id"] == "room-adopt" and second["round_index"] is None
    sug = L.get_policy_suggestion(second["suggestion_id"])         # join 回建议行
    assert sug["student_id"] == uid and sug["suggested_level"] == second["level_to"]
    # 同档重写不算改档，不追加流水（幂等重放不该刷出假干预记录）
    client.put(f"/api/learner/state/{uid}", json={"scaffold_level": 2}, headers=teacher)
    assert len(L.list_scaffold_log(uid)) == 2


def test_dismiss_logs_no_change_and_touches_nothing(client, teacher, stu_lr):
    """驳回语义：scaffold_log 落一行 level 不变、source='dismissed'（「看过且决定不改」
    也是干预决策，必须留痕）；learner_state 不动；建议不属于该学生或不存在 404；学生 403。"""
    from app import store_learner as L
    uid = "stu-po驳回"
    _feed(uid, [(-300, "run", ""), (-299, "error", "E1"),
                (-200, "run", ""), (-199, "error", "E2"),
                (-100, "run", ""), (-99, "error", "E3")])
    d = client.get(f"/api/learner/policy/{uid}", headers=teacher).json()
    r = client.post(f"/api/learner/policy/{uid}/dismiss",
                    json={"suggestion_id": d["suggestion_id"]}, headers=teacher)
    assert r.status_code == 200 and r.json()["ok"] is True

    logs = L.list_scaffold_log(uid)
    assert len(logs) == 1
    lg = logs[0]
    assert lg["level_from"] == lg["level_to"] == d["current_level"]    # level 不变
    assert lg["source"] == "dismissed" and lg["suggestion_id"] == d["suggestion_id"]
    st = client.get(f"/api/learner/state/{uid}", headers=teacher).json()
    assert st["exists"] is False and st["scaffold_level"] == 3         # 驳回不写画像
    # 建议归属校验：拿别人学生 id 配这条建议 → 404；不存在的建议 → 404；学生不能驳回
    assert client.post("/api/learner/policy/stu-别人/dismiss",
                       json={"suggestion_id": d["suggestion_id"]}, headers=teacher).status_code == 404
    assert client.post(f"/api/learner/policy/{uid}/dismiss",
                       json={"suggestion_id": 99999}, headers=teacher).status_code == 404
    assert client.post(f"/api/learner/policy/{uid}/dismiss",
                       json={"suggestion_id": d["suggestion_id"]}, headers=stu_lr).status_code == 403


# ============ 终审 R+3：轮级证据快照（批次②）============

def test_exit_round_freezes_windowed_round_snapshot(client, teacher, stu_lr):
    """结轮自动冻结轮级快照（创新点①「同构测量」的投影）：窗口 [started_at, exited_at) 内
    在该房有 ct_events 的参与者，各冻一行六维分 + 四要素折叠 + 证据量；
    窗口外事件不计入；他房事件不算参与者；快照仅教师可读（红线：分数不下发学生）。"""
    import app.store as st
    from app import store_learner as L
    r = client.post("/api/learner/rounds/open",
                    json={"room_id": "room-rs", "round_index": 1}, headers=teacher).json()
    rid = r["id"]
    t0 = r["round"]["started_at"] - 3600
    with L._conn() as c:                                  # 起点前移出一段真实课时
        c.execute("UPDATE learning_round SET started_at=? WHERE id=?", (t0, rid))
    with st._conn() as c:
        # 窗口前 1 条 design_create：不许被算进本轮（左闭右开窗口）
        c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,room_id)"
                  " VALUES('stu-rs1','design_create','',NULL,?,2,'room-rs')", (t0 - 600,))
        # 窗口内：rs1 四条、rs2 三条编程行为
        for i, t in enumerate(("run", "run", "error", "fix")):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,room_id)"
                      " VALUES('stu-rs1',?,'',NULL,?,2,'room-rs')", (t, t0 + 60 + i))
        for i, t in enumerate(("run", "error", "fix")):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,room_id)"
                      " VALUES('stu-rs2',?,'',NULL,?,2,'room-rs')", (t, t0 + 120 + i))
        # 同窗口但别的房间：不算本轮参与者
        c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,room_id)"
                  " VALUES('stu-rs3','run','',NULL,?,2,'room-rs-别处')", (t0 + 60,))

    out = client.post(f"/api/learner/rounds/{rid}/exit",
                      json={"exit_task_passed": True}, headers=teacher).json()
    assert out["ok"] is True and out["snapshot_count"] == 2

    d = client.get(f"/api/learner/rounds/{rid}/snapshot", headers=teacher).json()
    assert d["round_id"] == rid and d["exited"] is True
    by = {x["student_id"]: x for x in d["items"]}
    assert set(by) == {"stu-rs1", "stu-rs2"}              # rs3 在他房，不进
    x1 = by["stu-rs1"]
    assert x1["evidence_count"] == 4                      # 窗口前的 design_create 没被算进来
    assert d["diagnostic_only"] is True and x1["diagnostic_only"] is True
    assert "dims" not in x1 and "report_dims" not in x1
    assert x1["diagnostic"]["counts"]["runs"] == 2
    assert x1["diagnostic"]["counts"]["designs"] == 0
    assert len(x1["diagnostic"]["source_refs"]) == 4
    assert all(r["source_id"].startswith("ct_event:") for r in x1["diagnostic"]["source_refs"])
    # 冻结的过程事实 = 同窗现算；不再生成或公开能力维度。
    from app import ct
    rnd = L.get_round(rid)
    again = ct.summary_for("stu-rs1", since=rnd["started_at"], until=rnd["exited_at"],
                           profile="neutral")
    assert x1["diagnostic"]["counts"]["runs"] == again["runs"]
    # 历史库里两个旧评分列可能都有值；API 必须同时移除，不能因短路漏出 report_dims。
    assert L.save_round_snapshot(rid, "stu-rs-legacy", {"verify": 88}, {"调试评估": 88}, 1)
    legacy_items = client.get(
        f"/api/learner/rounds/{rid}/snapshot", headers=teacher
    ).json()["items"]
    legacy = next(x for x in legacy_items if x["student_id"] == "stu-rs-legacy")
    assert "dims" not in legacy and "report_dims" not in legacy
    assert legacy["legacy_snapshot_hidden"] is True
    # 学生 403：轮级诊断也不跨角色下发。
    assert client.get(f"/api/learner/rounds/{rid}/snapshot", headers=stu_lr).status_code == 403
    # 不存在的轮 404
    assert client.get("/api/learner/rounds/999999/snapshot", headers=teacher).status_code == 404


# ============ 终审 R+3：互动指标诚实标志（批次③）============

def test_interaction_flags_unconnected_chat_channel(client, teacher):
    """chat_channel_available（终审断点1的「接通前」半步）：chat_log 一条记录都没有
    ＝聊天通道尚未接进来，不是「从不与人互动」—— 此时 ratio 强制 null 并明说，
    不许把「没接线」呈现成 0.0 写进「支架来源迁移」的证据链。"""
    from app import store
    uid = "stu-nochat1"
    store.add_ct_event(uid, "ai_help", "", None)
    d = client.get(f"/api/learner/interaction?student_id={uid}", headers=teacher).json()
    assert (d["peer_turns"], d["ai_turns"]) == (0, 1)
    assert d["chat_channel_available"] is False
    assert d["ratio"] is None                             # 通道未接通：0/(0+1)=0.0 是假 0
    assert "聊天通道未接通" in d["note"]
    # 房间口径同理：没有任何 chat_log 的房间不出可解释的 ratio
    d2 = client.get("/api/learner/interaction?room_id=room-nc-empty", headers=teacher).json()
    assert d2["chat_channel_available"] is False and d2["ratio"] is None and "note" in d2
    # 接通后：标志翻真、note 消失、ratio 恢复正常口径
    h = {"Authorization": "Bearer " + _login(client, "student", "nochat1")}
    client.post("/api/learner/chat/turn", json={"room_id": "room-nc", "role": "driver"}, headers=h)
    d3 = client.get(f"/api/learner/interaction?student_id={uid}", headers=teacher).json()
    assert d3["chat_channel_available"] is True
    assert d3["ratio"] == 0.5 and "note" not in d3


# ============ 终审 R+3：role_switch 轮换语义字段（批次④）============

def test_role_switch_reason_lands_in_its_own_column(client, stu_lr):
    """switch_reason（第四波 Zhong2017 修正的无争议部分）：forced/negotiated 落独立列、
    不污染 detail；白名单外取值与非 role_switch 事件一律 NULL；六维公式不消费该字段
    （它是轮换机制分析的数据源：Zhong et al. 2017 半自由协商最优的检验）。"""
    import inspect
    import app.store as st
    from app import ct

    def last_row():
        with st._conn() as c:
            return c.execute("SELECT type,detail,switch_reason FROM ct_events"
                             " WHERE user_id='stu-lr1' ORDER BY id DESC LIMIT 1").fetchone()

    client.post("/api/ct/events", json={"type": "role_switch", "reason": "negotiated"}, headers=stu_lr)
    r = last_row()
    assert r["type"] == "role_switch" and r["switch_reason"] == "negotiated"
    assert not (r["detail"] or "")                        # 独立列，不写 detail 前缀
    client.post("/api/ct/events", json={"type": "role_switch", "reason": "forced"}, headers=stu_lr)
    assert last_row()["switch_reason"] == "forced"
    # 白名单外取值静默置空（脏值一旦落库，轮换机制分析的分组就成了两可）
    client.post("/api/ct/events", json={"type": "role_switch", "reason": "随便写的"}, headers=stu_lr)
    assert last_row()["switch_reason"] is None
    # 非 role_switch 事件不带轮换语义
    client.post("/api/ct/events", json={"type": "run", "reason": "forced"}, headers=stu_lr)
    assert last_row()["type"] == "run" and last_row()["switch_reason"] is None
    # 六维公式不消费：静态钉死（消费=动公式=升 FORMULA_VERSION，红线）
    assert "switch_reason" not in inspect.getsource(ct.summary_for)


# ============ 最小纵贯线集成测试 ============

def test_vertical_slice_events_to_study_report(client, teacher):
    """事件落库 → 六维 → ct_report 四要素 → interaction → criterion 录入 → study report，
    两名学生走通全链，逐层断言数据一致性（折叠关系 / 分子分母 / 剔除数 / 冻结值=同窗现算）。"""
    import time as _t
    import app.store as st
    from app import ct, store_study as S

    # —— 建课题：实验班 vs1+vs2、对照班 vs3；vs1/vs3 有监护人同意，vs2 没有（T0-2 剔除对象）
    exp = client.post("/api/resources/classes", json={"name": "纵贯实验班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{exp}/students",
               json={"student_ids": ["stu-vs1", "stu-vs2"]}, headers=teacher)
    ctrl = client.post("/api/resources/classes", json={"name": "纵贯对照班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{ctrl}/students",
               json={"student_ids": ["stu-vs3"]}, headers=teacher)
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-vs1", "stu-vs3"]}, headers=teacher)
    sid = client.post("/api/research/studies",
                      json={"exp_class_ids": [exp], "ctrl_class_ids": [ctrl]},
                      headers=teacher).json()["id"]
    client.post(f"/api/research/studies/{sid}/pretest", headers=teacher)
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    t0 = client.get(f"/api/research/studies/{sid}", headers=teacher).json()["started_at"]
    S.update_study(sid, {"started_at": t0 - 3600})                    # 起点前移出一段真实课时

    # ① 事件落库（sv=2，落在干预期窗口内）：两人同为 run,error,run,fix,run
    with st._conn() as c:
        for uid in ("stu-vs1", "stu-vs2"):
            for i, t in enumerate(("run", "error", "run", "fix", "run")):
                c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                          " VALUES(?,?,'',NULL,?,2)", (uid, t, t0 - 1800 + i))

    # ② 六维（研究口径 neutral）：行为计数与落库事件一致
    cs1 = ct.summary_for("stu-vs1", profile="neutral")
    assert (cs1["runs"], cs1["errors"], cs1["fixes"]) == (3, 1, 1)
    assert (cs1["attempts"], cs1["successes"]) == (3, 2)              # sv=2：尝试=run，成功=run-error
    six = cs1["process_indices"]

    # ③ ct_report 四要素：报告维是六维的确定性折叠，transfer 只留 internal
    rep1 = ct.ct_report(six)   # 仅作历史研究过程指数的确定性折叠，不是公开能力画像
    assert rep1["internal_dims"] == six
    rd = rep1["report_dims"]
    assert rd["问题分解"] == six["decompose"]
    assert rd["抽象建模"] == round((six["abstract"] + six["model"]) / 2, 1)
    assert rd["算法设计"] == six["algorithm"] and rd["调试评估"] == six["verify"]
    assert "transfer" not in rd

    # ④ interaction：vs1 发 2 条生生轮次 + 1 次 ai_help → peer/(peer+ai) 分子分母对得上
    tok1 = {"Authorization": "Bearer " + _login(client, "student", "vs1")}
    for _ in range(2):
        client.post("/api/learner/chat/turn", json={"room_id": "room-vs"}, headers=tok1)
    with st._conn() as c:                                             # 显式给窗口内时间戳（右开区间）
        c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                  " VALUES('stu-vs1','ai_help','',NULL,?,2)", (t0 - 1700,))
    ix = client.get("/api/learner/interaction?student_id=stu-vs1", headers=teacher).json()
    assert (ix["peer_turns"], ix["ai_turns"]) == (2, 1)
    assert ix["ratio"] == round(2 / 3, 3)

    # ⑤ criterion 录入：两人都录，分析集只见 vs1，剔除数如实为 1
    for uid, total in (("stu-vs1", 12.0), ("stu-vs2", 9.0)):
        client.post(f"/api/research/studies/{sid}/criterion",
                    json={"student_id": uid, "phase": "pre", "item_scores": [total]},
                    headers=teacher)
    dcr = client.get(f"/api/research/studies/{sid}/criterion?phase=pre", headers=teacher).json()
    assert {x["student_id"] for x in dcr["items"]} == {"stu-vs1"}
    assert dcr["excluded_no_consent"] == 1

    # ⑥ 结束干预 → 快照冻结值 = 同窗现算（同版本、无新事件），报告的分析集口径贯穿到底
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    x1 = next(x for x in S.snapshots(sid, "intervention") if x["student_id"] == "stu-vs1")
    again = ct.summary_for("stu-vs1", since=x1["win_start"], until=x1["win_end"], profile="neutral")
    assert x1["dims"] == again["process_indices"]                    # 旧研究快照与同窗诊断指数一致
    assert x1["behavior"]["runs"] == 3 and x1["behavior"]["ai_helps"] == 1
    rep = client.get(f"/api/research/studies/{sid}/report", headers=teacher).json()
    assert rep["excluded_no_consent"] == 1                            # vs2 无同意，报告如实报
    iv = rep["process"]["exp"]["intervention"]
    assert iv["n"] == 1 and iv["runs"] == 3                           # 分析集只算 vs1，均值=个体值
    full = client.get(f"/api/research/studies/{sid}/report?include_no_consent=1",
                      headers=teacher).json()
    assert full["process"]["exp"]["intervention"]["n"] == 2           # 誊录视图才是全量
    assert full["excluded_no_consent"] == 0 and full["analysis_set"] is False
