"""Real routes, synthetic subjects, offline transport: M1b1 assessment boundary."""
import io
import json
import uuid
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Event
from contextlib import closing

import pytest
import test_support
from app import ai, store, store_study as S
from app import store_resources as R
from app import assessment_access as A
from app.main import app
from fastapi.testclient import TestClient
from tests.conftest import _login


@pytest.fixture
def subject(client, teacher):
    name = "guard-" + uuid.uuid4().hex[:12]
    headers = {"Authorization": "Bearer " + _login(client, "student", name)}
    uid = "stu-" + name
    r = client.post("/api/teacher/consent", headers=teacher, json={"student_id": uid})
    assert r.status_code == 200, r.text
    return uid, headers


def paper(client, teacher, uid, kind="post"):
    r = client.post("/api/research/assessments", headers=teacher, json={
        "title": "合成独立测评", "kind": kind,
        "items": [{"stem": "合成题", "options": ["甲", "乙"], "answer": 0,
                   "dim": "verify", "score": 1}]})
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    r = client.post("/api/resources/push", headers=teacher, json={
        "res_type": "assessment", "res_id": aid, "student_ids": [uid]})
    assert r.status_code == 200, r.text
    return aid


def take(client, headers, aid):
    return client.get(f"/api/research/my/assessments/{aid}", headers=headers)


def submit(client, headers, aid):
    return client.post(f"/api/research/my/assessments/{aid}/submit", headers=headers,
                       json={"answers": [0], "duration_client": 400})


def event_counts(uid):
    with closing(store._conn()) as c:
        return tuple(c.execute(f"SELECT COUNT(*) FROM {table} WHERE {field}=?", (uid,)).fetchone()[0]
                     for table, field in [("ct_events", "user_id"), ("ai_reply_log", "student_id")])


def ask(client, headers, endpoint="chat", **extras):
    body = {"message": "帮我检查代码", "role": "reviewer"} if endpoint == "chat" else {"prompt": "画出算法"}
    return client.post("/api/ai/" + endpoint, headers=headers, json={**body, **extras})


def assert_locked(client, headers, uid, monkeypatch, endpoint="chat", **extras):
    before = test_support.bootstrap().model_calls.copy()
    events = event_counts(uid)
    calls = []
    def forbidden(*args, **kwargs):
        calls.append(True)
        raise AssertionError("blocked request reached model or programming fallback")
    with monkeypatch.context() as m:
        m.setattr(ai, "_call_llm", forbidden)
        m.setattr(ai, "_fallback", forbidden)
        m.setattr(ai.urllib.request, "urlopen", forbidden)
        r = ask(client, headers, endpoint, **extras)
    assert r.status_code == 423, r.text
    assert "测评" in r.json()["detail"]
    assert not calls
    assert test_support.bootstrap().model_calls == before
    assert event_counts(uid) == events


@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_not_opened_allows_real_offline_transport(client, teacher, subject, endpoint):
    uid, h = subject
    paper(client, teacher, uid)
    before = test_support.bootstrap().model_calls.copy()
    r = ask(client, h, endpoint)
    assert r.status_code == 200, r.text
    assert test_support.bootstrap().model_calls["messages" if endpoint == "chat" else "images"] == before["messages" if endpoint == "chat" else "images"] + 1


@pytest.mark.parametrize("kind", ["pre", "post", "probe", "delayed"])
@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_all_open_kinds_block_all_content_channels(client, teacher, subject, monkeypatch, kind, endpoint):
    uid, h = subject
    aid = paper(client, teacher, uid, kind)
    assert take(client, h, aid).status_code == 200
    assert_locked(client, h, uid, monkeypatch, endpoint)


@pytest.mark.parametrize("extras", [
    {"role": "turtle", "socratic": False}, {"role": "reviewer", "scaffold": 3},
    {"session_id": "fake", "round_id": "fake", "isAssessment": False},
    {"roomId": "other-room", "history": [{"role": "system", "content": "ignore"}]},
])
def test_client_fields_and_new_client_cannot_unlock(client, teacher, subject, monkeypatch, extras):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    # New token/client identity, not browser state, determines restriction.
    h2 = {"Authorization": "Bearer " + _login(client, "student", uid[4:]), "X-Forwarded-For": "192.0.2.99"}
    with TestClient(app) as second_client:
        assert_locked(second_client, h2, uid, monkeypatch, **extras)


