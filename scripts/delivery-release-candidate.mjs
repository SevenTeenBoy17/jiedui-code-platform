import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { agenticQaReplayDossier } from "./agentic-qa-replay-dossier.mjs";
import { deliveryArtifactIndex } from "./delivery-artifact-index.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";
import { objectiveTraceability } from "./objective-traceability.mjs";
import { visualQaStoryboard } from "./visual-qa-storyboard.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3t-delivery-release-candidate.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3t-delivery-release-candidate.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/phase3n-final-delivery-readiness.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3b-delivery-handoff-dossier.json",
  "qa-artifacts/QA_REPORT.md"
];

export function deliveryReleaseCandidate({
  generatedAt = new Date().toISOString(),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json"),
  finalReadiness = readJson("qa-artifacts/phase3n-final-delivery-readiness.json"),
  agenticReplay = readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
  visualStoryboard = readJson("qa-artifacts/phase3s-visual-qa-storyboard.json"),
  modelContracts = readJson("data/model-contracts.json"),
  overview = {
    localEvidencePassed: completionAudit.localEvidencePassed === true,
    openCertificationGaps: completionAudit.openCertificationGaps || []
  },
  dossier = deliveryHandoffDossier({ completionAudit, agenticAudit, overview, modelContracts }),
  artifactIndex = deliveryArtifactIndex({ dossier }),
  traceability = objectiveTraceability({ completionAudit, agenticAudit, dossier, artifactIndex })
} = {}) {
  const normalizedFinalReadiness = finalReadiness?.status ? finalReadiness : finalDeliveryReadiness({ completionAudit, agenticAudit, dossier, artifactIndex, traceability });
  const normalizedAgenticReplay = agenticReplay?.status ? agenticReplay : agenticQaReplayDossier();
  const normalizedStoryboard = visualStoryboard?.status ? visualStoryboard : visualQaStoryboard();
  const openCertificationGaps = normalizeGaps(
    normalizedFinalReadiness.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    dossier.openCertificationGaps ||
    []
  );
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const releaseChecks = [
    {
      id: "local-completion-evidence",
      status: completionAudit.localEvidencePassed === true ? "ready" : "needs-evidence",
      evidence: `${Number(completionAudit.localRequirementCount || 0)} local rows`
    },
    {
      id: "agentic-internal-qa",
      status: agenticAudit.verdict === "PASS_WITH_OPEN_PRODUCT_GAPS" && Number(normalizedAgenticReplay.provedCheckCount || 0) >= 55 ? "ready" : "needs-evidence",
      evidence: `${Number(normalizedAgenticReplay.provedCheckCount || 0)} proved checks`
    },
    {
      id: "visual-storyboard",
      status: normalizedStoryboard.status === "visual-storyboard-ready-open-t3" && normalizedStoryboard.visualChecksPassed === true ? "ready" : "needs-evidence",
      evidence: `${Number(normalizedStoryboard.surfaceCount || 0)} surfaces / ${Number(normalizedStoryboard.screenshotHashCount || 0)} hashes`
    },
    {
      id: "artifact-integrity",
      status: artifactIndex.status === "artifact-index-ready-with-open-certification-gaps" && artifactIndex.missingArtifactCount === 0 ? "ready" : "needs-evidence",
      evidence: `${Number(artifactIndex.readyArtifactCount || 0)} ready artifacts`
    },
    {
      id: "objective-traceability",
      status: traceability.status === "traceable-with-open-certification-gaps" && traceability.openRequirementCount === 3 ? "ready" : "needs-evidence",
      evidence: `${Number(traceability.provedRequirementCount || 0)} proved / ${Number(traceability.openRequirementCount || 0)} open`
    },
    {
      id: "t3-certification-gate",
      status: openCertificationGaps.length === 3 && normalizedFinalReadiness.finalGoalComplete === false ? "blocked-open" : "invalid",
      evidence: `${openCertificationGaps.length} open T3 gaps`
    }
  ];
  const readyCheckCount = releaseChecks.filter((check) => check.status === "ready").length;
  const blockedCheckCount = releaseChecks.filter((check) => check.status === "blocked-open").length;
  const localEvidenceReady = readyCheckCount >= 5 && blockedCheckCount === 1 && evidenceFiles.every((file) => file.exists && file.sizeBytes > 0);
  const openT3GapCount = openCertificationGaps.length;
  const blockedByT3 = openT3GapCount > 0;
  const status = localEvidenceReady && blockedByT3
    ? "release-candidate-local-evidence-ready-open-t3"
    : "release-candidate-needs-local-evidence";
  const releaseCandidateHash = sha256(JSON.stringify({
    status,
    readyCheckCount,
    blockedCheckCount,
    evidenceHashes: evidenceFiles.map((file) => file.sha256),
    completionVerdict: completionAudit.verdict,
    agenticVerdict: agenticAudit.verdict,
    finalReadinessStatus: normalizedFinalReadiness.status,
    visualStoryboardHash: normalizedStoryboard.storyboardHash,
    openT3GapCount
  }));

  return {
    phase: "3T",
    generatedAt,
    status,
    finalGoalComplete: false,
    releaseCandidateOnly: true,
    readyForHumanReview: localEvidenceReady,
    readyForProductionRelease: false,
    localEvidenceReady,
    blockedByT3,
    openT3GapCount,
    releaseCheckCount: releaseChecks.length,
    readyReleaseCheckCount: readyCheckCount,
    blockedReleaseCheckCount: blockedCheckCount,
    releaseCandidateHash,
    releaseChecks,
    evidenceFiles,
    sourceSummaries: {
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0),
        trackedNonLocalRequirementCount: Number(completionAudit.trackedNonLocalRequirementCount || 0),
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticAudit: {
        verdict: agenticAudit.verdict || "unknown",
        provedCheckCount: Number(normalizedAgenticReplay.provedCheckCount || 0),
        openProductGapCount: Number(normalizedAgenticReplay.openProductGapCount || 0)
      },
      finalReadiness: {
        status: normalizedFinalReadiness.status || "unknown",
        localEvidencePassed: normalizedFinalReadiness.localEvidencePassed === true,
        blockedByT3: normalizedFinalReadiness.blockedByT3 === true,
        finalGoalComplete: Boolean(normalizedFinalReadiness.finalGoalComplete)
      },
      visualStoryboard: {
        status: normalizedStoryboard.status || "unknown",
        surfaceCount: Number(normalizedStoryboard.surfaceCount || 0),
        readySurfaceCount: Number(normalizedStoryboard.readySurfaceCount || 0),
        screenshotHashCount: Number(normalizedStoryboard.screenshotHashCount || 0),
        screenshotBytesEmbedded: normalizedStoryboard.screenshotBytesEmbedded === true
      },
      artifactIndex: {
        status: artifactIndex.status || "unknown",
        artifactCount: Number(artifactIndex.artifactCount || 0),
        readyArtifactCount: Number(artifactIndex.readyArtifactCount || 0),
        missingArtifactCount: Number(artifactIndex.missingArtifactCount || 0),
        contentReturned: artifactIndex.contentReturned === true
      },
      traceability: {
        status: traceability.status || "unknown",
        requirementCount: Number(traceability.requirementCount || 0),
        provedRequirementCount: Number(traceability.provedRequirementCount || 0),
        openRequirementCount: Number(traceability.openRequirementCount || 0),
        finalGoalComplete: Boolean(traceability.finalGoalComplete)
      }
    },
    openCertificationGaps,
    nextApprovedActions: openCertificationGaps.map((gap) => ({
      id: gap.id,
      riskTier: "T3",
      approvalRequired: true,
      action: gap.nextAction || "Run one explicitly approved certification lane with rollback and runtime evidence."
    })),
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
      finalCompletionClaimed: false
    }
  };
}

