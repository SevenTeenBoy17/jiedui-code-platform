"""Public API for stable evidence pointers and evidence-backed inferences."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import store, store_evidence as E
from app.auth import current_user


router = APIRouter(prefix="/api/evidence", tags=["证据合同"])


def _role(user: dict) -> str:
    return user.get("role", "")


def _uid(user: dict) -> str:
    return user.get("sub", "anon")


def _staff(user: dict) -> None:
    if _role(user) not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师或研究员权限")


def _attempt_for_user(attempt_id: str, user: dict) -> dict:
    attempt = E.get_attempt(attempt_id)
    if not attempt:
        raise HTTPException(404, "任务尝试不存在")
    if _role(user) not in ("teacher", "researcher") and attempt["student_id"] != _uid(user):
        raise HTTPException(403, "只能访问自己的任务尝试")
    return attempt


def _translate_error(exc: Exception):
    if isinstance(exc, LookupError):
        raise HTTPException(404, str(exc))
    if isinstance(exc, ValueError):
        raise HTTPException(400, str(exc))
    raise exc


class AttemptCreate(BaseModel):
    student_id: str | None = None
    task_id: str
    unit_id: str | None = None
    project_id: int | None = None
    language: Literal["python", "cpp", "c", "blocks"]
    stage: Literal["task", "analysis", "model", "code", "test", "reflection"] = "task"
    ai_condition: Literal["none", "low", "standard", "high"] = "standard"
    status: Literal["active", "completed", "abandoned"] = "active"
    started_at: int | None = None


class AttemptPatch(BaseModel):
    project_id: int | None = None
    stage: Literal["task", "analysis", "model", "code", "test", "reflection"] | None = None
    ai_condition: Literal["none", "low", "standard", "high"] | None = None
    status: Literal["active", "completed", "abandoned"] | None = None
    ended_at: int | None = None


class EvidenceCreate(BaseModel):
    scope: Literal["task", "unit"]
    source_type: Literal["ct_event", "project_version", "design_artifact"]
    source_id: int | None = None
    quality_status: Literal["verified", "conflicted", "missing"] = "verified"
    missing_reason: str | None = None
    consent_basis: str


class InferenceCreate(BaseModel):
    scope: Literal["task", "unit"]
    construct_name: str = Field(alias="construct")
    level: str
    claim: str
    confidence: float
    rule_version: str
    support_evidence_ids: list[str]
    conflict_evidence_ids: list[str] = Field(default_factory=list)
    status: Literal["tentative", "teacher_confirmed", "corrected", "withdrawn"] = "tentative"


@router.post("/attempts")
def attempt_create(req: AttemptCreate, user: dict = Depends(current_user)):
    if _role(user) in ("teacher", "researcher"):
        student_id = (req.student_id or "").strip()
        if not student_id:
            raise HTTPException(400, "教师或研究员创建尝试时必须提供 student_id")
    else:
        if req.student_id and req.student_id != _uid(user):
            raise HTTPException(403, "学生不能替他人创建任务尝试")
        student_id = _uid(user)
    try:
        return E.create_attempt(
            student_id, req.task_id, req.unit_id, req.project_id, req.language,
            req.stage, req.ai_condition, req.status, req.started_at,
        )
    except Exception as exc:
        _translate_error(exc)


@router.get("/attempts")
def attempt_list(student_id: str = "", task_id: str = "", unit_id: str = "",
                 user: dict = Depends(current_user)):
    if _role(user) in ("teacher", "researcher"):
        sid = student_id.strip()
        if not sid:
            raise HTTPException(400, "student_id 不能为空")
    else:
        if student_id and student_id != _uid(user):
            raise HTTPException(403, "只能查看自己的任务尝试")
        sid = _uid(user)
    return {"items": E.list_attempts(sid, task_id or None, unit_id or None)}


@router.get("/attempts/{attempt_id}")
def attempt_get(attempt_id: str, scope: Literal["task", "unit"],
                user: dict = Depends(current_user)):
    attempt = _attempt_for_user(attempt_id, user)
    try:
        evidence = E.list_evidence(attempt_id, scope)
    except Exception as exc:
        _translate_error(exc)
    return {**attempt, "evidence": evidence}


@router.patch("/attempts/{attempt_id}")
def attempt_update(attempt_id: str, req: AttemptPatch,
                   user: dict = Depends(current_user)):
    _attempt_for_user(attempt_id, user)
    try:
        updated = E.update_attempt(attempt_id, req.model_dump(exclude_none=True))
    except Exception as exc:
        _translate_error(exc)
    if not updated:
        raise HTTPException(404, "任务尝试不存在")
    return updated


@router.post("/attempts/{attempt_id}/items")
def evidence_attach(attempt_id: str, req: EvidenceCreate,
                    user: dict = Depends(current_user)):
    _attempt_for_user(attempt_id, user)
    try:
        return E.register_evidence(
            attempt_id, req.scope, req.source_type, req.source_id,
            req.quality_status, req.missing_reason, req.consent_basis, _uid(user),
        )
    except Exception as exc:
        _translate_error(exc)


@router.get("/items/{evidence_id}/original")
def evidence_original(evidence_id: str, user: dict = Depends(current_user)):
    evidence = E.get_evidence(evidence_id)
    if not evidence:
        raise HTTPException(404, "证据不存在")
    if _role(user) not in ("teacher", "researcher") and evidence["student_id"] != _uid(user):
        raise HTTPException(403, "只能查看自己的原始证据")
    if _role(user) == "researcher" and not store.has_consent(evidence["student_id"]):
        raise HTTPException(403, "CONSENT_REQUIRED")
    resolved = E.resolve_evidence_original(evidence_id)
    if not resolved:
        raise HTTPException(404, "证据不存在")
    if resolved.get("integrity") == "source_changed_or_missing":
        raise HTTPException(409, "原件已缺失或版本不一致")
    return resolved


@router.post("/inferences")
def inference_create(req: InferenceCreate, user: dict = Depends(current_user)):
    _staff(user)
    try:
        return E.create_inference(
            req.scope, req.construct_name, req.level, req.claim, req.confidence,
            req.rule_version, req.support_evidence_ids, req.conflict_evidence_ids,
            req.status, _uid(user),
        )
    except Exception as exc:
        _translate_error(exc)


@router.get("/inferences")
def inference_list(scope: Literal["task", "unit"], scope_ref: str,
                   student_id: str = "", user: dict = Depends(current_user)):
    if _role(user) in ("teacher", "researcher"):
        sid = student_id.strip()
        if not sid:
            raise HTTPException(400, "student_id 不能为空")
    else:
        if student_id and student_id != _uid(user):
            raise HTTPException(403, "只能查看自己的推断")
        sid = _uid(user)
    try:
        if not scope_ref.strip():
            raise ValueError("scope_ref 不能为空")
        return {"items": E.list_inferences(sid, scope, scope_ref.strip())}
    except Exception as exc:
        _translate_error(exc)


@router.get("/profile")
def profile(scope: Literal["task", "unit"], scope_ref: str,
            student_id: str = "", user: dict = Depends(current_user)):
    if _role(user) in ("teacher", "researcher"):
        sid = student_id.strip()
        if not sid:
            raise HTTPException(400, "student_id 不能为空")
    else:
        if student_id and student_id != _uid(user):
            raise HTTPException(403, "只能查看自己的画像")
        sid = _uid(user)
    if not scope_ref.strip():
        raise HTTPException(400, "scope_ref 不能为空")
    return E.profile_levels(sid, scope, scope_ref.strip())
