# Phase 2V Managed Database Certification Readiness Contract

## Goal

Create a local, repeatable managed-database certification-readiness bundle that
summarizes current repository, SQL adapter, migration, transaction, rollback,
backup, restart-persistence, report, and secret-safety evidence before any
managed external database is provisioned or certified.

## Non-Goals

- No managed Postgres/Supabase provisioning, database URL use, credential write,
  cloud connection, destructive migration, production schema change, or billing
  action.
- No claim that a managed external database is certified.
- No storage or echo of database passwords, URLs, or service-role keys.

## Database Readiness Contract

The server must expose `GET /api/db/certification` returning:

- `certified: false`
- `status: "readiness-only"`
- `currentEngine`
- `localControls[]` with evidence for repository boundary, atomic writes,
  SQL adapter availability, migration evidence, transaction evidence, rollback
  support, backup evidence, restart-persistence QA, report fields, and secret
  non-exposure
- `missingCertificationControls[]` for managed database provisioning, secret
  manager integration, TLS/SSL enforcement, connection pooling, migration
  rollback drill on managed DB, backup/restore drill, PITR/retention policy,
  row-level access policy, load/concurrency test, monitoring/alerting, and
  incident rollback runbook
- `nextCertificationStep`

Report export must include DB certification readiness fields so the
research/admin path can audit data-layer readiness without connecting to a
managed database.

## Acceptance Criteria

- Focused QA proves `/api/db/certification` exists and clearly reports
  `certified=false`.
- Focused QA proves local controls using JSON status, SQLite migration,
  transaction, rollback, backup, report, restart persistence, and no-secret
  evidence.
- Completion audit adds a local `database-certification-readiness` proved row
  while keeping the managed-database-certification gap open.
- Existing fullstack, database adapter, provider, sandbox, agentic, smoke,
  static, visual, auth, graph, and secret-scan gates remain green.
