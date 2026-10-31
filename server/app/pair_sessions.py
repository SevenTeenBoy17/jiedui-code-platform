"""Trusted, classroom-only session metadata. Intentionally not called by AI yet."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, StrictBool

from app.auth import current_user
from app import store_pair_sessions as P
from app import pair_ai_context as AI

P.init_tables()
router = APIRouter(prefix="/api/pair/sessions", tags=["可信结对会话"])
RequestKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")]
PositiveId = Annotated[int, Field(strict=True, gt=0, le=9223372036854775807)]


class SessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    class_id: PositiveId
    push_id: PositiveId
    attempt_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    human_role: Literal["driver", "navigator"]
    request_id: RequestKey
    purpose: Literal["classroom"] = "classroom"


class RoundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: RequestKey


class PolicyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scaffold: Annotated[int, Field(strict=True, ge=0, le=3)]
    socratic: StrictBool


class StrictChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: RequestKey
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    persona: Literal["guide", "review"]
    project_version_id: PositiveId | None = None


def _call(fn, *args):
    try:
        return fn(*args)
    except P.ContextError as exc:
        raise HTTPException(exc.status, exc.detail) from None


@router.post("", status_code=201)
def create(req: SessionRequest, actor=Depends(current_user)):
    return _call(P.create_session, actor, req.model_dump())


@router.get("/capabilities")
def capabilities(actor=Depends(current_user)):
    return AI.capabilities()


@router.get("/available")
def available(actor=Depends(current_user)):
    return _call(AI.available, actor)


@router.put("/{session_id}/ai-policy")
def configure_policy(session_id: str, req: PolicyRequest, actor=Depends(current_user)):
    return _call(AI.set_policy, actor, session_id, req.scaffold, req.socratic)


@router.post("/{session_id}/rounds/{round_id}/chat")
def trusted_chat(session_id: str, round_id: str, req: StrictChatRequest, actor=Depends(current_user)):
    return AI.chat(actor, session_id, round_id, req.model_dump())


@router.get("/{session_id}/ai-requests/{request_id}")
def request_status(session_id: str, request_id: str, actor=Depends(current_user)):
    return _call(AI.request_status, actor, session_id, request_id)


@router.get("/{session_id}")
def read(session_id: str, actor=Depends(current_user)):
    return _call(P.read_session, session_id, actor)


@router.post("/{session_id}/rounds", status_code=201)
def next_round(session_id: str, req: RoundRequest, actor=Depends(current_user)):
    return _call(P.create_round, session_id, actor, req.request_id)


@router.post("/{session_id}/rounds/{round_id}/close")
def end_round(session_id: str, round_id: str, actor=Depends(current_user)):
    return _call(P.close_round, session_id, round_id, actor)


@router.post("/{session_id}/close")
def end_session(session_id: str, actor=Depends(current_user)):
    return _call(P.close_session, session_id, actor)
