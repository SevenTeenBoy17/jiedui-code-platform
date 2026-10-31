import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryArtifactIndex } from "./delivery-artifact-index.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { objectiveTraceability } from "./objective-traceability.mjs";
import { t3CertificationEvidenceClosure } from "./t3-certification-evidence-closure.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3n-final-delivery-readiness.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3n-final-delivery-readiness.md";

export function finalDeliveryReadiness({
  generatedAt = new Date().toISOString(),
  completionAudit = {},
  agenticAudit = {},
  overview = {},
  t3Package = {},
  t3Evidence = {},
  modelContracts = {},
  dossier = deliveryHandoffDossier({ completionAudit, agenticAudit, overview, t3Package, t3Evidence, modelContracts }),
  artifactIndex = deliveryArtifactIndex({ dossier }),
  traceability = objectiveTraceability({ completionAudit, agenticAudit, dossier, artifactIndex }),
  evidenceClosure = t3CertificationEvidenceClosure()
} = {}) {
  const localEvidencePassed = Boolean(
    completionAudit.localEvidencePassed &&
    dossier.localEvidencePassed &&
    artifactIndex.localEvidencePassed &&
    traceability.localEvidencePassed
  );
  const artifactIntegrityPassed = Boolean(
    artifactIndex.status === "artifact-index-ready-with-open-certification-gaps" &&
    artifactIndex.readyArtifactCount === artifactIndex.artifactCount &&
    artifactIndex.missingArtifactCount === 0 &&
    artifactIndex.hashCount === artifactIndex.artifactCount
  );
  const objectiveTraceable = traceability.status === "traceable-with-open-certification-gaps" &&
    traceability.requirementCount >= 12 &&
    traceability.openRequirementCount === 3;
  const agenticPassed = agenticAudit.verdict === "PASS_WITH_OPEN_PRODUCT_GAPS" ||
    agenticAudit.verdict === "PASS_WITH_OPEN_CERTIFICATION_GAPS" ||
    Number(dossier.agenticQa?.provedCheckCount || 0) >= 49;
  const openCertificationGaps = normalizeOpenGaps(
    overview.openCertificationGaps ||
    completionAudit.openCertificationGaps ||
    dossier.openCertificationGaps ||
    []
  );
  const openT3GapCount = openCertificationGaps.length;
  const blockedByT3 = openT3GapCount > 0;
  const finalGoalComplete = false;
  const status = localEvidencePassed && artifactIntegrityPassed && objectiveTraceable && agenticPassed
    ? "final-readiness-local-evidence-ready-open-t3"
    : "final-readiness-needs-local-evidence";

  const readinessHash = sha256(JSON.stringify({
    status,
    localEvidencePassed,
    artifactIntegrityPassed,
    objectiveTraceable,
    agenticPassed,
    openT3GapCount,
    evidenceClosureStatus: evidenceClosure.status,
    completionVerdict: completionAudit.verdict,
    artifactCount: artifactIndex.artifactCount,
    requirementCount: traceability.requirementCount
  }));

  return {
    phase: "3N",
    generatedAt,
    status,
    finalGoalComplete,
    localEvidencePassed,
    artifactIntegrityPassed,
    objectiveTraceable,
    agenticPassed,
    blockedByT3,
    openT3GapCount,
    readinessHash,
    completionAudit: {
      verdict: completionAudit.verdict || "unknown",
      localRequirementCount: Number(completionAudit.localRequirementCount || 0),
      provedLocalRequirementCount: Number(completionAudit.provedLocalRequirementCount || provedLocalRequirementCount(completionAudit)),
      trackedNonLocalRequirementCount: Number(completionAudit.trackedNonLocalRequirementCount || 0),
      finalGoalComplete: Boolean(completionAudit.finalGoalComplete)
    },
    agenticAudit: {
      verdict: agenticAudit.verdict || dossier.agenticQa?.verdict || "unknown",
      provedCheckCount: Number(dossier.agenticQa?.provedCheckCount || 0),
      openIssueCount: Number(dossier.agenticQa?.openIssueCount || 0)
    },
    artifactIntegrity: {
      status: artifactIndex.status || "unknown",
      artifactCount: Number(artifactIndex.artifactCount || 0),
      readyArtifactCount: Number(artifactIndex.readyArtifactCount || 0),
      missingArtifactCount: Number(artifactIndex.missingArtifactCount || 0),
      hashCount: Number(artifactIndex.hashCount || 0),
      contentReturned: artifactIndex.contentReturned === true
    },
    traceability: {
      status: traceability.status || "unknown",
      requirementCount: Number(traceability.requirementCount || 0),
      provedRequirementCount: Number(traceability.provedRequirementCount || 0),
      openRequirementCount: Number(traceability.openRequirementCount || 0),
      finalGoalComplete: Boolean(traceability.finalGoalComplete)
    },
    evidenceClosure: {
      status: evidenceClosure.status || "unknown",
      closureOnly: evidenceClosure.closureOnly === true,
      laneClosureCount: Number(evidenceClosure.laneClosureCount || 0),
      readyLaneClosureCount: Number(evidenceClosure.readyLaneClosureCount || 0),
      validatedEvidenceBundleCount: Number(evidenceClosure.validatedEvidenceBundleCount || 0),
      executionAllowed: evidenceClosure.executionAllowed === true,
      finalGoalComplete: Boolean(evidenceClosure.finalGoalComplete)
    },
    openCertificationGaps,
    nextApprovedActions: openCertificationGaps.map((gap) => ({
      id: gap.id,
      riskTier: "T3",
      approvalRequired: true,
      action: gap.nextAction || gap.remainingWork || gap.issue || "Run one explicitly approved T3 certification lane with rollback and evidence review."
    })),
    guardrails: {
      contentReturned: false,
      artifactContentReturned: false,
      evidenceContentReturned: false,
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

export function writeFinalDeliveryReadiness(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = finalDeliveryReadiness({ ...loadDefaultInputs(), ...options });
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderFinalDeliveryReadinessMarkdown(report), "utf8");
  report = finalDeliveryReadiness({ ...loadDefaultInputs(), ...options });
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderFinalDeliveryReadinessMarkdown(report), "utf8");
  return report;
}

export function renderFinalDeliveryReadinessMarkdown(report) {
  const rows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | T3 | open | ${gap.nextAction || gap.issue || "approval required"} |`)
    .join("\n");

  return `# Phase 3N Final Delivery Readiness

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Local evidence passed: **${report.localEvidencePassed ? "yes" : "no"}**

Artifact integrity passed: **${report.artifactIntegrityPassed ? "yes" : "no"}**

Objective traceable: **${report.objectiveTraceable ? "yes" : "no"}**

Agentic passed: **${report.agenticPassed ? "yes" : "no"}**

Blocked by T3: **${report.blockedByT3 ? "yes" : "no"}**

Readiness hash:

\`\`\`text
${report.readinessHash}
\`\`\`

| Gap | Risk | Status | Next action |
|---|---|---|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This cockpit aggregates local readiness metadata only.
- It does not return artifact bodies, evidence bodies, approval text, or secrets.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function normalizeOpenGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : [])
    .filter((gap) => gap && typeof gap === "object")
    .map((gap) => ({
      id: String(gap.id || "unknown-gap"),
      title: String(gap.title || gap.id || "Open T3 gap"),
      riskTier: "T3",
      status: "open",
      blocker: true,
      issue: String(gap.issue || gap.remainingWork || gap.nextAction || "T3 approval and evidence are still required."),
      nextAction: String(gap.nextAction || gap.remainingWork || gap.issue || "Run one explicitly approved T3 certification lane with rollback and evidence review.")
    }));
}

function loadDefaultInputs() {
  const completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json");
  const agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json");
  const modelContracts = readJson("data/model-contracts.json");
  const overview = {
    localEvidencePassed: Boolean(completionAudit.localEvidencePassed),
    openCertificationGaps: completionAudit.openCertificationGaps || []
  };
  return { completionAudit, agenticAudit, modelContracts, overview };
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function provedLocalRequirementCount(completionAudit) {
  return (completionAudit.requirements || [])
    .filter((item) => item.localRequired !== false && item.status === "proved")
    .length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFinalDeliveryReadiness();
  console.log(`Final delivery readiness written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
}
