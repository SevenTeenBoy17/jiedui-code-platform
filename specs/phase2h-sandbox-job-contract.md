# Phase 2H Sandbox Job Contract

## Goal

Move student code execution from a direct response into an auditable sandbox job lifecycle.

The local prototype still uses deterministic safe simulation, but the API shape now matches a production sandbox boundary where the client creates a job, waits for the terminal state, and only then treats the run as complete.

## API Contract

### `POST /api/run/jobs`

Request:

- `language`: `python`, `cpp`, or `c`
- `code`: submitted source
- `stdin?`: optional input

Response:

- `job.id`
- `job.status`: `completed` or `rejected` in the local deterministic runner
- `job.progress`: `100` in terminal states
- `job.terminal`: `true`
- `job.lifecycle`: ordered state events
- `job.result`: stdout/stderr/duration/canvas/sandbox result

### `GET /api/run/jobs/:jobId`

Returns the persisted job and result. This is the polling endpoint used by the frontend before showing final output.

### `GET /api/run/jobs`

Returns recent jobs for teacher/research evidence.

### Compatibility: `POST /api/run`

Maintains the existing response shape while internally creating a sandbox job. The response includes `jobId`, `jobStatus`, `jobProgress`, `terminal`, and `lifecycle`.

## Acceptance Criteria

- Safe code creates a terminal completed job with `sandbox-ok`.
- Blocked code creates a terminal rejected job with `sandbox-blocked`.
- Existing `/api/run` remains compatible and exposes job evidence.
- Student UI waits for terminal job evidence before showing output.
- Research export includes job counts, terminal counts, and rejected counts.
- Teacher dashboard can include recent run jobs.
- API/static/click QA proves terminal job behavior and no regression.
