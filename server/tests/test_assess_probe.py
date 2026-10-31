"""学测评一体化（蓝图·实施切分 1/2 + 分数纪律/回流钩子/mine 对账）的后端件回归。

钉死五件事：
1. **服务端时长**（铁律10）：too_fast 判定用「下发→提交」的服务端时差，前端自报值只作参考；
2. **分数纪律红线**：交卷响应只有中性完成态，总分/维度分一律不下发学生（分照旧落库）；
3. **probe 通道**：open→学生走既有五层门禁作答→自动落 ct_criterion（覆盖式）→close 拒收；
4. **时点混染防呆**：课题进入 posttest 后拒收前测补交（409）；
5. **回流钩子**（铁律11/13）：前测三分位分流建议 + probe 低分升档建议 ——
   只落 policy_suggestion（建议+留痕），learner_state 纹丝不动。
"""
import json

import pytest


def _cls(client, teacher, name, students):
    cid = client.post("/api/resources/classes", json={"name": name}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students", json={"student_ids": students}, headers=teacher)
    return cid


def _hdr(client, name):
    from tests.conftest import _login
    return {"Authorization": "Bearer " + _login(client, "student", name)}


@pytest.fixture(scope="module")
def pstudy(client, teacher):
    """探针专用课题：p1-p3 实验班 / p4-p6 对照班，全员开通同意，前测已下发。"""
    exp = _cls(client, teacher, "探针实验班", ["stu-p1", "stu-p2", "stu-p3"])
    ctrl = _cls(client, teacher, "探针对照班", ["stu-p4", "stu-p5", "stu-p6"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": [f"stu-p{i}" for i in range(1, 7)]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "title": "探针通道课题", "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]},
        headers=teacher).json()["id"]
    pre_aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    return {"sid": sid, "pre_aid": pre_aid}


def test_server_side_duration_governs_too_fast(client, teacher, pstudy):
    """铁律10：duration 前端自报可伪造 —— too_fast 必须按服务端「首开→提交」时差判。"""
    from app import store_study as S
    aid = pstudy["pre_aid"]
    items = S.get_assessment(aid, with_answers=True)["items"]
    good = [it["answer"] for it in items]

    # p1：真实作答 400 秒（回拨首开时刻模拟），但前端自报 5 秒 —— 不许被误判 too_fast
    h1 = _hdr(client, "p1")
    assert client.get(f"/api/research/my/assessments/{aid}", headers=h1).status_code == 200
    with S._conn() as c:
        c.execute("UPDATE assessment_open_log SET opened_at=opened_at-400"
                  " WHERE assessment_id=? AND student_id='stu-p1'", (aid,))
    client.post(f"/api/research/my/assessments/{aid}/submit",
                json={"answers": good, "duration_client": 5}, headers=h1)
    row = S.response_of(aid, "stu-p1")
    assert row["duration_server"] >= 395              # 服务端时差落库
    assert row["duration_sec"] == 5                   # 前端自报值保留（仅参考）
    assert "too_fast" not in row["flags"]             # 判定看服务端值：400 秒不算太快

    # p2：前端自报 9999 秒，但服务端看开卷到交卷只有几秒 —— 必须判 too_fast
    h2 = _hdr(client, "p2")
    client.get(f"/api/research/my/assessments/{aid}", headers=h2)
    client.post(f"/api/research/my/assessments/{aid}/submit",
                json={"answers": good, "duration_client": 9999}, headers=h2)
    assert "too_fast" in S.response_of(aid, "stu-p2")["flags"]

    # 重复取卷不重置计时起点（INSERT OR IGNORE 只记首次 —— 否则刷新一下就能把时长刷短）
    opened = S.opened_at_of(aid, "stu-p1")
    S.log_open(aid, "stu-p1")
    assert S.opened_at_of(aid, "stu-p1") == opened


