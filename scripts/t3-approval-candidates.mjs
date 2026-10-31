import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalLock } from "./t3-approval-lock.mjs";
import { t3ApprovalVerifier } from "./t3-approval-verifier.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3k-t3-approval-candidates.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3k-t3-approval-candidates.md";

export function t3ApprovalCandidates({
  generatedAt = new Date().toISOString(),
  lock = t3ApprovalLock()
} = {}) {
  const verifier = t3ApprovalVerifier({ lock });
  const candidates = (verifier.laneVerifications || []).map((lane) => candidateForLane(lane, verifier, lock));
  const candidateBundleHash = sha256(JSON.stringify({
    lockStatus: lock.status,
    verifierStatus: verifier.status,
    approvalLockHash: verifier.approvalLockHash,
    integrityBundleHash: verifier.integrityBundleHash,
    candidates
  }));
  const verifierPassCount = candidates.filter((candidate) => candidate.verificationPassed).length;
  const ready = verifier.status === "approval-verifier-ready-execution-blocked" &&
    verifier.verifierOnly === true &&
    candidates.length === 3 &&
    verifierPassCount === candidates.length &&
    candidates.every((candidate) => candidate.executionAllowed === false && candidate.approvalRecorded === false);

  return {
    phase: "3K",
    generatedAt,
    status: ready ? "approval-candidates-ready-execution-blocked" : "approval-candidates-incomplete",
    finalGoalComplete: false,
    candidateOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    lockStatus: lock.status || "missing",
    verifierStatus: verifier.status || "missing",
    approvalLockHash: verifier.approvalLockHash || "",
    integrityBundleHash: verifier.integrityBundleHash || "",
    candidateBundleHash,
    candidateCount: candidates.length,
    verifierPassCount,
    candidateLaneIds: candidates.map((candidate) => candidate.laneId),
    candidates,
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
    nextStep: "Use exactly one candidate payload only inside a future explicitly approved T3 phase; this export still does not approve or execute certification."
  };
}

export function writeT3ApprovalCandidates(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3ApprovalCandidates(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalCandidatesMarkdown(report), "utf8");
  return report;
}

export function renderT3ApprovalCandidatesMarkdown(report) {
  const rows = report.candidates
    .map((candidate) => `| ${candidate.laneId} | ${candidate.targetGap} | ${candidate.verificationPassed ? "yes" : "no"} | ${candidate.executionAllowed ? "yes" : "no"} | ${candidate.approvalTextHash.slice(0, 16)} |`)
    .join("\n");

  return `# Phase 3K T3 Approval Candidates

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Candidate only: **${report.candidateOnly ? "yes" : "no"}**

Approval recorded: **${report.approvalRecorded ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Candidate bundle hash:

\`\`\`text
${report.candidateBundleHash}
\`\`\`

| Lane | Target gap | Verifier pass | Execution allowed | Approval text hash prefix |
|---|---|---|---|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This export contains verifier-ready metadata only.
- It does not include approval text content.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function candidateForLane(lane, verifier, lock) {
  const payload = {
    laneId: lane.id,
    approvalLockHash: verifier.approvalLockHash,
    approvalTextHash: lane.approvalTextHash
  };
  const verification = t3ApprovalVerifier({ lock, candidate: payload });
  return {
    ...payload,
    targetGap: lane.targetGap,
    riskTier: lane.riskTier || "T3",
    singleLaneOnly: true,
    verifierStatus: verification.status,
    verificationPassed: verification.verificationPassed === true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    certificationStateChanged: false,
    externalActionsExecuted: false,
    contentReturned: false
  };
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalCandidates();
  console.log(`T3 approval candidates written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; candidates=${report.candidateCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
