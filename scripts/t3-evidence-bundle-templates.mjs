import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3o-t3-evidence-bundle-templates.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3o-t3-evidence-bundle-templates.md";

export function t3EvidenceBundleTemplates({
  generatedAt = new Date().toISOString(),
  executionGate = t3ApprovalExecutionGate()
} = {}) {
  const laneTemplates = (executionGate.gateLanes || []).map((lane) => buildLaneTemplate(lane, executionGate.executionGateHash));
  const readyLaneTemplateCount = laneTemplates.filter((lane) => lane.templateReady).length;
  const evidenceItemCount = laneTemplates.reduce((sum, lane) => sum + lane.evidenceItems.length, 0);
  const rollbackResultCount = laneTemplates.reduce((sum, lane) => sum + lane.rollbackResults.length, 0);
  const templatesReady = executionGate.status === "approval-execution-gate-ready-execution-blocked" &&
    executionGate.executionAllowed === false &&
    laneTemplates.length === 3 &&
    readyLaneTemplateCount === 3;
  const status = templatesReady
    ? "evidence-bundle-templates-ready-execution-blocked"
    : "evidence-bundle-templates-incomplete";
  const templateBundleHash = sha256(JSON.stringify({
    status,
    executionGateHash: executionGate.executionGateHash,
    laneIds: laneTemplates.map((lane) => lane.laneId),
    evidenceItemCount,
    rollbackResultCount
  }));

  return {
    phase: "3O",
    generatedAt,
    status,
    finalGoalComplete: false,
    templateOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    gateStatus: executionGate.status || "missing",
    gateOnly: executionGate.gateOnly === true,
    executionGateHash: executionGate.executionGateHash || "",
    templateBundleHash,
    laneTemplateCount: laneTemplates.length,
    readyLaneTemplateCount,
    evidenceItemCount,
    rollbackResultCount,
    laneTemplates,
    closureContract: {
      targetEndpoint: "/api/delivery/t3-certification-evidence-closure",
      requiresExecutionGateHash: true,
      requiresEvidenceArtifactHashes: true,
      requiresRollbackArtifactHashes: true,
      evidenceBodiesReturned: false,
      approvalTextReturned: false
    },
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
    nextStep: "After explicit human approval, run exactly one T3 lane externally and return only hashes/metadata matching the selected template."
  };
}

export function writeT3EvidenceBundleTemplates(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3EvidenceBundleTemplates(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3EvidenceBundleTemplatesMarkdown(report), "utf8");
  return report;
}

export function renderT3EvidenceBundleTemplatesMarkdown(report) {
  const rows = report.laneTemplates
    .map((lane) => `| ${lane.laneId} | ${lane.targetGap} | ${lane.evidenceItems.length} | ${lane.rollbackResults.length} | ${lane.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3O T3 Evidence Bundle Templates

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Template only: **${report.templateOnly ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Template bundle hash:

\`\`\`text
${report.templateBundleHash}
\`\`\`

| Lane | Target gap | Evidence items | Rollback results | Execution allowed |
|---|---|---:|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- These are metadata templates only.
- Evidence body content, approval text content, and secrets are not returned.
- This phase never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function buildLaneTemplate(lane, executionGateHash) {
  const evidenceItems = (lane.requiredEvidence || []).map((id) => ({
    id,
    statusRequired: "passed",
    artifactHashPlaceholder: "",
    artifactHashRequired: true,
    bodyContentAllowed: false
  }));
  const rollbackResults = (lane.rollbackChecks || []).map((id) => ({
    id,
    statusRequired: "passed",
    artifactHashPlaceholder: "",
    artifactHashRequired: true,
    bodyContentAllowed: false
  }));

  return {
    laneId: lane.laneId,
    targetGap: lane.targetGap,
    riskTier: "T3",
    templateReady: lane.metadataVerified === true &&
      lane.preExecutionChecksPassed === true &&
      evidenceItems.length >= 5 &&
      rollbackResults.length >= 3,
    executionGateHash,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false,
    actionsExecuted: [],
    evidenceItems,
    rollbackResults,
    rejectedFields: [
      "evidenceBody",
      "artifactBody",
      "approvalText",
      "secret",
      "apiKey",
      "databaseUrl"
    ]
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeT3EvidenceBundleTemplates();
  console.log(`T3 evidence bundle templates written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
