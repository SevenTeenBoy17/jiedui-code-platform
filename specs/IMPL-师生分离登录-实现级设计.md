# IMPL · 师生分离登录与 RBAC（教师端独立登录网址）· 实现级设计

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.4「师生分离与 RBAC」的实现级展开**，并落实 §3 决策 4「师生独立入口」。
> 版本：V1.0 ｜ 编写日期：2026-06-22 ｜ 作者：安全工程师
> 配套：`specs/IMPL-数据安全合规-实现级设计.md`（监护人同意门禁 `require_active_consent`、审计 `audit_logs`、最小采集）、`specs/phase2j-auth-persistence-contract.md`（现有会话持久化契约）。
> 安全基线（贯穿全文）：**默认拒绝（Default Deny）· 最小权限（Least Privilege）· 纵深防御（Defense in Depth）· 审计留痕（Auditable）**。

---

## 0. 目标、现状与硬约束

### 0.1 用户硬性要求（不可偏离）
1. 教师端与学生端**界面区分**（两套布局、两套视觉语言）。
2. 教师端**单独登录网址**进入（物理分离入口，不与学生端共用登录页）。
3. 栈：前端 Vue3 + TS（两套布局/两套路由守卫）；后端 FastAPI + PostgreSQL。

### 0.2 现状（CX `scripts/fullstack-server.mjs`）
| 维度 | 现状（实然） | 本文升级（应然） |
|---|---|---|
| 入口 | hash 路由 `#student/#teacher/#research` 同一 `index.html` 同一登录入口 | **物理分离**：`student.<域名>` / `teacher.<域名>`（或 `/` 与 `/teacher`），各自独立登录页 |
| 登录端点 | 单一 `POST /api/auth/login`，`body.role` 决定身份 | **拆分**：`POST /api/auth/student/login`、`POST /api/auth/teacher/login`，互不通用 |
| 令牌 | 随机 UUID 不透明令牌 → `sha256` 存 `db.sessions.tokenHash`；`X-CodeX-Session` 头 | **规范化 JWT**（`sub/role/aud/exp/iat/jti`，`aud` 区分受众）+ `sessions`/`token_blacklist` 表 |
| 鉴权 | `requireRole(req,res,db,roles)` 比对 `session.role` | FastAPI 依赖项 `get_current_user / require_student / require_teacher / require_researcher` + **`aud` 受众校验** |
| 数据隔离 | 无（教师可见全量 mock teacher 数据） | **数据域隔离**：教师仅见本班（`class_id`），学生仅见本人（`student_id`） |
| 审计 | `recordAuthEvent → authEvents`（环形 200 条） | `audit_logs`（login/logout/invalid-token/越权/跨端），统一与合规子系统同表 |

### 0.3 设计总纲（一句话）
> **两个入口、两类受众、一套默认拒绝的 RBAC**：物理分离的登录网址降低误入与攻击面；JWT 的 `aud` 让"教师令牌"与"学生令牌"在密码学上互不通用；接口级依赖项 + 行级数据域过滤实现"只能看到自己该看的"；登录后再经监护人同意门禁；全链路审计。

---

## 1. 入口分离方案（部署形态）

### 1.1 两套布局与路由空间
| 端 | 登录网址 | 应用根 | 布局 | JWT `aud` | 视觉 |
|---|---|---|---|---|---|
| 学生端 | `https://<域名>/login`（或 `student.<域名>/login`） | `/`、`/ide`、`/portfolio` | `StudentLayout` | `codex-student` | 教育蓝 `#4A90E2`+暖橙 `#F5A623`、pastel、吉祥物 |
| 教师端 | `https://teacher.<域名>/login`（或 `<域名>/teacher/login`） | `/teacher/*` | `TeacherLayout` | `codex-teacher` | 浅色数据大屏、蓝绿点缀、高密度 |
| 研究/管理 | `https://teacher.<域名>/research/login`（复用教师入口子路径） | `/research/*` | `ResearchLayout` | `codex-research` | 中性、表格密集、导出导向 |

> 研究端不单独建子域，**挂在教师子域下的独立路径**，因其用户量少且与教师管理共用基建；但 `aud` 仍独立（`codex-research`），令牌不与教师互通。

### 1.2 方案 A：独立子域（推荐）

```
student.jiedui.example.com   →  学生 SPA（Vite build:student）
teacher.jiedui.example.com   →  教师/研究 SPA（Vite build:teacher）
api.jiedui.example.com       →  FastAPI（单一后端，按 aud 分流）
```

```nginx
# /etc/nginx/conf.d/jiedui.conf —— 方案 A：独立子域
# 学生端子域
server {
    listen 443 ssl http2;
    server_name student.jiedui.example.com;
    ssl_certificate     /etc/ssl/jiedui/fullchain.pem;
    ssl_certificate_key /etc/ssl/jiedui/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;

    # 安全响应头（纵深防御）
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;            # 学生端禁止被任意 iframe 嵌套
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /srv/jiedui/student-dist;
    location / { try_files $uri $uri/ /index.html; }     # SPA history 回退
    location /api/ {
        proxy_pass https://api.jiedui.example.com;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;          # 供后端 IP 审计
    }
}

# 教师/研究端子域（与学生端物理隔离的站点）
server {
    listen 443 ssl http2;
    server_name teacher.jiedui.example.com;
    ssl_certificate     /etc/ssl/jiedui/fullchain.pem;
    ssl_certificate_key /etc/ssl/jiedui/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /srv/jiedui/teacher-dist;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ {
        proxy_pass https://api.jiedui.example.com;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# 强制 HTTPS
server {
    listen 80;
    server_name student.jiedui.example.com teacher.jiedui.example.com;
    return 301 https://$host$request_uri;
}
```

### 1.3 方案 B：路径前缀（单域同站）

```
jiedui.example.com/            →  学生 SPA（默认）
jiedui.example.com/teacher/    →  教师 SPA（独立 base、独立 bundle）
jiedui.example.com/api/        →  FastAPI
```

