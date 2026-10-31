"""Real HTTP seam and route tests; no provider calls or production data."""
import io
import json

import pytest
from app import ai, store
from test_pair_context import ctx, create
from test_pair_ai_context import STRICT, policy, ask
from pair_output_fixture import candidate, verdict


def envelope(text, **extra):
    return {"type": "message", "role": "assistant", "stop_reason": "end_turn",
            "stop_sequence": None, "content": [{"type": "text", "text": text}], **extra}


@pytest.mark.skipif(not STRICT, reason="strict isolated startup only")
def test_truncated_verifier_cannot_release_even_complete_approval(client, ctx, monkeypatch):
    # Regression: old generic transport discards max_tokens and releases this.
    s = create(client, ctx)
    policy(client, ctx, s)
    calls = []
    def transport(request, **kwargs):
        calls.append(json.loads(request.data))
        response = envelope(candidate()) if len(calls) == 1 else envelope(verdict(), stop_reason="max_tokens")
        return io.BytesIO(json.dumps(response).encode())
    monkeypatch.setattr(ai.urllib.request, "urlopen", transport)
    result = ask(client, ctx, s, request_id="truncated-verifier")
    assert result.status_code == 422, result.text
    assert result.json()["detail"]["code"] == "OUTPUT_CONSTRAINT_FAILED"
    assert result.json()["detail"]["receipt"]["status"] == "failed"
    assert "reply" not in result.json() and len(calls) == 2
    assert ask(client, ctx, s, request_id="truncated-verifier").status_code == 409
    assert len(calls) == 2
    with store._conn() as c:
        row = dict(c.execute("SELECT * FROM pair_ai_requests WHERE session_id=?", (s["session_id"],)).fetchone())
        assert row["status"] == "failed" and not {"reply", "candidate", "verdict"} & row.keys()


def http_response(monkeypatch, value):
    calls = []
    response = io.BytesIO(value if isinstance(value, bytes) else json.dumps(value).encode())
    def transport(request, **kwargs):
        calls.append((json.loads(request.data), kwargs))
        return response
    monkeypatch.setattr(ai.urllib.request, "urlopen", transport)
    return calls, response


def test_verifier_profile_is_explicit_and_does_not_change_generation(monkeypatch):
    calls, response = http_response(monkeypatch, envelope(verdict()))
    assert ai._call_verifier("server verifier", []) == verdict()
    assert calls[0][0]["max_tokens"] == 4096 and calls[0][1] == {"timeout": 30}
    assert len(calls) == 1 and response.closed
    calls, _ = http_response(monkeypatch, envelope("legacy text", stop_reason="max_tokens"))
    # A marker in an ordinary request cannot elevate the budget or change legacy behavior.
    assert ai._call_llm("PAIR_OUTPUT_VERIFY/v2", []) == "legacy text"
    assert calls[0][0]["max_tokens"] == 1024 and calls[0][1] == {"timeout": 30}
    assert len(calls) == 1


@pytest.mark.parametrize("change", [
    {"stop_reason": x} for x in ("max_tokens", "tool_use", "pause_turn", "refusal",
                                "model_context_window_exceeded", "stop_sequence", "unknown", None, 1)
] + [{"stop_sequence": "unexpected"}, {"finish_reason": "length"},
     {"finish_reason": None}, {"type": "error"}, {"role": "user"}, {"error": {"message": "private"}}])
def test_incomplete_or_conflicting_envelope_is_not_approval(monkeypatch, change):
    calls, response = http_response(monkeypatch, envelope(verdict(), **change))
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and response.closed


@pytest.mark.parametrize("field", ["stop_reason", "content", "type", "role"])
def test_required_envelope_fields_cannot_be_guessed(monkeypatch, field):
    value = envelope(verdict()); del value[field]
    calls, response = http_response(monkeypatch, value)
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and response.closed


@pytest.mark.parametrize("content", [None, {}, [], ["text"], [{"text": verdict()}],
    [{"type": "text", "text": 1}], [{"type": "text", "text": ""}],
    [{"type": "thinking", "thinking": "not a verdict"}],
    [{"type": "tool_use", "text": verdict()}],
    [{"type": "unknown", "text": verdict()}]])
def test_non_text_and_malformed_blocks_cannot_be_used(monkeypatch, content):
    calls, response = http_response(monkeypatch, envelope("", content=content))
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and response.closed


def test_separate_thinking_never_enters_returned_verdict(monkeypatch):
    calls, response = http_response(monkeypatch, envelope("", finish_reason="stop", content=[
        {"type": "thinking", "thinking": "synthetic hidden", "text": "not JSON"},
        {"type": "redacted_thinking", "data": "synthetic"},
        {"type": "text", "text": verdict()},
    ]))
    assert ai._call_verifier("verify", []) == verdict()
    assert len(calls) == 1 and response.closed


@pytest.mark.parametrize("raw", [b"broken", b"[]", b"null", b"x" * 65537,
    json.dumps(envelope("x" * 1501)).encode()], ids=["bad-json", "array", "null", "body-limit", "text-limit"])
def test_bad_or_oversized_wire_never_reaches_semantic_parser(monkeypatch, raw):
    calls, response = http_response(monkeypatch, raw)
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and response.closed


@pytest.mark.parametrize("phase", ["open", "read", "close"])
def test_transport_error_has_no_retry_and_no_exception_detail(monkeypatch, phase):
    calls, closes = [], []
    class Broken:
        def read(self, size):
            if phase == "read": raise TimeoutError("private response detail")
            return json.dumps(envelope(verdict())).encode()
        def close(self):
            closes.append(1)
            if phase == "close": raise OSError("private close detail")
    def transport(*args, **kwargs):
        calls.append(1)
        if phase == "open": raise TimeoutError("private provider detail")
        return Broken()
    monkeypatch.setattr(ai.urllib.request, "urlopen", transport)
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and len(closes) == (0 if phase == "open" else 1)


def test_duplicate_completion_fields_cannot_override_truncation(monkeypatch):
    raw = json.dumps(envelope(verdict())).replace('"stop_reason": "end_turn"',
        '"stop_reason": "max_tokens", "stop_reason": "end_turn"').encode()
    calls, response = http_response(monkeypatch, raw)
    assert ai._call_verifier("verify", []) is None
    assert len(calls) == 1 and response.closed
