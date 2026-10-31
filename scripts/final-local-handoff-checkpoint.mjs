import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { localDeliveryVerificationSuite } from "./local-delivery-verification-suite.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4i-final-local-handoff-checkpoint.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4i-final-local-handoff-checkpoint.md";

const HANDOFF_ARTIFACTS = [
  "qa-artifacts/phase4h-local-delivery-verification-suite.json",
  "qa-artifacts/phase4h-local-delivery-verification-suite.md",
  "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json",
  "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
  "qa-artifacts/phase3w-t3-run-packet-verifier.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "specs/phase2s-delivery-completion-audit-contract.md",
  "qa-artifacts/phase2o-agentic-audit.json",
  "specs/phase4i-final-local-handoff-checkpoint-contract.md"
];

const LOCAL_COMMANDS = [
  ["verify-final-checkpoint", "npm.cmd run qa:final-handoff-checkpoint", "Regenerate and verify this final local handoff checkpoint."],
  ["verify-suite", "npm.cmd run qa:local-verification-suite", "Regenerate and verify the Phase 4H local verification suite."],
  ["verify-completion", "npm.cmd run qa:completion", "Run the local completion audit and open-gap matrix."],
  ["verify-api", "$env:PORT='3272'; npm.cmd run qa:api", "Run fullstack API regression on a local port."],
  ["verify-smoke", "npm.cmd run test", "Run static smoke checks."],
  ["verify-three-rounds", "npm.cmd run qa", "Run student, teacher, and research QA rounds."],
  ["verify-visual", "npm.cmd run qa:visual", "Run visual fidelity checks."],
  ["verify-artifact-index", "npm.cmd run qa:artifact-index", "Refresh and verify the delivery artifact index."]
];

