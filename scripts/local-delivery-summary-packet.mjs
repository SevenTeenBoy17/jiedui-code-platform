import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryEvidenceNavigator } from "./delivery-evidence-navigator.mjs";
import { userAcceptanceRehearsal } from "./user-acceptance-rehearsal.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4e-local-delivery-summary-packet.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4e-local-delivery-summary-packet.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4d-delivery-evidence-navigator.json",
  "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
  "qa-artifacts/phase4b-certification-blocker-board.json",
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json"
];

export function localDeliverySummaryPacket({
  generatedAt = new Date().toISOString(),
  evidenceNavigator = readJson("qa-artifacts/phase4d-delivery-evidence-navigator.json"),
  userAcceptance = readJson("qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
  blockerBoard = readJson("qa-artifacts/phase4b-certification-blocker-board.json"),
  finalAcceptance = readJson("qa-artifacts/phase4a-final-acceptance-matrix.json"),
  consistencySentinel = readJson("qa-artifacts/phase3z-delivery-consistency-sentinel.json"),
  visualStoryboard = readJson("qa-artifacts/phase3s-visual-qa-storyboard.json"),
  agenticReplay = readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const navigator = hasStatus(evidenceNavigator) ? evidenceNavigator : deliveryEvidenceNavigator();
  const uat = hasStatus(userAcceptance) ? userAcceptance : userAcceptanceRehearsal();
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const provedCheckIds = provedIds(agenticAudit);
  const provedCheckCount = Math.max(
    Number(agenticAudit.provedCheckCount || 0),
    provedCheckIds.size,
    Number(agenticReplay.provedCheckCount || 0)
  );
  const localRequirementCount = Number(completionAudit.localRequirementCount || 0);
  const openGaps = normalizeGaps(navigator.openCertificationGaps || uat.openCertificationGaps || blockerBoard.openCertificationGaps || completionAudit.openCertificationGaps || []);

  const sections = [
    summarySection({
      id: "product-scope-summary",
      title: "Product scope and model routing",
      result: "Local full-stack education platform evidence is review-ready with coding-model and image-model separation preserved.",
      checks: [
        finalAcceptance.status === "final-acceptance-matrix-ready-open-t3",
        finalAcceptance.localAcceptancePassed === true,
        navigator.status === "delivery-evidence-navigator-ready-open-t3"
      ],
      evidenceIds: ["final-acceptance-matrix", "delivery-evidence-navigator"]
    }),
    summarySection({
      id: "student-acceptance-summary",
      title: "Student acceptance",
      result: "Student login, coding, AI hint, sandbox final-value wait, self-check, and submission path are locally rehearsed.",
      checks: [
        uat.rehearsals?.some((item) => item.id === "student-learning-rehearsal" && item.localReady === true),
        provedCheckIds.has("round-1-terminal-sandbox")
      ],
      evidenceIds: ["student-learning-rehearsal", "round-1-terminal-sandbox"]
    }),
    summarySection({
      id: "teacher-management-summary",
      title: "Teacher management",
      result: "Teacher dashboard, review queue, feedback, class analytics, and export-ready management evidence are locally rehearsed.",
      checks: [
        uat.rehearsals?.some((item) => item.id === "teacher-management-rehearsal" && item.localReady === true),
        provedCheckIds.has("round-2-teacher-review-final")
      ],
      evidenceIds: ["teacher-management-rehearsal", "round-2-teacher-review-final"]
    }),
    summarySection({
      id: "research-delivery-summary",
      title: "Research delivery",
      result: "Research export, artifact navigation, consistency, completion audit, and handoff evidence are locally consolidated.",
      checks: [
        consistencySentinel.consistencyPassed === true,
        localRequirementCount >= 45,
        navigator.localNavigationPassed === true
      ],
      evidenceIds: ["delivery-consistency-sentinel", "completion-audit", "delivery-evidence-navigator"]
    }),
    summarySection({
      id: "visual-agentic-qa-summary",
      title: "Visual and agentic QA",
      result: "Visual storyboard, three-round click replay, and agentic QA are locally verified.",
      checks: [
        visualStoryboard.status === "visual-storyboard-ready-open-t3",
        Number(agenticReplay.clickRoundCount || 0) >= 3,
        provedCheckCount >= 66
      ],
      evidenceIds: ["visual-storyboard", "agentic-replay", "agentic-audit"]
    }),
    summarySection({
      id: "open-t3-gap-summary",
      title: "Open T3 certification gaps",
      result: "Runtime/container, managed database, and external provider certification remain open and approval-gated.",
      checks: [
        blockerBoard.status === "certification-blocker-board-ready-open-t3",
        Number(blockerBoard.closedBlockerCount || 0) === 0,
        openGaps.length === 3
      ],
      evidenceIds: ["certification-blocker-board", "open-certification-gaps"]
    })
  ];

  const readySummarySectionCount = sections.filter((item) => item.localReady).length;
  const localSummaryPassed =
    sections.length === 6 &&
    readySummarySectionCount === 6 &&
    localRequirementCount >= 45 &&
    provedCheckCount >= 66 &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localSummaryPassed
    ? "local-delivery-summary-ready-open-t3"
    : "local-delivery-summary-needs-local-evidence";
  const summaryHash = sha256(JSON.stringify({
    status,
    sections: sections.map((item) => [item.id, item.localReady, item.status]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4E",
    generatedAt,
    status,
    finalGoalComplete: false,
    summaryPacketOnly: true,
    localSummaryPassed,
    readyForHumanDelivery: localSummaryPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    summarySectionCount: sections.length,
    readySummarySectionCount,
    blockedSummarySectionCount: sections.length - readySummarySectionCount,
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    evidenceFileCount: evidenceFiles.length,
    summaryHash,
    sections,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      evidenceNavigator: {
        status: navigator.status || "unknown",
        localNavigationPassed: navigator.localNavigationPassed === true,
        finalGoalComplete: Boolean(navigator.finalGoalComplete)
      },
      userAcceptance: {
        status: uat.status || "unknown",
        localUserAcceptancePassed: uat.localUserAcceptancePassed === true,
        finalGoalComplete: Boolean(uat.finalGoalComplete)
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount,
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
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
      providerResponsesReturned: false,
      databaseConnectionStringsReturned: false,
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

export function writeLocalDeliverySummaryPacket(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = localDeliverySummaryPacket(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliverySummaryPacketMarkdown(report), "utf8");
  report = localDeliverySummaryPacket(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliverySummaryPacketMarkdown(report), "utf8");
  return report;
}

export function renderLocalDeliverySummaryPacketMarkdown(report) {
  const rows = report.sections
    .map((item) => `| ${item.id} | ${item.status} | ${item.localReady ? "yes" : "no"} | ${item.result} |`)
    .join("\n");

  return `# Phase 4E Local Delivery Summary Packet

Generated: ${report.generatedAt}

Status: **${report.status}**

Summary packet only: **${report.summaryPacketOnly ? "yes" : "no"}**

Local summary passed: **${report.localSummaryPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Summary hash:

\`\`\`text
${report.summaryHash}
\`\`\`

| Section | Status | Local ready | Result |
|---|---|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a local delivery summary only.
- It does not return evidence bodies, screenshots, approval text, secrets, provider responses, database connection strings, review command output, deployment state, certification execution, or final completion.
`;
}

function summarySection({ id, title, result, checks, evidenceIds }) {
  const localReady = checks.every(Boolean);
  return {
    id,
    title,
    result,
    status: localReady ? "ready-local" : "needs-local-evidence",
    localReady,
    evidenceIds,
    blockedByT3: true,
    executionAllowed: false,
    contentReturned: false,
    finalGoalComplete: false
  };
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

function provedIds(audit) {
  const rows = Array.isArray(audit.completionMatrix)
    ? audit.completionMatrix
    : (Array.isArray(audit.checks) ? audit.checks : []);
  return new Set(rows.filter((item) => item.status === "proved").map((item) => item.id));
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
  const report = writeLocalDeliverySummaryPacket();
  console.log(`Local delivery summary packet written: ${report.status} (${report.summaryHash})`);
}
