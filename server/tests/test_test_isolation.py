"""M0a: behavior checks, not source-text assertions. All data is synthetic."""
import json
from pathlib import Path
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import pytest

import test_support

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/check_test_isolation.py"


@pytest.mark.parametrize("value,expected", [("legacy", 0), ("trusted_required", 0), ("invalid-mode", 1)])
def test_pair_mode_is_validated_at_fresh_startup(value, expected):
    result = subprocess.run([sys.executable, str(SCRIPT), "--mode", "import", "--pair-ai-mode", value],
                            capture_output=True, text=True, encoding="utf-8", timeout=45)
    assert result.returncode == expected, result.stdout + result.stderr
    if expected:
        assert "Invalid PAIR_AI_MODE" in result.stdout
    else:
        assert "PAIR_MODE_FROZEN " + value in result.stdout


@pytest.mark.parametrize("mode", ["store", "env", "import"])
def test_fresh_import_is_isolated_even_with_inherited_configuration(mode):
    result = subprocess.run([sys.executable, str(SCRIPT), "--mode", mode],
                            capture_output=True, text=True, encoding="utf-8", timeout=45)
    assert result.returncode == 0, result.stdout + result.stderr
    line = next(line for line in result.stdout.splitlines() if line.startswith("M0A_SENTINEL "))
    report = json.loads(line.removeprefix("M0A_SENTINEL "))
    assert report["violations"] == []
    if mode != "env":
        assert report["sqlite_connections"] > 0


