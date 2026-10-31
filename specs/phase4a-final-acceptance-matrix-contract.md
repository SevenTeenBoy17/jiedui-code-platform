# Phase 4A Final Acceptance Matrix Contract

## Purpose

Phase 4A adds a local-only final acceptance matrix for the CodeX delivery. It maps the original objective into explicit acceptance rows and connects each row to authoritative local evidence, while preserving the three T3 certification blockers and `finalGoalComplete=false`.

## Endpoint And Artifacts

- `GET /api/delivery/final-acceptance-matrix`
- `qa-artifacts/phase4a-final-acceptance-matrix.json`
- `qa-artifacts/phase4a-final-acceptance-matrix.md`

## Required State

- `phase` is `4A`.
- `status` is `final-acceptance-matrix-ready-open-t3` when local acceptance evidence is complete and the three T3 gaps remain open.
- `acceptanceMatrixOnly=true`.
- `localAcceptancePassed=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `finalGoalComplete=false`.
- `contentReturned=false`.
- `acceptanceRowCount`, `provedRowCount`, `blockedRowCount`, `evidenceFileCount`, and `acceptanceHash` are present.

## Acceptance Rows

The matrix must include rows for:

- model routing and >1000ms fallback contract;
- image-generation route separation;
- student workflow;
- teacher workflow;
- research/compliance workflow;
- 3D glass/cartoon UI evidence;
- staged autonomous development evidence;
- at least three internal QA/iteration rounds;
- agentic/research QA evidence;
- delivery artifacts and handoff evidence;
- runtime/container certification;
- managed database certification;
- external provider certification.

## Guardrails

The matrix must not:

- return artifact bodies, evidence bodies, screenshot bytes, approval text, secret values, key-shaped tokens, or raw provider/database configuration;
- record approval;
- execute certification;
- run review commands;
- call external model or image providers;
- connect to a managed database;
- deploy, publish, bill, or change production state;
- claim final completion while any T3 gap is open.

## Verification

`npm run qa:acceptance-matrix` must prove:

- offline JSON and Markdown artifacts are generated;
- endpoint and report fields expose the same acceptance state;
- at least thirteen acceptance rows are present;
- local rows are proved and exactly three T3 rows remain blocked;
- three T3 gaps remain open;
- no secret-like token or forbidden body/content field is exposed;
- `finalGoalComplete=false`.
