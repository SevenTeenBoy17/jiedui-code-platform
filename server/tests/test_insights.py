"""AI 学情洞察（V5）：权限 / 证据链真实性 / 出闸审核 / 回退可用。"""
from app.insights import audit, _rule_insight, _facts


def test_requires_teacher(client, student):
    assert client.get("/api/insights/student/stu-xiaoma", headers=student).status_code == 403
    assert client.get("/api/insights/class", headers=student).status_code == 403


def test_student_insight_shape_and_evidence(client, teacher, student):
    # 先制造真实行为，保证有数据可分析
    for t in ("run", "run", "error", "fix", "design_create"):
        client.post("/api/ct/events", json={"type": t}, headers=student)

    d = client.get("/api/insights/student/stu-xiaoma", headers=teacher).json()
    card = d["card"]
    assert card["headline"] and 0 <= card["confidence"] <= 1
    assert card["audited"] is True                       # 必经出闸审核
    assert card["source"] in ("llm", "rule")             # LLM 不可达时回退规则

    ev = d["evidence"]
    assert set(ev) >= {"诊断上下文", "已确认学情", "安全提醒次数"}
    # 行为事实仍可用于课堂诊断，但不能被包装成能力维度。
    assert ev["诊断上下文"]["运行"] >= 2 and ev["诊断上下文"]["修复"] >= 1
    assert ev["已确认学情"] == {}
    assert d["profile"]["status"] == "insufficient_evidence" and d["timeline"]
    assert d["card"]["strengths"] == [] and d["card"]["weaknesses"] == []


def test_audit_blocks_labeling():
    bad = {"headline": "这个学生太笨了，没救", "suggestions": ["放弃这个学生"], "confidence": 0.9}
    out = audit(dict(bad))
    assert out["audited"] is True
    assert "笨" not in out["headline"]                   # 贴标签措辞被拦
    assert out.get("blocked_words")


def test_rule_fallback_is_actionable():
    f = _facts("stu-xiaoma")
    card = _rule_insight(f)
    assert card["headline"] and card["suggestions"]       # 回退版仍给可执行建议
    assert card["source"] == "rule"


def test_class_insight(client, teacher):
    d = client.get("/api/insights/class", headers=teacher).json()
    assert "headline" in d and isinstance(d["common_weak"], list)


def test_recommend_matches_weak_dimension(client, teacher, monkeypatch):
    # 只有证据支持、教师确认的推断才能决定推荐靶点。
    def confirmed(*_args, **_kwargs):
        return {"status": "evidence_backed", "scope": "task", "scope_ref": "T-1",
                "levels": {"verify": 1, "algorithm": 3},
                "inferences": [{"confidence": 0.8}], "evidence_count": 2}
    monkeypatch.setattr("app.insights.evidence_profile_for", confirmed)
    weak_key, other = "verify", "algorithm"

    hit = client.post("/api/resources/exercises", json={
        "title": "命中薄弱维", "ct_dims": {weak_key: 5}, "difficulty": 1}, headers=teacher).json()["id"]
    client.post("/api/resources/exercises", json={
        "title": "无关维", "ct_dims": {other: 5}, "difficulty": 4}, headers=teacher)

    r = client.get("/api/insights/recommend/stu-xiaoma", headers=teacher).json()
    assert r["weak_dim"] == "验证优化" and r["profile_status"] == "evidence_backed"
    ids = [e["id"] for e in r["exercises"]]
    assert hit in ids                                  # 命中薄弱维的题被推荐
    assert r["exercises"][0]["id"] == hit               # 且排在首位


def test_recommend_then_push_closes_loop(client, teacher, student, monkeypatch):
    def confirmed(*_args, **_kwargs):
        return {"status": "evidence_backed", "scope": "task", "scope_ref": "T-1",
                "levels": {"verify": 1, "algorithm": 3},
                "inferences": [{"confidence": 0.8}], "evidence_count": 2}
    monkeypatch.setattr("app.insights.evidence_profile_for", confirmed)
    r = client.get("/api/insights/recommend/stu-xiaoma", headers=teacher).json()
    assert r["exercises"], "应有推荐题目"
    eid = r["exercises"][0]["id"]

    p = client.post("/api/resources/push", json={
        "res_type": "exercise", "res_id": eid,
        "student_ids": ["stu-xiaoma"], "reason": r["reason"]}, headers=teacher).json()
    assert p["targets"] == 1

    my = client.get("/api/resources/my/pushes", headers=student).json()
    assert any(i["res_id"] == eid and r["weak_dim"] in i["reason"] for i in my["items"])


def test_recommend_requires_teacher(client, student):
    assert client.get("/api/insights/recommend/stu-xiaoma", headers=student).status_code == 403
