# Phase 3M T3 Certification Evidence Closure Contract

## Purpose

Phase 3M adds a local-only evidence closure validator for future T3 certification work. It checks whether a hypothetical externally collected evidence bundle satisfies the Phase 3L execution gate requirements, but it never executes certification, records approval, connects external systems, or claims final completion.

## API Contract

`GET /api/delivery/t3-certification-evidence-closure`

- Returns the current closure requirements derived from the Phase 3L gate.
- No request body is needed.
- Always returns `executionAllowed=false`, `certificationStateChanged=false`, and `finalGoalComplete=false`.

`POST /api/delivery/t3-certification-evidence-closure`

- Accepts one local evidence bundle:
  - `laneId`: one of `runtime`, `database`, `provider`.
  - `executionGateHash`: the current Phase 3L gate hash.
  - `evidenceItems`: objects keyed by required evidence `id`.
  - `rollbackResults`: objects keyed by required rollback `id`.
  - `externalActionsExecuted=false`, `certificationStateChanged=false`, `finalGoalComplete=false`.
- Returns metadata-only validation results: counts, missing canonical requirements, rejection reasons, and hashes.
- Does not return evidence body content.

## Statuses

- `certification-evidence-closure-ready-execution-blocked`: no bundle supplied; closure requirements are ready.
- `certification-evidence-closure-ready-state-unchanged`: supplied bundle satisfies local closure checks; certification state still unchanged.
- `certification-evidence-closure-rejected-execution-blocked`: supplied bundle is incomplete, mismatched, secret-like, or tries to claim state changes.

## Report Fields

- `t3CertificationEvidenceClosureStatus`
- `t3CertificationEvidenceClosureOnly`
- `t3CertificationEvidenceClosureLaneCount`
- `t3CertificationEvidenceClosureReadyLaneCount`
- `t3CertificationEvidenceClosureSubmittedBundleCount`
- `t3CertificationEvidenceClosureValidatedBundleCount`
- `t3CertificationEvidenceClosureExecutionAllowed`
- `t3CertificationEvidenceClosureHash`
- `t3CertificationEvidenceClosureFinalGoalComplete`

## UI Contract

The research page renders `data-t3-certification-evidence-closure` with status, lane counts, submitted/validated bundle counts, execution flag, and closure hash prefix.

## Guardrails

1. The validator is local metadata validation only.
2. It rejects secret-like payloads and environment assignment markers.
3. It rejects bundles that set `externalActionsExecuted`, `certificationStateChanged`, or `finalGoalComplete` to true.
4. It does not record approval or execute certification.
5. It does not return evidence body content.
6. Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3m-t3-certification-evidence-closure.*`.
