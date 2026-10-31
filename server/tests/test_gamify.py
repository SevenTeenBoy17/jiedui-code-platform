"""P2 趣味化与防沉迷的后端护栏：里程碑一生一次 / 会话边界 / 任务链条 / phase 终态。"""
import time


def test_milestone_is_once_in_a_lifetime(client, student):
    """「一次」必须服务端裁定 —— 放 localStorage 的话，学生换台机器或清缓存就能重刷，
    它就从「能力确认」退化成可反复触发的奖励。"""
    from app import store
    uid = "stu-xiaoma"
    with store._conn() as c:                       # 先清掉，保证从零开始
        c.execute("DELETE FROM milestones WHERE user_id=?", (uid,))

    first = client.post("/api/student/milestone", json={"kind": "first_run"}, headers=student).json()
    again = client.post("/api/student/milestone", json={"kind": "first_run"}, headers=student).json()
    assert first["first"] is True and again["first"] is False

    # 不认识的 kind 一律不给，防止前端随手编一个出来刷动画
    assert client.post("/api/student/milestone", json={"kind": "刷分"},
                       headers=student).json()["first"] is False

    kinds = client.get("/api/student/milestones", headers=student).json()["kinds"]
    assert kinds == ["first_run"]


def test_milestones_do_not_touch_process_indices(client, student):
    """里程碑绝不能进 ct_events —— 一旦进了，它就成了可以刷的过程数据。"""
    from app import store, ct
    before = ct.summary_for("stu-xiaoma")["process_indices"]
    for k in ("first_fix", "first_swap", "first_blocks3"):
        client.post("/api/student/milestone", json={"kind": k}, headers=student)
    assert ct.summary_for("stu-xiaoma")["process_indices"] == before
    assert not any(e["type"].startswith("first_") for e in store.ct_events("stu-xiaoma"))


def test_usage_cannot_be_inflated_by_spamming_heartbeats(client, student, monkeypatch):
    """原来是 total += 客户端自报值、不限频次：连发就能任意膨胀。
    现在以服务端时钟的间隔为准，自报值只当上限。

    注入时钟的理由：本测试断言的是「服务端间隔说了算」这条**语义**，不是挂钟。
    原写法用真实 time.time()，靠「把 last_at 减 60 再调 add_usage」制造间隔 ——
    这两步之间只要跨过一个整秒边界，gap 就成了 61、total 变 181。实测 20 个亚秒相位里
    11 个会失败，且撞不撞得上取决于整场测试跑多快：加一个无关的新测试就可能让它变红
    （本仓库确实发生过一次）。另一条修法「把断言放宽到 180 ≤ total ≤ 181」是把缺陷
    写进规范 —— 那样即便代码真的每拍多算一秒也照样绿，而**膨胀方向**正是本函数存在的理由。
    """
    from app import store
    uid = "stu-刷时长"
    with store._conn() as c:
        c.execute("DELETE FROM usage_sessions WHERE user_id=?", (uid,))

    # add_usage 在调用时才查模块级 _now，故可注入（store.py 里 _now 定义在 add_usage 之后，
    # 靠的正是这一点，别改成 from time import time 之类的早绑定写法）
    clock = {"t": 1_700_000_000}
    monkeypatch.setattr(store, "_now", lambda: clock["t"])

    first = store.add_usage(uid, 120)
    assert first["total"] == 120                    # 首次按自报值建会话

    # 立刻再发 10 次，每次都报 120 秒 —— 服务端时钟没走，一秒都不该加
    for _ in range(10):
        r = store.add_usage(uid, 120)
    assert r["total"] == 120, "连发心跳把时长刷上去了"

    # 边界：差一秒到 MIN_BEAT 仍算刷心跳（冻结时钟后这条才测得准，挂钟下测不了）
    clock["t"] += store.MIN_BEAT - 1
    assert store.add_usage(uid, 120)["total"] == 120, "低于 MIN_BEAT 的心跳被计入了"

    # 正常间隔：加的是**服务端间隔**与自报值的较小者（距上次被记账的心跳共 60 秒）
    clock["t"] += 61 - store.MIN_BEAT
    r = store.add_usage(uid, 999)                   # 自报 999 秒，实际只过了 60 秒
    assert r["total"] == 180 and r["session_seconds"] == 180

    # 反向：自报值低于服务端间隔时按自报值 —— 上限语义是 min，不是「一律用服务端间隔」
    clock["t"] += 100
    assert store.add_usage(uid, 30)["total"] == 210, "自报值低于服务端间隔时应按自报值计"


def test_new_session_after_a_long_gap(client, student):
    """隔了很久再回来算新会话 —— 否则「连续学习时长」会把昨天的也算进来，
    休息提醒会在学生一进来就弹。"""
    from app import store
    uid = "stu-会话边界"
    with store._conn() as c:
        c.execute("DELETE FROM usage_sessions WHERE user_id=?", (uid,))
    store.add_usage(uid, 60)
    with store._conn() as c:                        # 模拟隔了 2 小时
        c.execute("UPDATE usage_sessions SET last_at=last_at-7200 WHERE user_id=?", (uid,))
    r = store.add_usage(uid, 60)
    assert r["session_seconds"] == 60               # 新会话从头算
    assert r["total"] == 120                        # 累计仍然累加


def test_task_chain_is_server_judged(client, teacher, student):
    """任务链条只表示做没做，且完成与否由服务端裁定 —— 学生改本地存储改不动它。"""
    eid = client.post("/api/resources/exercises", json={"title": "链条题"}, headers=teacher).json()["id"]
    client.post("/api/resources/push",
                json={"res_type": "exercise", "res_id": eid, "student_ids": ["stu-xiaoma"]},
                headers=teacher)
    d = client.get("/api/resources/my/tasks/chain", headers=student).json()
    node = [n for n in d["items"] if n["res_id"] == eid][0]
    assert node["done"] is False and node["title"] == "链条题"
    # 返回体里不该有任何分数/百分比字段
    assert not any(k in node for k in ("score", "percent", "rank", "growth"))

    client.post(f"/api/resources/my/pushes/{node['target_id']}/done", headers=student)
    d2 = client.get("/api/resources/my/tasks/chain", headers=student).json()
    assert [n for n in d2["items"] if n["res_id"] == eid][0]["done"] is True


def test_chat_phase_is_terminal_never_progressive(client, teacher, student):
    """phase 只给终态。非流式返回下写「正在写第 3 步…」是在界面上撒谎。"""
    from app.ai import _phase
    assert _phase("好的，我来写：\n```python\nprint(1)\n```", socratic=False) == "written"
    assert _phase("你觉得第 3 行会怎样？要不要试试？", socratic=False) == "asked"
    assert _phase("键盘在你手里，我们一起想", socratic=True) == "blocked"
    assert _phase("第一步想清楚输入是什么？", socratic=True) == "asked"

    client.post("/api/teacher/consent", json={"student_id": "stu-xiaoma"}, headers=teacher)
    d = client.post("/api/ai/chat", json={"message": "我想自杀"}, headers=student).json()
    assert d["phase"] == "blocked"


def test_formula_version_is_single_sourced():
    """两处各写一个版本号必然漂移 —— 改了公式却忘了改快照里记的版本，
    跨版本数据就悄悄混在一起了。"""
    from app import ct, store_study
    assert store_study.FORMULA_VERSION == ct.FORMULA_VERSION == "ct-rules/v4"
