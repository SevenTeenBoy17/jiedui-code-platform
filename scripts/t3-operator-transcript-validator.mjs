import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3OperatorChecklist } from "./t3-operator-checklist.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3q-t3-operator-transcript-validator.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3q-t3-operator-transcript-validator.md";

export function t3OperatorTranscriptValidator({
  generatedAt = new Date().toISOString(),
  checklist = t3OperatorChecklist(),
  transcript = null
} = {}) {
  const transcripts = normalizeTranscripts(transcript);
  const supplied = transcripts.length > 0;
  const laneValidations = (checklist.laneChecklists || []).map((lane) => validateLaneTranscript({ lane, checklist, transcripts }));
  const validatedTranscriptCount = laneValidations.filter((item) => item.transcriptValid).length;
  const status = supplied
    ? validatedTranscriptCount === transcripts.length && transcripts.length > 0
      ? "t3-operator-transcript-valid-state-unchanged"
      : "t3-operator-transcript-rejected-execution-blocked"
    : "t3-operator-transcript-validator-ready-execution-blocked";
  const transcriptValidatorHash = sha256(JSON.stringify({
    status,
    checklistBundleHash: checklist.checklistBundleHash || "",
    transcriptCount: transcripts.length,
    validatedTranscriptCount,
    lanes: laneValidations.map((lane) => ({
      laneId: lane.laneId,
      transcriptSupplied: lane.transcriptSupplied,
      transcriptValid: lane.transcriptValid,
      rejectionReasons: lane.rejectionReasons
    }))
  }));

  return {
    phase: "3Q",
    generatedAt,
    status,
    finalGoalComplete: false,
    validatorOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    checklistStatus: checklist.status || "missing",
    operatorOnly: checklist.operatorOnly === true,
    checklistBundleHash: checklist.checklistBundleHash || "",
    transcriptValidatorHash,
    laneValidationCount: laneValidations.length,
    readyLaneValidationCount: laneValidations.filter((lane) => lane.checklistReady).length,
    submittedTranscriptCount: transcripts.length,
    validatedTranscriptCount,
    transcriptSummary: {
      supplied,
      laneIds: transcripts.map((item) => item.laneId).filter(Boolean),
      validCount: validatedTranscriptCount,
      rejectedCount: Math.max(0, transcripts.length - validatedTranscriptCount)
    },
    laneValidations,
    guardrails: {
      contentReturned: false,
      artifactContentReturned: false,
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
    nextStep: "Use this validator only after an explicitly approved T3 lane produces an operator transcript; validation still changes no certification state."
  };
}

export function writeT3OperatorTranscriptValidator(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3OperatorTranscriptValidator(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3OperatorTranscriptValidatorMarkdown(report), "utf8");
  return report;
}

export function renderT3OperatorTranscriptValidatorMarkdown(report) {
  const rows = report.laneValidations
    .map((lane) => `| ${lane.laneId} | ${lane.checklistReady ? "yes" : "no"} | ${lane.transcriptSupplied ? "yes" : "no"} | ${lane.transcriptValid ? "yes" : "no"} | ${lane.manualStepCount} | ${lane.evidenceArtifactCount} | ${lane.rollbackArtifactCount} |`)
    .join("\n");

  return `# Phase 3Q T3 Operator Transcript Validator

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Validator only: **${report.validatorOnly ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Transcript validator hash:

\`\`\`text
${report.transcriptValidatorHash}
\`\`\`

| Lane | Checklist ready | Transcript supplied | Transcript valid | Manual steps | Evidence hashes | Rollback hashes |
|---|---|---|---|---:|---:|---:|
${rows}

## Transcript Summary

- supplied: ${report.transcriptSummary.supplied}
- submittedTranscriptCount: ${report.submittedTranscriptCount}
- validatedTranscriptCount: ${report.validatedTranscriptCount}
- rejectedCount: ${report.transcriptSummary.rejectedCount}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This validator checks operator transcript metadata only.
- It does not include evidence body content, artifact body content, approval text, provider responses, database connection strings, or secrets.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function validateLaneTranscript({ lane, checklist, transcripts }) {
  const transcript = transcripts.find((item) => item.laneId === lane.laneId) || null;
  const normalized = normalizeTranscript(transcript);
  const transcriptSupplied = Boolean(transcript);
  const checklistHashMatches = transcriptSupplied &&
    normalized.checklistBundleHash === checklist.checklistBundleHash &&
    isSha256(normalized.checklistBundleHash);
  const requiredManualStepIds = (lane.manualSteps || []).map((step) => step.id);
  const requiredEvidenceIds = (lane.evidenceChecklist || []).map((item) => item.id);
  const requiredRollbackIds = (lane.rollbackChecklist || []).map((item) => item.id);
  const suppliedManualIds = new Set(normalized.manualStepIds);
  const suppliedEvidenceIds = new Set(normalized.evidenceArtifactHashes.map((item) => item.id));
  const suppliedRollbackIds = new Set(normalized.rollbackArtifactHashes.map((item) => item.id));
  const missingManualSteps = requiredManualStepIds.filter((id) => !suppliedManualIds.has(id));
  const missingEvidence = requiredEvidenceIds.filter((id) => !suppliedEvidenceIds.has(id));
  const missingRollback = requiredRollbackIds.filter((id) => !suppliedRollbackIds.has(id));
  const manualStepsComplete = transcriptSupplied && missingManualSteps.length === 0 && normalized.manualStepIds.length >= requiredManualStepIds.length;
  const evidenceComplete = transcriptSupplied && missingEvidence.length === 0 &&
    normalized.evidenceArtifactHashes.length >= requiredEvidenceIds.length &&
    normalized.evidenceArtifactHashes.every((item) => item.id && item.status === "passed" && isSha256(item.artifactHash));
  const rollbackComplete = transcriptSupplied && missingRollback.length === 0 &&
    normalized.rollbackArtifactHashes.length >= requiredRollbackIds.length &&
    normalized.rollbackArtifactHashes.every((item) => item.id && item.status === "passed" && isSha256(item.artifactHash));
  const stateFlagsSafe = normalized.approvalRecorded === false &&
    normalized.executionAllowed === false &&
    normalized.externalActionsExecuted === false &&
    normalized.certificationStateChanged === false &&
    normalized.finalGoalComplete === false &&
    normalized.contentReturned === false;
  const prohibitedActionAttempted = normalized.actionsExecuted.some((action) => (lane.blockedActions || []).includes(action));
  const secretExposure = transcriptSupplied && hasSecretExposure(JSON.stringify(transcript));
  const prohibitedContentField = transcriptSupplied && hasProhibitedContentField(transcript);
  const transcriptValid = Boolean(
    transcriptSupplied &&
    lane.checklistReady === true &&
    checklistHashMatches &&
    manualStepsComplete &&
    evidenceComplete &&
    rollbackComplete &&
    stateFlagsSafe &&
    !prohibitedActionAttempted &&
    !secretExposure &&
    !prohibitedContentField
  );

  const rejectionReasons = [];
  if (transcriptSupplied && !checklistHashMatches) rejectionReasons.push("checklist-bundle-hash-mismatch");
  if (transcriptSupplied && !manualStepsComplete) rejectionReasons.push("missing-manual-steps");
  if (transcriptSupplied && !evidenceComplete) rejectionReasons.push("missing-or-invalid-evidence-hashes");
  if (transcriptSupplied && !rollbackComplete) rejectionReasons.push("missing-or-invalid-rollback-hashes");
  if (transcriptSupplied && !stateFlagsSafe) rejectionReasons.push("state-change-claim-not-allowed");
  if (transcriptSupplied && prohibitedActionAttempted) rejectionReasons.push("blocked-action-claim-not-allowed");
  if (transcriptSupplied && secretExposure) rejectionReasons.push("secret-like-transcript-content");
  if (transcriptSupplied && prohibitedContentField) rejectionReasons.push("body-content-field-not-allowed");

  return {
    laneId: lane.laneId,
    targetGap: lane.targetGap,
    riskTier: "T3",
    checklistReady: lane.checklistReady === true,
    transcriptSupplied,
    transcriptValid,
    checklistHashMatches,
    manualStepCount: requiredManualStepIds.length,
    suppliedManualStepCount: normalized.manualStepIds.length,
    missingManualSteps,
    evidenceArtifactCount: requiredEvidenceIds.length,
    suppliedEvidenceArtifactCount: normalized.evidenceArtifactHashes.length,
    missingEvidence,
    rollbackArtifactCount: requiredRollbackIds.length,
    suppliedRollbackArtifactCount: normalized.rollbackArtifactHashes.length,
    missingRollback,
    stateFlagsSafe,
    prohibitedActionAttempted,
    secretExposure,
    prohibitedContentField,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    rejectionReasons: [...new Set(rejectionReasons)]
  };
}

function normalizeTranscripts(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => item && typeof item === "object");
}

function normalizeTranscript(value) {
  if (!value || typeof value !== "object") {
    return {
      laneId: null,
      checklistBundleHash: "",
      manualStepIds: [],
      evidenceArtifactHashes: [],
      rollbackArtifactHashes: [],
      actionsExecuted: [],
      approvalRecorded: false,
      executionAllowed: false,
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false,
      contentReturned: false
    };
  }
  return {
    laneId: typeof value.laneId === "string" ? value.laneId : null,
    checklistBundleHash: typeof value.checklistBundleHash === "string" ? value.checklistBundleHash : "",
    manualStepIds: Array.isArray(value.manualStepIds) ? value.manualStepIds.filter((item) => typeof item === "string") : [],
    evidenceArtifactHashes: normalizeArtifactHashes(value.evidenceArtifactHashes),
    rollbackArtifactHashes: normalizeArtifactHashes(value.rollbackArtifactHashes),
    actionsExecuted: Array.isArray(value.actionsExecuted) ? value.actionsExecuted.filter((item) => typeof item === "string") : [],
    approvalRecorded: value.approvalRecorded === true,
    executionAllowed: value.executionAllowed === true,
    externalActionsExecuted: value.externalActionsExecuted === true,
    certificationStateChanged: value.certificationStateChanged === true,
    finalGoalComplete: value.finalGoalComplete === true,
    contentReturned: value.contentReturned === true
  };
}

function normalizeArtifactHashes(value) {
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
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|databaseUrl|apiKey/i.test(text);
}

function hasProhibitedContentField(value) {
  const prohibited = new Set([
    "evidenceBody",
    "artifactBody",
    "approvalText",
    "providerResponse",
    "databaseUrl",
    "apiKey",
    "secret",
    "content",
    "body"
  ]);
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current)) {
      if (prohibited.has(key)) return true;
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return false;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value || "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeT3OperatorTranscriptValidator();
  console.log(`T3 operator transcript validator written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
