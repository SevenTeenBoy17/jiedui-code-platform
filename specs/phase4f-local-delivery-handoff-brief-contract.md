# Phase 4F Local Delivery Handoff Brief Contract

## Purpose

Provide a metadata-only local delivery handoff brief that a reviewer can use to
start local review after the Phase 4E summary packet.

## Endpoint

- `GET /api/delivery/handoff-brief`

## Required State

- `phase` is `4F`.
- `status` is `local-delivery-handoff-brief-ready-open-t3` when all local
  handoff sections are ready.
- `handoffBriefOnly` is `true`.
- `localHandoffPassed` is `true` only for local metadata readiness.
- `readyForUserReview` is `true`.
- `readyForProductionRelease` is `false`.
- `blockedByT3` is `true`.
- `contentReturned` is `false`.
- `finalGoalComplete` is `false`.
- Exactly 3 open T3 gaps remain.

## Sections

The brief has six local sections:

1. `handoff-entrypoints`
2. `local-run-commands`
3. `student-teacher-review`
4. `qa-evidence`
5. `delivery-artifacts`
6. `t3-boundary`

Each section returns status, readiness, purpose, evidence ids, and guard flags
only.

## Guardrails

The endpoint and offline artifacts must not return artifact bodies, evidence
bodies, screenshot bytes, approval text, secret values, key-shaped tokens,
provider responses, database connection strings, review command output, external
calls, managed database connections, deployments, billing actions, approval
records, certification execution, certification state changes, production
release state, or final completion claims.

Local commands may be listed as review metadata only. They must have
`executionAllowed=false`, `executed=false`, and `outputReturned=false`.

## Evidence

Focused QA must prove the offline JSON/Markdown artifacts, endpoint, report
fields, six ready sections, local command metadata, three open T3 gaps, blocked
production release, blocked final completion, and no secret exposure.
