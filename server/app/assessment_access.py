"""Shared independent-assessment window; no new evidence, scores or body logs.

Reuse first-open, response and paper-close facts. Short database transactions
must never span a model/network call.
"""
from contextlib import closing, contextmanager
import time

from fastapi import HTTPException
from app import store

POLICY_VERSION = "assessment-ai-guard/v1"
PROCESS_HELP = ("你有已打开的独立测评，或本次请求期间打开过测评，本次 AI 内容帮助已暂停。"
                "请先独立完成并提交；遇到操作问题或需要中止时请联系发卷老师。"
                "关闭页面不会结束测评。所有已打开的测评提交或由老师关卷后，可重新请求 AI 帮助。")


@contextmanager
def _transaction(*, write=False):
    with closing(store._conn()) as c, c:
        c.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield c


def _consent(c, uid):
    r = c.execute("SELECT consent_at,withdrawn_at FROM guardian_consents WHERE user_id=?", (uid,)).fetchone()
    if not r or not r["consent_at"] or r["withdrawn_at"]:
        raise HTTPException(403, "CONSENT_REQUIRED")


def window_reason(c, paper):
    """Match existing submit semantics; study timestamps are not paper closure."""
    if paper["closed_at"]:
        return "这份测评已经关窗，不能再取卷或提交了"
    if paper["kind"] == "pre":
        # Same lookup as legacy study_by_pre_assessment, including old data.
        owner = c.execute("SELECT phase FROM studies WHERE pre_assessment_id=?", (paper["id"],)).fetchone()
        if owner and owner["phase"] in ("posttest", "closed"):
            return "课题已进入后测阶段，前测窗口已关闭，不能再补交前测"
    return None


def _answerable(c, aid, uid):
    _consent(c, uid)
    assigned = c.execute(
        "SELECT 1 FROM pushes p JOIN push_targets t ON t.push_id=p.id "
        "WHERE p.res_type='assessment' AND p.res_id=? AND t.student_id=? LIMIT 1", (aid, uid)).fetchone()
    paper = c.execute("SELECT id,kind,closed_at FROM assessments WHERE id=?", (aid,)).fetchone()
    if not assigned or not paper:
        raise HTTPException(404, "测评不存在")
    reason = window_reason(c, paper)
    if reason:
        raise HTTPException(409, reason)
    if c.execute("SELECT 1 FROM assessment_responses WHERE assessment_id=? AND student_id=?", (aid, uid)).fetchone():
        raise HTTPException(409, "你已经交过这份卷子了")


@contextmanager
def answer_transaction(aid, uid):
    """Recheck permission/window and write first-open or response atomically."""
    with _transaction(write=True) as c:
        _answerable(c, aid, uid)
        yield c


def begin(aid, uid):
    with answer_transaction(aid, uid) as c:
        c.execute("INSERT OR IGNORE INTO assessment_open_log(assessment_id,student_id,opened_at) VALUES(?,?,?)",
                  (aid, uid, int(time.time())))


def ensure_answerable(aid, uid):
    with _transaction() as c:
        _answerable(c, aid, uid)


def close_owned(aid, user):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    with _transaction(write=True) as c:
        row = c.execute("SELECT created_by FROM assessments WHERE id=?", (aid,)).fetchone()
        if not row or row["created_by"] != user.get("sub"):
            raise HTTPException(404, "测评不存在")
        now = int(time.time())
        c.execute("UPDATE assessments SET closed_at=?,updated_at=? WHERE id=? AND closed_at IS NULL", (now, now, aid))
        closed_at = c.execute("SELECT closed_at FROM assessments WHERE id=?", (aid,)).fetchone()[0]
        return {"ok": True, "closed": True, "closed_at": closed_at}


def _state(c, uid):
    _consent(c, uid)
    opened = frozenset(r[0] for r in c.execute(
        "SELECT assessment_id FROM assessment_open_log WHERE student_id=?", (uid,)).fetchall())
    candidates = c.execute(
        "SELECT a.id,a.kind,a.closed_at FROM assessment_open_log o "
        "JOIN assessments a ON a.id=o.assessment_id "
        "WHERE o.student_id=? AND NOT EXISTS (SELECT 1 FROM assessment_responses r "
        "WHERE r.assessment_id=o.assessment_id AND r.student_id=o.student_id)", (uid,)).fetchall()
    # No push pagination, done_at or current-class filter.
    active_count = sum(window_reason(c, a) is None for a in candidates)
    return opened, active_count


def model_permit(uid, previous=None):
    """Point-in-time permit; new first-open invalidates in-flight output."""
    with _transaction() as c:
        opened, active = _state(c, uid)
    if active or (previous is not None and opened != previous):
        raise HTTPException(423, PROCESS_HELP, headers={"X-Assessment-Policy": POLICY_VERSION})
    return opened


def process_help(uid):
    with _transaction() as c:
        _, active = _state(c, uid)
    return {"policy_version": POLICY_VERSION, "mode": "process_only" if active else "normal",
            "active_count": active,
            "message": PROCESS_HELP if active else "没有已打开且未结束的测评。你可以在测评中心查看老师的安排。",
            "steps": ["在测评中心查看自己的安排", "提交后查看是否显示已提交", "操作故障或需要中止时联系发卷老师"]}
