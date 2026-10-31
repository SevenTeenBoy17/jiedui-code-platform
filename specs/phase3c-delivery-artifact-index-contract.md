# Phase 3C Delivery Artifact Index Contract

Create a local artifact index and integrity manifest for the current delivery package. This phase is metadata-only: it must not return artifact contents, call external providers, connect to a managed database, deploy, publish, bill, use secret values, approve T3 work, or claim final completion.

## API

`GET /api/delivery/artifacts`

Response `data` includes:

- `status`: `artifact-index-ready-with-open-certification-gaps` or `artifact-index-incomplete`
- `finalGoalComplete`: false
- `localEvidencePassed`
- `openCertificationGapCount`
- `artifactCount`
- `readyArtifactCount`
- `missingArtifactCount`
- `hashCount`
- `contentReturned`: false
- `artifactInventory`
- `requiredArtifacts`
- `guardrails`

Each artifact inventory row includes:

- `id`
- `path`
- `category`
- `required`
- `exists`
- `sizeBytes`
- `sha256` when the artifact exists

## Report Export

`POST /api/reports/export` includes:

- `deliveryArtifactIndexStatus`
- `deliveryArtifactIndexArtifactCount`
- `deliveryArtifactIndexReadyArtifactCount`
- `deliveryArtifactIndexMissingArtifactCount`
- `deliveryArtifactIndexHashCount`
- `deliveryArtifactIndexContentReturned`
- `deliveryArtifactIndexFinalGoalComplete`

## Research UI

The research page shows a delivery artifact index panel with:

- `data-delivery-artifacts`
- index status
- artifact count
- hash count
- missing artifact count
- content-returned marker

## Acceptance Criteria

- The index lists current handoff, completion, agentic, QA, and contract artifacts.
- Existing artifacts include size and SHA-256 hash metadata.
- The index never returns file contents.
- The index keeps `finalGoalComplete=false` while T3 certification gaps remain open.
- The index exposes no key-shaped token or environment-secret values.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, Python syntax, graph, and secret scans remain green.
