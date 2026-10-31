"""goal_anchor 最小闭环（三波总审 T1-11）：锚点 CRUD 与学生 403 / navigator 注入 / hop 渐退信号。

锚点回答「navigator 无正向目标」：教师把**关键决策点**（不是代码）预设进房间，
AI 领航员拿它校准提问方向但绝不可说出；hop 回答「渐退无度量」：navigator 每追问一轮
落一条 hop 原始信号，历时下降 = 渐退在发生。两条都不碰六维公式（FORMULA_VERSION 钉死）。
"""
import pytest


def _login(client, role: str, name: str) -> str:
    """本地登录助手（同 test_learner.py：不要从 conftest import，那会把它当模块重跑）。"""
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def stu_ga(client):
    """本文件专用学生（stu-ga1），不与其他测试的事件流互相污染。"""
    return {"Authorization": "Bearer " + _login(client, "student", "ga1")}


def _hops(uid: str) -> int:
    import app.store as st
    with st._conn() as c:
        return c.execute("SELECT COUNT(*) FROM ct_events WHERE user_id=? AND type='hop'",
                         (uid,)).fetchone()[0]


# ============ 锚点 CRUD 与学生 403 ============

def test_anchor_crud_and_student_403(client, teacher, stu_ga):
    """教师建/读/删锚点；同 room 允许多条（防压制多解）；学生全线 403 ——
    锚点是 navigator 的内部参照，学生可见（含自己房间的）就是泄答案方向。"""
    r = client.post("/api/learner/anchors",
                    json={"room_id": "room-ga", "anchor": "需要一个循环直到猜对"}, headers=teacher)
    assert r.status_code == 200
    a1 = r.json()["id"]
    a2 = client.post("/api/learner/anchors",
                     json={"room_id": "room-ga", "anchor": "每次猜完要缩小范围"},
                     headers=teacher).json()["id"]
    assert a2 != a1                                             # 同房间第二条照样能建

    items = client.get("/api/learner/anchors?room_id=room-ga", headers=teacher).json()["items"]
    assert [x["anchor"] for x in items] == ["需要一个循环直到猜对", "每次猜完要缩小范围"]
    assert items[0]["created_by"]                               # 留痕：谁设的锚点

    # 脏值挡在入口
    assert client.post("/api/learner/anchors", json={"room_id": "  ", "anchor": "x"},
                       headers=teacher).status_code == 400
    assert client.post("/api/learner/anchors", json={"room_id": "room-ga", "anchor": "  "},
                       headers=teacher).status_code == 400
    assert client.get("/api/learner/anchors", headers=teacher).status_code == 400

    # 学生全线 403（读也不行：不是「只读自己房间」，是根本不可读）
    assert client.post("/api/learner/anchors",
                       json={"room_id": "room-ga", "anchor": "x"}, headers=stu_ga).status_code == 403
    assert client.get("/api/learner/anchors?room_id=room-ga", headers=stu_ga).status_code == 403
    assert client.delete(f"/api/learner/anchors/{a2}", headers=stu_ga).status_code == 403

    # 教师删除；重复删 404
    assert client.delete(f"/api/learner/anchors/{a2}", headers=teacher).json()["ok"] is True
    assert client.delete(f"/api/learner/anchors/{a2}", headers=teacher).status_code == 404
    items = client.get("/api/learner/anchors?room_id=room-ga", headers=teacher).json()["items"]
    assert len(items) == 1 and items[0]["id"] == a1


# ============ navigator system prompt 注入 ============

