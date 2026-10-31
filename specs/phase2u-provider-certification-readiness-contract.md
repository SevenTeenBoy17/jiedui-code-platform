# Phase 2U External Provider Certification Readiness Contract

## Goal

Create a local, repeatable external model-provider certification-readiness
bundle that summarizes current routing, redaction, guardrail, localhost mock
transport, and audit evidence before any real external provider call is allowed.

## Non-Goals

- No real provider call, real API key use, managed secret-store write, billing
  action, public release, or production deployment.
- No claim that external provider execution is certified.
- No storage or echo of user-provided API keys.

## Provider Readiness Contract

The server must expose `GET /api/ai/provider/certification` returning:

- `certified: false`
- `status: "readiness-only"`
- `provider: "codex-model-gateway"`
- `localControls[]` with evidence for model routing, image-route separation,
  live-call guard block, payload redaction, route audit, localhost mock
  transport, secret non-echo, and report export fields
- `missingCertificationControls[]` for approved real-provider call, secret
  manager integration, budget/cost cap, rate limiting, privacy/DPA review,
  production audit retention, rollback switch, response sampling review, and
  incident drill
- `nextCertificationStep`

Report export must include provider certification readiness fields so the
research/admin path can audit model readiness without making external calls.

## Acceptance Criteria

- Focused QA proves `/api/ai/provider/certification` exists and clearly reports
  `certified=false`.
- Focused QA proves local controls with blocked live-call evidence, redacted
  fake secret evidence, and guarded localhost mock transport for coding and
  image routes.
- Completion audit adds a local `provider-certification-readiness` proved row
  while keeping the external-provider-certification gap open.
- Existing fullstack, provider transport, sandbox, agentic, smoke, static,
  visual, database, auth, graph, and secret-scan gates remain green.
