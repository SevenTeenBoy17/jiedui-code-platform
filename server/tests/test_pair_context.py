"""M1a: actual API + isolated SQLite, never live student data or model calls."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from threading import Barrier
import json
import hashlib
import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

from app import store, store_resources as R, store_evidence as E
from app.main import app


def login(client, role, name):
    response = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


@pytest.fixture(autouse=True)
def no_model_calls():
    import test_support
    before = test_support.bootstrap().model_calls.copy()
    yield
    assert test_support.bootstrap().model_calls == before, "Metadata operations must not call a model"


@pytest.fixture
def ctx(client, monkeypatch):
    monkeypatch.setenv("PAIR_SESSION_RETENTION_SECONDS", "3600")
    monkeypatch.setenv("PAIR_SESSION_RETENTION_POLICY_ID", "synthetic-classroom-policy/v1")
    name = "m1a-" + uuid.uuid4().hex
    uid, tid = "stu-" + name, "tea-" + name
    student = login(client, "student", name)
    teacher = login(client, "teacher", name)
    cid = R.create_class(tid, {"name": "合成班级"})
    R.set_class_students(cid, [uid])
    eid = R.create_exercise(tid, {
        "title": "循环画正方形", "statement": "画出四条等长边", "language": "python",
        "status": "published", "starter_code": "# start", "reference_solution": "SECRET-ANSWER",
        "test_cases": [{"input": "HIDDEN-INPUT", "expected": "HIDDEN-OUTPUT"}],
    })
    pid = R.create_push(tid, "exercise", eid, [uid])
    project = store.create_project(uid, "合成作品", "python")
    aid = E.create_attempt(uid, f"exercise:{eid}", None, project["id"], "python")["attempt_id"]
    store.grant_consent(uid, "合成授权", tid)
    return {"uid": uid, "tid": tid, "student": student, "teacher": teacher,
            "class_id": cid, "exercise_id": eid, "project_id": project["id"],
            "body": {"class_id": cid, "push_id": pid, "attempt_id": aid,
                     "human_role": "driver", "request_id": uuid.uuid4().hex}}


def create(client, ctx, body=None):
    result = client.post("/api/pair/sessions", headers=ctx["teacher"], json=body or ctx["body"])
    assert result.status_code == 201, result.text
    return result.json()


def counts():
    with store._conn() as c:
        return tuple(c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                     for table in ("pair_sessions", "pair_rounds"))


def test_real_creation_contract_and_no_model_call(client, ctx):
    import test_support
    before = test_support.bootstrap().model_calls.copy()
    session = create(client, ctx)
    assert session["mode"] == "student_ai" and session["scope"] == "task"
    assert session["student_id"] == ctx["uid"]
    assert session["human_role"] == "driver"
    assert session["role_evidence"] == "teacher_assigned_not_observed"
    assert session["task_version_status"] == "session_snapshot_only"
    assert session["original_push_version"] is None
    assert session["policy"]["enforcement_status"] == "not_connected"
    assert session["policy"]["assigned_condition"] is None
    assert session["policy"]["research_batch"] is None
    assert len(session["task_snapshot_hash"]) == 64
    assert set(session["task_snapshot"]) == {"title", "summary", "statement", "language", "starter_code"}
    canonical = json.dumps(session["task_snapshot"], ensure_ascii=False, sort_keys=True).encode()
    assert session["task_snapshot_hash"] == hashlib.sha256(canonical).hexdigest()
    assert session["expires_at"] > session["created_at"]
    assert len(session["rounds"]) == 1 and session["rounds"][0]["round_index"] == 1
    assert "SECRET" not in json.dumps(session) and "HIDDEN" not in json.dumps(session)
    assert test_support.bootstrap().model_calls == before
    assert client.get(f'/api/pair/sessions/{session["session_id"]}', headers=ctx["student"]).json() == session


@pytest.mark.parametrize("extra", [
    {"purpose": "research"}, {"room": "fake"}, {"student_id": "stu-other"},
    {"ai_condition": "none"}, {"policy": "full-answer"}, {"human_role": "observer"},
    {"retain_until": 9999999999}, {"class_id": True}, {"request_id": " "},
])
def test_client_cannot_assign_trusted_fields(client, ctx, extra):
    before = counts()
    response = client.post("/api/pair/sessions", headers=ctx["teacher"], json={**ctx["body"], **extra})
    assert response.status_code == 422, response.text
    assert counts() == before


def test_retention_requires_deployment_configuration(client, ctx, monkeypatch):
    monkeypatch.delenv("PAIR_SESSION_RETENTION_SECONDS")
    before = counts()
    r = client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"])
    assert r.status_code == 503 and counts() == before


@pytest.mark.parametrize("bad", ["0", "-1", "abc", "9" * 30])
def test_invalid_retention_fails_closed(client, ctx, monkeypatch, bad):
    monkeypatch.setenv("PAIR_SESSION_RETENTION_SECONDS", bad)
    before = counts()
    assert client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"]).status_code == 503
    assert counts() == before


@pytest.mark.parametrize("change", ["class", "push", "target", "task", "project", "consent", "draft", "language"])
def test_source_validation_atomic(client, ctx, change):
    with store._conn() as c:
        if change == "class":
            c.execute("UPDATE classes SET created_by='tea-other' WHERE id=?", (ctx["class_id"],))
        elif change == "push":
            c.execute("UPDATE pushes SET created_by='tea-other' WHERE id=?", (ctx["body"]["push_id"],))
        elif change == "target":
            c.execute("DELETE FROM push_targets WHERE push_id=?", (ctx["body"]["push_id"],))
        elif change == "task":
            c.execute("UPDATE task_attempts SET task_id='fake' WHERE attempt_id=?", (ctx["body"]["attempt_id"],))
        elif change == "project":
            c.execute("UPDATE projects SET owner_id='stu-other' WHERE id=?", (ctx["project_id"],))
        elif change == "consent":
            c.execute("DELETE FROM guardian_consents WHERE user_id=?", (ctx["uid"],))
        elif change == "draft":
            c.execute("UPDATE exercises SET status='draft' WHERE id=?", (ctx["exercise_id"],))
        else:
            c.execute("UPDATE exercises SET language='cpp' WHERE id=?", (ctx["exercise_id"],))
    before = counts()
    assert client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"]).status_code in (403, 409)
    assert counts() == before


def test_scope_is_checked_on_every_operation(client, ctx):
    session = create(client, ctx)
    url = f'/api/pair/sessions/{session["session_id"]}'
    for headers in [login(client, "student", "m1a-outsider"), login(client, "teacher", "m1a-outsider")]:
        assert client.get(url, headers=headers).status_code == 404
        assert client.post(url + "/close", headers=headers).status_code == 404
        assert client.post(url + "/rounds", headers=headers, json={"request_id": "bad"}).status_code == 404
        assert client.post(f'{url}/rounds/{session["rounds"][0]["round_id"]}/close', headers=headers).status_code == 404
    assert client.get(url, headers=ctx["student"]).json() == session
    assert client.post("/api/pair/sessions", headers=ctx["student"], json=ctx["body"]).status_code == 403
    R.set_class_students(ctx["class_id"], [])
    assert client.get(url, headers=ctx["teacher"]).status_code == 403
    assert client.get(url, headers=ctx["student"]).status_code == 403


def test_frozen_snapshot_and_untrusted_ai_condition(client, ctx):
    original = create(client, ctx)
    with store._conn() as c:
        c.execute("UPDATE exercises SET title='新题目', statement='新要求' WHERE id=?", (ctx["exercise_id"],))
    E.update_attempt(ctx["body"]["attempt_id"], {"ai_condition": "none"})
    current = client.get(f'/api/pair/sessions/{original["session_id"]}', headers=ctx["student"]).json()
    assert current["task_snapshot"] == original["task_snapshot"]
    assert current["task_snapshot_hash"] == original["task_snapshot_hash"]
    assert current["policy"]["assigned_condition"] is None
    other = E.create_attempt(ctx["uid"], f'exercise:{ctx["exercise_id"]}', None, ctx["project_id"], "python")
    new = create(client, ctx, {**ctx["body"], "attempt_id": other["attempt_id"], "request_id": "fresh"})
    assert new["task_snapshot"]["title"] == "新题目"
    assert new["rounds"][0]["round_id"] != original["rounds"][0]["round_id"]


@pytest.mark.parametrize("change", ["rebind", "delete"])
def test_rebinding_or_project_deletion_invalidates_context(client, ctx, change):
    session = create(client, ctx)
    if change == "rebind":
        E.update_attempt(ctx["body"]["attempt_id"], {"project_id": None})
    else:
        with store._conn() as c:
            c.execute("DELETE FROM projects WHERE id=?", (ctx["project_id"],))
    assert client.get(f'/api/pair/sessions/{session["session_id"]}', headers=ctx["student"]).status_code == 409


def test_idempotency_rounds_and_close(client, ctx):
    first = create(client, ctx)
    assert create(client, ctx) == first
    collision = {**ctx["body"], "human_role": "navigator"}
    assert client.post("/api/pair/sessions", headers=ctx["teacher"], json=collision).status_code == 409
    assert client.post("/api/pair/sessions", headers=ctx["teacher"], json={**ctx["body"], "request_id": "other"}).status_code == 409
    url = f'/api/pair/sessions/{first["session_id"]}'
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "r2"}).status_code == 409
    rid = first["rounds"][0]["round_id"]
    close_url = f"{url}/rounds/{rid}/close"
    closed = client.post(close_url, headers=ctx["student"])
    assert closed.status_code == 200
    assert client.post(close_url, headers=ctx["student"]).json() == closed.json()
    second = client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "r2"})
    assert second.status_code == 201
    assert second.json()["round_index"] == 2 and second.json()["round_id"] != rid
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "r2"}).json() == second.json()
    final = client.post(url + "/close", headers=ctx["teacher"])
    assert final.status_code == 200 and final.json()["status"] == "closed"
    assert all(r["ended_at"] for r in final.json()["rounds"])
    assert client.post(url + "/close", headers=ctx["student"]).json() == final.json()
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "r3"}).status_code == 409


def test_completed_attempt_can_close_existing_round_but_not_start_new_one(client, ctx):
    session = create(client, ctx)
    url = f'/api/pair/sessions/{session["session_id"]}'
    E.update_attempt(ctx["body"]["attempt_id"], {"status": "completed"})
    assert client.post(f'{url}/rounds/{session["rounds"][0]["round_id"]}/close', headers=ctx["student"]).status_code == 200
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "after-complete"}).status_code == 409
    assert client.post(url + "/close", headers=ctx["student"]).status_code == 200


def test_withdraw_regrant_does_not_revive_and_erasure_covers_children(client, ctx, monkeypatch):
    from app import store_erasure as erasure
    session = create(client, ctx)
    monkeypatch.setattr(store, "_now", lambda: session["created_at"])
    url = f'/api/pair/sessions/{session["session_id"]}'
    assert erasure.subject_export(ctx["uid"])["data"]["pair_rounds"]
    assert erasure.subject_export("stu-unrelated")["data"]["pair_sessions"] == []
    assert client.delete("/api/consent", headers=ctx["student"]).status_code == 200
    store.grant_consent(ctx["uid"], "再次授权", ctx["tid"])
    with store._conn() as c:
        assert c.execute("SELECT consent_at FROM guardian_consents WHERE user_id=?", (ctx["uid"],)).fetchone()[0] == session["created_at"]
    assert client.get(url, headers=ctx["student"]).status_code == 403
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "revived"}).status_code == 403
    assert client.post(f'{url}/rounds/{session["rounds"][0]["round_id"]}/close', headers=ctx["student"]).status_code == 403
    assert client.post(url + "/close", headers=ctx["teacher"]).status_code == 403
    with store._conn() as c:
        assert c.execute("SELECT status FROM pair_sessions WHERE session_id=?", (session["session_id"],)).fetchone()[0] == "revoked"
        assert c.execute("SELECT ended_at FROM pair_rounds WHERE session_id=?", (session["session_id"],)).fetchone()[0]
    deleted = erasure.erase_subject(ctx["uid"])["deleted"]
    assert deleted["pair_sessions"] == 1 and deleted["pair_rounds"] == 1
    assert client.get(url, headers=ctx["student"]).status_code == 404
    with store._conn() as c:
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []


def test_expiry_denies_access_and_purges_only_new_context(client, ctx, monkeypatch):
    session = create(client, ctx)
    monkeypatch.setattr(store, "_now", lambda: session["expires_at"])
    assert client.get(f'/api/pair/sessions/{session["session_id"]}', headers=ctx["student"]).status_code == 404
    assert E.get_attempt(ctx["body"]["attempt_id"]) is not None
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM pair_rounds WHERE session_id=?", (session["session_id"],)).fetchone()[0] == 0


def test_real_concurrent_creation_uses_database_uniqueness(client, ctx):
    barrier = Barrier(2)
    def send():
        with TestClient(app) as concurrent_client:
            barrier.wait(timeout=10)
            response = concurrent_client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"])
            return response.status_code, response.json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        outputs = list(pool.map(lambda _: send(), range(2)))
    assert [status for status, _ in outputs] == [201, 201]
    assert outputs[0][1]["session_id"] == outputs[1][1]["session_id"]
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM pair_sessions WHERE attempt_id=?", (ctx["body"]["attempt_id"],)).fetchone()[0] == 1


def test_insert_failure_rolls_back_whole_session(client, ctx):
    before = counts()
    with store._conn() as c:
        c.execute("CREATE TRIGGER m1a_fail BEFORE INSERT ON pair_rounds BEGIN SELECT RAISE(ABORT, 'synthetic fault'); END")
    try:
        with TestClient(app, raise_server_exceptions=False) as fault_client:
            response = fault_client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"])
        assert response.status_code == 500
        assert counts() == before
    finally:
        with store._conn() as c:
            c.execute("DROP TRIGGER m1a_fail")
    assert create(client, ctx)["status"] == "active"


def test_migration_idempotent_and_preserves_legacy_data():
    from app import store_pair_sessions as P
    with sqlite3.connect(":memory:") as c:
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("CREATE TABLE task_attempts(attempt_id TEXT PRIMARY KEY)")
        c.execute("INSERT INTO task_attempts VALUES ('old-attempt')")
        P.init_tables(c)
        P.init_tables(c)
        assert c.execute("SELECT * FROM task_attempts").fetchall() == [("old-attempt",)]
        assert c.execute("PRAGMA foreign_key_check").fetchall() == []
        assert c.execute("SELECT COUNT(*) FROM pair_sessions").fetchone()[0] == 0


def active_study(class_ids):
    with store._conn() as c:
        return c.execute("INSERT INTO studies(title,phase,exp_class_ids,created_by) VALUES(?,?,?,?)",
                         ("合成研究", "pretest", json.dumps(class_ids), "tea-research-fixture")).lastrowid


@pytest.mark.parametrize("already_created", [False, True])
def test_other_class_research_membership_cannot_bypass_gate(client, ctx, already_created):
    session = create(client, ctx) if already_created else None
    other_class = R.create_class(ctx["tid"], {"name": "合成研究班"})
    R.set_class_students(other_class, [ctx["uid"]])
    study_id = active_study([other_class])
    before = counts()
    try:
        if session:
            response = client.get(f'/api/pair/sessions/{session["session_id"]}', headers=ctx["student"])
            url = f'/api/pair/sessions/{session["session_id"]}'
            assert client.post(url + "/close", headers=ctx["student"]).status_code == 409
            assert client.post(f'{url}/rounds/{session["rounds"][0]["round_id"]}/close', headers=ctx["student"]).status_code == 409
            assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "bypass"}).status_code == 409
        else:
            response = client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"])
        assert response.status_code == 409, response.text
        assert counts() == before
    finally:
        with store._conn() as c:
            c.execute("UPDATE studies SET phase='closed' WHERE id=?", (study_id,))


@pytest.mark.parametrize("source", ["selected_class", "frozen_member", "malformed"])
@pytest.mark.parametrize("phase", ["pretest", "running", "posttest"])
def test_research_state_is_authoritative_and_unknown_state_blocks(client, ctx, source, phase):
    study_id = active_study([ctx["class_id"]] if source == "selected_class" else [])
    with store._conn() as c:
        c.execute("UPDATE studies SET phase=? WHERE id=?", (phase, study_id))
        if source == "frozen_member":
            c.execute("INSERT INTO study_members(study_id,student_id,group_kind,cluster_class_id) VALUES(?,?,?,?)",
                      (study_id, ctx["uid"], "exp", ctx["class_id"]))
        if source == "malformed":
            c.execute("UPDATE studies SET exp_class_ids='invalid-json' WHERE id=?", (study_id,))
    before = counts()
    try:
        assert client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"]).status_code == 409
        assert counts() == before
    finally:
        with store._conn() as c:
            c.execute("UPDATE studies SET phase='closed' WHERE id=?", (study_id,))


def test_database_writers_without_process_mutex(client, ctx, monkeypatch):
    # Remove only the optional Python mutex. Production SQLite BEGIN IMMEDIATE,
    # source validation and unique indexes are unchanged; separate API connections.
    monkeypatch.setattr(store, "_lock", nullcontext())
    barrier = Barrier(2)
    def send():
        with TestClient(app) as concurrent_client:
            barrier.wait(timeout=10)
            r = concurrent_client.post("/api/pair/sessions", headers=ctx["teacher"], json=ctx["body"])
            return r.status_code, r.json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: send(), range(2)))
    assert [s for s, _ in responses] == [201, 201]
    assert responses[0][1]["session_id"] == responses[1][1]["session_id"]
    assert responses[0][1]["rounds"] == responses[1][1]["rounds"]


def test_competing_next_round_and_close_are_serializable(client, ctx, monkeypatch):
    session = create(client, ctx)
    url = f'/api/pair/sessions/{session["session_id"]}'
    rid = session["rounds"][0]["round_id"]
    assert client.post(f"{url}/rounds/{rid}/close", headers=ctx["student"]).status_code == 200
    monkeypatch.setattr(store, "_lock", nullcontext())
    barrier = Barrier(2)
    def send(action):
        with TestClient(app) as concurrent_client:
            barrier.wait(timeout=10)
            return concurrent_client.post(url + action, headers=ctx["student"], json={"request_id": "next"}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(send, ["/rounds", "/close"]))
    assert outcomes[0] in (201, 409) and outcomes[1] == 200
    final = client.get(url, headers=ctx["student"]).json()
    assert final["status"] == "closed" and all(r["ended_at"] for r in final["rounds"])


def test_two_new_round_requests_have_one_winner(client, ctx, monkeypatch):
    session = create(client, ctx)
    url = f'/api/pair/sessions/{session["session_id"]}'
    client.post(f'{url}/rounds/{session["rounds"][0]["round_id"]}/close', headers=ctx["student"])
    monkeypatch.setattr(store, "_lock", nullcontext())
    barrier = Barrier(2)
    def send(key):
        with TestClient(app) as concurrent_client:
            barrier.wait(timeout=10)
            return concurrent_client.post(url + "/rounds", headers=ctx["student"], json={"request_id": key}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(send, ["a", "b"]))
    assert sorted(outcomes) == [201, 409]
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM pair_rounds WHERE session_id=? AND ended_at IS NULL", (session["session_id"],)).fetchone()[0] == 1
        with pytest.raises(sqlite3.IntegrityError):
            c.execute("INSERT INTO pair_rounds(round_id,session_id,round_index,request_id,started_at) VALUES(?,?,?,?,?)",
                      (uuid.uuid4().hex, session["session_id"], 3, "illegal-second-open", store._now()))


def test_failure_during_migration_rolls_back_new_tables():
    from app import store_pair_sessions as P
    with sqlite3.connect(":memory:") as c:
        c.execute("CREATE TABLE task_attempts(attempt_id TEXT PRIMARY KEY)")
        c.execute("CREATE TABLE pair_sessions(session_id TEXT PRIMARY KEY, marker TEXT)")
        c.execute("INSERT INTO pair_sessions VALUES ('legacy','preserve')")
        with pytest.raises(sqlite3.OperationalError):
            P.init_tables(c)
        assert c.execute("SELECT * FROM pair_sessions").fetchall() == [("legacy", "preserve")]
        assert not c.execute("SELECT name FROM sqlite_master WHERE name='pair_rounds'").fetchall()


def test_expired_context_not_in_personal_export(client, ctx, monkeypatch):
    from app import store_erasure as erasure
    session = create(client, ctx)
    monkeypatch.setattr(store, "_now", lambda: session["expires_at"])
    exported = erasure.subject_export(ctx["uid"])["data"]
    assert exported["pair_sessions"] == exported["pair_rounds"] == []
    assert exported["task_attempts"]  # Do not delete pre-existing learning artifacts.


def test_no_authentication_and_cross_session_round_are_rejected(client, ctx):
    session = create(client, ctx)
    url = f'/api/pair/sessions/{session["session_id"]}'
    assert client.get(url).status_code == 401
    assert client.post(url + "/close").status_code == 401
    assert client.post(url + "/rounds/nonexistent/close", headers=ctx["student"]).status_code == 404
    attempt = E.create_attempt(ctx["uid"], f'exercise:{ctx["exercise_id"]}', None, ctx["project_id"], "python")
    other = create(client, ctx, {**ctx["body"], "attempt_id": attempt["attempt_id"], "request_id": "other-session"})
    # Same authorized student owns both sessions: only the round/session binding should reject this.
    assert client.post(f'{url}/rounds/{other["rounds"][0]["round_id"]}/close', headers=ctx["student"]).status_code == 404
    assert client.get(f'/api/pair/sessions/{other["session_id"]}', headers=ctx["student"]).json() == other
    before = counts()
    assert client.post(url + "/rounds", headers=ctx["student"], json={"request_id": "new", "round_index": 100}).status_code == 422
    assert counts() == before