def test_submit_returns_only_neutral_completion(client, teacher, pstudy):
    """蓝图红线：分数不下发学生 —— 交卷响应无 total/max/dim_scores，分照旧落库教师端照看。"""
    from app import store_study as S
    aid = pstudy["pre_aid"]
    items = S.get_assessment(aid, with_answers=True)["items"]
    h3 = _hdr(client, "p3")
    # p3 不取卷直接交（脚本直交）：无首开记录 → duration_server 为空，回退前端自报值判 too_fast
    r = client.post(f"/api/research/my/assessments/{aid}/submit",
                    json={"answers": [it["answer"] for it in items], "duration_client": 400},
                    headers=h3).json()
    assert r == {"ok": True, "done": True, "kind": "pre"}      # 中性完成态，别无其他字段
    row = S.response_of(aid, "stu-p3")
    assert row["total"] == 18                                  # 分数照旧落库
    assert row["duration_server"] is None and row["flags"] == []   # 回退口径与旧行为一致


def test_probe_open_answer_criterion_close(client, teacher, pstudy):
    """probe 全链：open（仅 running 期）→ 学生走既有五层门禁作答 → 自动落 criterion
    （覆盖式）+ 低分回流建议 → close 后拒收。"""
    from app import store_learner as L
    from app import store_study as S
    sid = pstudy["sid"]

    # 不动主相位：pretest 阶段开探针被 409 拒绝
    r = client.post(f"/api/research/studies/{sid}/probe/open",
                    json={"round_index": 1}, headers=teacher)
    assert r.status_code == 409
    client.post(f"/api/research/studies/{sid}/start", json={"force": True}, headers=teacher)
    assert client.post(f"/api/research/studies/{sid}/probe/open",
                       json={"round_index": 9}, headers=teacher).status_code == 400

    r = client.post(f"/api/research/studies/{sid}/probe/open",
                    json={"round_index": 1, "room_id": "room-probe"}, headers=teacher).json()
    paid = r["assessment_id"]
    assert r["ok"] is True and r["progress"] == {"done": 0, "total": 6}
    a = S.get_assessment(paid, with_answers=True)
    assert a["kind"] == "probe" and a["round_id"] == 1 and a["study_id"] == sid
    assert a["locked"] == 1 and 2 <= a["item_count"] <= 3      # 下发即锁 + 2-3 道锚题

    # 五层门禁在新通道不豁免：名单外 404（防枚举）、无同意 403、题面剥标答/维度/dim_max
    outsider = _hdr(client, "probe-outsider")
    client.post("/api/teacher/consent", json={"student_id": "stu-probe-outsider"}, headers=teacher)
    assert client.get(f"/api/research/my/assessments/{paid}", headers=outsider).status_code == 404
    h4 = _hdr(client, "p4")
    client.delete("/api/consent", headers=h4)
    assert client.get(f"/api/research/my/assessments/{paid}", headers=h4).status_code == 403
    client.post("/api/teacher/consent", json={"student_id": "stu-p4"}, headers=teacher)
    paper = client.get(f"/api/research/my/assessments/{paid}", headers=h4).json()
    blob = str(paper["items"])
    assert "answer" not in blob and "'dim'" not in blob and "dim_max" not in paper

    # p4 全错交卷：响应中性（红线同样覆盖 probe）→ 自动落 criterion + 低分升档建议
    wrong = [(it["answer"] + 1) % 4 for it in a["items"]]
    r = client.post(f"/api/research/my/assessments/{paid}/submit",
                    json={"answers": wrong, "duration_client": 60}, headers=h4).json()
    assert r == {"ok": True, "done": True, "kind": "probe"}
    assert S.response_of(paid, "stu-p4")["round_id"] == 1      # 作答归轮
    crit = client.get(f"/api/research/studies/{sid}/criterion?phase=probe",
                      headers=teacher).json()["items"]
    row = next(x for x in crit if x["student_id"] == "stu-p4")
    assert row["instrument"] == "ct-v1-probe" and row["total"] == 0
    # dims（终审 #3）：probe 钩子按题的维度标签自动打四要素小计 —— 键名同 ct_report 折叠口径，
    # 全错卷各维小计为 0.0（0 是真值：考了没得分；transfer 题不进四要素，口径同 ct_report）
    from app.ct import REPORT_FOLD
    assert row["dims"] is not None
    assert set(row["dims"]) <= set(REPORT_FOLD.values())
    assert all(v == 0.0 for v in row["dims"].values())
    with L._conn() as c:
        sugs = [dict(x) for x in c.execute(
            "SELECT * FROM policy_suggestion WHERE student_id='stu-p4'"
            " AND requested_by='system:probe'")]
    assert sugs and json.loads(sugs[-1]["reasons"]) == ["轮末probe得分率低于50%"]
    # 只建议不改档：learner_state 纹丝不动（从未被写过）
    assert L.get_state("stu-p4")["exists"] is False
    # 收卷率只报不阻断：详情里可见 1/6，任何状态转移不读它
    d = client.get(f"/api/research/studies/{sid}", headers=teacher).json()
    p1 = next(x for x in d["probes"] if x["assessment_id"] == paid)
    assert p1["progress"] == {"done": 1, "total": 6} and p1["closed"] is False

    # 第 2 轮探针：p4 全对 → criterion 覆盖式（同 (study,student,phase,instrument) 唯一键）
    paid2 = client.post(f"/api/research/studies/{sid}/probe/open",
                        json={"round_index": 2, "item_count": 2}, headers=teacher).json()["assessment_id"]
    a2 = S.get_assessment(paid2, with_answers=True)
    assert a2["item_count"] == 2 and a2["round_id"] == 2
    client.post(f"/api/research/my/assessments/{paid2}/submit",
                json={"answers": [it["answer"] for it in a2["items"]], "duration_client": 60},
                headers=h4)
    crit = client.get(f"/api/research/studies/{sid}/criterion?phase=probe",
                      headers=teacher).json()["items"]
    row = next(x for x in crit if x["student_id"] == "stu-p4")
    assert row["total"] == 2.0                                 # 新一轮覆盖旧轮（轮级明细在 responses.round_id）
    # dims 随覆盖式一起更新：全对卷的四要素小计 = 按 REPORT_FOLD 归维的逐题满分和
    expect: dict = {}
    for it in a2["items"]:
        name = REPORT_FOLD.get(it["dim"])
        if name:
            expect[name] = expect.get(name, 0.0) + float(it["score"])
    assert row["dims"] == expect

    # 关窗后拒收：取卷/交卷一律 409（首关即定，重复关窗幂等）
    assert client.post(f"/api/research/studies/{sid}/probe/{paid}/close",
                       headers=teacher).json()["ok"] is True
    client.post(f"/api/research/studies/{sid}/probe/{paid}/close", headers=teacher)
    h5 = _hdr(client, "p5")
    assert client.get(f"/api/research/my/assessments/{paid}", headers=h5).status_code == 409
    n = len(a["items"])
    assert client.post(f"/api/research/my/assessments/{paid}/submit",
                       json={"answers": [0] * n, "duration_client": 60},
                       headers=h5).status_code == 409
    # 他课题的卷 id 走 close 是 404（防枚举，不确认存在性）
    assert client.post(f"/api/research/studies/{sid}/probe/{pstudy['pre_aid']}/close",
                       headers=teacher).status_code == 404


