import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryEvidenceNavigator } from "./delivery-evidence-navigator.mjs";
import { deliveryLaunchGuide } from "./delivery-launch-guide.mjs";
import { deliveryReviewerCockpit } from "./delivery-reviewer-cockpit.mjs";
import { localDeliverySummaryPacket } from "./local-delivery-summary-packet.mjs";
import { userAcceptanceRehearsal } from "./user-acceptance-rehearsal.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4f-local-delivery-handoff-brief.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4f-local-delivery-handoff-brief.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4e-local-delivery-summary-packet.json",
  "qa-artifacts/phase4d-delivery-evidence-navigator.json",
  "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json"
];

const LOCAL_COMMANDS = [
  ["start-local-fullstack", "npm.cmd run fullstack", "Start the local web/API review server."],
  ["verify-handoff-brief", "npm.cmd run qa:handoff-brief", "Regenerate and verify this handoff brief."],
  ["verify-summary", "npm.cmd run qa:local-summary-packet", "Verify the Phase 4E local delivery summary packet."],
  ["verify-api-report", "$env:PORT='3252'; npm.cmd run qa:api", "Verify fullstack API and report fields."],
  ["verify-agentic", "npm.cmd run qa:agentic", "Run the agentic internal QA audit."],
  ["verify-completion", "npm.cmd run qa:completion", "Run the completion audit and open-gap matrix."]
];

