"""Slice 1 contract tests: stable originals, explicit scope, and no count scoring."""
import os
import sqlite3
import tempfile
import time

import jwt
import pytest

from app import auth, store, store_erasure as ER, store_evidence as E


def _login(client, role: str, name: str) -> dict:
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def _researcher() -> dict:
    now = int(time.time())
    token = jwt.encode(
        {"sub": "res-evidence", "name": "证据研究员", "role": "researcher",
         "iat": now, "exp": now + 3600},
        auth.SECRET, algorithm=auth.ALG,
    )
    return {"Authorization": "Bearer " + token}


def _attempt(client, name: str, task: str, project_id: int | None = None,
             unit: str | None = "unit-evidence") -> tuple[dict, dict]:
    headers = _login(client, "student", name)
    r = client.post(
        "/api/evidence/attempts",
        json={"task_id": task, "unit_id": unit, "project_id": project_id,
              "language": "python", "stage": "analysis", "ai_condition": "low"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return headers, r.json()


def _version_source(uid: str, title: str = "证据作品") -> tuple[int, int]:
    pid = store.create_project(uid, title, "python")["id"]
    store.save_version(pid, uid, "print('version-one')", None)
    with store._conn() as c:
        vid = c.execute(
            "SELECT id FROM project_versions WHERE project_id=? AND version_no=1", (pid,)
        ).fetchone()[0]
    return pid, vid


def _attach(client, headers: dict, attempt_id: str, source_type: str,
            source_id: int | None, scope: str = "task", quality: str = "verified",
            missing_reason: str | None = None):
    return client.post(
        f"/api/evidence/attempts/{attempt_id}/items",
        json={"scope": scope, "source_type": source_type, "source_id": source_id,
              "quality_status": quality, "missing_reason": missing_reason,
              "consent_basis": "课堂学习证据授权/v1"},
        headers=headers,
    )


def test_schema_uses_stable_ids_checks_and_pointer_only_storage():
    with store._conn() as c:
        assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        tables = {r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        assert {"task_attempts", "evidence_items", "inferences", "inference_evidence"} <= tables
        evidence_cols = {r[1] for r in c.execute("PRAGMA table_info(evidence_items)")}
        assert {"evidence_id", "source_type", "source_id", "source_version"} <= evidence_cols
        assert not ({"code", "detail", "payload", "message", "content"} & evidence_cols)
        sql = c.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='task_attempts'"
        ).fetchone()[0]
        for stage in E.WORKFLOW_STAGES:
            assert f"'{stage}'" in sql
        indexes = {r[1] for r in c.execute("PRAGMA index_list(evidence_items)")}
        assert "idx_ev_pointer_unique" in indexes
        evidence_fks = {
            (r["from"], r["table"], r["to"], r["on_delete"])
            for r in c.execute("PRAGMA foreign_key_list(evidence_items)")
        }
        assert ("attempt_id", "task_attempts", "attempt_id", "CASCADE") in evidence_fks
        link_fks = {
            (r["from"], r["table"], r["to"], r["on_delete"])
            for r in c.execute("PRAGMA foreign_key_list(inference_evidence)")
        }
        assert ("inference_id", "inferences", "inference_id", "CASCADE") in link_fks
        assert ("evidence_id", "evidence_items", "evidence_id", "RESTRICT") in link_fks


def test_evidence_foreign_keys_reject_orphans_and_preserve_cited_originals():
    now = int(time.time())
    with store._lock, store._conn() as c:
        with pytest.raises(sqlite3.IntegrityError):
            c.execute(
                "INSERT INTO evidence_items(evidence_id,attempt_id,scope,source_type,source_id,"
                "source_version,quality_status,missing_reason,consent_basis,created_by,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                ("ev_fk_orphan", "att_missing", "task", "project_version", None, None,
                 "missing", "原件尚未形成", "test-consent/v1", "test", now),
            )

        c.execute(
            "INSERT INTO task_attempts(attempt_id,student_id,task_id,unit_id,project_id,"
            "language,stage,ai_condition,status,started_at,ended_at,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("att_fk_contract", "stu-fk-contract", "task-fk-contract", None, None,
             "python", "analysis", "low", "active", now, None, now, now),
        )
        c.execute(
            "INSERT INTO evidence_items(evidence_id,attempt_id,scope,source_type,source_id,"
            "source_version,quality_status,missing_reason,consent_basis,created_by,created_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            ("ev_fk_contract", "att_fk_contract", "task", "project_version", None, None,
             "missing", "等待学生保存版本", "test-consent/v1", "test", now),
        )
        c.execute(
            "INSERT INTO inferences(inference_id,student_id,scope,task_id,unit_id,construct,level,"
            "claim,confidence,rule_version,status,created_by,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("inf_fk_contract", "stu-fk-contract", "task", "task-fk-contract", None,
             "algorithm", "tentative", "外键测试用暂定判断", 0.5, "test-rule/v1",
             "tentative", "test", now, now),
        )
        c.execute(
            "INSERT INTO inference_evidence(inference_id,evidence_id,relation) VALUES(?,?,?)",
            ("inf_fk_contract", "ev_fk_contract", "support"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            c.execute("DELETE FROM evidence_items WHERE evidence_id='ev_fk_contract'")

        c.execute("DELETE FROM inferences WHERE inference_id='inf_fk_contract'")
        assert c.execute(
            "SELECT COUNT(*) FROM inference_evidence WHERE inference_id='inf_fk_contract'"
        ).fetchone()[0] == 0
        c.execute("DELETE FROM task_attempts WHERE attempt_id='att_fk_contract'")
        assert c.execute(
            "SELECT COUNT(*) FROM evidence_items WHERE evidence_id='ev_fk_contract'"
        ).fetchone()[0] == 0


def test_existing_evidence_tables_are_migrated_without_losing_links(monkeypatch):
    base_temp = os.environ.get("JIEDUI_TEST_TMPDIR")
    original_db = store.DB_PATH
    # 放在 pytest 会话临时根下，由 conftest 的会话清理统一回收。E.init() 沿用仓库
    # 现有连接工厂，Windows 上连接句柄可能延迟释放，因此这里不提前 rmtree 子目录。
    temp_dir = tempfile.mkdtemp(prefix="legacy_evidence_", dir=base_temp)
    legacy_db = os.path.join(temp_dir, "legacy-evidence.db")
    legacy_conn = sqlite3.connect(legacy_db)
    try:
        legacy_conn.executescript(
            """
            CREATE TABLE task_attempts(
              attempt_id TEXT PRIMARY KEY, student_id TEXT, task_id TEXT, unit_id TEXT,
              updated_at INTEGER, started_at INTEGER
            );
            CREATE TABLE inferences(
              inference_id TEXT PRIMARY KEY, student_id TEXT, scope TEXT, task_id TEXT,
              unit_id TEXT, updated_at INTEGER
            );
            CREATE TABLE evidence_items(
              evidence_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, scope TEXT NOT NULL,
              source_type TEXT NOT NULL, source_id INTEGER, source_version TEXT,
              quality_status TEXT NOT NULL, missing_reason TEXT, consent_basis TEXT NOT NULL,
              created_by TEXT NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE inference_evidence(
              inference_id TEXT NOT NULL, evidence_id TEXT NOT NULL, relation TEXT NOT NULL,
              PRIMARY KEY(inference_id,evidence_id)
            );
            INSERT INTO task_attempts VALUES(
              'att_legacy','stu-legacy','task-legacy',NULL,1,1
            );
            INSERT INTO inferences VALUES(
              'inf_legacy','stu-legacy','task','task-legacy',NULL,1
            );
            INSERT INTO evidence_items VALUES(
              'ev_legacy','att_legacy','task','project_version',NULL,NULL,
              'missing','历史原件缺失','legacy-consent/v1','legacy',1
            );
            INSERT INTO inference_evidence VALUES('inf_legacy','ev_legacy','support');
            """
        )
    finally:
        legacy_conn.close()

    monkeypatch.setattr(store, "DB_PATH", legacy_db)
    E.init()
    migrated_conn = store._conn()
    try:
        with migrated_conn as c:
            assert ("attempt_id", "task_attempts", "attempt_id", "CASCADE") in \
                E._foreign_key_contract(c, "evidence_items")
            assert {
                ("inference_id", "inferences", "inference_id", "CASCADE"),
                ("evidence_id", "evidence_items", "evidence_id", "RESTRICT"),
            } <= E._foreign_key_contract(c, "inference_evidence")
            assert c.execute(
                "SELECT relation FROM inference_evidence WHERE inference_id='inf_legacy'"
            ).fetchone()[0] == "support"
            assert c.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        migrated_conn.close()
    monkeypatch.setattr(store, "DB_PATH", original_db)


def test_foreign_key_migration_fails_closed_without_dropping_orphans():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    try:
        c.executescript(
            """
            CREATE TABLE task_attempts(attempt_id TEXT PRIMARY KEY);
            CREATE TABLE inferences(inference_id TEXT PRIMARY KEY);
            CREATE TABLE evidence_items(
              evidence_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, scope TEXT,
              source_type TEXT, source_id INTEGER, source_version TEXT,
              quality_status TEXT, missing_reason TEXT, consent_basis TEXT,
              created_by TEXT, created_at INTEGER
            );
            CREATE TABLE inference_evidence(
              inference_id TEXT, evidence_id TEXT, relation TEXT,
              PRIMARY KEY(inference_id,evidence_id)
            );
            INSERT INTO evidence_items VALUES(
              'ev_orphan','att_missing','task','project_version',NULL,NULL,
              'missing','保留待人工核验','legacy-consent/v1','legacy',1
            );
            """
        )
        with pytest.raises(RuntimeError, match="孤儿记录"):
            E._migrate_foreign_keys(c)
        assert c.execute(
            "SELECT attempt_id FROM evidence_items WHERE evidence_id='ev_orphan'"
        ).fetchone()[0] == "att_missing"
        assert c.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
            "AND name LIKE '%legacy_fk'"
        ).fetchone()[0] == 0
    finally:
        c.close()


def test_attempt_rbac_enum_and_missing_reason_contract(client):
    owner, attempt = _attempt(client, "ev-rbac-owner", "task-rbac")
    other = _login(client, "student", "ev-rbac-other")
    assert attempt["attempt_id"].startswith("att_")
    assert client.get(
        f"/api/evidence/attempts/{attempt['attempt_id']}?scope=task", headers=other
    ).status_code == 403
    assert client.get(
        f"/api/evidence/attempts/{attempt['attempt_id']}", headers=owner
    ).status_code == 422, "证据查询必须显式选择 task 或 unit，不能混合返回"
    invalid = client.post(
        "/api/evidence/attempts",
        json={"task_id": "bad", "language": "python", "stage": "jump-to-answer"},
        headers=owner,
    )
    assert invalid.status_code == 422
    no_reason = _attach(
        client, owner, attempt["attempt_id"], "project_version", None,
        quality="missing",
    )
    assert no_reason.status_code == 400
    missing = _attach(
        client, owner, attempt["attempt_id"], "project_version", None,
        quality="missing", missing_reason="学生尚未保存代码版本",
    )
    assert missing.status_code == 200, missing.text
    body = missing.json()
    assert body["evidence_id"].startswith("ev_")
    assert body["source"] == {"type": "project_version", "id": None, "version": None}


def test_stable_version_pointer_does_not_follow_latest_and_original_is_owner_locked(client, teacher):
    uid = "stu-ev-pointer"
    pid, v1_id = _version_source(uid)
    owner, attempt = _attempt(client, "ev-pointer", "task-pointer", pid)
    attached = _attach(client, owner, attempt["attempt_id"], "project_version", v1_id)
    assert attached.status_code == 200, attached.text
    evidence = attached.json()
    assert evidence["source"]["id"] == v1_id and evidence["source"]["version"] == "1"
    store.save_version(pid, uid, "print('version-two')", None)
    original = client.get(
        f"/api/evidence/items/{evidence['evidence_id']}/original", headers=owner
    )
    assert original.status_code == 200, original.text
    assert original.json()["integrity"] == "verified_pointer"
    assert original.json()["original"]["code"] == "print('version-one')"
    other = _login(client, "student", "ev-pointer-other")
    assert client.get(
        f"/api/evidence/items/{evidence['evidence_id']}/original", headers=other
    ).status_code == 403
    assert client.get(
        f"/api/evidence/items/{evidence['evidence_id']}/original", headers=teacher
    ).status_code == 200


def test_cited_project_cannot_be_normally_deleted_and_break_original_pointer(client):
    uid = "stu-ev-delete-guard"
    pid, version_id = _version_source(uid, "已成为证据的作品")
    owner, attempt = _attempt(client, "ev-delete-guard", "task-delete-guard", pid)
    evidence = _attach(
        client, owner, attempt["attempt_id"], "project_version", version_id
    ).json()

    blocked = client.delete(f"/api/projects/{pid}", headers=owner)
    assert blocked.status_code == 409 and "学习证据" in blocked.text
    original = client.get(
        f"/api/evidence/items/{evidence['evidence_id']}/original", headers=owner
    )
    assert original.status_code == 200
    assert original.json()["integrity"] == "verified_pointer"


def test_source_ownership_and_scope_mismatch_are_rejected(client, teacher):
    owner, attempt = _attempt(client, "ev-scope", "task-scope")
    foreign_pid, foreign_vid = _version_source("stu-someone-else", "他人作品")
    foreign_create = client.post(
        "/api/evidence/attempts",
        json={"task_id": "task-foreign", "project_id": foreign_pid, "language": "python"},
        headers=owner,
    )
    assert foreign_create.status_code == 400 and "不属于" in foreign_create.text
    foreign_patch = client.patch(
        f"/api/evidence/attempts/{attempt['attempt_id']}",
        json={"project_id": foreign_pid}, headers=owner,
    )
    assert foreign_patch.status_code == 400 and "不属于" in foreign_patch.text
    bad = _attach(client, owner, attempt["attempt_id"], "project_version", foreign_vid)
    assert bad.status_code == 400 and "不属于" in bad.text
    own_pid, own_vid = _version_source("stu-ev-scope", "本人作品")
    patched = client.patch(
        f"/api/evidence/attempts/{attempt['attempt_id']}",
        json={"project_id": own_pid}, headers=owner,
    )
    assert patched.status_code == 200
    unit_ev = _attach(
        client, owner, attempt["attempt_id"], "project_version", own_vid, scope="unit"
    )
    assert unit_ev.status_code == 200, unit_ev.text
    mismatch = client.post(
        "/api/evidence/inferences",
        json={"scope": "task", "construct": "algorithm", "level": "developing",
              "claim": "能形成基本步骤", "confidence": 0.7, "rule_version": "rubric/v1",
              "support_evidence_ids": [unit_ev.json()["evidence_id"]],
              "status": "teacher_confirmed"},
        headers=teacher,
    )
    assert mismatch.status_code == 400 and "scope" in mismatch.text


def test_design_artifact_pointer_has_fixed_source_version(client):
    uid = "stu-ev-design"
    pid = store.create_project(uid, "设计证据", "python")["id"]
    store.save_design(pid, uid, "pseudocode", "输入 n；输出 n+1")
    with store._conn() as c:
        artifact_id = c.execute(
            "SELECT id FROM design_artifacts WHERE project_id=? ORDER BY id DESC LIMIT 1", (pid,)
        ).fetchone()[0]
    owner, attempt = _attempt(client, "ev-design", "task-design", pid)
    attached = _attach(
        client, owner, attempt["attempt_id"], "design_artifact", artifact_id
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["source"] == {
        "type": "design_artifact", "id": artifact_id, "version": "1"
    }


def test_ct_event_only_cannot_form_or_mutate_ability_inference(client, teacher):
    uid = "stu-ev-redline"
    pid, version_id = _version_source(uid)
    owner, attempt = _attempt(client, "ev-redline", "task-redline", pid)
    store.add_ct_event(uid, "error", "一次错误", pid)
    with store._conn() as c:
        event_id = c.execute(
            "SELECT id FROM ct_events WHERE user_id=? ORDER BY id DESC LIMIT 1", (uid,)
        ).fetchone()[0]
    event_ev = _attach(client, owner, attempt["attempt_id"], "ct_event", event_id)
    assert event_ev.status_code == 200, event_ev.text
    rejected = client.post(
        "/api/evidence/inferences",
        json={"scope": "task", "construct": "verify", "level": "developing",
              "claim": "能够调试", "confidence": 0.8, "rule_version": "rubric/v1",
              "support_evidence_ids": [event_ev.json()["evidence_id"]],
              "status": "teacher_confirmed"}, headers=teacher,
    )
    assert rejected.status_code == 400 and "行为次数不能" in rejected.text
    version_ev = _attach(client, owner, attempt["attempt_id"], "project_version", version_id)
    created = client.post(
        "/api/evidence/inferences",
        json={"scope": "task", "construct": "algorithm", "level": "developing",
              "claim": "作品呈现可执行步骤", "confidence": 0.76,
              "rule_version": "rubric/v1",
              "support_evidence_ids": [version_ev.json()["evidence_id"]],
              "conflict_evidence_ids": [event_ev.json()["evidence_id"]],
              "status": "teacher_confirmed"}, headers=teacher,
    )
    assert created.status_code == 200, created.text
    before = E.profile_levels(uid, "task", "task-redline")
    assert before["status"] == "evidence_backed"
    assert before["levels"] == {"algorithm": "developing"}
    assert before["evidence_count"] == 2
    for _ in range(12):
        store.add_ct_event(uid, "run", "刷运行次数", pid)
    after = E.profile_levels(uid, "task", "task-redline")
    assert after == before
    assert E.profile_levels(uid, "task", None)["status"] == "insufficient_evidence"

    withdrawn = client.post(
        "/api/evidence/inferences",
        json={"scope": "task", "construct": "algorithm", "level": "developing",
              "claim": "该判断已由教师撤回", "confidence": 0.0,
              "rule_version": "rubric/v1",
              "support_evidence_ids": [version_ev.json()["evidence_id"]],
              "status": "withdrawn"}, headers=teacher,
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert E.profile_levels(uid, "task", "task-redline")["status"] == "insufficient_evidence"
    assert client.get("/api/evidence/profile", headers=owner).status_code == 422


def test_researcher_original_requires_active_guardian_consent(client, teacher):
    uid = "stu-ev-consent"
    pid, version_id = _version_source(uid)
    owner, attempt = _attempt(client, "ev-consent", "task-consent", pid)
    evidence = _attach(
        client, owner, attempt["attempt_id"], "project_version", version_id
    ).json()
    path = f"/api/evidence/items/{evidence['evidence_id']}/original"
    assert client.get(path, headers=_researcher()).status_code == 403
    granted = client.post(
        "/api/teacher/consent",
        json={"student_id": uid, "guardian": "监护人"}, headers=teacher,
    )
    assert granted.status_code == 200, granted.text
    assert client.get(path, headers=_researcher()).status_code == 200


def test_erasure_registry_covers_direct_and_indirect_evidence_tables():
    assert {"task_attempts", "inferences"} <= set(ER.ERASURE_MAP)
    cascades = {table for table, _sql in ER.CASCADE_SQL}
    assert {"evidence_items", "inference_evidence"} <= cascades


def test_erasure_removes_attempt_evidence_inference_and_links(client, teacher):
    uid = "stu-ev-erase"
    pid, version_id = _version_source(uid, "待删除证据作品")
    owner, attempt = _attempt(client, "ev-erase", "task-erase", pid)
    evidence = _attach(
        client, owner, attempt["attempt_id"], "project_version", version_id
    ).json()
    inference = client.post(
        "/api/evidence/inferences",
        json={"scope": "task", "construct": "algorithm", "level": "L2",
              "claim": "删除测试用暂定判断", "confidence": 0.6,
              "rule_version": "rubric/v1",
              "support_evidence_ids": [evidence["evidence_id"]],
              "status": "teacher_confirmed"}, headers=teacher,
    ).json()

    exported = ER.subject_export(uid)["data"]
    assert exported["task_attempts"] and exported["evidence_items"]
    assert exported["inferences"] and exported["inference_evidence"]
    response = client.delete(f"/api/teacher/data/{uid}", headers=teacher)
    assert response.status_code == 200, response.text
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM task_attempts WHERE student_id=?", (uid,)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM evidence_items WHERE evidence_id=?", (evidence["evidence_id"],)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM inferences WHERE inference_id=?", (inference["inference_id"],)).fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM inference_evidence WHERE inference_id=?", (inference["inference_id"],)).fetchone()[0] == 0
