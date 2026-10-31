"""核心链路冒烟（由 _smoke_*.py 整合）：鉴权 / 计算思维 / 教师聚合 / 脱敏导出。"""


def test_login_and_role(client):
    r = client.post("/api/auth/student/login", json={"username": "xiaoma", "password": "123456"})
    assert r.status_code == 200
    d = r.json()
    assert d["user"]["role"] == "student" and d["user"]["id"] == "stu-xiaoma"


def test_wrong_password_rejected(client):
    r = client.post("/api/auth/student/login", json={"username": "x", "password": "bad"})
    assert r.status_code == 401


def test_protected_requires_token(client):
    assert client.get("/api/ct/summary").status_code in (401, 403)


def test_ct_event_and_summary(client, student):
    for t in ("run", "error", "fix"):
        assert client.post("/api/ct/events", json={"type": t}, headers=student).status_code == 200
    d = client.get("/api/ct/summary", headers=student).json()
    assert d["runs"] >= 1 and d["errors"] >= 1 and d["fixes"] >= 1
    # 行为计数只是诊断上下文：没有证据支持的教师确认/修正推断，就不生成能力强弱。
    assert d["ct_rank"] == []
    assert d["profile"]["status"] == "insufficient_evidence"
    assert d["diagnostic"]["diagnostic_only"] is True
    assert "ct_scores" not in d and "process_indices" not in d
    assert d["has_real_data"] is True


def test_teacher_home_rbac_and_shape(client, teacher, student):
    assert client.get("/api/teacher/home", headers=student).status_code == 403   # 学生越权
    d = client.get("/api/teacher/home", headers=teacher).json()
    assert set(d) >= {"kpis", "students", "class_ct", "alerts", "funnel"}
    # 默认没有显式 task/unit scope，也没有证据支持的确认推断，不能用行为次数补出班级能力图。
    assert d["class_ct"] == {} and d["class_ct_n"] == 0
    summary = client.get("/api/ct/summary?user_id=stu-xiaoma", headers=teacher).json()
    assert summary["ct_rank"] == [] and summary["profile"]["status"] == "insufficient_evidence"


def test_research_export_deidentified(client, teacher, student):
    assert client.get("/api/research/export", headers=student).status_code == 403
    d = client.get("/api/research/export?format=json", headers=teacher).json()
    assert d["anonymized"] is True
    body = str(d)
    assert "stu-" not in body                            # 无原始 ID
    assert all(s["pid"].startswith("S") for s in d["students"])


def test_single_process_spa_serving(client):
    """单进程部署：web/dist 存在时同端口伺服前端；API 与安全边界不受影响。

    进校部署的人是老师不是运维——「起两个服务再配反向代理」等于不可部署。
    """
    import os
    from app import main
    if not os.path.isdir(main._DIST):
        import pytest
        pytest.skip("web/dist 未构建")
    assert "<!DOCTYPE html>" in client.get("/").text
    # vue-router history 模式：深路由刷新回落 index.html，不 404
    assert "<!DOCTYPE html>" in client.get("/teacher/research/study").text
    # API 路由优先于 SPA 回落
    assert client.get("/health").json()["service"] == "jiedui-api"
    # 路径穿越只会拿到 index.html，拿不到 dist 外的文件
    r = client.get("/..%2f..%2fserver%2f.env")
    assert "JIEDUI" not in r.text and "<!DOCTYPE html>" in r.text


# ── 外部调研 R2 的两条 P0 回归（改了就必须红）───────────────────────────

def test_ai_help_detail_never_leaves_api(client, teacher, student):
    """P0-B：ai_help 的 detail 存的是学生对 AI 说的话前 40 字（已脱敏但仍是内容）。
    出参口径收口后，path/timeline 只给角色与长度分箱——**学生原话一个字都不出 API**。
    这条与「结对聊天只存元数据、不开语义采集面」的口径必须一致，否则文档在说谎。"""
    from app import store
    mark = "海龟座标怎么算啊你说的那个循环"          # 唯一标记串，出现即泄漏
    store.add_ct_event("stu-xiaoma", "ai_help", f"[turtle] {mark}", None)
    d = client.get("/api/ct/summary", headers=student).json()
    blob = str(d)
    assert mark not in blob, "学生原话经 /summary 泄漏"
    # 教师视角同样不给（教师端要的是「谁在求助、问得长不长」，不是原话）
    t = client.get("/api/ct/summary?user_id=stu-xiaoma", headers=teacher).json()
    assert mark not in str(t)
    # 但求助这件事本身要看得见，且带角色与长度分箱
    helps = [e for e in t["timeline"] if e["type"] == "ai_help"]
    assert helps and "求助" in helps[-1]["detail"] and "[turtle]" in helps[-1]["detail"]


def test_ai_help_carries_room_and_round(client, teacher, student, monkeypatch):
    """P0-A：ai_help（需求侧）必须与 hop（供给侧）落在同一轮同一房，否则 uptake 配对量
    在数据层根本做不出来——外部调研 R2 认定这是开课前必修。"""
    from app import ai as ai_mod, store
    monkeypatch.setattr(ai_mod, "_call_llm", lambda *a, **k: "你觉得这段循环的出口在哪儿？")
    # 同意门是真门：不先登记监护人同意，AI 通道 403（这本身就是设计，不是测试噪音）
    client.post("/api/teacher/consent",
                json={"student_id": "stu-xiaoma", "guardian": "家长"}, headers=teacher)
    client.post("/api/learner/rounds/open",
                json={"room_id": "r2-uptake", "round_index": 2}, headers=teacher)
    r = client.post("/api/ai/chat", headers=student,
                    json={"message": "循环停不下来", "role": "reviewer", "socratic": True,
                          "roomId": "r2-uptake", "history": []})
    assert r.status_code == 200
    # 直查库而不走取数函数：断言的是**落库事实**，不受任何 SELECT 口径影响
    with store._conn() as c:
        rows = {r["type"]: dict(r) for r in c.execute(
            "SELECT type, room_id, round_index FROM ct_events WHERE user_id=?"
            " AND type IN ('ai_help','hop') ORDER BY id DESC LIMIT 2", ("stu-xiaoma",)).fetchall()}
    assert rows["ai_help"]["room_id"] == "r2-uptake" and rows["ai_help"]["round_index"] == 2
    assert rows["hop"]["room_id"] == "r2-uptake" and rows["hop"]["round_index"] == 2


def test_save_version_dedupes_identical_content(client):
    """内容去重（UI调研二期·运行即自动保存的前置，也是 uptake U4 登记过的前置条件）：
    与最新版完全一致 → 不落新行、幂等返回既有版本号；变更（含仅积木态变更）→ 新版本。
    没有去重，自动保存会把版本列表刷满同一份代码，「Δ 内有新版本」也永远测不出代码承接。"""
    from app import store

    pid = store.create_project("stu-dedupe", "去重测试", "python")["id"]
    r1 = store.save_version(pid, "stu-dedupe", "print(1)", None)
    assert r1 == {"ver": 1, "changed": True}
    # 同内容重复保存：版本号不动、不落新行
    for _ in range(3):
        assert store.save_version(pid, "stu-dedupe", "print(1)", None) == {"ver": 1, "changed": False}
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM project_versions WHERE project_id=?", (pid,)).fetchone()[0] == 1
    # 代码变了 → v2；只有积木态变了也算变更（积木是创作的一部分，不是附属品）
    assert store.save_version(pid, "stu-dedupe", "print(2)", None)["ver"] == 2
    assert store.save_version(pid, "stu-dedupe", "print(2)", '{"blocks":1}') == {"ver": 3, "changed": True}
