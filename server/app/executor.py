"""
真实代码执行器（S1-10 / S2 §4.2）。
替换旧 PoC 的 simulateRun：Python/C++/C 全部真实运行。
- Python: subprocess 调 python（隔离模式 -I -X utf8 -B）
- C++/C : gcc/g++ 真实编译后运行

⚠️ 安全边界（2026-08-03 红队实测，见 docs/沙箱红队报告.md）：
裸 subprocess **没有** OS 级隔离。学生提交任意代码时，两条**必堵**的泄露：
  ① 相对路径文件读：`open('.env')` / `sqlite3.connect('jiedui.db')` —— 子进程 cwd 曾是
     后端进程 cwd（server/），密钥/JWT/导出盐/测评标答全在那里。→ **cwd 隔离到空临时目录**。
  ② 环境变量继承：`os.environ['AI_API_KEY']` —— 后端把 .env 载进了自己的环境，
     subprocess 默认继承整份。→ **传干净最小 env**，只留 PATH 等必需项。
两条堵死后，残余风险（绝对路径读、网络外联）**无法在裸 subprocess 上根治**，
必须靠容器（生产 SANDBOX_MODE=docker，见报告）。Python 主路径本就走浏览器 Pyodide
（WASM 真沙箱），后端 Python 仅为 Pyodide 加载失败时的降级回退。
"""
from __future__ import annotations
import os
import shutil
import subprocess
import tempfile
import time

MAX_CODE_LEN = 100_000
MAX_OUTPUT = 50_000
DEFAULT_TIMEOUT = 5

_CREATE_NO_WINDOW = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def _clean_path() -> str:
    """PATH 也要脱敏。红队实测（逃逸①）：若后端以**激活的 venv** 启动，PATH 里带
    `server\\.venv\\Scripts`，学生代码逐条扫 PATH 就能反推出部署根、进而绝对读 .env ——
    把「需知道部署路径」这个先验直接消掉。过滤掉任何含 `.venv` 或落在部署树内的条目，
    其余保留（gcc/g++ 的运行时 DLL 目录仍在，正常编译不受影响）。"""
    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).lower()  # …/server
    out = []
    for p in os.environ.get("PATH", "").split(os.pathsep):
        q = p.strip().lower()
        if not q:
            continue
        if ".venv" in q or q.startswith(server_dir):
            continue                          # 部署树内的条目会泄露路径，剔除
        out.append(p)
    return os.pathsep.join(out)


def _sandbox_env(workdir: str) -> dict:
    """给学生子进程的**最小环境**。绝不整份继承 os.environ —— 后端把 .env 载进了环境，
    继承 = 把 AI 密钥/JWT 密钥/导出盐直接递给学生代码。只留跑得起来必需的几个。

    ⚠️ 这层只堵「相对路径读 + 环境继承 + PATH 残留」三条**廉价可堵**的泄露。红队实测
    （逃逸②③④，均 critical）：子进程仍能用 WMI/PEB 读**父进程（uvicorn）命令行**在运行时
    发现部署路径，再绝对读 .env —— 这条**裸 subprocess 从 Python 层堵不住**，根因是缺进程
    隔离，只有容器能根治。生产必须设 SANDBOX_STRICT（见 execute()）或上容器。"""
    keep = {}
    for k in ("SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC", "LANG", "LC_ALL"):
        if k in os.environ:
            keep[k] = os.environ[k]
    keep["PATH"] = _clean_path()
    keep["TMP"] = keep["TEMP"] = keep["TMPDIR"] = workdir
    keep["PYTHONUTF8"] = "1"
    return keep


def _truncate(s: str) -> str:
    if s and len(s) > MAX_OUTPUT:
        return s[:MAX_OUTPUT] + f"\n…（输出超过 {MAX_OUTPUT} 字符，已截断）"
    return s


def _result(stdout="", stderr="", status="success", ms=0, mock=False):
    return {"stdout": _truncate(stdout), "stderr": _truncate(stderr),
            "status": status, "durationMs": ms, "mock": mock}


