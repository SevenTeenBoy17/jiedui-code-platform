# Phase 3O T3 Evidence Bundle Templates Contract

## Purpose

Phase 3O generates local metadata-only evidence bundle templates for the three remaining T3 certification lanes. It derives required evidence IDs and rollback result IDs from the current Phase 3L approval execution gate so a future explicitly approved T3 run can collect evidence in the exact shape Phase 3M closure expects.

This phase does not execute certification, record approval, collect evidence bodies, connect external systems, or claim final completion.

## API Contract

`GET /api/delivery/t3-evidence-bundle-templates`

- Returns one template for each lane: `runtime`, `database`, and `provider`.
- Each template includes:
  - `laneId`
  - `targetGap`
  - `riskTier=T3`
  - `executionGateHash`
  - `evidenceItems`: required evidence IDs with empty `artifactHashPlaceholder`
  - `rollbackResults`: required rollback IDs with empty `artifactHashPlaceholder`
  - blocked state flags required by Phase 3M closure
- Does not return evidence body content, approval text content, or secrets.

## Status

- `evidence-bundle-templates-ready-execution-blocked`: all lane templates are generated and T3 execution remains blocked.
- `evidence-bundle-templates-incomplete`: the upstream execution gate is missing or incomplete.

## Report Fields

- `t3EvidenceBundleTemplateStatus`
- `t3EvidenceBundleTemplateOnly`
- `t3EvidenceBundleTemplateLaneCount`
- `t3EvidenceBundleTemplateReadyLaneCount`
- `t3EvidenceBundleTemplateEvidenceItemCount`
- `t3EvidenceBundleTemplateRollbackResultCount`
- `t3EvidenceBundleTemplateExecutionAllowed`
- `t3EvidenceBundleTemplateHash`
- `t3EvidenceBundleTemplateFinalGoalComplete`

## UI Contract

The research page renders `data-t3-evidence-bundle-templates` with status, lane counts, evidence/rollback counts, and template hash prefix.

## Guardrails

1. No external provider call.
2. No managed database connection.
3. No certified runtime execution.
4. No approval recording.
5. No certification state change.
6. No evidence body content, artifact body content, approval text, or secrets returned.
7. `executionAllowed=false` and `finalGoalComplete=false` on all paths.