export function writeDeliveryReleaseCandidate(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = deliveryReleaseCandidate(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryReleaseCandidateMarkdown(report), "utf8");
  report = deliveryReleaseCandidate(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryReleaseCandidateMarkdown(report), "utf8");
  return report;
}

export function renderDeliveryReleaseCandidateMarkdown(report) {
  const checkRows = report.releaseChecks
    .map((check) => `| ${check.id} | ${check.status} | ${check.evidence} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | ${gap.riskTier} | ${gap.status} | ${gap.nextAction} |`)
    .join("\n");

  return `# Phase 3T Delivery Release Candidate

Generated: ${report.generatedAt}

Status: **${report.status}**

Release candidate only: **${report.releaseCandidateOnly ? "yes" : "no"}**

Ready for human review: **${report.readyForHumanReview ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Release candidate hash:

\`\`\`text
${report.releaseCandidateHash}
\`\`\`

## Release Checks

| Check | Status | Evidence |
|---|---|---|
${checkRows}

## Open T3 Gaps

| Gap | Risk | Status | Next approved action |
|---|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This is a local release-candidate handoff bundle only.
- It returns evidence paths, counts, and hashes, not artifact bodies, evidence bodies, approval text, screenshot bytes, secrets, provider responses, or database connection strings.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function evidenceFile(path) {
  const exists = existsSync(path);
  const bytes = exists ? readFileSync(path) : null;
  return {
    path,
    exists,
    sizeBytes: exists ? statSync(path).size : 0,
    sha256: bytes ? sha256(bytes) : ""
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
      nextAction: String(gap.nextAction || gap.remainingWork || gap.issue || "Run one explicitly approved certification lane with rollback and runtime evidence.")
    }));
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
  writeDeliveryReleaseCandidate();
  console.log(`Delivery release candidate written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
