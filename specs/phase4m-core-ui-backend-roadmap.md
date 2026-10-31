# Phase 4M Core Function UI Upgrade and Backend Roadmap

Recorded: 2026-06-21 22:09 PDT

## Scope Completed in This Phase

This phase is frontend-only. The visible platform interface now centers the four requested core modules:

- Pair programming collaboration zone: Driver / Observer role display, role-flow status, and existing role-switch controls.
- Agent conversation window: guided LLM-style programming Q&A panel with help counts and hint type.
- Computational thinking process record: visual path for task decomposition, running, AI help, role rotation, and reflection.
- Teacher management backend: class management, task assignment, learning data, and backend roadmap cards in the teacher view.

No live backend, external LLM provider, production database, deployment, or certification state change was performed in this phase.

## Backend Work Still Pending

### 1. Pair Programming Collaboration

Planned contracts:

- `GET /api/collab/rooms/:roomId` returns room, participants, current driver, observer, turn deadline, and replay count.
- `POST /api/collab/rooms/:roomId/join` joins a student or AI observer to the room.
- `POST /api/collab/rooms/:roomId/rotate-role` rotates Driver / Observer and writes a timeline event.
- WebSocket channel `collab.room.{roomId}` broadcasts cursor, presence, code patch metadata, and role changes.

Data model:

- `collab_rooms`
- `collab_participants`
- `collab_turns`
- `collab_events`

Verification path:

- Unit test role rotation.
- Integration test two participants joining and receiving presence updates.
- Browser test that the UI updates without a full refresh.

### 2. Intelligent Agent Conversation

Planned contracts:

- `POST /api/ai/chat` accepts task context, code snapshot metadata, student question, and pedagogical guardrails.
- `GET /api/ai/chat/:sessionId/events` returns message timeline, hint type, safety tags, and help count.
- `POST /api/ai/chat/:sessionId/feedback` records whether the hint helped.

Guardrails:

- Do not return complete solutions when the assignment asks for student construction.
- Store prompt metadata and safety tags, not secrets.
- Rate-limit student chat requests by class, student, and assignment.

Verification path:

- Contract tests for request and response shape.
- Safety tests for direct-answer refusal.
- UI smoke test for message append and help-count increment.

### 3. Computational Thinking Process Record

Planned contracts:

- `POST /api/learning/events` records editor actions, runs, saves, AI help, role switches, submissions, and reflections.
- `GET /api/learning/students/:studentId/process?assignmentId=...` returns the process path rendered by the frontend trace panel.
- `GET /api/learning/classes/:classId/summary` aggregates behavior count, help count, progress, and intervention flags.

Event schema:

- `eventId`
- `studentId`
- `classId`
- `assignmentId`
- `type`
- `timestamp`
- `source`
- `metadata`

Verification path:

- Schema validation at the API boundary.
- Replay test from raw events to process path.
- Teacher dashboard aggregation test.

### 4. Teacher Management Backend

Planned contracts:

- `GET /api/teacher/classes`
- `POST /api/teacher/classes/:classId/tasks`
- `GET /api/teacher/classes/:classId/tasks/:taskId/progress`
- `GET /api/teacher/classes/:classId/interventions`

Data model:

- `classes`
- `students`
- `assignments`
- `submissions`
- `teacher_interventions`
- `learning_event_rollups`

Verification path:

- Authz test: teachers can only access their own classes.
- Integration test for task creation and student progress rollup.
- Browser test for filter, table, and intervention cards.

## Recommended Implementation Order

1. Define the shared API contract and event schema.
2. Implement local JSON or SQLite adapters for development.
3. Wire pair-room role rotation and presence first because it drives the classroom collaboration UI.
4. Add learning event ingestion and process replay.
5. Add teacher class/task/progress endpoints.
6. Connect the AI chat provider last, behind dry-run safety and rate limits.

## Evidence Gate for Future Backend Work

Mark backend tasks as done only after all applicable checks have runtime evidence:

- Typecheck.
- Unit tests.
- Integration tests against a real local data adapter.
- Live endpoint curl with status and response body.
- Browser verification for the affected UI surface.

