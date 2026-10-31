# Phase 2I - Sandbox Runner Boundary Contract

## Goal

Move sandbox run jobs from inline simulation toward a production-shaped runner boundary while keeping the local prototype safe and dependency-free.

This phase does not execute arbitrary student code in the host shell. It creates a separate Node child-process runner that accepts a bounded JSON request, applies the existing sandbox preflight rules, simulates approved educational output, and returns diagnostics that can later be replaced by a real isolated runner.

## API Contract

### `POST /api/run/jobs`

Adds runner controls to the Phase 2H body:

```json
{
  "language": "python",
  "code": "print('hello')",
  "runnerTimeoutMs": 2000,
  "simulateRunnerDelayMs": 0,
  "startMode": "auto"
}
```

Response keeps the Phase 2H shape and adds:

```json
{
  "job": {
    "id": "job-...",
    "status": "completed | rejected | timeout | queued | canceled",
    "terminal": true,
    "runner": {
      "engine": "sandbox-runner-v1",
      "isolation": "child-process-no-exec",
      "timeoutMs": 2000,
      "timedOut": false
    }
  },
  "result": {
    "status": "completed",
    "runnerDiagnostics": {
      "engine": "sandbox-runner-v1",
      "network": "disabled",
      "filesystem": "read-only virtual workspace"
    }
  }
}
```

`startMode: "manual"` creates a queued, non-terminal job for cancellation and future worker scheduling tests.

### `POST /api/run/jobs/:jobId/cancel`

Cancels a queued/running non-terminal job.

Success response:

```json
{
  "job": {
    "id": "job-...",
    "status": "canceled",
    "terminal": true,
    "progress": 100
  }
}
```

If the job is already terminal, return `409` with a non-destructive explanation.

### `POST /api/run`

Compatibility endpoint remains terminal by default and includes runner diagnostics.

### `POST /api/reports/export`

Adds:

- `timeoutRunJobCount`
- `canceledRunJobCount`
- `runnerBoundaryCount`

## Acceptance Criteria

- Safe jobs complete through the separate runner boundary.
- Blocked jobs return rejected terminal state through the same boundary.
- Timeout jobs return terminal `timeout` state and diagnostics.
- Manual queued jobs can be canceled through `POST /api/run/jobs/:jobId/cancel`.
- `/api/run` compatibility still returns stdout, sandbox policy, job evidence, and runner diagnostics.
- Research export includes completed/rejected/timeout/canceled/runner-boundary counts.
- UI click QA still waits for terminal job output before submission.
- No real API key or untrusted host execution is introduced.
