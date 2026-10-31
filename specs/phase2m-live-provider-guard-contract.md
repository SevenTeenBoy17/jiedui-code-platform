# Phase 2M Live Provider Guard Contract

## Goal

Add a live-call guardrail layer for future model provider calls without making any outbound call by default.

## Scope

- Keep deterministic local tutor/image behavior.
- Add a dry-run live-call plan endpoint that redacts secrets and student payloads.
- Add a live-call endpoint that refuses unless every guard is satisfied.
- Do not store, print, persist, return, or use the user-provided API key.
- Do not call a provider in normal QA.

## Risk Tier

Real provider calls are Tier 3 because they send data outside the workspace and use secrets. A live call is allowed only when all are true:

- `CODEX_MODEL_API_KEY` exists in the environment.
- `CODEX_ENABLE_LIVE_MODEL=1`.
- `CODEX_MODEL_BASE_URL` exists.
- Request header `X-CodeX-Live-Model: allow`.

If any guard is missing, the endpoint returns a safe rejection and zero outbound calls.

## API Contract

### `POST /api/ai/provider/live-plan`

Returns a dry-run plan:

- `guard`: risk tier, allowed flag, blocking reasons, rollback hint.
- `modelRoute`: selected model evidence.
- `providerRequest`: sanitized request metadata.
- `redactedPayload`: recursively redacted payload preview.
- `timeoutMs`, `retryPolicy`, `auditSample`
- `outboundCall: false`
- `secretEcho: false`

### `POST /api/ai/provider/live-call`

Returns:

- `409` with `ok=false` when guards are not satisfied.
- `501` with `ok=false` when guards are satisfied but the real provider transport is intentionally not implemented in this prototype.

Phase 2M does not perform a network call in either branch.

## Redaction Rules

- Key-shaped strings such as `sk-...` become `[REDACTED_SECRET]`.
- Fields named `apiKey`, `token`, `authorization`, `password`, or `secret` become `[REDACTED_FIELD]`.
- Large text fields are summarized by byte counts and previews capped to 120 characters.

## Acceptance Criteria

- `live-plan` redacts key-shaped values and sensitive fields.
- `live-plan` chooses `claude-sonnet-4-6`, `gpt-5.3-codex-spark`, or `gpt-image-2` by the existing route rules.
- `live-call` returns `409` without env/header guards and reports no outbound calls.
- Provider status/report include live guard counts.
- Existing smoke, API, recovery, static, and click QA remain green.