@pytest.mark.parametrize("operation", [
    "sys.audit('sqlite3.connect', str(Path(test_support.__file__).parent / 'jiedui.db'))",
    "sys.audit('sqlite3.connect', 'file:outside.db?mode=ro')",
    "sys.audit('open', str(Path(test_support.__file__).parent / '.env'), 'r', 0)",
    "sys.audit('socket.connect', None, ('127.0.0.1', 12291))",
    "sys.audit('socket.getaddrinfo', 'example.invalid', 443, 0, 0, 0)",
    "sys.audit('urllib.Request', 'https://example.invalid', None, {}, 'GET')",
    "sys.audit('socket.sendto', None, ('127.0.0.1', 12291))",
])
def test_guard_blocks_access_before_io_and_is_not_swallowed(operation):
    # Inject audit events, NEVER perform dangerous IO in an unguarded child.
    # If bootstrap regresses this fails safely without opening a real file/socket.
    script = """
import sys
from pathlib import Path
import test_support
state = test_support.bootstrap()
try:
    try:
        OPERATION
    except Exception:
        raise SystemExit('guard was swallowed as a business exception')
except test_support.IsolationViolation:
    assert state.violations
    print('BLOCKED_BEFORE_IO')
else:
    raise SystemExit('expected isolation failure')
""".replace("OPERATION", operation)
    result = subprocess.run([sys.executable, "-c", script], capture_output=True,
                            text=True, encoding="utf-8", timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "BLOCKED_BEFORE_IO" in result.stdout


@pytest.mark.parametrize(('fault', 'reason'), [
    ('drop-db', 'database_outside_sandbox'),
    ('drop-env', 'production_file_open'),
])
def test_independent_sentinel_catches_bootstrap_regression(fault, reason):
    result = subprocess.run([sys.executable, str(SCRIPT), '--mode', 'import', '--fault', fault],
                            capture_output=True, text=True, encoding='utf-8', timeout=45)
    assert result.returncode == 1, result.stdout + result.stderr
    assert 'PREIMPORT_BLOCKED: ' + reason in result.stdout
    report = json.loads(next(line.removeprefix('M0A_SENTINEL ')
                             for line in result.stdout.splitlines() if line.startswith('M0A_SENTINEL ')))
    assert report['violations'] == [reason]
    assert report['fault'] == fault


def test_process_owned_roots_survive_other_process_cleanup():
    parent = test_support.bootstrap()
    script = """
import json, os
import test_support
state = test_support.bootstrap()
from app import store
with store._conn() as conn:
    conn.execute('CREATE TABLE m0a_owner(value INTEGER)')
    conn.execute('INSERT INTO m0a_owner VALUES (?)', (os.getpid(),))
print(json.dumps({'root': str(state.root), 'pid': os.getpid()}), flush=True)
input()
with store._conn() as conn:
    assert conn.execute('SELECT value FROM m0a_owner').fetchall()[0][0] == os.getpid()
conn.close()
"""
    procs = [subprocess.Popen([sys.executable, "-c", script], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, encoding="utf-8") for _ in range(2)]
    pool = ThreadPoolExecutor(max_workers=2)
    try:
        ready = [pool.submit(proc.stdout.readline) for proc in procs]
        rows = [json.loads(future.result(timeout=15)) for future in ready]
        assert len({str(parent.root), *(row["root"] for row in rows)}) == 3
        for index, proc in enumerate(procs):
            out, err = proc.communicate("\n", timeout=30)
            assert proc.returncode == 0, out + err
            assert not Path(rows[index]['root']).exists()
            assert parent.root.exists()
            if index == 0:
                assert Path(rows[1]["root"]).exists()
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()
                proc.communicate()
        pool.shutdown(wait=True, cancel_futures=True)


def test_default_storage_and_env_loading_preserved_in_isolated_copy(tmp_path):
    # No env override: unchanged normal default resolves relative to its module.
    import runpy
    import shutil
    source = Path(test_support.__file__).parent / "app"
    copied = tmp_path / "app"
    copied.mkdir()
    shutil.copy2(source / "store.py", copied / "store.py")
    shutil.copy2(source / "env.py", copied / "env.py")
    (tmp_path / ".env").write_text("M0A_LOAD=from-file\nM0A_KEEP=from-file\n", encoding="utf-8")
    script = """
import os, runpy, sqlite3, sys
from pathlib import Path
root = Path(sys.argv[1])
os.environ.pop('JIEDUI_DB_PATH', None)
os.environ.pop('JIEDUI_ENV_FILE_DISABLED', None)
os.environ['M0A_KEEP'] = 'from-process'
env = runpy.run_path(str(root / 'app/env.py'))
assert os.environ['M0A_LOAD'] == 'from-file'
assert os.environ['M0A_KEEP'] == 'from-process'
store = runpy.run_path(str(root / 'app/store.py'))
assert Path(store['DB_PATH']).resolve() == root / 'jiedui.db'
with sqlite3.connect(store['DB_PATH']) as conn:
    assert conn.execute("SELECT name FROM sqlite_master WHERE name='projects'").fetchone()
print('NORMAL_STARTUP_PRESERVED')
"""
    result = subprocess.run([sys.executable, "-c", script, str(tmp_path)],
                            capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "NORMAL_STARTUP_PRESERVED" in result.stdout


def test_offline_model_transport_preserves_real_routes(client, student, teacher):
    from app import insights
    state = test_support.bootstrap()
    before = state.model_calls.copy()
    assert client.post('/api/teacher/consent', headers=teacher,
                       json={'student_id': 'stu-xiaoma', 'guardian': 'synthetic'}).status_code == 200
    chat = client.post('/api/ai/chat', headers=student,
                       json={'message': '如何理解循环的停止条件？', 'role': 'reviewer'})
    assert chat.status_code == 200 and chat.json()['source'] == 'fallback'
    image = client.post('/api/ai/image', headers=student, json={'prompt': '一棵学习小树'})
    assert image.status_code == 200 and image.json()['image'].startswith('data:image/png;base64,')
    # Exercise the real insight serialization/parser even when there are no
    # supported inferences in the test DB; do not invent learner evidence.
    assert insights._call_llm({'已确认学情': {}, '诊断上下文': {}}) is None
    assert state.model_calls['messages'] == before['messages'] + 2
    assert state.model_calls['images'] == before['images'] + 1
    assert state.violations == []
