# Phase 2O Agentic QA Audit Contract

## Goal

Add a repeatable internal audit harness that behaves like bounded QA agents reviewing the current CodeX / AI Xiaohaigui prototype after the staged development work. The harness must prove the existing student, teacher, and research workflows wait for terminal values before passing, then produce a machine-readable issue list and a human-readable audit summary.

## Scope

- Run at least three end-to-end simulated rounds through the existing Edge/CDP click QA.
- Treat the personas as internal QA agents:
  - student-flow-agent
  - teacher-review-agent
  - research-export-agent
  - model-security-agent
- Verify each round waits for terminal sandbox job evidence, submitted work, persisted teacher review, route audit evidence, research export JSON, and no browser console/runtime errors.
- Verify model routing requirements from the current source:
  - primary coding model: `claude-sonnet-4-6`
  - fallback coding model: `gpt-5.3-codex-spark`
  - fallback threshold: `1000ms`
  - image model: `gpt-image-2`
  - image route separated from coding route
- Verify no key-shaped provider secret is present in workspace source artifacts checked by the harness.
- Write:
  - `qa-artifacts/phase2o-agentic-audit.json`
  - `qa-artifacts/phase2o-agentic-audit.md`

## Non-Goals

- No outbound provider/model/image calls.
- No real API key usage, storage, echo, or logging.
- No production deployment.
- No claim that the entire long-running product objective is complete.

## Acceptance Criteria

1. `npm run qa:agentic` runs three complete student/teacher/research rounds.
2. Every round proves terminal sandbox output, model route evidence, submission, teacher review, research export, and visual fidelity markers.
3. The audit report contains a completion matrix and issue list.
4. Blocking QA failures cause a non-zero exit.
5. Known product gaps remain visible as open non-blocking issues.
6. Existing smoke/static/API/click QA remains compatible.
