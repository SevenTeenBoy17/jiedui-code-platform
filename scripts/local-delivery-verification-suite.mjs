import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { localDeliveryQuickstartBundle } from "./local-delivery-quickstart-bundle.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4h-local-delivery-verification-suite.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4h-local-delivery-verification-suite.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json",
  "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md",
  "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
  "qa-artifacts/phase4e-local-delivery-summary-packet.json",
  "qa-artifacts/phase4d-delivery-evidence-navigator.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "specs/phase4h-local-delivery-verification-suite-contract.md",
  "package.json",
  "tests/fullstack-api.mjs",
  "tests/agentic-audit.mjs",
  "tests/completion-audit.mjs"
];

const LOCAL_COMMANDS = [
  ["verify-suite", "npm.cmd run qa:local-verification-suite", "Regenerate and verify this local verification suite."],
  ["verify-quickstart", "npm.cmd run qa:quickstart-bundle", "Regenerate and verify the Phase 4G quickstart bundle."],
  ["verify-api", "$env:PORT='3266'; npm.cmd run qa:api", "Run fullstack API regression on a local port."],
  ["verify-smoke", "npm.cmd run test", "Run static smoke checks."],
  ["verify-three-rounds", "npm.cmd run qa", "Run student, teacher, and research QA rounds."],
  ["verify-visual", "npm.cmd run qa:visual", "Run visual fidelity checks."],
  ["verify-agentic", "npm.cmd run qa:agentic", "Run the three-round agentic internal QA audit."],
  ["verify-completion", "npm.cmd run qa:completion", "Run the completion audit and open-gap matrix."],
  ["verify-handoff-export", "npm.cmd run qa:handoff-export", "Refresh and verify delivery handoff export artifacts."],
  ["verify-artifact-index", "npm.cmd run qa:artifact-index", "Refresh and verify the delivery artifact index."]
];

