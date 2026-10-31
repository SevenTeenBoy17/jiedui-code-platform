import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const artifactsDir = resolve("qa-artifacts");
const auditJsonPath = join(artifactsDir, "phase2s-completion-audit.json");
const auditMdPath = join(artifactsDir, "phase2s-completion-audit.md");

mkdirSync(artifactsDir, { recursive: true });

const failures = [];
const requirements = [];

const sourceFiles = [
  "package.json",
  "data/model-contracts.json",
  "src/app.js",
  "src/styles.css",
  "scripts/fullstack-server.mjs",
  "scripts/model-provider.mjs",
  "scripts/provider-certification.mjs",
  "scripts/sandbox-isolation.mjs",
  "scripts/sandbox-certification.mjs",
  "scripts/sqlite-repository.mjs",
  "scripts/database-certification.mjs",
  "scripts/certification-overview.mjs",
  "scripts/delivery-handoff-dossier.mjs",
  "scripts/export-delivery-handoff.mjs",
  "scripts/delivery-artifact-index.mjs",
  "scripts/agentic-qa-replay-dossier.mjs",
  "scripts/visual-qa-storyboard.mjs",
  "scripts/delivery-release-candidate.mjs",
  "scripts/t3-certification-next-actions.mjs",
  "scripts/t3-single-lane-run-packets.mjs",
  "scripts/t3-run-packet-verifier.mjs",
  "scripts/delivery-reviewer-cockpit.mjs",
  "scripts/delivery-launch-guide.mjs",
  "scripts/delivery-consistency-sentinel.mjs",
  "scripts/final-acceptance-matrix.mjs",
  "scripts/certification-blocker-board.mjs",
  "scripts/user-acceptance-rehearsal.mjs",
  "scripts/delivery-evidence-navigator.mjs",
  "scripts/local-delivery-summary-packet.mjs",
  "scripts/local-delivery-handoff-brief.mjs",
  "scripts/local-delivery-quickstart-bundle.mjs",
  "scripts/local-delivery-verification-suite.mjs",
  "scripts/final-local-handoff-checkpoint.mjs",
  "scripts/objective-traceability.mjs",
  "scripts/t3-approval-packet.mjs",
  "scripts/t3-dry-run-rehearsal.mjs",
  "scripts/t3-approval-request-export.mjs",
  "scripts/t3-approval-integrity.mjs",
  "scripts/t3-approval-lock.mjs",
  "scripts/t3-approval-verifier.mjs",
  "scripts/t3-approval-candidates.mjs",
  "scripts/t3-approval-execution-gate.mjs",
  "scripts/t3-certification-evidence-closure.mjs",
  "scripts/final-delivery-readiness.mjs",
  "scripts/t3-evidence-bundle-templates.mjs",
  "scripts/t3-operator-checklist.mjs",
  "scripts/t3-operator-transcript-validator.mjs",
  "scripts/t3-certification-preflight.mjs",
  "scripts/t3-certification-package.mjs",
  "scripts/t3-evidence-intake.mjs",
  "tests/agentic-audit.mjs",
  "tests/click-flow.mjs",
  "tests/visual-fidelity.mjs",
  "tests/provider-transport.mjs",
  "tests/provider-certification.mjs",
  "tests/sandbox-isolation.mjs",
  "tests/sandbox-certification.mjs",
  "tests/database-adapter.mjs",
  "tests/database-certification.mjs",
  "tests/certification-overview.mjs",
  "tests/delivery-handoff-dossier.mjs",
  "tests/delivery-handoff-export.mjs",
  "tests/delivery-artifact-index.mjs",
  "tests/agentic-qa-replay-dossier.mjs",
  "tests/visual-qa-storyboard.mjs",
  "tests/delivery-release-candidate.mjs",
  "tests/t3-certification-next-actions.mjs",
  "tests/t3-single-lane-run-packets.mjs",
  "tests/t3-run-packet-verifier.mjs",
  "tests/delivery-reviewer-cockpit.mjs",
  "tests/delivery-launch-guide.mjs",
  "tests/delivery-consistency-sentinel.mjs",
  "tests/final-acceptance-matrix.mjs",
  "tests/certification-blocker-board.mjs",
  "tests/user-acceptance-rehearsal.mjs",
  "tests/delivery-evidence-navigator.mjs",
  "tests/local-delivery-summary-packet.mjs",
  "tests/local-delivery-handoff-brief.mjs",
  "tests/local-delivery-quickstart-bundle.mjs",
  "tests/local-delivery-verification-suite.mjs",
  "tests/final-local-handoff-checkpoint.mjs",
  "tests/objective-traceability.mjs",
  "tests/t3-approval-packet.mjs",
  "tests/t3-dry-run-rehearsal.mjs",
  "tests/t3-approval-request-export.mjs",
  "tests/t3-approval-integrity.mjs",
  "tests/t3-approval-lock.mjs",
  "tests/t3-approval-verifier.mjs",
  "tests/t3-approval-candidates.mjs",
  "tests/t3-approval-execution-gate.mjs",
  "tests/t3-certification-evidence-closure.mjs",
  "tests/final-delivery-readiness.mjs",
  "tests/t3-evidence-bundle-templates.mjs",
  "tests/t3-operator-checklist.mjs",
  "tests/t3-operator-transcript-validator.mjs",
  "tests/t3-certification-preflight.mjs",
  "tests/t3-certification-package.mjs",
  "tests/t3-evidence-intake.mjs",
  "specs/phase2p-live-provider-transport-contract.md",
  "specs/phase2u-provider-certification-readiness-contract.md",
  "specs/phase2q-sandbox-isolation-hardening-contract.md",
  "specs/phase2r-sql-database-adapter-contract.md",
  "specs/phase2v-database-certification-readiness-contract.md",
  "specs/phase2w-delivery-certification-overview-contract.md",
  "specs/phase2x-t3-certification-preflight-contract.md",
  "specs/phase2y-t3-certification-package-contract.md",
  "specs/phase2z-t3-evidence-intake-contract.md",
  "specs/phase3a-delivery-handoff-dossier-contract.md",
  "specs/phase3b-delivery-handoff-export-contract.md",
  "specs/phase3c-delivery-artifact-index-contract.md",
  "specs/phase3r-agentic-qa-replay-dossier-contract.md",
  "specs/phase3s-visual-qa-storyboard-contract.md",
  "specs/phase3t-delivery-release-candidate-contract.md",
  "specs/phase3u-t3-certification-next-actions-contract.md",
  "specs/phase3v-t3-single-lane-run-packets-contract.md",
  "specs/phase3w-t3-run-packet-verifier-contract.md",
  "specs/phase3x-delivery-reviewer-cockpit-contract.md",
  "specs/phase3y-delivery-launch-guide-contract.md",
  "specs/phase3z-delivery-consistency-sentinel-contract.md",
  "specs/phase4a-final-acceptance-matrix-contract.md",
  "specs/phase4b-certification-blocker-board-contract.md",
  "specs/phase4c-user-acceptance-rehearsal-contract.md",
  "specs/phase4d-delivery-evidence-navigator-contract.md",
  "specs/phase4e-local-delivery-summary-packet-contract.md",
  "specs/phase4f-local-delivery-handoff-brief-contract.md",
  "specs/phase4g-local-delivery-quickstart-bundle-contract.md",
  "specs/phase4h-local-delivery-verification-suite-contract.md",
  "specs/phase4i-final-local-handoff-checkpoint-contract.md",
  "specs/phase3d-objective-traceability-contract.md",
  "specs/phase3e-t3-approval-packet-contract.md",
  "specs/phase3f-t3-dry-run-rehearsal-contract.md",
  "specs/phase3g-t3-approval-request-export-contract.md",
  "specs/phase3h-t3-approval-integrity-contract.md",
  "specs/phase3i-t3-approval-lock-contract.md",
  "specs/phase3j-t3-approval-verifier-contract.md",
  "specs/phase3k-t3-approval-candidates-contract.md",
  "specs/phase3l-t3-approval-execution-gate-contract.md",
  "specs/phase3m-t3-certification-evidence-closure-contract.md",
  "specs/phase3n-final-delivery-readiness-contract.md",
  "specs/phase3o-t3-evidence-bundle-templates-contract.md",
  "specs/phase3p-t3-operator-checklist-contract.md",
  "specs/phase3q-t3-operator-transcript-validator-contract.md",
  "specs/phase2s-delivery-completion-audit-contract.md",
  "specs/phase2t-sandbox-certification-readiness-contract.md",
  "qa-artifacts/QA_REPORT.md",
  "qa-artifacts/phase3b-delivery-handoff-dossier.json",
  "qa-artifacts/phase3b-delivery-handoff-dossier.md",
  "qa-artifacts/phase3h-t3-approval-integrity.json",
  "qa-artifacts/phase3h-t3-approval-integrity.md",
  "qa-artifacts/phase3i-t3-approval-lock.json",
  "qa-artifacts/phase3i-t3-approval-lock.md",
  "qa-artifacts/phase3j-t3-approval-verifier.json",
  "qa-artifacts/phase3j-t3-approval-verifier.md",
  "qa-artifacts/phase3k-t3-approval-candidates.json",
  "qa-artifacts/phase3k-t3-approval-candidates.md",
  "qa-artifacts/phase3l-t3-approval-execution-gate.json",
  "qa-artifacts/phase3l-t3-approval-execution-gate.md",
  "qa-artifacts/phase3m-t3-certification-evidence-closure.json",
  "qa-artifacts/phase3m-t3-certification-evidence-closure.md",
  "qa-artifacts/phase3n-final-delivery-readiness.json",
  "qa-artifacts/phase3n-final-delivery-readiness.md",
  "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
  "qa-artifacts/phase3o-t3-evidence-bundle-templates.md",
  "qa-artifacts/phase3p-t3-operator-checklist.json",
  "qa-artifacts/phase3p-t3-operator-checklist.md",
  "qa-artifacts/phase3q-t3-operator-transcript-validator.json",
  "qa-artifacts/phase3q-t3-operator-transcript-validator.md",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.md",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3s-visual-qa-storyboard.md",
  "qa-artifacts/phase3t-delivery-release-candidate.json",
  "qa-artifacts/phase3t-delivery-release-candidate.md",
  "qa-artifacts/phase3u-t3-certification-next-actions.json",
  "qa-artifacts/phase3u-t3-certification-next-actions.md",
  "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
  "qa-artifacts/phase3v-t3-single-lane-run-packets.md",
  "qa-artifacts/phase3w-t3-run-packet-verifier.json",
  "qa-artifacts/phase3w-t3-run-packet-verifier.md",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
  "qa-artifacts/phase3x-delivery-reviewer-cockpit.md",
  "qa-artifacts/phase3y-delivery-launch-guide.json",
  "qa-artifacts/phase3y-delivery-launch-guide.md",
  "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
  "qa-artifacts/phase3z-delivery-consistency-sentinel.md",
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase4a-final-acceptance-matrix.md",
  "qa-artifacts/phase4b-certification-blocker-board.json",
  "qa-artifacts/phase4b-certification-blocker-board.md",
  "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
  "qa-artifacts/phase4c-user-acceptance-rehearsal.md",
  "qa-artifacts/phase4d-delivery-evidence-navigator.json",
  "qa-artifacts/phase4d-delivery-evidence-navigator.md",
  "qa-artifacts/phase4e-local-delivery-summary-packet.json",
  "qa-artifacts/phase4e-local-delivery-summary-packet.md",
  "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
  "qa-artifacts/phase4f-local-delivery-handoff-brief.md",
  "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json",
  "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md",
  "qa-artifacts/phase4h-local-delivery-verification-suite.json",
  "qa-artifacts/phase4h-local-delivery-verification-suite.md",
  "qa-artifacts/phase4i-final-local-handoff-checkpoint.json",
  "qa-artifacts/phase4i-final-local-handoff-checkpoint.md",
  "qa-artifacts/phase2o-agentic-audit.json"
];

const packageManifest = readJson("package.json");
const modelContracts = readJson("data/model-contracts.json");
const agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json");
const handoffExport = existsSync("qa-artifacts/phase3b-delivery-handoff-dossier.json")
  ? readJson("qa-artifacts/phase3b-delivery-handoff-dossier.json")
  : {};
const handoffExportMarkdown = existsSync("qa-artifacts/phase3b-delivery-handoff-dossier.md")
  ? readFileSync("qa-artifacts/phase3b-delivery-handoff-dossier.md", "utf8")
  : "";
const sourceBundle = sourceFiles
  .filter((file) => existsSync(file))
  .map((file) => `\n--- ${file} ---\n${readFileSync(file, "utf8")}`)
  .join("\n");

const provedCheckIds = new Set(
  (agenticAudit.completionMatrix || [])
    .filter((item) => item.status === "proved")
    .map((item) => item.id)
);

const openCertificationGaps = (agenticAudit.issueList || [])
  .filter((item) => item.status === "open")
  .map((item) => ({
    id: item.id,
    owner: item.owner,
    severity: item.severity,
    issue: item.issue,
    fix: item.fix
  }));

const expectedGapIds = [
  "container-runtime-certification",
  "managed-database-certification",
  "external-provider-certification"
];

for (const file of sourceFiles) {
  if (!existsSync(file)) failures.push(`missing evidence file: ${file}`);
}

