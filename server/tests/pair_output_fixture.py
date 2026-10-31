"""External-provider fixtures only; never substitute production output validators.

The canned semantic verdict represents the provider boundary for deterministic
lifecycle tests. These fixtures do not establish real-model semantic accuracy.
"""
import json


VERIFY_MARKER = "PAIR_OUTPUT_VERIFY/v2"


def patch_provider(monkeypatch, call):
    """Patch both explicit external-call seams, never output/context validators."""
    from app import ai
    monkeypatch.setattr(ai, "_call_llm", call)
    monkeypatch.setattr(ai, "_call_verifier", call)


def provider_envelope(text):
    """A complete Messages response, not only its extracted text."""
    return {"type": "message", "role": "assistant", "stop_reason": "end_turn",
            "stop_sequence": None,
            "content": [{"type": "text", "text": text}] if text is not None else []}


def candidate(question="你准备怎样检查？", feedback="可以先核对本次任务的目标。", example=""):
    return json.dumps({"feedback": feedback, "questions": [question], "example": example}, ensure_ascii=False)


def verdict(*, target="检查方法", explanation_requested=False):
    # Explicit canned boundary data, not a classifier derived from the candidate.
    return json.dumps({"question_count": 1, "single_focus": True,
                      "feedback_declarative": True, "policy_compliant": True,
                      "task_faithful": True, "no_full_solution": True,
                      "no_false_execution": True, "question_targets": [[target]],
                      "explanation_requested": explanation_requested})


def model_reply(system, messages, *, question="你准备怎样检查？", feedback="可以先核对本次任务的目标。"):
    return verdict() if VERIFY_MARKER in system else candidate(question, feedback)
