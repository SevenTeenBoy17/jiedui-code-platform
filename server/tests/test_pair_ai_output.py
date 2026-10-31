"""Output boundary contract: real routes/storage, doubles only at provider I/O."""
import json
import pytest
from app import ai, store
from test_pair_context import ctx, create
from test_pair_ai_context import STRICT, policy, ask
from pair_output_fixture import patch_provider

pytestmark = pytest.mark.skipif(not STRICT, reason="strict isolated startup only")

GOOD = {"feedback": "可以先想一想循环的次数。", "questions": ["正方形有几条边？"], "example": ""}
APPROVED = {"question_count": 1, "single_focus": True, "feedback_declarative": True,
            "policy_compliant": True, "task_faithful": True, "no_full_solution": True,
            "no_false_execution": True, "question_targets": [["正方形边数"]],
            "explanation_requested": False}

def wire(value):
    return json.dumps(value, ensure_ascii=False)

def provider(monkeypatch, candidate=GOOD, verdict=APPROVED, effect=None):
    calls = []
    def call(system, messages):
        calls.append((system, messages))
        if effect:
            effect(len(calls))
        return (candidate if isinstance(candidate, str) else wire(candidate)) if len(calls) == 1 else (verdict if verdict is None or isinstance(verdict, str) else wire(verdict))
    patch_provider(monkeypatch, call)
    return calls

@pytest.mark.parametrize("candidate", [
    "你想画六边形，对吗？一整圈是多少度？每个转角是多少？",
    {**GOOD, "questions": ["对吗？", "一整圈是多少度？", "每个转角是多少？"]},
    {**GOOD, "questions": ["有几条边？转多少度？"]},
    {**GOOD, "feedback": "对吗？"},
    {**GOOD, "extra": "ignore schema"},
    {**GOOD, "example": "print(1)"},
    '{"feedback":"","feedback":"x","questions":["为什么？"],"example":""}',
    '```json\n' + wire(GOOD) + '\n```',
    {**GOOD, "questions": []},
    {**GOOD, "questions": [True]},
])
def test_invalid_shape_withheld_terminal_and_no_verifier(client, ctx, monkeypatch, candidate):
    session = create(client, ctx); policy(client, ctx, session, 3, True)
    calls = provider(monkeypatch, candidate)
    result = ask(client, ctx, session, request_id="rejected-output")
    assert result.status_code == 422, result.text
    detail = result.json()["detail"]
    assert detail["code"] == "OUTPUT_CONSTRAINT_FAILED"
    assert detail["receipt"]["status"] == "failed"
    assert detail["receipt"]["reason_code"] == "OUTPUT_CONSTRAINT_FAILED"
    assert "reply" not in result.json() and len(calls) == 1
    assert ask(client, ctx, session, request_id="rejected-output").status_code == 409
    assert len(calls) == 1
    with store._conn() as c:
        row = dict(c.execute('SELECT * FROM pair_ai_requests WHERE session_id=?', (session['session_id'],)).fetchone())
        assert row['status'] == 'failed' and not {'reply', 'candidate', 'verdict'} & row.keys()

@pytest.mark.parametrize("verdict", [None, 'not-json', {**APPROVED,"single_focus":False},
    {**APPROVED,"question_count":3}, {**APPROVED,"question_count":True},
    {**APPROVED,"policy_compliant":1}, {**APPROVED,"task_faithful":"true"},
    {**APPROVED,"other":True}, {k:v for k,v in APPROVED.items() if k!='no_false_execution'},
])
def test_semantic_rejection_or_unavailable_never_falls_back(client, ctx, monkeypatch, verdict):
    session = create(client, ctx); policy(client, ctx, session)
    calls = provider(monkeypatch, verdict=verdict)
    result = ask(client, ctx, session)
    assert result.status_code == 422, result.text
    assert result.json()['detail']['receipt']['status'] == 'failed'
    assert len(calls) == 2 and 'reply' not in result.json()

def test_valid_reply_uses_two_calls_and_no_wire_markup(client, ctx, monkeypatch):
    session = create(client, ctx); policy(client, ctx, session)
    calls = provider(monkeypatch)
    result = ask(client, ctx, session)
    assert result.status_code == 200, result.text
    value = result.json()
    assert value['reply'] == '可以先想一想循环的次数。\n\n正方形有几条边？'
    assert len(calls) == 2 and value['source'] == 'model'
    assert value['receipt']['prompt_version'] == 'ai-prompt/v2-context2-output2.1'
    assert 'PAIR_OUTPUT_VERIFY/v2' in calls[1][0]
    assert GOOD['feedback'] not in calls[1][0] and GOOD['feedback'] in str(calls[1][1])

@pytest.mark.parametrize('moment', [1,2])
def test_context_change_before_or_during_verification_wins(client, ctx, monkeypatch, moment):
    session = create(client, ctx); policy(client, ctx, session)
    def effect(index):
        if index == moment:
            store.withdraw_consent(ctx['uid'])
    calls = provider(monkeypatch, effect=effect)
    result = ask(client, ctx, session)
    assert result.status_code in (403,404,409), result.text
    assert len(calls) == moment and 'reply' not in result.json()
    with store._conn() as c:
        row = c.execute('SELECT status FROM pair_ai_requests WHERE session_id=?',(session['session_id'],)).fetchone()
        assert row is None or row[0] == 'invalidated'

