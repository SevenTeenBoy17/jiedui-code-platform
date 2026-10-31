import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryEvidenceNavigator } from "./delivery-evidence-navigator.mjs";
import { deliveryLaunchGuide } from "./delivery-launch-guide.mjs";
import { localDeliveryHandoffBrief } from "./local-delivery-handoff-brief.mjs";
import { localDeliverySummaryPacket } from "./local-delivery-summary-packet.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
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
  ["start-fullstack", "npm.cmd run fullstack", "Start the local web/API server for manual review."],
  ["verify-quickstart", "npm.cmd run qa:quickstart-bundle", "Regenerate and verify this quickstart bundle."],
  ["verify-handoff", "npm.cmd run qa:handoff-brief", "Verify the Phase 4F handoff brief."],
  ["verify-api", "$env:PORT='3260'; npm.cmd run qa:api", "Verify fullstack API and report fields."],
  ["verify-smoke", "npm.cmd run test", "Run static smoke checks."],
  ["verify-three-rounds", "npm.cmd run qa", "Run student, teacher, and research QA rounds."],
  ["verify-agentic", "npm.cmd run qa:agentic", "Run the agentic internal QA audit."],
  ["verify-completion", "npm.cmd run qa:completion", "Run the completion audit and open-gap matrix."]
];

const LOCAL_ROUTES = [
  ["student-workspace", "http://127.0.0.1:3000/#student", "Inspect student pair-programming and AI tutor workflow."],
  ["teacher-dashboard", "http://127.0.0.1:3000/#teacher", "Inspect teacher review queue and management workflow."],
  ["research-delivery", "http://127.0.0.1:3000/#research", "Inspect research evidence and delivery panels."],
  ["quickstart-endpoint", "http://127.0.0.1:3000/api/delivery/quickstart-bundle", "Inspect this quickstart metadata endpoint."],
  ["handoff-brief-endpoint", "http://127.0.0.1:3000/api/delivery/handoff-brief", "Inspect the Phase 4F handoff brief metadata."],
  ["completion-audit-artifact", "qa-artifacts/phase2s-completion-audit.json", "Inspect local completion matrix artifact metadata."]
];

