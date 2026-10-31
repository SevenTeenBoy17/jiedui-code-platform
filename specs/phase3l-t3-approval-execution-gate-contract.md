# Phase 3L T3 Approval Execution Gate Contract

## Purpose

Create a local execution-gate preview that binds Phase 3K candidate metadata to the final pre-execution checklist for one future explicitly approved T3 lane.

This phase is gate-only. It must not approve, record approval, call external providers, connect to managed databases, deploy, publish, bill, use secret values, execute certification, or claim final completion.

## API

`GET /api/delivery/t3-approval-execution-gate`

Returns the current local gate summary for all three candidate lanes.

`POST /api/delivery/t3-approval-execution-gate`

Accepts one candidate payload with:

- `laneId`
- `approvalLockHash`
- `approvalTextHash`

The POST validates that the candidate still matches the current approval lock and candidate bundle. It returns a blocked execution preview for that one lane only.

## Required Fields

- `phase`: `3L`
- `status`: one of `approval-execution-gate-ready-execution-blocked`, `approval-execution-gate-candidate-bound-execution-blocked`, or `approval-execution-gate-rejected-execution-blocked`
- `finalGoalComplete`: false
- `gateOnly`: true
- `approvalRecorded`: false
- `approved`: false
- `executionAllowed`: false
- `externalActionsExecuted`: false
- `certificationStateChanged`: false
- `contentReturned`: false
- `candidateBundleHash`: SHA-256 string
- `executionGateHash`: SHA-256 string
- `laneGateCount`: 3
- `readyLaneGateCount`: 3 when Phase 3K candidates are healthy
- `boundCandidateCount`: 0 for GET, 1 for a valid POST candidate
- `boundLaneId`: candidate lane id for a valid POST, otherwise empty string
- `gateLanes`: per-lane local checks, required evidence, rollback checks, and prohibited actions
- `guardrails`: all external/certification actions false

## Report Fields

- `t3ApprovalExecutionGateStatus`
- `t3ApprovalExecutionGateOnly`
- `t3ApprovalExecutionGateLaneCount`
- `t3ApprovalExecutionGateReadyLaneCount`
- `t3ApprovalExecutionGateBoundCandidateCount`
- `t3ApprovalExecutionGateExecutionAllowed`
- `t3ApprovalExecutionGateHash`
- `t3ApprovalExecutionGateFinalGoalComplete`

## UI

The research page renders `data-t3-approval-execution-gate` with status, lane counts, bound candidate count, execution flag, and gate hash prefix.

## Acceptance Criteria

1. GET returns all three local lane gates and preserves blocked execution.
2. POST accepts exactly one valid Phase 3K candidate and returns a candidate-bound blocked preview.
3. POST rejects unknown, mismatched, multi-lane, or secret-like candidates.
4. No approval text content, secret values, external calls, managed DB connections, deployments, billing, or certification execution occurs.
5. Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3l-t3-approval-execution-gate.*`.
6. Report export, smoke/static QA, agentic audit, completion audit, artifact index, and focused QA track the gate while keeping `finalGoalComplete=false`.
