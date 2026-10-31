# Phase 2S Delivery Completion Audit Contract

## Goal

Create an automated delivery completion audit that maps the original objective
to current evidence, identifies proved requirements, and refuses to mark the
whole product complete while required external/T3 certifications remain open.

## Non-Goals

- No real external provider call, managed database provisioning, production
  sandbox deployment, billing action, secret use, or public release.
- No claim that the full objective is complete unless every explicit
  requirement has current authoritative evidence.

## Requirements To Audit

- Model routing: `claude-sonnet-4-6` primary, `gpt-5.3-codex-spark` fallback
  after 1000 ms, `gpt-image-2` image path separated from coding routes.
- Secret safety: no user-provided API key is stored, echoed, committed, or sent
  to an external service.
- Full-stack learning workflows: student, teacher, research/export, auth,
  persistence, collaboration, sandbox, AI tutor, and report paths.
- Visual fidelity: 3D glass/cartoon style assets, responsive UI, screenshot
  evidence, and visual QA.
- Internal QA: at least three student/teacher/research rounds that wait for
  terminal/final values.
- Backend hardening: sandbox isolation, SQL adapter/migrations/rollback,
  provider guard/transport boundary, no raw secrets.
- Release blockers: certified container/VM/browser-WASM runtime, managed
  database certification, and external provider certification.

## Output Contract

- `qa-artifacts/phase2s-completion-audit.json`
- `qa-artifacts/phase2s-completion-audit.md`

The JSON must include:

- `requirements[]` with `id`, `status`, `evidence`, and `files`.
- `openCertificationGaps[]`.
- `finalGoalComplete: false` unless all requirements are proved and no gaps
  remain.
- `verdict: PASS_WITH_OPEN_CERTIFICATION_GAPS` when all local evidence gates
  pass but external/T3 certifications remain.

## Acceptance Criteria

- The audit exits non-zero if any locally provable required evidence is missing.
- The audit exits zero while clearly keeping the final goal incomplete when only
  external/T3 certification gaps remain.
- Existing full regression, agentic, visual, provider, sandbox, database, graph,
  and secret-scan gates remain green.
