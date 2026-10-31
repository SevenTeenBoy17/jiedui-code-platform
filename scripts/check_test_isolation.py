"""Independent pre-import sentinel. Never import app/pytest in the parent.

Run with server/.venv/Scripts/python.exe scripts/check_test_isolation.py.
Use --mode collect or --mode suite [pytest arguments] for guarded pytest.
This is a Python test-process guard, NOT an OS sandbox for arbitrary children.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"


class SentinelViolation(BaseException):
    pass


def child(mode: str, sandbox: Path, pytest_args: list[str], fault: str | None = None) -> int:
    # Independent of test_support/conftest: a broken bootstrap must fail safely.
    connections = []
    violations = []
    protected = {(SERVER / name).resolve() for name in
                 (".env", "jiedui.db", "jiedui.db-wal", "jiedui.db-shm")}

    def audit(event, args):
        if event == "sqlite3.connect":
            target = str(args[0])
            if target != ":memory:":
                path = Path(target).resolve()
                if target.startswith("file:") or not path.is_relative_to(sandbox):
                    violations.append("database_outside_sandbox")
                    raise SentinelViolation("database_outside_sandbox: " + str(path))
                connections.append(str(path))
        elif event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            if Path(os.fsdecode(args[0])).resolve() in protected:
                violations.append("production_file_open")
                raise SentinelViolation("production_file_open")
        elif event in ("urllib.Request", "socket.getaddrinfo", "socket.sendto"):
            violations.append("network_attempt")
            raise SentinelViolation("network_attempt: " + event)
        elif event == "socket.connect":
            # Windows asyncio uses the stdlib's authenticated loopback socketpair.
            import socket
            frame = sys._getframe(1)
            if (frame.f_code is getattr(socket.socketpair, "__code__", None)
                    and args[1][0] in ("127.0.0.1", "::1")):
                return
            violations.append("network_attempt")
            raise SentinelViolation("network_attempt: socket.connect")

    sys.addaudithook(audit)
    tempfile.tempdir = str(sandbox)
    # Import/collection must prove bootstrap overrides unsafe inherited settings.
    # Only dedicated application configuration tests pre-inject safe settings.
    os.environ.update({
        "JIEDUI_DB_PATH": str(sandbox / "injected.db") if mode == "store" else str(SERVER / "jiedui.db"),
        "JIEDUI_ENV_FILE_DISABLED": "1" if mode in ("store", "env") else "0",
    })
    if fault:
        original_update = os.environ.update
        omitted = {"drop-db": "JIEDUI_DB_PATH", "drop-env": "JIEDUI_ENV_FILE_DISABLED"}[fault]

        def drop_assignment(values=(), **kwargs):
            values = dict(values, **kwargs)
            values.pop(omitted, None)
            original_update(values)

        os.environ.update = drop_assignment
    sys.path.insert(0, str(SERVER))
    code = 0
    try:
        if mode == "env":
            from app import env
            assert env.ENV_FILE == SERVER / ".env"
        elif mode == "store":
            from app import store
            assert Path(store.DB_PATH).resolve() == sandbox / "injected.db"
            with store._conn() as conn:
                assert conn.execute("SELECT name FROM sqlite_master WHERE name='projects'").fetchone()
        elif mode == "import":
            first = runpy.run_path(str(SERVER / "tests/conftest.py"))
            from app import store
            expected = Path(store.DB_PATH).resolve()
            with store._conn() as conn:
                conn.execute("CREATE TABLE m0a_marker(value TEXT)")
                conn.execute("INSERT INTO m0a_marker VALUES ('preserved')")
            second = runpy.run_path(str(SERVER / "tests/conftest.py"))
            assert first["_TEST_DB"] == second["_TEST_DB"] == str(expected)
            for module_name in ("store_resources", "store_learner", "store_ai_reply", "store_obs", "store_study"):
                assert Path(sys.modules["app." + module_name].DB_PATH).resolve() == expected
            with store._conn() as conn:
                assert conn.execute("SELECT value FROM m0a_marker").fetchone()[0] == "preserved"
            assert os.environ["AI_API_KEY"] == "test-key"
            assert os.environ["AI_API_BASE_URL"] == "https://models.invalid/v1"
            assert os.environ["JIEDUI_TEST_TMPDIR"] != os.environ.get("M0A_OLD_ROOT")
            from app import pair_ai_context as pair_ai
            frozen_mode = pair_ai.MODE
            assert frozen_mode == os.environ["PAIR_AI_MODE"]
            os.environ["PAIR_AI_MODE"] = "invalid-after-startup"
            assert pair_ai.capabilities()["mode"] == frozen_mode
            print("PAIR_MODE_FROZEN " + frozen_mode)
        else:
            import pytest
            args = []  # Use the project's unfiltered pytest.ini defaults.
            if mode == "collect":
                args.append("--collect-only")
            code = int(pytest.main(pytest_args or args))
    except SentinelViolation as exc:
        print("PREIMPORT_BLOCKED: " + str(exc))
        code = 1
    except BaseException as exc:
        print(type(exc).__name__ + ": " + str(exc))
        code = 1
    if violations:
        code = 1
    print("M0A_SENTINEL " + json.dumps({"mode": mode, "exit": code,
          "sqlite_connections": len(connections), "database_targets": sorted(set(connections)),
          "violations": violations, "fault": fault}, ensure_ascii=False))
    return code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("env", "store", "import", "collect", "suite"), default="import")
    parser.add_argument("--child-root", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--fault", choices=("drop-db", "drop-env"), help="Safe bootstrap mutation probe (expected exit 1)")
    parser.add_argument("--pair-ai-mode", default=os.getenv("PAIR_AI_MODE", "legacy"),
                        help="Freeze mode before application import; invalid values test fail-closed startup")
    args, rest = parser.parse_known_args()
    if args.fault and args.mode != "import":
        parser.error("--fault is only supported with --mode import")
    if args.child_root:
        os.environ["PAIR_AI_MODE"] = args.pair_ai_mode
        return child(args.mode, args.child_root.resolve(), rest, args.fault)
    with tempfile.TemporaryDirectory(prefix="jiedui_sentinel_") as folder:
        env = os.environ.copy()
        # Challenge inherited configuration with synthetic values, never print it.
        env.update({"AI_API_KEY": "synthetic-inherited-not-a-real-key",
                    "AI_API_BASE_URL": "https://inherited.invalid/v1",
                    "JIEDUI_TEST_TMPDIR": folder, "M0A_OLD_ROOT": folder,
                    "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1",
                    "PYTHONIOENCODING": "utf-8"})
        cmd = [sys.executable, str(Path(__file__).resolve()), "--mode", args.mode,
               "--child-root", folder, "--pair-ai-mode", args.pair_ai_mode]
        if args.fault:
            cmd.extend(["--fault", args.fault])
        cmd.extend(rest)
        return subprocess.run(cmd, cwd=SERVER, env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
