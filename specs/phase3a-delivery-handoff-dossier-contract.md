# Phase 3A Delivery Handoff Dossier Contract

Create a local delivery handoff dossier that consolidates the current verified local evidence, agentic QA state, T3 package state, T3 evidence intake state, and the remaining certification gaps. This phase must not approve T3 actions, call external providers, connect to a managed database, deploy, publish, bill, use secret values, or claim final completion.

## API

`GET /api/delivery/handoff-dossier`

Response `data` includes:

- `status`: `handoff-ready-with-open-certification-gaps` or `needs-local-evidence`
- `finalGoalComplete`: false
- `localEvidencePassed`
- `openCertificationGapCount`
- `artifactCount`
- `localRequirementCount`
- `agenticProvedCheckCount`
- `t3EvidenceCandidateCount`
- `sections`
- `artifactManifest`
- `openCertificationGaps`
- `nextActions`
- `guardrails`

## Report Export

`POST /api/reports/export` includes:

- `handoffDossierStatus`
- `handoffDossierFinalGoalComplete`
- `handoffDossierArtifactCount`
- `handoffDossierOpenGapCount`
- `handoffDossierLocalRequirementCount`
- `handoffDossierAgenticProvedCheckCount`
- `handoffDossierT3EvidenceCandidateCount`

## Research UI

The research page shows a delivery handoff dossier panel with:

- `data-delivery-dossier`
- dossier status
- local requirement count
- artifact count
- open T3 gap count
- final-goal-complete marker

## Acceptance Criteria

- The dossier consolidates completion audit, agentic QA, delivery overview, T3 package, and T3 evidence intake.
- The dossier keeps `finalGoalComplete=false` while T3 certification gaps remain open.
- The dossier exposes a bounded artifact manifest with no secret values.
- The report export includes dossier summary fields.
- The research UI exposes the dossier state.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, Python syntax, graph, and secret scans remain green.