addRequirement({
  id: "model-routing-contract",
  status: all([
    modelContracts.coding?.primaryModel === "claude-sonnet-4-6",
    modelContracts.coding?.fallbackModel === "gpt-5.3-codex-spark",
    modelContracts.coding?.fallbackAfterMs === 1000,
    modelContracts.image?.model === "gpt-image-2",
    provedCheckIds.has("model-routing-contract"),
    sourceBundle.includes("simulatePrimaryLatencyMs"),
    sourceBundle.includes("/api/ai/route-audit")
  ]),
  evidence: `primary=${modelContracts.coding?.primaryModel}, fallback=${modelContracts.coding?.fallbackModel}, fallbackAfterMs=${modelContracts.coding?.fallbackAfterMs}, image=${modelContracts.image?.model}, agenticCheck=${provedCheckIds.has("model-routing-contract")}`,
  files: ["data/model-contracts.json", "tests/agentic-audit.mjs", "scripts/fullstack-server.mjs"]
});

const keyShapedMatches = sourceBundle.match(/\bsk-[A-Za-z0-9_-]{20,}\b/g) || [];
const assignmentSecretMatches = sourceBundle.match(/\b(?:CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL)\s*=\s*["'][^"']+["']/g) || [];
addRequirement({
  id: "secret-safety",
  status: all([
    keyShapedMatches.length === 0,
    assignmentSecretMatches.length === 0,
    modelContracts.secrets?.policy?.includes("No provider API keys"),
    provedCheckIds.has("no-key-shaped-secret-in-source-bundle")
  ]),
  evidence: `keyShapedMatches=${keyShapedMatches.length}, secretAssignments=${assignmentSecretMatches.length}, agenticCheck=${provedCheckIds.has("no-key-shaped-secret-in-source-bundle")}`,
  files: ["data/model-contracts.json", "tests/agentic-audit.mjs", "tests/provider-transport.mjs"]
});

