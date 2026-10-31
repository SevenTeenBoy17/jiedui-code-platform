"""M1a classroom context only. No model policy enforcement or research assignment.

All source checks and mutations share an IMMEDIATE transaction. Never call a
legacy store helper while holding store._lock (it is not reentrant).
"""
from contextlib import closing, contextmanager
import hashlib
import json
import os
import uuid

from app import store

CONTRACT_VERSION = "pair-context/v1"


class ContextError(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail
        super().__init__(detail)


@contextmanager
def _transaction():
    with store._lock, closing(store._conn()) as c, c:
        c.execute("BEGIN IMMEDIATE")
        yield c


def init_tables(connection=None):
    """Additive, repeatable migration; failed DDL rolls back as a unit."""
    if connection is None:
        with _transaction() as c:
            init_tables(c)
        return
    c = connection
    c.execute("SAVEPOINT pair_context_schema")
    try:
        c.execute("""CREATE TABLE IF NOT EXISTS pair_sessions (
            session_id TEXT PRIMARY KEY,
            contract_version TEXT NOT NULL,
            teacher_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            class_id INTEGER NOT NULL,
            push_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            attempt_id TEXT NOT NULL UNIQUE REFERENCES task_attempts(attempt_id) ON DELETE CASCADE,
            project_id INTEGER,
            language TEXT NOT NULL CHECK(language IN ('python','cpp','c','blocks')),
            human_role TEXT NOT NULL CHECK(human_role IN ('driver','navigator')),
            status TEXT NOT NULL CHECK(status IN ('active','closed','revoked')),
            request_id TEXT NOT NULL,
            request_fingerprint TEXT NOT NULL,
            task_snapshot_id TEXT NOT NULL UNIQUE,
            task_snapshot TEXT NOT NULL,
            task_snapshot_hash TEXT NOT NULL,
            consent_at INTEGER NOT NULL,
            retention_policy_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
            ended_at INTEGER,
            revoked_at INTEGER,
            UNIQUE(teacher_id, request_id)
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS pair_rounds (
            round_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES pair_sessions(session_id) ON DELETE CASCADE,
            round_index INTEGER NOT NULL CHECK(round_index > 0),
            request_id TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            UNIQUE(session_id, round_index), UNIQUE(session_id, request_id)
        )""")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS pair_one_open_round ON pair_rounds(session_id) WHERE ended_at IS NULL")
        c.execute("CREATE INDEX IF NOT EXISTS pair_sessions_student ON pair_sessions(student_id)")
        c.execute("CREATE INDEX IF NOT EXISTS pair_sessions_expiry ON pair_sessions(expires_at)")
        if "ai_policy_json" not in {r[1] for r in c.execute("PRAGMA table_info(pair_sessions)")}:
            c.execute("ALTER TABLE pair_sessions ADD COLUMN ai_policy_json TEXT")
        c.execute("""CREATE TABLE IF NOT EXISTS pair_ai_requests (
            session_id TEXT NOT NULL REFERENCES pair_sessions(session_id) ON DELETE CASCADE,
            round_id TEXT NOT NULL REFERENCES pair_rounds(round_id) ON DELETE CASCADE,
            request_id TEXT NOT NULL, student_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
            task_snapshot_id TEXT NOT NULL, task_snapshot_hash TEXT NOT NULL,
            project_version_id INTEGER, version_no INTEGER, code_hash TEXT, code_source TEXT NOT NULL,
            requested_persona TEXT NOT NULL, effective_role TEXT NOT NULL,
            assigned_scaffold INTEGER NOT NULL, scaffold_applied INTEGER NOT NULL,
            socratic INTEGER NOT NULL, override_reason TEXT, policy_hash TEXT NOT NULL,
            context_version TEXT NOT NULL, prompt_version TEXT NOT NULL,
            configured_model TEXT NOT NULL, provider_model_version TEXT,
            source TEXT CHECK(source IN ('model','fallback')),
            status TEXT NOT NULL CHECK(status IN ('pending','released','invalidated','failed')),
            reason_code TEXT, created_at INTEGER NOT NULL, finished_at INTEGER,
            PRIMARY KEY(session_id,request_id)
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS pair_ai_student ON pair_ai_requests(student_id)")
        c.execute("RELEASE pair_context_schema")
    except Exception:
        c.execute("ROLLBACK TO pair_context_schema")
        c.execute("RELEASE pair_context_schema")
        raise


def purge_expired():
    """Lazy cleanup of these TWO new tables only; not a scheduled retention job.

Separate commit ensures a subsequent rejected request cannot undo expiry cleanup.
Also called by subject lookup/export, never removes legacy attempts or artifacts.
"""
    with _transaction() as c:
        if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pair_sessions'").fetchone():
            c.execute("DELETE FROM pair_sessions WHERE expires_at<=?", (store._now(),))


def _retention(now):
    raw = os.getenv("PAIR_SESSION_RETENTION_SECONDS", "")
    policy = os.getenv("PAIR_SESSION_RETENTION_POLICY_ID", "").strip()
    # No implicit retention permission, no client-supplied deadline, no infinite default.
    if not raw.isascii() or not raw.isdigit() or len(raw) > 12 or not policy or len(policy) > 120:
        raise ContextError(503, "会话留存策略尚未配置，暂不能创建")
    seconds = int(raw)
    if seconds <= 0 or seconds > 253402300799 - now:
        raise ContextError(503, "会话留存策略无效，暂不能创建")
    return policy, now + seconds


def _research_gate(c, student_id, class_id):
    # Do not silently reinterpret legacy Socratic/usual-AI as AI/no-AI.
    # Conservative classroom exclusion while an associated study is active.
    current_classes = {r[0] for r in c.execute("SELECT class_id FROM class_students WHERE student_id=?", (student_id,))}
    current_classes.add(class_id)
    studies = c.execute("SELECT * FROM studies WHERE phase IN ('pretest','running','posttest')").fetchall()
    for study in studies:
        try:
            exp, ctrl = json.loads(study["exp_class_ids"]), json.loads(study["ctrl_class_ids"])
            if not isinstance(exp, list) or not isinstance(ctrl, list):
                raise ValueError("invalid class list")
            classes = exp + ctrl
            if any(type(cid) is not int for cid in classes):
                raise ValueError("invalid class identifier")
        except (ValueError, TypeError):
            raise ContextError(409, "研究班级配置待核实，暂不能使用普通会话") from None
        member = c.execute("SELECT 1 FROM study_members WHERE study_id=? AND student_id=?",
                           (study["id"], student_id)).fetchone()
        if current_classes.intersection(classes) or member:
            raise ContextError(409, "当前关联研究尚在进行，本会话接口未接入研究条件")


def _sources(c, teacher_id, class_id, push_id, attempt_id, frozen=None):
    classroom = c.execute("SELECT created_by FROM classes WHERE id=?", (class_id,)).fetchone()
    push = c.execute("SELECT * FROM pushes WHERE id=?", (push_id,)).fetchone()
    attempt = c.execute("SELECT * FROM task_attempts WHERE attempt_id=?", (attempt_id,)).fetchone()
    if not classroom or classroom["created_by"] != teacher_id or not push or push["created_by"] != teacher_id:
        raise ContextError(403, "无权关联此班级或任务推送")
    if not attempt or push["res_type"] != "exercise":
        raise ContextError(409, "需要可核验的编程任务尝试")
    uid = attempt["student_id"]
    if frozen and (uid != frozen["student_id"] or push["res_id"] != frozen["exercise_id"]
                   or attempt["project_id"] != frozen["project_id"] or attempt["language"] != frozen["language"]):
        raise ContextError(409, "会话原关联已改变，请核实后建立新尝试")
    if (not c.execute("SELECT 1 FROM class_students WHERE class_id=? AND student_id=?", (class_id, uid)).fetchone()
            or not c.execute("SELECT 1 FROM push_targets WHERE push_id=? AND student_id=?", (push_id, uid)).fetchone()):
        raise ContextError(403, "学生不在本班或未收到本次任务")
    consent = c.execute("SELECT consent_at,withdrawn_at FROM guardian_consents WHERE user_id=?", (uid,)).fetchone()
    if not consent or not consent["consent_at"] or consent["withdrawn_at"] is not None:
        raise ContextError(403, "需要有效的课堂数据授权")
    exercise = c.execute("SELECT * FROM exercises WHERE id=?", (push["res_id"],)).fetchone()
    if (not exercise or exercise["created_by"] != teacher_id or exercise["status"] != "published"
            or attempt["task_id"] != f'exercise:{push["res_id"]}'):
        raise ContextError(409, "任务来源不可核验或尚未发布")
    if not frozen and (exercise["language"] != attempt["language"] or attempt["status"] != "active"):
        raise ContextError(409, "任务语言不匹配或尝试已结束")
    if attempt["project_id"] is not None:
        project = c.execute("SELECT owner_id,language FROM projects WHERE id=?", (attempt["project_id"],)).fetchone()
        if not project or project["owner_id"] != uid or project["language"] != attempt["language"]:
            raise ContextError(409, "作品已删除、归属或语言不匹配")
    _research_gate(c, uid, class_id)
    return attempt, exercise, consent


def _load(c, session_id, actor, active=False):
    row = c.execute("SELECT * FROM pair_sessions WHERE session_id=?", (session_id,)).fetchone()
    allowed = row and ((actor.get("role") == "student" and actor.get("sub") == row["student_id"])
                       or (actor.get("role") == "teacher" and actor.get("sub") == row["teacher_id"]))
    if not allowed:
        raise ContextError(404, "会话不存在或不可访问")
    if row["status"] == "revoked":
        raise ContextError(403, "该会话的授权已撤回，不能恢复")
    if row["expires_at"] <= store._now():
        raise ContextError(410, "会话已到期")
    attempt, _, _ = _sources(c, row["teacher_id"], row["class_id"], row["push_id"], row["attempt_id"], row)
    if active and (row["status"] != "active" or attempt["status"] != "active"):
        raise ContextError(409, "会话或任务尝试已结束，不能添加轮次")
    return row


def _present(c, row):
    from app import pair_ai_context as AI
    result = {key: row[key] for key in (
        "session_id", "contract_version", "teacher_id", "student_id", "class_id", "push_id", "exercise_id",
        "attempt_id", "project_id", "language", "human_role", "status", "task_snapshot_id", "task_snapshot_hash",
        "created_at", "expires_at", "ended_at", "revoked_at", "retention_policy_id")}
    result.update({
        "mode": "student_ai", "scope": "task", "purpose": "classroom",
        "role_evidence": "teacher_assigned_not_observed",
        "task_version_status": "session_snapshot_only", "original_push_version": None,
        "task_snapshot": json.loads(row["task_snapshot"]),
        "authorization": {"basis": "existing_classroom_consent_not_research", "consent_at": row["consent_at"]},
        "policy": {"contract_version": CONTRACT_VERSION, "enforcement_status": "not_connected",
                   "assigned_condition": None, "research_batch": None},
        "retention_cleanup": "on_access_not_scheduled",
        "rounds": [dict(r) for r in c.execute("SELECT * FROM pair_rounds WHERE session_id=? ORDER BY round_index",
                                              (row["session_id"],))],
    })
    result["ai_policy"] = AI.read_policy(row, required=False)
    result["actions"] = AI.actions(c, row)
    return result


def _new_round(c, session_id, request_id):
    index = c.execute("SELECT COALESCE(MAX(round_index),0)+1 FROM pair_rounds WHERE session_id=?", (session_id,)).fetchone()[0]
    rid = "rnd_" + uuid.uuid4().hex
    c.execute("INSERT INTO pair_rounds(round_id,session_id,round_index,request_id,started_at) VALUES(?,?,?,?,?)",
              (rid, session_id, index, request_id, store._now()))
    return dict(c.execute("SELECT * FROM pair_rounds WHERE round_id=?", (rid,)).fetchone())


def create_session(actor, request):
    if actor.get("role") != "teacher" or not actor.get("sub"):
        raise ContextError(403, "仅负责本班的教师可以建立会话")
    purge_expired()
    fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    with _transaction() as c:
        previous = c.execute("SELECT * FROM pair_sessions WHERE teacher_id=? AND request_id=?",
                             (actor["sub"], request["request_id"])).fetchone()
        if previous:
            row = _load(c, previous["session_id"], actor)
            if row["request_fingerprint"] != fingerprint:
                raise ContextError(409, "同一请求编号不能用于不同内容")
            return _present(c, row)
        now = store._now()
        policy_id, expires = _retention(now)
        attempt, exercise, consent = _sources(c, actor["sub"], request["class_id"], request["push_id"], request["attempt_id"])
        if c.execute("SELECT 1 FROM pair_sessions WHERE attempt_id=?", (request["attempt_id"],)).fetchone():
            raise ContextError(409, "该尝试已有会话，请读取原会话或建立新尝试")
        # Explicit student-safe whitelist: NEVER snapshot reference_solution, hints or tests.
        snapshot = json.dumps({k: exercise[k] for k in ("title", "summary", "statement", "language", "starter_code")},
                              ensure_ascii=False, sort_keys=True)
        sid = "pair_" + uuid.uuid4().hex
        c.execute("""INSERT INTO pair_sessions(
            session_id,contract_version,teacher_id,student_id,class_id,push_id,exercise_id,attempt_id,project_id,
            language,human_role,status,request_id,request_fingerprint,task_snapshot_id,task_snapshot,task_snapshot_hash,
            consent_at,retention_policy_id,created_at,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?)""", (
                sid, CONTRACT_VERSION, actor["sub"], attempt["student_id"], request["class_id"], request["push_id"],
                exercise["id"], attempt["attempt_id"], attempt["project_id"], attempt["language"], request["human_role"],
                request["request_id"], fingerprint, "task_" + uuid.uuid4().hex, snapshot,
                hashlib.sha256(snapshot.encode()).hexdigest(), consent["consent_at"], policy_id, now, expires))
        _new_round(c, sid, "initial:" + request["request_id"])
        return _present(c, c.execute("SELECT * FROM pair_sessions WHERE session_id=?", (sid,)).fetchone())


def read_session(session_id, actor):
    purge_expired()
    with _transaction() as c:
        return _present(c, _load(c, session_id, actor))


def create_round(session_id, actor, request_id):
    purge_expired()
    with _transaction() as c:
        row = _load(c, session_id, actor, active=True)
        from app import pair_ai_context as AI
        if AI.MODE == "trusted_required":
            AI.read_policy(row)
            if AI.actions(c, row)["reason_code"] == "ASSESSMENT_ACTIVE":
                raise AI.error(423, "ASSESSMENT_ACTIVE", AI.A.PROCESS_HELP)
        previous = c.execute("SELECT * FROM pair_rounds WHERE session_id=? AND request_id=?", (session_id, request_id)).fetchone()
        if previous:
            return dict(previous)
        if c.execute("SELECT 1 FROM pair_rounds WHERE session_id=? AND ended_at IS NULL", (session_id,)).fetchone():
            raise ContextError(409, "请先结束当前轮次")
        return _new_round(c, session_id, request_id)


def close_round(session_id, round_id, actor):
    purge_expired()
    with _transaction() as c:
        _load(c, session_id, actor)
        row = c.execute("SELECT * FROM pair_rounds WHERE round_id=? AND session_id=?", (round_id, session_id)).fetchone()
        if not row:
            raise ContextError(404, "轮次不存在或不属于本会话")
        c.execute("UPDATE pair_rounds SET ended_at=COALESCE(ended_at,?) WHERE round_id=?", (store._now(), round_id))
        return dict(c.execute("SELECT * FROM pair_rounds WHERE round_id=?", (round_id,)).fetchone())


def close_session(session_id, actor):
    purge_expired()
    with _transaction() as c:
        _load(c, session_id, actor)
        now = store._now()
        c.execute("UPDATE pair_rounds SET ended_at=? WHERE session_id=? AND ended_at IS NULL", (now, session_id))
        c.execute("UPDATE pair_sessions SET status='closed',ended_at=COALESCE(ended_at,?) WHERE session_id=?", (now, session_id))
        return _present(c, c.execute("SELECT * FROM pair_sessions WHERE session_id=?", (session_id,)).fetchone())