```nginx
# 方案 B：单域 + 路径前缀
server {
    listen 443 ssl http2;
    server_name jiedui.example.com;
    ssl_certificate     /etc/ssl/jiedui/fullchain.pem;
    ssl_certificate_key /etc/ssl/jiedui/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # 教师端：独立 SPA，vite base=/teacher/
    location /teacher/ {
        alias /srv/jiedui/teacher-dist/;
        try_files $uri $uri/ /teacher/index.html;
    }
    # 学生端：默认根
    location / {
        root /srv/jiedui/student-dist;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 1.4 两方案对比与推荐

| 维度 | 方案 A 独立子域 | 方案 B 路径前缀 |
|---|---|---|
| **入口分离强度** | ★★★ 物理站点隔离，DNS/证书/根目录皆独立 | ★★ 同站，靠路由前缀隔离 |
| **Cookie 隔离** | ★★★ 学生/教师 Cookie 天然按子域作用域隔离（`Domain` 不互通），杜绝令牌跨端泄漏 | ★ 同域 Cookie 共享，须靠 `Path` + `aud` 校验防混用，风险高 |
| **CSP/CORS 收敛** | ★★★ 可按端定制更严的 CSP 与 CORS 白名单 | ★★ 同源策略下需放宽以共存 |
| **攻击面** | ★★★ 教师子域可叠加 IP allowlist / 单独 WAF 策略 | ★★ 学生流量与教师流量同入口 |
| **运维成本** | 需多一条 DNS + 通配/多 SAN 证书 | 单证书单站点，最简单 |
| **本地开发** | 需 hosts 映射或 `*.localhost` | 直接 `/teacher` 即可 |
| **课题合规** | 教师端可独立做访问控制与审计边界 | 边界模糊，审计需额外区分 |

> **推荐：生产用方案 A（独立子域）**——Cookie 按子域隔离是阻断"学生端 XSS 偷教师令牌""教师令牌被学生页脚本读取"这类跨端横向移动的最强一道墙，契合课题"教师监管/未成年人保护"的隔离诉求；教师子域还可叠加 IP allowlist。**开发/小规模试点用方案 B**（零 DNS 成本），但**强制要求** `aud` 校验生效 + 教师令牌走 `Path=/teacher` 限定。两方案后端代码完全一致（仅 `aud`/CORS 白名单/Cookie `Domain` 配置不同），可平滑切换。

---

## 2. 认证（JWT 设计与签发/校验/刷新/吊销）

### 2.1 JWT 设计

采用**双令牌**：短时 `access_token`（JWT，无状态，15 分钟）+ 长时 `refresh_token`（不透明随机串，有状态，存 `sessions`，7 天）。Access JWT 用 **RS256 非对称签名**（私钥仅签发服务持有，校验侧只需公钥，便于多服务校验且不外泄签名密钥）。**绝不接受 `alg=none`，绝不接受 HS/RS 算法混淆。**

Access JWT Claims：

| Claim | 含义 | 示例 | 安全作用 |
|---|---|---|---|
| `sub` | 主体 ID（用户内部 ID，非姓名/手机号） | `"stu_8a1f"` / `"tch_2c0d"` | 最小化，避免 PII 入令牌 |
| `role` | 角色 | `"student"` / `"teacher"` / `"researcher"` | RBAC 判定基础 |
| `aud` | **受众**（区分学生/教师/研究端） | `"codex-student"` / `"codex-teacher"` / `"codex-research"` | **跨端令牌互不通用**：学生令牌 `aud` 不含 `codex-teacher`，教师接口拒绝 |
| `iss` | 签发方 | `"codex-auth"` | 校验来源，防伪造 |
| `exp` | 过期（绝对秒） | `1750579200` | 短时效，降低令牌被盗后的窗口 |
| `iat` | 签发时间 | `1750578300` | 配合 `nbf` 防重放/旧令牌 |
| `jti` | 令牌唯一 ID | `"a1b2c3d4-..."` | **吊销基础**：登出/越权时将 `jti` 入 `token_blacklist` 即时失效 |
| `class_id` | 教师所属班级（仅教师令牌） | `"class-8-3"` | 数据域隔离的便捷来源（仍以 DB 为准） |
| `scope` | 权限集合（可选，细粒度） | `["read_dashboard","review_submission"]` | 接口级最小权限 |

`role` 与 `aud` 的绑定是**强一致**的（学生只能拿 `codex-student`、教师只能拿 `codex-teacher`），由签发端保证；校验端**双重核对** `role` 与 `aud`，任一不符即拒。

### 2.2 配置与密钥（FastAPI）

```python
# app/auth/config.py
from pydantic_settings import BaseSettings

class AuthSettings(BaseSettings):
    JWT_ALG: str = "RS256"
    JWT_ISSUER: str = "codex-auth"
    JWT_PRIVATE_KEY_PATH: str = "/etc/codex/jwt/private.pem"  # 仅签发服务可读，0400
    JWT_PUBLIC_KEY_PATH: str  = "/etc/codex/jwt/public.pem"
    ACCESS_TTL_SECONDS: int = 15 * 60        # 15 分钟
    REFRESH_TTL_SECONDS: int = 7 * 24 * 3600 # 7 天
    # 受众常量
    AUD_STUDENT: str = "codex-student"
    AUD_TEACHER: str = "codex-teacher"
    AUD_RESEARCH: str = "codex-research"
    # 登录限流
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_WINDOW_SECONDS: int = 300
    LOGIN_LOCK_SECONDS: int = 900
    class Config:
        env_prefix = "CODEX_"

settings = AuthSettings()

ROLE_TO_AUD = {
    "student": settings.AUD_STUDENT,
    "teacher": settings.AUD_TEACHER,
    "researcher": settings.AUD_RESEARCH,
}
AUD_TO_ROLE = {v: k for k, v in ROLE_TO_AUD.items()}
```

### 2.3 令牌签发 / 校验 / 刷新 / 吊销

```python
# app/auth/tokens.py
import uuid, time
from datetime import datetime, timezone
import jwt  # PyJWT
from app.auth.config import settings, ROLE_TO_AUD

_private_key = open(settings.JWT_PRIVATE_KEY_PATH, "rb").read()
_public_key  = open(settings.JWT_PUBLIC_KEY_PATH, "rb").read()

class TokenError(Exception): ...

def issue_access_token(*, sub: str, role: str, class_id: str | None = None,
                       scope: list[str] | None = None) -> tuple[str, str]:
    """返回 (jwt_str, jti)。aud 由 role 唯一决定，调用方不可越权指定。"""
    if role not in ROLE_TO_AUD:
        raise TokenError("unknown_role")
    now = int(time.time())
    jti = str(uuid.uuid4())
    payload = {
        "sub": sub,
        "role": role,
        "aud": ROLE_TO_AUD[role],         # 强绑定：role → aud
        "iss": settings.JWT_ISSUER,
        "iat": now,
        "nbf": now,
        "exp": now + settings.ACCESS_TTL_SECONDS,
        "jti": jti,
        "scope": scope or [],
    }
    if role == "teacher" and class_id:
        payload["class_id"] = class_id
    token = jwt.encode(payload, _private_key, algorithm=settings.JWT_ALG)
    return token, jti

def decode_access_token(token: str, *, expected_aud: str) -> dict:
    """显式 expected_aud：每个受众的依赖项各自传入自己的 aud，互不通用。"""
    try:
        claims = jwt.decode(
            token,
            _public_key,
            algorithms=[settings.JWT_ALG],   # 仅 RS256，杜绝 alg=none / 混淆
            audience=expected_aud,           # aud 不匹配 → InvalidAudienceError
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "aud", "jti", "role"]},
        )
    except jwt.ExpiredSignatureError:
        raise TokenError("token_expired")
    except jwt.InvalidAudienceError:
        raise TokenError("audience_mismatch")   # 跨端令牌被挡在这里
    except jwt.InvalidTokenError:
        raise TokenError("invalid_token")
    # role 与 aud 双重一致性（纵深防御，签发端已保证，校验端再核一次）
    if ROLE_TO_AUD.get(claims.get("role")) != claims.get("aud"):
        raise TokenError("role_aud_inconsistent")
    return claims
```

```python
# app/auth/service.py —— 刷新与吊销（有状态部分）
from datetime import datetime, timezone, timedelta
import secrets, hashlib
from app.auth.config import settings

def _hash(raw: str) -> str:
    # refresh_token 只存哈希，泄库不可直接复用
    return "sha256:" + hashlib.sha256(f"codex-refresh:{raw}".encode()).hexdigest()

