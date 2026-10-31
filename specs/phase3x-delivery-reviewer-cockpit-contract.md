# Phase 3X Delivery Reviewer Cockpit Contract

## Purpose

Phase 3X adds a local-only reviewer cockpit for final handoff review. It gives a teacher, researcher, or delivery reviewer one metadata-only surface that summarizes local completion evidence, visual and agentic QA, artifact integrity, objective traceability, release-candidate readiness, and T3 run-packet verification readiness.

## Endpoint And Artifacts

- `GET /api/delivery/reviewer-cockpit`
- `qa-artifacts/phase3x-delivery-reviewer-cockpit.json`
- `qa-artifacts/phase3x-delivery-reviewer-cockpit.md`

## Required State

- `phase` is `3X`.
- `status` is `reviewer-cockpit-ready-open-t3` when all local review sections are ready and the three T3 gaps remain open.
- `reviewerCockpitOnly=true`.
- `readyForHumanReview=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `finalGoalComplete=false`.
- `contentReturned=false`.

## Review Sections

The cockpit must expose compact section metadata, not source contents:

- `local-evidence`
- `agentic-qa`
- `visual-storyboard`
- `artifact-integrity`
- `objective-traceability`
- `release-candidate`
- `t3-run-packet-verifier`
- `production-release-gate`

Each section includes an id, title, status, short evidence string, and source hash when available.

## Guardrails

The cockpit must not:

- return artifact bodies, evidence bodies, screenshot bytes, approval text, secret values, key-shaped tokens, or raw provider/database configuration;
- record approval;
- execute certification;
- call external model or image providers;
- connect to a managed database;
- deploy, publish, bill, or change production state;
- claim final completion while any T3 gap is open.

## Verification

`npm run qa:reviewer-cockpit` must prove:

- offline artifacts are generated;
- endpoint and report fields expose the same blocked local-review state;
- all eight sections are present;
- three T3 gaps remain open;
- no secret-like token or forbidden body/content field is exposed;
- `finalGoalComplete=false`.
