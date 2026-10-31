# Phase 3P T3 Operator Checklist Contract

## Purpose

Create a local-only operator checklist for the three remaining T3 certification lanes: runtime/container certification, managed database certification, and external provider certification.

The checklist consolidates current local readiness, approval candidate metadata, execution gate hashes, and evidence bundle templates into lane-scoped manual steps that a future explicitly approved T3 phase can follow.

## Endpoint

`GET /api/delivery/t3-operator-checklist`

## Required Behavior

- Return `status=t3-operator-checklist-ready-execution-blocked` when all three lane checklists are ready.
- Return exactly three `laneChecklists`.
- Preserve `operatorOnly=true`, `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- Include one `checklistBundleHash` SHA-256 hash.
- For each lane, include:
  - `laneId`
  - `targetGap`
  - `candidateHash`
  - `executionGateHash`
  - `templateBundleHash`
  - `manualSteps`
  - `evidenceChecklist`
  - `rollbackChecklist`
  - `blockedActions`
- Never include approval text body content, evidence body content, artifact body content, secrets, API keys, database URLs, provider responses, or managed database connection strings.

## Report Fields

- `t3OperatorChecklistStatus`
- `t3OperatorChecklistOnly`
- `t3OperatorChecklistLaneCount`
- `t3OperatorChecklistReadyLaneCount`
- `t3OperatorChecklistManualStepCount`
- `t3OperatorChecklistEvidenceItemCount`
- `t3OperatorChecklistRollbackItemCount`
- `t3OperatorChecklistExecutionAllowed`
- `t3OperatorChecklistHash`
- `t3OperatorChecklistFinalGoalComplete`

## UI

The research page renders `data-t3-operator-checklist` with status, lane counts, manual step/evidence counts, and checklist hash prefix.

## Guardrails

- No provider calls.
- No managed database connections.
- No deployment or billing.
- No approval recording.
- No certification execution.
- No certification state change.
- No final completion claim.
