# Phase 3Y Delivery Launch Guide Contract

## Purpose

Phase 3Y adds a local-only delivery launch guide for final reviewer handoff. It turns the Phase 3X reviewer cockpit into a practical review path: which local commands to run, which local routes to inspect, and which evidence files prove the current state.

## Endpoint And Artifacts

- `GET /api/delivery/launch-guide`
- `qa-artifacts/phase3y-delivery-launch-guide.json`
- `qa-artifacts/phase3y-delivery-launch-guide.md`

## Required State

- `phase` is `3Y`.
- `status` is `delivery-launch-guide-ready-open-t3` when the local evidence chain is present and the three T3 gaps remain open.
- `launchGuideOnly=true`.
- `readyForLocalReview=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `finalGoalComplete=false`.
- `contentReturned=false`.
- `commandCount`, `routeCount`, `evidenceFileCount`, and `launchGuideHash` are present.

## Review Inputs

The guide must list local-only review commands, local routes, and evidence file metadata. It may expose command labels and paths, but not secret values, artifact bodies, evidence bodies, screenshot bytes, provider responses, database connection strings, or approval text.

## Guardrails

The guide must not:

- return artifact bodies, evidence bodies, screenshot bytes, approval text, secret values, key-shaped tokens, or raw provider/database configuration;
- record approval;
- execute certification;
- call external model or image providers;
- connect to a managed database;
- deploy, publish, bill, or change production state;
- claim final completion while any T3 gap is open.

## Verification

`npm run qa:launch-guide` must prove:

- offline JSON and Markdown artifacts are generated;
- endpoint and report fields expose the same blocked local-review state;
- at least seven local commands, five routes, and six evidence files are listed;
- commands remain local review commands and do not contain secret assignments or outward execution;
- three T3 gaps remain open;
- no secret-like token or forbidden body/content field is exposed;
- `finalGoalComplete=false`.
