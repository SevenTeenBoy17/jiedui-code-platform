import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryReleaseCandidate } from "./delivery-release-candidate.mjs";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";
import { t3EvidenceBundleTemplates } from "./t3-evidence-bundle-templates.mjs";
import { t3OperatorChecklist } from "./t3-operator-checklist.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3u-t3-certification-next-actions.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3u-t3-certification-next-actions.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3p-t3-operator-checklist.json",
  "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
  "qa-artifacts/phase3l-t3-approval-execution-gate.json",
  "qa-artifacts/phase2s-completion-audit.json"
];

export function t3CertificationNextActions({
  generatedAt = new Date().toISOString(),
  releaseCandidate = readJson("qa-artifacts/phase3t-delivery-release-candidate.json"),
  executionGate = readJson("qa-artifacts/phase3l-t3-approval-execution-gate.json"),
  templates = readJson("qa-artifacts/phase3o-t3-evidence-bundle-templates.json"),
  checklist = readJson("qa-artifacts/phase3p-t3-operator-checklist.json")
} = {}) {
  const normalizedExecutionGate = executionGate?.status ? executionGate : t3ApprovalExecutionGate();
  const normalizedTemplates = templates?.status ? templates : t3EvidenceBundleTemplates({ executionGate: normalizedExecutionGate });
  const normalizedChecklist = checklist?.status ? checklist : t3OperatorChecklist({
    executionGate: normalizedExecutionGate,
    templates: normalizedTemplates
  });
  const normalizedReleaseCandidate = releaseCandidate?.status ? releaseCandidate : deliveryReleaseCandidate();
  const openCertificationGaps = normalizeGaps(normalizedReleaseCandidate.openCertificationGaps || []);
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const laneActions = buildLaneActions({
    releaseCandidate: normalizedReleaseCandidate,
    executionGate: normalizedExecutionGate,
    templates: normalizedTemplates,
    checklist: normalizedChecklist
  });
  const readyLaneActionCount = laneActions.filter((lane) => lane.actionReady).length;
  const evidenceRequirementCount = laneActions.reduce((sum, lane) => sum + lane.evidenceRequirementCount, 0);
  const rollbackRequirementCount = laneActions.reduce((sum, lane) => sum + lane.rollbackRequirementCount, 0);
  const manualStepCount = laneActions.reduce((sum, lane) => sum + lane.manualStepCount, 0);
  const matrixReady =
    normalizedReleaseCandidate.status === "release-candidate-local-evidence-ready-open-t3" &&
    normalizedReleaseCandidate.readyForHumanReview === true &&
    normalizedReleaseCandidate.readyForProductionRelease === false &&
    normalizedReleaseCandidate.finalGoalComplete === false &&
    normalizedExecutionGate.executionAllowed === false &&
    normalizedTemplates.executionAllowed === false &&
    normalizedChecklist.executionAllowed === false &&
    laneActions.length === 3 &&
    readyLaneActionCount === 3 &&
    openCertificationGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0);
  const status = matrixReady
    ? "t3-certification-next-actions-ready-execution-blocked"
    : "t3-certification-next-actions-incomplete";
  const nextActionsHash = sha256(JSON.stringify({
    status,
    releaseCandidateHash: normalizedReleaseCandidate.releaseCandidateHash || "",
    executionGateHash: normalizedExecutionGate.executionGateHash || "",
    templateBundleHash: normalizedTemplates.templateBundleHash || "",
    checklistBundleHash: normalizedChecklist.checklistBundleHash || "",
    laneIds: laneActions.map((lane) => lane.laneId),
    evidenceRequirementCount,
    rollbackRequirementCount,
    openCertificationGaps: openCertificationGaps.map((gap) => gap.id)
  }));

  return {
    phase: "3U",
    generatedAt,
    status,
    finalGoalComplete: false,
    nextActionsOnly: true,
    readyForHumanReview: matrixReady,
    readyForProductionRelease: false,
    localEvidenceReady: matrixReady,
    approvalRequired: true,
    singleLaneOnly: true,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    blockedByT3: true,
    openT3GapCount: openCertificationGaps.length,
    laneActionCount: laneActions.length,
    readyLaneActionCount,
    manualStepCount,
    evidenceRequirementCount,
    rollbackRequirementCount,
    nextActionsHash,
    sourceHashes: {
      releaseCandidateHash: normalizedReleaseCandidate.releaseCandidateHash || "",
      executionGateHash: normalizedExecutionGate.executionGateHash || "",
      templateBundleHash: normalizedTemplates.templateBundleHash || "",
      checklistBundleHash: normalizedChecklist.checklistBundleHash || ""
    },
    laneActions,
    evidenceFiles,
    openCertificationGaps,
    productionReleaseGate: {
      canRelease: false,
      reason: "Three T3 certification gaps remain open and require explicit approval plus runtime evidence.",
      requiredClosedGapCount: 3,
      currentClosedGapCount: 0
    },
    guardrails: {
      contentReturned: false,
      artifactBodyContentReturned: false,
      evidenceBodyContentReturned: false,
      screenshotBytesReturned: false,
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
    nextStep: "After explicit human approval, bind exactly one lane candidate, execute only that approved lane, then attach metadata-only evidence and rollback hashes for review."
  };
}