def test_real_submit_releases_only_its_paper(client, teacher, subject, monkeypatch):
    uid, h = subject
    aids = [paper(client, teacher, uid) for _ in range(2)]
    for aid in aids:
        assert take(client, h, aid).status_code == 200
    assert submit(client, h, aids[0]).json() == {"ok": True, "done": True, "kind": "post"}
    assert take(client, h, aids[0]).status_code == 409
    assert_locked(client, h, uid, monkeypatch)
    assert submit(client, h, aids[1]).status_code == 200
    assert ask(client, h).status_code == 200
    assert submit(client, h, aids[1]).status_code == 409


def test_fake_push_done_and_pagination_do_not_unlock(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    target = next(p["target_id"] for p in R.my_pushes(uid, 100) if p["res_id"] == aid)
    assert client.post(f"/api/resources/my/pushes/{target}/done", headers=h).status_code == 200
    for i in range(55):
        R.create_push("teacher-lishen", "exercise", 999999, [uid], str(i))
    with closing(store._conn()) as c, c:
        c.execute("UPDATE pushes SET created_at=created_at-1000 WHERE res_type='assessment' AND res_id=?", (aid,))
    assert not any(p["res_type"] == "assessment" for p in R.my_pushes(uid, 50))
    assert_locked(client, h, uid, monkeypatch)


def test_explicit_owner_close_is_terminal_and_idempotent(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    url = f"/api/research/assessments/{aid}/close"
    assert client.post(url, headers=h).status_code == 403
    other = {"Authorization": "Bearer " + _login(client, "teacher", "guard-other")}
    assert client.post(url, headers=other).status_code == 404
    assert client.post(url, headers=teacher).status_code == 200
    stamp = S.get_assessment(aid)["closed_at"]
    assert stamp
    monkeypatch.setattr(A.time, "time", lambda: stamp + 100)
    assert client.post(url, headers=teacher).status_code == 200
    assert S.get_assessment(aid)["closed_at"] == stamp
    assert take(client, h, aid).status_code == 409
    assert submit(client, h, aid).status_code == 409
    assert S.response_of(aid, uid) is None
    assert ask(client, h).status_code == 200


def test_failed_and_unassigned_take_never_start_guard(client, teacher, subject):
    uid, h = subject
    aid = paper(client, teacher, "stu-guard-outsider")
    assert take(client, h, aid).status_code == 404
    assert S.opened_at_of(aid, uid) is None
    assert ask(client, h).status_code == 200
    own = paper(client, teacher, uid)
    assert client.delete("/api/consent", headers=h).status_code == 200
    assert take(client, h, own).status_code == 403
    assert S.opened_at_of(own, uid) is None


def test_failed_submit_and_page_cancel_do_not_unlock(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    stamp = S.opened_at_of(aid, uid)
    assert take(client, h, aid).status_code == 200
    assert S.opened_at_of(aid, uid) == stamp
    assert client.post(f"/api/research/my/assessments/{aid}/submit", headers=h, json={"answers": "bad"}).status_code == 422
    assert client.post(f"/api/research/my/assessments/{aid}/cancel", headers=h).status_code in (404, 405)
    assert_locked(client, h, uid, monkeypatch)


def test_readonly_process_help_never_calls_model_or_returns_paper(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    before = test_support.bootstrap().model_calls.copy()
    events = event_counts(uid)
    def forbidden(*args, **kwargs):
        pytest.fail("process help called a model or programming fallback")
    monkeypatch.setattr(ai, "_call_llm", forbidden)
    monkeypatch.setattr(ai, "_fallback", forbidden)
    monkeypatch.setattr(ai.urllib.request, "urlopen", forbidden)
    r = client.get("/api/ai/assessment-help", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["mode"] == "process_only"
    assert r.json()["active_count"] == 1
    assert "合成题" not in r.text and "answer" not in r.text
    assert test_support.bootstrap().model_calls == before
    assert event_counts(uid) == events


@pytest.mark.parametrize("finish_during_call", ["none", "close", "submit"])
@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_new_assessment_during_model_discards_response(client, teacher, subject, monkeypatch, endpoint, finish_during_call):
    uid, h = subject
    aid = paper(client, teacher, uid)
    original = ai.urllib.request.urlopen
    calls = []
    lifecycle = []
    monkeypatch.setattr(A.time, "time", lambda: 1790000000)
    def forbidden_fallback(*args, **kwargs):
        pytest.fail("programming fallback ran before rejection")
    monkeypatch.setattr(ai, "_fallback", forbidden_fallback)
    def in_flight(request, *args, **kwargs):
        calls.append(request.full_url)
        result = original(request, *args, **kwargs)
        lifecycle.append(take(client, h, aid).status_code)
        if finish_during_call == "close":
            lifecycle.append(client.post(f"/api/research/assessments/{aid}/close", headers=teacher).status_code)
        elif finish_during_call == "submit":
            lifecycle.append(submit(client, h, aid).status_code)
        return io.BytesIO(b'{"content":[{"type":"text","text":"SECRET_INFLIGHT_OUTPUT"}]}') if endpoint == "chat" else result
    monkeypatch.setattr(ai.urllib.request, "urlopen", in_flight)
    before = event_counts(uid)
    r = ask(client, h, endpoint)
    # Assertions inside urlopen can be swallowed by the production transport
    # catch. Verify lifecycle success here, outside that catch, and in the DB.
    assert lifecycle == ([200] if finish_during_call == "none" else [200, 200])
    assert S.opened_at_of(aid, uid) is not None
    if finish_during_call == "submit":
        assert S.response_of(aid, uid) is not None
    if finish_during_call == "close":
        assert S.get_assessment(aid)["closed_at"] is not None
    assert r.status_code == 423, r.text
    assert "SECRET_INFLIGHT_OUTPUT" not in r.text and '"image"' not in r.text
    assert len(calls) == 1
    assert event_counts(uid) == before


def test_image_failed_call_cannot_retry_during_new_assessment(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    calls = []
    def failed(request, *args, **kwargs):
        calls.append(request.full_url)
        assert take(client, h, aid).status_code == 200
        raise OSError("synthetic failed transport")
    monkeypatch.setattr(ai.urllib.request, "urlopen", failed)
    before = event_counts(uid)
    assert ask(client, h, "image").status_code == 423
    assert len(calls) == 1
    assert event_counts(uid) == before


@pytest.mark.parametrize("phase", ["running", "posttest", "closed"])
def test_pre_window_shared_by_take_submit_ai_without_changing_running_rule(client, teacher, subject, monkeypatch, phase):
    uid, h = subject
    aid = paper(client, teacher, uid, "pre")
    sid = S.create_study("tea-lishen", {"title": "合成窗口研究"})
    S.update_study(sid, {"pre_assessment_id": aid, "phase": "pretest"})
    assert take(client, h, aid).status_code == 200
    S.update_study(sid, {"phase": phase, "pre_closed_at": 1})
    if phase == "running":
        assert take(client, h, aid).status_code == 200
        assert_locked(client, h, uid, monkeypatch)
        assert submit(client, h, aid).status_code == 200
    else:
        assert take(client, h, aid).status_code == 409
        assert submit(client, h, aid).status_code == 409
        assert S.response_of(aid, uid) is None
    assert ask(client, h).status_code == 200


def test_closed_study_does_not_silently_close_post_paper(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid, "post")
    sid = S.create_study("tea-lishen", {"title": "合成后测"})
    S.update_study(sid, {"post_assessment_id": aid, "phase": "closed", "post_closed_at": 1})
    assert take(client, h, aid).status_code == 200
    assert_locked(client, h, uid, monkeypatch)
    assert submit(client, h, aid).status_code == 200
    assert ask(client, h).status_code == 200


@pytest.mark.parametrize("by_round", [False, True])
def test_old_probe_close_paths_use_same_owner_boundary(client, teacher, subject, monkeypatch, by_round):
    uid, h = subject
    aid = paper(client, teacher, uid, "probe")
    sid = S.create_study("tea-lishen", {"title": "合成探针"})
    with closing(store._conn()) as c, c:
        c.execute("UPDATE assessments SET study_id=?,round_id=1 WHERE id=?", (sid, aid))
    assert take(client, h, aid).status_code == 200
    other = {"Authorization": "Bearer " + _login(client, "teacher", "guard-other")}
    url = f"/api/research/studies/{sid}/probe/" + ("close" if by_round else f"{aid}/close")
    data = {"round_index": 1} if by_round else {}
    assert client.post(url, headers=other, json=data).status_code == 404
    assert S.get_assessment(aid)["closed_at"] is None
    assert_locked(client, h, uid, monkeypatch)
    assert client.post(url, headers=teacher, json=data).status_code == 200
    assert take(client, h, aid).status_code == 409
    assert submit(client, h, aid).status_code == 409
    assert ask(client, h).status_code == 200


def test_researcher_close_still_requires_paper_creator(client, teacher, subject):
    import jwt
    from app import auth
    uid, h = subject
    aid = paper(client, teacher, uid)
    def researcher(name):
        token = _login(client, "teacher", name)
        payload = jwt.decode(token, auth.SECRET, algorithms=[auth.ALG], options={"verify_aud": False})
        payload["role"] = "researcher"
        return {"Authorization": "Bearer " + jwt.encode(payload, auth.SECRET, algorithm=auth.ALG)}
    url = f"/api/research/assessments/{aid}/close"
    assert client.post(url, headers=researcher("guard-other")).status_code == 404
    assert client.post(url, headers=researcher("lishen")).status_code == 200


@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_withdraw_and_regrant_do_not_remove_open_assessment(client, teacher, subject, monkeypatch, endpoint):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    assert client.delete("/api/consent", headers=h).status_code == 200
    before = test_support.bootstrap().model_calls.copy()
    events = event_counts(uid)
    assert ask(client, h, endpoint).status_code == 403
    assert test_support.bootstrap().model_calls == before
    assert event_counts(uid) == events
    assert client.post("/api/teacher/consent", headers=teacher, json={"student_id": uid}).status_code == 200
    assert_locked(client, h, uid, monkeypatch, endpoint)


def test_paper_open_is_scoped_to_student_and_close_preserves_submission(client, teacher, subject, monkeypatch):
    uid, h = subject
    other = "guard-" + uuid.uuid4().hex[:12]
    oh = {"Authorization": "Bearer " + _login(client, "student", other)}
    assert client.post("/api/teacher/consent", headers=teacher, json={"student_id": "stu-" + other}).status_code == 200
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    assert ask(client, oh).status_code == 200
    assert_locked(client, h, uid, monkeypatch)
    assert submit(client, h, aid).status_code == 200
    response = S.response_of(aid, uid)
    assert client.post(f"/api/research/assessments/{aid}/close", headers=teacher).status_code == 200
    assert S.response_of(aid, uid) == response


def test_closing_one_of_two_does_not_release_other(client, teacher, subject, monkeypatch):
    uid, h = subject
    aids = [paper(client, teacher, uid) for _ in range(2)]
    for aid in aids:
        assert take(client, h, aid).status_code == 200
    assert client.post(f"/api/research/assessments/{aids[0]}/close", headers=teacher).status_code == 200
    assert_locked(client, h, uid, monkeypatch)
    assert submit(client, h, aids[1]).status_code == 200
    before = test_support.bootstrap().model_calls["messages"]
    assert ask(client, h).status_code == 200
    assert test_support.bootstrap().model_calls["messages"] == before + 1


def test_chat_transport_failure_checks_assessment_before_fallback(client, teacher, subject, monkeypatch):
    uid, h = subject
    aid = paper(client, teacher, uid)
    calls = []
    def fail_transport(*args, **kwargs):
        calls.append(True)
        assert take(client, h, aid).status_code == 200
        raise OSError("synthetic chat failure")
    def forbidden_fallback(*args, **kwargs):
        pytest.fail("programming fallback ran")
    monkeypatch.setattr(ai.urllib.request, "urlopen", fail_transport)
    monkeypatch.setattr(ai, "_fallback", forbidden_fallback)
    events = event_counts(uid)
    assert ask(client, h).status_code == 423
    assert len(calls) == 1 and event_counts(uid) == events


@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_state_query_failure_is_fail_closed(client, teacher, subject, monkeypatch, endpoint):
    uid, h = subject
    def broken(*args, **kwargs):
        raise sqlite3.OperationalError("synthetic state unavailable")
    def forbidden(*args, **kwargs):
        pytest.fail("state failure reached model")
    monkeypatch.setattr(A, "_state", broken)
    monkeypatch.setattr(ai, "_call_llm", forbidden)
    monkeypatch.setattr(ai.urllib.request, "urlopen", forbidden)
    events = event_counts(uid)
    with TestClient(app, raise_server_exceptions=False) as broken_client:
        assert ask(broken_client, h, endpoint).status_code == 500
    assert event_counts(uid) == events


@pytest.mark.parametrize("operation", ["take", "submit"])
def test_committed_close_wins_over_waiting_answer_transaction(client, teacher, subject, monkeypatch, operation):
    uid, h = subject
    aid = paper(client, teacher, uid)
    entered = Event()
    original = A._transaction
    @contextmanager
    def observed_transaction(*, write=False):
        if write:
            entered.set()
        with original(write=write) as connection:
            yield connection
    monkeypatch.setattr(A, "_transaction", observed_transaction)
    # A distinct connection owns the write lock; route reads old state but cannot
    # authorize its write until closure commits. No global Python lock involved.
    with closing(store._conn()) as c, ThreadPoolExecutor(max_workers=1) as pool:
        c.execute("BEGIN IMMEDIATE")
        c.execute("UPDATE assessments SET closed_at=1 WHERE id=?", (aid,))
        future = pool.submit(take if operation == "take" else submit, client, h, aid)
        try:
            assert entered.wait(3), "route never reached write authorization"
        finally:
            c.commit()
        assert future.result(timeout=5).status_code == 409
    assert S.opened_at_of(aid, uid) is None
    assert S.response_of(aid, uid) is None


def test_concurrent_submissions_persist_once(client, teacher, subject):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(submit, client, h, aid) for _ in range(2)]
        assert sorted(f.result(timeout=5).status_code for f in futures) == [200, 409]
    with closing(store._conn()) as c:
        assert c.execute("SELECT COUNT(*) FROM assessment_responses WHERE assessment_id=? AND student_id=?", (aid, uid)).fetchone()[0] == 1


@pytest.mark.parametrize("endpoint", ["chat", "image"])
def test_assessment_never_blocks_fixed_safety_support(client, teacher, subject, monkeypatch, endpoint):
    uid, h = subject
    aid = paper(client, teacher, uid)
    assert take(client, h, aid).status_code == 200
    before = event_counts(uid)
    calls = test_support.bootstrap().model_calls.copy()
    def forbidden(*args, **kwargs):
        pytest.fail("safety response reached model or programming fallback")
    monkeypatch.setattr(ai, "_call_llm", forbidden)
    monkeypatch.setattr(ai, "_fallback", forbidden)
    monkeypatch.setattr(ai.urllib.request, "urlopen", forbidden)
    r = ask(client, h, endpoint, **({"message": "我不想活了"} if endpoint == "chat" else {"prompt": "我不想活了"}))
    assert r.status_code == (200 if endpoint == "chat" else 400), r.text
    message = r.json()["reply" if endpoint == "chat" else "detail"]
    assert "信任" in message and "老师" in message
    assert "先独立完成" not in message and "系统已通知" not in message
    with closing(store._conn()) as c:
        rows = c.execute("SELECT category,level FROM risk_events WHERE user_id=?", (uid,)).fetchall()
    assert len(rows) == 1 and rows[0]["category"] == "self_harm" and rows[0]["level"] == 4
    assert event_counts(uid) == before
    assert test_support.bootstrap().model_calls == calls