class AuthService:
    def __init__(self, session_repo, blacklist_repo, audit):
        self.sessions = session_repo
        self.blacklist = blacklist_repo
        self.audit = audit

    def open_session(self, user, *, ip, user_agent, aud) -> dict:
        access, jti = issue_access_token(
            sub=user.id, role=user.role,
            class_id=getattr(user, "class_id", None),
            scope=user.scope,
        )
        raw_refresh = secrets.token_urlsafe(48)
        now = datetime.now(timezone.utc)
        self.sessions.insert({
            "id": jti,                       # 用首个 access 的 jti 作会话主键
            "user_id": user.id,
            "role": user.role,
            "aud": aud,
            "refresh_hash": _hash(raw_refresh),
            "created_at": now,
            "last_active_at": now,
            "expires_at": now + timedelta(seconds=settings.REFRESH_TTL_SECONDS),
            "revoked_at": None,
            "ip": ip, "user_agent": (user_agent or "")[:256],
        })
        self.audit.log(actor=user.id, action="auth.login", resource=aud,
                       ip=ip, payload={"role": user.role, "jti": jti})
        return {"access_token": access, "refresh_token": raw_refresh,
                "jti": jti, "expires_in": settings.ACCESS_TTL_SECONDS}

    def refresh(self, raw_refresh: str, *, aud: str, ip: str) -> dict:
        sess = self.sessions.get_by_refresh_hash(_hash(raw_refresh))
        now = datetime.now(timezone.utc)
        if (sess is None or sess["revoked_at"] is not None
                or sess["expires_at"] <= now or sess["aud"] != aud):
            self.audit.log(actor="anonymous", action="auth.refresh_denied",
                           resource=aud, ip=ip, payload={"reason": "invalid_refresh"})
            raise TokenError("invalid_refresh")
        # 旋转：旧 access 的 jti 入黑名单，签新 access（refresh 滑动续期）
        self.blacklist.add(sess["id"], reason="refresh_rotate",
                           expires_at=now + timedelta(seconds=settings.ACCESS_TTL_SECONDS))
        user = self.sessions.load_user(sess["user_id"])
        access, new_jti = issue_access_token(
            sub=user.id, role=user.role,
            class_id=getattr(user, "class_id", None), scope=user.scope)
        self.sessions.update(sess["id"], {"last_active_at": now, "id_next": new_jti})
        self.audit.log(actor=user.id, action="auth.refresh", resource=aud,
                       ip=ip, payload={"old_jti": sess["id"], "new_jti": new_jti})
        return {"access_token": access, "expires_in": settings.ACCESS_TTL_SECONDS}

    def revoke(self, jti: str, *, actor: str, ip: str, reason="logout"):
        now = datetime.now(timezone.utc)
        self.blacklist.add(jti, reason=reason,
                           expires_at=now + timedelta(seconds=settings.ACCESS_TTL_SECONDS))
        self.sessions.revoke(jti, now)
        self.audit.log(actor=actor, action="auth.logout", resource=jti,
                       ip=ip, payload={"reason": reason})

    def is_revoked(self, jti: str) -> bool:
        return self.blacklist.contains(jti)
```

> **黑名单为何只需短 TTL**：`access_token` 寿命仅 15 分钟，`jti` 入黑名单只需保留到该令牌自然过期即可（`expires_at = now + ACCESS_TTL`），黑名单表自动随过期清理（`DELETE WHERE expires_at < now()` 定时任务），不会无限膨胀。登出/吊销 → 即时失效（下一次请求校验黑名单命中即 401）。

### 2.4 登录端点（学生 / 教师分离）

```python
# app/auth/router.py
from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from app.auth.config import settings
import re

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ---------- 学生登录：班级码/账号/匿名编号，无手机号 ----------
class StudentLoginIn(BaseModel):
    class_code: str = Field(..., min_length=4, max_length=12)   # 班级码
    student_no: str = Field(..., min_length=2, max_length=32)   # 校号/匿名编号
    pin: str | None = Field(default=None, max_length=64)        # 可选低门槛 PIN
    @field_validator("class_code", "student_no")
    @classmethod
    def _alnum(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9_-]+$", v):
            raise ValueError("非法字符")
        return v

# ---------- 教师登录：账号 + 强口令（+ 可选 MFA） ----------
class TeacherLoginIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, max_length=128)
    otp: str | None = Field(default=None, min_length=6, max_length=6)

def _client_ip(req: Request) -> str:
    # Nginx 注入的 X-Real-IP / X-Forwarded-For 链
    return req.headers.get("x-real-ip") or (req.client.host if req.client else "0.0.0.0")

@router.post("/student/login")
async def student_login(body: StudentLoginIn, request: Request, response: Response,
                        svc=Depends(get_auth_service), users=Depends(get_user_repo),
                        limiter=Depends(get_login_limiter)):
    ip = _client_ip(request)
    limiter.check(key=f"stu:{body.class_code}:{body.student_no}", ip=ip)  # 暴力破解限流
    user = users.authenticate_student(body.class_code, body.student_no, body.pin)
    if user is None:
        svc.audit.log(actor="anonymous", action="auth.login_failure",
                      resource=settings.AUD_STUDENT, ip=ip,
                      payload={"reason": "invalid_credentials"})  # 不回显具体哪一项错
        limiter.fail(key=f"stu:{body.class_code}:{body.student_no}", ip=ip)
        raise HTTPException(401, detail={"code": "AUTH_FAILED", "message": "登录信息有误"})
    tokens = svc.open_session(user, ip=ip, user_agent=request.headers.get("user-agent"),
                              aud=settings.AUD_STUDENT)
    _set_refresh_cookie(response, tokens["refresh_token"], aud="student")
    # 注意：是否进入核心功能由 require_active_consent 在各业务接口处再判定
    return {"access_token": tokens["access_token"], "token_type": "bearer",
            "expires_in": tokens["expires_in"], "role": "student",
            "first_login": user.first_login, "user": _public_user(user)}

@router.post("/teacher/login")
async def teacher_login(body: TeacherLoginIn, request: Request, response: Response,
                        svc=Depends(get_auth_service), users=Depends(get_user_repo),
                        limiter=Depends(get_login_limiter)):
    ip = _client_ip(request)
    limiter.check(key=f"tch:{body.username}", ip=ip)
    user = users.authenticate_teacher(body.username, body.password, body.otp)
    if user is None:
        svc.audit.log(actor="anonymous", action="auth.login_failure",
                      resource=settings.AUD_TEACHER, ip=ip,
                      payload={"reason": "invalid_credentials", "username": body.username})
        limiter.fail(key=f"tch:{body.username}", ip=ip)
        raise HTTPException(401, detail={"code": "AUTH_FAILED", "message": "账号或密码错误"})
    aud = settings.AUD_RESEARCH if user.role == "researcher" else settings.AUD_TEACHER
    tokens = svc.open_session(user, ip=ip, user_agent=request.headers.get("user-agent"), aud=aud)
    _set_refresh_cookie(response, tokens["refresh_token"], aud="teacher")
    return {"access_token": tokens["access_token"], "token_type": "bearer",
            "expires_in": tokens["expires_in"], "role": user.role, "user": _public_user(user)}
