# Phase 2K JSON Repository Contract

## Goal

Wrap the current `data/mock-db.json` persistence in a database-shaped repository boundary before introducing an external database.

## Scope

- Keep the current dependency-free Node server and existing JSON data contract.
- Replace direct database file writes with a repository that performs atomic temp-file writes and keeps a latest backup.
- Add runtime evidence endpoints for repository health and a guarded transaction probe.
- Do not introduce provider secrets, production database credentials, destructive migrations, or a new framework.

## Data Model

`db.dbMeta.repository` is the public repository metadata surface:

```json
{
  "engine": "json-repository-v1",
  "atomicWrites": true,
  "backupPath": "data/backups/mock-db.latest.json",
  "lastReadAt": "ISO-8601",
  "lastWriteAt": "ISO-8601",
  "lastBackupAt": "ISO-8601|null",
  "writeCount": 1,
  "lastReason": "api-save",
  "lastRecoveryReason": "malformed-json|null",
  "status": "ok|recovered"
}
```

## API Contract

### `GET /api/db/status`

Returns repository health without secrets or raw session tokens.

Response data fields:

- `engine`, `atomicWrites`, `schemaVersion`, `status`
- `writeCount`, `lastReadAt`, `lastWriteAt`, `lastBackupAt`, `lastReason`
- `backup: { path, exists, sizeBytes }`
- `counts: { users, activeSessions, revokedSessions, authEvents, runJobs }`
- `security: { rawSessionTokenStored }`

### `POST /api/db/transaction-probe`

Guarded by `X-CodeX-Dev-Reset: allow`.

Behavior:

- Appends one `db_transaction_probe` audit event.
- Saves through the repository transaction boundary.
- Returns the appended event, event count, and repository status.

Failure:

- Missing guard header returns `403`.

## Acceptance Criteria

- The server no longer performs bare database writes from `scripts/fullstack-server.mjs`.
- Repository saves use temp-file write plus rename.
- A latest valid backup is written under `data/backups/mock-db.latest.json`.
- `/api/db/status` reports `json-repository-v1`, `atomicWrites: true`, backup metadata, counts, and no raw session token persistence.
- `/api/db/transaction-probe` is guarded and produces durable `db_transaction_probe` evidence.
- Existing auth recovery still restores malformed JSON into schema v4.
- Existing API, static QA, click QA, and report export remain green.
