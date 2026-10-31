# Phase 2R SQL Database Adapter Contract

## Goal

Add a real, runnable SQL repository adapter so CodeX can prove database
selection, migration, transactional save, rollback, backup/status evidence, and
full API compatibility before connecting to a managed external database.

## Non-Goals

- No production database connection, cloud database provisioning, schema delete,
  destructive migration, or credential storage in this phase.
- No rewrite of all domain data into fully normalized tables. The SQL adapter
  stores the current app document in a transactional SQL boundary first, then a
  later phase can normalize domain tables safely.

## Runtime Contract

Default remains JSON:

- `CODEX_DB_ENGINE` unset -> `json-repository-v1`.

SQL mode:

- `CODEX_DB_ENGINE=sqlite` -> `sqlite-repository-v1`.
- `CODEX_SQLITE_DB_PATH` can point to a test or local database file.
- The adapter applies migrations idempotently.
- The adapter stores the app document transactionally.
- The adapter exposes rollback probe evidence without mutating app data.
- The adapter writes backup/status metadata without exposing secrets.

## API Contract

- `GET /api/db/status` includes:
  - `engine`
  - `adapter`
  - `migrationsApplied`
  - `transactionalWrites`
  - `rollbackSupported`
  - `externalReady`
- `POST /api/db/rollback-probe` is guarded by
  `X-CodeX-Dev-Reset: allow`; when supported it proves a write can be rolled
  back and leaves no marker row behind.
- `POST /api/reports/export` includes SQL adapter status fields.

## Acceptance Criteria

- Default JSON mode remains green in existing regression tests.
- SQLite mode runs the full core API workflow through a temporary SQLite file.
- SQLite mode proves migrations and rollback-probe success.
- SQLite mode proves report export database adapter fields.
- No DB URL, password, API key, or secret-like value is written to source,
  report output, or QA artifacts.
- Existing sandbox, provider, agentic, visual, auth recovery, static QA, graph,
  and secret scans remain green.