```

> **教师端口令哈希**：用 `argon2id`（`argon2-cffi`），不用 SHA256（现状 `passwordDigest` 仅 demo）。教师为高价值账号，建议**强制 MFA（TOTP）**，至少对"研究员/管理"角色强制。学生端**不存口令哈希也可**（班级码+校号+短 PIN 的低门槛模型，见 §6），但 PIN 若启用也用 `argon2id`。

---

## 3. 前端路由守卫（两套布局 + beforeEach）

### 3.1 两个独立 Vite 应用 / 两套布局
- `apps/student`（`StudentLayout.vue`）与 `apps/teacher`（`TeacherLayout.vue`）为**两个独立打包入口**（方案 A 各自子域；方案 B 各自 `base`）。互不引用对方的页面组件——即便有人篡改路由也无法渲染对端页面。
- 登录态持久化：`access_token` 存**内存（Pinia）+ sessionStorage**（短时、随标签页）；`refresh_token` 走 **HttpOnly Cookie**（JS 不可读，见 §5），前端不持有 refresh 明文。

### 3.2 学生端路由守卫

```ts
// apps/student/src/router/index.ts
import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/StudentLogin.vue'),
      meta: { public: true } },
    { path: '/consent', name: 'consent', component: () => import('@/views/ConsentGate.vue'),
      meta: { requiresAuth: true } },
    { path: '/', name: 'ide', component: () => import('@/views/StudentIde.vue'),
      meta: { requiresAuth: true, requiresConsent: true, layout: 'StudentLayout' } },
    { path: '/portfolio', name: 'portfolio', component: () => import('@/views/Portfolio.vue'),
      meta: { requiresAuth: true, requiresConsent: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuthStore()
  if (to.meta.public) return true

  // 1) 默认拒绝：无有效会话 → 登录页
  if (!auth.isAuthenticated) {
    await auth.tryRefresh()                         // 静默刷新（refresh cookie）
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 2) 受众/角色拦截：学生 SPA 只接受 student 令牌
  if (auth.role !== 'student' || auth.aud !== 'codex-student') {
    await auth.logout('aud_mismatch_on_student_app')
    return { name: 'login' }                         // 教师误用学生入口 → 踢回登录
  }
  // 3) 合规门禁：未同意 → 同意页（与后端 require_active_consent 对齐）
  if (to.meta.requiresConsent && auth.consentState !== 'ACTIVE') {
    return { name: 'consent' }
  }
  return true
})
export default router
```

### 3.3 教师端路由守卫（跨端跳转拦截）

```ts
// apps/teacher/src/router/index.ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) return true
  if (!auth.isAuthenticated) {
    await auth.tryRefresh()
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 教师 SPA 只接受 teacher / researcher 令牌；学生令牌一律踢出
  const ok = (auth.role === 'teacher'  && auth.aud === 'codex-teacher')
          || (auth.role === 'researcher' && auth.aud === 'codex-research')
  if (!ok) { await auth.logout('aud_mismatch_on_teacher_app'); return { name: 'login' } }

  // 研究端页面需 researcher；教师页面需 teacher（页面级 meta.requiredRole）
  if (to.meta.requiredRole && to.meta.requiredRole !== auth.role) {
    return { name: 'forbidden' }                     // 403 页，不静默跳转
  }
  return true
})
```

### 3.4 Pinia 登录态、静默刷新与登出

```ts
// apps/(student|teacher)/src/stores/auth.ts
import { defineStore } from 'pinia'
import { http } from '@/api/http'   // axios 实例：withCredentials=true，自动带 refresh cookie

interface Claims { sub: string; role: string; aud: string; exp: number }

export const useAuthStore = defineStore('auth', {
  state: () => ({ accessToken: '' as string, claims: null as Claims | null,
                  consentState: '' as string }),
  getters: {
    isAuthenticated: (s) => !!s.claims && s.claims.exp * 1000 > Date.now(),
    role: (s) => s.claims?.role ?? '',
    aud:  (s) => s.claims?.aud ?? '',
  },
  actions: {
    setToken(token: string) {
      this.accessToken = token
      this.claims = JSON.parse(atob(token.split('.')[1]))   // 仅读非敏感声明用于路由；信任以服务端为准
      sessionStorage.setItem('at', token)
    },
    async tryRefresh() {
      try { const { data } = await http.post('/api/auth/refresh'); this.setToken(data.access_token) }
      catch { this.reset() }
    },
    async fetchMe() {
      const { data } = await http.get('/api/auth/me')
      this.consentState = data.consent_state ?? 'N/A'
      return data
    },
    async logout(reason = 'user') {
      try { await http.post('/api/auth/logout', { reason }) } finally { this.reset() }
    },
    reset() { this.accessToken=''; this.claims=null; this.consentState=''; sessionStorage.removeItem('at') },
  },
})

// axios 请求拦截：注入 Bearer；401 + token_expired 时静默刷新重放一次
http.interceptors.request.use((cfg) => {
  const at = sessionStorage.getItem('at')
  if (at) cfg.headers.Authorization = `Bearer ${at}`
  return cfg
})
```

> **关键安全点**：前端解析 JWT 仅用于"路由与 UI 渲染判断"，**绝不作为信任边界**——真正的鉴权永远在后端依赖项。即使攻击者伪造前端状态，后端 `aud`/签名/黑名单校验仍会拦截。

---

## 4. RBAC（依赖项 + 接口级强制 + 数据域隔离）

### 4.1 当前用户解析与受众分离依赖项

```python
# app/auth/deps.py
from fastapi import Depends, Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth.config import settings
from app.auth.tokens import decode_access_token, TokenError

bearer = HTTPBearer(auto_error=False)

class Principal:
    def __init__(self, claims: dict):
        self.id = claims["sub"]; self.role = claims["role"]; self.aud = claims["aud"]
        self.jti = claims["jti"]; self.class_id = claims.get("class_id")
        self.scope = set(claims.get("scope", []))

def _current(expected_aud: str):
    """工厂：为每个受众生成一个 current_* 依赖项。aud 写死，互不通用。"""
    def _dep(request: Request,
             cred: HTTPAuthorizationCredentials = Security(bearer),
             svc=Depends(get_auth_service)) -> Principal:
        ip = request.headers.get("x-real-ip", request.client.host if request.client else "?")
        if cred is None or cred.scheme.lower() != "bearer":
            raise HTTPException(401, detail={"code": "NO_TOKEN", "message": "缺少令牌"})
        try:
            claims = decode_access_token(cred.credentials, expected_aud=expected_aud)
        except TokenError as e:
            svc.audit.log(actor="anonymous", action="auth.invalid_token",
                          resource=expected_aud, ip=ip, payload={"reason": str(e)})
            raise HTTPException(401, detail={"code": "INVALID_TOKEN", "message": "令牌无效或过期"})
        if svc.is_revoked(claims["jti"]):              # 吊销即时生效
            svc.audit.log(actor=claims["sub"], action="auth.revoked_token_used",
                          resource=expected_aud, ip=ip, payload={"jti": claims["jti"]})
            raise HTTPException(401, detail={"code": "TOKEN_REVOKED", "message": "登录已失效"})
        request.state.principal = Principal(claims)
        request.state.ip = ip
        return request.state.principal
    return _dep

# 三个受众各自独立的"当前用户"
current_student    = _current(settings.AUD_STUDENT)
current_teacher    = _current(settings.AUD_TEACHER)
current_researcher = _current(settings.AUD_RESEARCH)

# 通用：任意受众（仅少数共享接口如 /me 用，内部仍按 aud 解析）
def get_current_user(request: Request, cred=Security(bearer), svc=Depends(get_auth_service)) -> Principal:
    if cred is None:
        raise HTTPException(401, detail={"code": "NO_TOKEN", "message": "缺少令牌"})
    # 依次尝试三种受众，命中即返回（用于 /me 这类跨端共享只读端点）
    for aud in (settings.AUD_STUDENT, settings.AUD_TEACHER, settings.AUD_RESEARCH):
        try:
            claims = decode_access_token(cred.credentials, expected_aud=aud)
            if svc.is_revoked(claims["jti"]):
                raise HTTPException(401, detail={"code": "TOKEN_REVOKED"})
            return Principal(claims)
        except TokenError:
            continue
    raise HTTPException(401, detail={"code": "INVALID_TOKEN", "message": "令牌无效"})
