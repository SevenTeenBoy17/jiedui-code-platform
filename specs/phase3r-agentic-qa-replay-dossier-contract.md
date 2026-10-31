# Phase 3R Agentic QA Replay Dossier Contract

## Goal

Package the existing three-round agentic internal QA evidence into a delivery-ready replay dossier without rerunning or modifying external systems.

## API Contract

- `GET /api/delivery/agentic-qa-replay`
  - Returns a metadata-only replay dossier derived from `qa-artifacts/phase2o-agentic-audit.json` and `qa-artifacts/phase2o-agentic-click-qa.json`.
  - Status: `agentic-qa-replay-ready-open-t3`.

## Acceptance Criteria

- The replay dossier confirms at least three browser QA rounds.
- The replay dossier lists the four internal QA agents: student-flow, teacher-review, research-export, and model-security.
- The replay dossier summarizes final-value waits for student run, teacher review, research export, WebSocket status, sandbox terminal output, model route evidence, and visual fidelity.
- The replay dossier hashes screenshot/report artifacts without returning image bytes or artifact body content.
- The replay dossier preserves the three open T3 product gaps and keeps `finalGoalComplete=false`.
- Report export, research UI, smoke QA, three-round QA, agentic audit, completion audit, handoff dossier, and artifact index track Phase 3R.

## Guardrails

- No external provider calls.
- No managed database connections.
- No deployments.
- No billing actions.
- No approval recording.
- No certification execution.
- No screenshot bytes, report body content, secrets, or API keys returned.
