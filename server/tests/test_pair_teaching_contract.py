"""Teaching gate regression; canned provider verdicts are not semantic evidence."""
import json
import pytest
from app.pair_ai_output import OutputRejected, parse_candidate, verify_verdict
from test_pair_context import ctx, create
from test_pair_ai_context import STRICT, policy, ask
from pair_output_fixture import patch_provider

GOOD = {"feedback": "可以先辨认重复动作。", "questions": ["哪组动作会重复？"], "example": ""}
EXAMPLE = {"feedback": "示例只展示 max 对非空列表求最大值。空列表的处理需要你根据任务单独设计。",
           "questions": ["这个示例中的 max(scores) 会返回什么值？"],
           "example": "scores = [12, 7, 20]\nlargest = max(scores)\nprint(largest)"}
OLD = {"question_count": 1, "single_focus": True, "feedback_declarative": True,
       "policy_compliant": True, "task_faithful": True, "no_full_solution": True,
       "no_false_execution": True}
VALID = {**OLD, "question_targets": [["重复动作"]], "explanation_requested": False}

def wire(value):
    return json.dumps(value, ensure_ascii=False)

def test_old_unexplained_example_verdict_cannot_release():
    with pytest.raises(OutputRejected):
        verify_verdict(wire(OLD), EXAMPLE)

def test_single_target_without_example_does_not_require_explanation():
    verify_verdict(wire(VALID), GOOD)

def test_local_example_requires_explanation_verdict():
    with pytest.raises(OutputRejected):
        verify_verdict(wire(VALID), EXAMPLE)
    explanation = {**EXAMPLE, "questions": ["max 在这个示例中起什么作用？"]}
    verify_verdict(wire({**VALID, "question_targets": [["max作用"]], "explanation_requested": True}), explanation)

def test_two_separate_single_targets_are_allowed():
    candidate = {**GOOD, "questions": ["整圈多少度？", "每次转多少度？"]}
    verify_verdict(wire({**VALID, "question_count": 2, "question_targets": [["整圈角度"], ["单次转角"]]}), candidate)

@pytest.mark.parametrize("targets", [None, True, {}, [], ["目标"], [[]], [[True]], [[{}]],
    [[""]], [["  "]], [["a\nb"]], [["a\rb"]], [["a\tb"]], [["x" * 61]],
    [["角度", "次数"]], [["同一目标", "同一目标"]], [["重复动作"], ["次数"]]])
def test_malformed_or_compound_target_map_is_rejected(targets):
    with pytest.raises(OutputRejected):
        verify_verdict(wire({**VALID, "question_targets": targets}), GOOD)

@pytest.mark.parametrize("value", [None, 0, 1, "true", [], {}])
def test_explanation_flag_is_strict_boolean(value):
    with pytest.raises(OutputRejected):
        verify_verdict(wire({**VALID, "explanation_requested": value}), GOOD)

def test_compound_targets_rejected_even_if_count_is_self_consistent():
    candidate = {**GOOD, "questions": ["告诉我整圈角度，再说每个外角", "应重复几次"]}
    verdict = {**VALID, "question_count": 3, "question_targets": [["整圈角度", "单次外角"], ["重复次数"]]}
    with pytest.raises(OutputRejected):
        verify_verdict(wire(verdict), candidate)

def test_candidate_cannot_self_certify_explanation():
    with pytest.raises(OutputRejected):
        parse_candidate(wire({**EXAMPLE, "explanation_requested": True}),
                        {"policy": {"socratic": False, "scaffold": 3}, "applied": True})

@pytest.mark.skipif(not STRICT, reason="strict isolated startup only")
def test_old_p3_shape_is_withheld_on_public_route(client, ctx, monkeypatch):
    session = create(client, ctx)
    policy(client, ctx, session, 3, False)
    calls = []
    def provider(*args):
        calls.append(args)
        return wire(EXAMPLE if len(calls) == 1 else OLD)
    patch_provider(monkeypatch, provider)
    result = ask(client, ctx, session, persona="review", request_id="old-p3-regression")
    assert result.status_code == 422, result.text
    assert result.json()["detail"]["receipt"]["status"] == "failed"
    assert len(calls) == 2 and "reply" not in result.json()
    assert ask(client, ctx, session, persona="review", request_id="old-p3-regression").status_code == 409
    assert len(calls) == 2