addRequirement({
  id: "provider-guard-transport",
  status: all([
    packageManifest.scripts?.["qa:provider-transport"] === "node tests/provider-transport.mjs",
    modelContracts.provider?.transport?.localhostMockVerified === true,
    sourceBundle.includes("executeProviderTransport"),
    sourceBundle.includes("T3-external-model-call"),
    sourceBundle.includes("localhost mock provider"),
    sourceBundle.includes("Phase 2P Live Provider Transport Contract"),
    provedCheckIds.has("localhost-provider-transport-harness")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:provider-transport"] || "missing"}, localhostMockVerified=${modelContracts.provider?.transport?.localhostMockVerified}, agenticCheck=${provedCheckIds.has("localhost-provider-transport-harness")}`,
  files: ["scripts/model-provider.mjs", "tests/provider-transport.mjs", "specs/phase2p-live-provider-transport-contract.md"]
});

addRequirement({
  id: "provider-certification-readiness",
  status: all([
    packageManifest.scripts?.["qa:provider-certification"] === "node tests/provider-certification.mjs",
    modelContracts.provider?.certificationEndpoint === "/api/ai/provider/certification",
    sourceBundle.includes("/api/ai/provider/certification"),
    sourceBundle.includes("Phase 2U External Provider Certification Readiness Contract"),
    sourceBundle.includes("providerCertificationStatus"),
    sourceBundle.includes("readiness-only"),
    sourceBundle.includes("certified: false"),
    provedCheckIds.has("provider-certification-readiness")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:provider-certification"] || "missing"}, endpoint=${modelContracts.provider?.certificationEndpoint || "missing"}, agenticCheck=${provedCheckIds.has("provider-certification-readiness")}, certified=false`,
  files: ["scripts/provider-certification.mjs", "tests/provider-certification.mjs", "specs/phase2u-provider-certification-readiness-contract.md"]
});

const screenshotEvidence = (agenticAudit.clickReport?.screenshots || []).map((item) => ({
  name: item.name,
  file: item.file,
  exists: existsSync(item.file),
  sizeBytes: existsSync(item.file) ? statSync(item.file).size : 0
}));
addRequirement({
  id: "visual-fidelity",
  status: all([
    packageManifest.scripts?.["qa:visual"] === "node tests/visual-fidelity.mjs",
    provedCheckIds.has("visual-screenshot-evidence"),
    screenshotEvidence.length >= 5,
    screenshotEvidence.every((item) => item.exists && item.sizeBytes > 1000),
    sourceBundle.includes("data-visual-fidelity"),
    sourceBundle.includes("hero-proof-rail"),
    sourceBundle.includes("visual-depth-grid")
  ]),
  evidence: screenshotEvidence.map((item) => `${item.name}:${item.sizeBytes}`).join(", "),
  files: ["tests/visual-fidelity.mjs", "src/app.js", "src/styles.css", "qa-artifacts/phase2o-agentic-audit.json"]
});

const roundChecks = (agenticAudit.completionMatrix || []).filter((item) => /^round-\d-/.test(item.id));
addRequirement({
  id: "student-teacher-research-workflows",
  status: all([
    agenticAudit.clickReport?.rounds >= 3,
    (agenticAudit.clickReport?.consoleErrors || []).length === 0,
    roundChecks.length >= 18,
    roundChecks.every((item) => item.status === "proved"),
    sourceBundle.includes("data-submit-work"),
    sourceBundle.includes("data-review-submission"),
    sourceBundle.includes("evidence-strip"),
    sourceBundle.includes("/api/collab/rooms/")
  ]),
  evidence: `rounds=${agenticAudit.clickReport?.rounds || 0}, consoleErrors=${(agenticAudit.clickReport?.consoleErrors || []).length}, roundChecks=${roundChecks.length}`,
  files: ["tests/click-flow.mjs", "tests/agentic-audit.mjs", "src/app.js", "scripts/fullstack-server.mjs"]
});

addRequirement({
  id: "sandbox-hardening",
  status: all([
    packageManifest.scripts?.["qa:sandbox-isolation"] === "node tests/sandbox-isolation.mjs",
    sourceBundle.includes("sandbox-runner-v2"),
    sourceBundle.includes("process-scrubbed-temp-workspace-no-exec"),
    sourceBundle.includes("allowlist-scrubbed"),
    sourceBundle.includes("Phase 2Q Sandbox Isolation Hardening Contract"),
    provedCheckIds.has("sandbox-isolation-hardening")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:sandbox-isolation"] || "missing"}, agenticCheck=${provedCheckIds.has("sandbox-isolation-hardening")}`,
  files: ["scripts/sandbox-isolation.mjs", "tests/sandbox-isolation.mjs", "specs/phase2q-sandbox-isolation-hardening-contract.md"]
});

addRequirement({
  id: "sandbox-certification-readiness",
  status: all([
    packageManifest.scripts?.["qa:sandbox-certification"] === "node tests/sandbox-certification.mjs",
    sourceBundle.includes("/api/sandbox/certification"),
    sourceBundle.includes("Phase 2T Sandbox Runtime Certification Readiness Contract"),
    sourceBundle.includes("readiness-only"),
    sourceBundle.includes("certified: false"),
    sourceBundle.includes("sandboxCertificationStatus"),
    provedCheckIds.has("sandbox-certification-readiness")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:sandbox-certification"] || "missing"}, agenticCheck=${provedCheckIds.has("sandbox-certification-readiness")}, certified=false`,
  files: ["scripts/sandbox-certification.mjs", "tests/sandbox-certification.mjs", "specs/phase2t-sandbox-certification-readiness-contract.md"]
});

addRequirement({
  id: "database-adapter",
  status: all([
    packageManifest.scripts?.["qa:db-adapter"] === "node tests/database-adapter.mjs",
    sourceBundle.includes("sqlite-repository-v1"),
    sourceBundle.includes("/api/db/rollback-probe"),
    sourceBundle.includes("Phase 2R SQL Database Adapter Contract"),
    provedCheckIds.has("sql-database-adapter-foundation")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:db-adapter"] || "missing"}, agenticCheck=${provedCheckIds.has("sql-database-adapter-foundation")}`,
  files: ["scripts/sqlite-repository.mjs", "tests/database-adapter.mjs", "specs/phase2r-sql-database-adapter-contract.md"]
});

addRequirement({
  id: "database-certification-readiness",
  status: all([
    packageManifest.scripts?.["qa:db-certification"] === "node tests/database-certification.mjs",
    sourceBundle.includes("/api/db/certification"),
    sourceBundle.includes("Phase 2V Managed Database Certification Readiness Contract"),
    sourceBundle.includes("databaseCertificationStatus"),
    sourceBundle.includes("readiness-only"),
    sourceBundle.includes("certified: false"),
    provedCheckIds.has("database-certification-readiness")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:db-certification"] || "missing"}, agenticCheck=${provedCheckIds.has("database-certification-readiness")}, certified=false`,
  files: ["scripts/database-certification.mjs", "tests/database-certification.mjs", "specs/phase2v-database-certification-readiness-contract.md"]
});

addRequirement({
  id: "delivery-certification-overview",
  status: all([
    packageManifest.scripts?.["qa:certification-overview"] === "node tests/certification-overview.mjs",
    sourceBundle.includes("/api/delivery/certification-overview"),
    sourceBundle.includes("Phase 2W Delivery Certification Overview Contract"),
    sourceBundle.includes("deliveryOverviewStatus"),
    sourceBundle.includes("data-delivery-overview"),
    sourceBundle.includes("pass-with-open-certification-gaps"),
    provedCheckIds.has("delivery-certification-overview")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:certification-overview"] || "missing"}, agenticCheck=${provedCheckIds.has("delivery-certification-overview")}, finalGoalComplete=false`,
  files: ["scripts/certification-overview.mjs", "tests/certification-overview.mjs", "specs/phase2w-delivery-certification-overview-contract.md"]
});

addRequirement({
  id: "delivery-handoff-dossier",
  status: all([
    packageManifest.scripts?.["qa:handoff-dossier"] === "node tests/delivery-handoff-dossier.mjs",
    sourceBundle.includes("/api/delivery/handoff-dossier"),
    sourceBundle.includes("Phase 3A Delivery Handoff Dossier Contract"),
    sourceBundle.includes("handoffDossierStatus"),
    sourceBundle.includes("data-delivery-dossier"),
    sourceBundle.includes("handoff-ready-with-open-certification-gaps"),
    provedCheckIds.has("delivery-handoff-dossier")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:handoff-dossier"] || "missing"}, agenticCheck=${provedCheckIds.has("delivery-handoff-dossier")}, finalGoalComplete=false`,
  files: ["scripts/delivery-handoff-dossier.mjs", "tests/delivery-handoff-dossier.mjs", "specs/phase3a-delivery-handoff-dossier-contract.md"]
});

addRequirement({
  id: "delivery-handoff-export",
  status: all([
    packageManifest.scripts?.["qa:handoff-export"] === "node tests/delivery-handoff-export.mjs",
    sourceBundle.includes("writeDeliveryHandoffExport"),
    sourceBundle.includes("Phase 3B Delivery Handoff Export Contract"),
    sourceBundle.includes("phase3b-delivery-handoff-dossier.json"),
    sourceBundle.includes("phase3b-delivery-handoff-dossier.md"),
    handoffExport.phase === "3B",
    handoffExport.status === "handoff-ready-with-open-certification-gaps",
    handoffExport.finalGoalComplete === false,
    handoffExport.localEvidencePassed === true,
    handoffExport.openCertificationGapCount === 3,
    handoffExport.guardrails?.offlineOnlyExport === true,
    handoffExport.guardrails?.externalCalls === false,
    handoffExport.guardrails?.managedDatabaseConnections === false,
    handoffExport.guardrails?.deployments === false,
    handoffExport.guardrails?.certificationExecution === false,
    handoffExportMarkdown.includes("# Phase 3B Delivery Handoff Export"),
    provedCheckIds.has("delivery-handoff-export")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:handoff-export"] || "missing"}, status=${handoffExport.status || "missing"}, artifactCount=${handoffExport.artifactCount || 0}, openGaps=${handoffExport.openCertificationGapCount ?? "missing"}, agenticCheck=${provedCheckIds.has("delivery-handoff-export")}, finalGoalComplete=false`,
  files: [
    "scripts/export-delivery-handoff.mjs",
    "tests/delivery-handoff-export.mjs",
    "specs/phase3b-delivery-handoff-export-contract.md",
    "qa-artifacts/phase3b-delivery-handoff-dossier.json",
    "qa-artifacts/phase3b-delivery-handoff-dossier.md"
  ]
});

addRequirement({
  id: "delivery-artifact-index",
  status: all([
    packageManifest.scripts?.["qa:artifact-index"] === "node tests/delivery-artifact-index.mjs",
    sourceBundle.includes("/api/delivery/artifacts"),
    sourceBundle.includes("deliveryArtifactIndexStatus"),
    sourceBundle.includes("data-delivery-artifacts"),
    sourceBundle.includes("Phase 3C Delivery Artifact Index Contract"),
    sourceBundle.includes("artifact-index-ready-with-open-certification-gaps"),
    sourceBundle.includes("contentReturned"),
    sourceBundle.includes("sha256"),
    sourceBundle.includes("certificationExecution: false"),
    provedCheckIds.has("delivery-artifact-index")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:artifact-index"] || "missing"}, endpoint=/api/delivery/artifacts, agenticCheck=${provedCheckIds.has("delivery-artifact-index")}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-artifact-index.mjs",
    "tests/delivery-artifact-index.mjs",
    "specs/phase3c-delivery-artifact-index-contract.md",
    "scripts/fullstack-server.mjs",
    "src/app.js"
  ]
});

const agenticQaReplayReport = existsSync("qa-artifacts/phase3r-agentic-qa-replay-dossier.json")
  ? readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json")
  : {};
addRequirement({
  id: "agentic-qa-replay-dossier",
  status: all([
    packageManifest.scripts?.["qa:agentic-replay"] === "node tests/agentic-qa-replay-dossier.mjs",
    sourceBundle.includes("/api/delivery/agentic-qa-replay"),
    sourceBundle.includes("agenticQaReplayStatus"),
    sourceBundle.includes("data-agentic-qa-replay"),
    sourceBundle.includes("Phase 3R Agentic QA Replay Dossier Contract"),
    sourceBundle.includes("agentic-qa-replay-ready-open-t3"),
    sourceBundle.includes("replayOnly"),
    sourceBundle.includes("screenshotBytesReturned"),
    sourceBundle.includes("replayHash"),
    agenticQaReplayReport.phase === "3R",
    agenticQaReplayReport.status === "agentic-qa-replay-ready-open-t3",
    agenticQaReplayReport.finalGoalComplete === false,
    agenticQaReplayReport.replayOnly === true,
    agenticQaReplayReport.contentReturned === false,
    agenticQaReplayReport.artifactContentReturned === false,
    agenticQaReplayReport.screenshotBytesReturned === false,
    agenticQaReplayReport.agentCount >= 4,
    agenticQaReplayReport.clickRoundCount >= 3,
    agenticQaReplayReport.provedCheckCount >= 53,
    agenticQaReplayReport.openProductGapCount === 3,
    agenticQaReplayReport.finalValueWaitsPassed === true,
    agenticQaReplayReport.screenshotHashCount >= 5,
    /^[a-f0-9]{64}$/.test(agenticQaReplayReport.replayHash || ""),
    provedCheckIds.has("agentic-qa-replay-dossier")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:agentic-replay"] || "missing"}, endpoint=/api/delivery/agentic-qa-replay, agenticCheck=${provedCheckIds.has("agentic-qa-replay-dossier")}, rounds=${agenticQaReplayReport.clickRoundCount || 0}, proved=${agenticQaReplayReport.provedCheckCount || 0}, screenshots=${agenticQaReplayReport.screenshotHashCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/agentic-qa-replay-dossier.mjs",
    "tests/agentic-qa-replay-dossier.mjs",
    "specs/phase3r-agentic-qa-replay-dossier-contract.md",
    "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
    "qa-artifacts/phase3r-agentic-qa-replay-dossier.md"
  ]
});

const visualStoryboardReport = existsSync("qa-artifacts/phase3s-visual-qa-storyboard.json")
  ? readJson("qa-artifacts/phase3s-visual-qa-storyboard.json")
  : {};
addRequirement({
  id: "visual-qa-storyboard",
  status: all([
    packageManifest.scripts?.["qa:visual-storyboard"] === "node tests/visual-qa-storyboard.mjs",
    sourceBundle.includes("/api/delivery/visual-storyboard"),
    sourceBundle.includes("visualStoryboardStatus"),
    sourceBundle.includes("data-visual-storyboard"),
    sourceBundle.includes("Phase 3S Visual QA Storyboard Contract"),
    sourceBundle.includes("visual-storyboard-ready-open-t3"),
    sourceBundle.includes("storyboardOnly"),
    sourceBundle.includes("screenshotBytesEmbedded"),
    sourceBundle.includes("storyboardHash"),
    visualStoryboardReport.phase === "3S",
    visualStoryboardReport.status === "visual-storyboard-ready-open-t3",
    visualStoryboardReport.finalGoalComplete === false,
    visualStoryboardReport.storyboardOnly === true,
    visualStoryboardReport.localVisualEvidence === true,
    visualStoryboardReport.screenshotBytesEmbedded === false,
    visualStoryboardReport.artifactBodyContentReturned === false,
    visualStoryboardReport.surfaceCount >= 5,
    visualStoryboardReport.readySurfaceCount === visualStoryboardReport.surfaceCount,
    visualStoryboardReport.screenshotHashCount >= 5,
    visualStoryboardReport.replayRoundCount >= 3,
    visualStoryboardReport.provedCheckCount >= 54,
    visualStoryboardReport.openProductGapCount === 3,
    visualStoryboardReport.visualChecksPassed === true,
    /^[a-f0-9]{64}$/.test(visualStoryboardReport.storyboardHash || ""),
    provedCheckIds.has("visual-qa-storyboard")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:visual-storyboard"] || "missing"}, endpoint=/api/delivery/visual-storyboard, agenticCheck=${provedCheckIds.has("visual-qa-storyboard")}, surfaces=${visualStoryboardReport.surfaceCount || 0}, rounds=${visualStoryboardReport.replayRoundCount || 0}, screenshots=${visualStoryboardReport.screenshotHashCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/visual-qa-storyboard.mjs",
    "tests/visual-qa-storyboard.mjs",
    "specs/phase3s-visual-qa-storyboard-contract.md",
    "qa-artifacts/phase3s-visual-qa-storyboard.json",
    "qa-artifacts/phase3s-visual-qa-storyboard.md"
  ]
});

const releaseCandidateReport = existsSync("qa-artifacts/phase3t-delivery-release-candidate.json")
  ? readJson("qa-artifacts/phase3t-delivery-release-candidate.json")
  : {};
addRequirement({
  id: "delivery-release-candidate",
  status: all([
    packageManifest.scripts?.["qa:release-candidate"] === "node tests/delivery-release-candidate.mjs",
    sourceBundle.includes("/api/delivery/release-candidate"),
    sourceBundle.includes("releaseCandidateStatus"),
    sourceBundle.includes("data-delivery-release-candidate"),
    sourceBundle.includes("Phase 3T Delivery Release Candidate Contract"),
    sourceBundle.includes("release-candidate-local-evidence-ready-open-t3"),
    sourceBundle.includes("releaseCandidateOnly"),
    sourceBundle.includes("readyForProductionRelease"),
    sourceBundle.includes("releaseCandidateHash"),
    releaseCandidateReport.phase === "3T",
    releaseCandidateReport.status === "release-candidate-local-evidence-ready-open-t3",
    releaseCandidateReport.finalGoalComplete === false,
    releaseCandidateReport.releaseCandidateOnly === true,
    releaseCandidateReport.readyForHumanReview === true,
    releaseCandidateReport.readyForProductionRelease === false,
    releaseCandidateReport.localEvidenceReady === true,
    releaseCandidateReport.blockedByT3 === true,
    releaseCandidateReport.openT3GapCount === 3,
    releaseCandidateReport.releaseCheckCount >= 6,
    releaseCandidateReport.readyReleaseCheckCount >= 5,
    releaseCandidateReport.blockedReleaseCheckCount === 1,
    /^[a-f0-9]{64}$/.test(releaseCandidateReport.releaseCandidateHash || ""),
    provedCheckIds.has("delivery-release-candidate")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:release-candidate"] || "missing"}, endpoint=/api/delivery/release-candidate, agenticCheck=${provedCheckIds.has("delivery-release-candidate")}, checks=${releaseCandidateReport.readyReleaseCheckCount || 0}/${releaseCandidateReport.releaseCheckCount || 0}, openT3=${releaseCandidateReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-release-candidate.mjs",
    "tests/delivery-release-candidate.mjs",
    "specs/phase3t-delivery-release-candidate-contract.md",
    "qa-artifacts/phase3t-delivery-release-candidate.json",
    "qa-artifacts/phase3t-delivery-release-candidate.md"
  ]
});

const nextActionsReport = existsSync("qa-artifacts/phase3u-t3-certification-next-actions.json")
  ? readJson("qa-artifacts/phase3u-t3-certification-next-actions.json")
  : {};
addRequirement({
  id: "t3-certification-next-actions",
  status: all([
    packageManifest.scripts?.["qa:t3-next-actions"] === "node tests/t3-certification-next-actions.mjs",
    sourceBundle.includes("/api/delivery/t3-certification-next-actions"),
    sourceBundle.includes("t3CertificationNextActionsStatus"),
    sourceBundle.includes("data-t3-certification-next-actions"),
    sourceBundle.includes("Phase 3U T3 Certification Next Actions Contract"),
    sourceBundle.includes("t3-certification-next-actions-ready-execution-blocked"),
    sourceBundle.includes("nextActionsOnly"),
    sourceBundle.includes("singleLaneOnly"),
    sourceBundle.includes("nextActionsHash"),
    nextActionsReport.phase === "3U",
    nextActionsReport.status === "t3-certification-next-actions-ready-execution-blocked",
    nextActionsReport.finalGoalComplete === false,
    nextActionsReport.nextActionsOnly === true,
    nextActionsReport.readyForHumanReview === true,
    nextActionsReport.readyForProductionRelease === false,
    nextActionsReport.approvalRequired === true,
    nextActionsReport.singleLaneOnly === true,
    nextActionsReport.executionAllowed === false,
    nextActionsReport.openT3GapCount === 3,
    nextActionsReport.laneActionCount === 3,
    nextActionsReport.readyLaneActionCount === 3,
    nextActionsReport.evidenceRequirementCount >= 15,
    nextActionsReport.rollbackRequirementCount >= 9,
    /^[a-f0-9]{64}$/.test(nextActionsReport.nextActionsHash || ""),
    provedCheckIds.has("t3-certification-next-actions")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-next-actions"] || "missing"}, endpoint=/api/delivery/t3-certification-next-actions, agenticCheck=${provedCheckIds.has("t3-certification-next-actions")}, lanes=${nextActionsReport.readyLaneActionCount || 0}/${nextActionsReport.laneActionCount || 0}, openT3=${nextActionsReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/t3-certification-next-actions.mjs",
    "tests/t3-certification-next-actions.mjs",
    "specs/phase3u-t3-certification-next-actions-contract.md",
    "qa-artifacts/phase3u-t3-certification-next-actions.json",
    "qa-artifacts/phase3u-t3-certification-next-actions.md"
  ]
});

const runPacketReport = existsSync("qa-artifacts/phase3v-t3-single-lane-run-packets.json")
  ? readJson("qa-artifacts/phase3v-t3-single-lane-run-packets.json")
  : {};
addRequirement({
  id: "t3-single-lane-run-packets",
  status: all([
    packageManifest.scripts?.["qa:t3-run-packets"] === "node tests/t3-single-lane-run-packets.mjs",
    sourceBundle.includes("/api/delivery/t3-single-lane-run-packets"),
    sourceBundle.includes("t3SingleLaneRunPacketStatus"),
    sourceBundle.includes("data-t3-single-lane-run-packets"),
    sourceBundle.includes("Phase 3V T3 Single-Lane Run Packets Contract"),
    sourceBundle.includes("t3-single-lane-run-packets-ready-execution-blocked"),
    sourceBundle.includes("runPacketsOnly"),
    sourceBundle.includes("singleLaneOnly"),
    sourceBundle.includes("runPacketBundleHash"),
    runPacketReport.phase === "3V",
    runPacketReport.status === "t3-single-lane-run-packets-ready-execution-blocked",
    runPacketReport.finalGoalComplete === false,
    runPacketReport.runPacketsOnly === true,
    runPacketReport.readyForHumanReview === true,
    runPacketReport.readyForProductionRelease === false,
    runPacketReport.approvalRequired === true,
    runPacketReport.singleLaneOnly === true,
    runPacketReport.executionAllowed === false,
    runPacketReport.openT3GapCount === 3,
    runPacketReport.packetCount === 3,
    runPacketReport.readyPacketCount === 3,
    runPacketReport.evidenceRequirementCount >= 15,
    runPacketReport.rollbackRequirementCount >= 9,
    /^[a-f0-9]{64}$/.test(runPacketReport.runPacketBundleHash || ""),
    provedCheckIds.has("t3-single-lane-run-packets")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-run-packets"] || "missing"}, endpoint=/api/delivery/t3-single-lane-run-packets, agenticCheck=${provedCheckIds.has("t3-single-lane-run-packets")}, packets=${runPacketReport.readyPacketCount || 0}/${runPacketReport.packetCount || 0}, openT3=${runPacketReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/t3-single-lane-run-packets.mjs",
    "tests/t3-single-lane-run-packets.mjs",
    "specs/phase3v-t3-single-lane-run-packets-contract.md",
    "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
    "qa-artifacts/phase3v-t3-single-lane-run-packets.md"
  ]
});

const runPacketVerifierReport = existsSync("qa-artifacts/phase3w-t3-run-packet-verifier.json")
  ? readJson("qa-artifacts/phase3w-t3-run-packet-verifier.json")
  : {};
addRequirement({
  id: "t3-run-packet-verifier",
  status: all([
    packageManifest.scripts?.["qa:t3-run-packet-verifier"] === "node tests/t3-run-packet-verifier.mjs",
    sourceBundle.includes("/api/delivery/t3-run-packet-verifier"),
    sourceBundle.includes("t3RunPacketVerifierStatus"),
    sourceBundle.includes("data-t3-run-packet-verifier"),
    sourceBundle.includes("Phase 3W T3 Run Packet Verifier Contract"),
    sourceBundle.includes("t3-run-packet-verifier-ready-execution-blocked"),
    sourceBundle.includes("verifierOnly"),
    sourceBundle.includes("verifierHash"),
    runPacketVerifierReport.phase === "3W",
    runPacketVerifierReport.status === "t3-run-packet-verifier-ready-execution-blocked",
    runPacketVerifierReport.finalGoalComplete === false,
    runPacketVerifierReport.verifierOnly === true,
    runPacketVerifierReport.verificationPassed === false,
    runPacketVerifierReport.executionAllowed === false,
    runPacketVerifierReport.runPacketBundleStatus === "t3-single-lane-run-packets-ready-execution-blocked",
    runPacketVerifierReport.runPacketsOnly === true,
    runPacketVerifierReport.packetVerificationCount === 3,
    runPacketVerifierReport.readyPacketVerificationCount === 3,
    runPacketVerifierReport.submittedPacketCount === 0,
    runPacketVerifierReport.verifiedPacketCount === 0,
    /^[a-f0-9]{64}$/.test(runPacketVerifierReport.verifierHash || ""),
    provedCheckIds.has("t3-run-packet-verifier")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-run-packet-verifier"] || "missing"}, endpoint=/api/delivery/t3-run-packet-verifier, agenticCheck=${provedCheckIds.has("t3-run-packet-verifier")}, packets=${runPacketVerifierReport.readyPacketVerificationCount || 0}/${runPacketVerifierReport.packetVerificationCount || 0}, submitted=${runPacketVerifierReport.submittedPacketCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/t3-run-packet-verifier.mjs",
    "tests/t3-run-packet-verifier.mjs",
    "specs/phase3w-t3-run-packet-verifier-contract.md",
    "qa-artifacts/phase3w-t3-run-packet-verifier.json",
    "qa-artifacts/phase3w-t3-run-packet-verifier.md"
  ]
});

const reviewerCockpitReport = existsSync("qa-artifacts/phase3x-delivery-reviewer-cockpit.json")
  ? readJson("qa-artifacts/phase3x-delivery-reviewer-cockpit.json")
  : {};
addRequirement({
  id: "delivery-reviewer-cockpit",
  status: all([
    packageManifest.scripts?.["qa:reviewer-cockpit"] === "node tests/delivery-reviewer-cockpit.mjs",
    sourceBundle.includes("/api/delivery/reviewer-cockpit"),
    sourceBundle.includes("deliveryReviewerCockpitStatus"),
    sourceBundle.includes("data-delivery-reviewer-cockpit"),
    sourceBundle.includes("Phase 3X Delivery Reviewer Cockpit Contract"),
    sourceBundle.includes("reviewer-cockpit-ready-open-t3"),
    sourceBundle.includes("reviewerCockpitOnly"),
    sourceBundle.includes("reviewerCockpitHash"),
    reviewerCockpitReport.phase === "3X",
    reviewerCockpitReport.status === "reviewer-cockpit-ready-open-t3",
    reviewerCockpitReport.finalGoalComplete === false,
    reviewerCockpitReport.reviewerCockpitOnly === true,
    reviewerCockpitReport.readyForHumanReview === true,
    reviewerCockpitReport.readyForProductionRelease === false,
    reviewerCockpitReport.contentReturned === false,
    reviewerCockpitReport.sectionCount === 8,
    reviewerCockpitReport.readySectionCount === 7,
    reviewerCockpitReport.blockedSectionCount === 1,
    reviewerCockpitReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(reviewerCockpitReport.reviewerCockpitHash || ""),
    provedCheckIds.has("delivery-reviewer-cockpit")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:reviewer-cockpit"] || "missing"}, endpoint=/api/delivery/reviewer-cockpit, agenticCheck=${provedCheckIds.has("delivery-reviewer-cockpit")}, sections=${reviewerCockpitReport.readySectionCount || 0}/${reviewerCockpitReport.sectionCount || 0}, openT3=${reviewerCockpitReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-reviewer-cockpit.mjs",
    "tests/delivery-reviewer-cockpit.mjs",
    "specs/phase3x-delivery-reviewer-cockpit-contract.md",
    "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
    "qa-artifacts/phase3x-delivery-reviewer-cockpit.md"
  ]
});

const launchGuideReport = existsSync("qa-artifacts/phase3y-delivery-launch-guide.json")
  ? readJson("qa-artifacts/phase3y-delivery-launch-guide.json")
  : {};
addRequirement({
  id: "delivery-launch-guide",
  status: all([
    packageManifest.scripts?.["qa:launch-guide"] === "node tests/delivery-launch-guide.mjs",
    sourceBundle.includes("/api/delivery/launch-guide"),
    sourceBundle.includes("deliveryLaunchGuideStatus"),
    sourceBundle.includes("data-delivery-launch-guide"),
    sourceBundle.includes("Phase 3Y Delivery Launch Guide Contract"),
    sourceBundle.includes("delivery-launch-guide-ready-open-t3"),
    sourceBundle.includes("launchGuideOnly"),
    sourceBundle.includes("launchGuideHash"),
    launchGuideReport.phase === "3Y",
    launchGuideReport.status === "delivery-launch-guide-ready-open-t3",
    launchGuideReport.finalGoalComplete === false,
    launchGuideReport.launchGuideOnly === true,
    launchGuideReport.readyForLocalReview === true,
    launchGuideReport.readyForProductionRelease === false,
    launchGuideReport.contentReturned === false,
    launchGuideReport.commandCount >= 7,
    launchGuideReport.routeCount >= 5,
    launchGuideReport.evidenceFileCount >= 6,
    launchGuideReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(launchGuideReport.launchGuideHash || ""),
    provedCheckIds.has("delivery-launch-guide")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:launch-guide"] || "missing"}, endpoint=/api/delivery/launch-guide, agenticCheck=${provedCheckIds.has("delivery-launch-guide")}, commands=${launchGuideReport.commandCount || 0}, routes=${launchGuideReport.routeCount || 0}, evidenceFiles=${launchGuideReport.evidenceFileCount || 0}, openT3=${launchGuideReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-launch-guide.mjs",
    "tests/delivery-launch-guide.mjs",
    "specs/phase3y-delivery-launch-guide-contract.md",
    "qa-artifacts/phase3y-delivery-launch-guide.json",
    "qa-artifacts/phase3y-delivery-launch-guide.md"
  ]
});

const consistencySentinelReport = existsSync("qa-artifacts/phase3z-delivery-consistency-sentinel.json")
  ? readJson("qa-artifacts/phase3z-delivery-consistency-sentinel.json")
  : {};
addRequirement({
  id: "delivery-consistency-sentinel",
  status: all([
    packageManifest.scripts?.["qa:consistency-sentinel"] === "node tests/delivery-consistency-sentinel.mjs",
    sourceBundle.includes("/api/delivery/consistency-sentinel"),
    sourceBundle.includes("deliveryConsistencySentinelStatus"),
    sourceBundle.includes("data-delivery-consistency-sentinel"),
    sourceBundle.includes("Phase 3Z Delivery Consistency Sentinel Contract"),
    sourceBundle.includes("delivery-consistency-sentinel-ready-open-t3"),
    sourceBundle.includes("sentinelOnly"),
    sourceBundle.includes("consistencyHash"),
    consistencySentinelReport.phase === "3Z",
    consistencySentinelReport.status === "delivery-consistency-sentinel-ready-open-t3",
    consistencySentinelReport.finalGoalComplete === false,
    consistencySentinelReport.sentinelOnly === true,
    consistencySentinelReport.consistencyPassed === true,
    consistencySentinelReport.readyForProductionRelease === false,
    consistencySentinelReport.contentReturned === false,
    consistencySentinelReport.contradictionCount === 0,
    consistencySentinelReport.surfaceCount >= 7,
    consistencySentinelReport.invariantCount >= 7,
    consistencySentinelReport.evidenceFileCount >= 8,
    consistencySentinelReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(consistencySentinelReport.consistencyHash || ""),
    provedCheckIds.has("delivery-consistency-sentinel")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:consistency-sentinel"] || "missing"}, endpoint=/api/delivery/consistency-sentinel, agenticCheck=${provedCheckIds.has("delivery-consistency-sentinel")}, surfaces=${consistencySentinelReport.surfaceCount || 0}, invariants=${consistencySentinelReport.invariantCount || 0}, contradictions=${consistencySentinelReport.contradictionCount ?? "missing"}, openT3=${consistencySentinelReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-consistency-sentinel.mjs",
    "tests/delivery-consistency-sentinel.mjs",
    "specs/phase3z-delivery-consistency-sentinel-contract.md",
    "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
    "qa-artifacts/phase3z-delivery-consistency-sentinel.md"
  ]
});

const finalAcceptanceMatrixReport = existsSync("qa-artifacts/phase4a-final-acceptance-matrix.json")
  ? readJson("qa-artifacts/phase4a-final-acceptance-matrix.json")
  : {};
addRequirement({
  id: "final-acceptance-matrix",
  status: all([
    packageManifest.scripts?.["qa:acceptance-matrix"] === "node tests/final-acceptance-matrix.mjs",
    sourceBundle.includes("/api/delivery/final-acceptance-matrix"),
    sourceBundle.includes("finalAcceptanceMatrixStatus"),
    sourceBundle.includes("data-final-acceptance-matrix"),
    sourceBundle.includes("Phase 4A Final Acceptance Matrix Contract"),
    sourceBundle.includes("final-acceptance-matrix-ready-open-t3"),
    sourceBundle.includes("acceptanceMatrixOnly"),
    sourceBundle.includes("acceptanceHash"),
    finalAcceptanceMatrixReport.phase === "4A",
    finalAcceptanceMatrixReport.status === "final-acceptance-matrix-ready-open-t3",
    finalAcceptanceMatrixReport.finalGoalComplete === false,
    finalAcceptanceMatrixReport.acceptanceMatrixOnly === true,
    finalAcceptanceMatrixReport.localAcceptancePassed === true,
    finalAcceptanceMatrixReport.readyForProductionRelease === false,
    finalAcceptanceMatrixReport.contentReturned === false,
    finalAcceptanceMatrixReport.acceptanceRowCount >= 13,
    finalAcceptanceMatrixReport.provedRowCount >= 10,
    finalAcceptanceMatrixReport.blockedRowCount === 3,
    finalAcceptanceMatrixReport.failedRowCount === 0,
    finalAcceptanceMatrixReport.evidenceFileCount >= 9,
    finalAcceptanceMatrixReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(finalAcceptanceMatrixReport.acceptanceHash || ""),
    provedCheckIds.has("final-acceptance-matrix")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:acceptance-matrix"] || "missing"}, endpoint=/api/delivery/final-acceptance-matrix, agenticCheck=${provedCheckIds.has("final-acceptance-matrix")}, rows=${finalAcceptanceMatrixReport.acceptanceRowCount || 0}, proved=${finalAcceptanceMatrixReport.provedRowCount || 0}, blocked=${finalAcceptanceMatrixReport.blockedRowCount || 0}, openT3=${finalAcceptanceMatrixReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/final-acceptance-matrix.mjs",
    "tests/final-acceptance-matrix.mjs",
    "specs/phase4a-final-acceptance-matrix-contract.md",
    "qa-artifacts/phase4a-final-acceptance-matrix.json",
    "qa-artifacts/phase4a-final-acceptance-matrix.md"
  ]
});

const certificationBlockerBoardReport = existsSync("qa-artifacts/phase4b-certification-blocker-board.json")
  ? readJson("qa-artifacts/phase4b-certification-blocker-board.json")
  : {};
addRequirement({
  id: "certification-blocker-board",
  status: all([
    packageManifest.scripts?.["qa:certification-blocker-board"] === "node tests/certification-blocker-board.mjs",
    sourceBundle.includes("/api/delivery/certification-blocker-board"),
    sourceBundle.includes("certificationBlockerBoardStatus"),
    sourceBundle.includes("data-certification-blocker-board"),
    sourceBundle.includes("Phase 4B Certification Blocker Board Contract"),
    sourceBundle.includes("certification-blocker-board-ready-open-t3"),
    sourceBundle.includes("blockerBoardOnly"),
    sourceBundle.includes("boardHash"),
    certificationBlockerBoardReport.phase === "4B",
    certificationBlockerBoardReport.status === "certification-blocker-board-ready-open-t3",
    certificationBlockerBoardReport.finalGoalComplete === false,
    certificationBlockerBoardReport.blockerBoardOnly === true,
    certificationBlockerBoardReport.localBoardPassed === true,
    certificationBlockerBoardReport.readyForProductionRelease === false,
    certificationBlockerBoardReport.contentReturned === false,
    certificationBlockerBoardReport.blockerCount === 3,
    certificationBlockerBoardReport.readyBlockerCount === 3,
    certificationBlockerBoardReport.closedBlockerCount === 0,
    certificationBlockerBoardReport.openT3GapCount === 3,
    certificationBlockerBoardReport.evidenceFileCount >= 9,
    /^[a-f0-9]{64}$/.test(certificationBlockerBoardReport.boardHash || ""),
    provedCheckIds.has("certification-blocker-board")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:certification-blocker-board"] || "missing"}, endpoint=/api/delivery/certification-blocker-board, agenticCheck=${provedCheckIds.has("certification-blocker-board")}, blockers=${certificationBlockerBoardReport.blockerCount || 0}, ready=${certificationBlockerBoardReport.readyBlockerCount || 0}, closed=${certificationBlockerBoardReport.closedBlockerCount ?? "missing"}, openT3=${certificationBlockerBoardReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/certification-blocker-board.mjs",
    "tests/certification-blocker-board.mjs",
    "specs/phase4b-certification-blocker-board-contract.md",
    "qa-artifacts/phase4b-certification-blocker-board.json",
    "qa-artifacts/phase4b-certification-blocker-board.md"
  ]
});

const userAcceptanceRehearsalReport = existsSync("qa-artifacts/phase4c-user-acceptance-rehearsal.json")
  ? readJson("qa-artifacts/phase4c-user-acceptance-rehearsal.json")
  : {};
addRequirement({
  id: "user-acceptance-rehearsal",
  status: all([
    packageManifest.scripts?.["qa:user-acceptance-rehearsal"] === "node tests/user-acceptance-rehearsal.mjs",
    sourceBundle.includes("/api/delivery/user-acceptance-rehearsal"),
    sourceBundle.includes("userAcceptanceRehearsalStatus"),
    sourceBundle.includes("data-user-acceptance-rehearsal"),
    sourceBundle.includes("Phase 4C User Acceptance Rehearsal Contract"),
    sourceBundle.includes("user-acceptance-rehearsal-ready-open-t3"),
    sourceBundle.includes("userAcceptanceRehearsalOnly"),
    sourceBundle.includes("rehearsalHash"),
    userAcceptanceRehearsalReport.phase === "4C",
    userAcceptanceRehearsalReport.status === "user-acceptance-rehearsal-ready-open-t3",
    userAcceptanceRehearsalReport.finalGoalComplete === false,
    userAcceptanceRehearsalReport.userAcceptanceRehearsalOnly === true,
    userAcceptanceRehearsalReport.localUserAcceptancePassed === true,
    userAcceptanceRehearsalReport.readyForHumanReview === true,
    userAcceptanceRehearsalReport.readyForProductionRelease === false,
    userAcceptanceRehearsalReport.contentReturned === false,
    userAcceptanceRehearsalReport.rehearsalCount === 3,
    userAcceptanceRehearsalReport.readyRehearsalCount === 3,
    userAcceptanceRehearsalReport.blockedRehearsalCount === 0,
    userAcceptanceRehearsalReport.openT3GapCount === 3,
    userAcceptanceRehearsalReport.evidenceFileCount >= 9,
    /^[a-f0-9]{64}$/.test(userAcceptanceRehearsalReport.rehearsalHash || ""),
    provedCheckIds.has("user-acceptance-rehearsal")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:user-acceptance-rehearsal"] || "missing"}, endpoint=/api/delivery/user-acceptance-rehearsal, agenticCheck=${provedCheckIds.has("user-acceptance-rehearsal")}, rehearsals=${userAcceptanceRehearsalReport.rehearsalCount || 0}, ready=${userAcceptanceRehearsalReport.readyRehearsalCount || 0}, openT3=${userAcceptanceRehearsalReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/user-acceptance-rehearsal.mjs",
    "tests/user-acceptance-rehearsal.mjs",
    "specs/phase4c-user-acceptance-rehearsal-contract.md",
    "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
    "qa-artifacts/phase4c-user-acceptance-rehearsal.md"
  ]
});

const deliveryEvidenceNavigatorReport = existsSync("qa-artifacts/phase4d-delivery-evidence-navigator.json")
  ? readJson("qa-artifacts/phase4d-delivery-evidence-navigator.json")
  : {};
addRequirement({
  id: "delivery-evidence-navigator",
  status: all([
    packageManifest.scripts?.["qa:evidence-navigator"] === "node tests/delivery-evidence-navigator.mjs",
    sourceBundle.includes("/api/delivery/evidence-navigator"),
    sourceBundle.includes("deliveryEvidenceNavigatorStatus"),
    sourceBundle.includes("data-delivery-evidence-navigator"),
    sourceBundle.includes("Phase 4D Delivery Evidence Navigator Contract"),
    sourceBundle.includes("delivery-evidence-navigator-ready-open-t3"),
    sourceBundle.includes("deliveryEvidenceNavigatorOnly"),
    sourceBundle.includes("navigatorHash"),
    deliveryEvidenceNavigatorReport.phase === "4D",
    deliveryEvidenceNavigatorReport.status === "delivery-evidence-navigator-ready-open-t3",
    deliveryEvidenceNavigatorReport.finalGoalComplete === false,
    deliveryEvidenceNavigatorReport.deliveryEvidenceNavigatorOnly === true,
    deliveryEvidenceNavigatorReport.localNavigationPassed === true,
    deliveryEvidenceNavigatorReport.readyForHumanReview === true,
    deliveryEvidenceNavigatorReport.readyForProductionRelease === false,
    deliveryEvidenceNavigatorReport.contentReturned === false,
    deliveryEvidenceNavigatorReport.navigationSectionCount === 5,
    deliveryEvidenceNavigatorReport.readyNavigationSectionCount === 5,
    deliveryEvidenceNavigatorReport.blockedNavigationSectionCount === 0,
    deliveryEvidenceNavigatorReport.openT3GapCount === 3,
    deliveryEvidenceNavigatorReport.evidenceFileCount >= 9,
    /^[a-f0-9]{64}$/.test(deliveryEvidenceNavigatorReport.navigatorHash || ""),
    provedCheckIds.has("delivery-evidence-navigator")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:evidence-navigator"] || "missing"}, endpoint=/api/delivery/evidence-navigator, agenticCheck=${provedCheckIds.has("delivery-evidence-navigator")}, sections=${deliveryEvidenceNavigatorReport.navigationSectionCount || 0}, ready=${deliveryEvidenceNavigatorReport.readyNavigationSectionCount || 0}, openT3=${deliveryEvidenceNavigatorReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/delivery-evidence-navigator.mjs",
    "tests/delivery-evidence-navigator.mjs",
    "specs/phase4d-delivery-evidence-navigator-contract.md",
    "qa-artifacts/phase4d-delivery-evidence-navigator.json",
    "qa-artifacts/phase4d-delivery-evidence-navigator.md"
  ]
});

const localDeliverySummaryReport = existsSync("qa-artifacts/phase4e-local-delivery-summary-packet.json")
  ? readJson("qa-artifacts/phase4e-local-delivery-summary-packet.json")
  : {};
addRequirement({
  id: "local-delivery-summary-packet",
  status: all([
    packageManifest.scripts?.["qa:local-summary-packet"] === "node tests/local-delivery-summary-packet.mjs",
    sourceBundle.includes("/api/delivery/local-summary-packet"),
    sourceBundle.includes("localDeliverySummaryStatus"),
    sourceBundle.includes("data-local-delivery-summary"),
    sourceBundle.includes("Phase 4E Local Delivery Summary Packet Contract"),
    sourceBundle.includes("local-delivery-summary-ready-open-t3"),
    sourceBundle.includes("summaryPacketOnly"),
    sourceBundle.includes("summaryHash"),
    localDeliverySummaryReport.phase === "4E",
    localDeliverySummaryReport.status === "local-delivery-summary-ready-open-t3",
    localDeliverySummaryReport.finalGoalComplete === false,
    localDeliverySummaryReport.summaryPacketOnly === true,
    localDeliverySummaryReport.localSummaryPassed === true,
    localDeliverySummaryReport.readyForHumanDelivery === true,
    localDeliverySummaryReport.readyForProductionRelease === false,
    localDeliverySummaryReport.contentReturned === false,
    localDeliverySummaryReport.summarySectionCount === 6,
    localDeliverySummaryReport.readySummarySectionCount === 6,
    localDeliverySummaryReport.blockedSummarySectionCount === 0,
    localDeliverySummaryReport.localRequirementCount >= 45,
    localDeliverySummaryReport.provedCheckCount >= 66,
    localDeliverySummaryReport.openT3GapCount === 3,
    localDeliverySummaryReport.evidenceFileCount >= 9,
    /^[a-f0-9]{64}$/.test(localDeliverySummaryReport.summaryHash || ""),
    provedCheckIds.has("local-delivery-summary-packet")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:local-summary-packet"] || "missing"}, endpoint=/api/delivery/local-summary-packet, agenticCheck=${provedCheckIds.has("local-delivery-summary-packet")}, sections=${localDeliverySummaryReport.summarySectionCount || 0}, ready=${localDeliverySummaryReport.readySummarySectionCount || 0}, openT3=${localDeliverySummaryReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/local-delivery-summary-packet.mjs",
    "tests/local-delivery-summary-packet.mjs",
    "specs/phase4e-local-delivery-summary-packet-contract.md",
    "qa-artifacts/phase4e-local-delivery-summary-packet.json",
    "qa-artifacts/phase4e-local-delivery-summary-packet.md"
  ]
});

const localDeliveryHandoffBriefReport = existsSync("qa-artifacts/phase4f-local-delivery-handoff-brief.json")
  ? readJson("qa-artifacts/phase4f-local-delivery-handoff-brief.json")
  : {};
addRequirement({
  id: "local-delivery-handoff-brief",
  status: all([
    packageManifest.scripts?.["qa:handoff-brief"] === "node tests/local-delivery-handoff-brief.mjs",
    sourceBundle.includes("/api/delivery/handoff-brief"),
    sourceBundle.includes("localDeliveryHandoffBriefStatus"),
    sourceBundle.includes("data-local-delivery-handoff-brief"),
    sourceBundle.includes("Phase 4F Local Delivery Handoff Brief Contract"),
    sourceBundle.includes("local-delivery-handoff-brief-ready-open-t3"),
    sourceBundle.includes("handoffBriefOnly"),
    sourceBundle.includes("briefHash"),
    localDeliveryHandoffBriefReport.phase === "4F",
    localDeliveryHandoffBriefReport.status === "local-delivery-handoff-brief-ready-open-t3",
    localDeliveryHandoffBriefReport.finalGoalComplete === false,
    localDeliveryHandoffBriefReport.handoffBriefOnly === true,
    localDeliveryHandoffBriefReport.localHandoffPassed === true,
    localDeliveryHandoffBriefReport.readyForUserReview === true,
    localDeliveryHandoffBriefReport.readyForProductionRelease === false,
    localDeliveryHandoffBriefReport.contentReturned === false,
    localDeliveryHandoffBriefReport.briefSectionCount === 6,
    localDeliveryHandoffBriefReport.readyBriefSectionCount === 6,
    localDeliveryHandoffBriefReport.blockedBriefSectionCount === 0,
    localDeliveryHandoffBriefReport.localCommandCount >= 5,
    localDeliveryHandoffBriefReport.localRequirementCount >= 46,
    localDeliveryHandoffBriefReport.provedCheckCount >= 67,
    localDeliveryHandoffBriefReport.openT3GapCount === 3,
    localDeliveryHandoffBriefReport.evidenceFileCount >= 8,
    /^[a-f0-9]{64}$/.test(localDeliveryHandoffBriefReport.briefHash || ""),
    provedCheckIds.has("local-delivery-handoff-brief")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:handoff-brief"] || "missing"}, endpoint=/api/delivery/handoff-brief, agenticCheck=${provedCheckIds.has("local-delivery-handoff-brief")}, sections=${localDeliveryHandoffBriefReport.briefSectionCount || 0}, commands=${localDeliveryHandoffBriefReport.localCommandCount || 0}, openT3=${localDeliveryHandoffBriefReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/local-delivery-handoff-brief.mjs",
    "tests/local-delivery-handoff-brief.mjs",
    "specs/phase4f-local-delivery-handoff-brief-contract.md",
    "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
    "qa-artifacts/phase4f-local-delivery-handoff-brief.md"
  ]
});

const localDeliveryQuickstartReport = existsSync("qa-artifacts/phase4g-local-delivery-quickstart-bundle.json")
  ? readJson("qa-artifacts/phase4g-local-delivery-quickstart-bundle.json")
  : {};
addRequirement({
  id: "local-delivery-quickstart-bundle",
  status: all([
    packageManifest.scripts?.["qa:quickstart-bundle"] === "node tests/local-delivery-quickstart-bundle.mjs",
    sourceBundle.includes("/api/delivery/quickstart-bundle"),
    sourceBundle.includes("localDeliveryQuickstartStatus"),
    sourceBundle.includes("data-local-delivery-quickstart"),
    sourceBundle.includes("Phase 4G Local Delivery Quickstart Bundle Contract"),
    sourceBundle.includes("local-delivery-quickstart-ready-open-t3"),
    sourceBundle.includes("quickstartBundleOnly"),
    sourceBundle.includes("quickstartHash"),
    localDeliveryQuickstartReport.phase === "4G",
    localDeliveryQuickstartReport.status === "local-delivery-quickstart-ready-open-t3",
    localDeliveryQuickstartReport.finalGoalComplete === false,
    localDeliveryQuickstartReport.quickstartBundleOnly === true,
    localDeliveryQuickstartReport.localQuickstartPassed === true,
    localDeliveryQuickstartReport.readyForLocalRunbookReview === true,
    localDeliveryQuickstartReport.readyForProductionRelease === false,
    localDeliveryQuickstartReport.contentReturned === false,
    localDeliveryQuickstartReport.quickstartStepCount === 7,
    localDeliveryQuickstartReport.readyQuickstartStepCount === 7,
    localDeliveryQuickstartReport.blockedQuickstartStepCount === 0,
    localDeliveryQuickstartReport.localCommandCount >= 8,
    localDeliveryQuickstartReport.localRouteCount >= 6,
    localDeliveryQuickstartReport.localRequirementCount >= 47,
    localDeliveryQuickstartReport.provedCheckCount >= 68,
    localDeliveryQuickstartReport.openT3GapCount === 3,
    localDeliveryQuickstartReport.evidenceFileCount >= 10,
    /^[a-f0-9]{64}$/.test(localDeliveryQuickstartReport.quickstartHash || ""),
    provedCheckIds.has("local-delivery-quickstart-bundle")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:quickstart-bundle"] || "missing"}, endpoint=/api/delivery/quickstart-bundle, agenticCheck=${provedCheckIds.has("local-delivery-quickstart-bundle")}, steps=${localDeliveryQuickstartReport.quickstartStepCount || 0}, commands=${localDeliveryQuickstartReport.localCommandCount || 0}, routes=${localDeliveryQuickstartReport.localRouteCount || 0}, openT3=${localDeliveryQuickstartReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/local-delivery-quickstart-bundle.mjs",
    "tests/local-delivery-quickstart-bundle.mjs",
    "specs/phase4g-local-delivery-quickstart-bundle-contract.md",
    "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json",
    "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md"
  ]
});

const localDeliveryVerificationSuiteReport = existsSync("qa-artifacts/phase4h-local-delivery-verification-suite.json")
  ? readJson("qa-artifacts/phase4h-local-delivery-verification-suite.json")
  : {};
addRequirement({
  id: "local-delivery-verification-suite",
  status: all([
    packageManifest.scripts?.["qa:local-verification-suite"] === "node tests/local-delivery-verification-suite.mjs",
    sourceBundle.includes("/api/delivery/local-verification-suite"),
    sourceBundle.includes("localDeliveryVerificationSuiteStatus"),
    sourceBundle.includes("data-local-delivery-verification-suite"),
    sourceBundle.includes("Phase 4H Local Delivery Verification Suite Contract"),
    sourceBundle.includes("local-delivery-verification-suite-ready-open-t3"),
    sourceBundle.includes("verificationSuiteOnly"),
    sourceBundle.includes("suiteHash"),
    localDeliveryVerificationSuiteReport.phase === "4H",
    localDeliveryVerificationSuiteReport.status === "local-delivery-verification-suite-ready-open-t3",
    localDeliveryVerificationSuiteReport.finalGoalComplete === false,
    localDeliveryVerificationSuiteReport.verificationSuiteOnly === true,
    localDeliveryVerificationSuiteReport.localVerificationPassed === true,
    localDeliveryVerificationSuiteReport.readyForLocalVerificationReview === true,
    localDeliveryVerificationSuiteReport.readyForProductionRelease === false,
    localDeliveryVerificationSuiteReport.contentReturned === false,
    localDeliveryVerificationSuiteReport.verificationCheckCount === 10,
    localDeliveryVerificationSuiteReport.readyVerificationCheckCount === 10,
    localDeliveryVerificationSuiteReport.blockedVerificationCheckCount === 0,
    localDeliveryVerificationSuiteReport.localCommandCount === 10,
    localDeliveryVerificationSuiteReport.localRequirementCount >= 48,
    localDeliveryVerificationSuiteReport.provedCheckCount >= 69,
    localDeliveryVerificationSuiteReport.openT3GapCount === 3,
    localDeliveryVerificationSuiteReport.evidenceFileCount >= 12,
    /^[a-f0-9]{64}$/.test(localDeliveryVerificationSuiteReport.suiteHash || ""),
    provedCheckIds.has("local-delivery-verification-suite")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:local-verification-suite"] || "missing"}, endpoint=/api/delivery/local-verification-suite, agenticCheck=${provedCheckIds.has("local-delivery-verification-suite")}, checks=${localDeliveryVerificationSuiteReport.verificationCheckCount || 0}, commands=${localDeliveryVerificationSuiteReport.localCommandCount || 0}, openT3=${localDeliveryVerificationSuiteReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/local-delivery-verification-suite.mjs",
    "tests/local-delivery-verification-suite.mjs",
    "specs/phase4h-local-delivery-verification-suite-contract.md",
    "qa-artifacts/phase4h-local-delivery-verification-suite.json",
    "qa-artifacts/phase4h-local-delivery-verification-suite.md"
  ]
});

const finalLocalHandoffCheckpointReport = existsSync("qa-artifacts/phase4i-final-local-handoff-checkpoint.json")
  ? readJson("qa-artifacts/phase4i-final-local-handoff-checkpoint.json")
  : {};
addRequirement({
  id: "final-local-handoff-checkpoint",
  status: all([
    packageManifest.scripts?.["qa:final-handoff-checkpoint"] === "node tests/final-local-handoff-checkpoint.mjs",
    sourceBundle.includes("/api/delivery/final-local-handoff-checkpoint"),
    sourceBundle.includes("finalLocalHandoffCheckpointStatus"),
    sourceBundle.includes("data-final-local-handoff-checkpoint"),
    sourceBundle.includes("Phase 4I Final Local Handoff Checkpoint Contract"),
    sourceBundle.includes("final-local-handoff-checkpoint-ready-open-t3"),
    sourceBundle.includes("checkpointOnly"),
    sourceBundle.includes("checkpointHash"),
    finalLocalHandoffCheckpointReport.phase === "4I",
    finalLocalHandoffCheckpointReport.status === "final-local-handoff-checkpoint-ready-open-t3",
    finalLocalHandoffCheckpointReport.finalGoalComplete === false,
    finalLocalHandoffCheckpointReport.checkpointOnly === true,
    finalLocalHandoffCheckpointReport.localFinalHandoffPassed === true,
    finalLocalHandoffCheckpointReport.readyForFinalLocalReview === true,
    finalLocalHandoffCheckpointReport.readyForProductionRelease === false,
    finalLocalHandoffCheckpointReport.contentReturned === false,
    finalLocalHandoffCheckpointReport.checkpointStepCount === 8,
    finalLocalHandoffCheckpointReport.readyCheckpointStepCount === 8,
    finalLocalHandoffCheckpointReport.blockedCheckpointStepCount === 0,
    finalLocalHandoffCheckpointReport.localCommandCount === 8,
    finalLocalHandoffCheckpointReport.handoffArtifactCount >= 13,
    finalLocalHandoffCheckpointReport.localRequirementCount >= 49,
    finalLocalHandoffCheckpointReport.provedCheckCount >= 70,
    finalLocalHandoffCheckpointReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(finalLocalHandoffCheckpointReport.checkpointHash || ""),
    provedCheckIds.has("final-local-handoff-checkpoint")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:final-handoff-checkpoint"] || "missing"}, endpoint=/api/delivery/final-local-handoff-checkpoint, agenticCheck=${provedCheckIds.has("final-local-handoff-checkpoint")}, steps=${finalLocalHandoffCheckpointReport.checkpointStepCount || 0}, commands=${finalLocalHandoffCheckpointReport.localCommandCount || 0}, openT3=${finalLocalHandoffCheckpointReport.openT3GapCount || 0}, finalGoalComplete=false`,
  files: [
    "scripts/final-local-handoff-checkpoint.mjs",
    "tests/final-local-handoff-checkpoint.mjs",
    "specs/phase4i-final-local-handoff-checkpoint-contract.md",
    "qa-artifacts/phase4i-final-local-handoff-checkpoint.json",
    "qa-artifacts/phase4i-final-local-handoff-checkpoint.md"
  ]
});

addRequirement({
  id: "objective-traceability",
  status: all([
    packageManifest.scripts?.["qa:objective-traceability"] === "node tests/objective-traceability.mjs",
    sourceBundle.includes("/api/delivery/objective-traceability"),
    sourceBundle.includes("objectiveTraceabilityStatus"),
    sourceBundle.includes("data-objective-traceability"),
    sourceBundle.includes("Phase 3D Objective Traceability Contract"),
    sourceBundle.includes("traceable-with-open-certification-gaps"),
    sourceBundle.includes("model-primary-routing"),
    sourceBundle.includes("model-fallback-routing"),
    sourceBundle.includes("image-model-separation"),
    sourceBundle.includes("three-round-agentic-internal-qa"),
    sourceBundle.includes("delivery-handoff-evidence"),
    sourceBundle.includes("external-provider-certification"),
    provedCheckIds.has("objective-traceability")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:objective-traceability"] || "missing"}, endpoint=/api/delivery/objective-traceability, agenticCheck=${provedCheckIds.has("objective-traceability")}, mappedRows=12, proved=9, openT3=3, finalGoalComplete=false`,
  files: [
    "scripts/objective-traceability.mjs",
    "tests/objective-traceability.mjs",
    "specs/phase3d-objective-traceability-contract.md",
    "scripts/fullstack-server.mjs",
    "src/app.js"
  ]
});

addRequirement({
  id: "t3-approval-packet",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-packet"] === "node tests/t3-approval-packet.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-packet"),
    sourceBundle.includes("t3ApprovalPacketStatus"),
    sourceBundle.includes("data-t3-approval-packet"),
    sourceBundle.includes("Phase 3E T3 Approval Packet Contract"),
    sourceBundle.includes("approval-packet-ready"),
    sourceBundle.includes("approvalPrompt"),
    sourceBundle.includes("safeToRunAutomatically"),
    sourceBundle.includes("approvedLaneCount"),
    sourceBundle.includes("certificationExecution: false"),
    provedCheckIds.has("t3-approval-packet")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-packet"] || "missing"}, endpoint=/api/delivery/t3-approval-packet, agenticCheck=${provedCheckIds.has("t3-approval-packet")}, lanes=3, approved=0, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-packet.mjs",
    "tests/t3-approval-packet.mjs",
    "specs/phase3e-t3-approval-packet-contract.md",
    "scripts/fullstack-server.mjs",
    "src/app.js"
  ]
});

addRequirement({
  id: "t3-dry-run-rehearsal",
  status: all([
    packageManifest.scripts?.["qa:t3-dry-run"] === "node tests/t3-dry-run-rehearsal.mjs",
    sourceBundle.includes("/api/delivery/t3-dry-run-rehearsal"),
    sourceBundle.includes("t3DryRunRehearsalStatus"),
    sourceBundle.includes("data-t3-dry-run-rehearsal"),
    sourceBundle.includes("Phase 3F T3 Dry-Run Rehearsal Contract"),
    sourceBundle.includes("rehearsal-ready-with-open-t3-gaps"),
    sourceBundle.includes("externalActionsExecuted"),
    sourceBundle.includes("certificationStateChanged"),
    sourceBundle.includes("commandCandidates"),
    sourceBundle.includes("externalActionsExecuted: false"),
    provedCheckIds.has("t3-dry-run-rehearsal")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-dry-run"] || "missing"}, endpoint=/api/delivery/t3-dry-run-rehearsal, agenticCheck=${provedCheckIds.has("t3-dry-run-rehearsal")}, lanes=3, failedChecks=0, externalActionsExecuted=false, certificationStateChanged=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-dry-run-rehearsal.mjs",
    "tests/t3-dry-run-rehearsal.mjs",
    "specs/phase3f-t3-dry-run-rehearsal-contract.md",
    "scripts/fullstack-server.mjs",
    "src/app.js"
  ]
});

addRequirement({
  id: "t3-approval-request-export",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-request"] === "node tests/t3-approval-request-export.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-request-export"),
    sourceBundle.includes("t3ApprovalRequestExportStatus"),
    sourceBundle.includes("data-t3-approval-request-export"),
    sourceBundle.includes("Phase 3G T3 Approval Request Export Contract"),
    sourceBundle.includes("approval-request-export-ready"),
    sourceBundle.includes("approvalText"),
    sourceBundle.includes("singleLaneOnly"),
    sourceBundle.includes("phase3g-t3-approval-request-export.json"),
    sourceBundle.includes("externalActionsExecuted: false"),
    provedCheckIds.has("t3-approval-request-export")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-request"] || "missing"}, endpoint=/api/delivery/t3-approval-request-export, agenticCheck=${provedCheckIds.has("t3-approval-request-export")}, requests=3, exportOnly=true, externalActionsExecuted=false, certificationStateChanged=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-request-export.mjs",
    "tests/t3-approval-request-export.mjs",
    "specs/phase3g-t3-approval-request-export-contract.md",
    "qa-artifacts/phase3g-t3-approval-request-export.json",
    "qa-artifacts/phase3g-t3-approval-request-export.md"
  ]
});

const approvalIntegrityReport = existsSync("qa-artifacts/phase3h-t3-approval-integrity.json")
  ? readJson("qa-artifacts/phase3h-t3-approval-integrity.json")
  : {};
addRequirement({
  id: "t3-approval-integrity",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-integrity"] === "node tests/t3-approval-integrity.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-integrity"),
    sourceBundle.includes("t3ApprovalIntegrityStatus"),
    sourceBundle.includes("data-t3-approval-integrity"),
    sourceBundle.includes("Phase 3H T3 Approval Integrity Contract"),
    sourceBundle.includes("approval-integrity-ready"),
    sourceBundle.includes("integrityBundleHash"),
    sourceBundle.includes("hashOnly"),
    sourceBundle.includes("contentReturned"),
    sourceBundle.includes("certificationExecution: false"),
    approvalIntegrityReport.phase === "3H",
    approvalIntegrityReport.status === "approval-integrity-ready",
    approvalIntegrityReport.finalGoalComplete === false,
    approvalIntegrityReport.hashOnly === true,
    approvalIntegrityReport.contentReturned === false,
    approvalIntegrityReport.missingArtifactCount === 0,
    approvalIntegrityReport.hashCount === approvalIntegrityReport.artifactCount,
    approvalIntegrityReport.secretExposure === false,
    provedCheckIds.has("t3-approval-integrity")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-integrity"] || "missing"}, endpoint=/api/delivery/t3-approval-integrity, agenticCheck=${provedCheckIds.has("t3-approval-integrity")}, artifacts=${approvalIntegrityReport.artifactCount || 0}, hashOnly=${approvalIntegrityReport.hashOnly === true}, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-integrity.mjs",
    "tests/t3-approval-integrity.mjs",
    "specs/phase3h-t3-approval-integrity-contract.md",
    "qa-artifacts/phase3h-t3-approval-integrity.json",
    "qa-artifacts/phase3h-t3-approval-integrity.md"
  ]
});

const approvalLockReport = existsSync("qa-artifacts/phase3i-t3-approval-lock.json")
  ? readJson("qa-artifacts/phase3i-t3-approval-lock.json")
  : {};
addRequirement({
  id: "t3-approval-lock",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-lock"] === "node tests/t3-approval-lock.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-lock"),
    sourceBundle.includes("t3ApprovalLockStatus"),
    sourceBundle.includes("data-t3-approval-lock"),
    sourceBundle.includes("Phase 3I T3 Approval Lock Contract"),
    sourceBundle.includes("approval-lock-ready-with-open-t3-gaps"),
    sourceBundle.includes("approvalLockHash"),
    sourceBundle.includes("approvalTextHash"),
    sourceBundle.includes("lockOnly"),
    sourceBundle.includes("approvalTextReturned: false"),
    approvalLockReport.phase === "3I",
    approvalLockReport.status === "approval-lock-ready-with-open-t3-gaps",
    approvalLockReport.finalGoalComplete === false,
    approvalLockReport.lockOnly === true,
    approvalLockReport.approved === false,
    approvalLockReport.executionAllowed === false,
    approvalLockReport.laneLockCount === 3,
    approvalLockReport.openCertificationGapCount === 3,
    /^[a-f0-9]{64}$/.test(approvalLockReport.approvalLockHash || ""),
    provedCheckIds.has("t3-approval-lock")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-lock"] || "missing"}, endpoint=/api/delivery/t3-approval-lock, agenticCheck=${provedCheckIds.has("t3-approval-lock")}, laneLocks=${approvalLockReport.laneLockCount || 0}, approved=${approvalLockReport.approved === true}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-lock.mjs",
    "tests/t3-approval-lock.mjs",
    "specs/phase3i-t3-approval-lock-contract.md",
    "qa-artifacts/phase3i-t3-approval-lock.json",
    "qa-artifacts/phase3i-t3-approval-lock.md"
  ]
});

const approvalVerifierReport = existsSync("qa-artifacts/phase3j-t3-approval-verifier.json")
  ? readJson("qa-artifacts/phase3j-t3-approval-verifier.json")
  : {};
addRequirement({
  id: "t3-approval-verifier",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-verifier"] === "node tests/t3-approval-verifier.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-verifier"),
    sourceBundle.includes("t3ApprovalVerifierStatus"),
    sourceBundle.includes("data-t3-approval-verifier"),
    sourceBundle.includes("Phase 3J T3 Approval Verifier Contract"),
    sourceBundle.includes("approval-verifier-ready-execution-blocked"),
    sourceBundle.includes("approval-metadata-verified-execution-blocked"),
    sourceBundle.includes("verifierOnly"),
    sourceBundle.includes("approvalRecorded"),
    approvalVerifierReport.phase === "3J",
    approvalVerifierReport.status === "approval-verifier-ready-execution-blocked",
    approvalVerifierReport.finalGoalComplete === false,
    approvalVerifierReport.verifierOnly === true,
    approvalVerifierReport.verificationPassed === false,
    approvalVerifierReport.approvalRecorded === false,
    approvalVerifierReport.executionAllowed === false,
    approvalVerifierReport.laneVerificationCount === 3,
    approvalVerifierReport.readyLaneVerificationCount === 3,
    provedCheckIds.has("t3-approval-verifier")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-verifier"] || "missing"}, endpoint=/api/delivery/t3-approval-verifier, agenticCheck=${provedCheckIds.has("t3-approval-verifier")}, lanes=${approvalVerifierReport.laneVerificationCount || 0}, verificationPassed=${approvalVerifierReport.verificationPassed === true}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-verifier.mjs",
    "tests/t3-approval-verifier.mjs",
    "specs/phase3j-t3-approval-verifier-contract.md",
    "qa-artifacts/phase3j-t3-approval-verifier.json",
    "qa-artifacts/phase3j-t3-approval-verifier.md"
  ]
});

const approvalCandidatesReport = existsSync("qa-artifacts/phase3k-t3-approval-candidates.json")
  ? readJson("qa-artifacts/phase3k-t3-approval-candidates.json")
  : {};
addRequirement({
  id: "t3-approval-candidates",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-candidates"] === "node tests/t3-approval-candidates.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-candidates"),
    sourceBundle.includes("t3ApprovalCandidatesStatus"),
    sourceBundle.includes("data-t3-approval-candidates"),
    sourceBundle.includes("Phase 3K T3 Approval Candidates Contract"),
    sourceBundle.includes("approval-candidates-ready-execution-blocked"),
    sourceBundle.includes("candidateOnly"),
    sourceBundle.includes("candidateBundleHash"),
    approvalCandidatesReport.phase === "3K",
    approvalCandidatesReport.status === "approval-candidates-ready-execution-blocked",
    approvalCandidatesReport.finalGoalComplete === false,
    approvalCandidatesReport.candidateOnly === true,
    approvalCandidatesReport.approvalRecorded === false,
    approvalCandidatesReport.executionAllowed === false,
    approvalCandidatesReport.candidateCount === 3,
    approvalCandidatesReport.verifierPassCount === 3,
    /^[a-f0-9]{64}$/.test(approvalCandidatesReport.candidateBundleHash || ""),
    provedCheckIds.has("t3-approval-candidates")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-candidates"] || "missing"}, endpoint=/api/delivery/t3-approval-candidates, agenticCheck=${provedCheckIds.has("t3-approval-candidates")}, candidates=${approvalCandidatesReport.candidateCount || 0}, verifierPass=${approvalCandidatesReport.verifierPassCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-candidates.mjs",
    "tests/t3-approval-candidates.mjs",
    "specs/phase3k-t3-approval-candidates-contract.md",
    "qa-artifacts/phase3k-t3-approval-candidates.json",
    "qa-artifacts/phase3k-t3-approval-candidates.md"
  ]
});

const approvalExecutionGateReport = existsSync("qa-artifacts/phase3l-t3-approval-execution-gate.json")
  ? readJson("qa-artifacts/phase3l-t3-approval-execution-gate.json")
  : {};
addRequirement({
  id: "t3-approval-execution-gate",
  status: all([
    packageManifest.scripts?.["qa:t3-approval-execution-gate"] === "node tests/t3-approval-execution-gate.mjs",
    sourceBundle.includes("/api/delivery/t3-approval-execution-gate"),
    sourceBundle.includes("t3ApprovalExecutionGateStatus"),
    sourceBundle.includes("data-t3-approval-execution-gate"),
    sourceBundle.includes("Phase 3L T3 Approval Execution Gate Contract"),
    sourceBundle.includes("approval-execution-gate-ready-execution-blocked"),
    sourceBundle.includes("approval-execution-gate-candidate-bound-execution-blocked"),
    sourceBundle.includes("gateOnly"),
    sourceBundle.includes("executionGateHash"),
    approvalExecutionGateReport.phase === "3L",
    approvalExecutionGateReport.status === "approval-execution-gate-ready-execution-blocked",
    approvalExecutionGateReport.finalGoalComplete === false,
    approvalExecutionGateReport.gateOnly === true,
    approvalExecutionGateReport.approvalRecorded === false,
    approvalExecutionGateReport.executionAllowed === false,
    approvalExecutionGateReport.laneGateCount === 3,
    approvalExecutionGateReport.readyLaneGateCount === 3,
    /^[a-f0-9]{64}$/.test(approvalExecutionGateReport.executionGateHash || ""),
    provedCheckIds.has("t3-approval-execution-gate")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-approval-execution-gate"] || "missing"}, endpoint=/api/delivery/t3-approval-execution-gate, agenticCheck=${provedCheckIds.has("t3-approval-execution-gate")}, lanes=${approvalExecutionGateReport.laneGateCount || 0}, ready=${approvalExecutionGateReport.readyLaneGateCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-approval-execution-gate.mjs",
    "tests/t3-approval-execution-gate.mjs",
    "specs/phase3l-t3-approval-execution-gate-contract.md",
    "qa-artifacts/phase3l-t3-approval-execution-gate.json",
    "qa-artifacts/phase3l-t3-approval-execution-gate.md"
  ]
});

const certificationEvidenceClosureReport = existsSync("qa-artifacts/phase3m-t3-certification-evidence-closure.json")
  ? readJson("qa-artifacts/phase3m-t3-certification-evidence-closure.json")
  : {};
addRequirement({
  id: "t3-certification-evidence-closure",
  status: all([
    packageManifest.scripts?.["qa:t3-certification-evidence-closure"] === "node tests/t3-certification-evidence-closure.mjs",
    sourceBundle.includes("/api/delivery/t3-certification-evidence-closure"),
    sourceBundle.includes("t3CertificationEvidenceClosureStatus"),
    sourceBundle.includes("data-t3-certification-evidence-closure"),
    sourceBundle.includes("Phase 3M T3 Certification Evidence Closure Contract"),
    sourceBundle.includes("certification-evidence-closure-ready-execution-blocked"),
    sourceBundle.includes("certification-evidence-closure-ready-state-unchanged"),
    sourceBundle.includes("closureOnly"),
    sourceBundle.includes("closureHash"),
    certificationEvidenceClosureReport.phase === "3M",
    certificationEvidenceClosureReport.status === "certification-evidence-closure-ready-execution-blocked",
    certificationEvidenceClosureReport.finalGoalComplete === false,
    certificationEvidenceClosureReport.closureOnly === true,
    certificationEvidenceClosureReport.approvalRecorded === false,
    certificationEvidenceClosureReport.executionAllowed === false,
    certificationEvidenceClosureReport.laneClosureCount === 3,
    certificationEvidenceClosureReport.readyLaneClosureCount === 3,
    /^[a-f0-9]{64}$/.test(certificationEvidenceClosureReport.closureHash || ""),
    provedCheckIds.has("t3-certification-evidence-closure")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-certification-evidence-closure"] || "missing"}, endpoint=/api/delivery/t3-certification-evidence-closure, agenticCheck=${provedCheckIds.has("t3-certification-evidence-closure")}, lanes=${certificationEvidenceClosureReport.laneClosureCount || 0}, ready=${certificationEvidenceClosureReport.readyLaneClosureCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-certification-evidence-closure.mjs",
    "tests/t3-certification-evidence-closure.mjs",
    "specs/phase3m-t3-certification-evidence-closure-contract.md",
    "qa-artifacts/phase3m-t3-certification-evidence-closure.json",
    "qa-artifacts/phase3m-t3-certification-evidence-closure.md"
  ]
});

const finalReadinessReport = existsSync("qa-artifacts/phase3n-final-delivery-readiness.json")
  ? readJson("qa-artifacts/phase3n-final-delivery-readiness.json")
  : {};
addRequirement({
  id: "final-delivery-readiness",
  status: all([
    packageManifest.scripts?.["qa:final-readiness"] === "node tests/final-delivery-readiness.mjs",
    sourceBundle.includes("/api/delivery/final-readiness"),
    sourceBundle.includes("finalDeliveryReadinessStatus"),
    sourceBundle.includes("data-final-delivery-readiness"),
    sourceBundle.includes("Phase 3N Final Delivery Readiness Contract"),
    sourceBundle.includes("final-readiness-local-evidence-ready-open-t3"),
    sourceBundle.includes("blockedByT3"),
    sourceBundle.includes("readinessHash"),
    finalReadinessReport.phase === "3N",
    finalReadinessReport.status === "final-readiness-local-evidence-ready-open-t3",
    finalReadinessReport.finalGoalComplete === false,
    finalReadinessReport.localEvidencePassed === true,
    finalReadinessReport.blockedByT3 === true,
    finalReadinessReport.openT3GapCount === 3,
    /^[a-f0-9]{64}$/.test(finalReadinessReport.readinessHash || ""),
    provedCheckIds.has("final-delivery-readiness")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:final-readiness"] || "missing"}, endpoint=/api/delivery/final-readiness, agenticCheck=${provedCheckIds.has("final-delivery-readiness")}, openT3=${finalReadinessReport.openT3GapCount || 0}, blockedByT3=${finalReadinessReport.blockedByT3 === true}, finalGoalComplete=false`,
  files: [
    "scripts/final-delivery-readiness.mjs",
    "tests/final-delivery-readiness.mjs",
    "specs/phase3n-final-delivery-readiness-contract.md",
    "qa-artifacts/phase3n-final-delivery-readiness.json",
    "qa-artifacts/phase3n-final-delivery-readiness.md"
  ]
});

const t3EvidenceBundleTemplatesReport = existsSync("qa-artifacts/phase3o-t3-evidence-bundle-templates.json")
  ? readJson("qa-artifacts/phase3o-t3-evidence-bundle-templates.json")
  : {};
addRequirement({
  id: "t3-evidence-bundle-templates",
  status: all([
    packageManifest.scripts?.["qa:t3-evidence-templates"] === "node tests/t3-evidence-bundle-templates.mjs",
    sourceBundle.includes("/api/delivery/t3-evidence-bundle-templates"),
    sourceBundle.includes("t3EvidenceBundleTemplateStatus"),
    sourceBundle.includes("data-t3-evidence-bundle-templates"),
    sourceBundle.includes("Phase 3O T3 Evidence Bundle Templates Contract"),
    sourceBundle.includes("evidence-bundle-templates-ready-execution-blocked"),
    sourceBundle.includes("templateOnly"),
    sourceBundle.includes("templateBundleHash"),
    t3EvidenceBundleTemplatesReport.phase === "3O",
    t3EvidenceBundleTemplatesReport.status === "evidence-bundle-templates-ready-execution-blocked",
    t3EvidenceBundleTemplatesReport.finalGoalComplete === false,
    t3EvidenceBundleTemplatesReport.templateOnly === true,
    t3EvidenceBundleTemplatesReport.executionAllowed === false,
    t3EvidenceBundleTemplatesReport.laneTemplateCount === 3,
    t3EvidenceBundleTemplatesReport.readyLaneTemplateCount === 3,
    /^[a-f0-9]{64}$/.test(t3EvidenceBundleTemplatesReport.templateBundleHash || ""),
    provedCheckIds.has("t3-evidence-bundle-templates")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-evidence-templates"] || "missing"}, endpoint=/api/delivery/t3-evidence-bundle-templates, agenticCheck=${provedCheckIds.has("t3-evidence-bundle-templates")}, lanes=${t3EvidenceBundleTemplatesReport.laneTemplateCount || 0}, ready=${t3EvidenceBundleTemplatesReport.readyLaneTemplateCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-evidence-bundle-templates.mjs",
    "tests/t3-evidence-bundle-templates.mjs",
    "specs/phase3o-t3-evidence-bundle-templates-contract.md",
    "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
    "qa-artifacts/phase3o-t3-evidence-bundle-templates.md"
  ]
});

const t3OperatorChecklistReport = existsSync("qa-artifacts/phase3p-t3-operator-checklist.json")
  ? readJson("qa-artifacts/phase3p-t3-operator-checklist.json")
  : {};
addRequirement({
  id: "t3-operator-checklist",
  status: all([
    packageManifest.scripts?.["qa:t3-operator-checklist"] === "node tests/t3-operator-checklist.mjs",
    sourceBundle.includes("/api/delivery/t3-operator-checklist"),
    sourceBundle.includes("t3OperatorChecklistStatus"),
    sourceBundle.includes("data-t3-operator-checklist"),
    sourceBundle.includes("Phase 3P T3 Operator Checklist Contract"),
    sourceBundle.includes("t3-operator-checklist-ready-execution-blocked"),
    sourceBundle.includes("operatorOnly"),
    sourceBundle.includes("checklistBundleHash"),
    t3OperatorChecklistReport.phase === "3P",
    t3OperatorChecklistReport.status === "t3-operator-checklist-ready-execution-blocked",
    t3OperatorChecklistReport.finalGoalComplete === false,
    t3OperatorChecklistReport.operatorOnly === true,
    t3OperatorChecklistReport.executionAllowed === false,
    t3OperatorChecklistReport.laneChecklistCount === 3,
    t3OperatorChecklistReport.readyLaneChecklistCount === 3,
    /^[a-f0-9]{64}$/.test(t3OperatorChecklistReport.checklistBundleHash || ""),
    provedCheckIds.has("t3-operator-checklist")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-operator-checklist"] || "missing"}, endpoint=/api/delivery/t3-operator-checklist, agenticCheck=${provedCheckIds.has("t3-operator-checklist")}, lanes=${t3OperatorChecklistReport.laneChecklistCount || 0}, ready=${t3OperatorChecklistReport.readyLaneChecklistCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-operator-checklist.mjs",
    "tests/t3-operator-checklist.mjs",
    "specs/phase3p-t3-operator-checklist-contract.md",
    "qa-artifacts/phase3p-t3-operator-checklist.json",
    "qa-artifacts/phase3p-t3-operator-checklist.md"
  ]
});

const t3OperatorTranscriptValidatorReport = existsSync("qa-artifacts/phase3q-t3-operator-transcript-validator.json")
  ? readJson("qa-artifacts/phase3q-t3-operator-transcript-validator.json")
  : {};
addRequirement({
  id: "t3-operator-transcript-validator",
  status: all([
    packageManifest.scripts?.["qa:t3-operator-transcript"] === "node tests/t3-operator-transcript-validator.mjs",
    sourceBundle.includes("/api/delivery/t3-operator-transcript-validator"),
    sourceBundle.includes("t3OperatorTranscriptValidatorStatus"),
    sourceBundle.includes("data-t3-operator-transcript-validator"),
    sourceBundle.includes("Phase 3Q T3 Operator Transcript Validator Contract"),
    sourceBundle.includes("t3-operator-transcript-validator-ready-execution-blocked"),
    sourceBundle.includes("t3-operator-transcript-valid-state-unchanged"),
    sourceBundle.includes("validatorOnly"),
    sourceBundle.includes("transcriptValidatorHash"),
    t3OperatorTranscriptValidatorReport.phase === "3Q",
    t3OperatorTranscriptValidatorReport.status === "t3-operator-transcript-validator-ready-execution-blocked",
    t3OperatorTranscriptValidatorReport.finalGoalComplete === false,
    t3OperatorTranscriptValidatorReport.validatorOnly === true,
    t3OperatorTranscriptValidatorReport.executionAllowed === false,
    t3OperatorTranscriptValidatorReport.laneValidationCount === 3,
    t3OperatorTranscriptValidatorReport.readyLaneValidationCount === 3,
    /^[a-f0-9]{64}$/.test(t3OperatorTranscriptValidatorReport.transcriptValidatorHash || ""),
    provedCheckIds.has("t3-operator-transcript-validator")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-operator-transcript"] || "missing"}, endpoint=/api/delivery/t3-operator-transcript-validator, agenticCheck=${provedCheckIds.has("t3-operator-transcript-validator")}, lanes=${t3OperatorTranscriptValidatorReport.laneValidationCount || 0}, ready=${t3OperatorTranscriptValidatorReport.readyLaneValidationCount || 0}, executionAllowed=false, finalGoalComplete=false`,
  files: [
    "scripts/t3-operator-transcript-validator.mjs",
    "tests/t3-operator-transcript-validator.mjs",
    "specs/phase3q-t3-operator-transcript-validator-contract.md",
    "qa-artifacts/phase3q-t3-operator-transcript-validator.json",
    "qa-artifacts/phase3q-t3-operator-transcript-validator.md"
  ]
});

addRequirement({
  id: "t3-certification-preflight",
  status: all([
    packageManifest.scripts?.["qa:t3-preflight"] === "node tests/t3-certification-preflight.mjs",
    sourceBundle.includes("/api/delivery/t3-preflight"),
    sourceBundle.includes("Phase 2X T3 Certification Preflight Contract"),
    sourceBundle.includes("t3PreflightStatus"),
    sourceBundle.includes("safeToRunAutomatically"),
    provedCheckIds.has("t3-certification-preflight")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-preflight"] || "missing"}, agenticCheck=${provedCheckIds.has("t3-certification-preflight")}, approvedPhaseReady=false`,
  files: ["scripts/t3-certification-preflight.mjs", "tests/t3-certification-preflight.mjs", "specs/phase2x-t3-certification-preflight-contract.md"]
});

addRequirement({
  id: "t3-certification-package",
  status: all([
    packageManifest.scripts?.["qa:t3-package"] === "node tests/t3-certification-package.mjs",
    sourceBundle.includes("/api/delivery/t3-certification-package"),
    sourceBundle.includes("Phase 2Y T3 Certification Package Contract"),
    sourceBundle.includes("t3PackageStatus"),
    sourceBundle.includes("data-t3-package"),
    sourceBundle.includes("executionAllowed"),
    provedCheckIds.has("t3-certification-package")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-package"] || "missing"}, agenticCheck=${provedCheckIds.has("t3-certification-package")}, executionAllowed=false`,
  files: ["scripts/t3-certification-package.mjs", "tests/t3-certification-package.mjs", "specs/phase2y-t3-certification-package-contract.md"]
});

addRequirement({
  id: "t3-evidence-intake",
  status: all([
    packageManifest.scripts?.["qa:t3-evidence"] === "node tests/t3-evidence-intake.mjs",
    sourceBundle.includes("/api/delivery/t3-evidence"),
    sourceBundle.includes("/api/delivery/t3-evidence/intake"),
    sourceBundle.includes("Phase 2Z T3 Evidence Intake Contract"),
    sourceBundle.includes("t3EvidenceStatus"),
    sourceBundle.includes("data-t3-evidence"),
    sourceBundle.includes("certificationStateChanged"),
    provedCheckIds.has("t3-evidence-intake")
  ]),
  evidence: `script=${packageManifest.scripts?.["qa:t3-evidence"] || "missing"}, agenticCheck=${provedCheckIds.has("t3-evidence-intake")}, certificationStateChanged=false`,
  files: ["scripts/t3-evidence-intake.mjs", "tests/t3-evidence-intake.mjs", "specs/phase2z-t3-evidence-intake-contract.md"]
});

addRequirement({
  id: "agentic-internal-qa",
  status: all([
    packageManifest.scripts?.["qa:agentic"] === "node tests/agentic-audit.mjs",
    agenticAudit.verdict === "PASS_WITH_OPEN_PRODUCT_GAPS",
    agenticAudit.clickQaExit === 0,
    (agenticAudit.completionMatrix || []).filter((item) => item.blocker !== false).every((item) => item.status === "proved"),
    provedCheckIds.has("three-round-agentic-run"),
    provedCheckIds.has("no-browser-runtime-errors")
  ]),
  evidence: `verdict=${agenticAudit.verdict}, clickQaExit=${agenticAudit.clickQaExit}, provedChecks=${provedCheckIds.size}`,
  files: ["tests/agentic-audit.mjs", "qa-artifacts/phase2o-agentic-audit.json"]
});

addRequirement({
  id: "delivery-readiness",
  status: expectedGapIds.every((id) => openCertificationGaps.some((gap) => gap.id === id)) ? "open" : "failed",
  evidence: `openCertificationGaps=${openCertificationGaps.map((gap) => gap.id).join(", ") || "none"}`,
  files: ["qa-artifacts/phase2o-agentic-audit.json", "specs/phase2s-delivery-completion-audit-contract.md"],
  localRequired: false
});

const localRequirements = requirements.filter((item) => item.localRequired !== false);
const trackedNonLocalRequirements = requirements.filter((item) => item.localRequired === false);
const localFailures = localRequirements.filter((item) => item.status !== "proved");
const missingGapIds = expectedGapIds.filter((id) => !openCertificationGaps.some((gap) => gap.id === id));
if (missingGapIds.length) failures.push(`missing expected certification gaps: ${missingGapIds.join(", ")}`);

const finalGoalComplete = localFailures.length === 0 && openCertificationGaps.length === 0;
const verdict = localFailures.length || failures.length
  ? "REQUEST_CHANGES"
  : finalGoalComplete
    ? "PASS_COMPLETE"
    : "PASS_WITH_OPEN_CERTIFICATION_GAPS";

const report = {
  phase: "2S",
  generatedAt: new Date().toISOString(),
  sourceAgenticAudit: "qa-artifacts/phase2o-agentic-audit.json",
  verdict,
  finalGoalComplete,
  localEvidencePassed: localFailures.length === 0 && failures.length === 0,
  localRequirementCount: localRequirements.length,
  trackedNonLocalRequirementCount: trackedNonLocalRequirements.length,
  requirements,
  openCertificationGaps,
  notes: [
    "This audit maps current local evidence to the delivery objective.",
    "PASS_WITH_OPEN_CERTIFICATION_GAPS means local evidence gates passed while external/T3 certification work remains incomplete.",
    "No real provider key, external provider call, managed database, production deploy, or billing action is required by this audit."
  ]
};

writeFileSync(auditJsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(auditMdPath, renderMarkdown(report), "utf8");

if (verdict === "REQUEST_CHANGES") {
  console.error(`Completion audit failed: localFailures=${localFailures.length}, failures=${failures.length}`);
  for (const failure of [...failures, ...localFailures.map((item) => `${item.id}: ${item.evidence}`)]) {
    console.error(failure);
  }
  console.error(`Evidence: ${auditJsonPath}`);
  process.exit(1);
}

console.log(`Completion audit passed: ${localRequirements.length} local requirement rows, ${trackedNonLocalRequirements.length} tracked non-local rows, ${openCertificationGaps.length} open certification gaps.`);
console.log(`Verdict: ${verdict}; finalGoalComplete=${finalGoalComplete}`);
console.log(`Evidence: ${auditJsonPath}`);
console.log(`Summary: ${auditMdPath}`);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function all(items) {
  return items.every(Boolean) ? "proved" : "failed";
}

function addRequirement({ id, status, evidence, files, localRequired = true }) {
  const row = { id, status, evidence, files, localRequired };
  requirements.push(row);
  if (localRequired && status !== "proved") {
    failures.push(`requirement failed: ${id}`);
  }
}

function renderMarkdown(report) {
  const requirementRows = report.requirements
    .map((item) => `| ${item.id} | ${item.status} | ${item.localRequired === false ? "no" : "yes"} | ${escapePipes(item.evidence)} | ${item.files.join("<br>")} |`)
    .join("\n");
  const gapRows = report.openCertificationGaps
    .map((gap) => `| ${gap.id} | ${gap.owner} | ${gap.severity} | ${escapePipes(gap.issue)} | ${escapePipes(gap.fix)} |`)
    .join("\n");
  return `# Phase 2S Delivery Completion Audit

Generated: ${report.generatedAt}

Verdict: **${report.verdict}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Local evidence passed: **${report.localEvidencePassed ? "yes" : "no"}**

## Requirement Matrix

| Requirement | Status | Local gate | Evidence | Files |
|---|---|---|---|---|
${requirementRows}

## Open Certification Gaps

| Gap | Owner | Severity | Issue | Next certification work |
|---|---|---|---|---|
${gapRows}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function escapePipes(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
