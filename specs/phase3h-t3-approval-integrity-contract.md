# Phase 3H T3 Approval Integrity Contract

## Endpoint

`GET /api/delivery/t3-approval-integrity`

## Offline Artifacts

- `qa-artifacts/phase3h-t3-approval-integrity.json`
- `qa-artifacts/phase3h-t3-approval-integrity.md`

## Response Contract

- `phase`: `3H`
- `status`: `approval-integrity-ready`
- `finalGoalComplete`: false
- `hashOnly`: true
- `contentReturned`: false
- `externalActionsExecuted`: false
- `certificationStateChanged`: false
- `executionAllowed`: false
- `artifactCount`
- `readyArtifactCount`
- `missingArtifactCount`: 0 for a valid local bundle
- `hashCount`
- `secretExposure`: false
- `integrityBundleHash`
- `artifactInventory`
- `guardrails`: no secrets, no external calls, no managed DB connections,
  no deployment, no billing, no certification execution, no completion claim

The artifact inventory covers the Phase 3G JSON/Markdown approval request
export, Phase 3G contract, script, test, and this Phase 3H contract/script/test.

## Report Export Fields

- `t3ApprovalIntegrityStatus`
- `t3ApprovalIntegrityHashOnly`
- `t3ApprovalIntegrityContentReturned`
- `t3ApprovalIntegrityArtifactCount`
- `t3ApprovalIntegrityReadyArtifactCount`
- `t3ApprovalIntegrityMissingArtifactCount`
- `t3ApprovalIntegrityHashCount`
- `t3ApprovalIntegritySecretExposure`
- `t3ApprovalIntegrityFinalGoalComplete`

## UI Marker

- Research page renders `data-t3-approval-integrity`.

## Acceptance Criteria

1. The integrity surface inventories approval-request artifacts without returning
   artifact contents.
2. Every artifact has size and SHA-256 metadata.
3. `integrityBundleHash` changes if any inventoried artifact changes.
4. The endpoint, report, UI, smoke checks, agentic audit, and completion audit
   all keep `finalGoalComplete=false`.
5. No key-shaped token or secret environment name is returned.
6. No T3 certification, external action, managed DB connection, deployment, or
   billing action occurs.

