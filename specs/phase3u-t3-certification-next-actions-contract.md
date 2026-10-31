# Phase 3U T3 Certification Next Actions Contract

## Scope

Phase 3U adds a local-only T3 certification next-actions matrix. It consolidates the Phase 3T release candidate, Phase 3P operator checklist, Phase 3O evidence templates, and Phase 3L execution gate into one reviewer-facing endpoint and artifact set.

## Endpoint

`GET /api/delivery/t3-certification-next-actions`

The endpoint returns metadata only:

- `phase`: `3U`
- `status`: `t3-certification-next-actions-ready-execution-blocked`
- `nextActionsOnly`: `true`
- `readyForHumanReview`: `true`
- `approvalRequired`: `true`
- `executionAllowed`: `false`
- `readyForProductionRelease`: `false`
- `finalGoalComplete`: `false`
- exactly three lane actions for `runtime`, `database`, and `provider`
- exactly three open T3 gaps matching the original completion audit

## Guardrails

- Do not call external providers.
- Do not connect to managed databases.
- Do not deploy, publish, bill, or spend.
- Do not record approval.
- Do not execute certification.
- Do not return approval text, artifact bodies, evidence bodies, screenshot bytes, secrets, provider responses, or database connection strings.
- Do not claim production readiness or final completion.

## Acceptance Criteria

- The local artifact writer produces `qa-artifacts/phase3u-t3-certification-next-actions.json` and `.md`.
- The API endpoint and report export expose next-action fields.
- The research UI displays the matrix through `data-t3-certification-next-actions`.
- Smoke, API, agentic audit, completion audit, handoff export, artifact index, and release candidate QA track Phase 3U.
- `finalGoalComplete` remains `false` and the three T3 certification gaps remain open.
