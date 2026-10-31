# Phase 2X T3 Certification Preflight Contract

## Scope

Add a local-only preflight package for the three remaining T3 certification gaps:

- certified sandbox runtime,
- managed database certification,
- external provider certification.

This phase must not certify anything, read or expose secret values, connect to a managed database, call an external model/image provider, deploy, send mail, change billing, or mutate production state.

## API Contract

`GET /api/delivery/t3-preflight`

Response data:

- `status`: `preflight-only`
- `approvedPhaseReady`: false unless every lane has all prerequisites and explicit approval markers
- `safeToRunAutomatically`: false
- `t3ApprovalRequired`: true
- `lanes`: exactly three rows: runtime, database, provider
- `globalBlockers`: blockers that stop any real certification run
- `evidencePolicy`: explains that only presence/shape is reported, never secret values

Each lane includes:

- `id`
- `targetGap`
- `approvalRequired`
- `ready`
- `checks`
- `missing`
- `rollbackPlan`
- `evidenceRequired`

## Report Contract

`POST /api/reports/export` includes:

- `t3PreflightStatus`
- `t3PreflightApprovedPhaseReady`
- `t3PreflightLaneCount`
- `t3PreflightReadyLaneCount`
- `t3PreflightGlobalBlockerCount`

## Acceptance Criteria

- Focused QA proves the endpoint and report fields.
- Focused QA injects fake secret-shaped env values and proves they are not echoed.
- Completion audit and agentic audit track the preflight package.
- Existing readiness/certification endpoints continue to report non-certified state.
- Existing API, smoke, workflow, visual, agentic, completion, graph, and secret-scan gates remain green.
