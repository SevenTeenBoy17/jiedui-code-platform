import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";
import { t3ApprovalCandidates } from "./t3-approval-candidates.mjs";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";
import { t3EvidenceBundleTemplates } from "./t3-evidence-bundle-templates.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3p-t3-operator-checklist.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3p-t3-operator-checklist.md";

export function t3OperatorChecklist({
  generatedAt = new Date().toISOString(),
  finalReadiness = defaultFinalReadiness(),
  candidates = t3ApprovalCandidates(),
  executionGate = t3ApprovalExecutionGate(),
  templates = t3EvidenceBundleTemplates({ executionGate })
} = {}) {
  const laneChecklists = (templates.laneTemplates || []).map((template) => {
    const candidate = (candidates.candidates || []).find((item) => item.laneId === template.laneId) || {};
    const gateLane = (executionGate.gateLanes || []).find((item) => item.laneId === template.laneId) || {};
    return buildLaneChecklist({ template, candidate, gateLane, executionGate, templates, finalReadiness });
  });
  const readyLaneChecklistCount = laneChecklists.filter((lane) => lane.checklistReady).length;
  const manualStepCount = laneChecklists.reduce((sum, lane) => sum + lane.manualSteps.length, 0);
  const evidenceItemCount = laneChecklists.reduce((sum, lane) => sum + lane.evidenceChecklist.length, 0);
  const rollbackItemCount = laneChecklists.reduce((sum, lane) => sum + lane.rollbackChecklist.length, 0);
  const checklistReady = finalReadiness.finalGoalComplete === false &&
    finalReadiness.blockedByT3 === true &&
    candidates.status === "approval-candidates-ready-execution-blocked" &&
    executionGate.status === "approval-execution-gate-ready-execution-blocked" &&
    templates.status === "evidence-bundle-templates-ready-execution-blocked" &&
    laneChecklists.length === 3 &&
    readyLaneChecklistCount === 3;
  const status = checklistReady
    ? "t3-operator-checklist-ready-execution-blocked"
    : "t3-operator-checklist-incomplete";
  const checklistBundleHash = sha256(JSON.stringify({
    status,
    readinessHash: finalReadiness.readinessHash,
    candidateBundleHash: candidates.candidateBundleHash,
    executionGateHash: executionGate.executionGateHash,
    templateBundleHash: templates.templateBundleHash,
    laneIds: laneChecklists.map((lane) => lane.laneId),
    manualStepCount,
    evidenceItemCount,
    rollbackItemCount
  }));

  return {
    phase: "3P",
    generatedAt,
    status,
    finalGoalComplete: false,
    operatorOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    readinessStatus: finalReadiness.status || "missing",
    readinessHash: finalReadiness.readinessHash || "",
    candidateStatus: candidates.status || "missing",
    candidateBundleHash: candidates.candidateBundleHash || "",
    executionGateStatus: executionGate.status || "missing",
    executionGateHash: executionGate.executionGateHash || "",
    templateStatus: templates.status || "missing",
    templateBundleHash: templates.templateBundleHash || "",
    checklistBundleHash,
    laneChecklistCount: laneChecklists.length,
    readyLaneChecklistCount,
    manualStepCount,
    evidenceItemCount,
    rollbackItemCount,
    laneChecklists,
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
    nextStep: "Request explicit human approval for exactly one T3 lane, then run that lane in an approved phase and attach only hash-backed evidence metadata."
  };
}

export function writeT3OperatorChecklist(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3OperatorChecklist(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3OperatorChecklistMarkdown(report), "utf8");
  return report;
}

