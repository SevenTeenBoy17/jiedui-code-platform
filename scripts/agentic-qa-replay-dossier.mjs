import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_AUDIT_PATH = "qa-artifacts/phase2o-agentic-audit.json";
const DEFAULT_CLICK_PATH = "qa-artifacts/phase2o-agentic-click-qa.json";
const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3r-agentic-qa-replay-dossier.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3r-agentic-qa-replay-dossier.md";

export function agenticQaReplayDossier({
  generatedAt = new Date().toISOString(),
  audit = readJson(DEFAULT_AUDIT_PATH),
  clickReport = readJson(DEFAULT_CLICK_PATH),
  auditPath = DEFAULT_AUDIT_PATH,
  clickPath = DEFAULT_CLICK_PATH
} = {}) {
  const agents = Array.isArray(audit.agents) ? audit.agents : [];
  const completionMatrix = Array.isArray(audit.completionMatrix) ? audit.completionMatrix : [];
  const issueList = Array.isArray(audit.issueList) ? audit.issueList : [];
  const rounds = Array.isArray(clickReport.rounds) ? clickReport.rounds : [];
  const screenshotInventory = screenshotArtifacts(clickReport.screenshots || audit.clickReport?.screenshots || {});
  const provedCheckCount = completionMatrix.filter((item) => item.status === "proved").length;
  const finalValueWaits = {
    threeRoundRun: rounds.length >= 3,
    browserConsoleClean: (clickReport.consoleErrors || audit.clickReport?.consoleErrors || []).length === 0,
    studentRunTerminal: rounds.every((round) => Number(round.terminalRunJobCount || 0) >= 1),
    sandboxIsolationEvidence: rounds.every((round) => Number(round.sandboxIsolationCount || 0) >= 1),
    modelRouteEvidence: rounds.every((round) => Number(round.modelRouteCount || 0) >= 1),
    teacherReviewPersisted: rounds.every((round) => Number(round.reviewedCount || 0) >= 1 && Boolean(round.reviewedSubmissionId)),
    researchExportCounts: rounds.every((round) => Number(round.exportCounts?.terminalRunJobCount || 0) >= 1 && Number(round.exportCounts?.reviewedSubmissionCount || 0) >= 1),
    websocketLiveEvidence: rounds.every((round) => Number(round.joinEventCount || 0) >= 1),
    visualFidelity: rounds.every((round) => round.visualFidelity === true)
  };
  const finalValueWaitsPassed = Object.values(finalValueWaits).every(Boolean);
  const status = agents.length >= 4 &&
    rounds.length >= 3 &&
    completionMatrix.length > 0 &&
    provedCheckCount === completionMatrix.length &&
    finalValueWaitsPassed &&
    screenshotInventory.readyCount >= 5
    ? "agentic-qa-replay-ready-open-t3"
    : "agentic-qa-replay-incomplete";
  const replayHash = sha256(JSON.stringify({
    status,
    agentIds: agents.map((agent) => agent.id),
    provedCheckCount,
    checkCount: completionMatrix.length,
    openProductGapCount: issueList.length,
    roundCount: rounds.length,
    finalValueWaits,
    screenshotHashes: screenshotInventory.artifacts.map((item) => item.sha256)
  }));

  return {
    phase: "3R",
    generatedAt,
    status,
    finalGoalComplete: false,
    replayOnly: true,
    contentReturned: false,
    artifactContentReturned: false,
    screenshotBytesReturned: false,
    auditStatus: audit.verdict || "missing",
    auditPath,
    clickReportPath: clickPath,
    agentCount: agents.length,
    agents: agents.map((agent) => ({
      id: agent.id,
      responsibility: agent.responsibility
    })),
    completionCheckCount: completionMatrix.length,
    provedCheckCount,
    openProductGapCount: issueList.length,
    openProductGaps: issueList.map((item) => ({
      id: item.id,
      severity: item.severity,
      status: item.status,
      owner: item.owner
    })),
    clickRoundCount: rounds.length,
    finalValueWaits,
    finalValueWaitsPassed,
    replayRounds: rounds.map((round) => ({
      round: round.round,
      joinEventCount: Number(round.joinEventCount || 0),
      terminalRunJobCount: Number(round.terminalRunJobCount || 0),
      sandboxIsolationCount: Number(round.sandboxIsolationCount || 0),
      modelRouteCount: Number(round.modelRouteCount || 0),
      submittedCount: Number(round.submittedCount || 0),
      reviewedCount: Number(round.reviewedCount || 0),
      researchRunCount: Number(round.exportCounts?.runCount || 0),
      researchReviewedSubmissionCount: Number(round.exportCounts?.reviewedSubmissionCount || 0),
      visualFidelity: round.visualFidelity === true
    })),
    screenshotArtifactCount: screenshotInventory.artifacts.length,
    readyScreenshotArtifactCount: screenshotInventory.readyCount,
    screenshotHashCount: screenshotInventory.hashCount,
    screenshotArtifacts: screenshotInventory.artifacts,
    replayHash,
    guardrails: {
      contentReturned: false,
      artifactContentReturned: false,
      screenshotBytesReturned: false,
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
    nextStep: "Use this replay dossier as the delivery evidence index for agentic QA; the three T3 product gaps still require explicit approved certification phases."
  };
}

export function writeAgenticQaReplayDossier(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = agenticQaReplayDossier(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderAgenticQaReplayDossierMarkdown(report), "utf8");
  return report;
}

export function renderAgenticQaReplayDossierMarkdown(report) {
  const agentRows = report.agents.map((agent) => `| ${agent.id} | ${agent.responsibility} |`).join("\n");
  const roundRows = report.replayRounds
    .map((round) => `| ${round.round} | ${round.terminalRunJobCount} | ${round.modelRouteCount} | ${round.reviewedCount} | ${round.researchReviewedSubmissionCount} | ${round.visualFidelity ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3R Agentic QA Replay Dossier

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Replay only: **${report.replayOnly ? "yes" : "no"}**

Replay hash:

\`\`\`text
${report.replayHash}
\`\`\`

## Agents

| Agent | Responsibility |
|---|---|
${agentRows}

## Replay Rounds

| Round | Terminal jobs | Model routes | Reviewed count | Research reviewed count | Visual fidelity |
|---:|---:|---:|---:|---:|---|
${roundRows}

## Evidence Summary

- completionCheckCount: ${report.completionCheckCount}
- provedCheckCount: ${report.provedCheckCount}
- clickRoundCount: ${report.clickRoundCount}
- finalValueWaitsPassed: ${report.finalValueWaitsPassed}
- screenshotHashCount: ${report.screenshotHashCount}
- openProductGapCount: ${report.openProductGapCount}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This dossier returns metadata and hashes only.
- It does not include screenshot bytes, artifact body content, secrets, provider responses, approval text, or database connection strings.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function screenshotArtifacts(screenshots) {
  const artifacts = Object.entries(screenshots)
    .filter(([, path]) => typeof path === "string")
    .map(([id, path]) => {
      const resolved = resolve(path);
      const exists = existsSync(resolved);
      const bytes = exists ? readFileSync(resolved) : null;
      return {
        id,
        path: exists ? relative(process.cwd(), resolved).replaceAll("\\", "/") : path,
        exists,
        sizeBytes: exists ? statSync(resolved).size : 0,
        sha256: bytes ? sha256(bytes) : "",
        contentReturned: false
      };
    });
  return {
    artifacts,
    readyCount: artifacts.filter((item) => item.exists && item.sizeBytes > 0 && item.sha256).length,
    hashCount: artifacts.filter((item) => /^[a-f0-9]{64}$/.test(item.sha256)).length
  };
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
  writeAgenticQaReplayDossier();
  console.log(`Agentic QA replay dossier written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
