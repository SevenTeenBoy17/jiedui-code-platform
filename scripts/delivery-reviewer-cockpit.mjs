import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { agenticQaReplayDossier } from "./agentic-qa-replay-dossier.mjs";
import { deliveryArtifactIndex } from "./delivery-artifact-index.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { deliveryReleaseCandidate } from "./delivery-release-candidate.mjs";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";
import { objectiveTraceability } from "./objective-traceability.mjs";
import { t3RunPacketVerifier } from "./t3-run-packet-verifier.mjs";
import { t3SingleLaneRunPackets } from "./t3-single-lane-run-packets.mjs";
import { visualQaStoryboard } from "./visual-qa-storyboard.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3x-delivery-reviewer-cockpit.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3x-delivery-reviewer-cockpit.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/phase3n-final-delivery-readiness.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
  "qa-artifacts/phase3w-t3-run-packet-verifier.json",
  "qa-artifacts/QA_REPORT.md"
];

export function deliveryReviewerCockpit({
  generatedAt = new Date().toISOString(),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json"),
  modelContracts = readJson("data/model-contracts.json"),
  overview = {
    localEvidencePassed: completionAudit.localEvidencePassed === true,
    openCertificationGaps: completionAudit.openCertificationGaps || []
  },
  dossier = deliveryHandoffDossier({ completionAudit, agenticAudit, overview, modelContracts }),
  artifactIndex = deliveryArtifactIndex({ dossier }),
  traceability = objectiveTraceability({ completionAudit, agenticAudit, dossier, artifactIndex }),
  agenticReplay = agenticQaReplayDossier(),
  visualStoryboard = visualQaStoryboard(),
  finalReadiness = finalDeliveryReadiness({ completionAudit, agenticAudit, overview, modelContracts, dossier, artifactIndex, traceability }),
  releaseCandidate = deliveryReleaseCandidate({ completionAudit, agenticAudit, finalReadiness, agenticReplay, visualStoryboard, dossier, artifactIndex, traceability }),
  runPacketBundle = t3SingleLaneRunPackets(),
  runPacketVerifier = t3RunPacketVerifier({ runPacketBundle })
} = {}) {
  const openCertificationGaps = normalizeGaps(
    finalReadiness.openCertificationGaps ||
    releaseCandidate.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const sections = [
    reviewSection("local-evidence", "Local completion evidence", completionAudit.localEvidencePassed === true && Number(completionAudit.localRequirementCount || 0) >= 38, `${Number(completionAudit.localRequirementCount || 0)} local rows`, completionAudit.auditHash),
    reviewSection("agentic-qa", "Agentic QA replay", agenticReplay.status === "agentic-qa-replay-ready-open-t3" && Number(agenticReplay.provedCheckCount || 0) >= 55, `${Number(agenticReplay.provedCheckCount || 0)} checks / ${Number(agenticReplay.clickRoundCount || 0)} rounds`, agenticReplay.replayHash),
    reviewSection("visual-storyboard", "Visual storyboard", visualStoryboard.status === "visual-storyboard-ready-open-t3" && visualStoryboard.visualChecksPassed === true, `${Number(visualStoryboard.surfaceCount || 0)} surfaces`, visualStoryboard.storyboardHash),
    reviewSection("artifact-integrity", "Artifact integrity", artifactIndex.status === "artifact-index-ready-with-open-certification-gaps" && artifactIndex.missingArtifactCount === 0, `${Number(artifactIndex.readyArtifactCount || 0)}/${Number(artifactIndex.artifactCount || 0)} artifacts`, artifactIndex.indexHash),
    reviewSection("objective-traceability", "Objective traceability", traceability.status === "traceable-with-open-certification-gaps" && traceability.openRequirementCount === 3, `${Number(traceability.provedRequirementCount || 0)} proved / ${Number(traceability.openRequirementCount || 0)} open`, traceability.traceabilityHash),
    reviewSection("release-candidate", "Release candidate", releaseCandidate.status === "release-candidate-local-evidence-ready-open-t3" && releaseCandidate.readyForHumanReview === true, `${Number(releaseCandidate.readyReleaseCheckCount || 0)}/${Number(releaseCandidate.releaseCheckCount || 0)} ready checks`, releaseCandidate.releaseCandidateHash),
    reviewSection("t3-run-packet-verifier", "T3 run-packet verifier", runPacketVerifier.status === "t3-run-packet-verifier-ready-execution-blocked" && runPacketVerifier.verifierOnly === true && runPacketVerifier.executionAllowed === false, `${Number(runPacketVerifier.readyPacketVerificationCount || 0)}/${Number(runPacketVerifier.packetVerificationCount || 0)} packet checks`, runPacketVerifier.verifierHash),
    reviewSection("production-release-gate", "Production release gate", openCertificationGaps.length === 3 && finalReadiness.finalGoalComplete === false, `${openCertificationGaps.length} open T3 gaps`, releaseCandidate.releaseCandidateHash, "blocked-open")
  ];
  const readySectionCount = sections.filter((section) => section.status === "ready").length;
  const blockedSectionCount = sections.filter((section) => section.status === "blocked-open").length;
  const reviewReady =
    readySectionCount === sections.length - 1 &&
    blockedSectionCount === 1 &&
    openCertificationGaps.length === 3 &&
    finalReadiness.finalGoalComplete === false &&
    releaseCandidate.readyForHumanReview === true &&
    releaseCandidate.readyForProductionRelease === false &&
    runPacketVerifier.executionAllowed === false &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0);
  const status = reviewReady ? "reviewer-cockpit-ready-open-t3" : "reviewer-cockpit-needs-local-evidence";
  const reviewerCockpitHash = sha256(JSON.stringify({
    status,
    readySectionCount,
    blockedSectionCount,
    openT3GapCount: openCertificationGaps.length,
    sectionHashes: sections.map((section) => section.sourceHash || ""),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || "")
  }));

  return {
    phase: "3X",
    generatedAt,
    status,
    finalGoalComplete: false,
    reviewerCockpitOnly: true,
    readyForHumanReview: reviewReady,
    readyForProductionRelease: false,
    localEvidenceReady: reviewReady,
    blockedByT3: openCertificationGaps.length > 0,
    openT3GapCount: openCertificationGaps.length,
    contentReturned: false,
    sectionCount: sections.length,
    readySectionCount,
    blockedSectionCount,
    reviewerCockpitHash,
    sections,
    evidenceFiles,
    sourceSummaries: {
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0),
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticReplay: {
        status: agenticReplay.status || "unknown",
        provedCheckCount: Number(agenticReplay.provedCheckCount || 0),
        clickRoundCount: Number(agenticReplay.clickRoundCount || 0),
        screenshotBytesReturned: agenticReplay.screenshotBytesReturned === true
      },
      visualStoryboard: {
        status: visualStoryboard.status || "unknown",
        surfaceCount: Number(visualStoryboard.surfaceCount || 0),
        screenshotBytesEmbedded: visualStoryboard.screenshotBytesEmbedded === true
      },
      artifactIndex: {
        status: artifactIndex.status || "unknown",
        artifactCount: Number(artifactIndex.artifactCount || 0),
        missingArtifactCount: Number(artifactIndex.missingArtifactCount || 0),
        contentReturned: artifactIndex.contentReturned === true
      },
      finalReadiness: {
        status: finalReadiness.status || "unknown",
        blockedByT3: finalReadiness.blockedByT3 === true,
        finalGoalComplete: Boolean(finalReadiness.finalGoalComplete)
      },
      releaseCandidate: {
        status: releaseCandidate.status || "unknown",
        readyForHumanReview: releaseCandidate.readyForHumanReview === true,
        readyForProductionRelease: releaseCandidate.readyForProductionRelease === true,
        finalGoalComplete: Boolean(releaseCandidate.finalGoalComplete)
      },
      runPacketVerifier: {
        status: runPacketVerifier.status || "unknown",
        verifierOnly: runPacketVerifier.verifierOnly === true,
        executionAllowed: runPacketVerifier.executionAllowed === true,
        finalGoalComplete: Boolean(runPacketVerifier.finalGoalComplete)
      }
    },
    openCertificationGaps,
    nextReviewActions: openCertificationGaps.map((gap) => ({
      id: gap.id,
      riskTier: "T3",
      approvalRequired: true,
      action: gap.nextAction || gap.remainingWork || gap.issue || "Run one explicitly approved T3 certification lane with rollback and evidence review."
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

export function writeDeliveryReviewerCockpit(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = deliveryReviewerCockpit(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryReviewerCockpitMarkdown(report), "utf8");
  report = deliveryReviewerCockpit(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryReviewerCockpitMarkdown(report), "utf8");
  return report;
}

export function renderDeliveryReviewerCockpitMarkdown(report) {
  const sectionRows = report.sections
    .map((section) => `| ${section.id} | ${section.status} | ${section.evidence} | ${section.sourceHash || "none"} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | T3 | open | ${gap.nextAction || gap.issue || "approval required"} |`)
    .join("\n");

  return `# Phase 3X Delivery Reviewer Cockpit

Generated: ${report.generatedAt}

Status: **${report.status}**

Reviewer cockpit only: **${report.reviewerCockpitOnly ? "yes" : "no"}**

Ready for human review: **${report.readyForHumanReview ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Cockpit hash:

\`\`\`text
${report.reviewerCockpitHash}
\`\`\`

| Section | Status | Evidence | Source hash |
|---|---|---|---|
${sectionRows}

| Gap | Risk | Status | Next action |
|---|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This cockpit aggregates metadata only for final review.
- It does not return artifact bodies, evidence bodies, screenshot bytes, approval text, or secrets.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function reviewSection(id, title, ready, evidence, sourceHash = "", blockedStatus = "ready") {
  return {
    id,
    title,
    status: ready ? blockedStatus : "needs-evidence",
    evidence: String(evidence || "pending"),
    sourceHash: sourceHash && /^[a-f0-9]{64}$/i.test(sourceHash) ? sourceHash : null
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
  const report = writeDeliveryReviewerCockpit();
  console.log(`Delivery reviewer cockpit written: ${report.status} (${report.reviewerCockpitHash})`);
}
