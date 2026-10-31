# Phase 3Z Delivery Consistency Sentinel Contract

## Purpose

Phase 3Z adds a local-only delivery consistency sentinel. It checks that the main delivery evidence surfaces agree on the same blocked-but-review-ready state before handoff: local review is ready, production release is not ready, three T3 certification gaps remain open, no content bodies are returned, no certification execution is allowed, and `finalGoalComplete=false`.

## Endpoint And Artifacts

- `GET /api/delivery/consistency-sentinel`
- `qa-artifacts/phase3z-delivery-consistency-sentinel.json`
- `qa-artifacts/phase3z-delivery-consistency-sentinel.md`

## Required State

- `phase` is `3Z`.
- `status` is `delivery-consistency-sentinel-ready-open-t3` when all invariants pass and the three T3 gaps remain open.
- `sentinelOnly=true`.
- `consistencyPassed=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `contradictionCount=0`.
- `finalGoalComplete=false`.
- `contentReturned=false`.
- `surfaceCount`, `invariantCount`, `evidenceFileCount`, and `consistencyHash` are present.

## Invariants

The sentinel must check metadata from the latest local evidence chain:

- every surface that reports `finalGoalComplete` reports `false`;
- every surface that reports production release readiness reports `false`;
- every surface that reports T3 execution or certification execution reports `false`;
- every surface that reports content/body/screenshot byte return reports `false`;
- every surface that reports open T3 gap count agrees on exactly three gaps;
- required local evidence artifacts exist and are hashed;
- Phase 3X reviewer cockpit and Phase 3Y launch guide are both ready.

## Guardrails

The sentinel must not:

- return artifact bodies, evidence bodies, screenshot bytes, approval text, secret values, key-shaped tokens, or raw provider/database configuration;
- record approval;
- execute certification;
- run review commands;
- call external model or image providers;
- connect to a managed database;
- deploy, publish, bill, or change production state;
- claim final completion while any T3 gap is open.

## Verification

`npm run qa:consistency-sentinel` must prove:

- offline JSON and Markdown artifacts are generated;
- endpoint and report fields expose the same consistency state;
- the sentinel covers at least seven delivery surfaces and seven invariants;
- contradictions remain zero;
- three T3 gaps remain open;
- no secret-like token or forbidden body/content field is exposed;
- `finalGoalComplete=false`.