def test_mine_shows_kind_round_and_status_without_scores(client, teacher, pstudy):
    """切分5 对账：mine() 返回 kind/round_id/due/状态（待做/已交/已关窗），
    不含题目、不含标答、不含任何分数。"""
    h1 = _hdr(client, "p1")
    items = client.get("/api/research/my/assessments", headers=h1).json()["items"]
    pre = next(x for x in items if x["kind"] == "pre")
    assert pre["done"] is True and pre["status"] == "已交" and pre["round_id"] is None
    probe1 = next(x for x in items if x["kind"] == "probe" and x["round_id"] == 1)
    assert probe1["status"] == "已关窗" and probe1["closed"] is True   # p1 没交、窗已关
    probe2 = next(x for x in items if x["kind"] == "probe" and x["round_id"] == 2)
    assert probe2["status"] == "待做" and probe2["done"] is False
    assert all("due_at" in x for x in items)
    blob = str(items)
    assert "total" not in blob and "answer" not in blob and "stem" not in blob


def test_pretest_backfill_is_rejected_after_posttest_begins(client, teacher, pstudy):
    """时点混染防呆（蓝图 2.1，杨瑞珍教训）：posttest 及之后拒收 pretest 补交（409+中文说明）。"""
    from app import store_study as S
    sid, aid = pstudy["sid"], pstudy["pre_aid"]
    client.post(f"/api/research/studies/{sid}/end", headers=teacher)
    assert client.get(f"/api/research/studies/{sid}", headers=teacher).json()["phase"] == "posttest"
    h6 = _hdr(client, "p6")                                    # p6 从没交过前测
    items = S.get_assessment(aid, with_answers=True)["items"]
    r = client.post(f"/api/research/my/assessments/{aid}/submit",
                    json={"answers": [it["answer"] for it in items], "duration_client": 400},
                    headers=h6)
    assert r.status_code == 409 and "前测" in r.json()["detail"]
    assert S.response_of(aid, "stu-p6") is None                # 确实一行都没落


