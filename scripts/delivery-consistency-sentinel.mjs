import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryLaunchGuide } from "./delivery-launch-guide.mjs";
import { deliveryReleaseCandidate } from "./delivery-release-candidate.mjs";
import { deliveryReviewerCockpit } from "./delivery-reviewer-cockpit.mjs";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3z-delivery-consistency-sentinel.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3z-delivery-consistency-sentinel.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3n-final-delivery-readiness.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json"
];

export function deliveryConsistencySentinel({
  generatedAt = new Date().toISOString(),
  launchGuide = readJson("qa-artifacts/phase3y-delivery-launch-guide.json"),
  reviewerCockpit = readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json"),
  releaseCandidate = readJson("qa-artifacts/phase3t-delivery-release-candidate.json"),
  finalReadiness = readJson("qa-artifacts/phase3n-final-delivery-readiness.json"),
  artifactIndex = readJson("qa-artifacts/phase3c-delivery-artifact-index.json"),
  traceability = readJson("qa-artifacts/phase3d-objective-traceability.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const readiness = hasStatus(finalReadiness) ? finalReadiness : finalDeliveryReadiness();
  const release = hasStatus(releaseCandidate) ? releaseCandidate : deliveryReleaseCandidate({ finalReadiness: readiness });
  const cockpit = hasStatus(reviewerCockpit) ? reviewerCockpit : deliveryReviewerCockpit({ finalReadiness: readiness, releaseCandidate: release });
  const guide = hasStatus(launchGuide) ? launchGuide : deliveryLaunchGuide({ reviewerCockpit: cockpit, releaseCandidate: release, finalReadiness: readiness });
  const openCertificationGaps = normalizeGaps(
    guide.openCertificationGaps ||
    cockpit.openCertificationGaps ||
    release.openCertificationGaps ||
    readiness.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    []
  );
  const surfaces = [
    surface("final-readiness", readiness, {
      expectedStatus: "final-readiness-local-evidence-ready-open-t3",
      requiredReadyFlag: "localEvidenceReady"
    }),
    surface("release-candidate", release, {
      expectedStatus: "release-candidate-local-evidence-ready-open-t3",
      requiredReadyFlag: "readyForHumanReview"
    }),
    surface("reviewer-cockpit", cockpit, {
      expectedStatus: "reviewer-cockpit-ready-open-t3",
      requiredReadyFlag: "readyForHumanReview"
    }),
    surface("delivery-launch-guide", guide, {
      expectedStatus: "delivery-launch-guide-ready-open-t3",
      requiredReadyFlag: "readyForLocalReview"
    }),
    surface("artifact-index", artifactIndex, {
      expectedStatus: "artifact-index-ready-with-open-certification-gaps"
    }),
    surface("objective-traceability", traceability, {
      expectedStatus: "traceable-with-open-certification-gaps"
    }),
    surface("completion-audit", completionAudit, {
      expectedStatus: "PASS_WITH_OPEN_CERTIFICATION_GAPS",
      statusField: "verdict"
    }),
    surface("agentic-audit", agenticAudit, {
      expectedStatus: "PASS_WITH_OPEN_PRODUCT_GAPS",
      statusField: "verdict"
    })
  ];
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const invariants = buildInvariants(surfaces, evidenceFiles, openCertificationGaps, guide, cockpit);
  const contradictions = invariants
    .filter((item) => item.passed !== true)
    .map((item) => ({
      id: item.id,
      issue: item.evidence
    }));
  const consistencyPassed =
    contradictions.length === 0 &&
    surfaces.length >= 7 &&
    invariants.length >= 7 &&
    openCertificationGaps.length === 3;
  const status = consistencyPassed
    ? "delivery-consistency-sentinel-ready-open-t3"
    : "delivery-consistency-sentinel-needs-review";
  const consistencyHash = sha256(JSON.stringify({
    status,
    surfaceStatuses: surfaces.map((item) => [item.id, item.status, item.finalGoalComplete, item.openT3GapCount]),
    invariantResults: invariants.map((item) => [item.id, item.passed]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    openT3GapCount: openCertificationGaps.length,
    contradictionCount: contradictions.length,
    finalGoalComplete: false
  }));

  return {
    phase: "3Z",
    generatedAt,
    status,
    finalGoalComplete: false,
    sentinelOnly: true,
    consistencyPassed,
    readyForProductionRelease: false,
    blockedByT3: openCertificationGaps.length > 0,
    openT3GapCount: openCertificationGaps.length,
    contentReturned: false,
    contradictionCount: contradictions.length,
    surfaceCount: surfaces.length,
    invariantCount: invariants.length,
    evidenceFileCount: evidenceFiles.length,
    consistencyHash,
    surfaces,
    invariants,
    contradictions,
    evidenceFiles,
    openCertificationGaps,
    sourceSummaries: {
      launchGuide: {
        status: guide.status || "unknown",
        readyForLocalReview: guide.readyForLocalReview === true,
        readyForProductionRelease: guide.readyForProductionRelease === true,
        finalGoalComplete: Boolean(guide.finalGoalComplete)
      },
      reviewerCockpit: {
        status: cockpit.status || "unknown",
        readyForHumanReview: cockpit.readyForHumanReview === true,
        readyForProductionRelease: cockpit.readyForProductionRelease === true,
        finalGoalComplete: Boolean(cockpit.finalGoalComplete)
      },
      completionAudit: {
        verdict: completionAudit.verdict || "unknown",
        localRequirementCount: Number(completionAudit.localRequirementCount || 0),
        finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
      },
      agenticAudit: {
        verdict: agenticAudit.verdict || "unknown",
        provedCheckCount: Number(agenticAudit.provedCheckCount || 0)
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

export function writeDeliveryConsistencySentinel(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = deliveryConsistencySentinel(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryConsistencySentinelMarkdown(report), "utf8");
  report = deliveryConsistencySentinel(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryConsistencySentinelMarkdown(report), "utf8");
  return report;
}

export function renderDeliveryConsistencySentinelMarkdown(report) {
  const surfaceRows = report.surfaces
    .map((item) => `| ${item.id} | ${item.status} | ${item.ready ? "yes" : "no"} | ${item.openT3GapCount} | ${item.finalGoalComplete} |`)
    .join("\n");
  const invariantRows = report.invariants
    .map((item) => `| ${item.id} | ${item.passed ? "pass" : "fail"} | ${item.evidence} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | T3 | open | ${gap.nextAction || gap.issue || "approval required"} |`)
    .join("\n");

  return `# Phase 3Z Delivery Consistency Sentinel

Generated: ${report.generatedAt}

Status: **${report.status}**

Sentinel only: **${report.sentinelOnly ? "yes" : "no"}**

Consistency passed: **${report.consistencyPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Consistency hash:

\`\`\`text
${report.consistencyHash}
\`\`\`

| Surface | Status | Ready | Open T3 gaps | Final complete |
|---|---|---:|---:|---:|
${surfaceRows}

| Invariant | Result | Evidence |
|---|---|---|
${invariantRows}

| Gap | Risk | Status | Next action |
|---|---|---|---|
${gapRows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This sentinel validates metadata consistency only.
- It does not run review commands, record approval, execute certification, deploy, call providers, connect managed databases, or claim final completion.
`;
}

function buildInvariants(surfaces, evidenceFiles, gaps, guide, cockpit) {
  return [
    invariant("final-goal-blocked", surfaces.every((item) => item.finalGoalComplete === false), "Every surface that reports finalGoalComplete keeps it false."),
    invariant("production-release-blocked", surfaces.every((item) => item.readyForProductionRelease !== true), "No surface reports production release readiness."),
    invariant("execution-blocked", surfaces.every((item) => item.executionAllowed !== true && item.certificationExecution !== true && item.certificationStateChanged !== true), "No surface reports execution, certification execution, or certification state change."),
    invariant("content-return-blocked", surfaces.every((item) => item.contentReturned !== true && item.screenshotBytesReturned !== true), "No surface reports artifact, evidence, or screenshot body content returned."),
    invariant("three-open-t3-gaps", gaps.length === 3 && surfaces.filter((item) => Number.isFinite(item.openT3GapCount)).every((item) => item.openT3GapCount === 3), "All surfaces with T3 counts agree on exactly three open gaps."),
    invariant("required-evidence-hashed", evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || "")), "Required evidence files exist with SHA-256 metadata."),
    invariant("reviewer-cockpit-ready", cockpit.status === "reviewer-cockpit-ready-open-t3" && cockpit.readyForProductionRelease === false && cockpit.finalGoalComplete === false, "Phase 3X reviewer cockpit is ready for local review and blocked for production."),
    invariant("launch-guide-ready", guide.status === "delivery-launch-guide-ready-open-t3" && guide.readyForLocalReview === true && guide.readyForProductionRelease === false && guide.finalGoalComplete === false, "Phase 3Y launch guide is ready for local review and blocked for production.")
  ];
}

function surface(id, source, options = {}) {
  const statusField = options.statusField || "status";
  const status = String(source?.[statusField] || "missing");
  const expectedStatus = options.expectedStatus || status;
  const readyFlag = options.requiredReadyFlag;
  const ready = status === expectedStatus && (!readyFlag || source?.[readyFlag] === true);
  return {
    id,
    status,
    ready,
    finalGoalComplete: source?.finalGoalComplete === true,
    readyForProductionRelease: source?.readyForProductionRelease === true,
    executionAllowed: source?.executionAllowed === true,
    certificationExecution: source?.certificationExecution === true || source?.guardrails?.certificationExecution === true,
    certificationStateChanged: source?.certificationStateChanged === true || source?.guardrails?.certificationStateChanged === true,
    contentReturned: source?.contentReturned === true || source?.guardrails?.contentReturned === true,
    screenshotBytesReturned: source?.screenshotBytesReturned === true || source?.sourceSummaries?.agenticReplay?.screenshotBytesReturned === true,
    openT3GapCount: Number.isFinite(Number(source?.openT3GapCount))
      ? Number(source.openT3GapCount)
      : Number.isFinite(Number(source?.openCertificationGapCount))
        ? Number(source.openCertificationGapCount)
        : null
  };
}

function invariant(id, passed, evidence) {
  return { id, passed: passed === true, evidence };
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
  const report = writeDeliveryConsistencySentinel();
  console.log(`Delivery consistency sentinel written: ${report.status} (${report.consistencyHash})`);
}
