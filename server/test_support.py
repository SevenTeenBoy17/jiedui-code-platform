"""Test-only bootstrap: owned storage, synthetic configuration, offline transport.

Call before any app import. Python audit hooks remain active for this process.
They are regression guards, not a security sandbox for arbitrary native/child code.
"""
from __future__ import annotations

import atexit
from collections import Counter
from dataclasses import dataclass, field
import io
import gc
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import tempfile
import urllib.request
from urllib.parse import urlsplit

class IsolationViolation(BaseException):
    """Not Exception: business fallbacks must not turn unsafe tests green."""


@dataclass
class TestState:
    root: Path
    pid: int
    connections: list[str] = field(default_factory=list)
    violations: list[str] = field(default_factory=list)
    model_calls: Counter = field(default_factory=Counter)

    def reject(self, reason: str):
        self.violations.append(reason)
        raise IsolationViolation(reason)


_state: TestState | None = None


def bootstrap() -> TestState:
    global _state
    if _state is not None and _state.pid == os.getpid():
        return _state
    if any(name == "app" or name.startswith("app.") for name in sys.modules):
        raise IsolationViolation("Test isolation must be installed before importing app")

    # Never adopt an inherited directory or recursively clean a caller's path.
    root = Path(tempfile.mkdtemp(prefix="jiedui_test_")).resolve()
    state = _state = TestState(root=root, pid=os.getpid())
    previous_tempdir = tempfile.tempdir
    tempfile.tempdir = str(root)
    os.environ.update({
        "JIEDUI_TEST_TMPDIR": str(root), "JIEDUI_DB_PATH": str(root / "jiedui.db"),
        "JIEDUI_ENV_FILE_DISABLED": "1", "AI_API_KEY": "test-key",
        "AI_API_BASE_URL": "https://models.invalid/v1", "AI_MODEL": "test-model",
        "AI_IMG_URL": "https://models.invalid/v1/images/generations",
        "JIEDUI_JWT_SECRET": "synthetic-test-jwt-secret-not-for-deployment",
        "JIEDUI_EXPORT_SALT": "synthetic-test-export-salt-not-for-deployment",
        "JIEDUI_TEACHER_PASSWORD": "", "SANDBOX_STRICT": "0",
    })
    server = Path(__file__).resolve().parent
    protected = {(server / name).resolve() for name in
                 (".env", "jiedui.db", "jiedui.db-wal", "jiedui.db-shm")}

    def audit(event, args):
        if event == "sqlite3.connect":
            target = os.fsdecode(args[0])
            if target != ":memory:":
                path = Path(target).resolve()
                if target.startswith("file:") or not path.is_relative_to(root):
                    state.reject("SQLite target outside owned test directory")
                state.connections.append(str(path))
        elif event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            if Path(os.fsdecode(args[0])).resolve() in protected:
                state.reject("Attempt to open production database/configuration")
        elif event in ("urllib.Request", "socket.getaddrinfo", "socket.sendto"):
            state.reject("Network is disabled in tests: " + event)
        elif event == "socket.connect":
            frame = sys._getframe(1)
            # Windows asyncio's stdlib socketpair is local IPC, not app networking.
            if (frame.f_code is getattr(socket.socketpair, "__code__", None)
                    and args[1][0] in ("127.0.0.1", "::1")):
                return
            state.reject("Network is disabled in tests: socket.connect")

    sys.addaudithook(audit)

    def cleanup():
        if os.getpid() == state.pid:
            tempfile.tempdir = previous_tempdir
            gc.collect()  # sqlite connections in reference cycles hold Windows handles.
            # Exact mkdtemp result owned by this process; never an env-provided path.
            shutil.rmtree(root, ignore_errors=True)

    atexit.register(cleanup)
    return state


def install_offline_models() -> None:
    state = bootstrap()

    def offline_urlopen(request, *args, **kwargs):
        if not isinstance(request, urllib.request.Request) or request.get_method() != "POST":
            state.reject("Unexpected HTTP request; provide an explicit test double")
        url = urlsplit(request.full_url)
        if url.scheme != "https" or url.netloc != "models.invalid":
            state.reject("Unexpected HTTP target; provide an explicit test double")
        payload = json.loads(request.data)
        if url.path == "/v1/messages" and isinstance(payload.get("messages"), list):
            state.model_calls["messages"] += 1
            # Empty model response exercises the real parser and offline fallback.
            return io.BytesIO(b'{"content": []}')
        if url.path == "/v1/images/generations" and isinstance(payload.get("prompt"), str):
            state.model_calls["images"] += 1
            # One transparent pixel; no network, generated assets, or student content.
            return io.BytesIO(json.dumps({"data": [{"b64_json":
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}]}).encode())
        state.reject("Unexpected model request; provide an explicit test double")

    urllib.request.urlopen = offline_urlopen
