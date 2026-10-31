"""
零依赖的 .env 装载（不引 python-dotenv，本仓依赖只有 5 个包，为一个 20 行的功能加一个包不值）。

为什么需要它：密钥此前**硬编码在 `ai.py` 与 `gen-assets.py` 的 `os.getenv(..., "sk-...")` 兜底里**，
源码一旦分享/入库，密钥就跟着走了。把兜底删掉是对的，但删掉之后本地就必须有地方读配置，
否则每个人都得手工 export 一遍环境变量，最后的结果一定是有人图省事又把密钥写回源码。

用法：把 `server/.env` 建好（照 `.env.example`），进程启动时自动读取。
已存在的真实环境变量优先，.env 不覆盖它 —— 生产用容器环境变量注入，不依赖这个文件。
"""
import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def load(path: Path = ENV_FILE) -> int:
    if not path.exists():
        return 0
    n = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:          # 真实环境变量优先，.env 只补空缺
            os.environ[k] = v
            n += 1
    return n


def require(key: str, hint: str = "") -> str:
    """取必填配置。**没有兜底值** —— 兜底值就是密钥泄漏的来源。"""
    v = os.environ.get(key, "").strip()
    if not v:
        raise RuntimeError(
            f"缺少环境变量 {key}。请在 server/.env 里配置（参考 server/.env.example）。{hint}")
    return v


# Test runners set this before importing app; never load deployment credentials.
# Explicit load(path) remains available for tests using a synthetic config file.
if os.environ.get("JIEDUI_ENV_FILE_DISABLED") != "1":
    load()