# 生产失败安全闸。红队实测证明裸 subprocess **无法**在 Windows 上安全运行不可信代码
# （WMI/PEB 父进程自省 → 发现部署路径 → 绝对读 .env，从 Python 层堵不住）。
# 机房部署设 SANDBOX_STRICT=1：后端**拒绝**裸执行，Python 走浏览器 Pyodide（WASM 真沙箱），
# C/C++ 需先上容器。与 CodeAgent 的 SANDBOX_MODE=docker fail-closed 同philosophy —— 宁可
# 少一个功能，不拿整台服务器的密钥赌一个便利。默认关（dev/demo 可用），生产必开。
STRICT = os.getenv("SANDBOX_STRICT", "").strip().lower() in ("1", "true", "yes", "on")


def execute(language: str, code: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    if not code or not code.strip():
        return _result(stderr="（空代码）", status="error")
    if len(code) > MAX_CODE_LEN:
        return _result(stderr=f"代码过长（超过 {MAX_CODE_LEN} 字符）", status="error")
    if STRICT:
        return _result(
            stderr="该环境已启用严格沙箱：后端不直接执行代码。Python 请用浏览器内运行环境；"
                   "C/C++ 需管理员配置容器沙箱后开放。",
            status="error")
    if language == "python":
        return _run_python(code, timeout)
    if language in ("cpp", "c"):
        return _run_compiled(language, code, timeout)
    return _result(stderr=f"不支持的语言: {language}", status="error")


def _run_python(code: str, timeout: int) -> dict:
    t0 = time.time()
    # 隔离工作目录：源码、cwd、临时文件全落在这里，学生代码相对路径够不到后端文件
    workdir = tempfile.mkdtemp(prefix="jiedui_run_")
    path = os.path.join(workdir, "main.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    try:
        r = subprocess.run(
            ["python", "-I", "-X", "utf8", "-B", path],
            capture_output=True, stdin=subprocess.DEVNULL, timeout=timeout,
            text=True, encoding="utf-8", errors="replace",
            cwd=workdir, env=_sandbox_env(workdir), **_CREATE_NO_WINDOW,
        )
        ms = int((time.time() - t0) * 1000)
        return _result(r.stdout, r.stderr, "success" if r.returncode == 0 else "error", ms)
    except subprocess.TimeoutExpired:
        return _result(stderr=f"运行超时（{timeout}s）", status="timeout", ms=timeout * 1000)
    except Exception as e:
        return _result(stderr=f"执行错误: {e}", status="error")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _run_compiled(language: str, code: str, timeout: int) -> dict:
    t0 = time.time()
    compiler = "g++" if language == "cpp" else "gcc"
    std = "c++17" if language == "cpp" else "c11"
    if not shutil.which(compiler):
        return _result(stderr=f"未找到编译器 {compiler}，请安装 MinGW/MSYS2 并加入 PATH", status="error")
    suffix = ".cpp" if language == "cpp" else ".c"
    workdir = tempfile.mkdtemp(prefix="jiedui_cc_")
    src = os.path.join(workdir, "main" + suffix)
    with open(src, "w", encoding="utf-8") as f:
        f.write(code)
    exe = os.path.join(workdir, "main" + (".exe" if os.name == "nt" else ".out"))
    env = _sandbox_env(workdir)
    try:
        comp = subprocess.run(
            [compiler, src, "-o", exe, f"-std={std}", "-O1", "-w"],
            capture_output=True, timeout=20, text=True, encoding="utf-8",
            errors="replace", cwd=workdir, env=env, **_CREATE_NO_WINDOW,
        )
        if comp.returncode != 0:
            return _result(stderr=f"编译错误:\n{comp.stderr}", status="error",
                           ms=int((time.time() - t0) * 1000))
        run = subprocess.run(
            [exe], capture_output=True, stdin=subprocess.DEVNULL, timeout=timeout,
            text=True, encoding="utf-8", errors="replace",
            cwd=workdir, env=env, **_CREATE_NO_WINDOW,
        )
        ms = int((time.time() - t0) * 1000)
        return _result(run.stdout, run.stderr, "success" if run.returncode == 0 else "error", ms)
    except subprocess.TimeoutExpired:
        return _result(stderr=f"运行超时（{timeout}s）", status="timeout", ms=timeout * 1000)
    except Exception as e:
        return _result(stderr=f"执行错误: {e}", status="error")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