```

### 4.2 角色强制依赖项

```python
# app/auth/rbac.py
from fastapi import Depends, HTTPException
from app.auth.deps import current_student, current_teacher, current_researcher, Principal

def require_student(p: Principal = Depends(current_student)) -> Principal:
    if p.role != "student":
        raise HTTPException(403, detail={"code": "FORBIDDEN", "requiredRole": "student"})
    return p

def require_teacher(p: Principal = Depends(current_teacher)) -> Principal:
    if p.role != "teacher":
        raise HTTPException(403, detail={"code": "FORBIDDEN", "requiredRole": "teacher"})
    return p

def require_researcher(p: Principal = Depends(current_researcher)) -> Principal:
    if p.role != "researcher":
        raise HTTPException(403, detail={"code": "FORBIDDEN", "requiredRole": "researcher"})
    return p

def require_scope(*needed: str):
    def _dep(p: Principal = Depends(get_current_user)) -> Principal:
        if not set(needed).issubset(p.scope):
            raise HTTPException(403, detail={"code": "INSUFFICIENT_SCOPE", "need": list(needed)})
        return p
    return _dep
```

权限矩阵（`scope`，最小权限）：

| 角色 | scope（接口级最小权限） |
|---|---|
| student | `read_assignment, save_version, run_code, submit_work, join_room` |
| teacher | `read_assignment, review_submission, switch_turn, read_dashboard, read_class_alerts, join_room` |
| researcher | `read_reports, read_audit, export_research` |

### 4.3 接口级强制 + 数据域隔离

```python
# app/api/student.py —— 学生只见本人
@router.get("/api/student/me/submissions")
async def my_submissions(p=Depends(require_student),
                         consent=Depends(require_active_consent),  # 合规门禁衔接
                         repo=Depends(get_submission_repo)):
    # 数据域：硬过滤 student_id = 当前主体，杜绝 IDOR
    return repo.list_by_student(student_id=p.id)

@router.get("/api/student/submissions/{sid}")
async def submission_detail(sid: str, p=Depends(require_student),
                            consent=Depends(require_active_consent),
                            repo=Depends(get_submission_repo)):
    sub = repo.get(sid)
    if sub is None or sub.student_id != p.id:        # 越权对象访问 → 404（不泄漏存在性）
        raise HTTPException(404, detail={"code": "NOT_FOUND"})
    return sub
```

```python
# app/api/teacher.py —— 教师只见本班
@router.get("/api/teacher/class/students")
async def class_students(p=Depends(require_teacher),
                         repo=Depends(get_class_repo)):
    # 以 DB 为准取教师班级（不单信令牌里的 class_id）
    class_ids = repo.class_ids_of_teacher(p.id)        # 教师可带多个班
    return repo.list_students(class_ids=class_ids)     # 行级过滤：仅这些班

@router.get("/api/teacher/students/{student_id}/profile")
async def student_profile(student_id: str, p=Depends(require_teacher),
                          repo=Depends(get_class_repo)):
    # 数据域校验：该学生必须属于该教师管辖的班级，否则拒绝（教师 A 看不到教师 B 的班）
    if not repo.teacher_can_access_student(teacher_id=p.id, student_id=student_id):
        # 审计越权尝试
        audit.log(actor=p.id, action="rbac.cross_class_denied",
                  resource=student_id, ip="...", payload={"role": "teacher"})
        raise HTTPException(403, detail={"code": "OUT_OF_DOMAIN",
                                         "message": "无权访问非本班学生"})
    return repo.student_profile(student_id)
```

数据域隔离的两层防御（纵深）：

```python
# app/data/scoping.py —— 行级过滤的统一封装（SQLAlchemy）
def scoped_submissions(query, principal: Principal, repo):
    if principal.role == "student":
        return query.where(Submission.student_id == principal.id)
    if principal.role == "teacher":
        class_ids = repo.class_ids_of_teacher(principal.id)
        return (query.join(Enrollment, Enrollment.student_id == Submission.student_id)
                     .where(Enrollment.class_id.in_(class_ids)))
    if principal.role == "researcher":
        # 研究端只能拿脱敏视图（无直接标识），见合规 §5/§7
        return query.where(Submission.research_exportable.is_(True))
    raise HTTPException(403, detail={"code": "FORBIDDEN"})
```

> **第二层（数据库行级安全 RLS，可选加固）**：在 PostgreSQL 对 `submissions/enrollments` 启用 RLS，按连接级 `SET app.current_actor`/`app.current_role` 强制策略，即使应用层漏过滤，DB 仍兜底。详见合规 §7 分库与 DB role 设计（`svc_identity` 等）。

---

## 5. 会话与安全

### 5.1 会话模型（签发 / 过期 / 最后活跃）
- `sessions` 一行 = 一次登录（一个 refresh 生命周期）；`access_token` 无状态，凭 `jti` 关联会话。
- 字段：`created_at`（签发）、`last_active_at`（每次 refresh/活跃更新）、`expires_at`（refresh 绝对过期）、`revoked_at`（登出/吊销）、`ip`/`user_agent`（设备审计）。
- **绝对过期 + 滑动续期**：access 15 分钟到期由 refresh 续；refresh 绝对 7 天，到期必须重新登录。空闲超时（如 30 分钟无活跃）可由 `last_active_at` 判定提前失效。

### 5.2 `X-CodeX-Session` → JWT 迁移与兼容
现状用 `X-CodeX-Session` 头携带不透明令牌。迁移采用**双轨过渡**，零停机：

```python
# app/auth/compat.py —— 过渡期同时接受旧头与新 Bearer
def resolve_principal_compat(request: Request, svc) -> Principal | None:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return None  # 交给标准 JWT 依赖项（新路径）
    legacy = request.headers.get("x-codex-session")
    if legacy:
        sess = svc.sessions.get_by_legacy_token_hash(sha256_legacy(legacy))
        if sess and not sess["revoked_at"] and sess["expires_at"] > now():
            svc.audit.log(actor=sess["user_id"], action="auth.legacy_session_used",
                          resource=sess["aud"], ip=request.state.ip, payload={})
            return Principal.from_legacy(sess)   # 仍受 aud/role 约束
    return None
```

迁移步骤：
1. **后端双读**：新 `Bearer` JWT 与旧 `X-CodeX-Session` 同时被接受（旧会话仍走 `db.sessions.tokenHash` 校验，并打 `legacy_session_used` 审计）。
2. **前端切换**：两套 SPA 登录改调 `student/login`、`teacher/login`，改用 `Authorization: Bearer`。
3. **下线旧头**：设迁移窗口（如 14 天），窗口后拒绝 `X-CodeX-Session`，仅留审计计数验证无残留旧客户端。
4. 数据层：现有 `db.sessions`（`tokenHash/userId/role/assurance/expiresAt/revokedAt`）平滑映射到新 `sessions` 表，增列 `aud/refresh_hash/last_active_at/ip/user_agent`。

### 5.3 Cookie（refresh）vs Bearer（access）的取舍

| 令牌 | 载体 | 理由 |
|---|---|---|
| `access_token` | **`Authorization: Bearer`**（不入 Cookie） | 短时、无状态，由 JS 显式附加 → **天然免疫 CSRF**（CSRF 利用浏览器自动带 Cookie，Bearer 不自动带） |
| `refresh_token` | **HttpOnly + Secure + SameSite Cookie** | 长时高价值，必须 JS 不可读（防 XSS 窃取）；只在 `/api/auth/refresh`、`/logout` 路径使用 |

```python
# app/auth/cookies.py
def _set_refresh_cookie(response, raw_refresh: str, *, aud: str):
    response.set_cookie(
        key="codex_rt",
        value=raw_refresh,
        httponly=True,                 # JS 不可读 → 防 XSS 窃取
        secure=True,                   # 仅 HTTPS
        samesite="strict",             # 跨站不带 → 防 CSRF
        path="/api/auth",              # 仅认证端点可见，最小暴露面
        max_age=settings.REFRESH_TTL_SECONDS,
        # 方案 A 子域：domain 按端隔离，互不下发
        domain="student.jiedui.example.com" if aud == "student" else "teacher.jiedui.example.com",
    )
