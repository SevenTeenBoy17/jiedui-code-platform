"""Evidence-backed learning contracts.

This module deliberately stores only stable pointers to original learning artefacts.
Code, design payloads, and event detail stay in their source tables and are resolved
only after the API has performed role/consent checks.
"""
from __future__ import annotations

import sqlite3
import uuid

from app import store


SCOPES = ("task", "unit")
WORKFLOW_STAGES = ("task", "analysis", "model", "code", "test", "reflection")
LANGUAGES = ("python", "cpp", "c", "blocks")
ATTEMPT_STATUSES = ("active", "completed", "abandoned")
AI_CONDITIONS = ("none", "low", "standard", "high")
SOURCE_TYPES = ("ct_event", "project_version", "design_artifact")
QUALITY_STATUSES = ("verified", "conflicted", "missing")
INFERENCE_STATUSES = ("tentative", "teacher_confirmed", "corrected", "withdrawn")
RELATIONS = ("support", "conflict")
CONSTRUCT_SOURCES = ("project_version", "design_artifact")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _require(value, allowed: tuple[str, ...], field: str) -> str:
    if value not in allowed:
        raise ValueError(f"{field} 必须是 {'|'.join(allowed)}")
    return value


def _foreign_key_contract(c, table: str) -> set[tuple[str, str, str, str]]:
    """Return the enforced FK shape used by the evidence-chain migration."""
    return {
        (row["from"], row["table"], row["to"], str(row["on_delete"]).upper())
        for row in c.execute(f"PRAGMA foreign_key_list({table})").fetchall()
    }


