import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finalAcceptanceMatrix } from "./final-acceptance-matrix.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4b-certification-blocker-board.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4b-certification-blocker-board.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
  "qa-artifacts/phase3w-t3-run-packet-verifier.json",
  "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
  "qa-artifacts/phase3p-t3-operator-checklist.json",
  "qa-artifacts/phase3q-t3-operator-transcript-validator.json",
  "qa-artifacts/phase3u-t3-certification-next-actions.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/QA_REPORT.md"
];

const GAP_LANES = [
  { id: "container-runtime-certification", acceptanceRowId: "runtime-container-certification", laneId: "runtime", title: "Certified runtime/container boundary" },
  { id: "managed-database-certification", laneId: "database", title: "Managed database certification" },
  { id: "external-provider-certification", laneId: "provider", title: "External provider certification" }
];

export function certificationBlockerBoard({
  generatedAt = new Date().toISOString(),
  finalAcceptance = readJson("qa-artifacts/phase4a-final-acceptance-matrix.json"),
  runPackets = readJson("qa-artifacts/phase3v-t3-single-lane-run-packets.json"),
  runPacketVerifier = readJson("qa-artifacts/phase3w-t3-run-packet-verifier.json"),
  evidenceTemplates = readJson("qa-artifacts/phase3o-t3-evidence-bundle-templates.json"),
  operatorChecklist = readJson("qa-artifacts/phase3p-t3-operator-checklist.json"),
  transcriptValidator = readJson("qa-artifacts/phase3q-t3-operator-transcript-validator.json"),
  nextActions = readJson("qa-artifacts/phase3u-t3-certification-next-actions.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const acceptance = hasStatus(finalAcceptance) ? finalAcceptance : finalAcceptanceMatrix();
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const packets = Array.isArray(runPackets.runPackets) ? runPackets.runPackets : [];
  const verifications = Array.isArray(runPacketVerifier.packetVerifications) ? runPacketVerifier.packetVerifications : [];
  const templates = Array.isArray(evidenceTemplates.laneTemplates) ? evidenceTemplates.laneTemplates : [];
  const checklists = Array.isArray(operatorChecklist.laneChecklists) ? operatorChecklist.laneChecklists : [];
  const actions = Array.isArray(nextActions.laneActions) ? nextActions.laneActions : [];
  const acceptanceRows = Array.isArray(acceptance.rows) ? acceptance.rows : [];
  const openGaps = normalizeGaps(
    acceptance.openCertificationGaps ||
    runPackets.openCertificationGaps ||
    nextActions.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );

  const blockers = GAP_LANES.map((gap) => {
    const gapInfo = openGaps.find((item) => item.id === gap.id) || { id: gap.id, status: "open", riskTier: "T3" };
    const packet = packets.find((item) => item.laneId === gap.laneId || item.targetGap === gap.id) || {};
    const verification = verifications.find((item) => item.laneId === gap.laneId || item.targetGap === gap.id) || {};
    const template = templates.find((item) => item.laneId === gap.laneId || item.targetGap === gap.id) || {};
    const checklist = checklists.find((item) => item.laneId === gap.laneId || item.targetGap === gap.id) || {};
    const action = actions.find((item) => item.laneId === gap.laneId || item.targetGap === gap.id) || {};
    const acceptanceRow = acceptanceRows.find((item) => item.id === gap.id || item.id === gap.acceptanceRowId) || {};
    const evidenceNeededCount = Number(packet.evidenceIds?.length || template.evidenceItems?.length || checklist.evidenceChecklist?.length || 5);
    const rollbackNeededCount = Number(packet.rollbackIds?.length || template.rollbackResults?.length || checklist.rollbackChecklist?.length || 3);
    const packetReady = packet.packetReady === true;
    const verifierReady = verification.packetReady === true && verification.stateFlagsSafe === true && verification.secretExposure !== true && verification.prohibitedContentField !== true;
    const templateReady = template.templateReady === true;
    const checklistReady = checklist.checklistReady === true;
    const stateFlagsSafe =
      gapInfo.status === "open" &&
      acceptanceRow.status === "blocked-t3" &&
      acceptanceRow.passed === true &&
      packet.executionAllowed !== true &&
      packet.externalActionsExecuted !== true &&
      packet.certificationStateChanged !== true &&
      verification.approvalRecorded !== true &&
      verification.executionAllowed !== true &&
      template.executionAllowed !== true &&
      checklist.executionAllowed !== true;

    return {
      id: gap.id,
      laneId: gap.laneId,
      title: gap.title,
      riskTier: "T3",
      status: "open",
      approvalRequired: true,
      singleLaneOnly: true,
      cannotAutoRun: true,
      packetReady,
      verifierReady,
      templateReady,
      checklistReady,
      stateFlagsSafe,
      localReady: [packetReady, verifierReady, templateReady, checklistReady, stateFlagsSafe].every(Boolean),
      approved: false,
      approvalRecorded: false,
      executionAllowed: false,
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false,
      evidenceNeededCount,
      rollbackNeededCount,
      packetHash: typeof packet.packetHash === "string" ? packet.packetHash : "",
      nextActionId: String(action.nextApprovedActionId || packet.nextApprovedActionId || `${gap.laneId}-approved-certification-run`),
      nextAction: String(gapInfo.nextAction || action.nextApprovedAction || packet.nextApprovedAction || "Explicit approval and runtime evidence required.")
    };
  });

  const readyBlockerCount = blockers.filter((item) => item.localReady).length;
  const closedBlockerCount = blockers.filter((item) => item.status !== "open").length;
  const localBoardPassed =
    acceptance.localAcceptancePassed === true &&
    acceptance.finalGoalComplete === false &&
    acceptance.readyForProductionRelease === false &&
    blockers.length === 3 &&
    readyBlockerCount === 3 &&
    closedBlockerCount === 0 &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localBoardPassed
    ? "certification-blocker-board-ready-open-t3"
    : "certification-blocker-board-needs-local-evidence";
  const boardHash = sha256(JSON.stringify({
    status,
    blockers: blockers.map((item) => [item.id, item.status, item.localReady, item.packetHash]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    finalGoalComplete: false
  }));

  return {
    phase: "4B",
    generatedAt,
    status,
    finalGoalComplete: false,
    blockerBoardOnly: true,
    localBoardPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    openT3GapCount: openGaps.length,
    contentReturned: false,
    blockerCount: blockers.length,
    readyBlockerCount,
    closedBlockerCount,
    laneTrackCount: blockers.length,
    nextActionCount: blockers.length,
    evidenceFileCount: evidenceFiles.length,
    boardHash,
    blockers,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      finalAcceptance: {
        status: acceptance.status || "unknown",
        localAcceptancePassed: acceptance.localAcceptancePassed === true,
        finalGoalComplete: Boolean(acceptance.finalGoalComplete)
      },
      runPackets: {
        status: runPackets.status || "unknown",
        readyPacketCount: Number(runPackets.readyPacketCount || 0),
        executionAllowed: runPackets.executionAllowed === true
      },
      verifier: {
        status: runPacketVerifier.status || "unknown",
        readyPacketVerificationCount: Number(runPacketVerifier.readyPacketVerificationCount || 0),
        executionAllowed: runPacketVerifier.executionAllowed === true
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0)
      },
      agenticAudit: {
        verdict: agenticAudit.verdict || "unknown",
        provedCheckCount: countProved(agenticAudit)
      }
    },
    guardrails: {
      contentReturned: false,
      artifactBodyContentReturned: false,
      evidenceBodyContentReturned: false,
      screenshotBytesReturned: false,
      approvalTextReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      reviewCommandsExecuted: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      approvalRecorded: false,
      certificationExecution: false,
      certificationStateChanged: false,
      productionRelease: false,
      finalCompletionClaimed: false
    }
  };
}

export function writeCertificationBlockerBoard(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = certificationBlockerBoard(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderCertificationBlockerBoardMarkdown(report), "utf8");
  report = certificationBlockerBoard(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderCertificationBlockerBoardMarkdown(report), "utf8");
  return report;
}

export function renderCertificationBlockerBoardMarkdown(report) {
  const blockerRows = report.blockers
    .map((item) => `| ${item.id} | ${item.laneId} | ${item.status} | ${item.localReady ? "yes" : "no"} | ${item.evidenceNeededCount} / ${item.rollbackNeededCount} | ${item.nextActionId} |`)
    .join("\n");

  return `# Phase 4B Certification Blocker Board

Generated: ${report.generatedAt}

Status: **${report.status}**

Blocker board only: **${report.blockerBoardOnly ? "yes" : "no"}**

Local board passed: **${report.localBoardPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Board hash:

\`\`\`text
${report.boardHash}
\`\`\`

| Blocker | Lane | Status | Local ready | Evidence / rollback | Next action id |
|---|---|---|---:|---:|---|
${blockerRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This board is a local blocker map only.
- It does not record approval, execute certification, deploy, call providers, connect managed databases, return evidence bodies, or claim final completion.
`;
}

function normalizeGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : [])
    .filter((gap) => gap && typeof gap === "object")
    .map((gap) => ({
      id: String(gap.id || "unknown-gap"),
      title: String(gap.title || gap.id || "Open T3 gap"),
      riskTier: "T3",
      status: "open",
      issue: String(gap.issue || gap.remainingWork || gap.nextAction || "T3 approval and evidence are still required."),
      nextAction: String(gap.nextAction || gap.remainingWork || gap.issue || "Run one explicitly approved T3 certification lane with rollback and evidence review.")
    }));
}

function evidenceFile(path) {
  const exists = existsSync(path);
  if (!exists) return { path, exists, sizeBytes: 0, sha256: null };
  const buffer = readFileSync(path);
  return {
    path,
    exists,
    sizeBytes: statSync(path).size,
    sha256: sha256(buffer)
  };
}

function countProved(audit) {
  const rows = Array.isArray(audit.completionMatrix)
    ? audit.completionMatrix
    : (Array.isArray(audit.checks) ? audit.checks : []);
  return Number(audit.provedCheckCount || 0) || rows.filter((item) => item.status === "proved").length;
}

function hasStatus(value) {
  return value && typeof value === "object" && typeof value.status === "string";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = writeCertificationBlockerBoard();
  console.log(`Certification blocker board written: ${report.status} (${report.boardHash})`);
}