export function renderT3OperatorChecklistMarkdown(report) {
  const rows = report.laneChecklists
    .map((lane) => `| ${lane.laneId} | ${lane.targetGap} | ${lane.manualSteps.length} | ${lane.evidenceChecklist.length} | ${lane.rollbackChecklist.length} | ${lane.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3P T3 Operator Checklist

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Operator only: **${report.operatorOnly ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Checklist bundle hash:

\`\`\`text
${report.checklistBundleHash}
\`\`\`

| Lane | Target gap | Manual steps | Evidence items | Rollback items | Execution allowed |
|---|---|---:|---:|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is an operator checklist only.
- It never returns approval text, evidence bodies, artifact bodies, secrets, provider responses, or database connection strings.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function buildLaneChecklist({ template, candidate, gateLane, executionGate, templates, finalReadiness }) {
  const laneId = template.laneId || gateLane.laneId || candidate.laneId || "unknown";
  const targetGap = template.targetGap || gateLane.targetGap || candidate.targetGap || laneId;
  const evidenceChecklist = (template.evidenceItems || []).map((item) => ({
    id: item.id,
    requiredStatus: "passed",
    artifactHashRequired: true,
    bodyContentAllowed: false,
    operatorInstruction: "Attach artifact hash and status only after the approved T3 lane has produced runtime evidence."
  }));
  const rollbackChecklist = (template.rollbackResults || []).map((item) => ({
    id: item.id,
    requiredStatus: "passed",
    artifactHashRequired: true,
    bodyContentAllowed: false,
    operatorInstruction: "Attach rollback artifact hash and status only after rollback has been rehearsed or executed in the approved lane."
  }));
  const manualSteps = [
    {
      id: `${laneId}-confirm-single-lane-approval`,
      order: 1,
      required: true,
      status: "blocked-until-human-approval",
      instruction: "Confirm explicit human approval for this single lane only.",
      outwardActionAllowed: false
    },
    {
      id: `${laneId}-verify-lock-and-candidate-hashes`,
      order: 2,
      required: true,
      status: candidate.verificationPassed ? "ready" : "blocked",
      instruction: "Verify candidate metadata and lock hashes before any approved run.",
      outwardActionAllowed: false
    },
    {
      id: `${laneId}-run-approved-certification-once`,
      order: 3,
      required: true,
      status: "blocked-until-approved-phase",
      instruction: "Run the lane exactly once inside an explicitly approved T3 phase.",
      outwardActionAllowed: false
    },
    {
      id: `${laneId}-attach-evidence-hashes`,
      order: 4,
      required: true,
      status: "blocked-until-runtime-evidence",
      instruction: "Attach only evidence and rollback hashes matching the template.",
      outwardActionAllowed: false
    },
    {
      id: `${laneId}-review-before-state-change`,
      order: 5,
      required: true,
      status: "blocked-until-review",
      instruction: "Review evidence before any certification state change or final completion claim.",
      outwardActionAllowed: false
    }
  ];
  const checklistReady = template.templateReady === true &&
    gateLane.preExecutionChecksPassed === true &&
    candidate.verificationPassed === true &&
    executionGate.executionAllowed === false &&
    templates.executionAllowed === false &&
    finalReadiness.finalGoalComplete === false;
  const candidateHash = sha256(JSON.stringify({
    laneId: candidate.laneId || laneId,
    approvalLockHash: candidate.approvalLockHash || "",
    approvalTextHash: candidate.approvalTextHash || ""
  }));

  return {
    laneId,
    targetGap,
    riskTier: "T3",
    checklistReady,
    candidateHash,
    approvalLockHash: candidate.approvalLockHash || "",
    approvalTextHashPresent: Boolean(candidate.approvalTextHash),
    executionGateHash: executionGate.executionGateHash || "",
    templateBundleHash: templates.templateBundleHash || "",
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    manualSteps,
    evidenceChecklist,
    rollbackChecklist,
    blockedActions: [
      "provider-call",
      "managed-database-connection",
      "deployment",
      "billing-action",
      "approval-recording",
      "certification-state-change",
      "final-completion-claim"
    ]
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function defaultFinalReadiness() {
  const persistedReadiness = readJson("qa-artifacts/phase3n-final-delivery-readiness.json");
  if (persistedReadiness.blockedByT3 === true && persistedReadiness.finalGoalComplete === false) {
    return persistedReadiness;
  }
  const completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json");
  const openGaps = completionAudit.openCertificationGaps || [];
  return finalDeliveryReadiness({
    completionAudit,
    overview: {
      localEvidencePassed: Boolean(completionAudit.localEvidencePassed),
      openCertificationGaps: openGaps
    }
  });
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeT3OperatorChecklist();
  console.log(`T3 operator checklist written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
