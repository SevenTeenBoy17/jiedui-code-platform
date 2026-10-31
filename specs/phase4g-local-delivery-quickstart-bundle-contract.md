# Phase 4G Local Delivery Quickstart Bundle Contract

## Purpose

Provide a metadata-only local quickstart bundle for a reviewer who wants to run
and inspect the CodeX delivery locally after the Phase 4F handoff brief.

## Endpoint

- `GET /api/delivery/quickstart-bundle`

## Required State

- `phase` is `4G`.
- `status` is `local-delivery-quickstart-ready-open-t3` when local quickstart
  metadata is ready.
- `quickstartBundleOnly` is `true`.
- `localQuickstartPassed` is `true` only for local metadata readiness.
- `readyForLocalRunbookReview` is `true`.
- `readyForProductionRelease` is `false`.
- `blockedByT3` is `true`.
- `contentReturned` is `false`.
- `finalGoalComplete` is `false`.
- Exactly 3 open T3 gaps remain.

## Quickstart Shape

The bundle must include local-only metadata for:

- `quickstartSteps`: ordered reviewer steps.
- `localCommands`: commands to run manually, never executed by the endpoint.
- `localRoutes`: local URLs and API routes to inspect manually.
- `evidenceFiles`: hashed evidence metadata only.
- `openCertificationGaps`: the three T3 gaps that remain approval-gated.

Every command and step must have `executionAllowed=false`, `executed=false`,
and `outputReturned=false`.

## Guardrails

The bundle must not return artifact bodies, evidence bodies, screenshot bytes,
approval text, secret values, key-shaped tokens, provider responses, database
connection strings, review command output, external calls, managed database
connections, deployments, billing actions, approval records, certification
execution, certification state changes, production release state, or final
completion claims.

## Evidence

Focused QA must prove the offline JSON/Markdown artifacts, endpoint, report
fields, ordered quickstart steps, local route metadata, local command metadata,
three open T3 gaps, blocked production release, blocked final completion, and no
secret exposure.
