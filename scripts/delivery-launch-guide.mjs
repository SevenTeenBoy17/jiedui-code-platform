import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryReleaseCandidate } from "./delivery-release-candidate.mjs";
import { deliveryReviewerCockpit } from "./delivery-reviewer-cockpit.mjs";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3y-delivery-launch-guide.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3y-delivery-launch-guide.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3n-final-delivery-readiness.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/QA_REPORT.md"
];

const REVIEW_COMMANDS = [
  "npm.cmd run fullstack",
  "npm.cmd run qa:launch-guide",
  "npm.cmd run qa:reviewer-cockpit",
  "$env:PORT='3220'; npm.cmd run qa:api",
  "npm.cmd run test",
  "npm.cmd run qa",
  "npm.cmd run qa:agentic",
  "npm.cmd run qa:completion"
];

const REVIEW_ROUTES = [
  "http://127.0.0.1:3000/#research",
  "http://127.0.0.1:3000/#student",
  "http://127.0.0.1:3000/#teacher",
  "http://127.0.0.1:3000/api/delivery/reviewer-cockpit",
  "http://127.0.0.1:3000/api/delivery/launch-guide"
];

export function deliveryLaunchGuide({
  generatedAt = new Date().toISOString(),
  reviewerCockpit = readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json"),
  releaseCandidate = readJson("qa-artifacts/phase3t-delivery-release-candidate.json"),
  finalReadiness = readJson("qa-artifacts/phase3n-final-delivery-readiness.json")
} = {}) {
  const cockpit = hasStatus(reviewerCockpit)
    ? reviewerCockpit
    : deliveryReviewerCockpit();
  const release = hasStatus(releaseCandidate)
    ? releaseCandidate
    : deliveryReleaseCandidate();
  const readiness = hasStatus(finalReadiness)
    ? finalReadiness
    : finalDeliveryReadiness();
  const openCertificationGaps = normalizeGaps(
    cockpit.openCertificationGaps ||
    release.openCertificationGaps ||
    readiness.openCertificationGaps ||
    []
  );
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const reviewCommands = REVIEW_COMMANDS.map((command, index) => ({
    id: `local-command-${index + 1}`,
    command,
    localOnly: true,
    requiresSecret: false,
    outwardAction: false,
    purpose: commandPurpose(command)
  }));
  const reviewRoutes = REVIEW_ROUTES.map((route, index) => ({
    id: `local-route-${index + 1}`,
    route,
    localOnly: true,
    purpose: routePurpose(route)
  }));
  const localEvidenceReady =
    cockpit.status === "reviewer-cockpit-ready-open-t3" &&
    release.readyForHumanReview === true &&
    release.readyForProductionRelease === false &&
    readiness.finalGoalComplete === false &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const readyForLocalReview =
    localEvidenceReady &&
    reviewCommands.length >= 7 &&
    reviewRoutes.length >= 5 &&
    openCertificationGaps.length === 3;
  const status = readyForLocalReview
    ? "delivery-launch-guide-ready-open-t3"
    : "delivery-launch-guide-needs-local-evidence";
  const launchGuideHash = sha256(JSON.stringify({
    status,
    commands: reviewCommands.map((entry) => entry.command),
    routes: reviewRoutes.map((entry) => entry.route),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    openT3GapCount: openCertificationGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "3Y",
    generatedAt,
    status,
    finalGoalComplete: false,
    launchGuideOnly: true,
    readyForLocalReview,
    readyForProductionRelease: false,
    localEvidenceReady,
    blockedByT3: openCertificationGaps.length > 0,
    openT3GapCount: openCertificationGaps.length,
    contentReturned: false,
    commandCount: reviewCommands.length,
    routeCount: reviewRoutes.length,
    evidenceFileCount: evidenceFiles.length,
    launchGuideHash,
    reviewCommands,
    reviewRoutes,
    evidenceFiles,
    sourceSummaries: {
      reviewerCockpit: {
        status: cockpit.status || "unknown",
        readyForHumanReview: cockpit.readyForHumanReview === true,
        readyForProductionRelease: cockpit.readyForProductionRelease === true,
        openT3GapCount: Number(cockpit.openT3GapCount || 0),
        finalGoalComplete: Boolean(cockpit.finalGoalComplete)
      },
      releaseCandidate: {
        status: release.status || "unknown",
        readyForHumanReview: release.readyForHumanReview === true,
        readyForProductionRelease: release.readyForProductionRelease === true,
        finalGoalComplete: Boolean(release.finalGoalComplete)
      },
      finalReadiness: {
        status: readiness.status || "unknown",
        blockedByT3: readiness.blockedByT3 === true,
        finalGoalComplete: Boolean(readiness.finalGoalComplete)
      }
    },
    openCertificationGaps,
    nextReviewActions: [
      {
        id: "local-review",
        riskTier: "T1",
        approvalRequired: false,
        action: "Run the local commands and inspect the local routes listed by this guide."
      },
      ...openCertificationGaps.map((gap) => ({
        id: gap.id,
        riskTier: "T3",
        approvalRequired: true,
        action: gap.nextAction || gap.issue || "Run one explicitly approved T3 certification lane with rollback and evidence review."
      }))
    ],
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
      productionRelease: false,
      finalCompletionClaimed: false
    }
  };
}

export function writeDeliveryLaunchGuide(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = deliveryLaunchGuide(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryLaunchGuideMarkdown(report), "utf8");
  report = deliveryLaunchGuide(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryLaunchGuideMarkdown(report), "utf8");
  return report;
}

export function renderDeliveryLaunchGuideMarkdown(report) {
  const commandRows = report.reviewCommands
    .map((entry) => `| ${entry.id} | ${entry.command} | ${entry.purpose} |`)
    .join("\n");
  const routeRows = report.reviewRoutes
    .map((entry) => `| ${entry.id} | ${entry.route} | ${entry.purpose} |`)
    .join("\n");
  const evidenceRows = report.evidenceFiles
    .map((file) => `| ${file.path} | ${file.exists ? "yes" : "no"} | ${file.sizeBytes} | ${file.sha256 || "none"} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | T3 | open | ${gap.nextAction || gap.issue || "approval required"} |`)
    .join("\n");

  return `# Phase 3Y Delivery Launch Guide

Generated: ${report.generatedAt}

Status: **${report.status}**

Launch guide only: **${report.launchGuideOnly ? "yes" : "no"}**

Ready for local review: **${report.readyForLocalReview ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Launch guide hash:

\`\`\`text
${report.launchGuideHash}
\`\`\`

| Command | Local command | Purpose |
|---|---|---|
${commandRows}

| Route | Local URL | Purpose |
|---|---|---|
${routeRows}

| Evidence file | Exists | Bytes | SHA-256 |
|---|---:|---:|---|
${evidenceRows}

| Gap | Risk | Status | Next action |
|---|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This launch guide is metadata-only and local-review-only.
- It does not run the commands, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function commandPurpose(command) {
  if (command.includes("fullstack")) return "Start the local web/API server for manual review.";
  if (command.includes("qa:launch-guide")) return "Regenerate and verify this launch guide.";
  if (command.includes("qa:reviewer-cockpit")) return "Verify the reviewer cockpit evidence summary.";
  if (command.includes("qa:api")) return "Verify fullstack API and report fields.";
  if (command === "npm.cmd run test") return "Run static smoke checks.";
  if (command === "npm.cmd run qa") return "Run the three-round student, teacher, and research QA suite.";
  if (command.includes("qa:agentic")) return "Run the agentic internal QA audit.";
  if (command.includes("qa:completion")) return "Run the completion audit and open-gap matrix.";
  return "Local review command.";
}

function routePurpose(route) {
  if (route.endsWith("#research")) return "Inspect the research delivery cockpit.";
  if (route.endsWith("#student")) return "Inspect the student pair-programming surface.";
  if (route.endsWith("#teacher")) return "Inspect the teacher dashboard.";
  if (route.includes("reviewer-cockpit")) return "Inspect Phase 3X reviewer cockpit metadata.";
  if (route.includes("launch-guide")) return "Inspect Phase 3Y launch guide metadata.";
  return "Local review route.";
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
  const report = writeDeliveryLaunchGuide();
  console.log(`Delivery launch guide written: ${report.status} (${report.launchGuideHash})`);
}
