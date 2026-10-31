# Phase 4C User Acceptance Rehearsal Contract

Phase 4C adds a local-only final user acceptance rehearsal after the Phase 4B certification blocker board. It packages the already-verified student, teacher, and research/delivery review flows into role-scoped rehearsal rows, while preserving that production release, certification execution, external provider calls, managed database connections, deployments, billing, approval recording, and final completion remain blocked without explicit human approval.

## Surfaces

- `GET /api/delivery/user-acceptance-rehearsal`
- `qa-artifacts/phase4c-user-acceptance-rehearsal.json`
- `qa-artifacts/phase4c-user-acceptance-rehearsal.md`
- Research-page panel with `data-user-acceptance-rehearsal`
- Report export fields prefixed with `userAcceptanceRehearsal`
- QA command: `npm run qa:user-acceptance-rehearsal`

## Response Contract

- `phase` is `4C`.
- `status` is `user-acceptance-rehearsal-ready-open-t3` when all local rehearsal lanes are ready and the three T3 certification gaps remain open.
- `userAcceptanceRehearsalOnly=true`.
- `localUserAcceptancePassed=true`.
- `readyForHumanReview=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `finalGoalComplete=false`.
- `contentReturned=false`.
- `rehearsalCount=3`.
- `readyRehearsalCount=3`.
- `blockedRehearsalCount=0`.
- `evidenceFileCount>=9`.
- `rehearsalHash` is a SHA-256 hex string.

## Rehearsal Rows

Each row has:

- `id`, `persona`, `workflow`, `status`, `localReady`, `finalValueWaited`, `visualEvidenceReady`, `contentQualityReady`, `logicReady`, `teacherManagementReady`, `blockedByT3`, `executionAllowed`, `finalGoalComplete`, `evidenceIds`, and `notes`.

Required rows:

- `student-learning-rehearsal`
- `teacher-management-rehearsal`
- `research-delivery-rehearsal`

## Guardrails

- No artifact/evidence/screenshot bodies are returned.
- No approval text content is returned.
- No secrets, key-shaped tokens, provider responses, database connection strings, or external execution results are returned.
- No review command, provider call, managed database connection, deployment, billing action, approval recording, certification execution, certification state change, production release, or final-completion claim is performed.

## Acceptance Criteria

`npm run qa:user-acceptance-rehearsal` must prove:

1. JSON and Markdown artifacts are generated.
2. The endpoint and report export expose the contract fields.
3. Exactly three local rehearsal rows are ready.
4. The rows include student, teacher, and research/delivery workflows.
5. Three T3 certification gaps remain open.
6. `finalGoalComplete=false` and `readyForProductionRelease=false`.
7. No content bodies, secret-shaped values, approval content, provider responses, managed database strings, or T3 execution markers are exposed.
