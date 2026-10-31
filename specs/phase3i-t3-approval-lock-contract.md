# Phase 3I T3 Approval Lock Contract

## Endpoint

`GET /api/delivery/t3-approval-lock`

## Offline Artifacts

- `qa-artifacts/phase3i-t3-approval-lock.json`
- `qa-artifacts/phase3i-t3-approval-lock.md`

## Response Contract

- `phase`: `3I`
- `status`: `approval-lock-ready-with-open-t3-gaps`
- `finalGoalComplete`: false
- `lockOnly`: true
- `approved`: false
- `executionAllowed`: false
- `externalActionsExecuted`: false
- `certificationStateChanged`: false
- `contentReturned`: false
- `approvalRequestStatus`
- `approvalRequestCount`
- `requestReadyCount`
- `integrityStatus`
- `integrityBundleHash`
- `approvalLockHash`
- `openCertificationGapCount`: 3 until approved T3 certification closes them
- `laneLockCount`: 3
- `laneLocks`
- `guardrails`: no secrets, no approval, no external calls, no managed DB
  connections, no deployment, no billing, no certification execution, no final
  completion claim

`laneLocks` contain only metadata and hashes:

- lane id / target gap / risk tier
- request ready flag
- `approvalTextHash`, not approval text content
- local command candidate count
- rollback step count
- evidence item count
- `approved=false`, `executionAllowed=false`

## Report Export Fields

- `t3ApprovalLockStatus`
- `t3ApprovalLockOnly`
- `t3ApprovalLockApproved`
- `t3ApprovalLockExecutionAllowed`
- `t3ApprovalLockLaneCount`
- `t3ApprovalLockOpenGapCount`
- `t3ApprovalLockHash`
- `t3ApprovalLockFinalGoalComplete`

## UI Marker

- Research page renders `data-t3-approval-lock`.

## Acceptance Criteria

1. The lock binds the Phase 3G approval request export to the Phase 3H integrity
   bundle hash.
2. The lock exposes approval text hashes instead of approval text contents.
3. Runtime/database/provider lanes remain unapproved and not executable.
4. The endpoint, report, UI, smoke checks, agentic audit, and completion audit
   all keep `finalGoalComplete=false`.
5. No key-shaped token or secret assignment is returned.
6. No T3 certification, external action, managed DB connection, deployment, or
   billing action occurs.
