# Phase 2W Delivery Certification Overview Contract

## Scope

Add a local delivery certification overview that consolidates proved local evidence and the remaining T3 certification gaps. This phase must not provision infrastructure, use provider keys, call external model/image services, connect to a managed database, deploy, or claim final product completion.

## API Contract

`GET /api/delivery/certification-overview`

Response data:

- `status`: `pass-with-open-certification-gaps` when local audit evidence is proved and external certification gaps remain.
- `finalGoalComplete`: always false until all certification gaps are closed.
- `localEvidencePassed`: true only when the completion audit proves all local evidence rows.
- `readinessSurfaces`: exactly one row each for sandbox runtime, model provider, and database.
- `openCertificationGaps`: the expected T3 gaps: container runtime, managed database, external provider.
- `guardrails`: secret-safe and no-outbound/no-deploy constraints.
- `nextActions`: concrete approved T3 certification actions.

## UI Contract

The research page shows a delivery overview surface with:

- local evidence status,
- open certification gap count,
- readiness rows for sandbox/provider/database,
- a clear non-certified/final-goal-not-complete marker.

## Report Contract

`POST /api/reports/export` includes:

- `deliveryOverviewStatus`
- `deliveryFinalGoalComplete`
- `deliveryLocalEvidencePassed`
- `deliveryOpenCertificationGapCount`
- `deliveryReadinessSurfaceCount`

## Acceptance Criteria

- The overview endpoint returns no key-shaped secrets.
- The endpoint, report, static QA, agentic audit, and completion audit track Phase 2W.
- Existing provider/sandbox/database readiness endpoints continue to return `certified=false`.
- Existing API, smoke, static workflow, visual, agentic, and completion gates remain green.
