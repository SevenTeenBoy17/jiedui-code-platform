import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalCandidates } from "./t3-approval-candidates.mjs";
import { t3ApprovalLock } from "./t3-approval-lock.mjs";
import { t3ApprovalVerifier } from "./t3-approval-verifier.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3l-t3-approval-execution-gate.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3l-t3-approval-execution-gate.md";

const EVIDENCE_REQUIREMENTS = {
  runtime: [
    "certified-runtime-isolation-output",
    "quota-and-timeout-proof",
    "network-and-filesystem-boundary-proof",
    "rollback-drill-result",
    "secret-redaction-proof"
  ],
  database: [
    "managed-database-connection-proof",
    "migration-and-rollback-output",
    "backup-restore-or-pitr-proof",
    "least-privilege-access-proof",
    "secret-redaction-proof"
  ],
  provider: [
    "real-provider-coding-route-output",
    "image-route-model-separation-proof",
    "redacted-request-response-audit",
    "rate-limit-cost-kill-switch-proof",
    "secret-redaction-proof"
  ]
};

const ROLLBACK_CHECKS = {
  runtime: ["stop-certified-runtime", "restore-local-runner-default", "rerun-sandbox-certification-qa"],
  database: ["disable-managed-db-env", "restore-local-sqlite-adapter", "rerun-db-certification-qa"],
  provider: ["disable-live-provider-env", "restore-mock-provider-mode", "rerun-provider-certification-qa"]
};

const PROHIBITED_ACTIONS = [
  "record-approval-in-state",
  "execute-certification",
  "call-external-provider",
  "connect-managed-database",
  "deploy-or-publish",
  "bill-or-spend",
  "return-secret-or-approval-text-content",
  "claim-final-completion"
];

export function t3ApprovalExecutionGate({
  generatedAt = new Date().toISOString(),
  lock = t3ApprovalLock(),
  candidates = t3ApprovalCandidates({ lock }),
  candidate = null
} = {}) {
  const normalized = normalizeCandidate(candidate);
  const candidateSupplied = Boolean(candidate);
  const verifier = candidateSupplied ? t3ApprovalVerifier({ lock, candidate: normalized }) : t3ApprovalVerifier({ lock });
  const matchingCandidate = (candidates.candidates || []).find((item) =>
    item.laneId === normalized.laneId &&
    item.approvalLockHash === normalized.approvalLockHash &&
    item.approvalTextHash === normalized.approvalTextHash
  );
  const secretExposure = candidateSupplied && hasSecretExposure(JSON.stringify(candidate));
  const candidateBound = Boolean(candidateSupplied && matchingCandidate && verifier.verificationPassed === true && !secretExposure);
  const gateLanes = (candidates.candidates || []).map((item) => laneGate(item, candidateBound && item.laneId === normalized.laneId));
  const readyLaneGateCount = gateLanes.filter((lane) => lane.metadataVerified && lane.preExecutionChecksPassed).length;
  const gateReady = candidates.status === "approval-candidates-ready-execution-blocked" &&
    candidates.candidateOnly === true &&
    candidates.executionAllowed === false &&
    gateLanes.length === 3 &&
    readyLaneGateCount === gateLanes.length;

  const rejectionReasons = [];
  if (candidateSupplied && !matchingCandidate) rejectionReasons.push("candidate-not-in-current-bundle");
  if (candidateSupplied && verifier.verificationPassed !== true) rejectionReasons.push(...(verifier.candidate?.rejectionReasons || ["verifier-rejected"]));
  if (candidateSupplied && secretExposure) rejectionReasons.push("secret-like-candidate-content");

  const status = candidateSupplied
    ? candidateBound
      ? "approval-execution-gate-candidate-bound-execution-blocked"
      : "approval-execution-gate-rejected-execution-blocked"
    : gateReady
      ? "approval-execution-gate-ready-execution-blocked"
      : "approval-execution-gate-incomplete";

  const executionGateHash = sha256(JSON.stringify({
    status,
    candidateBundleHash: candidates.candidateBundleHash,
    approvalLockHash: candidates.approvalLockHash,
    boundLaneId: candidateBound ? normalized.laneId : "",
    gateLanes: gateLanes.map((lane) => ({
      laneId: lane.laneId,
      targetGap: lane.targetGap,
      metadataVerified: lane.metadataVerified,
      evidenceCount: lane.requiredEvidence.length,
      rollbackCount: lane.rollbackChecks.length
    }))
  }));

  return {
    phase: "3L",
    generatedAt,
    status,
    finalGoalComplete: false,
    gateOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    candidateBundleStatus: candidates.status || "missing",
    candidateBundleHash: candidates.candidateBundleHash || "",
    approvalLockHash: candidates.approvalLockHash || "",
    executionGateHash,
    laneGateCount: gateLanes.length,
    readyLaneGateCount,
    boundCandidateCount: candidateBound ? 1 : 0,
    boundLaneId: candidateBound ? normalized.laneId : "",
    candidate: {
      supplied: candidateSupplied,
      laneId: normalized.laneId,
      bound: candidateBound,
      verifierStatus: verifier.status,
      verificationPassed: verifier.verificationPassed === true,
      secretExposure,
      rejectionReasons: [...new Set(rejectionReasons)]
    },
    gateLanes,
    requiredApprovalRecord: {
      humanApprovalRequired: true,
      singleLaneOnly: true,
      approvalTextHashRequired: true,
      approvalTextContentReturned: false,
      approvalMustBeRecordedOutsideThisGate: true
    },
    guardrails: {
      contentReturned: false,
      approvalTextReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      approvalRecorded: false,
      certificationExecution: false,
      certificationStateChanged: false,
      finalCompletionClaimed: false
    },
    nextStep: "Only a future explicitly approved T3 phase may execute exactly one bound lane; this gate still blocks execution and records no approval."
  };
}

