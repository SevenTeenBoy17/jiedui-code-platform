# Phase 2Y T3 Certification Package Contract

Create a local certification package surface that turns the three open T3 gaps into an auditable handoff bundle. This phase must not approve, execute, deploy, provision, connect to a managed database, call an external model/image provider, bill anything, or persist secret values.

## API

`GET /api/delivery/t3-certification-package`

Response `data` includes:

- `status`: `package-only`
- `executionAllowed`: false
- `finalGoalComplete`: false
- `t3ApprovalRequired`: true
- `preflightStatus`: copied from `/api/delivery/t3-preflight`
- `approvedPhaseReady`: copied from preflight, but not treated as execution permission
- `lanePackages`: exactly runtime, database, provider
- `executionOrder`: backup, approval, lane preflight, run one lane, collect evidence, rollback drill, review gate
- `guardrails`: no secret values, no external calls, no managed DB connections, no deployments

Each lane package includes:

- `id`
- `targetGap`
- `riskTier`: `T3`
- `allowedToRun`: false
- `approvalMarker`
- `preflightReady`
- `missing`
- `rollbackFirst`: true
- `rollbackPlan`
- `evidenceRequired`
- `evidenceIntake`
- `runbook`

## Report Export

`POST /api/reports/export` includes:

- `t3PackageStatus`
- `t3PackageExecutionAllowed`
- `t3PackageLaneCount`
- `t3PackageBlockedLaneCount`
- `t3PackageRollbackPlanCount`
- `t3PackageEvidenceRequirementCount`

## Research UI

The research page shows a T3 certification package panel with:

- `data-t3-package`
- package status and execution permission
- lane count / blocked lane count
- rollback and evidence counts
- visible runtime/database/provider lane labels

## Acceptance Criteria

- The endpoint returns exactly three lane packages.
- The endpoint and report keep `executionAllowed=false` and `finalGoalComplete=false`.
- Each lane has a rollback plan and evidence requirements.
- The package never returns secret values or key-shaped tokens.
- The UI exposes a visible package panel for research/compliance users.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, Python syntax, graph, and secret scans remain green.
