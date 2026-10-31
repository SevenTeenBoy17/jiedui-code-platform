# Phase 4D Delivery Evidence Navigator Contract

## Purpose

Provide a local-only evidence navigator that lets a reviewer find the student,
teacher, research, visual, QA, and remaining T3 certification evidence without
returning artifact bodies, screenshots, approval text, secrets, provider
responses, database strings, or executing any review command.

## API

- `GET /api/delivery/evidence-navigator`

## Response Contract

- `phase`: `4D`
- `status`: `delivery-evidence-navigator-ready-open-t3` when all local metadata is present.
- `deliveryEvidenceNavigatorOnly`: `true`
- `localNavigationPassed`: `true` only when all navigator sections are ready and hashed.
- `readyForHumanReview`: mirrors `localNavigationPassed`.
- `readyForProductionRelease`: always `false`.
- `blockedByT3`: always `true`.
- `contentReturned`: always `false`.
- `finalGoalComplete`: always `false`.
- `navigationSectionCount`: expected `5`.
- `readyNavigationSectionCount`: expected `5`.
- `openT3GapCount`: expected `3`.
- `evidenceFileCount`: at least `9`.
- `navigatorHash`: SHA-256 over metadata, section readiness, evidence hashes, open T3 gap count, and final-complete guard.

## Navigation Sections

1. `student-evidence-navigation`
2. `teacher-evidence-navigation`
3. `research-delivery-navigation`
4. `visual-and-agentic-qa-navigation`
5. `t3-certification-navigation`

## Guardrails

The navigator is metadata-only. It must not return artifact body content,
evidence body content, screenshot bytes, approval text, secret values,
key-shaped tokens, provider responses, database connection strings, review
command output, external-call results, managed database data, deployment state,
billing state, approval records, certification execution, certification state
changes, production release state, or final completion.

## Verification

- `npm run qa:evidence-navigator`
- `npm run qa:api`
- `npm run test`
- `npm run qa`
- `npm run qa:agentic`
- `npm run qa:completion`
- `npm run qa:handoff-export`
- `npm run qa:artifact-index`