```

> **CSRF 双保险**：refresh cookie 为 `SameSite=Strict`；`/api/auth/refresh` 额外要求自定义头 `X-Requested-With: codex`（简单请求无法跨站伪造带自定义头）。`access` 走 Bearer 不依赖 Cookie，业务接口无 CSRF 暴露面。**同源策略**：CORS 白名单按端精确列举（学生子域只允许学生 origin），`allow_credentials=True` 时**禁用 `*` 通配**。

```python
# CORS（按端白名单）
app.add_middleware(CORSMiddleware,
    allow_origins=["https://student.jiedui.example.com", "https://teacher.jiedui.example.com"],
    allow_credentials=True, allow_methods=["GET","POST"],
    allow_headers=["Authorization","Content-Type","X-Requested-With"])
```

### 5.4 暴力破解限流
- 维度：`(student_no/username)` + `IP` 双键计数；滑窗 5 分钟 5 次失败 → 锁定 15 分钟；同 IP 跨账号高频 → 触发 IP 级降速。
- 学生端尤其重要（弱凭证），但**锁定不可成为拒绝服务杠杆**：锁定按 `(账号)` 而非纯 IP（教室共用出口 IP），并对正确登录立即清零。

```python
# app/auth/limiter.py（Redis 实现）
class LoginLimiter:
    def check(self, *, key: str, ip: str):
        fails = self.redis.get(f"lf:{key}")
        if fails and int(fails) >= settings.LOGIN_MAX_ATTEMPTS:
            raise HTTPException(429, detail={"code": "RATE_LIMITED",
                "message": "尝试过于频繁，请稍后再试", "retry_after": settings.LOGIN_LOCK_SECONDS})
    def fail(self, *, key: str, ip: str):
        p = self.redis.pipeline()
        p.incr(f"lf:{key}"); p.expire(f"lf:{key}", settings.LOGIN_WINDOW_SECONDS); p.execute()
    def reset(self, *, key: str):
        self.redis.delete(f"lf:{key}")
```

### 5.5 设备 / IP 审计
- 每次 login/refresh/logout 记 `ip` + `user_agent` 到 `sessions` 与 `audit_logs`。
- 教师端可叠加"新设备/异地登录"提示；研究端可强制 IP allowlist（Nginx `allow/deny` 或后端校验）。

---

## 6. 学生低门槛登录

### 6.1 三种低门槛方式（无手机号，最小采集）
| 方式 | 凭证 | 适用 | 安全要点 |
|---|---|---|---|
| **班级码 + 校号** | `class_code`（教师发放）+ `student_no`（校号/学号） | 课堂统一发放 | 班级码限时有效、可轮换；校号非 PII 直接标识，仅作业务内编号 |
| **教师发放账号** | 教师在工作台批量生成 `student_no + 一次性 PIN` | 需个体登录 | 首登强制改 PIN（若启用 PIN）；PIN `argon2id` 存储 |
| **匿名编号** | 平台生成 `anon_xxxx`（与真实身份的映射仅存合规域加密表 `pii_token_map`） | 研究/隐私优先班级 | 业务库**只见匿名编号**，姓名不入业务库（对齐合规 §最小采集） |

> **绝不采集手机号/真实姓名/身份证于业务库**（对齐合规 §最小采集）。姓名仅在 `consent` 域为监护核验留存一次且加密。

### 6.2 首次登录引导监护人同意（衔接 consent 门禁）
登录成功 ≠ 可用核心功能。学生首登流程：

```
学生 student/login 成功（拿到 access_token，role=student, aud=codex-student）
  └─ 前端 fetchMe() 读 consent_state
       ├─ state ∈ {无, PENDING, GUARDIAN_SIGNED} → 路由强制跳 /consent（同意页）
       │     └─ 引导监护人扫码/书面签署 → POST /api/consent（合规子系统）
       │     └─ 学生本人确认 → state=ACTIVE
       └─ state == ACTIVE → 放行进入 /ide（IDE）
后端：所有核心功能接口挂 require_active_consent（默认拒绝），
      未 ACTIVE → 403 {code: CONSENT_REQUIRED}（前端据此跳同意页）
```

- 登录依赖项与合规依赖项**叠加**：`Depends(require_student)` 先确认身份与受众，再 `Depends(require_active_consent)` 确认同意。两者顺序固定、不可绕过（合规子系统强制链已规定）。
- `WITHDRAWN`（退出）后：会话即时吊销（`auth.revoke` 拉黑 `jti` + `sessions.revoked_at`），前端跳"已退出"页。

---

## 7. 审计（audit_logs）

统一写入合规子系统同一张 `audit_logs`（见合规 §7 DDL），认证/RBAC 相关 `action` 取值与字段：

| action | 触发点 | actor | resource | payload 关键字段 |
|---|---|---|---|---|
| `auth.login` | 登录成功 | 用户 ID | aud | `role, jti` |
| `auth.login_failure` | 登录失败 | `anonymous` | aud | `reason`（invalid_credentials/locked）；不存明文凭证 |
| `auth.logout` | 登出/吊销 | 用户 ID | jti | `reason` |
| `auth.refresh` / `auth.refresh_denied` | 刷新 | 用户/anonymous | aud | `old_jti,new_jti` / `reason` |
| `auth.invalid_token` | 令牌签名/过期/格式错 | `anonymous` | aud | `reason`（token_expired/audience_mismatch/...） |
| `auth.revoked_token_used` | 已吊销令牌再用 | 用户 ID | aud | `jti` |
| `auth.legacy_session_used` | 过渡期旧头 | 用户 ID | aud | — |
| `rbac.cross_class_denied` | 教师越班访问 | 教师 ID | 目标 student_id | `role` |
| `rbac.aud_mismatch` | 跨端令牌打错端 | 用户 ID | 目标端 aud | `token_aud, expected_aud` |
| `consent.gate_denied` | 未同意访问核心 | 学生 ID | `core_feature` | `state`（合规子系统记） |

公共字段：`id, ts, actor, role, action, resource, ip, user_agent, payload_json`。**审计本身不可含明文凭证/令牌原文**（只记 `jti`、失败原因码）。落点：每个认证/RBAC 依赖项在拒绝路径**先审计后抛错**；成功路径在 service 内记录。

```python
# app/audit/service.py（与合规共用）
class AuditService:
    def log(self, *, actor, action, resource, ip, payload, role=None, user_agent=None):
        self.repo.insert({
            "id": uuid4().hex, "ts": now_utc(), "actor": actor, "role": role,
            "action": action, "resource": str(resource)[:128], "ip": ip,
            "user_agent": (user_agent or "")[:256],
            "payload_json": redact(payload),   # 脱敏：禁令牌原文/口令/PII
        })
