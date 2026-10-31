import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CLICK_PATH = "qa-artifacts/phase2o-agentic-click-qa.json";
const DEFAULT_AUDIT_PATH = "qa-artifacts/phase2o-agentic-audit.json";
const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3s-visual-qa-storyboard.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3s-visual-qa-storyboard.md";

const SURFACE_META = {
  login: {
    role: "entry",
    title: "Login and role entry",
    caption: "Confirms the first viewport, glass visual language, role entry, and product identity are inspectable before auth."
  },
  student: {
    role: "student",
    title: "Student coding workspace",
    caption: "Confirms student join/run/self-check/submission flow, terminal result, model routing evidence, and tutor surface."
  },
  teacher: {
    role: "teacher",
    title: "Teacher review dashboard",
    caption: "Confirms teacher queue review, feedback persistence, score state, and classroom monitoring context."
  },
  research: {
    role: "researcher",
    title: "Research evidence console",
    caption: "Confirms export counts, delivery evidence panels, QA proof surfaces, and open T3 blocker visibility."
  },
  mobile: {
    role: "mobile",
    title: "Mobile student viewport",
    caption: "Confirms responsive navigation, student workflow readability, and mobile visual fidelity."
  }
};

export function visualQaStoryboard({
  generatedAt = new Date().toISOString(),
  clickReport = readJson(DEFAULT_CLICK_PATH),
  agenticAudit = readJson(DEFAULT_AUDIT_PATH),
  clickPath = DEFAULT_CLICK_PATH,
  auditPath = DEFAULT_AUDIT_PATH
} = {}) {
  const screenshots = clickReport.screenshots || {};
  const frames = Object.entries(SURFACE_META).map(([id, meta], index) => frameFor(id, meta, screenshots[id], index + 1));
  const rounds = Array.isArray(clickReport.rounds) ? clickReport.rounds : [];
  const issueList = Array.isArray(agenticAudit.issueList) ? agenticAudit.issueList : [];
  const completionMatrix = Array.isArray(agenticAudit.completionMatrix) ? agenticAudit.completionMatrix : [];
  const readyFrameCount = frames.filter((frame) => frame.exists && frame.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(frame.sha256)).length;
  const roundSummary = rounds.map((round) => ({
    round: round.round,
    terminalRunJobCount: Number(round.terminalRunJobCount || 0),
    reviewedCount: Number(round.reviewedCount || 0),
    submittedCount: Number(round.submittedCount || 0),
    researchReviewedSubmissionCount: Number(round.exportCounts?.reviewedSubmissionCount || 0),
    modelRouteCount: Number(round.modelRouteCount || 0),
    sandboxIsolationCount: Number(round.sandboxIsolationCount || 0),
    visualFidelity: round.visualFidelity === true
  }));
  const visualChecks = {
    allFramesReady: readyFrameCount === frames.length,
    threeRoundsPresent: rounds.length >= 3,
    noBrowserConsoleErrors: (clickReport.consoleErrors || []).length === 0,
    roleSurfacesCovered: frames.some((frame) => frame.role === "student") &&
      frames.some((frame) => frame.role === "teacher") &&
      frames.some((frame) => frame.role === "researcher") &&
      frames.some((frame) => frame.role === "mobile"),
    agenticAuditPassed: agenticAudit.verdict === "PASS_WITH_OPEN_PRODUCT_GAPS",
    finalValuesReached: roundSummary.every((round) => round.terminalRunJobCount >= 1 && round.reviewedCount >= 1 && round.visualFidelity === true)
  };
  const visualChecksPassed = Object.values(visualChecks).every(Boolean);
  const status = visualChecksPassed ? "visual-storyboard-ready-open-t3" : "visual-storyboard-incomplete";
  const storyboardHash = sha256(JSON.stringify({
    status,
    frameHashes: frames.map((frame) => frame.sha256),
    roundCount: rounds.length,
    provedCheckCount: completionMatrix.filter((item) => item.status === "proved").length,
    openProductGapCount: issueList.length,
    visualChecks
  }));

  return {
    phase: "3S",
    generatedAt,
    status,
    finalGoalComplete: false,
    storyboardOnly: true,
    localVisualEvidence: true,
    screenshotBytesEmbedded: false,
    artifactBodyContentReturned: false,
    clickReportPath: clickPath,
    agenticAuditPath: auditPath,
    surfaceCount: frames.length,
    readySurfaceCount: readyFrameCount,
    screenshotHashCount: frames.filter((frame) => /^[a-f0-9]{64}$/.test(frame.sha256)).length,
    replayRoundCount: rounds.length,
    provedCheckCount: completionMatrix.filter((item) => item.status === "proved").length,
    openProductGapCount: issueList.length,
    visualChecks,
    visualChecksPassed,
    frames,
    roundSummary,
    storyboardHash,
    openProductGaps: issueList.map((item) => ({
      id: item.id,
      severity: item.severity,
      status: item.status,
      owner: item.owner
    })),
    guardrails: {
      screenshotBytesEmbedded: false,
      artifactBodyContentReturned: false,
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
    nextStep: "Use the storyboard for visual delivery review; T3 runtime, managed database, and external provider certification still require explicit approved phases."
  };
}

export function writeVisualQaStoryboard(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = visualQaStoryboard(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderVisualQaStoryboardMarkdown(report), "utf8");
  return report;
}

export function renderVisualQaStoryboardMarkdown(report) {
  const frameRows = report.frames
    .map((frame) => `| ${frame.order} | ${frame.id} | ${frame.role} | ${frame.exists ? "yes" : "no"} | ${frame.sizeBytes} | ${frame.sha256.slice(0, 12)} | ${frame.imageSrc} |`)
    .join("\n");
  const roundRows = report.roundSummary
    .map((round) => `| ${round.round} | ${round.terminalRunJobCount} | ${round.reviewedCount} | ${round.researchReviewedSubmissionCount} | ${round.modelRouteCount} | ${round.visualFidelity ? "yes" : "no"} |`)
    .join("\n");

  return `# Phase 3S Visual QA Storyboard

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Storyboard only: **${report.storyboardOnly ? "yes" : "no"}**

Storyboard hash:

\`\`\`text
${report.storyboardHash}
\`\`\`

## Frames

| Order | Surface | Role | Exists | Bytes | Hash Prefix | Image Source |
|---:|---|---|---|---:|---|---|
${frameRows}

## Replay Rounds

| Round | Terminal jobs | Reviewed | Research reviewed | Model routes | Visual fidelity |
|---:|---:|---:|---:|---:|---|
${roundRows}

## Visual Checks

${Object.entries(report.visualChecks).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This storyboard returns local screenshot paths, file metadata, and hashes.
- It does not embed screenshot bytes, artifact body content, secrets, provider responses, approval text, or database connection strings.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function frameFor(id, meta, path, order) {
  const resolved = typeof path === "string" ? resolve(path) : "";
  const exists = Boolean(resolved && existsSync(resolved));
  const bytes = exists ? readFileSync(resolved) : null;
  const relativePath = exists ? relative(process.cwd(), resolved).replaceAll("\\", "/") : "";
  return {
    id,
    order,
    role: meta.role,
    title: meta.title,
    caption: meta.caption,
    path: relativePath,
    imageSrc: relativePath ? `/${relativePath}` : "",
    exists,
    sizeBytes: exists ? statSync(resolved).size : 0,
    sha256: bytes ? sha256(bytes) : "",
    screenshotBytesEmbedded: false
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
  writeVisualQaStoryboard();
  console.log(`Visual QA storyboard written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
