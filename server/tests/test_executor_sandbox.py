"""执行器沙箱红队回归（2026-08-03）。

背景：护栏红队之后想到——只扫了「输入文本」这一个面，而**学生能提交任意代码执行**
的沙箱从没扫过。实测发现裸 subprocess 有两条致命泄露：学生代码能读后端 .env
（AI 密钥/JWT 密钥/导出盐）与 jiedui.db（测评标答），能读 os.environ 拿同样的密钥。
护栏漏一条谐音是隐私风险；沙箱漏一个读，整台机房的密钥与全部研究数据都在裸奔。

这套用例钉死两条**已修**的泄露。**残余风险（绝对路径读、网络、内存）裸 subprocess
修不了、需容器**，如实记在 test_known_sandbox_limits 里，不假装修好。
"""
import pytest

from app import executor


BLOCKED = [
    ("相对路径读 .env", "print(open('.env',encoding='utf-8').read())"),
    ("相对路径读 db 标答", "import sqlite3;print(sqlite3.connect('jiedui.db').execute('select 1 from assessments').fetchone())"),
    ("列服务端源码目录", "import os;print(os.listdir('app'))"),
    ("环境变量拿 AI 密钥", "import os;print('LEAK='+os.environ.get('AI_API_KEY','SAFE'))"),
    ("环境变量拿导出盐", "import os;print('LEAK='+os.environ.get('JIEDUI_EXPORT_SALT','SAFE'))"),
]


@pytest.fixture(autouse=True)
def _load_env():
    # conftest 注入合成密钥，测试同一泄露面而不加载部署配置。
    from app import env  # noqa: F401


@pytest.mark.parametrize("name,code", BLOCKED)
def test_student_code_cannot_reach_backend_secrets(name, code):
    r = executor.execute("python", code, timeout=8)
    out = (r.get("stdout") or "") + (r.get("stderr") or "")
    # 密钥/盐：只要拿到值就是泄露（SAFE 是取不到时的兜底）
    assert "sk-" not in out, f"{name}: AI 密钥泄露"
    assert "LEAK=" + "SAFE" in out or "LEAK=" not in out or "sk-" not in out
    if "环境变量" in name:
        assert "LEAK=SAFE" in out, f"{name}: 环境变量仍泄露 → {out[:80]}"
    else:
        # 文件读：cwd 隔离后必然抛异常（文件不在隔离工作目录里）
        assert r["status"] == "error", f"{name}: 相对路径读没被隔离挡住"


def test_normal_code_still_runs():
    """隔离不能误伤正常代码 —— 学生该跑得起来。"""
    r = executor.execute("python", "print('hello');print(sum(range(10)))", timeout=8)
    assert r["status"] == "success"
    assert "hello" in r["stdout"] and "45" in r["stdout"]


def test_student_code_can_write_in_its_own_workdir():
    """学生代码在自己的隔离工作目录里读写临时文件是允许的（正常需求，如写中间结果）。"""
    code = "open('tmp.txt','w').write('x');print(open('tmp.txt').read())"
    r = executor.execute("python", code, timeout=8)
    assert r["status"] == "success" and "x" in r["stdout"]


def test_infinite_loop_is_killed_by_timeout():
    import time
    t0 = time.time()
    r = executor.execute("python", "while True: pass", timeout=2)
    assert r["status"] == "timeout"
    assert time.time() - t0 < 6                      # 超时确实兜住，没挂死


def test_path_does_not_leak_deploy_dir():
    """PATH 脱敏：即便后端以激活 venv 启动（PATH 含 .venv\\Scripts），
    学生扫 PATH 也反推不出部署路径（红队逃逸①，低危，已堵）。"""
    import os
    # 模拟激活 venv：把 .venv\Scripts 塞进本进程 PATH，_clean_path 应过滤掉
    venv = os.path.abspath(".venv/Scripts")
    old = os.environ.get("PATH", "")
    os.environ["PATH"] = venv + os.pathsep + old
    try:
        r = executor.execute("python",
            "import os;print([p for p in os.environ.get('PATH','').split(os.pathsep) if '.venv' in p.lower()])",
            timeout=8)
        assert "[]" in (r.get("stdout") or ""), f"PATH 仍泄露 venv 路径：{r.get('stdout')}"
    finally:
        os.environ["PATH"] = old


def test_strict_mode_refuses_execution(monkeypatch):
    """SANDBOX_STRICT=1（生产失败安全闸）：后端拒绝裸执行，不拿密钥赌便利。"""
    import importlib
    monkeypatch.setenv("SANDBOX_STRICT", "1")
    importlib.reload(executor)
    try:
        r = executor.execute("python", "print('should not run')", timeout=8)
        assert r["status"] == "error"
        assert "should not run" not in (r.get("stdout") or "")
        assert "严格沙箱" in r["stderr"]
    finally:
        monkeypatch.delenv("SANDBOX_STRICT", raising=False)
        importlib.reload(executor)


# ============ 已知边界：裸 subprocess 修不了的，如实钉住而非假装 ============

def test_known_sandbox_limits_are_documented_not_pretended_fixed(tmp_path):
    """**父进程自省能发现部署路径 → 绝对读 .env**，裸 subprocess 修不了、需容器。

    2026-08-03 更正：初版断言「运行时路径发现已封死」是**错的** —— 逃逸猎取工作流证伪。
    子进程能用 WMI（Get-CimInstance Win32_Process）或 ctypes 读父进程 PEB，
    拿到 uvicorn 命令行（含完整 .venv 路径），反推部署根后绝对读 .env。
    这里如实钉住「绝对路径读仍可行」这个残余，不假装修好；
    生产靠 SANDBOX_STRICT（拒绝裸执行）或容器根治。
    **若哪天绝对路径读也被挡住（上了容器/严格闸默认开），把断言反过来。**
    """
    # 只读测试自己创建的合成文件，不为证明残余风险而暴露真实密钥。
    sensitive_file = tmp_path / "synthetic.env"
    sensitive_file.write_text("AI_API_KEY=synthetic-test-value", encoding="utf-8")
    envpath = sensitive_file.as_posix()
    r = executor.execute("python", f"print(open(r'{envpath}').read()[:20])", timeout=8)
    still_readable = "AI_API_KEY" in (r.get("stdout") or "")
    assert still_readable, (
        "绝对路径读被挡住了 —— 说明上了容器/更强隔离，"
        "请更新 docs/沙箱红队报告.md 并把本断言反过来")
