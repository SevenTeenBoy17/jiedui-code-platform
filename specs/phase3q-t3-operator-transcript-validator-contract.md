# Phase 3Q T3 Operator Transcript Validator Contract

## Goal

Validate a future operator transcript against the Phase 3P T3 operator checklist using metadata only, while preserving the blocked T3 state.

## API Contract

- `GET /api/delivery/t3-operator-transcript-validator`
  - Returns validator readiness derived from the Phase 3P checklist.
  - Status: `t3-operator-transcript-validator-ready-execution-blocked`.
- `POST /api/delivery/t3-operator-transcript-validator`
  - Accepts one transcript object or an array of transcript objects.
  - Valid transcript status: `t3-operator-transcript-valid-state-unchanged`.
  - Rejected transcript status: `t3-operator-transcript-rejected-execution-blocked`.

## Transcript Shape

```json
{
  "laneId": "runtime",
  "checklistBundleHash": "<sha256>",
  "manualStepIds": ["runtime-confirm-single-lane-approval"],
  "evidenceArtifactHashes": [{ "id": "runtime-...", "status": "passed", "artifactHash": "<sha256>" }],
  "rollbackArtifactHashes": [{ "id": "runtime-...", "status": "passed", "artifactHash": "<sha256>" }],
  "approvalRecorded": false,
  "executionAllowed": false,
  "externalActionsExecuted": false,
  "certificationStateChanged": false,
  "finalGoalComplete": false
}
```

## Acceptance Criteria

- The validator exposes exactly three T3 lane validations.
- A valid transcript must match the Phase 3P checklist hash and include all manual step ids, evidence hashes, and rollback hashes for its lane.
- Any missing metadata, unsafe state-change claim, approval-recording claim, execution claim, secret-like value, or content/body field is rejected.
- All responses keep `validatorOnly=true`, `approvalRecorded=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- The CLI writes metadata-only JSON and Markdown artifacts under `qa-artifacts/`.
- Report export, research UI, smoke QA, agentic audit, completion audit, handoff dossier, and artifact index all track Phase 3Q without claiming final completion.

## Guardrails

- No provider calls.
- No managed database connections.
- No deployments.
- No billing actions.
- No approval recording.
- No certification execution.
- No certification state changes.
- No artifact, evidence, approval, provider, database, or secret body content returned.
