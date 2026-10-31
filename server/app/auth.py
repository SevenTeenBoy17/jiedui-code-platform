"""
鉴权（S1-10）。
JWT（PyJWT HS256，开发级；生产改 RS256 + aud 绑定，见 specs/IMPL-师生分离登录）。
演示密码 123456；账号最小化（未成年人合规：无手机号）。
"""
import os
import time
import jwt
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

from app import env as _env    # noqa: F401  先装载 server/.env 再读配置——不能依赖启动入口的导入顺序

SECRET = os.getenv("JIEDUI_JWT_SECRET", "jiedui-dev-secret-change-in-prod")
ALG = "HS256"
TTL = 60 * 60 * 12

# 教师口令：**配置了就强制**，不配保持演示模式（任意用户名 + 123456）。
# 演示模式下角色由登录页页签自选 —— 学生选「教师」页签就能拿到教师权限：
# 看全班预警原文、给自己开监护人同意、用 with_answers 拉整份标答卷。
# 机房里这不是假想敌，是第二节课就会有人试出来的事。进校部署必须设置
# JIEDUI_TEACHER_PASSWORD（见 docs/进校首日检查单）。
TEACHER_PASSWORD = os.getenv("JIEDUI_TEACHER_PASSWORD", "")

router = APIRouter(prefix="/api/auth", tags=["认证"])

ROLE_AUD = {"student": "jiedui:student", "teacher": "jiedui:teacher"}
DEMO_USERS = {
    "student": {"id": "stu-xiaoma", "name": "小码", "className": "初一(2)班"},
    "teacher": {"id": "tea-lishen", "name": "李深老师"},
}


class LoginReq(BaseModel):
    username: str
    password: str


def _issue(role: str, user: dict) -> str:
    now = int(time.time())
    payload = {"sub": user["id"], "name": user["name"], "role": role,
               "aud": ROLE_AUD[role], "iat": now, "exp": now + TTL}
    return jwt.encode(payload, SECRET, algorithm=ALG)


@router.post("/{role}/login")
def login(role: str, req: LoginReq):
    if role not in ROLE_AUD:
        raise HTTPException(400, "未知角色")
    if not req.username.strip() or not req.password.strip():
        raise HTTPException(400, "请输入账号和密码")
    if role == "teacher" and TEACHER_PASSWORD:
        # 教师口令一经配置即强制 —— 此时演示密码对教师页签失效
        if req.password != TEACHER_PASSWORD:
            raise HTTPException(401, "教师口令不正确")
    elif req.password != "123456":
        raise HTTPException(401, "演示密码为 123456")
    base = DEMO_USERS[role]
    # 按用户名派生唯一 id，保证每个学生/教师的作品与计算思维数据互相隔离
    uname = req.username.strip()
    if role == "student":
        user = {"id": f"stu-{uname}", "name": uname, "className": base.get("className"), "role": "student"}
    else:
        user = {"id": f"tea-{uname}", "name": base["name"], "role": "teacher"}
    token = _issue(role, user)
    return {"token": token, "user": user}


def decode(token: str, expected_aud: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALG], audience=expected_aud)
    except jwt.InvalidAudienceError:
        raise HTTPException(403, "令牌受众不匹配（跨端）")
    except jwt.PyJWTError:
        raise HTTPException(401, "无效或过期的令牌")


def current_user(authorization: str = Header(default="")) -> dict:
    """从 Bearer 取用户；不强制 aud（运行接口师生通用）。"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "缺少令牌")
    token = authorization[7:]
    try:
        return jwt.decode(token, SECRET, algorithms=[ALG], options={"verify_aud": False})
    except jwt.PyJWTError:
        raise HTTPException(401, "无效或过期的令牌")
