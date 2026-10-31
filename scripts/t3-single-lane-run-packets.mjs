import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";
import { t3CertificationNextActions } from "./t3-certification-next-actions.mjs";
import { t3EvidenceBundleTemplates } from "./t3-evidence-bundle-templates.mjs";
import { t3OperatorChecklist } from "./t3-operator-checklist.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3v-t3-single-lane-run-packets.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3v-t3-single-lane-run-packets.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase3u-t3-certification-next-actions.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3p-t3-operator-checklist.json",
  "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
  "qa-artifacts/phase3l-t3-approval-execution-gate.json"
];

export function t3SingleLaneRunPackets({
  generatedAt = new Date().toISOString(),
  nextActions = readJson("qa-artifacts/phase3u-t3-certification-next-actions.json"),
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
  const normalizedNextActions = nextActions?.status ? nextActions : t3CertificationNextActions({
    executionGate: normalizedExecutionGate,
    templates: normalizedTemplates,
    checklist: normalizedChecklist
  });
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const runPackets = buildRunPackets({
    nextActions: normalizedNextActions,
    executionGate: normalizedExecutionGate,
    templates: normalizedTemplates,
    checklist: normalizedChecklist
  });
  const readyPacketCount = runPackets.filter((packet) => packet.packetReady).length;
  const evidenceRequirementCount = runPackets.reduce((sum, packet) => sum + packet.evidenceIds.length, 0);
  const rollbackRequirementCount = runPackets.reduce((sum, packet) => sum + packet.rollbackIds.length, 0);
  const manualStepCount = runPackets.reduce((sum, packet) => sum + packet.manualStepIds.length, 0);
  const packetsReady =
    normalizedNextActions.status === "t3-certification-next-actions-ready-execution-blocked" &&
    normalizedNextActions.executionAllowed === false &&
    normalizedNextActions.finalGoalComplete === false &&
    normalizedExecutionGate.executionAllowed === false &&
    normalizedTemplates.executionAllowed === false &&
    normalizedChecklist.executionAllowed === false &&
    runPackets.length === 3 &&
    readyPacketCount === 3 &&
    evidenceRequirementCount >= 15 &&
    rollbackRequirementCount >= 9 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0);
  const status = packetsReady
    ? "t3-single-lane-run-packets-ready-execution-blocked"
    : "t3-single-lane-run-packets-incomplete";
  const runPacketBundleHash = sha256(JSON.stringify({
    status,
    nextActionsHash: normalizedNextActions.nextActionsHash || "",
    executionGateHash: normalizedExecutionGate.executionGateHash || "",
    templateBundleHash: normalizedTemplates.templateBundleHash || "",
    checklistBundleHash: normalizedChecklist.checklistBundleHash || "",
    packetIds: runPackets.map((packet) => packet.packetId),
    evidenceRequirementCount,
    rollbackRequirementCount
  }));

  return {
    phase: "3V",
    generatedAt,
    status,
    finalGoalComplete: false,
    runPacketsOnly: true,
    readyForHumanReview: packetsReady,
    readyForProductionRelease: false,
    localEvidenceReady: packetsReady,
    approvalRequired: true,
    singleLaneOnly: true,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    blockedByT3: true,
    openT3GapCount: Number(normalizedNextActions.openT3GapCount || 0),
    packetCount: runPackets.length,
    readyPacketCount,
    manualStepCount,
    evidenceRequirementCount,
    rollbackRequirementCount,
    runPacketBundleHash,
    sourceHashes: {
      nextActionsHash: normalizedNextActions.nextActionsHash || "",
      releaseCandidateHash: normalizedNextActions.sourceHashes?.releaseCandidateHash || "",
      executionGateHash: normalizedExecutionGate.executionGateHash || "",
      templateBundleHash: normalizedTemplates.templateBundleHash || "",
      checklistBundleHash: normalizedChecklist.checklistBundleHash || ""
    },
    runPackets,
    evidenceFiles,
    openCertificationGaps: normalizedNextActions.openCertificationGaps || [],
    productionReleaseGate: {
      canRelease: false,
      reason: "Single-lane run packets are metadata-only and cannot close T3 certification gaps.",
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
    nextStep: "After explicit human approval, choose exactly one packet, run only that lane in the approved phase, then attach hash-only evidence and rollback results."
  };
}

export function writeT3SingleLaneRunPackets(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3SingleLaneRunPackets(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3SingleLaneRunPacketsMarkdown(report), "utf8");
  return report;
}

export function renderT3SingleLaneRunPacketsMarkdown(report) {
  const rows = report.runPackets
    .map((packet) => `| ${packet.laneId} | ${packet.targetGap} | ${packet.evidenceIds.length} | ${packet.rollbackIds.length} | ${packet.executionAllowed ? "yes" : "no"} | ${packet.packetHash.slice(0, 8)} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | ${gap.riskTier} | ${gap.status} |`)
    .join("\n");

  return `# Phase 3V T3 Single-Lane Run Packets

Generated: ${report.generatedAt}

Status: **${report.status}**

Ready for human review: **${report.readyForHumanReview ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Run packet bundle hash:

\`\`\`text
${report.runPacketBundleHash}
\`\`\`

| Lane | Target gap | Evidence IDs | Rollback IDs | Execution allowed | Packet hash |
|---|---|---:|---:|---|---|
${rows}

## Open T3 Gaps

| Gap | Risk | Status |
|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a single-lane run packet bundle only.
- It prepares future approval-bound execution without executing any lane.
- It never records approval, calls external providers, connects managed databases, deploys, bills, returns content bodies, or claims final completion.
`;
}

function buildRunPackets({ nextActions, executionGate, templates, checklist }) {
  return (nextActions.laneActions || []).map((lane) => {
    const gateLane = (executionGate.gateLanes || []).find((item) => item.laneId === lane.laneId) || {};
    const template = (templates.laneTemplates || []).find((item) => item.laneId === lane.laneId) || {};
    const checklistLane = (checklist.laneChecklists || []).find((item) => item.laneId === lane.laneId) || {};
    const evidenceIds = idsFrom(gateLane.requiredEvidence, template.evidenceItems, checklistLane.evidenceChecklist);
    const rollbackIds = idsFrom(gateLane.rollbackChecks, template.rollbackResults, checklistLane.rollbackChecklist);
    const manualStepIds = idsFrom(checklistLane.manualSteps);
    const packetReady = lane.actionReady === true &&
      gateLane.preExecutionChecksPassed === true &&
      template.templateReady === true &&
      checklistLane.checklistReady === true &&
      evidenceIds.length >= 5 &&
      rollbackIds.length >= 3 &&
      lane.executionAllowed === false;
    const packetId = `${lane.laneId}-single-lane-run-packet`;
    const packetHash = sha256(JSON.stringify({
      packetId,
      laneId: lane.laneId,
      targetGap: lane.targetGap,
      laneHash: lane.laneHash || "",
      nextActionsHash: nextActions.nextActionsHash || "",
      evidenceIds,
      rollbackIds
    }));

    return {
      packetId,
      laneId: lane.laneId,
      targetGap: lane.targetGap,
      riskTier: "T3",
      packetReady,
      approvalRequired: true,
      singleLaneOnly: true,
      executionAllowed: false,
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false,
      sourceHashes: {
        nextActionsHash: nextActions.nextActionsHash || "",
        executionGateHash: executionGate.executionGateHash || "",
        templateBundleHash: templates.templateBundleHash || "",
        checklistBundleHash: checklist.checklistBundleHash || "",
        laneHash: lane.laneHash || ""
      },
      approvalContract: {
        humanApprovalRequired: true,
        approvalTextHashRequired: true,
        approvalTextContentAllowed: false,
        approvalMustBeExternal: true,
        approvalRecordedInThisPacket: false
      },
      executionWindow: {
        approvedPhaseRequired: true,
        runExactlyOnce: true,
        oneLaneOnly: true,
        rollbackFirst: true,
        stopOnSecretExposure: true,
        reviewBeforeStateChange: true
      },
      evidenceIds,
      rollbackIds,
      manualStepIds,
      prohibitedActions: [
        "execute-without-explicit-approval",
        "run-multiple-lanes",
        "record-approval-in-this-packet",
        "return-secret-or-approval-text-content",
        "return-artifact-body-content",
        "claim-final-completion-before-evidence-review"
      ],
      packetHash,
      nextApprovedActionId: lane.nextApprovedActionId || `${lane.laneId}-approved-certification-run`,
      nextApprovedAction: lane.nextApprovedAction || gateLane.nextApprovedAction || "Run this lane only after explicit approval and attach hash-backed runtime evidence."
    };
  });
}

function idsFrom(...collections) {
  for (const collection of collections) {
    const ids = (Array.isArray(collection) ? collection : [])
      .map((item) => (typeof item === "string" ? item : item?.id))
      .filter(Boolean);
    if (ids.length) return ids;
  }
  return [];
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
  writeT3SingleLaneRunPackets();
  console.log(`T3 single-lane run packets written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
