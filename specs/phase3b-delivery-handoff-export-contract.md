# Phase 3B Delivery Handoff Export Contract

Create local delivery handoff export artifacts that materialize the Phase 3A handoff dossier as bounded JSON and Markdown files. This phase is an offline export only: it must not start the app server, call external providers, connect to a managed database, deploy, publish, bill, use secret values, approve T3 work, or claim final completion.

## CLI / Script

`node scripts/export-delivery-handoff.mjs`

The script writes:

- `qa-artifacts/phase3b-delivery-handoff-dossier.json`
- `qa-artifacts/phase3b-delivery-handoff-dossier.md`

## JSON Artifact

The JSON artifact includes:

- `phase`: `3B`
- `status`: `handoff-ready-with-open-certification-gaps` or `needs-local-evidence`
- `finalGoalComplete`: false
- `localEvidencePassed`
- `openCertificationGapCount`
- `artifactCount`
- `artifactManifest`
- `artifactInventory`
- `handoffSummary`
- `openCertificationGaps`
- `nextActions`
- `guardrails`

## Markdown Artifact

The Markdown artifact includes:

- delivery status
- local evidence summary
- open certification gaps
- materialized artifact manifest
- guardrail summary
- next approved-action checklist

## Acceptance Criteria

- The export reads existing local evidence files and contract helpers only.
- The export keeps `finalGoalComplete=false` while T3 certification gaps remain open.
- The export writes both JSON and Markdown artifacts under `qa-artifacts/`.
- The artifacts include the three open T3 certification gaps.
- The artifacts expose no key-shaped token or environment-secret names.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, graph, and secret scans remain green.
