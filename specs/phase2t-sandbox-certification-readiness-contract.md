# Phase 2T Sandbox Runtime Certification Readiness Contract

## Goal

Create a local, repeatable sandbox runtime certification-readiness bundle that
summarizes current isolation controls, escape-regression evidence, and the exact
remaining work required before a production container, VM, or browser-WASM
runtime can be certified.

## Non-Goals

- No production deployment, container provisioning, VM creation, browser-WASM
  service integration, billing action, or external secret use.
- No claim that the sandbox runtime is certified.
- No execution of arbitrary untrusted host code outside the existing no-exec
  educational runner boundary.

## Runtime Readiness Contract

The server must expose `GET /api/sandbox/certification` returning:

- `certified: false`
- `status: "readiness-only"`
- `runner.engine`, `runner.isolation`, `runner.envPolicy`
- `localControls[]` with evidence for scrubbed environment, ephemeral
  workspace, no-shell process boundary, network-disabled policy, output limit,
  timeout, secret exclusion, and escape-regression coverage
- `missingCertificationControls[]` for CPU/memory quotas, kernel/container/VM or
  browser-WASM isolation proof, filesystem mount policy, network namespace
  enforcement, syscall/native escape tests, concurrency limits, audit retention,
  and rollback/recovery drill
- `nextCertificationStep`

Report export must include sandbox certification readiness fields so the
research/admin path can audit readiness without calling a production runtime.

## Acceptance Criteria

- Focused QA proves `/api/sandbox/certification` exists and clearly reports
  `certified=false`.
- Focused QA proves the readiness controls are backed by real safe-run,
  env/path/network escape, and report-count evidence.
- Completion audit adds a local `sandbox-certification-readiness` proved row
  while keeping the external certification gap open.
- Existing fullstack, sandbox isolation, agentic, smoke, static, visual,
  database, provider, auth, graph, and secret-scan gates remain green.
