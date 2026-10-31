# Phase 4H Local Delivery Verification Suite Contract

## Purpose

Provide a metadata-only local verification suite for reviewers who want one
repeatable checklist of the local commands, evidence files, and result gates
needed to re-check the CodeX delivery after the Phase 4G quickstart bundle.

## Endpoint

- `GET /api/delivery/local-verification-suite`

## Required State

- `phase` is `4H`.
- `status` is `local-delivery-verification-suite-ready-open-t3` when local
  verification metadata is ready.
- `verificationSuiteOnly` is `true`.
- `localVerificationPassed` is `true` only for local metadata and existing
  evidence readiness.
- `readyForLocalVerificationReview` is `true`.
- `readyForProductionRelease` is `false`.
- `blockedByT3` is `true`.
- `contentReturned` is `false`.
- `finalGoalComplete` is `false`.
- Exactly 3 open T3 gaps remain.

## Verification Shape

The suite must include local-only metadata for:

- `verificationChecks`: ordered local readiness checks.
- `localCommands`: commands a reviewer can run manually.
- `evidenceFiles`: hashed local evidence metadata only.
- `openCertificationGaps`: the three T3 gaps that remain approval-gated.

Every command must have `executionAllowed=false`, `executed=false`, and
`outputReturned=false`.

## Guardrails

The suite must not return artifact bodies, evidence bodies, screenshot bytes,
approval text, secret values, key-shaped tokens, provider responses, database
connection strings, command output, external calls, managed database
connections, deployments, billing actions, approval records, certification
execution, certification state changes, production release state, or final
completion claims.

## Evidence

Focused QA must prove the offline JSON/Markdown artifacts, endpoint, report
fields, ordered verification checks, local command metadata, three open T3
gaps, blocked production release, blocked final completion, and no secret
exposure.
