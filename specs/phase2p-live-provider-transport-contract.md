# Phase 2P Live Provider Transport Contract

## Goal

Implement a guarded provider transport boundary for `/api/ai/provider/live-call`
so the app can prove the live-call path against a localhost mock provider without
using, writing, echoing, or sending any real API key.

## Non-Goals

- No real external model, image, billing, or production provider call in this
  phase.
- No provider API key stored in repository files, snapshots, route audit output,
  reports, or QA artifacts.
- No UI rebuild; existing provider readiness UI remains source-compatible.

## API Contract

### POST `/api/ai/provider/live-call`

Default behavior remains blocked:

```json
{
  "ok": false,
  "data": {
    "error": "Live provider call blocked by guardrails",
    "plan": {
      "guard": { "allowed": false, "riskTier": "T3-external-model-call" },
      "outboundCall": false,
      "secretEcho": false
    }
  }
}
```

The transport may run only when all guard conditions are true:

- `CODEX_MODEL_API_KEY` exists in the process environment.
- `CODEX_ENABLE_LIVE_MODEL=1`.
- `CODEX_MODEL_BASE_URL` exists and points to loopback
  (`127.0.0.1`, `localhost`, or `::1`) unless an explicitly approved future
  external phase adds a separate override.
- Request header `X-CodeX-Live-Model: allow` is present.

Allowed localhost response shape:

```json
{
  "ok": true,
  "data": {
    "plan": { "outboundCall": false, "secretEcho": false },
    "liveTransport": {
      "outboundCall": true,
      "ok": true,
      "providerStatusCode": 200,
      "providerPath": "/v1/responses",
      "selectedModel": "claude-sonnet-4-6",
      "secretEcho": false,
      "attemptCount": 1,
      "responseSummary": {}
    }
  }
}
```

## Acceptance Criteria

- Default live-call still returns 409 with `outboundCall=false`.
- A localhost mock provider receives coding calls on `/v1/responses` and image
  calls on `/v1/images` when all guards are satisfied.
- The runtime authorization secret is never returned by live-call, route audit,
  report export, or persisted `aiMessages`.
- Provider responses are redacted/summarized before storage or API return.
- Report export counts successful provider outbound calls.
- Existing fullstack, smoke, static QA, visual QA, auth recovery, and agentic QA
  remain green.