def _migrate_foreign_keys(c) -> None:
    """Add evidence-chain foreign keys to databases created before this slice.

    SQLite cannot add foreign keys with ALTER TABLE. Rebuild the two child tables
    atomically after proving that no orphan would be hidden or discarded. Evidence
    deletion is RESTRICTed while an inference still cites it, so a retained inference
    can never silently lose its original pointer. Subject erasure deletes the links
    explicitly before deleting evidence and therefore remains deterministic.
    """
    required_evidence = {
        ("attempt_id", "task_attempts", "attempt_id", "CASCADE"),
    }
    required_links = {
        ("inference_id", "inferences", "inference_id", "CASCADE"),
        ("evidence_id", "evidence_items", "evidence_id", "RESTRICT"),
    }
    if required_evidence <= _foreign_key_contract(c, "evidence_items") \
            and required_links <= _foreign_key_contract(c, "inference_evidence"):
        return

    orphan_counts = {
        "evidence_without_attempt": c.execute(
            "SELECT COUNT(*) FROM evidence_items e LEFT JOIN task_attempts a "
            "ON a.attempt_id=e.attempt_id WHERE a.attempt_id IS NULL"
        ).fetchone()[0],
        "link_without_inference": c.execute(
            "SELECT COUNT(*) FROM inference_evidence ie LEFT JOIN inferences i "
            "ON i.inference_id=ie.inference_id WHERE i.inference_id IS NULL"
        ).fetchone()[0],
        "link_without_evidence": c.execute(
            "SELECT COUNT(*) FROM inference_evidence ie LEFT JOIN evidence_items e "
            "ON e.evidence_id=ie.evidence_id WHERE e.evidence_id IS NULL"
        ).fetchone()[0],
    }
    if any(orphan_counts.values()):
        detail = ", ".join(f"{key}={value}" for key, value in orphan_counts.items() if value)
        raise RuntimeError(f"证据链外键迁移发现孤儿记录，已停止且未丢弃数据：{detail}")

    legacy_names = {"evidence_items_legacy_fk", "inference_evidence_legacy_fk"}
    existing_legacy = {
        row[0] for row in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)",
            tuple(sorted(legacy_names)),
        ).fetchall()
    }
    if existing_legacy:
        raise RuntimeError("证据链外键迁移检测到未完成的旧表，请先人工核验数据")

    try:
        c.executescript(
            """
            BEGIN IMMEDIATE;
            ALTER TABLE inference_evidence RENAME TO inference_evidence_legacy_fk;
            ALTER TABLE evidence_items RENAME TO evidence_items_legacy_fk;

            CREATE TABLE evidence_items(
              evidence_id TEXT PRIMARY KEY,
              attempt_id TEXT NOT NULL,
              scope TEXT NOT NULL CHECK(scope IN ('task','unit')),
              source_type TEXT NOT NULL
                CHECK(source_type IN ('ct_event','project_version','design_artifact')),
              source_id INTEGER,
              source_version TEXT,
              quality_status TEXT NOT NULL
                CHECK(quality_status IN ('verified','conflicted','missing')),
              missing_reason TEXT,
              consent_basis TEXT NOT NULL CHECK(length(trim(consent_basis)) > 0),
              created_by TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              CHECK(
                (quality_status='missing' AND source_id IS NULL
                  AND source_version IS NULL AND length(trim(missing_reason)) > 0)
                OR
                (quality_status!='missing' AND source_id IS NOT NULL
                  AND source_version IS NOT NULL AND missing_reason IS NULL)
              ),
              FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
                ON DELETE CASCADE
            );

            CREATE TABLE inference_evidence(
              inference_id TEXT NOT NULL,
              evidence_id TEXT NOT NULL,
              relation TEXT NOT NULL CHECK(relation IN ('support','conflict')),
              PRIMARY KEY(inference_id, evidence_id),
              FOREIGN KEY(inference_id) REFERENCES inferences(inference_id)
                ON DELETE CASCADE,
              FOREIGN KEY(evidence_id) REFERENCES evidence_items(evidence_id)
                ON DELETE RESTRICT
            );

            INSERT INTO evidence_items(
              evidence_id,attempt_id,scope,source_type,source_id,source_version,
              quality_status,missing_reason,consent_basis,created_by,created_at
            )
            SELECT evidence_id,attempt_id,scope,source_type,source_id,source_version,
                   quality_status,missing_reason,consent_basis,created_by,created_at
            FROM evidence_items_legacy_fk;
            INSERT INTO inference_evidence(inference_id,evidence_id,relation)
            SELECT inference_id,evidence_id,relation
            FROM inference_evidence_legacy_fk;

            DROP TABLE inference_evidence_legacy_fk;
            DROP TABLE evidence_items_legacy_fk;
            CREATE INDEX idx_ev_attempt
              ON evidence_items(attempt_id, created_at, evidence_id);
            CREATE UNIQUE INDEX idx_ev_pointer_unique
              ON evidence_items(attempt_id, scope, source_type, source_id)
              WHERE source_id IS NOT NULL;
            CREATE INDEX idx_ie_evidence
              ON inference_evidence(evidence_id, inference_id);
            COMMIT;
            """
        )
    except Exception:
        if c.in_transaction:
            c.rollback()
        raise

    if not required_evidence <= _foreign_key_contract(c, "evidence_items") \
            or not required_links <= _foreign_key_contract(c, "inference_evidence"):
        raise RuntimeError("证据链外键迁移后合同校验失败")
    violations = list(c.execute("PRAGMA foreign_key_check(evidence_items)"))
    violations += list(c.execute("PRAGMA foreign_key_check(inference_evidence)"))
    if violations:
        raise RuntimeError("证据链外键迁移后仍存在引用完整性错误")


