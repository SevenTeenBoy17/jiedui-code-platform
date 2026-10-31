"""Frozen-context lifecycle and disclosure through real routes/SQLite."""
import io
import json
import uuid

import pytest

from app import store, ai, store_resources as R
from app import store_erasure as ER
from test_pair_context import ctx, create, login
from test_pair_ai_context import STRICT, policy, ask
from test_assessment_ai_guard import paper, take, submit, event_counts
from pair_output_fixture import candidate, model_reply, patch_provider, provider_envelope, VERIFY_MARKER

pytestmark = pytest.mark.skipif(not STRICT, reason="separate strict startup required")


@pytest.mark.parametrize("change", ["round", "session", "consent", "project", "class", "attempt", "assessment"])
@pytest.mark.parametrize("phase", ["generation", "verifier"])
def test_inflight_invalidation_never_releases_teaching(client, ctx, monkeypatch, change, phase):
    s = create(client, ctx)
    policy(client, ctx, s)
    outcomes = []
    calls = []
    def transport(system, messages):
        stage = "verifier" if VERIFY_MARKER in system else "generation"
        calls.append(stage)
        if stage != phase:
            return model_reply(system, messages, feedback="STALE-TEACHING-REPLY")
        if change == "round":
            outcomes.append(client.post(f'/api/pair/sessions/{s["session_id"]}/rounds/{s["rounds"][0]["round_id"]}/close', headers=ctx["student"]).status_code)
        elif change == "session":
            outcomes.append(client.post(f'/api/pair/sessions/{s["session_id"]}/close', headers=ctx["teacher"]).status_code)
        elif change == "consent":
            store.withdraw_consent(ctx["uid"])
            store.grant_consent(ctx["uid"], "synthetic", ctx["tid"])
        elif change == "project":
            outcomes.append(client.delete(f'/api/projects/{ctx["project_id"]}', headers=ctx["student"]).status_code)
        elif change == "class":
            R.set_class_students(ctx["class_id"], [])
        elif change == "attempt":
            with store._conn() as c:
                c.execute("UPDATE task_attempts SET status='completed' WHERE attempt_id=?", (ctx["body"]["attempt_id"],))
        else:
            aid = paper(client, ctx["teacher"], ctx["uid"])
            outcomes.extend([take(client, ctx["student"], aid).status_code, submit(client, ctx["student"], aid).status_code])
        return model_reply(system, messages, feedback="STALE-TEACHING-REPLY")
    patch_provider(monkeypatch, transport)
    before = event_counts(ctx["uid"])
    r = ask(client, ctx, s, request_id="inflight")
    assert all(x == 200 for x in outcomes), outcomes
    assert r.status_code in (403, 404, 409, 423), r.text
    assert "STALE-TEACHING" not in r.text
    assert calls == (["generation"] if phase == "generation" else ["generation", "verifier"])
    assert event_counts(ctx["uid"]) == before
    with store._conn() as c:
        row = c.execute("SELECT status FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone()
        assert row is None or row[0] == "invalidated"


def test_new_save_does_not_replace_frozen_code(client, ctx, monkeypatch):
    store.save_version(ctx["project_id"], ctx["uid"], "size = 6", None)
    s = create(client, ctx)
    policy(client, ctx, s)
    seen = []
    def model(system, messages):
        seen.append(messages)
        if VERIFY_MARKER not in system:
            store.save_version(ctx["project_id"], ctx["uid"], "size = 99", None)
        return model_reply(system, messages)
    patch_provider(monkeypatch, model)
    r = ask(client, ctx, s)
    assert r.status_code == 200, r.text
    assert r.json()["receipt"]["version_no"] == 1
    assert "size = 6" in str(seen) and "size = 99" not in str(seen)
    assert len(seen) == 2


def test_subject_export_and_erasure_include_receipts(client, ctx, monkeypatch):
    patch_provider(monkeypatch, model_reply)
    s = create(client, ctx)
    policy(client, ctx, s)
    r = ask(client, ctx, s)
    assert r.status_code == 200, r.text
    data = ER.subject_export(ctx["uid"])["data"]
    assert len(data["pair_ai_requests"]) == 1
    assert "reply" not in data["pair_ai_requests"][0]
    result = ER.erase_subject(ctx["uid"])
    assert result["deleted"]["pair_ai_requests"] == 1
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM pair_ai_requests WHERE student_id=?", (ctx["uid"],)).fetchone()[0] == 0


def test_cross_actor_version_and_round_rejected_before_model(client, ctx, monkeypatch):
    s = create(client, ctx)
    policy(client, ctx, s)
    calls = []
    patch_provider(monkeypatch, lambda *a: calls.append(1) or "response")
    other = login(client, "student", "foreign-" + uuid.uuid4().hex)
    url = f'/api/pair/sessions/{s["session_id"]}/rounds/{s["rounds"][0]["round_id"]}/chat'
    body = {"message": "测试", "persona": "review", "request_id": "foreign"}
    assert client.post(url, headers=other, json=body).status_code == 404
    assert client.post(url, headers=ctx["teacher"], json=body).status_code == 403
    assert ask(client, ctx, s, project_version_id=9223372036854775807).status_code == 409
    assert not calls


@pytest.mark.parametrize("persona", ["guide", "review"])
@pytest.mark.parametrize("socratic", [False, True])
@pytest.mark.parametrize("scaffold", [0, 1, 2, 3])
@pytest.mark.parametrize("model_success", [False, True])
def test_policy_combinations_drive_actual_packet_and_fallback(client, ctx, monkeypatch, persona, socratic, scaffold, model_success):
    s = create(client, ctx)
    policy(client, ctx, s, scaffold, socratic)
    packets = []
    def transport(request, *a, **kw):
        packet = json.loads(request.data)
        packets.append(packet)
        return io.BytesIO(json.dumps(provider_envelope(model_reply(packet["system"], packet["messages"]) if model_success else None)).encode())
    monkeypatch.setattr(ai.urllib.request, "urlopen", transport)
    r = ask(client, ctx, s, persona=persona)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["source"] == ("model" if model_success else "fallback")
    assert len(packets) == (2 if model_success else 1)
    if model_success:
        assert VERIFY_MARKER in packets[1]["system"]
    applied = socratic or persona == "review"
    assert v["receipt"]["scaffold_applied"] is applied
    assert v["receipt"]["assigned_scaffold"] == scaffold
    assert v["receipt"]["effective_role"] == ("review" if applied else "guide")
    assert ("支架强度" in packets[0]["system"]) is applied
    assert ("强制苏格拉底" in packets[0]["system"]) is socratic
    for level, segment in ai.SCAFFOLD.items():
        assert (segment in packets[0]["system"]) is (applied and level == scaffold)
    if socratic:
        assert packets[0]["system"].index(ai.SOCRATIC_OVERRIDE) > packets[0]["system"].index(ai.SCAFFOLD[scaffold])
    elif applied and scaffold >= 2:
        assert "只审查与提问" not in packets[0]["system"]
    assert "由你握键盘" not in packets[0]["system"]
    assert "```" not in v["reply"]
    assert v["reply"].count("？") <= 2


def test_pending_status_and_terminal_cannot_be_overwritten(client, ctx, monkeypatch):
    patch_provider(monkeypatch, model_reply)
    s = create(client, ctx)
    policy(client, ctx, s)
    r = ask(client, ctx, s, request_id="persisted")
    assert r.status_code == 200, r.text
    url = f'/api/pair/sessions/{s["session_id"]}/ai-requests/persisted'
    read = client.get(url, headers=ctx["student"])
    assert read.json()["status"] == "released"
    assert "reply" not in read.json()
    assert ask(client, ctx, s, request_id="persisted").status_code == 409
    assert client.get(url, headers=ctx["student"]).json() == read.json()


def test_concurrent_same_request_is_never_sent_twice(client, ctx, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    entered, release = Event(), Event()
    s = create(client, ctx)
    policy(client, ctx, s)
    calls = []
    def model(system, messages):
        calls.append("verifier" if VERIFY_MARKER in system else "generation")
        if VERIFY_MARKER not in system:
            entered.set()
            if not release.wait(5):
                return None
        return model_reply(system, messages)
    patch_provider(monkeypatch, model)
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(ask, client, ctx, s, request_id="simultaneous")
        try:
            assert entered.wait(3)
            second = ask(client, ctx, s, request_id="simultaneous")
            assert second.status_code == 409, second.text
            assert second.json()["detail"]["receipt"]["status"] == "pending"
        finally:
            release.set()
        assert future.result(timeout=5).status_code == 200
    assert calls == ["generation", "verifier"]


@pytest.mark.parametrize("failure", ["commit", "receipt-write", "parent-delete", "expiry", "policy", "version"])
@pytest.mark.parametrize("phase", ["generation", "verifier"])
def test_reply_not_released_when_audit_or_frozen_source_fails(client, ctx, monkeypatch, failure, phase):
    import sqlite3
    from contextlib import contextmanager
    from app import store_pair_sessions as P
    store.save_version(ctx["project_id"], ctx["uid"], "side = 5", None)
    s = create(client, ctx)
    policy(client, ctx, s)
    transaction = P._transaction
    @contextmanager
    def broken_commit():
        with transaction() as c:
            yield c
            raise sqlite3.OperationalError("synthetic commit failure")
    calls = []
    def model(system, messages):
        stage = "verifier" if VERIFY_MARKER in system else "generation"
        calls.append(stage)
        if stage != phase:
            return model_reply(system, messages, feedback="DO-NOT-RELEASE")
        if failure == "commit":
            monkeypatch.setattr(P, "_transaction", broken_commit)
        else:
            with store._conn() as c:
                if failure == "receipt-write":
                    c.execute("CREATE TRIGGER reject_receipt BEFORE UPDATE ON pair_ai_requests BEGIN SELECT RAISE(ABORT,'synthetic'); END")
                elif failure == "parent-delete":
                    c.execute("DELETE FROM pair_sessions WHERE session_id=?", (s["session_id"],))
                elif failure == "expiry":
                    c.execute("UPDATE pair_sessions SET created_at=1,expires_at=2 WHERE session_id=?", (s["session_id"],))
                elif failure == "policy":
                    c.execute("UPDATE pair_sessions SET ai_policy_json=NULL WHERE session_id=?", (s["session_id"],))
                else:
                    c.execute("DELETE FROM project_versions WHERE project_id=?", (ctx["project_id"],))
        return model_reply(system, messages, feedback="DO-NOT-RELEASE")
    patch_provider(monkeypatch, model)
    try:
        r = ask(client, ctx, s, request_id="fault")
        assert r.status_code in (409, 410, 503), r.text
        assert "DO-NOT-RELEASE" not in r.text
        # An UPDATE trigger is observed only at terminal write, not at read-only
        # context checkpoints. It must block release, not predict a future write.
        expected = ["generation", "verifier"] if phase == "verifier" or failure == "receipt-write" else ["generation"]
        assert calls == expected
        with store._conn() as c:
            row = c.execute("SELECT status FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone()
            assert row is None or row[0] in ("pending", "invalidated")
    finally:
        with store._conn() as c:
            c.execute("DROP TRIGGER IF EXISTS reject_receipt")


def test_expiry_cascades_receipt_and_partial_schema_erasure(client, ctx, monkeypatch):
    patch_provider(monkeypatch, model_reply)
    from app import store_pair_sessions as P
    s = create(client, ctx)
    policy(client, ctx, s)
    assert ask(client, ctx, s).status_code == 200
    with store._conn() as c:
        c.execute("UPDATE pair_sessions SET created_at=1,expires_at=2 WHERE session_id=?", (s["session_id"],))
    P.purge_expired()
    with store._conn() as c:
        assert c.execute("SELECT COUNT(*) FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone()[0] == 0
        c.execute("DROP TABLE pair_ai_requests")
    try:
        assert ER.subject_export(ctx["uid"])["data"]["pair_ai_requests"] == []
        assert ER.erase_subject(ctx["uid"])["deleted"]["pair_ai_requests"] == 0
    finally:
        P.init_tables()


@pytest.mark.parametrize("change", ["close", "raise"])
def test_fallback_preparation_precedes_final_release(client, ctx, monkeypatch, change):
    from app import pair_ai_context as C
    s = create(client, ctx)
    policy(client, ctx, s)
    patch_provider(monkeypatch, lambda *a: None)
    def fallback(context):
        if change == "raise":
            raise ValueError("synthetic response preparation failure")
        client.post(f'/api/pair/sessions/{s["session_id"]}/close', headers=ctx["teacher"])
        return "DO-NOT-RELEASE"
    monkeypatch.setattr(C, "fallback", fallback)
    r = ask(client, ctx, s)
    assert r.status_code in (409, 503), r.text
    assert "DO-NOT-RELEASE" not in r.text
    with store._conn() as c:
        row = c.execute("SELECT status FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone()
        assert row[0] != "released"


@pytest.mark.parametrize("source", ["model", "fallback", "guard"])
def test_strict_does_not_write_legacy_teaching_records(client, ctx, monkeypatch, source):
    s = create(client, ctx)
    policy(client, ctx, s)
    calls = []
    patch_provider(monkeypatch, lambda *a: calls.append(1) or (model_reply(*a) if source == "model" else None))
    before = event_counts(ctx["uid"])
    r = ask(client, ctx, s, message="我想自杀" if source == "guard" else "怎样检查边界")
    assert r.status_code == 200, r.text
    assert r.json()["source"] == source
    assert event_counts(ctx["uid"]) == before
    assert len(calls) == {"guard": 0, "fallback": 1, "model": 2}[source]


def test_pending_survives_new_reader_without_replaying(client, ctx, monkeypatch):
    from app import pair_ai_context as C
    import jwt
    from app.auth import SECRET
    s = create(client, ctx)
    policy(client, ctx, s)
    actor = jwt.decode(ctx["student"]["Authorization"][7:], SECRET, algorithms=["HS256"], options={"verify_aud": False})
    request = {"request_id": "interrupted", "message": "怎样检查", "persona": "guide"}
    C.begin(actor, s["session_id"], s["rounds"][0]["round_id"], request)
    # A fresh connection/reader is not a worker restart; never claim process-recovery E2E here.
    state = client.get(f'/api/pair/sessions/{s["session_id"]}/ai-requests/interrupted', headers=ctx["student"])
    assert state.json()["status"] == "pending" and "reply" not in state.json()
    calls = []
    patch_provider(monkeypatch, lambda *a: calls.append(1))
    assert ask(client, ctx, s, request_id="interrupted").status_code == 409
    assert not calls


def test_two_valid_sessions_cannot_swap_rounds_or_saved_versions(client, ctx, monkeypatch):
    from app import store_evidence as E
    s1 = create(client, ctx)
    policy(client, ctx, s1)
    project = store.create_project(ctx["uid"], "第二作品", "python")
    store.save_version(project["id"], ctx["uid"], "other = 7", None)
    attempt = E.create_attempt(ctx["uid"], f'exercise:{ctx["exercise_id"]}', None, project["id"], "python")
    s2 = create(client, ctx, {**ctx["body"], "attempt_id": attempt["attempt_id"], "request_id": uuid.uuid4().hex})
    policy(client, ctx, s2)
    with store._conn() as c:
        vid = c.execute("SELECT id FROM project_versions WHERE project_id=?", (project["id"],)).fetchone()[0]
    calls = []
    patch_provider(monkeypatch, lambda *a: calls.append(1))
    url = f'/api/pair/sessions/{s1["session_id"]}/rounds/{s2["rounds"][0]["round_id"]}/chat'
    r = client.post(url, headers=ctx["student"], json={"request_id": "swapped", "persona": "guide", "message": "怎样检查"})
    assert r.status_code == 409, r.text
    assert ask(client, ctx, s1, project_version_id=vid).status_code == 409
    assert not calls


@pytest.mark.parametrize("fail_after", ["policy-column", "receipt-table"])
def test_ai_schema_failure_rolls_back_new_ddl_and_preserves_legacy_session(client, ctx, fail_after):
    """Catch partial ALTER/CREATE commits without touching the suite's live schema."""
    import sqlite3
    from contextlib import closing
    from app import store_pair_sessions as P

    session = create(client, ctx)
    with closing(sqlite3.connect(":memory:")) as legacy:
        legacy.row_factory = sqlite3.Row
        with closing(store._conn()) as source:
            source.backup(legacy)
        # Remove only M1b2 additions from a valid M1a session/round fixture.
        legacy.execute("DROP TABLE pair_ai_requests")
        legacy.execute("ALTER TABLE pair_sessions DROP COLUMN ai_policy_json")
        legacy.commit()
        old_row = dict(legacy.execute("SELECT * FROM pair_sessions WHERE session_id=?", (session["session_id"],)).fetchone())
        old_schema = list(legacy.execute("SELECT name,sql FROM sqlite_master ORDER BY name"))
        statements = []

        class FailAfterNewDDL:
            def execute(self, sql, *args):
                result = legacy.execute(sql, *args)
                statements.append(sql)
                if ((fail_after == "policy-column" and sql.startswith("ALTER TABLE pair_sessions ADD COLUMN"))
                        or (fail_after == "receipt-table" and sql.startswith("CREATE TABLE IF NOT EXISTS pair_ai_requests"))):
                    raise sqlite3.OperationalError("synthetic failure after new DDL")
                return result

        with pytest.raises(sqlite3.OperationalError, match="synthetic failure after new DDL"):
            P.init_tables(FailAfterNewDDL())
        assert any(sql.startswith("ALTER TABLE pair_sessions ADD COLUMN") for sql in statements)
        if fail_after == "receipt-table":
            assert any(sql.startswith("CREATE TABLE IF NOT EXISTS pair_ai_requests") for sql in statements)
        assert "ai_policy_json" not in {row[1] for row in legacy.execute("PRAGMA table_info(pair_sessions)")}
        assert legacy.execute("SELECT 1 FROM sqlite_master WHERE name='pair_ai_requests'").fetchone() is None
        assert list(legacy.execute("SELECT name,sql FROM sqlite_master ORDER BY name")) == old_schema
        assert dict(legacy.execute("SELECT * FROM pair_sessions WHERE session_id=?", (session["session_id"],)).fetchone()) == old_row
        P.init_tables(legacy)
        P.init_tables(legacy)
        upgraded = dict(legacy.execute("SELECT * FROM pair_sessions WHERE session_id=?", (session["session_id"],)).fetchone())
        assert upgraded.pop("ai_policy_json") is None
        assert upgraded == old_row
        assert legacy.execute("SELECT COUNT(*) FROM pair_ai_requests").fetchone()[0] == 0


@pytest.mark.parametrize("phase", ["generation", "verifier"])
def test_abrupt_worker_restart_keeps_pending_and_never_replays(client, ctx, phase):
    """Catch startup clearing/releasing pending or duplicate post re-entering transport."""
    import os
    from pathlib import Path
    import subprocess
    import sys
    import test_support

    session = create(client, ctx)
    policy(client, ctx, session)
    isolation = test_support.bootstrap()
    database = Path(store.DB_PATH).resolve()
    assert database.is_relative_to(isolation.root)
    payload = {"database": str(database), "root": str(isolation.root),
               "session": session["session_id"], "round": session["rounds"][0]["round_id"],
               "headers": ctx["student"], "phase": phase, "candidate": candidate()}
    # Unlike pytest's bootstrap (which must create a fresh DB per worker), these
    # explicit restart probes adopt ONLY this parent-owned synthetic DB. Each
    # child installs the independent pre-import DB/config/network guard below.
    child = r'''
import json, os, pathlib, socket, sys
p = json.loads(sys.stdin.read())
root = pathlib.Path(p["root"]).resolve()
db = pathlib.Path(p["database"]).resolve()
server = pathlib.Path.cwd().resolve()
assert db.is_relative_to(root) and root.name.startswith("jiedui_test_")
protected = {(server / name).resolve() for name in (".env", "jiedui.db", "jiedui.db-wal", "jiedui.db-shm")}
connections = []
class ProbeViolation(BaseException):
    pass
def audit(event, args):
    if event == "sqlite3.connect":
        target = str(args[0])
        if target != ":memory:":
            if target.startswith("file:") or pathlib.Path(target).resolve() != db:
                raise ProbeViolation("database_outside_restart_fixture")
            connections.append(target)
    elif event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
        if pathlib.Path(os.fsdecode(args[0])).resolve() in protected:
            raise ProbeViolation("production_file_open")
    elif event in ("urllib.Request", "socket.getaddrinfo", "socket.sendto"):
        raise ProbeViolation("network_attempt")
    elif event == "socket.connect":
        frame = sys._getframe(1)
        if frame.f_code is getattr(socket.socketpair, "__code__", None) and args[1][0] in ("127.0.0.1", "::1"):
            return
        raise ProbeViolation("network_attempt")
sys.addaudithook(audit)
os.environ.update({"JIEDUI_DB_PATH": str(db), "JIEDUI_ENV_FILE_DISABLED": "1", "PAIR_AI_MODE": "trusted_required"})
from fastapi.testclient import TestClient
from app.main import app
from app import ai, pair_ai_context as C
assert C.MODE == "trusted_required"
request = {"request_id": "worker-interrupted", "message": "How can I check my boundary case?", "persona": "guide"}
base = "/api/pair/sessions/" + p["session"]
chat = base + "/rounds/" + p["round"] + "/chat"
provider_calls = []
def transport(system, messages):
    if sys.argv[1] == "producer":
        stage = "verifier" if "PAIR_OUTPUT_VERIFY/v2" in system else "generation"
        provider_calls.append(stage)
        if stage != p["phase"]:
            assert provider_calls == ["generation"]
            return p["candidate"]
        print(json.dumps({"phase": "pending_committed_before_transport", "stage": stage, "calls": provider_calls, "pid": os.getpid(), "connections": len(connections)}), flush=True)
        os._exit(73)
    raise ProbeViolation("duplicate_request_reentered_model")
ai._call_llm = transport
ai._call_verifier = transport
with TestClient(app) as client:
    if sys.argv[1] == "producer":
        client.post(chat, headers=p["headers"], json=request)
        raise AssertionError("producer must stop at actual transport boundary")
    status = client.get(base + "/ai-requests/worker-interrupted", headers=p["headers"])
    assert status.status_code == 200, status.text
    result = status.json()
    assert result["status"] == "pending" and result["source"] is None and result["finished_at"] is None
    assert result["delivery_status"] == "not_observed" and "reply" not in result
    duplicate = client.post(chat, headers=p["headers"], json=request)
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["detail"]["code"] == "REQUEST_PENDING"
    after = client.get(base + "/ai-requests/worker-interrupted", headers=p["headers"])
    assert after.json() == result
    print(json.dumps({"phase": "fresh_worker_pending_no_replay", "pid": os.getpid(), "connections": len(connections), "status": result["status"], "duplicate_status": duplicate.status_code, "violations": []}), flush=True)
'''
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    server = Path(__file__).resolve().parents[1]
    producer = subprocess.run([sys.executable, "-c", child, "producer"], cwd=server, env=env,
                              input=json.dumps(payload), text=True, capture_output=True, timeout=20)
    assert producer.returncode == 73, producer.stdout + producer.stderr
    produced = json.loads(producer.stdout.strip().splitlines()[-1])
    assert produced["phase"] == "pending_committed_before_transport"
    assert produced["stage"] == phase
    assert produced["calls"] == (["generation"] if phase == "generation" else ["generation", "verifier"])
    with store._conn() as c:
        before = dict(c.execute("SELECT * FROM pair_ai_requests WHERE session_id=? AND request_id='worker-interrupted'", (session["session_id"],)).fetchone())
    assert before["status"] == "pending" and before["source"] is None and before["finished_at"] is None
    reader = subprocess.run([sys.executable, "-c", child, "reader"], cwd=server, env=env,
                            input=json.dumps(payload), text=True, capture_output=True, timeout=20)
    assert reader.returncode == 0, reader.stdout + reader.stderr
    recovered = json.loads(reader.stdout.strip().splitlines()[-1])
    assert recovered["phase"] == "fresh_worker_pending_no_replay"
    assert recovered["pid"] not in (produced["pid"], os.getpid())
    assert produced["pid"] != os.getpid()
    assert recovered["connections"] > 0 and recovered["violations"] == []
    with store._conn() as c:
        after = dict(c.execute("SELECT * FROM pair_ai_requests WHERE session_id=? AND request_id='worker-interrupted'", (session["session_id"],)).fetchone())
    assert after == before
    print("RESTART_PROBE " + json.dumps({"producer": produced, "reader": recovered}))


def test_receipt_subject_rights_do_not_disclose_or_erase_other_student(client, ctx, monkeypatch):
    from app import store_evidence as E
    first = create(client, ctx)
    policy(client, ctx, first)
    username = "receipt-other-" + uuid.uuid4().hex
    other_uid = "stu-" + username
    other_headers = login(client, "student", username)
    R.set_class_students(ctx["class_id"], [ctx["uid"], other_uid])
    store.grant_consent(other_uid, "synthetic", ctx["tid"])
    push = R.create_push(ctx["tid"], "exercise", ctx["exercise_id"], [other_uid])
    project = store.create_project(other_uid, "第二学生合成作品", "python")
    attempt = E.create_attempt(other_uid, f'exercise:{ctx["exercise_id"]}', None, project["id"], "python")
    other_ctx = {**ctx, "uid": other_uid, "student": other_headers}
    second = create(client, ctx, {**ctx["body"], "push_id": push, "attempt_id": attempt["attempt_id"], "request_id": uuid.uuid4().hex})
    policy(client, ctx, second)
    patch_provider(monkeypatch, model_reply)
    assert ask(client, ctx, first, request_id="owner-one").status_code == 200
    assert ask(client, other_ctx, second, request_id="owner-two").status_code == 200
    for own, foreign, headers in ((first, second, ctx["student"]), (second, first, other_headers)):
        foreign_request = "owner-two" if foreign is second else "owner-one"
        denied = client.get(f'/api/pair/sessions/{foreign["session_id"]}/ai-requests/{foreign_request}', headers=headers)
        assert denied.status_code == 404
        assert foreign["task_snapshot_id"] not in denied.text
    before_other = ER.subject_export(other_uid)["data"]["pair_ai_requests"]
    first_export = ER.subject_export(ctx["uid"])["data"]["pair_ai_requests"]
    assert {r["session_id"] for r in first_export} == {first["session_id"]}
    assert {r["session_id"] for r in before_other} == {second["session_id"]}
    assert all(not {"message", "reply", "saved_code", "history"}.intersection(r) for r in first_export + before_other)
    assert ER.erase_subject(ctx["uid"])["deleted"]["pair_ai_requests"] == 1
    assert ER.subject_export(other_uid)["data"]["pair_ai_requests"] == before_other
    assert client.get(f'/api/pair/sessions/{second["session_id"]}/ai-requests/owner-two', headers=other_headers).status_code == 200


def test_researcher_cannot_configure_or_send_student_policy(client, ctx, monkeypatch):
    import jwt
    from app.auth import SECRET
    s = create(client, ctx)
    payload = jwt.decode(ctx["teacher"]["Authorization"][7:], SECRET, algorithms=["HS256"], options={"verify_aud": False})
    payload["role"] = "researcher"
    researcher = {"Authorization": "Bearer " + jwt.encode(payload, SECRET, algorithm="HS256")}
    calls = []
    patch_provider(monkeypatch, lambda *a: calls.append(1))
    assert client.put(f'/api/pair/sessions/{s["session_id"]}/ai-policy', headers=researcher,
                      json={"scaffold": 1, "socratic": True}).status_code == 403
    policy(client, ctx, s)
    response = client.post(f'/api/pair/sessions/{s["session_id"]}/rounds/{s["rounds"][0]["round_id"]}/chat',
                           headers=researcher, json={"request_id": "researcher", "message": "怎样检查？", "persona": "guide"})
    assert response.status_code == 403 and not calls


@pytest.mark.parametrize("timing", ["before", "inflight", "verifier"])
def test_strict_research_link_blocks_teaching_at_each_boundary(client, ctx, monkeypatch, timing):
    s = create(client, ctx)
    policy(client, ctx, s)
    calls = []
    def link_research():
        with store._conn() as c:
            c.execute("INSERT INTO studies(title,phase,exp_class_ids,created_by) VALUES(?,?,?,?)",
                      ("合成研究隔离", "pretest", json.dumps([ctx["class_id"]]), ctx["tid"]))
    if timing == "before":
        link_research()
    def transport(system, messages):
        calls.append(1)
        if timing != "verifier" or VERIFY_MARKER in system:
            link_research()
        return model_reply(system, messages, feedback="RESEARCH-STALE-REPLY")
    patch_provider(monkeypatch, transport)
    response = ask(client, ctx, s)
    assert response.status_code == 409, response.text
    assert "RESEARCH-STALE-REPLY" not in response.text
    assert len(calls) == {"before": 0, "inflight": 1, "verifier": 2}[timing]
    with store._conn() as c:
        row = c.execute("SELECT status FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone()
        assert (row and row[0] == "invalidated") if timing != "before" else row is None


@pytest.mark.parametrize("phase", ["generation", "verifier"])
def test_provider_fault_never_leaks_body_or_exception_text(client, ctx, monkeypatch, caplog, capsys, phase):
    s = create(client, ctx)
    policy(client, ctx, s)
    marker = "SYNTHETIC_PRIVATE_PROVIDER_BODY_7e53"
    candidate_marker = "SYNTHETIC_CANDIDATE_NOT_FOR_RELEASE"
    calls = []
    def unavailable(request, *args, **kwargs):
        packet = json.loads(request.data)
        calls.append(packet)
        if phase == "verifier" and len(calls) == 1:
            return io.BytesIO(json.dumps(provider_envelope(candidate(feedback=candidate_marker))).encode())
        raise RuntimeError(marker)
    monkeypatch.setattr(ai.urllib.request, "urlopen", unavailable)
    response = ask(client, ctx, s, request_id="provider-fault")
    if phase == "generation":
        assert response.status_code == 200 and response.json()["source"] == "fallback"
    else:
        assert response.status_code == 422 and "reply" not in response.json()
        assert response.json()["detail"]["code"] == "OUTPUT_CONSTRAINT_FAILED"
        assert VERIFY_MARKER in calls[1]["system"]
        assert candidate_marker not in calls[1]["system"]
        assert candidate_marker in str(calls[1]["messages"])
        assert all(m["role"] == "user" for m in calls[1]["messages"])
    captured = capsys.readouterr()
    for secret in (marker, candidate_marker):
        assert secret not in response.text + caplog.text + captured.out + captured.err
    with store._conn() as c:
        receipts = [dict(row) for row in c.execute("SELECT * FROM pair_ai_requests WHERE session_id=?", (s["session_id"],))]
        assert all(secret not in json.dumps(receipts) for secret in (marker, candidate_marker))
    if phase == "verifier":
        assert receipts[0]["status"] == "failed" and receipts[0]["source"] is None
        state_url = f'/api/pair/sessions/{s["session_id"]}/ai-requests/provider-fault'
        before = client.get(state_url, headers=ctx["student"]).json()
        assert before["reason_code"] == "OUTPUT_CONSTRAINT_FAILED"
        assert ask(client, ctx, s, request_id="provider-fault").status_code == 409
        assert client.get(state_url, headers=ctx["student"]).json() == before
    assert len(calls) == (1 if phase == "generation" else 2)