export function localDeliveryHandoffBrief({
  generatedAt = new Date().toISOString(),
  localSummary = readJson("qa-artifacts/phase4e-local-delivery-summary-packet.json"),
  evidenceNavigator = readJson("qa-artifacts/phase4d-delivery-evidence-navigator.json"),
  userAcceptance = readJson("qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
  launchGuide = readJson("qa-artifacts/phase3y-delivery-launch-guide.json"),
  reviewerCockpit = readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const summary = hasStatus(localSummary) ? localSummary : localDeliverySummaryPacket();
  const navigator = hasStatus(evidenceNavigator) ? evidenceNavigator : deliveryEvidenceNavigator();
  const uat = hasStatus(userAcceptance) ? userAcceptance : userAcceptanceRehearsal();
  const launch = hasStatus(launchGuide) ? launchGuide : deliveryLaunchGuide();
  const cockpit = hasStatus(reviewerCockpit) ? reviewerCockpit : deliveryReviewerCockpit();
  const localCommands = LOCAL_COMMANDS.map(([id, command, purpose]) => ({
    id,
    command,
    purpose,
    riskTier: "T1",
    localOnly: true,
    requiresSecret: false,
    outwardAction: false,
    executionAllowed: false,
    executed: false,
    outputReturned: false
  }));
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const provedCheckIds = provedIds(agenticAudit);
  const provedCheckCount = Math.max(
    Number(summary.provedCheckCount || 0),
    Number(agenticAudit.provedCheckCount || 0),
    provedCheckIds.size
  );
  const localRequirementCount = Math.max(
    Number(summary.localRequirementCount || 0),
    Number(completionAudit.localRequirementCount || 0)
  );
  const openGaps = normalizeGaps(
    summary.openCertificationGaps ||
    navigator.openCertificationGaps ||
    uat.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );

  const sections = [
    briefSection({
      id: "handoff-entrypoints",
      title: "Handoff entrypoints",
      purpose: "Surface the local app, research page, summary packet, and handoff route entrypoints.",
      result: "Local user review entrypoints are ready as metadata.",
      checks: [
        summary.status === "local-delivery-summary-ready-open-t3",
        navigator.status === "delivery-evidence-navigator-ready-open-t3",
        launch.status === "delivery-launch-guide-ready-open-t3"
      ],
      evidenceIds: ["local-delivery-summary-packet", "delivery-evidence-navigator", "delivery-launch-guide"]
    }),
    briefSection({
      id: "local-run-commands",
      title: "Local run commands",
      purpose: "List the local commands a reviewer can run without executing or returning command output.",
      result: "Local review commands are listed with execution disabled.",
      checks: [
        localCommands.length >= 5,
        localCommands.every((item) => item.executionAllowed === false && item.executed === false && item.outputReturned === false)
      ],
      evidenceIds: ["qa-handoff-brief", "qa-local-summary", "qa-api", "qa-agentic", "qa-completion"]
    }),
    briefSection({
      id: "student-teacher-review",
      title: "Student and teacher review",
      purpose: "Confirm the student learning and teacher management review paths are locally rehearsed.",
      result: "Student and teacher acceptance paths remain ready for local user review.",
      checks: [
        uat.localUserAcceptancePassed === true,
        uat.rehearsals?.some((item) => item.id === "student-learning-rehearsal" && item.localReady === true),
        uat.rehearsals?.some((item) => item.id === "teacher-management-rehearsal" && item.localReady === true)
      ],
      evidenceIds: ["student-learning-rehearsal", "teacher-management-rehearsal"]
    }),
    briefSection({
      id: "qa-evidence",
      title: "QA evidence",
      purpose: "Summarize local QA coverage counts without returning logs or artifact bodies.",
      result: "Local QA evidence remains sufficient for user review.",
      checks: [
        localRequirementCount >= 46,
        provedCheckCount >= 67,
        cockpit.readyForHumanReview === true
      ],
      evidenceIds: ["completion-audit", "agentic-audit", "reviewer-cockpit"]
    }),
    briefSection({
      id: "delivery-artifacts",
      title: "Delivery artifacts",
      purpose: "List hashed local evidence artifacts without returning artifact contents.",
      result: "Delivery artifacts are present and hashed.",
      checks: [
        evidenceFiles.length >= 8,
        evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || "")),
        /^[a-f0-9]{64}$/.test(summary.summaryHash || "")
      ],
      evidenceIds: ["phase4e-summary", "phase4d-navigator", "phase3x-cockpit", "phase2s-completion"]
    }),
    briefSection({
      id: "t3-boundary",
      title: "T3 boundary",
      purpose: "Keep production release, certification execution, approvals, and final completion blocked.",
      result: "Three certification lanes remain open and approval-gated.",
      checks: [
        openGaps.length === 3,
        summary.readyForProductionRelease === false,
        summary.finalGoalComplete === false
      ],
      evidenceIds: ["open-certification-gaps", "blocked-production-release", "blocked-final-completion"]
    })
  ];

  const readyBriefSectionCount = sections.filter((item) => item.localReady).length;
  const localHandoffPassed =
    sections.length === 6 &&
    readyBriefSectionCount === 6 &&
    localCommands.length >= 5 &&
    localRequirementCount >= 46 &&
    provedCheckCount >= 67 &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localHandoffPassed
    ? "local-delivery-handoff-brief-ready-open-t3"
    : "local-delivery-handoff-brief-needs-local-evidence";
  const briefHash = sha256(JSON.stringify({
    status,
    sections: sections.map((item) => [item.id, item.localReady, item.status]),
    commands: localCommands.map((item) => [item.id, item.executionAllowed, item.executed]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4F",
    generatedAt,
    status,
    finalGoalComplete: false,
    handoffBriefOnly: true,
    localHandoffPassed,
    readyForUserReview: localHandoffPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    briefSectionCount: sections.length,
    readyBriefSectionCount,
    blockedBriefSectionCount: sections.length - readyBriefSectionCount,
    localCommandCount: localCommands.length,
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    evidenceFileCount: evidenceFiles.length,
    briefHash,
    sections,
    localCommands,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      localSummary: {
        status: summary.status || "unknown",
        localSummaryPassed: summary.localSummaryPassed === true,
        finalGoalComplete: Boolean(summary.finalGoalComplete)
      },
      evidenceNavigator: {
        status: navigator.status || "unknown",
        localNavigationPassed: navigator.localNavigationPassed === true,
        finalGoalComplete: Boolean(navigator.finalGoalComplete)
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
      commandOutputReturned: false,
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

export function writeLocalDeliveryHandoffBrief(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = localDeliveryHandoffBrief(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliveryHandoffBriefMarkdown(report), "utf8");
  report = localDeliveryHandoffBrief(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliveryHandoffBriefMarkdown(report), "utf8");
  return report;
}

export function renderLocalDeliveryHandoffBriefMarkdown(report) {
  const sectionRows = report.sections
    .map((item) => `| ${item.id} | ${item.status} | ${item.localReady ? "yes" : "no"} | ${item.result} |`)
    .join("\n");
  const commandRows = report.localCommands
    .map((item) => `| ${item.id} | ${item.command} | ${item.executed ? "yes" : "no"} | ${item.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 4F Local Delivery Handoff Brief

Generated: ${report.generatedAt}

Status: **${report.status}**

Handoff brief only: **${report.handoffBriefOnly ? "yes" : "no"}**

Local handoff passed: **${report.localHandoffPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Brief hash:

\`\`\`text
${report.briefHash}
\`\`\`

| Section | Status | Local ready | Result |
|---|---|---:|---|
${sectionRows}

| Command | Local command | Executed | Execution allowed |
|---|---|---:|---:|
${commandRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a local handoff brief only.
- It does not execute commands, return command output, return artifact bodies, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function briefSection({ id, title, purpose, result, checks, evidenceIds }) {
  const localReady = checks.every(Boolean);
  return {
    id,
    title,
    purpose,
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
  const report = writeLocalDeliveryHandoffBrief();
  console.log(`Local delivery handoff brief written: ${report.status} (${report.briefHash})`);
}
