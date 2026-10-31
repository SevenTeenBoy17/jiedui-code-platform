# Phase 3W T3 Run Packet Verifier Contract

## Scope

Create a local-only verifier for exactly one Phase 3V T3 single-lane run packet.

This phase validates packet metadata before any future approved T3 execution. It does not approve, execute, certify, deploy, bill, call providers, connect managed databases, return body content, or claim final completion.

## API Contract

`GET /api/delivery/t3-run-packet-verifier`

Returns verifier readiness over the current Phase 3V packet bundle.

`POST /api/delivery/t3-run-packet-verifier`

Accepts one candidate packet metadata object and validates:

- `packetId` and `laneId` match exactly one current packet.
- `runPacketBundleHash` matches the current bundle hash.
- `packetHash` matches the selected packet hash.
- source hashes, evidence IDs, rollback IDs, and single-lane flags match.
- state flags remain blocked: approval, execution, external actions, certification state change, and final completion are false.
- no approval text content, body content, secret-like value, API key, or database URL field is included.

Response data:

- `phase`: `3W`
- `status`: one of `t3-run-packet-verifier-ready-execution-blocked`, `t3-run-packet-verified-execution-blocked`, or `t3-run-packet-rejected-execution-blocked`
- `verifierOnly`: `true`
- `verificationPassed`: `true` only for exactly one valid packet
- `approved`: `false`
- `executionAllowed`: `false`
- `certificationStateChanged`: `false`
- `finalGoalComplete`: `false`

## Acceptance Criteria

- Generates `qa-artifacts/phase3w-t3-run-packet-verifier.json` and `.md`.
- Exposes Node and FastAPI mirror routes.
- Adds report export fields and research UI markers.
- Adds focused QA with valid, unknown-lane, multi-packet, secret-like, body-content, hash-mismatch, and state-claim rejection paths.
- Adds smoke, fullstack API, agentic audit, completion audit, handoff dossier, and artifact index wiring.
- Keeps all three T3 gaps open and all T3 execution blocked.
