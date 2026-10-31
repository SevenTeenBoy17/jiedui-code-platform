# Phase 3K T3 Approval Candidates Contract

## Endpoint

`GET /api/delivery/t3-approval-candidates`

The endpoint returns local, metadata-only candidate payloads for future human-approved T3 certification lanes.

## Offline Artifacts

- `qa-artifacts/phase3k-t3-approval-candidates.json`
- `qa-artifacts/phase3k-t3-approval-candidates.md`

## Contract

The candidate export must:

- Return `phase="3K"`.
- Return `status="approval-candidates-ready-execution-blocked"` when all three lane candidates verify against the current Phase 3J verifier.
- Return `candidateOnly=true`.
- Return `finalGoalComplete=false`.
- Return `approvalRecorded=false`.
- Return `approved=false`.
- Return `executionAllowed=false`.
- Return `externalActionsExecuted=false`.
- Return `certificationStateChanged=false`.
- Return `contentReturned=false`.
- Return `candidateCount=3`.
- Return `verifierPassCount=3`.
- Return `candidateBundleHash` as SHA-256.
- Return one candidate for each lane: runtime, database, provider.
- Each candidate includes `laneId`, `targetGap`, `riskTier`, `approvalLockHash`, and `approvalTextHash`.
- Candidate payloads must not include approval text content, secret values, commands that execute T3 work, or outward action flags.

## Report Fields

The report export must include:

- `t3ApprovalCandidatesStatus`
- `t3ApprovalCandidatesOnly`
- `t3ApprovalCandidateCount`
- `t3ApprovalCandidateVerifierPassCount`
- `t3ApprovalCandidatesExecutionAllowed`
- `t3ApprovalCandidatesHash`
- `t3ApprovalCandidatesFinalGoalComplete`

## UI

- Research page renders `data-t3-approval-candidates`.
- UI shows candidate count, verifier pass count, execution guard, and hash prefix.

## Guardrails

- No approval is persisted.
- No approval text content is returned.
- No external provider calls are made.
- No managed database connection is opened.
- No deployment, billing action, or certification execution occurs.
- These candidates prepare a future explicit approval phase; they do not approve or satisfy the three T3 certification gaps.
