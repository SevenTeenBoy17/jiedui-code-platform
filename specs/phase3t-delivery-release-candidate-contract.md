# Phase 3T Delivery Release Candidate Contract

## Purpose

Create a local-only release-candidate bundle that consolidates the latest local delivery evidence for handoff review without claiming final completion.

## API

- `GET /api/delivery/release-candidate`
  - Status: `release-candidate-local-evidence-ready-open-t3`.
  - Returns local evidence readiness, visual storyboard readiness, agentic QA readiness, artifact integrity, objective traceability, three open T3 certification gaps, and a SHA-256 release candidate hash.
  - Keeps `releaseCandidateOnly=true`, `readyForHumanReview=true`, `readyForProductionRelease=false`, `blockedByT3=true`, and `finalGoalComplete=false`.

## Artifacts

- `qa-artifacts/phase3t-delivery-release-candidate.json`
- `qa-artifacts/phase3t-delivery-release-candidate.md`

## Guardrails

- Do not run external provider calls, managed database connections, deployments, billing actions, or certification execution.
- Do not record approval or certification state changes.
- Do not return artifact body content, evidence body content, approval text content, screenshot bytes, secrets, API keys, database URLs, or provider responses.
- Keep all three T3 gaps open until a future explicit human-approved lane supplies runtime evidence.

## Acceptance

- Report export, smoke QA, three-round QA, agentic audit, completion audit, handoff dossier, artifact index, final readiness, and release candidate QA track Phase 3T.
- Release candidate remains a local handoff bundle only; it can be reviewed by a human but is not production release approval.
