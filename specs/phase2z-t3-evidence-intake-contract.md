# Phase 2Z T3 Evidence Intake Contract

Create a local evidence-intake surface for future approved T3 certification artifacts. This phase must not approve a certification lane, mark any lane certified, use secret values, call external providers, connect to a managed database, deploy, publish, or bill anything.

## API

`GET /api/delivery/t3-evidence`

Returns a safe summary:

- `status`: `candidate-only`
- `finalGoalComplete`: false
- `certificationStateChanged`: false
- `candidateCount`
- `acceptedCandidateCount`
- `laneCounts`
- `guardrails`: no secret values, no external calls, no managed DB connections, no deployments

`POST /api/delivery/t3-evidence/intake`

Requires `X-CodeX-Dev-Reset: allow` because it writes local candidate evidence. Request body:

- `lane`: runtime / database / provider
- `approvalRef`: human-readable approval reference
- `operator`: human-readable operator label
- `evidenceItems`: array of `{ "type", "summary", "artifactRef" }`
- `rollbackResult`: passed / failed / not-run
- `reviewGate`: passed / failed / pending

Response:

- `status`: `accepted-candidate` or `rejected-candidate`
- `stored`: boolean
- `candidate`: sanitized candidate when stored
- `summary`: updated summary
- `certificationStateChanged`: false

## Safety Rules

- Reject payloads containing key-shaped tokens, provider API key env names, database URL env names, or URL-shaped credential strings.
- Return only redaction labels, never the raw matched secret-like value.
- Store candidate evidence only when the payload is structurally valid and secret-safe.
- Candidate evidence is not certification evidence until a future approved T3 review gate explicitly accepts it.

## Report Export

`POST /api/reports/export` includes:

- `t3EvidenceStatus`
- `t3EvidenceCandidateCount`
- `t3EvidenceAcceptedCandidateCount`
- `t3EvidenceCertificationStateChanged`

## Research UI

The research page shows a T3 evidence intake panel with:

- `data-t3-evidence`
- candidate count
- accepted candidate count
- certification-state-changed marker

## Acceptance Criteria

- Guarded POST without `X-CodeX-Dev-Reset: allow` returns forbidden.
- Clean candidate evidence is stored as candidate-only.
- Secret-like candidate evidence is rejected and not stored.
- Endpoint, report, and UI keep `finalGoalComplete=false` and `certificationStateChanged=false`.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, Python syntax, graph, and secret scans remain green.