```

---

## 8. 数据模型（关键字段，对齐上游 §7.1 / 合规 DDL）

```sql
-- identity 域（仅合规服务 DB role 可访问，见合规 §7）
CREATE TABLE identity.users (
    id            VARCHAR(32) PRIMARY KEY,          -- 内部 ID（非 PII）
    role          VARCHAR(16) NOT NULL CHECK (role IN ('student','teacher','researcher')),
    status        VARCHAR(16) NOT NULL DEFAULT 'active',
    scope         JSONB NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_status CHECK (status IN ('active','disabled'))
);

-- 学生扩展：最小采集，无手机号/姓名（姓名仅在 consent 域加密留存）
CREATE TABLE identity.students (
    user_id       VARCHAR(32) PRIMARY KEY REFERENCES identity.users(id),
    student_no    VARCHAR(32) NOT NULL,             -- 校号/学号（业务编号，非直接身份证号）
    anon_code     VARCHAR(32) NOT NULL UNIQUE,      -- 匿名编号
    class_id      VARCHAR(32) NOT NULL,             -- 所属班级
    pin_hash      VARCHAR(128),                     -- 可选 argon2id；可空（班级码模式）
    first_login   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (class_id, student_no)
);

-- 教师扩展：强凭证 + 可选 MFA
CREATE TABLE identity.teachers (
    user_id       VARCHAR(32) PRIMARY KEY REFERENCES identity.users(id),
    username      VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,            -- argon2id
    totp_secret_enc BYTEA,                          -- 加密存储；启用 MFA 时非空
    mfa_required  BOOLEAN NOT NULL DEFAULT FALSE
);
-- 教师↔班级多对多（一个教师可管多班；数据域隔离以此为准）
CREATE TABLE identity.teacher_classes (
    teacher_id    VARCHAR(32) NOT NULL REFERENCES identity.teachers(user_id),
    class_id      VARCHAR(32) NOT NULL,
    PRIMARY KEY (teacher_id, class_id)
);

-- 会话（refresh 生命周期）：只存 refresh 哈希，不存原文
CREATE TABLE identity.sessions (
    id            VARCHAR(36) PRIMARY KEY,          -- = 首个 access 的 jti
    user_id       VARCHAR(32) NOT NULL REFERENCES identity.users(id),
    role          VARCHAR(16) NOT NULL,
    aud           VARCHAR(24) NOT NULL,             -- codex-student/teacher/research
    refresh_hash  VARCHAR(80) NOT NULL,             -- sha256(refresh)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    ip            INET,
    user_agent    VARCHAR(256),
    UNIQUE (refresh_hash)
);
CREATE INDEX ix_sessions_user ON identity.sessions (user_id, revoked_at);

-- 令牌黑名单（access jti 即时吊销；短 TTL 自动清理）
CREATE TABLE identity.token_blacklist (
    jti           VARCHAR(36) PRIMARY KEY,
    reason        VARCHAR(32) NOT NULL,             -- logout/refresh_rotate/admin_revoke
    revoked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL              -- = 令牌自然过期点，过期可清理
);
CREATE INDEX ix_blacklist_expiry ON identity.token_blacklist (expires_at);

-- enrollment：数据域隔离的连接表（学生↔班级）
CREATE TABLE identity.enrollment (
    student_id    VARCHAR(32) NOT NULL REFERENCES identity.students(user_id),
    class_id      VARCHAR(32) NOT NULL,
    PRIMARY KEY (student_id, class_id)
);
```

> 对齐合规 §最小采集：业务库不出现手机号/真实姓名；`anon_code` 与真实身份的映射仅在 `identity.pii_token_map`（加密、`svc_identity` 专用 role）。

---

## 9. API 契约（登录/登出/刷新/当前用户）

统一错误体：`{ "detail": { "code": "...", "message": "...", ...extra } }`。鉴权头：业务接口用 `Authorization: Bearer <access>`；过渡期兼容 `X-CodeX-Session`（见 §5.2）。

### 9.1 `POST /api/auth/student/login`
```jsonc
// Request
{ "class_code": "8C3A", "student_no": "S0312", "pin": "0420" }   // pin 可选
// 200
{ "access_token": "<jwt>", "token_type": "bearer", "expires_in": 900,
  "role": "student", "first_login": true,
  "user": { "id": "stu_8a1f", "role": "student", "anon_code": "anon_3120", "class_id": "class-8-3" } }
// + Set-Cookie: codex_rt=<refresh>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth
// 401  { "detail": { "code": "AUTH_FAILED", "message": "登录信息有误" } }    // 不区分哪项错
// 429  { "detail": { "code": "RATE_LIMITED", "retry_after": 900 } }
```

### 9.2 `POST /api/auth/teacher/login`
```jsonc
// Request
{ "username": "li.shen", "password": "••••••••", "otp": "123456" }   // otp 视 mfa_required
// 200  同上结构，role="teacher"（或 "researcher"），user 含其管辖 class_ids 摘要
// 401  { "detail": { "code": "AUTH_FAILED", "message": "账号或密码错误" } }
// 401  { "detail": { "code": "MFA_REQUIRED" } }   // 启用 MFA 但未提供 otp
```

### 9.3 `POST /api/auth/refresh`
```jsonc
// Request: 无 body；携带 codex_rt Cookie + 头 X-Requested-With: codex
// 200  { "access_token": "<jwt>", "token_type": "bearer", "expires_in": 900 }
// 401  { "detail": { "code": "INVALID_REFRESH" } }   // 过期/吊销/aud 不符
```

### 9.4 `POST /api/auth/logout`
```jsonc
// Request: Authorization: Bearer <access>  + codex_rt Cookie
{ "reason": "user" }
// 200  { "revoked": true }    // jti 入黑名单 + session.revoked_at + 清 refresh cookie
// 401  { "detail": { "code": "INVALID_TOKEN" } }
```

### 9.5 `GET /api/auth/me`
```jsonc
// Request: Authorization: Bearer <access>（任意受众）
// 200 student
{ "id": "stu_8a1f", "role": "student", "aud": "codex-student",
  "anon_code": "anon_3120", "class_id": "class-8-3",
  "consent_state": "ACTIVE", "scope": ["read_assignment","run_code","..."] }
// 200 teacher
{ "id": "tch_2c0d", "role": "teacher", "aud": "codex-teacher",
  "class_ids": ["class-8-3","class-8-4"], "scope": ["read_dashboard","review_submission"] }
// 401  { "detail": { "code": "INVALID_TOKEN" } }
```

```python
# app/auth/router.py（续）
@router.get("/me")
async def me(p=Depends(get_current_user), repo=Depends(get_user_repo),
             consent_repo=Depends(get_consent_repo)):
    base = {"id": p.id, "role": p.role, "aud": p.aud, "scope": sorted(p.scope)}
    if p.role == "student":
        s = repo.get_student(p.id)
        c = consent_repo.get_latest(p.id)
        base |= {"anon_code": s.anon_code, "class_id": s.class_id,
                 "consent_state": c.state.value if c else None}
    elif p.role == "teacher":
        base |= {"class_ids": repo.class_ids_of_teacher(p.id)}
    return base
