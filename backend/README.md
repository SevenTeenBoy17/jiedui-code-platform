# CodeX / AI小海龟 Backend Skeleton

This backend skeleton documents the FastAPI boundary for the current static prototype.

Phase 1 ships a dependency-free frontend prototype so it can run in a restricted school or Codex environment. Phase 2 can install the real backend dependencies and implement these contracts directly.

## Planned Stack

- FastAPI + Pydantic for typed API contracts
- WebSocket collaboration gateway
- PostgreSQL for users, classes, projects, versions, AI logs, and computational-thinking observations
- Redis for sessions, collaboration room state, rate limits, and background queues
- Pyodide/WASM in browser for lightweight Python turtle execution
- Isolated server runner for C/C++ with timeout, memory, syscall, and network restrictions

## Local Phase 2 Commands

```powershell
python -m venv .venv
.venv\Scripts\pip install fastapi uvicorn pydantic
.venv\Scripts\uvicorn backend.main:app --reload
```

No API keys should be committed. Provider credentials belong in a local environment file outside version control or a managed secret store.
