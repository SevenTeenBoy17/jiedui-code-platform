# Phase 3F T3 Dry-Run Rehearsal Contract

## Endpoint

`GET /api/delivery/t3-dry-run-rehearsal`

## Response Contract

- `phase`: `3F`
- `status`: `rehearsal-ready-with-open-t3-gaps`
- `finalGoalComplete`: false
- `rehearsalOnly`: true
- `externalActionsExecuted`: false
- `certificationStateChanged`: false
- `executionAllowed`: false
- `safeToRunAutomatically`: false
- `laneCount`: 3
- `readyLaneCount`: 3 when all local dry-run checks pass
- `blockedLaneCount`: 3 because no T3 lane is approved to execute
- `dryRunCheckCount`
- `passedDryRunCheckCount`
- `failedDryRunCheckCount`: 0 for a valid local rehearsal
- `lanes`: runtime, database, provider
- `guardrails`: no secrets, no external calls, no managed DB connections,
  no deployment, no billing, no certification execution, no completion claim

Each lane includes:

- `id`
- `targetGap`
- `riskTier`: `T3`
- `approvedToExecute`: false
- `dryRunReady`
- `commandCandidates`: local-only commands that rehearse current evidence
- `checks`: local checks that prove approval remains blocked, rollback and
  evidence are visible, and no secret-shaped material is returned
- `nextApprovedAction`

## Report Export Fields

- `t3DryRunRehearsalStatus`
- `t3DryRunRehearsalOnly`
- `t3DryRunExternalActionsExecuted`
- `t3DryRunCertificationStateChanged`
- `t3DryRunExecutionAllowed`
- `t3DryRunLaneCount`
- `t3DryRunReadyLaneCount`
- `t3DryRunBlockedLaneCount`
- `t3DryRunCheckCount`
- `t3DryRunFailedCheckCount`
- `t3DryRunFinalGoalComplete`

## UI Marker

- Research page renders `data-t3-dry-run-rehearsal`.

## Acceptance Criteria

1. The dry run consumes the Phase 3E approval packet and produces three T3
   rehearsal lanes.
2. The dry run reports local readiness only; it does not execute provider calls,
   managed DB connections, deployment, billing, or certification.
3. Every lane keeps `approvedToExecute=false` and maps to local-only command
   candidates.
4. The endpoint, report, UI, smoke checks, agentic audit, and completion audit
   all preserve `finalGoalComplete=false`.
5. No key-shaped token or secret environment name is returned.

