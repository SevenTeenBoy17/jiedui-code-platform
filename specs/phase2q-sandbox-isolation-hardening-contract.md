# Phase 2Q Sandbox Isolation Hardening Contract

## Goal

Strengthen the local student-code sandbox boundary so every run job carries
evidence for process isolation, scrubbed environment, ephemeral workspace,
bounded runtime, bounded output, and blocked escape patterns.

## Non-Goals

- No production container, VM, Kubernetes, cloud worker, or deployment change in
  this phase.
- No execution of arbitrary host-affecting code. The runner remains a
  no-exec/local contract harness while isolation controls are made explicit and
  testable.
- No secrets are passed into the runner process.

## Runtime Contract

Each run job must report:

- `runner.engine = sandbox-runner-v2`.
- `runner.isolation = process-scrubbed-temp-workspace-no-exec`.
- `runner.envPolicy = allowlist-scrubbed`.
- `runner.workspace.kind = ephemeral-temp`.
- `runner.outputLimitBytes` and `runner.timeoutMs`.
- `runner.secretEnvPresent = false`.
- `runner.cleanedWorkspace = true` after execution.

The runner must reject code containing escape attempts:

- Python: `os`, `subprocess`, `socket`, `shutil`, `pathlib`, `requests`,
  `urllib`, `http.client`, `eval`, `exec`, `open`, `input`,
  `__import__`, direct environment access, and common file/path traversal.
- C/C++: `system`, `fork`, `exec`, file streams, sockets, and filesystem
  includes.
- Unbounded loops without teacher approval.

## Acceptance Criteria

- Safe run jobs complete and show the v2 isolation evidence fields.
- Escape attempts are rejected before any run result is accepted.
- Timeout and cancel paths retain v2 isolation evidence.
- The runner process receives a scrubbed environment and an ephemeral cwd.
- Report export counts v2 isolated jobs.
- Existing API, smoke, static QA, visual QA, agentic QA, auth recovery, provider
  transport, Python syntax, graph, and secret scans remain green.
