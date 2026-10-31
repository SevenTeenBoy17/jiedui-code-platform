import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3m-t3-certification-evidence-closure.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3m-t3-certification-evidence-closure.md";

export function t3CertificationEvidenceClosure({
  generatedAt = new Date().toISOString(),
  executionGate = t3ApprovalExecutionGate(),
  evidenceBundle = null
} = {}) {
  const normalized = normalizeEvidenceBundle(evidenceBundle);
  const bundleSupplied = Boolean(evidenceBundle);
  const lane = (executionGate.gateLanes || []).find((item) => item.laneId === normalized.laneId);
  const secretExposure = bundleSupplied && hasSecretExposure(JSON.stringify(evidenceBundle));
  const executionGateHashMatches = bundleSupplied &&
    normalized.executionGateHash === executionGate.executionGateHash &&
    /^[a-f0-9]{64}$/.test(normalized.executionGateHash);
  const canonicalEvidence = lane?.requiredEvidence || [];
  const canonicalRollback = lane?.rollbackChecks || [];
  const providedEvidenceIds = new Set(normalized.evidenceItems.map((item) => item.id));
  const providedRollbackIds = new Set(normalized.rollbackResults.map((item) => item.id));
  const missingEvidence = canonicalEvidence.filter((id) => !providedEvidenceIds.has(id));
  const missingRollback = canonicalRollback.filter((id) => !providedRollbackIds.has(id));
  const evidenceItemsValid = normalized.evidenceItems.length >= canonicalEvidence.length &&
    normalized.evidenceItems.every((item) => item.id && item.status === "passed" && /^[a-f0-9]{64}$/.test(item.artifactHash));
  const rollbackResultsValid = normalized.rollbackResults.length >= canonicalRollback.length &&
    normalized.rollbackResults.every((item) => item.id && item.status === "passed" && /^[a-f0-9]{64}$/.test(item.artifactHash));
  const stateFlagsSafe = normalized.externalActionsExecuted === false &&
    normalized.certificationStateChanged === false &&
    normalized.finalGoalComplete === false;
  const prohibitedActionAttempted = normalized.actionsExecuted.some((action) =>
    (lane?.prohibitedActions || []).includes(action)
  );
  const evidenceComplete = Boolean(lane) && missingEvidence.length === 0 && evidenceItemsValid;
  const rollbackComplete = Boolean(lane) && missingRollback.length === 0 && rollbackResultsValid;
  const closureReady = Boolean(
    bundleSupplied &&
    lane &&
    executionGateHashMatches &&
    evidenceComplete &&
    rollbackComplete &&
    stateFlagsSafe &&
    !prohibitedActionAttempted &&
    !secretExposure
  );

  const rejectionReasons = [];
  if (bundleSupplied && !lane) rejectionReasons.push("unknown-lane");
  if (bundleSupplied && !executionGateHashMatches) rejectionReasons.push("execution-gate-hash-mismatch");
  if (bundleSupplied && missingEvidence.length) rejectionReasons.push("missing-required-evidence");
  if (bundleSupplied && missingRollback.length) rejectionReasons.push("missing-rollback-results");
  if (bundleSupplied && !evidenceItemsValid) rejectionReasons.push("invalid-evidence-item-shape");
  if (bundleSupplied && !rollbackResultsValid) rejectionReasons.push("invalid-rollback-result-shape");
  if (bundleSupplied && !stateFlagsSafe) rejectionReasons.push("state-change-claim-not-allowed");
  if (bundleSupplied && prohibitedActionAttempted) rejectionReasons.push("prohibited-action-attempted");
  if (bundleSupplied && secretExposure) rejectionReasons.push("secret-like-evidence-content");

  const status = bundleSupplied
    ? closureReady
      ? "certification-evidence-closure-ready-state-unchanged"
      : "certification-evidence-closure-rejected-execution-blocked"
    : "certification-evidence-closure-ready-execution-blocked";

  const laneClosures = (executionGate.gateLanes || []).map((item) => ({
    laneId: item.laneId,
    targetGap: item.targetGap,
    riskTier: "T3",
    metadataVerified: item.metadataVerified === true,
    evidenceRequirementCount: item.requiredEvidence?.length || 0,
    rollbackRequirementCount: item.rollbackChecks?.length || 0,
    evidenceBundleSupplied: bundleSupplied && item.laneId === normalized.laneId,
    closureReady: closureReady && item.laneId === normalized.laneId,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    certificationStateChanged: false,
    externalActionsExecuted: false
  }));

  const closureHash = sha256(JSON.stringify({
    status,
    executionGateHash: executionGate.executionGateHash,
    laneId: normalized.laneId || "",
    bundleSupplied,
    closureReady,
    missingEvidence,
    missingRollback,
    rejectionReasons
  }));

  return {
    phase: "3M",
    generatedAt,
    status,
    finalGoalComplete: false,
    closureOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    gateStatus: executionGate.status || "missing",
    gateOnly: executionGate.gateOnly === true,
    executionGateHash: executionGate.executionGateHash || "",
    closureHash,
    laneClosureCount: laneClosures.length,
    readyLaneClosureCount: laneClosures.filter((item) => item.metadataVerified).length,
    submittedEvidenceBundleCount: bundleSupplied ? 1 : 0,
    validatedEvidenceBundleCount: closureReady ? 1 : 0,
    evidenceBundle: {
      supplied: bundleSupplied,
      laneId: normalized.laneId,
      laneKnown: Boolean(lane),
      executionGateHashMatches,
      evidenceItemCount: normalized.evidenceItems.length,
      requiredEvidenceCount: canonicalEvidence.length,
      missingEvidence,
      rollbackResultCount: normalized.rollbackResults.length,
      requiredRollbackCount: canonicalRollback.length,
      missingRollback,
      evidenceComplete,
      rollbackComplete,
      stateFlagsSafe,
      prohibitedActionAttempted,
      secretExposure,
      closureReady,
      rejectionReasons: [...new Set(rejectionReasons)]
    },
    laneClosures,
    guardrails: {
      contentReturned: false,
      evidenceContentReturned: false,
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
    nextStep: "Use this validator only after separately approved T3 execution collects real evidence; this endpoint still changes no certification state."
  };
}

export function writeT3CertificationEvidenceClosure(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3CertificationEvidenceClosure(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3CertificationEvidenceClosureMarkdown(report), "utf8");
  return report;
}

export function renderT3CertificationEvidenceClosureMarkdown(report) {
  const rows = report.laneClosures
    .map((lane) => `| ${lane.laneId} | ${lane.targetGap} | ${lane.metadataVerified ? "yes" : "no"} | ${lane.evidenceRequirementCount} | ${lane.rollbackRequirementCount} | ${lane.closureReady ? "yes" : "no"} | ${lane.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3M T3 Certification Evidence Closure

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Closure only: **${report.closureOnly ? "yes" : "no"}**

Approval recorded: **${report.approvalRecorded ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Closure hash:

\`\`\`text
${report.closureHash}
\`\`\`

| Lane | Target gap | Metadata verified | Evidence items | Rollback checks | Closure ready | Execution allowed |
|---|---|---|---:|---:|---|---|
${rows}

## Evidence Bundle

- supplied: ${report.evidenceBundle.supplied}
- laneId: ${report.evidenceBundle.laneId || "none"}
- closureReady: ${report.evidenceBundle.closureReady}
- evidenceItemCount: ${report.evidenceBundle.evidenceItemCount}
- rollbackResultCount: ${report.evidenceBundle.rollbackResultCount}
- rejectionReasons: ${report.evidenceBundle.rejectionReasons.join(", ") || "none"}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This validator checks evidence closure metadata only.
- It does not include evidence body content or approval text content.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function normalizeEvidenceBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return {
      laneId: null,
      executionGateHash: "",
      evidenceItems: [],
      rollbackResults: [],
      actionsExecuted: [],
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false
    };
  }
  return {
    laneId: typeof bundle.laneId === "string" ? bundle.laneId : null,
    executionGateHash: typeof bundle.executionGateHash === "string" ? bundle.executionGateHash : "",
    evidenceItems: normalizeResultItems(bundle.evidenceItems),
    rollbackResults: normalizeResultItems(bundle.rollbackResults),
    actionsExecuted: Array.isArray(bundle.actionsExecuted) ? bundle.actionsExecuted.filter((item) => typeof item === "string") : [],
    externalActionsExecuted: bundle.externalActionsExecuted === true,
    certificationStateChanged: bundle.certificationStateChanged === true,
    finalGoalComplete: bundle.finalGoalComplete === true
  };
}

function normalizeResultItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      status: typeof item.status === "string" ? item.status : "",
      artifactHash: typeof item.artifactHash === "string" ? item.artifactHash : ""
    }));
}

function hasSecretExposure(text) {
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeT3CertificationEvidenceClosure();
  console.log(`T3 certification evidence closure written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