```

错误码表：

| HTTP | code | 含义 |
|---|---|---|
| 401 | `NO_TOKEN` | 缺少令牌 |
| 401 | `INVALID_TOKEN` | 签名/格式/过期/`audience_mismatch`/`role_aud_inconsistent` |
| 401 | `TOKEN_REVOKED` | jti 已吊销 |
| 401 | `AUTH_FAILED` | 登录凭证错误（不细分） |
| 401 | `INVALID_REFRESH` | refresh 无效 |
| 401 | `MFA_REQUIRED` | 需 MFA 未提供 |
| 403 | `FORBIDDEN` | 角色不符 |
| 403 | `OUT_OF_DOMAIN` | 越数据域（越班/越人） |
| 403 | `INSUFFICIENT_SCOPE` | 权限不足 |
| 403 | `CONSENT_REQUIRED` | 未达 ACTIVE 同意（合规门禁） |
| 429 | `RATE_LIMITED` | 登录限流锁定 |

---

## 10. 验收标准 + 红队用例

### 10.1 功能验收
| # | 验收点 | 期望 |
|---|---|---|
| A1 | 学生由 `student.<域名>/login` 登录 | 拿到 `aud=codex-student` 令牌，进入 `StudentLayout` |
| A2 | 教师由 `teacher.<域名>/login` 登录 | 拿到 `aud=codex-teacher` 令牌，进入 `TeacherLayout` |
| A3 | 学生/教师入口互不渲染对端页面 | 两套 bundle 物理隔离，路由守卫拦截 |
| A4 | 学生首登未同意 | 路由跳 `/consent`，核心接口 `403 CONSENT_REQUIRED` |
| A5 | 同意 ACTIVE 后 | 核心功能放行 |
| A6 | 登出 | `jti` 即时失效，refresh cookie 清除 |
| A7 | access 过期 | 静默 refresh 续期成功，用户无感 |

### 10.2 红队 / 越权用例（全部应被拒并审计）
| # | 攻击场景 | 操作 | 期望结果 | 审计 |
|---|---|---|---|---|
| **R1** | 学生 token 调教师接口 | `Bearer <student jwt>` → `GET /api/teacher/class/students` | **403**（`require_teacher` 前，`current_teacher` 的 `aud` 校验即 401 `audience_mismatch`） | `auth.invalid_token`/`rbac.aud_mismatch` |
| **R2** | 教师 A 看教师 B 的班 | 教师 A → `GET /api/teacher/students/{B班学生}/profile` | **403 `OUT_OF_DOMAIN`** | `rbac.cross_class_denied` |
| **R3** | 教师 token 打学生端 aud 接口 | `Bearer <teacher jwt>` → 学生端 `current_student` 接口 | **401 `audience_mismatch`** | `auth.invalid_token` |
| **R4** | 学生越权看他人提交（IDOR） | 学生 → `GET /api/student/submissions/{他人sid}` | **404 `NOT_FOUND`**（不泄漏存在性） | （可记 `rbac` 拒绝） |
| **R5** | 未同意访问核心功能 | `consent=PENDING` 学生 → `/api/ai/chat` | **403 `CONSENT_REQUIRED`** | `consent.gate_denied` |
| **R6** | 吊销令牌即时失效 | 登出后用同一 access 再请求 | **401 `TOKEN_REVOKED`** | `auth.revoked_token_used` |
| **R7** | `alg=none` / 算法混淆 | 伪造无签名或 HS256 顶 RS256 | **401 `INVALID_TOKEN`**（仅 `algorithms=["RS256"]` + 公钥） | `auth.invalid_token` |
| **R8** | 过期令牌 | `exp` 已过的 access | **401 `INVALID_TOKEN`**（`token_expired`） | `auth.invalid_token` |
| **R9** | 暴力破解学生登录 | 同账号 6 次错误 PIN | 第 6 次 **429 `RATE_LIMITED`**，锁定 15 分钟 | `auth.login_failure` ×N |
| **R10** | CSRF 跨站刷新 | 第三方站点诱发 `/api/auth/refresh` | 失败（`SameSite=Strict` 不带 cookie + 缺 `X-Requested-With`） | `auth.refresh_denied` |
| **R11** | XSS 偷 refresh | 注入脚本读 `document.cookie` | 读不到（`HttpOnly`）；access 在 sessionStorage 但 15 分钟即失效且可吊销 | — |
| **R12** | 退出后访问 | 学生 `withdraw` 后再调核心 API | **403**（会话已吊销 + consent 非 ACTIVE） | `consent.withdrawn` + `auth.revoked_token_used` |
| **R13** | 篡改令牌 `role/class_id` 提权 | 改 payload 把 `student`→`teacher` | **401**（签名校验失败；RS256 私钥不可得） | `auth.invalid_token` |

### 10.3 自动化测试骨架

```python
# tests/test_rbac.py
def test_student_token_rejected_on_teacher_api(client, student_token):
    r = client.get("/api/teacher/class/students",
                   headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 401                      # aud 校验先于角色
    assert r.json()["detail"]["code"] == "INVALID_TOKEN"

def test_teacher_cannot_read_other_class(client, teacher_a_token, foreign_student_id):
    r = client.get(f"/api/teacher/students/{foreign_student_id}/profile",
                   headers={"Authorization": f"Bearer {teacher_a_token}"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "OUT_OF_DOMAIN"

def test_revoked_token_immediately_invalid(client, student_token):
    client.post("/api/auth/logout", headers={"Authorization": f"Bearer {student_token}"})
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {student_token}"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "TOKEN_REVOKED"

def test_alg_none_rejected(client):
    forged = jwt.encode({"sub":"x","role":"teacher","aud":"codex-teacher"}, "", algorithm="none")
    r = client.get("/api/teacher/class/students", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401

def test_unconsented_student_blocked_from_core(client, pending_consent_token):
    r = client.post("/api/ai/chat", json={"text":"hi"},
                    headers={"Authorization": f"Bearer {pending_consent_token}"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "CONSENT_REQUIRED"
```

---

## 11. 实施顺序（对齐路线图 S1）

1. **后端**：`identity` 模型 + JWT 签发/校验 + `student/teacher/login` + `refresh/logout/me` + 依赖项 `current_*/require_*`，双轨兼容 `X-CodeX-Session`。
2. **数据域隔离**：`scoped_*` 过滤 + 教师班级校验 + 越权审计。
3. **前端**：两套 Vite 应用骨架 + 两套布局 + `beforeEach` 守卫 + Pinia auth store + 静默刷新。
4. **入口分离**：方案 A 子域 + Nginx + 按端 Cookie/CORS/CSP。
5. **衔接合规**：登录后挂 `require_active_consent`，首登引导同意页。
6. **红队验收**：R1–R13 全绿 + 自动化测试纳入 CI 门禁。

---

## 12. 关键安全取舍小结

- **物理分离入口（子域）优于 hash 路由**：Cookie 按子域隔离是阻断跨端令牌横向移动的最强一墙；教师子域可叠加 IP allowlist。
- **JWT `aud` 是师生令牌不通用的密码学保证**：学生令牌打教师接口在签名校验层（`InvalidAudienceError`）即被挡，先于角色判断，纵深更深。
- **access(Bearer) + refresh(HttpOnly Cookie) 分工**：Bearer 免疫 CSRF，HttpOnly 抵御 XSS 窃取；短 access + jti 黑名单实现"吊销即时生效"而黑名单不膨胀。
- **数据域隔离双层**：应用层 `scoped_*` 强制过滤 + DB 行级安全兜底；越权对象返 404 不泄漏存在性。
- **默认拒绝贯穿**：无令牌/错受众/未同意/越域/越权一律拒绝并审计；前端状态永不作信任边界。
- **最小采集**：业务库无手机号/姓名；学生用班级码/校号/匿名编号，姓名仅加密留存于 consent 域。
