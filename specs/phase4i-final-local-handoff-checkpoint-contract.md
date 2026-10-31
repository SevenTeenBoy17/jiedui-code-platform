# Phase 4I Final Local Handoff Checkpoint Contract

## Purpose

Provide a metadata-only final local handoff checkpoint for reviewers who need a
single, compact confirmation that the local CodeX delivery is review-ready after
Phase 4H, while production release and T3 certification remain blocked.

## Endpoint

- `GET /api/delivery/final-local-handoff-checkpoint`

## Required State

- `phase` is `4I`.
- `status` is `final-local-handoff-checkpoint-ready-open-t3` when local handoff
  metadata is ready.
- `checkpointOnly` is `true`.
- `localFinalHandoffPassed` is `true` only for local metadata and existing
  evidence readiness.
- `readyForFinalLocalReview` is `true`.
- `readyForProductionRelease` is `false`.
- `blockedByT3` is `true`.
- `contentReturned` is `false`.
- `finalGoalComplete` is `false`.
- Exactly 3 open T3 gaps remain.

## Verification Shape

The checkpoint must include metadata-only local information for:

- `checkpointSteps`: ordered local handoff checks.
- `localCommands`: commands a reviewer can run manually.
- `handoffArtifacts`: hashed local artifact metadata only.
- `openCertificationGaps`: the three T3 gaps that remain approval-gated.

Every command must have `executionAllowed=false`, `executed=false`, and
`outputReturned=false`.

## Guardrails

The checkpoint must not return artifact bodies, evidence bodies, screenshot
bytes, approval text, secret values, key-shaped tokens, provider responses,
database connection strings, command output, external calls, managed database
connections, deployments, billing actions, approval records, certification
execution, certification state changes, production release state, or final
completion claims.

## Evidence

Focused QA must prove the offline JSON/Markdown artifacts, endpoint, report
fields, ordered checkpoint steps, local command metadata, hashed handoff
artifacts, three open T3 gaps, blocked production release, blocked final
completion, and no secret exposure.
