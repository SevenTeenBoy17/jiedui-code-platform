# Phase 4B Certification Blocker Board Contract

Phase 4B adds a local-only certification blocker board after the Phase 4A final acceptance matrix. It makes the three remaining T3 gaps explicit as operator-facing blocker lanes, while preserving the rule that no certification execution, approval recording, deployment, managed database connection, provider call, billing action, or final-completion claim can happen without explicit human approval.

## Surfaces

- `GET /api/delivery/certification-blocker-board`
- `qa-artifacts/phase4b-certification-blocker-board.json`
- `qa-artifacts/phase4b-certification-blocker-board.md`
- Research-page panel with `data-certification-blocker-board`
- Report export fields prefixed with `certificationBlockerBoard`

## Required Response Fields

- `phase` is `4B`.
- `status` is `certification-blocker-board-ready-open-t3` when all three blocker lanes are locally prepared and still open.
- `blockerBoardOnly=true`.
- `localBoardPassed=true`.
- `readyForProductionRelease=false`.
- `blockedByT3=true`.
- `openT3GapCount=3`.
- `finalGoalComplete=false`.
- `contentReturned=false`.
- `blockerCount=3`, `readyBlockerCount=3`, `closedBlockerCount=0`.
- `laneTrackCount=3`, `nextActionCount=3`, `evidenceFileCount>=9`, and `boardHash` are present.

## Blocker Lanes

Each blocker row must include:

- `id`: one of `container-runtime-certification`, `managed-database-certification`, `external-provider-certification`.
- `riskTier="T3"` and `status="open"`.
- `approvalRequired=true`, `singleLaneOnly=true`, `cannotAutoRun=true`.
- Local readiness flags: `packetReady`, `verifierReady`, `templateReady`, `checklistReady`, `stateFlagsSafe`.
- All execution/change flags remain false: `approved`, `approvalRecorded`, `executionAllowed`, `externalActionsExecuted`, `certificationStateChanged`, `finalGoalComplete`.

## Guardrails

The response and artifacts must not include artifact bodies, evidence bodies, screenshot bytes, approval text content, secret values, provider responses, database connection strings, or executable external commands. Hashes, ids, counts, and local metadata are allowed.

## Verification

`npm run qa:certification-blocker-board` must prove:

- Offline JSON/Markdown artifacts are generated.
- The endpoint and report fields expose the board.
- Exactly three blockers remain open and locally ready.
- No blocker is closed, approved, executable, or final-complete.
- No key-shaped token or direct secret assignment appears in the artifact, endpoint, or report.
- Existing Phase 4A local acceptance remains true while production release remains blocked.
