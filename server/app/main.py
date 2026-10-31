"""
结对编程智能体平台 · 后端（S1-10 起步）。
FastAPI + 真实三语言执行 + JWT 鉴权。CORS 开发放开（生产用 CORS_ORIGINS 白名单）。
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth import router as auth_router
from app.run import router as run_router
from app.projects import router as projects_router
from app.ct import router as ct_router
from app.ai import router as ai_router
from app.compliance import router as compliance_router
from app.teacher import router as teacher_router
from app.research import router as research_router
from app.resources import router as resources_router
from app.insights import router as insights_router
from app.study import router as study_router
from app.learner import router as learner_router
from app.obs import router as obs_router
from app.evidence import router as evidence_router
from app.pair_sessions import router as pair_sessions_router

app = FastAPI(title="Jiedui Platform API", version="0.1.0")

_cors = os.getenv("CORS_ORIGINS", "*").strip()
if _cors == "*":
    origins, creds = ["*"], False
else:
    origins, creds = [o.strip() for o in _cors.split(",") if o.strip()], True
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=creds,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(auth_router)
app.include_router(run_router)
app.include_router(projects_router)
app.include_router(ct_router)
app.include_router(ai_router)
app.include_router(compliance_router)
app.include_router(teacher_router)
app.include_router(research_router)
app.include_router(resources_router)
app.include_router(insights_router)
app.include_router(study_router)
app.include_router(learner_router)
app.include_router(obs_router)
app.include_router(evidence_router)
app.include_router(pair_sessions_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "jiedui-api"}


# ============ 单进程部署：直接伺服前端构建产物 ============
# 进校部署的人是老师不是运维 —— 「起两个服务再配反向代理」在机房里等于不可部署。
# `web/dist` 存在就挂载（`npm run build` 的产物），一个进程一个端口跑完整平台；
# 不存在则保持纯 API（开发照旧走 Vite 代理）。挂载在所有 API 路由之后，/api/* 不受影响。
_DIST = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "web", "dist"))
if os.path.isdir(_DIST):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        """vue-router 用 history 模式：/teacher/research/study 这类前端路由在服务器上
        没有对应文件，刷新会 404 —— 除静态文件外一律回落到 index.html（SPA 惯例）。"""
        full = os.path.normpath(os.path.join(_DIST, path))
        # normpath 之后仍要确认没有越出 dist（路径穿越防线）
        if full.startswith(_DIST + os.sep) and os.path.isfile(full):
            return FileResponse(full)
        return FileResponse(os.path.join(_DIST, "index.html"))