export function writeT3ApprovalExecutionGate(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3ApprovalExecutionGate(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalExecutionGateMarkdown(report), "utf8");
  return report;
}

export function renderT3ApprovalExecutionGateMarkdown(report) {
  const rows = report.gateLanes
    .map((lane) => `| ${lane.laneId} | ${lane.targetGap} | ${lane.metadataVerified ? "yes" : "no"} | ${lane.requiredEvidence.length} | ${lane.rollbackChecks.length} | ${lane.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3L T3 Approval Execution Gate

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Gate only: **${report.gateOnly ? "yes" : "no"}**

Approval recorded: **${report.approvalRecorded ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Execution gate hash:

\`\`\`text
${report.executionGateHash}
\`\`\`

| Lane | Target gap | Metadata verified | Evidence items | Rollback checks | Execution allowed |
|---|---|---|---:|---:|---|
${rows}

## Candidate

- supplied: ${report.candidate.supplied}
- laneId: ${report.candidate.laneId || "none"}
- bound: ${report.candidate.bound}
- verifierStatus: ${report.candidate.verifierStatus}
- rejectionReasons: ${report.candidate.rejectionReasons.join(", ") || "none"}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This gate binds metadata to pre-execution evidence requirements only.
- It does not include approval text content.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function laneGate(candidate, selected) {
  const laneId = candidate.laneId;
  const requiredEvidence = EVIDENCE_REQUIREMENTS[laneId] || ["approved-lane-runtime-evidence"];
  const rollbackChecks = ROLLBACK_CHECKS[laneId] || ["restore-previous-local-state"];
  return {
    laneId,
    targetGap: candidate.targetGap,
    riskTier: "T3",
    selectedForPreview: Boolean(selected),
    metadataVerified: candidate.verificationPassed === true,
    preExecutionChecksPassed: candidate.verificationPassed === true &&
      candidate.executionAllowed === false &&
      candidate.approvalRecorded === false &&
      requiredEvidence.length >= 5 &&
      rollbackChecks.length >= 3,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    certificationStateChanged: false,
    externalActionsExecuted: false,
    requiredEvidence,
    rollbackChecks,
    prohibitedActions: PROHIBITED_ACTIONS,
    nextApprovedAction: `In a separate explicitly approved phase, run only the ${laneId} lane and collect the evidence listed here.`
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { laneId: null, approvalLockHash: "", approvalTextHash: "" };
  }
  return {
    laneId: typeof candidate.laneId === "string" ? candidate.laneId : null,
    approvalLockHash: typeof candidate.approvalLockHash === "string" ? candidate.approvalLockHash : "",
    approvalTextHash: typeof candidate.approvalTextHash === "string" ? candidate.approvalTextHash : ""
  };
}

function hasSecretExposure(text) {
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalExecutionGate();
  console.log(`T3 approval execution gate written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; lanes=${report.laneGateCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
