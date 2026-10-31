import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { certificationOverview, loadCompletionAudit } from "./certification-overview.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { summarizeT3Evidence } from "./t3-evidence-intake.mjs";
import { t3CertificationPackage } from "./t3-certification-package.mjs";
import { t3CertificationPreflight } from "./t3-certification-preflight.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3b-delivery-handoff-dossier.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3b-delivery-handoff-dossier.md";
const COMPLETION_AUDIT_PATH = "qa-artifacts/phase2s-completion-audit.json";
const AGENTIC_AUDIT_PATH = "qa-artifacts/phase2o-agentic-audit.json";
const MODEL_CONTRACTS_PATH = "data/model-contracts.json";

export function buildDeliveryHandoffExport({
  generatedAt = new Date().toISOString(),
  outputJsonPath = DEFAULT_OUTPUT_JSON,
  outputMarkdownPath = DEFAULT_OUTPUT_MARKDOWN
} = {}) {
  const completionAudit = loadCompletionAudit(COMPLETION_AUDIT_PATH);
  const agenticAudit = readJson(AGENTIC_AUDIT_PATH, {});
  const modelContracts = readJson(MODEL_CONTRACTS_PATH, {});
  const overview = certificationOverview({ completionAudit });
  const preflight = t3CertificationPreflight({}, { sandboxPolicy: true });
  const t3Package = t3CertificationPackage({ preflight, overview, generatedAt });
  const t3Evidence = summarizeT3Evidence([]);
  const dossier = deliveryHandoffDossier({
    completionAudit,
    agenticAudit,
    overview,
    t3Package,
    t3Evidence,
    modelContracts,
    generatedAt
  });
  const outputArtifacts = [
    { path: outputJsonPath, format: "json", purpose: "machine-readable delivery handoff export" },
    { path: outputMarkdownPath, format: "markdown", purpose: "reader-facing delivery handoff export" }
  ];
  const artifactManifest = unique([
    ...dossier.artifactManifest,
    ...outputArtifacts.map((item) => item.path)
  ]);

  return {
    phase: "3B",
    generatedAt,
    status: dossier.status,
    finalGoalComplete: false,
    localEvidencePassed: dossier.localEvidencePassed,
    verdict: dossier.verdict,
    handoffSummary: {
      localRequirementCount: dossier.localRequirementCount,
      provedLocalRequirementCount: dossier.provedLocalRequirementCount,
      trackedNonLocalRequirementCount: dossier.trackedNonLocalRequirementCount,
      agenticVerdict: dossier.agenticQa.verdict,
      agenticProvedCheckCount: dossier.agenticQa.provedCheckCount,
      t3PackageStatus: dossier.t3Package.status,
      t3PackageExecutionAllowed: dossier.t3Package.executionAllowed,
      t3EvidenceStatus: dossier.t3Evidence.status,
      t3EvidenceCandidateCount: dossier.t3Evidence.candidateCount
    },
    modelRouting: dossier.modelRouting,
    openCertificationGapCount: dossier.openCertificationGapCount,
    openCertificationGaps: dossier.openCertificationGaps.map((gap) => ({
      id: gap.id,
      title: gap.title || gap.id,
      owner: gap.owner,
      riskTier: gap.riskTier || "T3",
      status: "open",
      approvalRequired: true,
      nextAction: gap.nextAction || gap.fix
    })),
    nextActions: dossier.nextActions,
    outputArtifacts,
    artifactManifest,
    artifactCount: artifactManifest.length,
    artifactInventory: artifactManifest.map(inspectArtifact),
    verificationSummary: {
      completionAudit: COMPLETION_AUDIT_PATH,
      agenticAudit: AGENTIC_AUDIT_PATH,
      sourceDossier: "scripts/delivery-handoff-dossier.mjs",
      exportScript: "scripts/export-delivery-handoff.mjs",
      qaScript: "tests/delivery-handoff-export.mjs"
    },
    guardrails: {
      offlineOnlyExport: true,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      finalCompletionClaimed: false
    }
  };
}

export function writeDeliveryHandoffExport(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });

  const initialReport = buildDeliveryHandoffExport({ ...options, outputJsonPath, outputMarkdownPath });
  writeFileSync(outputJsonPath, `${JSON.stringify(initialReport, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryHandoffMarkdown(initialReport), "utf8");

  const finalReport = buildDeliveryHandoffExport({ ...options, outputJsonPath, outputMarkdownPath });
  writeFileSync(outputJsonPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryHandoffMarkdown(finalReport), "utf8");
  return finalReport;
}

export function renderDeliveryHandoffMarkdown(report) {
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | ${gap.owner || "unknown"} | ${gap.riskTier} | ${gap.status} | ${escapePipes(gap.nextAction || "Await approved certification lane.")} |`)
    .join("\n");
  const artifactRows = report.artifactInventory
    .map((item) => `| ${item.path} | ${item.exists ? "yes" : "no"} | ${item.sizeBytes} |`)
    .join("\n");
  const guardrailRows = Object.entries(report.guardrails)
    .map(([key, value]) => `| ${key} | ${value === true ? "yes" : "no"} |`)
    .join("\n");
  const actionRows = report.nextActions
    .map((item) => `| ${item.id} | ${item.riskTier} | ${item.approvalRequired ? "yes" : "no"} | ${escapePipes(item.action)} |`)
    .join("\n");

  return `# Phase 3B Delivery Handoff Export

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Local evidence passed: **${report.localEvidencePassed ? "yes" : "no"}**

Open certification gaps: **${report.openCertificationGapCount}**

## Handoff Summary

| Metric | Value |
|---|---|
| Verdict | ${report.verdict} |
| Local requirement rows | ${report.handoffSummary.localRequirementCount} |
| Proved local requirement rows | ${report.handoffSummary.provedLocalRequirementCount} |
| Agentic verdict | ${report.handoffSummary.agenticVerdict} |
| Agentic proved checks | ${report.handoffSummary.agenticProvedCheckCount} |
| T3 package execution allowed | ${report.handoffSummary.t3PackageExecutionAllowed ? "yes" : "no"} |
| T3 evidence candidates | ${report.handoffSummary.t3EvidenceCandidateCount} |

## Open Certification Gaps

| Gap | Owner | Risk | Status | Next action |
|---|---|---|---|---|
${gapRows}

## Materialized Artifacts

| Artifact | Exists | Size bytes |
|---|---|---|
${artifactRows}

## Guardrails

| Guardrail | Enabled |
|---|---|
${guardrailRows}

## Next Approved Actions

| Gap | Risk | Approval required | Action |
|---|---|---|---|
${actionRows}

## Notes

- This export is local and offline.
- It is a handoff package, not a certification run.
- Final completion remains false until the open T3 gaps are explicitly approved, executed, reviewed, and verified.
`;
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function inspectArtifact(path) {
  if (!existsSync(path)) {
    return { path, exists: false, sizeBytes: 0 };
  }
  return { path, exists: true, sizeBytes: statSync(path).size };
}

function unique(items) {
  return [...new Set(items)];
}

function escapePipes(value) {
  return String(value || "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeDeliveryHandoffExport();
  console.log(`Delivery handoff export written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; openCertificationGaps=${report.openCertificationGapCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
