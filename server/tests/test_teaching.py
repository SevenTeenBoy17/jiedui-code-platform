"""教学区 V5：班级管理 / 按班级下发任务 / 课堂实时监看。"""


def test_class_crud_and_rbac(client, teacher, student):
    assert client.post("/api/resources/classes", json={"name": "越权"}, headers=student).status_code == 403
    assert client.get("/api/resources/classes", headers=student).status_code == 403

    cid = client.post("/api/resources/classes",
                      json={"name": "初一(2)班", "grade": "七年级"}, headers=teacher).json()["id"]
    d = client.get("/api/resources/classes", headers=teacher).json()
    assert any(c["id"] == cid for c in d["items"])
    assert isinstance(d["roster"], list)                      # 附带可选学生名册

    n = client.put(f"/api/resources/classes/{cid}/students",
                   json={"student_ids": ["stu-xiaoma", "stu-xiaohua"]}, headers=teacher).json()["size"]
    assert n == 2
    cls = next(c for c in client.get("/api/resources/classes", headers=teacher).json()["items"] if c["id"] == cid)
    assert cls["size"] == 2 and set(cls["student_ids"]) == {"stu-xiaoma", "stu-xiaohua"}


def test_push_by_class_is_the_task_flow(client, teacher, student):
    """任务 = 按班级下发的推送（带截止/必做），复用同一套记录，不另造概念。"""
    cid = client.post("/api/resources/classes", json={"name": "任务班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students",
               json={"student_ids": ["stu-xiaoma"]}, headers=teacher)
    eid = client.post("/api/resources/exercises",
                      json={"title": "任务题", "ct_dims": {"algorithm": 5}}, headers=teacher).json()["id"]

    p = client.post("/api/resources/push", json={
        "res_type": "exercise", "res_id": eid, "class_ids": [cid],
        "reason": "本周作业", "due_at": 1900000000, "required": 1}, headers=teacher).json()
    assert p["targets"] == 1                                   # 只推给班内学生，未波及全体

    my = client.get("/api/resources/my/pushes", headers=student).json()
    item = next(i for i in my["items"] if i["res_id"] == eid)
    assert item["required"] == 1 and item["due_at"] == 1900000000


def test_live_monitor(client, teacher, student):
    for t in ("run", "error", "error"):                        # 制造「卡住」信号
        client.post("/api/ct/events", json={"type": t}, headers=student)

    assert client.get("/api/teacher/live", headers=student).status_code == 403
    d = client.get("/api/teacher/live", headers=teacher).json()
    assert set(d["tally"]) == {"stuck", "active", "idle", "away"}
    me = next(s for s in d["seats"] if s["id"] == "stu-xiaoma")
    assert me["state"] == "stuck"                              # 报错未修复 → 判卡住
    assert d["seats"][0]["state"] == "stuck"                   # 卡住的排最前，老师先看到


def test_live_scoped_to_class(client, teacher, student):
    """不按班收敛，上课时会把全平台账号铺满屏——必须能只盯一个班。"""
    client.post("/api/ct/events", json={"type": "run"}, headers=student)
    # 班外学生：学生要有活动记录才会出现在名册里，光登录不算
    tok = client.post("/api/auth/student/login", json={"username": "banwai", "password": "123456"}).json()["token"]
    client.post("/api/ct/events", json={"type": "run"}, headers={"Authorization": f"Bearer {tok}"})
    cid = client.post("/api/resources/classes", json={"name": "监看班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students",
               json={"student_ids": ["stu-xiaoma"]}, headers=teacher)

    all_seats = client.get("/api/teacher/live", headers=teacher).json()["seats"]
    one = client.get(f"/api/teacher/live?class_id={cid}", headers=teacher).json()
    assert len(one["seats"]) == 1 and one["seats"][0]["id"] == "stu-xiaoma"
    assert len(all_seats) > len(one["seats"])                  # 确认确实过滤掉了班外的人
    assert sum(one["tally"].values()) == 1                     # 统计也跟着收敛，不是只筛列表
