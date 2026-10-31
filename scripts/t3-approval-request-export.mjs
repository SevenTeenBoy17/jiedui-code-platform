import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { certificationOverview, loadCompletionAudit } from "./certification-overview.mjs";
import { t3ApprovalPacket } from "./t3-approval-packet.mjs";
import { t3CertificationPackage } from "./t3-certification-package.mjs";
import { t3CertificationPreflight } from "./t3-certification-preflight.mjs";
import { t3DryRunRehearsal } from "./t3-dry-run-rehearsal.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3g-t3-approval-request-export.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3g-t3-approval-request-export.md";
const COMPLETION_AUDIT_PATH = "qa-artifacts/phase2s-completion-audit.json";

export function buildT3ApprovalRequestExport({
  approvalPacket = {},
  rehearsal = {},
  generatedAt = new Date().toISOString(),
  outputJsonPath = DEFAULT_OUTPUT_JSON,
  outputMarkdownPath = DEFAULT_OUTPUT_MARKDOWN
} = {}) {
  const requests = (rehearsal.lanes || []).map((lane) => approvalRequest(lane, approvalPacket));
  const artifactManifest = [
    outputJsonPath,
    outputMarkdownPath,
    "specs/phase3g-t3-approval-request-export-contract.md",
    "scripts/t3-approval-request-export.mjs",
    "tests/t3-approval-request-export.mjs"
  ];

  return {
    phase: "3G",
    generatedAt,
    status: "approval-request-export-ready",
    finalGoalComplete: false,
    exportOnly: true,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    executionAllowed: false,
    approvalPacketStatus: approvalPacket.status || "missing",
    rehearsalStatus: rehearsal.status || "missing",
    approvalRequestCount: requests.length,
    requestReadyCount: requests.filter((request) => request.requestReady).length,
    requests,
    artifactManifest,
    artifactCount: artifactManifest.length,
    artifactInventory: artifactManifest.map(inspectArtifact),
    guardrails: {
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
    nextStep: "A human must copy one approvalText sentence into an explicitly approved T3 phase before any certification command or outward action is allowed."
  };
}

export function writeT3ApprovalRequestExport(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const inputs = options.approvalPacket && options.rehearsal
    ? options
    : { ...options, ...defaultApprovalInputs() };

  const report = buildT3ApprovalRequestExport({
    ...inputs,
    outputJsonPath,
    outputMarkdownPath
  });
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalRequestMarkdown(report), "utf8");
  const finalReport = buildT3ApprovalRequestExport({
    ...inputs,
    outputJsonPath,
    outputMarkdownPath
  });
  writeFileSync(outputJsonPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalRequestMarkdown(finalReport), "utf8");
  return finalReport;
}

export function buildDefaultT3ApprovalRequestExport(options = {}) {
  return buildT3ApprovalRequestExport({ ...options, ...defaultApprovalInputs() });
}

function defaultApprovalInputs() {
  const completionAudit = loadCompletionAudit(COMPLETION_AUDIT_PATH);
  const overview = certificationOverview({ completionAudit });
  const preflight = t3CertificationPreflight({}, { sandboxPolicy: true });
  const t3Package = t3CertificationPackage({ preflight, overview });
  const approvalPacket = t3ApprovalPacket({ t3Package });
  const rehearsal = t3DryRunRehearsal({ approvalPacket });
  return { approvalPacket, rehearsal };
}

export function renderT3ApprovalRequestMarkdown(report) {
  const requestSections = report.requests.map((request) => `## ${request.id}

Target gap: **${request.targetGap}**

Request ready: **${request.requestReady ? "yes" : "no"}**

Approved now: **${request.approved ? "yes" : "no"}**

Execution allowed: **${request.executionAllowed ? "yes" : "no"}**

Approval text:

\`\`\`text
${request.approvalText}
\`\`\`

Local command candidates:

${request.localCommandCandidates.map((command) => `- \`${command}\``).join("\n")}

Rollback summary:

${request.rollbackSummary.map((item) => `- ${escapeMarkdown(item)}`).join("\n")}

Evidence checklist:

${request.evidenceChecklist.map((item) => `- ${escapeMarkdown(item)}`).join("\n")}
`).join("\n");

  return `# Phase 3G T3 Approval Request Export

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Export only: **${report.exportOnly ? "yes" : "no"}**

External actions executed: **${report.externalActionsExecuted ? "yes" : "no"}**

Certification state changed: **${report.certificationStateChanged ? "yes" : "no"}**

Approval requests: **${report.approvalRequestCount}**

Ready requests: **${report.requestReadyCount}**

${requestSections}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is an approval request export, not an approval and not a certification run.
- Copy exactly one approval text into a future approved T3 phase only after reviewing rollback and evidence requirements.
- No secret values, external calls, managed database connections, deployment, billing, or certification execution occurred while generating this export.
`;
}

function approvalRequest(rehearsalLane, approvalPacket) {
  const approvalLane = (approvalPacket.lanes || []).find((lane) => lane.id === rehearsalLane.id) || {};
  const requestReady = Boolean(rehearsalLane.dryRunReady) &&
    approvalLane.approved === false &&
    approvalLane.allowedToRun === false &&
    (rehearsalLane.commandCandidates || []).length >= 3;

  return {
    id: rehearsalLane.id,
    targetGap: rehearsalLane.targetGap,
    riskTier: "T3",
    approvalRequired: true,
    approved: false,
    executionAllowed: false,
    singleLaneOnly: true,
    requestReady,
    approvalText: `I explicitly approve only the ${rehearsalLane.id} T3 certification lane for one bounded non-production run with rollback visible before execution and evidence review required before any completion claim.`,
    localCommandCandidates: rehearsalLane.commandCandidates || [],
    preExecutionChecks: approvalLane.preExecutionChecks || [],
    rollbackSummary: approvalLane.rollbackSummary || [],
    evidenceChecklist: approvalLane.evidenceChecklist || [],
    dryRunChecks: rehearsalLane.checks || [],
    nextApprovedAction: rehearsalLane.nextApprovedAction || approvalLane.remainingWork || "Run only after explicit single-lane approval."
  };
}

function inspectArtifact(path) {
  if (!existsSync(path)) return { path, exists: false, sizeBytes: 0 };
  return { path, exists: true, sizeBytes: statSync(path).size };
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalRequestExport();
  console.log(`T3 approval request export written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; requests=${report.approvalRequestCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
