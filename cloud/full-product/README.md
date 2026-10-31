# Original product cloud candidate (F1)

This directory deploys the **existing `web/src` Vue application**, not the separate
`cloud/pilot/public` technical workbench. It is a migration candidate, not a full
product release. The local FastAPI/SQLite application and `web/dist` are retained.

## Current boundary

- Original login, student/teacher route definitions, layout and assets are built.
- Invited email/password authentication uses the existing Netlify BFF and HttpOnly
  session cookie. Selecting a teacher tab does not grant teacher permissions.
- Personal projects use the existing Supabase ownership, optimistic versions and
  idempotent requests. Unknown save results preserve drafts; no mock login or fake
  success fallback is enabled in the cloud adapter.
- Classes/tasks, trusted AI, task evidence, teacher review, assessments, portraits
  and a secure C/C++ executor are **not migrated by F1**. The candidate banner
  explicitly says this. A teacher page HTTP 200 is only an SPA entry check.

## Build and publish discipline

1. Run the web type, copy and style checks and Node tests, including
   `cloud/full-product/tests/*.test.mjs`.
2. From the repository root, run `node cloud/full-product/build.mjs`.
3. Read `.runtime/full-product-f1-20261014/latest-build.json`. The build creates a
   new immutable timestamped output, checks asset paths and Python runtime files,
   and records the content hash. It never writes `web/dist`.
4. Copy that exact output into a **new** `.netlify/candidates/<build timestamp>`
   below this directory. Do not reuse or overwrite an earlier candidate folder.
5. From this directory deploy with the authenticated Netlify CLI, explicit
   `--dir <new staging path>`, `--functions netlify/functions`, the existing site
   ID `d37a66a1-4411-4579-9c23-b4ac3aac7de7`, and `--no-build --json`.
   **Do not use `--prod`. Do not use the default publish directory:** it may
   contain an earlier candidate. The CLI's `--context` conflicts with `--no-build`.
6. Verify the returned immutable deploy URL against `release.json` and the local
   hash; then run real API and browser acceptance against that same URL.

`netlify/functions/api.mts` reuses the existing pilot backend, not its frontend.
Server environment variables stay in Netlify; no credentials are bundled into
the Vue build. `.runtime` credentials, local databases and backups are excluded.

## Acceptance helper

`node cloud/full-product/live-smoke.mjs <immutable candidate URL>` uses the
existing private synthetic student credential, creates **one clearly labelled
acceptance project**, tests save/readback/idempotency/conflict and revokes its own
session. Run only in this authorised test workflow. It leaves the synthetic
project as evidence and does not delete or reseed other projects. Its report is
HTTP/API evidence, not browser, teacher, AI, classroom or complete concurrency
acceptance. Preserve earlier reports before rerunning.

## Release gates

The corrective plan in `docs/deployment/2026-10-14-完整产品上线纠偏方案.md` remains
authoritative: finish F1's pending real role/draft/concurrency checks, then F2–F5,
then F6 full same-version acceptance. Do not promote a working login and editor
into a claim that the whole student/teacher product is online.