def test_navigator_prompt_gets_anchors_with_antileak_and_redline_intact():
    """navigator 的 system 含「关键决策点」与反泄露指令；注入排在角色契约/反越狱之后；
    driver 不注入；禁代写红线原样在场 —— 锚点只加参照，不加授权。不打真 LLM，测 build 出的字符串。"""
    from app import ai, ct
    anchors = ["需要一个循环直到猜对"]

    sys_nav = ai._system("reviewer", 1, None, False, anchors)
    assert "关键决策点" in sys_nav and "需要一个循环直到猜对" in sys_nav
    assert "绝不可直接说出" in sys_nav                          # 反泄露指令
    assert "绝对禁止" in sys_nav and "完整" in sys_nav          # BASE_RULE 禁代写红线未被削弱
    assert sys_nav.index(ai.ROLE_PROMPT["reviewer"]) < sys_nav.index("关键决策点")

    # 强制苏格拉底把 persona 顶成 navigator：同样注入，且排在 SOCRATIC_OVERRIDE 之后
    sys_soc = ai._system("turtle", 1, None, True, anchors)
    assert "关键决策点" in sys_soc
    assert sys_soc.index(ai.SOCRATIC_OVERRIDE) < sys_soc.index("关键决策点")

    # driver（小狐）不注入：它有写码授权，拿到锚点会照着决策点直写
    assert "关键决策点" not in ai._system("turtle", 1, None, False, anchors)
    # 没锚点时 navigator prompt 与从前一致
    assert "关键决策点" not in ai._system("reviewer", 1, None, False)
    # 六维公式版本钉死：锚点/hop 都不动公式
    assert ct.FORMULA_VERSION == "ct-rules/v4"


# ============ hop 渐退度量原始信号 ============

def test_navigator_chat_drops_hop_event_with_round_index(client, teacher, stu_ga, monkeypatch):
    """navigator 模式 + roomId → 回包后落一条 type='hop'（detail='navigator追问'），
    有进行中的教学轮就带轮号，没有就 NULL；driver 不落；学生经埋点白名单伪造不进来。"""
    import app.ai as ai_mod
    # 不打真 LLM：navigator 回复打桩成一句追问
    monkeypatch.setattr(ai_mod, "_call_llm",
                        lambda system, messages: "第 3 行的循环条件，猜对的时候会退出吗？")
    client.post("/api/teacher/consent",
                json={"student_id": "stu-ga1", "guardian": "家长"}, headers=teacher)
    client.post("/api/learner/rounds/open",
                json={"room_id": "room-hop", "round_index": 2}, headers=teacher)

    d = client.post("/api/ai/chat",
                    json={"message": "我卡住了，该从哪一步想起？",
                          "role": "reviewer", "roomId": "room-hop"}, headers=stu_ga).json()
    assert d.get("blocked") is not True
    import app.store as st
    with st._conn() as c:
        r = c.execute("SELECT detail, round_index, room_id FROM ct_events"
                      " WHERE user_id='stu-ga1' AND type='hop'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r is not None and r["detail"] == "navigator追问" and r["round_index"] == 2
    assert r["room_id"] == "room-hop"    # 终审 #3：hop 带房间号，渐退度量才能按房间切分

    # 该房间没有进行中的轮：round_index 必须是 NULL（轮外事件不硬归轮）
    client.post("/api/ai/chat",
                json={"message": "然后该检查什么？", "role": "reviewer", "roomId": "room-nohop"},
                headers=stu_ga)
    with st._conn() as c:
        r = c.execute("SELECT round_index FROM ct_events WHERE user_id='stu-ga1' AND type='hop'"
                      " ORDER BY id DESC LIMIT 1").fetchone()
    assert r["round_index"] is None

    n0 = _hops("stu-ga1")
    # driver 模式不落 hop（hop 度量的是 navigator 追问，不是所有 AI 对话）
    client.post("/api/ai/chat",
                json={"message": "帮我看看这段", "role": "turtle", "roomId": "room-hop"},
                headers=stu_ga)
    # 学生直接 POST 埋点伪造 hop：白名单外静默丢弃，渐退度量刷不了
    client.post("/api/ct/events", json={"type": "hop", "detail": "伪造"}, headers=stu_ga)
    assert _hops("stu-ga1") == n0
