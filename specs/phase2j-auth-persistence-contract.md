# Phase 2J - Auth Persistence And Audit Contract

## Goal

Move CodeX from role-only demo sessions toward a production-shaped local auth foundation while keeping the prototype dependency-free and secret-safe.

This phase does not wire a real OAuth/SSO provider or production database. It defines and implements durable local user records, password digests for seeded demo identities, session expiry/revocation, role permissions, audit events, and corrupt JSON recovery.

## Data Model

`data/mock-db.json` is treated as a recoverable local persistence file.

Required top-level fields:

- `users[]`: durable user directory with `{ id, name, role, status, auth, permissions }`.
- `sessions[]`: issued sessions with `{ tokenHash, userId, role, createdAt, expiresAt, revokedAt? }`.
- `authEvents[]`: append-only auth audit records.
- `dbMeta.schemaVersion >= 4`.
- `dbMeta.recoveredFromCorruptJson` is set when the server has to reseed a malformed JSON file.

Plain provider secrets and raw API keys are never written. Session records store token hashes, not raw tokens.

## API Contract

### `POST /api/auth/login`

Supported body:

```json
{
  "userId": "student-linyi",
  "password": "demo-student",
  "role": "student"
}
```

Compatibility body:

```json
{ "role": "student" }
```

Response:

```json
{
  "sessionToken": "opaque-token-returned-once",
  "user": { "id": "student-linyi", "role": "student", "permissions": ["submit_work"] },
  "expiresInMinutes": 120,
  "session": { "tokenHash": "sha256:...", "expiresAt": "...", "revoked": false },
  "assurance": "password" 
}
```

Invalid credentials return `401`.

### `GET /api/auth/session`

Requires `X-CodeX-Session`. Returns the active user/session/permissions. Expired or revoked sessions return `401`.

### `POST /api/auth/logout`

Requires `X-CodeX-Session`. Revokes the current session and appends an audit event.

### `GET /api/auth/audit`

Research/QA endpoint for local prototype evidence. Returns recent auth events and totals by event type.

### `POST /api/dev/reset`

Resets to schema version 4, seeded users, empty sessions, and auth audit baseline.

### `POST /api/reports/export`

Adds:

- `userCount`
- `activeSessionCount`
- `revokedSessionCount`
- `authEventCount`
- `authFailureCount`

## Acceptance Criteria

- Seed DB contains student, teacher, and researcher user records with permissions.
- Password login succeeds for seeded credentials and returns a raw session token only in the response.
- Invalid password returns `401` and writes a failure audit event.
- `GET /api/auth/session` proves active session state and role permissions.
- `POST /api/auth/logout` revokes a session; later session verification returns `401`.
- Role-gated mutations reject revoked/invalid sessions.
- Report export and auth audit expose counts without raw session tokens or provider secrets.
- Malformed `data/mock-db.json` can be recovered into schema version 4.
