# Phase 2L Model Provider Adapter Contract

## Goal

Add a secret-safe model provider adapter surface for the CodeX AI routes, so the current primary/fallback/image routing can be audited like a real API integration without committing or echoing provider credentials.

## Scope

- Keep the existing deterministic local tutor and image-brief behavior.
- Add provider status and probe endpoints that expose readiness, request shape, and model separation.
- Do not store, print, persist, or return any API key.
- Do not send student code or prompts to an external provider by default.
- Use environment-gated readiness only: `CODEX_MODEL_API_KEY` plus `CODEX_ENABLE_LIVE_MODEL=1`.

## Provider Modes

- `local-simulated`: no provider key detected; deterministic local behavior.
- `configured-disabled`: a provider key exists in environment, but live mode is not enabled.
- `live-ready`: a provider key exists and live mode is explicitly enabled.

`live-ready` means the adapter is allowed by configuration; Phase 2L still performs no outbound provider call.

## API Contract

### `GET /api/ai/provider/status`

Returns:

- `provider`: `"codex-model-gateway"`
- `mode`
- `configured`
- `liveEnabled`
- `secretSafe: true`
- `keySource`: `"environment"` or `null`
- `coding: { primaryModel, fallbackModel, fallbackAfterMs }`
- `image: { model, separatedFromCoding: true }`
- `transport: { dryRunOnly, outboundCalls }`

### `POST /api/ai/provider/probe`

Request:

```json
{
  "taskType": "coding|image",
  "simulatePrimaryLatencyMs": 1250,
  "prompt": "short prompt"
}
```

Returns:

- `providerStatus`
- `modelRoute`
- `providerRequest`: sanitized model/path/body-shape metadata only
- `secretEcho: false`

## Integration Rules

- `POST /api/ai/tutor/message` attaches `providerAdapter` evidence to coding replies.
- `POST /api/ai/image/brief` attaches `providerAdapter` evidence to image replies and must remain on `gpt-image-2`.
- `GET /api/ai/route-audit` includes current provider status and provider-evidence counts.
- `POST /api/reports/export` includes provider mode/configuration and probe counts without secrets.

## Acceptance Criteria

- Provider status proves no API key is returned.
- Coding probe selects `claude-sonnet-4-6` normally and `gpt-5.3-codex-spark` when simulated primary latency exceeds 1000ms.
- Image probe selects `gpt-image-2` and does not use coding fallback.
- Tutor/image routes include sanitized provider adapter evidence.
- Research UI displays provider mode/readiness.
- Existing smoke, API, static, recovery, and click QA remain green.
