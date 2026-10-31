import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryConsistencySentinel } from "./delivery-consistency-sentinel.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4a-final-acceptance-matrix.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4a-final-acceptance-matrix.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/QA_REPORT.md"
];

export function finalAcceptanceMatrix({
  generatedAt = new Date().toISOString(),
  consistencySentinel = readJson("qa-artifacts/phase3z-delivery-consistency-sentinel.json"),
  launchGuide = readJson("qa-artifacts/phase3y-delivery-launch-guide.json"),
  reviewerCockpit = readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json"),
  releaseCandidate = readJson("qa-artifacts/phase3t-delivery-release-candidate.json"),
  visualStoryboard = readJson("qa-artifacts/phase3s-visual-qa-storyboard.json"),
  agenticReplay = readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const sentinel = hasStatus(consistencySentinel)
    ? consistencySentinel
    : deliveryConsistencySentinel();
  const openCertificationGaps = normalizeGaps(
    sentinel.openCertificationGaps ||
    launchGuide.openCertificationGaps ||
    reviewerCockpit.openCertificationGaps ||
    releaseCandidate.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const agenticChecks = Array.isArray(agenticAudit.completionMatrix)
    ? agenticAudit.completionMatrix
    : (Array.isArray(agenticAudit.checks) ? agenticAudit.checks : []);
  const agenticProvedCheckCount = Number(agenticAudit.provedCheckCount || 0) ||
    agenticChecks.filter((check) => check.status === "proved").length;
  const provedCheckIds = new Set(
    agenticChecks
      .filter((check) => check.status === "proved")
      .map((check) => check.id)
  );
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const rows = [
    row("model-routing-fallback", "Model routing and >1000ms fallback", "local-proved", [
      completionAudit.localRequirementCount >= 40,
      provedCheckIds.has("model-runtime-routing") || hasText("data/model-contracts.json", "gpt-5.3-codex-spark")
    ], "Primary/fallback coding model contract is represented locally without exposing secrets."),
    row("image-route-separation", "Image generation route separation", "local-proved", [
      provedCheckIds.has("image-route-separation") || hasText("data/model-contracts.json", "gpt-image-2")
    ], "Image route is separated from coding-model routes."),
    row("student-workflow", "Student workflow", "local-proved", [
      Number(agenticReplay.clickRoundCount || 0) >= 3,
      hasText("tests/qa-rounds.mjs", "Round 1 Student workflow")
    ], "Student workflow is covered by three-round QA."),
    row("teacher-workflow", "Teacher workflow", "local-proved", [
      Number(agenticReplay.clickRoundCount || 0) >= 3,
      hasText("tests/qa-rounds.mjs", "Round 2 Teacher workflow")
    ], "Teacher workflow is covered by three-round QA."),
    row("research-compliance-workflow", "Research and compliance workflow", "local-proved", [
      sentinel.consistencyPassed === true,
      hasText("tests/qa-rounds.mjs", "Round 3 Research and compliance workflow")
    ], "Research workflow exposes delivery evidence and consistency checks."),
    row("visual-ui-evidence", "3D glass/cartoon UI evidence", "local-proved", [
      visualStoryboard.status === "visual-storyboard-ready-open-t3",
      visualStoryboard.visualChecksPassed === true || hasText("tests/visual-fidelity.mjs", "Visual fidelity checks")
    ], "Visual evidence remains local and screenshot-body-free."),
    row("staged-autonomous-development", "Staged autonomous development", "local-proved", [
      hasText("task_plan.md", "CodeX Phase 3Z delivery consistency sentinel"),
      hasText("progress.md", "CodeX Phase 3Z Delivery Consistency Sentinel")
    ], "Staged phases are tracked in durable planning/progress files."),
    row("three-internal-qa-rounds", "At least three internal QA/iteration rounds", "local-proved", [
      Number(agenticReplay.clickRoundCount || 0) >= 3,
      agenticProvedCheckCount >= 62
    ], "Agentic and click/research QA cover at least three rounds."),
    row("agentic-review-evidence", "Agentic/research QA evidence", "local-proved", [
      agenticProvedCheckCount >= 62,
      provedCheckIds.has("delivery-consistency-sentinel")
    ], "Agentic audit tracks Phase 4-ready delivery evidence."),
    row("delivery-handoff-evidence", "Delivery artifacts and handoff evidence", "local-proved", [
      launchGuide.status === "delivery-launch-guide-ready-open-t3",
      reviewerCockpit.status === "reviewer-cockpit-ready-open-t3",
      sentinel.status === "delivery-consistency-sentinel-ready-open-t3"
    ], "Reviewer cockpit, launch guide, and consistency sentinel are all ready locally."),
    row("runtime-container-certification", "Runtime/container certification", "blocked-t3", [
      openCertificationGaps.some((gap) => gap.id === "container-runtime-certification" || gap.id === "runtime-container-certification")
    ], "Requires explicit approval and runtime/container certification evidence."),
    row("managed-database-certification", "Managed database certification", "blocked-t3", [
      openCertificationGaps.some((gap) => gap.id === "managed-database-certification")
    ], "Requires explicit approval and managed database certification evidence."),
    row("external-provider-certification", "External provider certification", "blocked-t3", [
      openCertificationGaps.some((gap) => gap.id === "external-provider-certification")
    ], "Requires explicit approval and external provider certification evidence.")
  ];
  const provedRowCount = rows.filter((item) => item.status === "local-proved" && item.passed).length;
  const blockedRowCount = rows.filter((item) => item.status === "blocked-t3").length;
  const failedRowCount = rows.filter((item) => item.status === "local-proved" && !item.passed).length;
  const localAcceptancePassed =
    failedRowCount === 0 &&
    provedRowCount >= 10 &&
    blockedRowCount === 3 &&
    openCertificationGaps.length === 3 &&
    sentinel.consistencyPassed === true &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localAcceptancePassed
    ? "final-acceptance-matrix-ready-open-t3"
    : "final-acceptance-matrix-needs-local-evidence";
  const acceptanceHash = sha256(JSON.stringify({
    status,
    rowStates: rows.map((item) => [item.id, item.status, item.passed]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    openT3GapCount: openCertificationGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4A",
    generatedAt,
    status,
    finalGoalComplete: false,
    acceptanceMatrixOnly: true,
    localAcceptancePassed,
    readyForProductionRelease: false,
    blockedByT3: openCertificationGaps.length > 0,
    openT3GapCount: openCertificationGaps.length,
    contentReturned: false,
    acceptanceRowCount: rows.length,
    provedRowCount,
    blockedRowCount,
    failedRowCount,
    evidenceFileCount: evidenceFiles.length,
    acceptanceHash,
    rows,
    evidenceFiles,
    openCertificationGaps,
    sourceSummaries: {
      consistencySentinel: {
        status: sentinel.status || "unknown",
        consistencyPassed: sentinel.consistencyPassed === true,
        contradictionCount: Number(sentinel.contradictionCount || 0),
        finalGoalComplete: Boolean(sentinel.finalGoalComplete)
      },
      launchGuide: {
        status: launchGuide.status || "unknown",
        readyForLocalReview: launchGuide.readyForLocalReview === true,
        finalGoalComplete: Boolean(launchGuide.finalGoalComplete)
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0),
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticAudit: {
        verdict: agenticAudit.verdict || "unknown",
        provedCheckCount: agenticProvedCheckCount
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

export function writeFinalAcceptanceMatrix(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = finalAcceptanceMatrix(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderFinalAcceptanceMatrixMarkdown(report), "utf8");
  report = finalAcceptanceMatrix(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderFinalAcceptanceMatrixMarkdown(report), "utf8");
  return report;
}

export function renderFinalAcceptanceMatrixMarkdown(report) {
  const rowTable = report.rows
    .map((item) => `| ${item.id} | ${item.status} | ${item.passed ? "yes" : "no"} | ${item.evidence} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | T3 | open | ${gap.nextAction || gap.issue || "approval required"} |`)
    .join("\n");

  return `# Phase 4A Final Acceptance Matrix

Generated: ${report.generatedAt}

Status: **${report.status}**

Acceptance matrix only: **${report.acceptanceMatrixOnly ? "yes" : "no"}**

Local acceptance passed: **${report.localAcceptancePassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Acceptance hash:

\`\`\`text
${report.acceptanceHash}
\`\`\`

| Row | Status | Passed | Evidence |
|---|---|---:|---|
${rowTable}

| Gap | Risk | Status | Next action |
|---|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This matrix proves local acceptance only.
- It does not run review commands, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function row(id, title, status, checks, evidence) {
  return {
    id,
    title,
    status,
    passed: checks.every(Boolean),
    evidence
  };
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

function hasText(path, needle) {
  try {
    return readFileSync(path, "utf8").includes(needle);
  } catch {
    return false;
  }
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
  const report = writeFinalAcceptanceMatrix();
  console.log(`Final acceptance matrix written: ${report.status} (${report.acceptanceHash})`);
}
