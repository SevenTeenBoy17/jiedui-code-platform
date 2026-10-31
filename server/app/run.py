"""代码运行端点（真实执行）。"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app import executor
from app.auth import current_user

router = APIRouter(prefix="/api", tags=["运行"])


class RunReq(BaseModel):
    language: str  # python | cpp | c
    code: str


@router.post("/run")
def run(req: RunReq, user: dict = Depends(current_user)):
    return executor.execute(req.language, req.code)
