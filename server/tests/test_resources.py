"""资源中心（V3.5）：CRUD / 权限 / 外链白名单 / 推送闭环。"""


def _mk_exercise(client, teacher, **kw):
    body = {"title": "测试题", "language": "python", "difficulty": 2,
            "reference_solution": "SECRET_SOLUTION", "test_cases": [{"in": "1", "out": "1"}],
            "hints": ["先想输入"], "ct_dims": {"algorithm": 5}}
    body.update(kw)
    r = client.post("/api/resources/exercises", json=body, headers=teacher)
    assert r.status_code == 200
    return r.json()["id"]


def test_student_cannot_create(client, student):
    assert client.post("/api/resources/exercises", json={"title": "越权"}, headers=student).status_code == 403


def test_student_never_sees_solution(client, teacher, student):
    eid = _mk_exercise(client, teacher)
    d = client.get(f"/api/resources/exercises/{eid}", headers=student).json()
    assert "reference_solution" not in d                  # 参考解被裁掉
    assert d["hints"]                                     # 但提示阶梯可见（苏格拉底）
    assert d["ct_primary"] == "algorithm"                 # 六维主维自动计算


def test_video_whitelist(client, teacher, student):
    ok = client.post("/api/resources/videos",
                     json={"title": "白名单", "url": "https://www.bilibili.com/video/BV1"}, headers=teacher).json()
    bad = client.post("/api/resources/videos",
                      json={"title": "未知源", "url": "https://evil.example.com/x"}, headers=teacher).json()
    assert ok["review_state"] == "ok" and bad["review_state"] == "pending"
    titles = [v["title"] for v in client.get("/api/resources/videos", headers=student).json()["items"]]
    assert "未知源" not in titles                          # 未过审外链不下发学生


def test_push_receive_done_flow(client, teacher, student):
    eid = _mk_exercise(client, teacher, title="推送用题")
    p = client.post("/api/resources/push",
                    json={"res_type": "exercise", "res_id": eid,
                          "student_ids": ["stu-xiaoma"], "reason": "课后巩固"}, headers=teacher).json()
    assert p["targets"] == 1

    my = client.get("/api/resources/my/pushes", headers=student).json()
    item = next(i for i in my["items"] if i["res_id"] == eid)
    assert item["title"] == "推送用题" and item["reason"] == "课后巩固"

    tid = item["target_id"]
    client.post(f"/api/resources/my/pushes/{tid}/read", json={}, headers=student)
    assert client.post(f"/api/resources/my/pushes/{tid}/done", json={}, headers=student).json()["ok"] is True

    rec = next(x for x in client.get("/api/resources/pushes", headers=teacher).json()["items"] if x["res_id"] == eid)
    assert rec["total"] == 1 and rec["read"] == 1 and rec["done"] == 1


def test_set_items_ordering(client, teacher):
    sid = client.post("/api/resources/sets", json={"title": "练习集"}, headers=teacher).json()["id"]
    e1, e2 = _mk_exercise(client, teacher, title="A"), _mk_exercise(client, teacher, title="B")
    n = client.put(f"/api/resources/sets/{sid}/items",
                   json={"items": [{"item_type": "exercise", "ref_id": e2},
                                   {"item_type": "exercise", "ref_id": e1}]}, headers=teacher).json()["count"]
    assert n == 2
    d = client.get(f"/api/resources/sets/{sid}", headers=teacher).json()
    assert [i["title"] for i in d["items"]] == ["B", "A"]      # 顺序按 position 落库
    assert d["item_count"] == 2


def test_cases_crud_and_rbac(client, teacher, student):
    """课例库（教研·操作性成果）：教师可增改删、学生只读。"""
    assert client.post("/api/resources/cases", json={"title": "越权"}, headers=student).status_code == 403

    cid = client.post("/api/resources/cases", json={
        "title": "猜数字·一课时", "grade": "七年级", "language": "python",
        "goal": "用循环与条件解决猜数问题", "ct_dims": {"algorithm": 5, "decompose": 3},
        "flow": [{"stage": "导入", "minutes": 5, "teacher": "抛出猜数游戏", "student": "口述规则"},
                 {"stage": "建模", "minutes": 10, "teacher": "给流程图模板", "student": "填判断框"}],
        "reflection": "学生在边界条件上卡顿较多，下次先做边界小练习。",
    }, headers=teacher).json()["id"]

    d = client.get(f"/api/resources/cases/{cid}", headers=student).json()   # 学生可读
    assert d["title"] == "猜数字·一课时"
    assert len(d["flow"]) == 2 and d["flow"][0]["stage"] == "导入"          # JSON 字段正确回读
    assert d["ct_dims"]["algorithm"] == 5

    assert client.put(f"/api/resources/cases/{cid}", json={"title": "猜数字·改", "reflection": "已加边界练习"},
                      headers=teacher).json()["ok"] is True
    assert client.get(f"/api/resources/cases/{cid}", headers=teacher).json()["title"] == "猜数字·改"

    assert any(c["id"] == cid for c in client.get("/api/resources/cases", headers=teacher).json()["items"])
    assert client.delete(f"/api/resources/cases/{cid}", headers=student).status_code == 403
    assert client.delete(f"/api/resources/cases/{cid}", headers=teacher).json()["ok"] is True