export function writeT3CertificationNextActions(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3CertificationNextActions(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3CertificationNextActionsMarkdown(report), "utf8");
  return report;
}

export function renderT3CertificationNextActionsMarkdown(report) {
  const rows = report.laneActions
    .map((lane) => `| ${lane.laneId} | ${lane.targetGap} | ${lane.nextApprovedActionId} | ${lane.evidenceRequirementCount} | ${lane.rollbackRequirementCount} | ${lane.executionAllowed ? "yes" : "no"} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | ${gap.riskTier} | ${gap.status} |`)
    .join("\n");

  return `# Phase 3U T3 Certification Next Actions

Generated: ${report.generatedAt}

Status: **${report.status}**

Ready for human review: **${report.readyForHumanReview ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Next actions hash:

\`\`\`text
${report.nextActionsHash}
\`\`\`

| Lane | Target gap | Next approved action | Evidence items | Rollback items | Execution allowed |
|---|---|---|---:|---:|---|
${rows}

## Open T3 Gaps

| Gap | Risk | Status |
|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a next-actions matrix only.
- It binds local evidence metadata to future approval-gated lane execution.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, returns content bodies, or claims final completion.
`;
}

function buildLaneActions({ releaseCandidate, executionGate, templates, checklist }) {
  const gapsById = new Map((releaseCandidate.openCertificationGaps || []).map((gap) => [gap.id, gap]));
  return (checklist.laneChecklists || []).map((lane) => {
    const gateLane = (executionGate.gateLanes || []).find((item) => item.laneId === lane.laneId) || {};
    const template = (templates.laneTemplates || []).find((item) => item.laneId === lane.laneId) || {};
    const gap = gapsById.get(lane.targetGap) || {};
    const evidenceRequirementCount = Number(lane.evidenceChecklist?.length || template.evidenceItems?.length || gateLane.requiredEvidence?.length || 0);
    const rollbackRequirementCount = Number(lane.rollbackChecklist?.length || template.rollbackResults?.length || gateLane.rollbackChecks?.length || 0);
    const manualStepCount = Number(lane.manualSteps?.length || 0);
    const actionReady = lane.checklistReady === true &&
      gateLane.preExecutionChecksPassed === true &&
      template.templateReady === true &&
      evidenceRequirementCount >= 5 &&
      rollbackRequirementCount >= 3;
    const nextApprovedActionId = `${lane.laneId}-approved-certification-run`;
    const laneHash = sha256(JSON.stringify({
      laneId: lane.laneId,
      targetGap: lane.targetGap,
      checklistHash: lane.checklistHash || "",
      executionGateHash: executionGate.executionGateHash || "",
      templateBundleHash: templates.templateBundleHash || "",
      evidenceRequirementCount,
      rollbackRequirementCount
    }));

    return {
      laneId: lane.laneId,
      targetGap: lane.targetGap,
      riskTier: "T3",
      gapStatus: gap.status || "open",
      actionReady,
      nextApprovedActionId,
      approvalRequired: true,
      singleLaneOnly: true,
      executionAllowed: false,
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false,
      manualStepCount,
      evidenceRequirementCount,
      rollbackRequirementCount,
      laneHash,
      requiredApprovals: [
        "explicit-human-approval",
        "single-lane-selection",
        "rollback-first-plan-accepted",
        "metadata-only-evidence-return"
      ],
      executionContract: {
        approvedPhaseRequired: true,
        runExactlyOnce: true,
        bodyContentAllowed: false,
        secretValuesAllowed: false,
        rollbackEvidenceRequired: true,
        reviewBeforeStateChange: true
      },
      nextApprovedAction: gap.nextAction || "Run this lane only after explicit approval and attach hash-backed runtime evidence."
    };
  });
}

function normalizeGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : []).map((gap) => ({
    id: gap.id || gap.targetGap || "unknown-gap",
    status: gap.status || "open",
    riskTier: gap.riskTier || "T3",
    nextAction: gap.nextAction || "Run one explicitly approved T3 lane with rollback and runtime evidence."
  }));
}

function evidenceFile(path) {
  const exists = existsSync(path);
  const bytes = exists ? readFileSync(path) : null;
  return {
    path,
    exists,
    sizeBytes: exists ? statSync(path).size : 0,
    sha256: bytes ? sha256(bytes) : ""
  };
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeT3CertificationNextActions();
  console.log(`T3 certification next actions written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