def init() -> None:
    with store._lock, store._conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS task_attempts(
              attempt_id TEXT PRIMARY KEY,
              student_id TEXT NOT NULL,
              task_id TEXT NOT NULL,
              unit_id TEXT,
              project_id INTEGER,
              language TEXT NOT NULL
                CHECK(language IN ('python','cpp','c','blocks')),
              stage TEXT NOT NULL
                CHECK(stage IN ('task','analysis','model','code','test','reflection')),
              ai_condition TEXT NOT NULL
                CHECK(ai_condition IN ('none','low','standard','high')),
              status TEXT NOT NULL
                CHECK(status IN ('active','completed','abandoned')),
              started_at INTEGER NOT NULL,
              ended_at INTEGER,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ta_student
              ON task_attempts(student_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ta_task
              ON task_attempts(student_id, task_id, started_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ta_unit
              ON task_attempts(student_id, unit_id, started_at DESC);

            CREATE TABLE IF NOT EXISTS evidence_items(
              evidence_id TEXT PRIMARY KEY,
              attempt_id TEXT NOT NULL,
              scope TEXT NOT NULL CHECK(scope IN ('task','unit')),
              source_type TEXT NOT NULL
                CHECK(source_type IN ('ct_event','project_version','design_artifact')),
              source_id INTEGER,
              source_version TEXT,
              quality_status TEXT NOT NULL
                CHECK(quality_status IN ('verified','conflicted','missing')),
              missing_reason TEXT,
              consent_basis TEXT NOT NULL CHECK(length(trim(consent_basis)) > 0),
              created_by TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              CHECK(
                (quality_status='missing' AND source_id IS NULL
                  AND source_version IS NULL AND length(trim(missing_reason)) > 0)
                OR
                (quality_status!='missing' AND source_id IS NOT NULL
                  AND source_version IS NOT NULL AND missing_reason IS NULL)
              ),
              FOREIGN KEY(attempt_id) REFERENCES task_attempts(attempt_id)
                ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_ev_attempt
              ON evidence_items(attempt_id, created_at, evidence_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ev_pointer_unique
              ON evidence_items(attempt_id, scope, source_type, source_id)
              WHERE source_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS inferences(
              inference_id TEXT PRIMARY KEY,
              student_id TEXT NOT NULL,
              scope TEXT NOT NULL CHECK(scope IN ('task','unit')),
              task_id TEXT,
              unit_id TEXT,
              construct TEXT NOT NULL CHECK(length(trim(construct)) > 0),
              level TEXT NOT NULL CHECK(length(trim(level)) > 0),
              claim TEXT NOT NULL CHECK(length(trim(claim)) > 0),
              confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
              rule_version TEXT NOT NULL CHECK(length(trim(rule_version)) > 0),
              status TEXT NOT NULL
                CHECK(status IN ('tentative','teacher_confirmed','corrected','withdrawn')),
              created_by TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              CHECK((scope='task' AND task_id IS NOT NULL AND unit_id IS NULL)
                    OR (scope='unit' AND unit_id IS NOT NULL AND task_id IS NULL))
            );
            CREATE INDEX IF NOT EXISTS idx_inf_student_scope
              ON inferences(student_id, scope, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_inf_task
              ON inferences(student_id, task_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_inf_unit
              ON inferences(student_id, unit_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS inference_evidence(
              inference_id TEXT NOT NULL,
              evidence_id TEXT NOT NULL,
              relation TEXT NOT NULL CHECK(relation IN ('support','conflict')),
              PRIMARY KEY(inference_id, evidence_id),
              FOREIGN KEY(inference_id) REFERENCES inferences(inference_id)
                ON DELETE CASCADE,
              FOREIGN KEY(evidence_id) REFERENCES evidence_items(evidence_id)
                ON DELETE RESTRICT
            );
            CREATE INDEX IF NOT EXISTS idx_ie_evidence
              ON inference_evidence(evidence_id, inference_id);
            """
        )
        _migrate_foreign_keys(c)


def _attempt_row(c, attempt_id: str):
    return c.execute(
        "SELECT * FROM task_attempts WHERE attempt_id=?", (attempt_id,)
    ).fetchone()


def create_attempt(student_id: str, task_id: str, unit_id: str | None,
                   project_id: int | None, language: str, stage: str = "task",
                   ai_condition: str = "standard", status: str = "active",
                   started_at: int | None = None) -> dict:
    student_id = (student_id or "").strip()
    task_id = (task_id or "").strip()
    unit_id = (unit_id or "").strip() or None
    if not student_id or not task_id:
        raise ValueError("student_id 与 task_id 不能为空")
    _require(language, LANGUAGES, "language")
    _require(stage, WORKFLOW_STAGES, "stage")
    _require(ai_condition, AI_CONDITIONS, "ai_condition")
    _require(status, ATTEMPT_STATUSES, "status")
    now = store._now()
    attempt_id = _new_id("att")
    with store._lock, store._conn() as c:
        if project_id is not None:
            project = c.execute(
                "SELECT owner_id FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if not project or project["owner_id"] != student_id:
                raise ValueError("project_id 不属于该学生")
        c.execute(
            "INSERT INTO task_attempts(attempt_id,student_id,task_id,unit_id,project_id,"
            "language,stage,ai_condition,status,started_at,ended_at,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (attempt_id, student_id, task_id, unit_id, project_id, language, stage,
             ai_condition, status, int(started_at or now), None, now, now),
        )
    return get_attempt(attempt_id)


def get_attempt(attempt_id: str) -> dict | None:
    with store._conn() as c:
        row = _attempt_row(c, attempt_id)
        return dict(row) if row else None


def list_attempts(student_id: str, task_id: str | None = None,
                  unit_id: str | None = None, limit: int = 100) -> list[dict]:
    sql = "SELECT * FROM task_attempts WHERE student_id=?"
    args: list = [student_id]
    if task_id:
        sql += " AND task_id=?"
        args.append(task_id)
    if unit_id:
        sql += " AND unit_id=?"
        args.append(unit_id)
    sql += " ORDER BY started_at DESC, attempt_id DESC LIMIT ?"
    args.append(max(1, min(int(limit), 500)))
    with store._conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def update_attempt(attempt_id: str, patch: dict) -> dict | None:
    allowed = {"project_id", "stage", "ai_condition", "status", "ended_at"}
    unknown = set(patch) - allowed
    if unknown:
        raise ValueError(f"不可更新字段：{','.join(sorted(unknown))}")
    if "stage" in patch:
        _require(patch["stage"], WORKFLOW_STAGES, "stage")
    if "ai_condition" in patch:
        _require(patch["ai_condition"], AI_CONDITIONS, "ai_condition")
    if "status" in patch:
        _require(patch["status"], ATTEMPT_STATUSES, "status")
    if not patch:
        raise ValueError("没有要更新的字段")
    now = store._now()
    patch = dict(patch)
    if patch.get("status") in ("completed", "abandoned") and "ended_at" not in patch:
        patch["ended_at"] = now
    sets = [f"{key}=?" for key in patch]
    args = list(patch.values()) + [now, attempt_id]
    with store._lock, store._conn() as c:
        attempt_row = _attempt_row(c, attempt_id)
        if not attempt_row:
            return None
        if patch.get("project_id") is not None:
            project = c.execute(
                "SELECT owner_id FROM projects WHERE id=?", (patch["project_id"],)
            ).fetchone()
            if not project or project["owner_id"] != attempt_row["student_id"]:
                raise ValueError("project_id 不属于该学生")
        c.execute(
            f"UPDATE task_attempts SET {','.join(sets)},updated_at=? WHERE attempt_id=?", args
        )
        row = _attempt_row(c, attempt_id)
        return dict(row)


def _resolve_source(c, source_type: str, source_id: int) -> dict | None:
    _require(source_type, SOURCE_TYPES, "source_type")
    if source_type == "ct_event":
        row = c.execute(
            "SELECT id,user_id AS owner_id,type,detail,project_id,ts,"
            "COALESCE(sv,1) AS source_version,round_index,room_id,lang,edit_mode "
            "FROM ct_events WHERE id=?", (source_id,),
        ).fetchone()
    elif source_type == "project_version":
        row = c.execute(
            "SELECT v.id,p.owner_id,v.project_id,v.version_no AS source_version,"
            "v.code,v.block_state,v.created_at,p.language "
            "FROM project_versions v JOIN projects p ON p.id=v.project_id WHERE v.id=?",
            (source_id,),
        ).fetchone()
    else:
        row = c.execute(
            "SELECT id,owner_id,project_id,1 AS source_version,type,payload,created_at "
            "FROM design_artifacts WHERE id=?", (source_id,),
        ).fetchone()
    if not row:
        return None
    out = dict(row)
    out["source_type"] = source_type
    out["source_version"] = str(out["source_version"])
    return out


def resolve_source(source_type: str, source_id: int) -> dict | None:
    with store._conn() as c:
        return _resolve_source(c, source_type, int(source_id))


def _evidence_dict(row) -> dict:
    d = dict(row)
    d["source"] = {
        "type": d["source_type"],
        "id": d["source_id"],
        "version": d["source_version"],
    }
    return d


def register_evidence(attempt_id: str, scope: str, source_type: str,
                      source_id: int | None, quality_status: str,
                      missing_reason: str | None, consent_basis: str,
                      created_by: str) -> dict:
    _require(scope, SCOPES, "scope")
    _require(source_type, SOURCE_TYPES, "source_type")
    _require(quality_status, QUALITY_STATUSES, "quality_status")
    consent_basis = (consent_basis or "").strip()
    missing_reason = (missing_reason or "").strip() or None
    if not consent_basis:
        raise ValueError("consent_basis 不能为空")
    with store._lock, store._conn() as c:
        attempt_row = _attempt_row(c, attempt_id)
        if not attempt_row:
            raise LookupError("任务尝试不存在")
        attempt = dict(attempt_row)
        if scope == "unit" and not attempt.get("unit_id"):
            raise ValueError("该任务尝试没有 unit_id，不能登记单元级证据")
        source_version = None
        if quality_status == "missing":
            if source_id is not None:
                raise ValueError("缺失证据不能绑定 source_id")
            if not missing_reason:
                raise ValueError("缺失证据必须说明 missing_reason")
        else:
            if source_id is None:
                raise ValueError("非缺失证据必须提供 source_id")
            original = _resolve_source(c, source_type, int(source_id))
            if not original:
                raise LookupError("原始证据不存在")
            if original["owner_id"] != attempt["student_id"]:
                raise ValueError("原始证据不属于该任务尝试的学生")
            source_project = original.get("project_id")
            if attempt.get("project_id") is not None and source_project is not None \
                    and int(source_project) != int(attempt["project_id"]):
                raise ValueError("原始证据不属于该任务尝试的作品")
            source_version = original["source_version"]
            missing_reason = None
        evidence_id = _new_id("ev")
        try:
            c.execute(
                "INSERT INTO evidence_items(evidence_id,attempt_id,scope,source_type,source_id,"
                "source_version,quality_status,missing_reason,consent_basis,created_by,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (evidence_id, attempt_id, scope, source_type, source_id, source_version,
                 quality_status, missing_reason, consent_basis, created_by, store._now()),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("该原件已登记为本次尝试的同范围证据") from exc
        row = c.execute(
            "SELECT e.*,a.student_id,a.task_id,a.unit_id,a.project_id "
            "FROM evidence_items e JOIN task_attempts a ON a.attempt_id=e.attempt_id "
            "WHERE e.evidence_id=?", (evidence_id,),
        ).fetchone()
        return _evidence_dict(row)


def get_evidence(evidence_id: str) -> dict | None:
    with store._conn() as c:
        row = c.execute(
            "SELECT e.*,a.student_id,a.task_id,a.unit_id,a.project_id "
            "FROM evidence_items e JOIN task_attempts a ON a.attempt_id=e.attempt_id "
            "WHERE e.evidence_id=?", (evidence_id,),
        ).fetchone()
        return _evidence_dict(row) if row else None


def list_evidence(attempt_id: str, scope: str | None = None) -> list[dict]:
    if scope is not None:
        _require(scope, SCOPES, "scope")
    sql = (
        "SELECT e.*,a.student_id,a.task_id,a.unit_id,a.project_id "
        "FROM evidence_items e JOIN task_attempts a ON a.attempt_id=e.attempt_id "
        "WHERE e.attempt_id=?"
    )
    args: list = [attempt_id]
    if scope:
        sql += " AND e.scope=?"
        args.append(scope)
    with store._conn() as c:
        return [_evidence_dict(r) for r in c.execute(
            sql + " ORDER BY e.created_at,e.evidence_id", args
        ).fetchall()]


def resolve_evidence_original(evidence_id: str) -> dict | None:
    evidence = get_evidence(evidence_id)
    if not evidence:
        return None
    if evidence["quality_status"] == "missing":
        return {"evidence": evidence, "original": None}
    original = resolve_source(evidence["source_type"], evidence["source_id"])
    if not original or original["source_version"] != evidence["source_version"]:
        return {"evidence": evidence, "original": None, "integrity": "source_changed_or_missing"}
    return {"evidence": evidence, "original": original, "integrity": "verified_pointer"}


def _load_evidence_set(c, evidence_ids: list[str]) -> list[dict]:
    if not evidence_ids:
        return []
    q = ",".join("?" * len(evidence_ids))
    rows = c.execute(
        f"SELECT e.*,a.student_id,a.task_id,a.unit_id,a.project_id "
        f"FROM evidence_items e JOIN task_attempts a ON a.attempt_id=e.attempt_id "
        f"WHERE e.evidence_id IN ({q})", evidence_ids,
    ).fetchall()
    by_id = {r["evidence_id"]: _evidence_dict(r) for r in rows}
    missing = [eid for eid in evidence_ids if eid not in by_id]
    if missing:
        raise LookupError(f"证据不存在：{','.join(missing)}")
    return [by_id[eid] for eid in evidence_ids]


def _inference_dict(c, row) -> dict:
    d = dict(row)
    links = c.execute(
        "SELECT evidence_id,relation FROM inference_evidence WHERE inference_id=? "
        "ORDER BY relation,evidence_id", (d["inference_id"],),
    ).fetchall()
    d["evidence"] = [dict(link) for link in links]
    d["support_evidence_ids"] = [link["evidence_id"] for link in links if link["relation"] == "support"]
    d["conflict_evidence_ids"] = [link["evidence_id"] for link in links if link["relation"] == "conflict"]
    d["scope_ref"] = d["task_id"] if d["scope"] == "task" else d["unit_id"]
    return d


def create_inference(scope: str, construct: str, level: str, claim: str,
                     confidence: float, rule_version: str,
                     support_evidence_ids: list[str], conflict_evidence_ids: list[str] | None,
                     status: str, created_by: str) -> dict:
    _require(scope, SCOPES, "scope")
    _require(status, INFERENCE_STATUSES, "status")
    construct, level = (construct or "").strip(), (level or "").strip()
    claim, rule_version = (claim or "").strip(), (rule_version or "").strip()
    if not construct or not level or not claim or not rule_version:
        raise ValueError("construct、level、claim、rule_version 均不能为空")
    confidence = float(confidence)
    if not 0 <= confidence <= 1:
        raise ValueError("confidence 必须在 0-1 之间")
    support_ids = list(dict.fromkeys(support_evidence_ids or []))
    conflict_ids = list(dict.fromkeys(conflict_evidence_ids or []))
    if not support_ids:
        raise ValueError("推断至少需要一条支持证据")
    if set(support_ids) & set(conflict_ids):
        raise ValueError("同一证据不能同时支持并冲突")
    all_ids = support_ids + conflict_ids
    with store._lock, store._conn() as c:
        items = _load_evidence_set(c, all_ids)
        if any(item["quality_status"] == "missing" for item in items):
            raise ValueError("缺失项不能作为推断的支持或冲突证据")
        students = {item["student_id"] for item in items}
        if len(students) != 1:
            raise ValueError("一次推断只能使用同一学生的证据")
        if any(item["scope"] != scope for item in items):
            raise ValueError("推断 scope 与证据 scope 不一致")
        supports = [item for item in items if item["evidence_id"] in support_ids]
        if not any(item["source_type"] in CONSTRUCT_SOURCES for item in supports):
            raise ValueError("行为次数不能独立形成能力推断；至少需要作品版本或设计产物证据")
        if scope == "task":
            refs = {item["task_id"] for item in items}
            if len(refs) != 1:
                raise ValueError("任务级推断不能混合多个 task_id")
            task_id, unit_id = next(iter(refs)), None
        else:
            refs = {item["unit_id"] for item in items}
            if None in refs or len(refs) != 1:
                raise ValueError("单元级推断不能混合或缺少 unit_id")
            task_id, unit_id = None, next(iter(refs))
        now = store._now()
        inference_id = _new_id("inf")
        c.execute(
            "INSERT INTO inferences(inference_id,student_id,scope,task_id,unit_id,construct,level,"
            "claim,confidence,rule_version,status,created_by,created_at,updated_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (inference_id, next(iter(students)), scope, task_id, unit_id, construct, level,
             claim, confidence, rule_version, status, created_by, now, now),
        )
        for evidence_id in support_ids:
            c.execute(
                "INSERT INTO inference_evidence(inference_id,evidence_id,relation) VALUES(?,?,'support')",
                (inference_id, evidence_id),
            )
        for evidence_id in conflict_ids:
            c.execute(
                "INSERT INTO inference_evidence(inference_id,evidence_id,relation) VALUES(?,?,'conflict')",
                (inference_id, evidence_id),
            )
        row = c.execute("SELECT * FROM inferences WHERE inference_id=?", (inference_id,)).fetchone()
        return _inference_dict(c, row)


def get_inference(inference_id: str) -> dict | None:
    with store._conn() as c:
        row = c.execute("SELECT * FROM inferences WHERE inference_id=?", (inference_id,)).fetchone()
        return _inference_dict(c, row) if row else None


def list_inferences(student_id: str, scope: str | None = None,
                    scope_ref: str | None = None,
                    statuses: tuple[str, ...] | None = None) -> list[dict]:
    if scope is not None:
        _require(scope, SCOPES, "scope")
    sql = "SELECT * FROM inferences WHERE student_id=?"
    args: list = [student_id]
    if scope:
        sql += " AND scope=?"
        args.append(scope)
    if scope_ref:
        if not scope:
            raise ValueError("scope_ref 必须与 scope 一起使用")
        sql += " AND " + ("task_id=?" if scope == "task" else "unit_id=?")
        args.append(scope_ref)
    if statuses:
        for status in statuses:
            _require(status, INFERENCE_STATUSES, "status")
        sql += f" AND status IN ({','.join('?' * len(statuses))})"
        args.extend(statuses)
    # 同一秒内可能连续确认/撤回；rowid 保留真实插入先后，不能拿随机 UUID 排新旧。
    sql += " ORDER BY updated_at DESC,rowid DESC"
    with store._conn() as c:
        return [_inference_dict(c, row) for row in c.execute(sql, args).fetchall()]


def profile_levels(student_id: str, scope: str, scope_ref: str | None = None) -> dict:
    """Return only evidence-backed, human-confirmed/corrected levels.

    An omitted scope_ref is deliberately insufficient: aggregating all tasks or units
    would recreate the forbidden mixed-scope total score. No ct-event/count fallback
    exists in this function.
    """
    _require(scope, SCOPES, "scope")
    base = {"status": "insufficient_evidence", "scope": scope, "scope_ref": scope_ref,
            "levels": {}, "inferences": [], "evidence_count": 0}
    if not scope_ref:
        return base
    # 先取每个构念的最新版本，再判断状态。若先过滤 withdrawn/tentative，旧的
    # teacher_confirmed 会在撤回后“复活”，违背可撤销推断合同。
    history = list_inferences(student_id, scope=scope, scope_ref=scope_ref)
    latest: dict[str, dict] = {}
    for row in history:
        latest.setdefault(row["construct"], row)
    rows = [row for row in latest.values()
            if row["status"] in ("teacher_confirmed", "corrected")]
    levels: dict[str, str] = {}
    evidence_ids: set[str] = set()
    for row in rows:
        levels.setdefault(row["construct"], row["level"])
        evidence_ids.update(link["evidence_id"] for link in row["evidence"])
    return {**base,
            "status": "evidence_backed" if levels else "insufficient_evidence",
            "levels": levels, "inferences": rows, "evidence_count": len(evidence_ids)}


init()