export function localDeliveryQuickstartBundle({
  generatedAt = new Date().toISOString(),
  handoffBrief = readJson("qa-artifacts/phase4f-local-delivery-handoff-brief.json"),
  localSummary = readJson("qa-artifacts/phase4e-local-delivery-summary-packet.json"),
  evidenceNavigator = readJson("qa-artifacts/phase4d-delivery-evidence-navigator.json"),
  launchGuide = readJson("qa-artifacts/phase3y-delivery-launch-guide.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const handoff = hasStatus(handoffBrief) ? handoffBrief : localDeliveryHandoffBrief();
  const summary = hasStatus(localSummary) ? localSummary : localDeliverySummaryPacket();
  const navigator = hasStatus(evidenceNavigator) ? evidenceNavigator : deliveryEvidenceNavigator();
  const launch = hasStatus(launchGuide) ? launchGuide : deliveryLaunchGuide();
  const localCommands = LOCAL_COMMANDS.map(([id, command, purpose], index) => ({
    id,
    order: index + 1,
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
  const localRoutes = LOCAL_ROUTES.map(([id, route, purpose], index) => ({
    id,
    order: index + 1,
    route,
    purpose,
    localOnly: true,
    requiresSecret: false,
    outwardAction: false,
    contentReturned: false
  }));
  const quickstartSteps = [
    quickstartStep(1, "confirm-local-only-boundary", "Confirm this quickstart is local-only and stops before T3 execution.", ["handoff-brief", "open-t3-gaps"]),
    quickstartStep(2, "start-local-server", "Start the local fullstack server manually with the listed command.", ["start-fullstack"]),
    quickstartStep(3, "inspect-student-workflow", "Open the student workspace and verify the student pair-programming surface.", ["student-workspace"]),
    quickstartStep(4, "inspect-teacher-workflow", "Open the teacher dashboard and verify teacher review/management surfaces.", ["teacher-dashboard"]),
    quickstartStep(5, "inspect-research-delivery", "Open the research delivery page and inspect delivery evidence panels.", ["research-delivery"]),
    quickstartStep(6, "run-local-verification", "Run focused and regression QA commands manually as needed.", ["verify-quickstart", "verify-api", "verify-agentic", "verify-completion"]),
    quickstartStep(7, "stop-before-t3", "Do not run runtime, managed database, provider, deploy, approval, or billing actions without explicit approval.", ["open-certification-gaps"])
  ];
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const provedCheckIds = provedIds(agenticAudit);
  const localRequirementCount = Math.max(
    Number(handoff.localRequirementCount || 0),
    Number(summary.localRequirementCount || 0),
    Number(completionAudit.localRequirementCount || 0)
  );
  const provedCheckCount = Math.max(
    Number(handoff.provedCheckCount || 0),
    Number(summary.provedCheckCount || 0),
    Number(agenticAudit.provedCheckCount || 0),
    provedCheckIds.size
  );
  const openGaps = normalizeGaps(
    handoff.openCertificationGaps ||
    summary.openCertificationGaps ||
    navigator.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const localQuickstartPassed =
    quickstartSteps.length === 7 &&
    quickstartSteps.every((step) => step.localReady && step.executionAllowed === false && step.executed === false && step.outputReturned === false) &&
    localCommands.length >= 8 &&
    localCommands.every((command) => command.executionAllowed === false && command.executed === false && command.outputReturned === false) &&
    localRoutes.length >= 6 &&
    handoff.status === "local-delivery-handoff-brief-ready-open-t3" &&
    summary.status === "local-delivery-summary-ready-open-t3" &&
    navigator.status === "delivery-evidence-navigator-ready-open-t3" &&
    launch.status === "delivery-launch-guide-ready-open-t3" &&
    localRequirementCount >= 47 &&
    provedCheckCount >= 68 &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localQuickstartPassed
    ? "local-delivery-quickstart-ready-open-t3"
    : "local-delivery-quickstart-needs-local-evidence";
  const quickstartHash = sha256(JSON.stringify({
    status,
    steps: quickstartSteps.map((step) => [step.id, step.localReady, step.executionAllowed, step.executed]),
    commands: localCommands.map((command) => [command.id, command.executionAllowed, command.executed]),
    routes: localRoutes.map((route) => [route.id, route.route]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4G",
    generatedAt,
    status,
    finalGoalComplete: false,
    quickstartBundleOnly: true,
    localQuickstartPassed,
    readyForLocalRunbookReview: localQuickstartPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    quickstartStepCount: quickstartSteps.length,
    readyQuickstartStepCount: quickstartSteps.filter((step) => step.localReady).length,
    blockedQuickstartStepCount: quickstartSteps.filter((step) => !step.localReady).length,
    localCommandCount: localCommands.length,
    localRouteCount: localRoutes.length,
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    evidenceFileCount: evidenceFiles.length,
    quickstartHash,
    quickstartSteps,
    localCommands,
    localRoutes,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      handoffBrief: {
        status: handoff.status || "unknown",
        localHandoffPassed: handoff.localHandoffPassed === true,
        finalGoalComplete: Boolean(handoff.finalGoalComplete)
      },
      localSummary: {
        status: summary.status || "unknown",
        localSummaryPassed: summary.localSummaryPassed === true,
        finalGoalComplete: Boolean(summary.finalGoalComplete)
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

export function writeLocalDeliveryQuickstartBundle(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = localDeliveryQuickstartBundle(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliveryQuickstartBundleMarkdown(report), "utf8");
  report = localDeliveryQuickstartBundle(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliveryQuickstartBundleMarkdown(report), "utf8");
  return report;
}

export function renderLocalDeliveryQuickstartBundleMarkdown(report) {
  const stepRows = report.quickstartSteps
    .map((step) => `| ${step.order} | ${step.id} | ${step.status} | ${step.localReady ? "yes" : "no"} |`)
    .join("\n");
  const commandRows = report.localCommands
    .map((command) => `| ${command.order} | ${command.command} | ${command.executed ? "yes" : "no"} | ${command.executionAllowed ? "yes" : "no"} |`)
    .join("\n");
  const routeRows = report.localRoutes
    .map((route) => `| ${route.order} | ${route.route} | ${route.purpose} |`)
    .join("\n");

  return `# Phase 4G Local Delivery Quickstart Bundle

Generated: ${report.generatedAt}

Status: **${report.status}**

Quickstart bundle only: **${report.quickstartBundleOnly ? "yes" : "no"}**

Local quickstart passed: **${report.localQuickstartPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Quickstart hash:

\`\`\`text
${report.quickstartHash}
\`\`\`

| Order | Step | Status | Local ready |
|---:|---|---|---:|
${stepRows}

| Order | Local command | Executed | Execution allowed |
|---:|---|---:|---:|
${commandRows}

| Order | Local route | Purpose |
|---:|---|---|
${routeRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a local quickstart bundle only.
- It does not execute commands, return command output, return artifact bodies, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function quickstartStep(order, id, purpose, evidenceIds) {
  return {
    order,
    id,
    title: id.replaceAll("-", " "),
    purpose,
    status: "ready-local",
    localReady: true,
    evidenceIds,
    riskTier: id === "stop-before-t3" ? "T3-boundary" : "T1",
    localOnly: true,
    executionAllowed: false,
    executed: false,
    outputReturned: false,
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
  const report = writeLocalDeliveryQuickstartBundle();
  console.log(`Local delivery quickstart bundle written: ${report.status} (${report.quickstartHash})`);
}
