"""pytest 夹具（闭合图谱门禁的 test_gaps）。
关键：在导入 app 之前把 DB 切到**临时库**，避免污染 jiedui.db。
"""
import test_support

# A canonical helper module owns process state even if conftest is imported twice.
# Install configuration + DB/network guards BEFORE importing any application code.
_isolation = test_support.bootstrap()
_TMPDIR = str(_isolation.root)
_TEST_DB = str(_isolation.root / "jiedui.db")
test_support.install_offline_models()

import pytest                          # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app               # noqa: E402


def pytest_sessionfinish(session, exitstatus):
    # Even a test explicitly catching BaseException cannot hide a forbidden access.
    if _isolation.violations:
        session.exitstatus = pytest.ExitCode.TESTS_FAILED
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        if reporter:
            reporter.write_line("ISOLATION VIOLATIONS: " + repr(_isolation.violations), red=True)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, role: str, name: str) -> str:
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def teacher(client):
    return {"Authorization": "Bearer " + _login(client, "teacher", "lishen")}


@pytest.fixture(scope="session")
def student(client):
    return {"Authorization": "Bearer " + _login(client, "student", "xiaoma")}
