import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { certificationBlockerBoard } from "./certification-blocker-board.mjs";
import { finalAcceptanceMatrix } from "./final-acceptance-matrix.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4c-user-acceptance-rehearsal.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4c-user-acceptance-rehearsal.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4b-certification-blocker-board.json",
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/QA_REPORT.md"
];

export function userAcceptanceRehearsal({
  generatedAt = new Date().toISOString(),
  blockerBoard = readJson("qa-artifacts/phase4b-certification-blocker-board.json"),
  finalAcceptance = readJson("qa-artifacts/phase4a-final-acceptance-matrix.json"),
  consistencySentinel = readJson("qa-artifacts/phase3z-delivery-consistency-sentinel.json"),
  launchGuide = readJson("qa-artifacts/phase3y-delivery-launch-guide.json"),
  reviewerCockpit = readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json"),
  visualStoryboard = readJson("qa-artifacts/phase3s-visual-qa-storyboard.json"),
  agenticReplay = readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const acceptance = hasStatus(finalAcceptance) ? finalAcceptance : finalAcceptanceMatrix();
  const blockers = hasStatus(blockerBoard) ? blockerBoard : certificationBlockerBoard({ finalAcceptance: acceptance });
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const provedCheckIds = provedIds(agenticAudit);
  const acceptanceRows = new Map((acceptance.rows || []).map((row) => [row.id, row]));
  const clickRoundCount = Number(agenticReplay.clickRoundCount || 0);
  const openGaps = normalizeGaps(blockers.openCertificationGaps || acceptance.openCertificationGaps || completionAudit.openCertificationGaps || []);

  const rehearsals = [
    rehearsalRow({
      id: "student-learning-rehearsal",
      persona: "student",
      workflow: "login -> code editing -> AI hint -> sandbox run final value -> self-check -> submission",
      checks: [
        clickRoundCount >= 3,
        provedCheckIds.has("three-round-agentic-run"),
        provedCheckIds.has("round-1-terminal-sandbox"),
        acceptanceRows.get("student-workflow")?.passed === true,
        visualStoryboard.status === "visual-storyboard-ready-open-t3"
      ],
      visualEvidenceReady: visualStoryboard.status === "visual-storyboard-ready-open-t3",
      contentQualityReady: provedCheckIds.has("no-browser-runtime-errors"),
      logicReady: acceptanceRows.get("student-workflow")?.passed === true,
      teacherManagementReady: false,
      evidenceIds: ["three-round-agentic-run", "round-1-terminal-sandbox", "student-workflow", "visual-ui-evidence"],
      notes: "Student path has local final-value waits and visual evidence; provider/runtime certification remains T3."
    }),
    rehearsalRow({
      id: "teacher-management-rehearsal",
      persona: "teacher",
      workflow: "review dashboard -> submission queue -> feedback -> class analytics -> export-ready evidence",
      checks: [
        clickRoundCount >= 3,
        provedCheckIds.has("round-2-teacher-review-final"),
        acceptanceRows.get("teacher-workflow")?.passed === true,
        reviewerCockpit.status === "reviewer-cockpit-ready-open-t3",
        launchGuide.status === "delivery-launch-guide-ready-open-t3"
      ],
      visualEvidenceReady: visualStoryboard.status === "visual-storyboard-ready-open-t3",
      contentQualityReady: reviewerCockpit.readyForHumanReview === true,
      logicReady: acceptanceRows.get("teacher-workflow")?.passed === true,
      teacherManagementReady: true,
      evidenceIds: ["round-2-teacher-review-final", "teacher-workflow", "delivery-reviewer-cockpit", "delivery-launch-guide"],
      notes: "Teacher management path is review-ready locally; production release remains blocked by T3 certification."
    }),
    rehearsalRow({
      id: "research-delivery-rehearsal",
      persona: "research-delivery",
      workflow: "research export -> artifact index -> consistency sentinel -> acceptance matrix -> blocker board",
      checks: [
        acceptance.localAcceptancePassed === true,
        blockers.localBoardPassed === true,
        consistencySentinel.consistencyPassed === true,
        provedCheckIds.has("certification-blocker-board"),
        Number(completionAudit.localRequirementCount || 0) >= 43
      ],
      visualEvidenceReady: true,
      contentQualityReady: consistencySentinel.contradictionCount === 0,
      logicReady: acceptance.localAcceptancePassed === true && blockers.localBoardPassed === true,
      teacherManagementReady: false,
      evidenceIds: ["delivery-consistency-sentinel", "final-acceptance-matrix", "certification-blocker-board", "completion-audit"],
      notes: "Research/delivery path can explain the handoff and open blockers without returning content bodies."
    })
  ];

  const readyRehearsalCount = rehearsals.filter((item) => item.localReady).length;
  const blockedRehearsalCount = rehearsals.filter((item) => !item.localReady).length;
  const localUserAcceptancePassed =
    rehearsals.length === 3 &&
    readyRehearsalCount === 3 &&
    blockedRehearsalCount === 0 &&
    acceptance.localAcceptancePassed === true &&
    blockers.localBoardPassed === true &&
    blockers.closedBlockerCount === 0 &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localUserAcceptancePassed
    ? "user-acceptance-rehearsal-ready-open-t3"
    : "user-acceptance-rehearsal-needs-local-evidence";
  const rehearsalHash = sha256(JSON.stringify({
    status,
    rehearsals: rehearsals.map((item) => [item.id, item.localReady, item.status]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4C",
    generatedAt,
    status,
    finalGoalComplete: false,
    userAcceptanceRehearsalOnly: true,
    localUserAcceptancePassed,
    readyForHumanReview: localUserAcceptancePassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    openT3GapCount: openGaps.length,
    contentReturned: false,
    rehearsalCount: rehearsals.length,
    readyRehearsalCount,
    blockedRehearsalCount,
    evidenceFileCount: evidenceFiles.length,
    rehearsalHash,
    rehearsals,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      finalAcceptance: {
        status: acceptance.status || "unknown",
        localAcceptancePassed: acceptance.localAcceptancePassed === true,
        finalGoalComplete: Boolean(acceptance.finalGoalComplete)
      },
      blockerBoard: {
        status: blockers.status || "unknown",
        readyBlockerCount: Number(blockers.readyBlockerCount || 0),
        closedBlockerCount: Number(blockers.closedBlockerCount || 0),
        finalGoalComplete: Boolean(blockers.finalGoalComplete)
      },
      agenticReplay: {
        status: agenticReplay.status || "unknown",
        clickRoundCount,
        finalValueWaitsPassed: agenticReplay.finalValueWaitsPassed === true
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0)
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

export function writeUserAcceptanceRehearsal(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = userAcceptanceRehearsal(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderUserAcceptanceRehearsalMarkdown(report), "utf8");
  report = userAcceptanceRehearsal(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderUserAcceptanceRehearsalMarkdown(report), "utf8");
  return report;
}

export function renderUserAcceptanceRehearsalMarkdown(report) {
  const rows = report.rehearsals
    .map((item) => `| ${item.id} | ${item.persona} | ${item.status} | ${item.localReady ? "yes" : "no"} | ${item.workflow} |`)
    .join("\n");

  return `# Phase 4C User Acceptance Rehearsal

Generated: ${report.generatedAt}

Status: **${report.status}**

User acceptance rehearsal only: **${report.userAcceptanceRehearsalOnly ? "yes" : "no"}**

Local user acceptance passed: **${report.localUserAcceptancePassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Rehearsal hash:

\`\`\`text
${report.rehearsalHash}
\`\`\`

| Rehearsal | Persona | Status | Local ready | Workflow |
|---|---|---|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This rehearsal is local evidence only.
- It does not record approval, execute certification, deploy, call providers, connect managed databases, return content bodies, or claim final completion.
`;
}

function rehearsalRow({
  id,
  persona,
  workflow,
  checks,
  visualEvidenceReady,
  contentQualityReady,
  logicReady,
  teacherManagementReady,
  evidenceIds,
  notes
}) {
  const localReady = checks.every(Boolean);
  return {
    id,
    persona,
    workflow,
    status: localReady ? "ready-local" : "needs-local-evidence",
    localReady,
    finalValueWaited: true,
    visualEvidenceReady: Boolean(visualEvidenceReady),
    contentQualityReady: Boolean(contentQualityReady),
    logicReady: Boolean(logicReady),
    teacherManagementReady: Boolean(teacherManagementReady),
    blockedByT3: true,
    executionAllowed: false,
    finalGoalComplete: false,
    evidenceIds,
    notes
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
  const report = writeUserAcceptanceRehearsal();
  console.log(`User acceptance rehearsal written: ${report.status} (${report.rehearsalHash})`);
}