def test_pretest_tertile_seeds_policy_suggestions(client, teacher):
    """回流钩子（铁律11/13）：pretest→running 时按前测三分位落分流建议 ——
    下段建议档位 3（最高支架）、中/上段建议 2；只留痕，绝不直写 learner_state。"""
    from app import store_learner as L
    from app import store_study as S
    exp = _cls(client, teacher, "分流实验班", ["stu-t1", "stu-t2", "stu-t3"])
    ctrl = _cls(client, teacher, "分流对照班", ["stu-t4", "stu-t5", "stu-t6"])
    client.post("/api/teacher/consent/batch",
                json={"student_ids": [f"stu-t{i}" for i in range(1, 7)]}, headers=teacher)
    sid = client.post("/api/research/studies", json={
        "exp_class_ids": [exp], "ctrl_class_ids": [ctrl]}, headers=teacher).json()["id"]
    aid = client.post(f"/api/research/studies/{sid}/pretest", headers=teacher).json()["assessment_id"]
    scores = {"stu-t1": 3.0, "stu-t2": 5.0, "stu-t3": 8.0,
              "stu-t4": 10.0, "stu-t5": 14.0, "stu-t6": 17.0}
    for uid, t in scores.items():
        S.save_response(aid, uid, {"answers": [0] * 18, "total": t, "dim_scores": {},
                                   "item_scores": [0.0] * 18, "duration_sec": 400, "flags": []})
    assert client.post(f"/api/research/studies/{sid}/start", json={},
                       headers=teacher).json()["ok"] is True   # 6/6 收齐，无需 force

    with L._conn() as c:
        rows = {r["student_id"]: dict(r) for r in c.execute(
            "SELECT * FROM policy_suggestion WHERE requested_by='system:pretest_tertile'")
            if r["student_id"].startswith("stu-t")}
    assert set(rows) == set(scores)
    assert rows["stu-t1"]["suggested_level"] == 3              # 下段 → 最高支架
    assert json.loads(rows["stu-t1"]["reasons"]) == ["前测三分位分流：下"]
    assert rows["stu-t3"]["suggested_level"] == 2
    assert json.loads(rows["stu-t3"]["reasons"]) == ["前测三分位分流：中"]
    assert rows["stu-t6"]["suggested_level"] == 2
    assert json.loads(rows["stu-t6"]["reasons"]) == ["前测三分位分流：上"]
    # 建议不落档：learner_state 从未被写
    assert L.get_state("stu-t1")["exists"] is False
    # 留痕进课题日志（论文「研究实施过程」的原始材料）
    assert any(x["action"] == "pretest_tertile" for x in S.study_log(sid))
