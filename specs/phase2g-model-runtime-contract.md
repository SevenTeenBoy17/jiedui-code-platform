# Phase 2G Model Runtime Contract

## Goal

Add a no-secret, auditable model-routing runtime for CodeX / AI Xiaohaigui.

- Coding tutor requests start on `claude-sonnet-4-6`.
- Coding tutor requests switch to `gpt-5.3-codex-spark` when primary loading is greater than `1000ms`.
- Image/visual asset requests use `gpt-image-2` and never enter the coding-model fallback path.

## API Contract

### `POST /api/ai/tutor/message`

Request additions:

- `simulatePrimaryLatencyMs?: number`
- `taskType?: "coding" | "image"`; tutor messages default to `coding`

Response additions:

- `modelRoute.path`: `coding`
- `modelRoute.primaryModel`
- `modelRoute.fallbackModel`
- `modelRoute.selectedModel`
- `modelRoute.fallbackUsed`
- `modelRoute.fallbackAfterMs`
- `modelRoute.observedPrimaryLatencyMs`
- `modelRoute.secretSafe`: always `true`
- `modelRoute.reason`: `primary-ready` or `primary-load-timeout`

### `POST /api/ai/image/brief`

Response:

- `modelRoute.path`: `image`
- `modelRoute.selectedModel`: `gpt-image-2`
- `modelRoute.fallbackUsed`: `false`
- `assetBrief`: safe UI art direction, not binary image data

### `GET /api/ai/route-audit`

Response:

- `routes`: recent model route records only; never raw secrets
- `totals`: total, fallback, image, and coding counts

## Acceptance Criteria

- API QA proves primary coding route, fallback route, and image route.
- API QA proves no response includes a `sk-` token shape.
- Research export includes model route counts.
- Student UI records the latest route after an AI hint.
- FastAPI skeleton mirrors the contract shape.
- Existing smoke, API, static QA, and click QA remain green.
