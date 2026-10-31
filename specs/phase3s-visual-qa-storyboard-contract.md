# Phase 3S Visual QA Storyboard Contract

## Goal

Turn the existing three-round agentic QA screenshots and role-flow evidence into a delivery-ready visual storyboard for student, teacher, research, login, and mobile review.

## API Contract

- `GET /api/delivery/visual-storyboard`
  - Returns visual QA storyboard metadata derived from `qa-artifacts/phase2o-agentic-click-qa.json` and screenshot files.
  - Status: `visual-storyboard-ready-open-t3`.
  - Returns screenshot paths, dimensions where available, file sizes, SHA-256 hashes, role labels, and QA narrative captions.

## Acceptance Criteria

- The storyboard covers at least five surfaces: login, student, teacher, research, and mobile.
- Every screenshot frame has an existing local file, positive byte size, and SHA-256 hash.
- The storyboard summarizes three replay rounds and role-specific evidence for student, teacher, research, and mobile QA.
- The research UI displays visual storyboard cards using local screenshot paths.
- Report export, smoke QA, three-round QA, agentic audit, completion audit, handoff dossier, and artifact index track Phase 3S.
- The storyboard keeps the three open T3 gaps and `finalGoalComplete=false`.

## Guardrails

- No external provider calls.
- No managed database connections.
- No deployments.
- No billing actions.
- No approval recording.
- No certification execution.
- No screenshot bytes embedded in JSON, Markdown, or report payloads.
- No secrets, API keys, provider responses, database URLs, or artifact body content returned.