export function localDeliveryVerificationSuite({
  generatedAt = new Date().toISOString(),
  quickstartBundle = readJson("qa-artifacts/phase4g-local-delivery-quickstart-bundle.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json"),
  packageManifest = readJson("package.json")
} = {}) {
  const quickstart = hasStatus(quickstartBundle) ? quickstartBundle : localDeliveryQuickstartBundle();
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
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const packageScripts = packageManifest.scripts || {};
  const provedCheckIds = provedIds(agenticAudit);
  const localRequirementCount = Math.max(
    Number(quickstart.localRequirementCount || 0),
    Number(completionAudit.localRequirementCount || 0)
  );
  const provedCheckCount = Math.max(
    Number(quickstart.provedCheckCount || 0),
    Number(agenticAudit.provedCheckCount || 0),
    provedCheckIds.size
  );
  const openGaps = normalizeGaps(
    quickstart.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const verificationChecks = [
    verificationCheck(1, "quickstart-artifact-ready", quickstart.status === "local-delivery-quickstart-ready-open-t3", ["qa-artifacts/phase4g-local-delivery-quickstart-bundle.json"]),
    verificationCheck(2, "focused-suite-command-registered", packageScripts["qa:local-verification-suite"] === "node tests/local-delivery-verification-suite.mjs", ["package.json"]),
    verificationCheck(3, "focused-quickstart-command-registered", packageScripts["qa:quickstart-bundle"] === "node tests/local-delivery-quickstart-bundle.mjs", ["package.json"]),
    verificationCheck(4, "api-regression-command-registered", packageScripts["qa:api"] === "node tests/fullstack-api.mjs", ["package.json"]),
    verificationCheck(5, "smoke-command-registered", packageScripts.test === "node tests/smoke.mjs", ["package.json"]),
    verificationCheck(6, "three-round-qa-command-registered", packageScripts.qa === "node tests/qa-rounds.mjs", ["package.json"]),
    verificationCheck(7, "agentic-audit-command-registered", packageScripts["qa:agentic"] === "node tests/agentic-audit.mjs", ["package.json"]),
    verificationCheck(8, "completion-audit-command-registered", packageScripts["qa:completion"] === "node tests/completion-audit.mjs", ["package.json"]),
    verificationCheck(9, "evidence-files-hashed", evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || "")), REQUIRED_EVIDENCE),
    verificationCheck(10, "open-t3-gaps-preserved", openGaps.length === 3 && quickstart.finalGoalComplete === false, ["qa-artifacts/phase2s-completion-audit.json"])
  ];
  const localVerificationPassed =
    verificationChecks.length === 10 &&
    verificationChecks.every((check) => check.localReady && check.status === "ready-local") &&
    localCommands.length === 10 &&
    localCommands.every((command) => command.executionAllowed === false && command.executed === false && command.outputReturned === false) &&
    evidenceFiles.length >= 12 &&
    localRequirementCount >= 48 &&
    provedCheckCount >= 69 &&
    openGaps.length === 3;
  const status = localVerificationPassed
    ? "local-delivery-verification-suite-ready-open-t3"
    : "local-delivery-verification-suite-needs-local-evidence";
  const suiteHash = sha256(JSON.stringify({
    status,
    checks: verificationChecks.map((check) => [check.id, check.localReady, check.status]),
    commands: localCommands.map((command) => [command.id, command.executionAllowed, command.executed]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4H",
    generatedAt,
    status,
    finalGoalComplete: false,
    verificationSuiteOnly: true,
    localVerificationPassed,
    readyForLocalVerificationReview: localVerificationPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    verificationCheckCount: verificationChecks.length,
    readyVerificationCheckCount: verificationChecks.filter((check) => check.localReady).length,
    blockedVerificationCheckCount: verificationChecks.filter((check) => !check.localReady).length,
    localCommandCount: localCommands.length,
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    evidenceFileCount: evidenceFiles.length,
    suiteHash,
    verificationChecks,
    localCommands,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      quickstart: {
        status: quickstart.status || "unknown",
        localQuickstartPassed: quickstart.localQuickstartPassed === true,
        finalGoalComplete: Boolean(quickstart.finalGoalComplete)
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount,
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticAudit: {
        provedCheckCount,
        openProductGapCount: Number(agenticAudit.openProductGapCount || 0)
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

export function writeLocalDeliveryVerificationSuite(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = localDeliveryVerificationSuite(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderLocalDeliveryVerificationSuiteMarkdown(report), "utf8");
  return report;
}

export function renderLocalDeliveryVerificationSuiteMarkdown(report) {
  const checkRows = report.verificationChecks
    .map((check) => `| ${check.order} | ${check.id} | ${check.status} | ${check.localReady ? "yes" : "no"} |`)
    .join("\n");
  const commandRows = report.localCommands
    .map((command) => `| ${command.order} | ${command.command} | ${command.executed ? "yes" : "no"} | ${command.executionAllowed ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 4H Local Delivery Verification Suite

Generated: ${report.generatedAt}

Status: **${report.status}**

Verification suite only: **${report.verificationSuiteOnly ? "yes" : "no"}**

Local verification passed: **${report.localVerificationPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Suite hash:

\`\`\`text
${report.suiteHash}
\`\`\`

| Order | Verification check | Status | Local ready |
|---:|---|---|---:|
${checkRows}

| Order | Local command | Executed | Execution allowed |
|---:|---|---:|---:|
${commandRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a local verification suite manifest only.
- It does not execute commands, return command output, return artifact bodies, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function verificationCheck(order, id, localReady, evidenceIds) {
  return {
    order,
    id,
    title: id.replaceAll("-", " "),
    status: localReady ? "ready-local" : "needs-local-evidence",
    localReady: Boolean(localReady),
    evidenceIds,
    riskTier: "T1",
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
  const report = writeLocalDeliveryVerificationSuite();
  console.log(`Local delivery verification suite written: ${report.status} (${report.suiteHash})`);
}
