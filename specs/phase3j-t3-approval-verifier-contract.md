# Phase 3J T3 Approval Verifier Contract

## Endpoint

`GET /api/delivery/t3-approval-verifier`

`POST /api/delivery/t3-approval-verifier`

The GET endpoint returns a local verifier summary for the current Phase 3I lock. The POST endpoint accepts one candidate lane metadata payload and validates it against the current lock without recording approval or executing certification.

## Offline Artifacts

- `qa-artifacts/phase3j-t3-approval-verifier.json`
- `qa-artifacts/phase3j-t3-approval-verifier.md`

## Contract

The verifier must:

- Return `phase="3J"`.
- Return `status="approval-verifier-ready-execution-blocked"` when no candidate is supplied.
- Return `status="approval-metadata-verified-execution-blocked"` only when one candidate lane id, approval lock hash, and approval text hash match the current lock.
- Return `verifierOnly=true`.
- Return `finalGoalComplete=false`.
- Return `approved=false`.
- Return `approvalRecorded=false`.
- Return `executionAllowed=false`.
- Return `externalActionsExecuted=false`.
- Return `certificationStateChanged=false`.
- Return `contentReturned=false`.
- Return three lane verifications for runtime, database, and provider.
- Return candidate match booleans only; do not return approval text content.
- Reject secret-shaped or env-assignment candidate content by setting `secretExposure=true` and `verificationPassed=false`.

## Report Fields

The report export must include:

- `t3ApprovalVerifierStatus`
- `t3ApprovalVerifierOnly`
- `t3ApprovalVerifierPassed`
- `t3ApprovalVerifierExecutionAllowed`
- `t3ApprovalVerifierLaneCount`
- `t3ApprovalVerifierReadyLaneCount`
- `t3ApprovalVerifierFinalGoalComplete`

## UI

- Research page renders `data-t3-approval-verifier`.
- UI shows verifier status, lane count, ready lane count, and execution guard.

## Guardrails

- No approval is persisted.
- No approval text content is returned.
- No external provider calls are made.
- No managed database connection is opened.
- No deployment, billing action, or certification execution occurs.
- The verifier is a local metadata gate only; it does not satisfy the three T3 certification gaps.
