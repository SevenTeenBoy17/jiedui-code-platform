# Phase 3E T3 Approval Packet Contract

Create a local approval packet for the three remaining T3 certification lanes: certified runtime, managed database, and external provider. This phase prepares approval prompts, pre-execution checks, rollback summaries, and evidence checklists only. It must not execute T3 work, call external providers, connect to a managed database, deploy, publish, bill, use secret values, or claim final completion.

## API

`GET /api/delivery/t3-approval-packet`

Response `data` includes:

- `status`: `approval-packet-ready`
- `finalGoalComplete`: false
- `executionAllowed`: false
- `safeToRunAutomatically`: false
- `approvalRequired`: true
- `laneCount`
- `approvedLaneCount`
- `blockedLaneCount`
- `evidenceRequirementCount`
- `rollbackStepCount`
- `lanes`
- `guardrails`

Each lane includes:

- `id`
- `targetGap`
- `riskTier`: `T3`
- `approvalRequired`: true
- `approved`: false
- `approvalPrompt`
- `preExecutionChecks`
- `rollbackSummary`
- `evidenceChecklist`
- `remainingWork`

## Report Export

`POST /api/reports/export` includes:

- `t3ApprovalPacketStatus`
- `t3ApprovalPacketExecutionAllowed`
- `t3ApprovalPacketLaneCount`
- `t3ApprovalPacketApprovedLaneCount`
- `t3ApprovalPacketBlockedLaneCount`
- `t3ApprovalPacketEvidenceRequirementCount`
- `t3ApprovalPacketRollbackStepCount`
- `t3ApprovalPacketFinalGoalComplete`

## Research UI

The research page shows a T3 approval packet panel with:

- `data-t3-approval-packet`
- packet status
- lane count
- approved lane count
- blocked lane count
- evidence requirement count

## Acceptance Criteria

- The packet includes runtime, database, and provider lanes.
- Every lane is T3, approval-required, unapproved, and not executable.
- Every lane includes pre-execution checks, rollback summary, evidence checklist, and remaining work.
- The packet keeps `finalGoalComplete=false` while T3 certification gaps remain open.
- The packet exposes no key-shaped token or environment-secret values.
- Existing API, smoke, research QA, visual QA, agentic audit, completion audit, Python syntax, graph, and secret scans remain green.