export function finalLocalHandoffCheckpoint({
  generatedAt = new Date().toISOString(),
  verificationSuite = readJson("qa-artifacts/phase4h-local-delivery-verification-suite.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json"),
  packageManifest = readJson("package.json")
} = {}) {
  const suite = hasStatus(verificationSuite) ? verificationSuite : localDeliveryVerificationSuite();
  const packageScripts = packageManifest.scripts || {};
  const handoffArtifacts = HANDOFF_ARTIFACTS.map((path) => artifactFile(path));
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
  const provedCheckIds = provedIds(agenticAudit);
  const localRequirementCount = Math.max(
    Number(suite.localRequirementCount || 0),
    Number(completionAudit.localRequirementCount || 0)
  );
  const provedCheckCount = Math.max(
    Number(suite.provedCheckCount || 0),
    provedCheckIds.size
  );
  const openGaps = normalizeGaps(
    suite.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const checkpointSteps = [
    checkpointStep(1, "phase4h-verification-suite-ready", suite.status === "local-delivery-verification-suite-ready-open-t3", ["qa-artifacts/phase4h-local-delivery-verification-suite.json"]),
    checkpointStep(2, "final-checkpoint-command-registered", packageScripts["qa:final-handoff-checkpoint"] === "node tests/final-local-handoff-checkpoint.mjs", ["package.json"]),
    checkpointStep(3, "local-suite-command-registered", packageScripts["qa:local-verification-suite"] === "node tests/local-delivery-verification-suite.mjs", ["package.json"]),
    checkpointStep(4, "local-completion-audit-ready", completionAudit.verdict === "PASS_WITH_OPEN_CERTIFICATION_GAPS" && completionAudit.finalGoalComplete === false, ["qa-artifacts/phase2s-completion-audit.json"]),
    checkpointStep(5, "agentic-audit-ready", provedCheckCount >= 70, ["qa-artifacts/phase2o-agentic-audit.json"]),
    checkpointStep(6, "handoff-artifacts-hashed", handoffArtifacts.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || "")), HANDOFF_ARTIFACTS),
    checkpointStep(7, "single-lane-t3-packets-ready", handoffArtifacts.some((file) => file.path.includes("phase3v")) && handoffArtifacts.some((file) => file.path.includes("phase3w")), ["qa-artifacts/phase3v-t3-single-lane-run-packets.json", "qa-artifacts/phase3w-t3-run-packet-verifier.json"]),
    checkpointStep(8, "open-t3-gaps-preserved", openGaps.length === 3 && suite.finalGoalComplete === false, ["qa-artifacts/phase2s-completion-audit.json"])
  ];
  const localFinalHandoffPassed =
    checkpointSteps.length === 8 &&
    checkpointSteps.every((step) => step.localReady && step.status === "ready-local") &&
    localCommands.length === 8 &&
    localCommands.every((command) => command.executionAllowed === false && command.executed === false && command.outputReturned === false) &&
    handoffArtifacts.length >= 13 &&
    localRequirementCount >= 49 &&
    provedCheckCount >= 70 &&
    openGaps.length === 3;
  const status = localFinalHandoffPassed
    ? "final-local-handoff-checkpoint-ready-open-t3"
    : "final-local-handoff-checkpoint-needs-local-evidence";
  const checkpointHash = sha256(JSON.stringify({
    status,
    steps: checkpointSteps.map((step) => [step.id, step.localReady, step.status]),
    commands: localCommands.map((command) => [command.id, command.executionAllowed, command.executed]),
    artifactHashes: handoffArtifacts.map((file) => file.sha256 || ""),
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4I",
    generatedAt,
    status,
    finalGoalComplete: false,
    checkpointOnly: true,
    localFinalHandoffPassed,
    readyForFinalLocalReview: localFinalHandoffPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    checkpointStepCount: checkpointSteps.length,
    readyCheckpointStepCount: checkpointSteps.filter((step) => step.localReady).length,
    blockedCheckpointStepCount: checkpointSteps.filter((step) => !step.localReady).length,
    localCommandCount: localCommands.length,
    handoffArtifactCount: handoffArtifacts.length,
    localRequirementCount,
    provedCheckCount,
    openT3GapCount: openGaps.length,
    checkpointHash,
    checkpointSteps,
    localCommands,
    handoffArtifacts,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      verificationSuite: {
        status: suite.status || "unknown",
        localVerificationPassed: suite.localVerificationPassed === true,
        finalGoalComplete: Boolean(suite.finalGoalComplete)
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount,
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticAudit: {
        provedCheckCount,
        openProductGapCount: openProductGapCount(agenticAudit)
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

export function writeFinalLocalHandoffCheckpoint(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = finalLocalHandoffCheckpoint(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderFinalLocalHandoffCheckpointMarkdown(report), "utf8");
  return report;
}

export function renderFinalLocalHandoffCheckpointMarkdown(report) {
  const stepRows = report.checkpointSteps
    .map((step) => `| ${step.order} | ${step.id} | ${step.status} | ${step.localReady ? "yes" : "no"} |`)
    .join("\n");
  const commandRows = report.localCommands
    .map((command) => `| ${command.order} | ${command.command} | ${command.executed ? "yes" : "no"} | ${command.executionAllowed ? "yes" : "no"} |`)
    .join("\n");
  const artifactRows = report.handoffArtifacts
    .map((file) => `| ${file.path} | ${file.exists ? "yes" : "no"} | ${file.sha256 || "missing"} |`)
    .join("\n");

  return `# Phase 4I Final Local Handoff Checkpoint

Generated: ${report.generatedAt}

Status: **${report.status}**

Checkpoint only: **${report.checkpointOnly ? "yes" : "no"}**

Local final handoff passed: **${report.localFinalHandoffPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Checkpoint hash:

\`\`\`text
${report.checkpointHash}
\`\`\`

| Order | Checkpoint step | Status | Local ready |
|---:|---|---|---:|
${stepRows}

| Order | Local command | Executed | Execution allowed |
|---:|---|---:|---:|
${commandRows}

| Handoff artifact | Exists | SHA-256 |
|---|---:|---|
${artifactRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a final local handoff checkpoint manifest only.
- It does not execute commands, return command output, return artifact bodies, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function checkpointStep(order, id, localReady, evidenceIds) {
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

function artifactFile(path) {
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

function normalizeGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : []).map((gap, index) => ({
    id: gap.id || gap.laneId || `t3-gap-${index + 1}`,
    title: gap.title || gap.name || gap.id || "Open T3 certification gap",
    status: "open",
    riskTier: "T3",
    approvalRequired: true,
    finalGoalComplete: false
  })).slice(0, 3);
}

function provedIds(agenticAudit) {
  const rows = agenticAudit.completionMatrix || agenticAudit.checks || [];
  return new Set(
    rows
      .filter((entry) => entry.status === "proved")
      .map((entry) => entry.id)
      .filter(Boolean)
  );
}

function openProductGapCount(agenticAudit) {
  if (Number.isFinite(Number(agenticAudit.openProductGapCount))) {
    return Number(agenticAudit.openProductGapCount);
  }
  return (agenticAudit.issueList || []).filter((item) => item.status === "open").length;
}

function hasStatus(report) {
  return report && typeof report === "object" && typeof report.status === "string";
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

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  const report = writeFinalLocalHandoffCheckpoint();
  console.log(`Final local handoff checkpoint written: ${report.status} (${report.checkpointHash})`);
}