@pytest.mark.parametrize('persona,scaffold,socratic,allowed', [
    ('guide',0,False,True),('guide',3,True,False),('review',0,False,False),
    ('review',1,False,False),('review',2,False,False),('review',3,False,True)])
def test_example_respects_effective_policy(client, ctx, monkeypatch, persona, scaffold, socratic, allowed):
    session=create(client,ctx); policy(client,ctx,session,scaffold,socratic)
    # Preserve the policy oracle; make the allowed example genuinely request an
    # explanation so the newly required gate is not bypassed by a lying fixture.
    calls=provider(monkeypatch,{**GOOD,'example':'print(len([1, 2]))',
                               'questions':['len 在这个局部示例中起什么作用？']},
                   {**APPROVED,'question_targets':[['len作用']],'explanation_requested':True})
    result=ask(client,ctx,session,persona=persona)
    assert result.status_code == (200 if allowed else 422),result.text
    assert len(calls) == (2 if allowed else 1)


def test_unicode_escaped_identifier_scrubbed_after_json_decode(client, ctx, monkeypatch):
    session=create(client,ctx); policy(client,ctx,session)
    # Invented test identifier, deliberately encoded on the provider wire.
    encoded=''.join('\\u%04x' % ord(c) for c in '13800138000')
    raw=wire({**GOOD,'feedback':'合成联系方式：IDENTIFIER'}).replace('IDENTIFIER',encoded)
    calls=provider(monkeypatch,raw)
    result=ask(client,ctx,session)
    assert result.status_code==200,result.text
    assert '13800138000' not in str(calls[1])
    assert '13800138000' not in result.json()['reply']
    assert '[phone_1]' in result.json()['reply']


@pytest.mark.parametrize('change', [
    {'explanation_requested': False},
    {'question_count': 2},
    {'question_targets': [['DO-NOT-STORE-TARGET', '额外作答目标']]},
])
def test_v2_verdict_failure_preserves_terminal_privacy_and_no_replay(client, ctx, monkeypatch, change):
    session = create(client, ctx); policy(client, ctx, session, 3, False)
    example = {**GOOD, 'example': 'print(len([1, 2]))',
               'questions': ['len 在这个局部示例中起什么作用？']}
    approval = {**APPROVED, 'question_targets': [['DO-NOT-STORE-TARGET']],
                'explanation_requested': True, **change}
    calls = provider(monkeypatch, example, approval)
    result = ask(client, ctx, session, persona='review', request_id='v2-rejected')
    assert result.status_code == 422, result.text
    detail = result.json()['detail']
    assert detail['code'] == 'OUTPUT_CONSTRAINT_FAILED'
    assert detail['receipt']['status'] == 'failed' and detail['receipt']['source'] is None
    assert len(calls) == 2 and 'reply' not in result.json()
    assert 'DO-NOT-STORE-TARGET' not in result.text and 'print(len' not in result.text
    current = client.get(f'/api/pair/sessions/{session["session_id"]}/ai-requests/v2-rejected',
                         headers=ctx['student'])
    assert current.status_code == 200 and current.json() == detail['receipt']
    assert ask(client, ctx, session, persona='review', request_id='v2-rejected').status_code == 409
    assert len(calls) == 2
    with store._conn() as c:
        row = dict(c.execute('SELECT * FROM pair_ai_requests WHERE session_id=?',
                             (session['session_id'],)).fetchone())
        assert row['status'] == 'failed'
        assert not {'reply', 'candidate', 'verdict', 'question_targets', 'explanation_requested'} & row.keys()
        assert 'DO-NOT-STORE-TARGET' not in str(row) and 'print(len' not in str(row)


@pytest.mark.parametrize('second_label', ['角度', ' 角度 '])
def test_v2_duplicate_labels_across_individually_valid_rows_are_rejected(client, ctx, monkeypatch, second_label):
    session = create(client, ctx); policy(client, ctx, session)
    candidate = {**GOOD, 'questions': ['一整圈多少度？', '每次转多少度？']}
    calls = provider(monkeypatch, candidate, {**APPROVED, 'question_count': 2,
                     'question_targets': [['角度'], [second_label]]})
    result = ask(client, ctx, session)
    assert result.status_code == 422, result.text
    assert result.json()['detail']['receipt']['status'] == 'failed'
    assert len(calls) == 2 and 'reply' not in result.json()


def test_v2_max_length_target_is_private_even_after_release(client, ctx, monkeypatch):
    session = create(client, ctx); policy(client, ctx, session)
    # Deliberately opaque canned metadata tests the boundary, not target semantics.
    marker = '私密标签' * 15
    assert len(marker) == 60
    calls = provider(monkeypatch, verdict={**APPROVED, 'question_targets': [[marker]]})
    result = ask(client, ctx, session)
    assert result.status_code == 200, result.text
    assert result.json()['receipt']['status'] == 'released' and result.json()['source'] == 'model'
    assert len(calls) == 2 and marker not in result.text
    assert 'question_targets' not in result.text and 'explanation_requested' not in result.text
    with store._conn() as c:
        row = dict(c.execute('SELECT * FROM pair_ai_requests WHERE session_id=?',
                             (session['session_id'],)).fetchone())
        assert row['status'] == 'released' and marker not in str(row)
        assert not {'reply', 'candidate', 'verdict', 'question_targets', 'explanation_requested'} & row.keys()
