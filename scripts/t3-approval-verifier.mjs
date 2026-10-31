import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalLock } from "./t3-approval-lock.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3j-t3-approval-verifier.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3j-t3-approval-verifier.md";
const LOCK_ARTIFACT_PATH = "qa-artifacts/phase3i-t3-approval-lock.json";

export function t3ApprovalVerifier({
  generatedAt = new Date().toISOString(),
  lock = loadLock(),
  candidate = null
} = {}) {
  const normalized = normalizeCandidate(candidate);
  const laneVerifications = (lock.laneLocks || []).map((lane) => ({
    id: lane.id,
    targetGap: lane.targetGap,
    riskTier: lane.riskTier || "T3",
    requestReady: lane.requestReady === true,
    singleLaneOnly: lane.singleLaneOnly === true,
    approved: false,
    executionAllowed: false,
    approvalTextHash: lane.approvalTextHash || "",
    lockHashMatches: isHash(lock.approvalLockHash),
    approvalTextHashPresent: isHash(lane.approvalTextHash)
  }));

  const candidateLane = laneVerifications.find((lane) => lane.id === normalized.laneId);
  const candidateSupplied = Boolean(candidate);
  const lockHashMatches = candidateSupplied && normalized.approvalLockHash === lock.approvalLockHash;
  const approvalTextHashMatches = candidateSupplied && candidateLane?.approvalTextHash === normalized.approvalTextHash;
  const singleLaneOnly = candidateSupplied && typeof normalized.laneId === "string" && !Array.isArray(candidate?.laneId);
  const secretExposure = candidateSupplied && hasSecretExposure(JSON.stringify(candidate));
  const rejectionReasons = [];
  if (candidateSupplied && !candidateLane) rejectionReasons.push("unknown-lane");
  if (candidateSupplied && !lockHashMatches) rejectionReasons.push("approval-lock-hash-mismatch");
  if (candidateSupplied && !approvalTextHashMatches) rejectionReasons.push("approval-text-hash-mismatch");
  if (candidateSupplied && !singleLaneOnly) rejectionReasons.push("not-single-lane");
  if (candidateSupplied && secretExposure) rejectionReasons.push("secret-like-candidate-content");

  const lockReady = lock.status === "approval-lock-ready-with-open-t3-gaps" &&
    lock.lockOnly === true &&
    lock.approved === false &&
    lock.executionAllowed === false &&
    laneVerifications.length === 3 &&
    laneVerifications.every((lane) => lane.requestReady && lane.approvalTextHashPresent);
  const verificationPassed = Boolean(candidateSupplied && lockReady && candidateLane && lockHashMatches && approvalTextHashMatches && singleLaneOnly && !secretExposure);
  const status = !candidateSupplied
    ? "approval-verifier-ready-execution-blocked"
    : verificationPassed
      ? "approval-metadata-verified-execution-blocked"
      : "approval-verifier-rejected-execution-blocked";

  return {
    phase: "3J",
    generatedAt,
    status,
    finalGoalComplete: false,
    verifierOnly: true,
    verificationPassed,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    lockStatus: lock.status || "missing",
    approvalLockHash: lock.approvalLockHash || "",
    integrityBundleHash: lock.integrityBundleHash || "",
    laneVerificationCount: laneVerifications.length,
    readyLaneVerificationCount: laneVerifications.filter((lane) => lane.requestReady).length,
    submittedCandidateCount: candidateSupplied ? 1 : 0,
    candidate: {
      supplied: candidateSupplied,
      laneId: normalized.laneId,
      laneKnown: Boolean(candidateLane),
      lockHashMatches,
      approvalTextHashMatches,
      singleLaneOnly,
      secretExposure,
      rejectionReasons
    },
    laneVerifications,
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
    nextStep: "Only after explicit human approval, use a single verified lane in a separate T3 phase; this verifier still does not execute certification."
  };
}

export function writeT3ApprovalVerifier(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3ApprovalVerifier(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalVerifierMarkdown(report), "utf8");
  return report;
}

export function renderT3ApprovalVerifierMarkdown(report) {
  const laneRows = report.laneVerifications
    .map((lane) => `| ${lane.id} | ${lane.targetGap} | ${lane.requestReady ? "yes" : "no"} | ${lane.executionAllowed ? "yes" : "no"} | ${(lane.approvalTextHash || "").slice(0, 16)} |`)
    .join("\n");

  return `# Phase 3J T3 Approval Verifier

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Verifier only: **${report.verifierOnly ? "yes" : "no"}**

Verification passed: **${report.verificationPassed ? "yes" : "no"}**

Approval recorded: **${report.approvalRecorded ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Approval lock hash:

\`\`\`text
${report.approvalLockHash}
\`\`\`

| Lane | Target gap | Request ready | Execution allowed | Approval text hash prefix |
|---|---|---|---|---|
${laneRows}

## Candidate

- supplied: ${report.candidate.supplied}
- laneId: ${report.candidate.laneId || "none"}
- laneKnown: ${report.candidate.laneKnown}
- lockHashMatches: ${report.candidate.lockHashMatches}
- approvalTextHashMatches: ${report.candidate.approvalTextHashMatches}
- secretExposure: ${report.candidate.secretExposure}
- rejectionReasons: ${report.candidate.rejectionReasons.join(", ") || "none"}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This verifier checks lock metadata only.
- It never records approval, executes certification, returns approval text content, or claims final completion.
`;
}

function loadLock() {
  if (existsSync(LOCK_ARTIFACT_PATH)) {
    try {
      return JSON.parse(readFileSync(LOCK_ARTIFACT_PATH, "utf8"));
    } catch {
      return t3ApprovalLock();
    }
  }
  return t3ApprovalLock();
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

function isHash(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function hasSecretExposure(text) {
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalVerifier();
  console.log(`T3 approval verifier written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; lanes=${report.laneVerificationCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
