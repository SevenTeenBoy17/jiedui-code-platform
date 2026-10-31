# Phase 3G T3 Approval Request Export Contract

## Endpoint

`GET /api/delivery/t3-approval-request-export`

## Offline Artifacts

- `qa-artifacts/phase3g-t3-approval-request-export.json`
- `qa-artifacts/phase3g-t3-approval-request-export.md`

## Response Contract

- `phase`: `3G`
- `status`: `approval-request-export-ready`
- `finalGoalComplete`: false
- `exportOnly`: true
- `externalActionsExecuted`: false
- `certificationStateChanged`: false
- `executionAllowed`: false
- `approvalRequestCount`: 3
- `requestReadyCount`: 3 when all local dry-run checks pass
- `requests`: runtime, database, provider
- `artifactManifest`
- `guardrails`: no secrets, no external calls, no managed DB connections,
  no deployment, no billing, no certification execution, no completion claim

Each request includes:

- `id`
- `targetGap`
- `riskTier`: `T3`
- `approvalRequired`: true
- `approved`: false
- `executionAllowed`: false
- `singleLaneOnly`: true
- `approvalText`: explicit human approval sentence for exactly one lane
- `localCommandCandidates`
- `preExecutionChecks`
- `rollbackSummary`
- `evidenceChecklist`
- `dryRunChecks`
- `nextApprovedAction`

## Report Export Fields

- `t3ApprovalRequestExportStatus`
- `t3ApprovalRequestExportOnly`
- `t3ApprovalRequestExternalActionsExecuted`
- `t3ApprovalRequestCertificationStateChanged`
- `t3ApprovalRequestExecutionAllowed`
- `t3ApprovalRequestCount`
- `t3ApprovalRequestReadyCount`
- `t3ApprovalRequestFinalGoalComplete`

## UI Marker

- Research page renders `data-t3-approval-request-export`.

## Acceptance Criteria

1. The export produces exactly three approval requests, one per T3 gap.
2. Each request carries a single-lane approval sentence, rollback summary,
   evidence checklist, and local command candidates.
3. The export writes JSON and Markdown artifacts offline.
4. The endpoint, report, UI, smoke checks, agentic audit, and completion audit
   all keep `finalGoalComplete=false`.
5. No key-shaped token or secret environment name is returned.
6. No T3 certification, external action, managed DB connection, deployment, or
   billing action occurs.

