import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDefaultT3ApprovalRequestExport } from "./t3-approval-request-export.mjs";
import { t3ApprovalIntegrity } from "./t3-approval-integrity.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3i-t3-approval-lock.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3i-t3-approval-lock.md";
const APPROVAL_REQUEST_PATH = "qa-artifacts/phase3g-t3-approval-request-export.json";
const COMPLETION_AUDIT_PATH = "qa-artifacts/phase2s-completion-audit.json";

export function t3ApprovalLock({
  generatedAt = new Date().toISOString(),
  approvalRequest = loadApprovalRequest(),
  integrity = t3ApprovalIntegrity({
    extraArtifacts: [
      "specs/phase3i-t3-approval-lock-contract.md",
      "scripts/t3-approval-lock.mjs",
      "tests/t3-approval-lock.mjs"
    ]
  }),
  completionAudit = loadJson(COMPLETION_AUDIT_PATH, {})
} = {}) {
  const openCertificationGaps = completionAudit.openCertificationGaps || [];
  const laneLocks = (approvalRequest.requests || []).map((request) => laneLock(request));
  const material = JSON.stringify({
    approvalRequestStatus: approvalRequest.status,
    approvalRequestCount: approvalRequest.approvalRequestCount,
    requestReadyCount: approvalRequest.requestReadyCount,
    integrityStatus: integrity.status,
    integrityBundleHash: integrity.integrityBundleHash,
    openCertificationGapIds: openCertificationGaps.map((gap) => gap.id),
    laneLocks
  });
  const approvalLockHash = sha256(material);
  const ready = approvalRequest.status === "approval-request-export-ready" &&
    integrity.status === "approval-integrity-ready" &&
    laneLocks.length === 3 &&
    laneLocks.every((lock) => lock.requestReady && !lock.approved && !lock.executionAllowed);

  return {
    phase: "3I",
    generatedAt,
    status: ready ? "approval-lock-ready-with-open-t3-gaps" : "approval-lock-incomplete",
    finalGoalComplete: false,
    lockOnly: true,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    approvalRequestStatus: approvalRequest.status || "missing",
    approvalRequestCount: Number(approvalRequest.approvalRequestCount || 0),
    requestReadyCount: Number(approvalRequest.requestReadyCount || 0),
    integrityStatus: integrity.status || "missing",
    integrityBundleHash: integrity.integrityBundleHash || "",
    approvalLockHash,
    openCertificationGapCount: openCertificationGaps.length,
    openCertificationGaps: openCertificationGaps.map((gap) => ({
      id: gap.id,
      owner: gap.owner || "platform-hardening",
      severity: gap.severity || "medium"
    })),
    laneLockCount: laneLocks.length,
    laneLocks,
    guardrails: {
      contentReturned: false,
      approvalTextReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      certificationStateChanged: false,
      finalCompletionClaimed: false
    },
    nextStep: "Use this lock hash to verify the approval materials before any future explicitly approved single-lane T3 certification run."
  };
}

export function writeT3ApprovalLock(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3ApprovalLock(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalLockMarkdown(report), "utf8");
  return report;
}

export function renderT3ApprovalLockMarkdown(report) {
  const laneRows = report.laneLocks
    .map((lane) => `| ${lane.id} | ${lane.targetGap} | ${lane.requestReady ? "yes" : "no"} | ${lane.approved ? "yes" : "no"} | ${lane.approvalTextHash} |`)
    .join("\n");

  return `# Phase 3I T3 Approval Lock

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Lock only: **${report.lockOnly ? "yes" : "no"}**

Approved: **${report.approved ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Integrity bundle hash:

\`\`\`text
${report.integrityBundleHash}
\`\`\`

Approval lock hash:

\`\`\`text
${report.approvalLockHash}
\`\`\`

| Lane | Target gap | Request ready | Approved | Approval text hash |
|---|---|---|---|---|
${laneRows}

## Open Certification Gaps

${report.openCertificationGaps.map((gap) => `- ${gap.id}: ${gap.severity}`).join("\n")}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This lock binds approval request metadata to the current integrity bundle hash.
- It returns approval text hashes, not approval text contents.
- It does not approve, execute, or certify any T3 lane.
`;
}

function laneLock(request) {
  return {
    id: request.id,
    targetGap: request.targetGap,
    riskTier: request.riskTier || "T3",
    requestReady: request.requestReady === true,
    approved: false,
    executionAllowed: false,
    singleLaneOnly: request.singleLaneOnly === true,
    approvalTextHash: sha256(request.approvalText || ""),
    localCommandCandidateCount: (request.localCommandCandidates || []).length,
    rollbackStepCount: (request.rollbackSummary || []).length,
    evidenceItemCount: (request.evidenceChecklist || []).length,
    dryRunCheckCount: (request.dryRunChecks || []).length
  };
}

function loadApprovalRequest() {
  if (existsSync(APPROVAL_REQUEST_PATH)) {
    return loadJson(APPROVAL_REQUEST_PATH, {});
  }
  return buildDefaultT3ApprovalRequestExport();
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalLock();
  console.log(`T3 approval lock written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; laneLocks=${report.laneLockCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
