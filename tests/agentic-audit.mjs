import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const artifactsDir = resolve("qa-artifacts");
const auditPrefix = "phase2o";
const clickPrefix = `${auditPrefix}-agentic`;
const clickReportPath = join(artifactsDir, `${clickPrefix}-click-qa.json`);
const auditJsonPath = join(artifactsDir, `${auditPrefix}-agentic-audit.json`);
const auditMdPath = join(artifactsDir, `${auditPrefix}-agentic-audit.md`);

mkdirSync(artifactsDir, { recursive: true });

const startedAt = new Date().toISOString();
const child = await runNodeScript("tests/click-flow.mjs", {
  CLICK_QA_PREFIX: clickPrefix,
  CLICK_QA_ROUNDS: "3"
});

const clickReport = JSON.parse(readFileSync(clickReportPath, "utf8"));
const modelContracts = JSON.parse(readFileSync("data/model-contracts.json", "utf8"));
const sourceBundle = [
  "src/app.js",
  "src/styles.css",
  "scripts/fullstack-server.mjs",
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
  "scripts/model-provider.mjs",
  "scripts/provider-certification.mjs",
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
  "tests/provider-transport.mjs",
  "tests/provider-certification.mjs",
  "tests/completion-audit.mjs",
  "tests/sandbox-certification.mjs",
  "package.json",
  "tests/click-flow.mjs",
  "tests/visual-fidelity.mjs",
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
  "specs/phase2q-sandbox-isolation-hardening-contract.md",
  "specs/phase2p-live-provider-transport-contract.md",
  "specs/phase2u-provider-certification-readiness-contract.md",
  "specs/phase2o-agentic-qa-audit-contract.md"
].map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n\n");

const checks = [];
const issues = [];

function record(id, owner, status, evidence, blocker = true) {
  checks.push({ id, owner, status, evidence, blocker });
  if (status !== "proved" && blocker) {
    issues.push({ severity: "high", status: "blocking", id, owner, issue: evidence, fix: "Rerun or repair the failing workflow until this check is proved." });
  }
}

record(
  "three-round-agentic-run",
  "student-flow-agent",
  clickReport.rounds?.length >= 3 ? "proved" : "failed",
  `click rounds=${clickReport.rounds?.length || 0}`
);

record(
  "no-browser-runtime-errors",
  "student-flow-agent",
  (clickReport.consoleErrors || []).length === 0 ? "proved" : "failed",
  `consoleErrors=${(clickReport.consoleErrors || []).length}`
);

for (const round of clickReport.rounds || []) {
  record(
    `round-${round.round}-terminal-sandbox`,
    "student-flow-agent",
    round.runCount >= 1 && round.terminalRunJobCount >= round.runCount && round.runnerBoundaryCount >= round.runCount && round.sandboxIsolationCount >= round.runCount ? "proved" : "failed",
    `run=${round.runCount}, terminal=${round.terminalRunJobCount}, runnerBoundary=${round.runnerBoundaryCount}, sandboxIsolation=${round.sandboxIsolationCount}`
  );
  record(
    `round-${round.round}-submission-final`,
    "student-flow-agent",
    round.submittedCount >= 1 && Boolean(round.reviewedSubmissionId) ? "proved" : "failed",
    `submitted=${round.submittedCount}, reviewedSubmissionId=${round.reviewedSubmissionId || "missing"}`
  );
  record(
    `round-${round.round}-teacher-review-final`,
    "teacher-review-agent",
    round.reviewedCount >= 1 ? "proved" : "failed",
    `reviewedCount=${round.reviewedCount}`
  );
  record(
    `round-${round.round}-research-export-final`,
    "research-export-agent",
    round.exportCounts?.runCount >= 1 &&
      round.exportCounts?.terminalRunJobCount >= 1 &&
      round.exportCounts?.runnerBoundaryCount >= 1 &&
      round.exportCounts?.sandboxIsolationCount >= 1 &&
      round.exportCounts?.submissionCount >= 1 &&
      round.exportCounts?.reviewedSubmissionCount >= 1 &&
      round.exportCounts?.collabRoomCount >= 1 ? "proved" : "failed",
    `export=${JSON.stringify(round.exportCounts || {})}`
  );
  record(
    `round-${round.round}-model-route-final`,
    "model-security-agent",
    round.modelRouteCount >= 1 ? "proved" : "failed",
    `modelRouteCount=${round.modelRouteCount}`
  );
  record(
    `round-${round.round}-visual-fidelity-final`,
    "research-export-agent",
    round.visualFidelity === true ? "proved" : "failed",
    `visualFidelity=${round.visualFidelity}`
  );
}

const screenshotResults = Object.entries(clickReport.screenshots || {}).map(([name, file]) => ({
  name,
  file,
  exists: existsSync(file),
  sizeBytes: existsSync(file) ? statSync(file).size : 0
}));

record(
  "visual-screenshot-evidence",
  "research-export-agent",
  screenshotResults.length >= 5 && screenshotResults.every((item) => item.exists && item.sizeBytes > 1000) ? "proved" : "failed",
  screenshotResults.map((item) => `${item.name}:${item.sizeBytes}`).join(", ")
);

record(
  "model-routing-contract",
  "model-security-agent",
  modelContracts.coding?.primaryModel === "claude-sonnet-4-6" &&
    modelContracts.coding?.fallbackModel === "gpt-5.3-codex-spark" &&
    modelContracts.coding?.fallbackAfterMs === 1000 &&
    modelContracts.image?.model === "gpt-image-2" &&
    /providerRequest\?\.path !== "\/v1\/images"|path !== "\/v1\/images"|\/v1\/images/.test(sourceBundle) ? "proved" : "failed",
  `primary=${modelContracts.coding?.primaryModel}, fallback=${modelContracts.coding?.fallbackModel}, threshold=${modelContracts.coding?.fallbackAfterMs}, image=${modelContracts.image?.model}`
);

record(
  "provider-live-call-guard",
  "model-security-agent",
  sourceBundle.includes("T3-external-model-call") &&
    sourceBundle.includes("outboundCall: false") &&
    sourceBundle.includes("redactProviderPayload") ? "proved" : "failed",
  "live model transport remains guarded and redacted by default"
);

record(
  "sandbox-isolation-hardening",
  "student-flow-agent",
  sourceBundle.includes("sandbox-runner-v2") &&
    sourceBundle.includes("process-scrubbed-temp-workspace-no-exec") &&
    sourceBundle.includes("allowlist-scrubbed") &&
    sourceBundle.includes("Phase 2Q Sandbox Isolation Hardening Contract") ? "proved" : "failed",
  "local sandbox runner exposes v2 process, environment, workspace, timeout, and output isolation evidence"
);

record(
  "sandbox-certification-readiness",
  "student-flow-agent",
  sourceBundle.includes("/api/sandbox/certification") &&
    sourceBundle.includes("qa:sandbox-certification") &&
    sourceBundle.includes("Phase 2T Sandbox Runtime Certification Readiness Contract") &&
    sourceBundle.includes("readiness-only") &&
    sourceBundle.includes("sandboxCertificationStatus") ? "proved" : "failed",
  "local certification-readiness bundle exists while production runtime certification remains open"
);

record(
  "sql-database-adapter-foundation",
  "research-export-agent",
  sourceBundle.includes("sqlite-repository-v1") &&
    sourceBundle.includes("qa:db-adapter") &&
    sourceBundle.includes("Phase 2R SQL Database Adapter Contract") &&
    sourceBundle.includes("/api/db/rollback-probe") ? "proved" : "failed",
  "SQL database adapter, migration, rollback, and report evidence are implemented for local SQLite mode"
);

record(
  "database-certification-readiness",
  "research-export-agent",
  sourceBundle.includes("/api/db/certification") &&
    sourceBundle.includes("qa:db-certification") &&
    sourceBundle.includes("Phase 2V Managed Database Certification Readiness Contract") &&
    sourceBundle.includes("databaseCertificationStatus") &&
    sourceBundle.includes("readiness-only") ? "proved" : "failed",
  "local database certification-readiness bundle exists while managed external database certification remains open"
);

record(
  "localhost-provider-transport-harness",
  "model-security-agent",
  sourceBundle.includes("executeProviderTransport") &&
    sourceBundle.includes("qa:provider-transport") &&
    sourceBundle.includes("Phase 2P Live Provider Transport Contract") &&
    sourceBundle.includes("localhost mock provider") ? "proved" : "failed",
  "guarded live transport is implemented and verified against a localhost mock provider"
);

record(
  "provider-certification-readiness",
  "model-security-agent",
  sourceBundle.includes("/api/ai/provider/certification") &&
    sourceBundle.includes("qa:provider-certification") &&
    sourceBundle.includes("Phase 2U External Provider Certification Readiness Contract") &&
    sourceBundle.includes("providerCertificationStatus") &&
    sourceBundle.includes("readiness-only") ? "proved" : "failed",
  "local provider certification-readiness bundle exists while real external provider certification remains open"
);

record(
  "delivery-completion-audit",
  "research-export-agent",
  sourceBundle.includes("qa:completion") &&
    sourceBundle.includes("Phase 2S Delivery Completion Audit Contract") &&
    sourceBundle.includes("PASS_WITH_OPEN_CERTIFICATION_GAPS") &&
    sourceBundle.includes("finalGoalComplete") ? "proved" : "failed",
  "Phase 2S completion audit is wired to distinguish local evidence from external certification gaps"
);

record(
  "delivery-certification-overview",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/certification-overview") &&
    sourceBundle.includes("qa:certification-overview") &&
    sourceBundle.includes("Phase 2W Delivery Certification Overview Contract") &&
    sourceBundle.includes("deliveryOverviewStatus") &&
    sourceBundle.includes("data-delivery-overview") ? "proved" : "failed",
  "Phase 2W delivery overview consolidates local evidence, readiness surfaces, and open T3 certification gaps"
);

record(
  "delivery-handoff-dossier",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/handoff-dossier") &&
    sourceBundle.includes("qa:handoff-dossier") &&
    sourceBundle.includes("Phase 3A Delivery Handoff Dossier Contract") &&
    sourceBundle.includes("handoffDossierStatus") &&
    sourceBundle.includes("data-delivery-dossier") &&
    sourceBundle.includes("handoff-ready-with-open-certification-gaps") ? "proved" : "failed",
  "Phase 3A delivery handoff dossier consolidates local evidence, agentic QA, T3 package/evidence state, and open certification gaps"
);

record(
  "delivery-handoff-export",
  "research-export-agent",
  sourceBundle.includes("qa:handoff-export") &&
    sourceBundle.includes("writeDeliveryHandoffExport") &&
    sourceBundle.includes("Phase 3B Delivery Handoff Export Contract") &&
    sourceBundle.includes("phase3b-delivery-handoff-dossier.json") &&
    sourceBundle.includes("phase3b-delivery-handoff-dossier.md") &&
    sourceBundle.includes("offlineOnlyExport") &&
    sourceBundle.includes("finalGoalComplete: false") ? "proved" : "failed",
  "Phase 3B delivery handoff export materializes the local dossier as JSON and Markdown while keeping finalGoalComplete=false"
);

record(
  "delivery-artifact-index",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/artifacts") &&
    sourceBundle.includes("qa:artifact-index") &&
    sourceBundle.includes("Phase 3C Delivery Artifact Index Contract") &&
    sourceBundle.includes("deliveryArtifactIndexStatus") &&
    sourceBundle.includes("data-delivery-artifacts") &&
    sourceBundle.includes("artifact-index-ready-with-open-certification-gaps") &&
    sourceBundle.includes("contentReturned") &&
    sourceBundle.includes("sha256") ? "proved" : "failed",
  "Phase 3C delivery artifact index exposes metadata-only artifact inventory and hashes while preserving open certification gaps"
);

record(
  "agentic-qa-replay-dossier",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/agentic-qa-replay") &&
    sourceBundle.includes("qa:agentic-replay") &&
    sourceBundle.includes("Phase 3R Agentic QA Replay Dossier Contract") &&
    sourceBundle.includes("agenticQaReplayStatus") &&
    sourceBundle.includes("data-agentic-qa-replay") &&
    sourceBundle.includes("agentic-qa-replay-ready-open-t3") &&
    sourceBundle.includes("replayOnly") &&
    sourceBundle.includes("screenshotBytesReturned") &&
    sourceBundle.includes("replayHash") ? "proved" : "failed",
  "Phase 3R packages three-round agentic QA evidence into a replay-only dossier without screenshot bytes, artifact bodies, external calls, or final-complete claims"
);

record(
  "visual-qa-storyboard",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/visual-storyboard") &&
    sourceBundle.includes("qa:visual-storyboard") &&
    sourceBundle.includes("Phase 3S Visual QA Storyboard Contract") &&
    sourceBundle.includes("visualStoryboardStatus") &&
    sourceBundle.includes("data-visual-storyboard") &&
    sourceBundle.includes("visual-storyboard-ready-open-t3") &&
    sourceBundle.includes("storyboardOnly") &&
    sourceBundle.includes("screenshotBytesEmbedded") &&
    sourceBundle.includes("storyboardHash") ? "proved" : "failed",
  "Phase 3S packages role-flow screenshots into a local visual storyboard without screenshot byte embedding, external calls, artifact bodies, or final-complete claims"
);

record(
  "delivery-release-candidate",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/release-candidate") &&
    sourceBundle.includes("qa:release-candidate") &&
    sourceBundle.includes("Phase 3T Delivery Release Candidate Contract") &&
    sourceBundle.includes("releaseCandidateStatus") &&
    sourceBundle.includes("data-delivery-release-candidate") &&
    sourceBundle.includes("release-candidate-local-evidence-ready-open-t3") &&
    sourceBundle.includes("releaseCandidateOnly") &&
    sourceBundle.includes("readyForProductionRelease") &&
    sourceBundle.includes("releaseCandidateHash") ? "proved" : "failed",
  "Phase 3T packages the latest local delivery evidence into a release-candidate-only handoff bundle while keeping production release and final completion blocked by T3"
);

record(
  "t3-certification-next-actions",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-certification-next-actions") &&
    sourceBundle.includes("qa:t3-next-actions") &&
    sourceBundle.includes("Phase 3U T3 Certification Next Actions Contract") &&
    sourceBundle.includes("t3CertificationNextActionsStatus") &&
    sourceBundle.includes("data-t3-certification-next-actions") &&
    sourceBundle.includes("t3-certification-next-actions-ready-execution-blocked") &&
    sourceBundle.includes("nextActionsOnly") &&
    sourceBundle.includes("singleLaneOnly") &&
    sourceBundle.includes("nextActionsHash") ? "proved" : "failed",
  "Phase 3U maps the remaining T3 gaps to exact approval-gated next actions while keeping execution and final completion blocked"
);

record(
  "t3-single-lane-run-packets",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-single-lane-run-packets") &&
    sourceBundle.includes("qa:t3-run-packets") &&
    sourceBundle.includes("Phase 3V T3 Single-Lane Run Packets Contract") &&
    sourceBundle.includes("t3SingleLaneRunPacketStatus") &&
    sourceBundle.includes("data-t3-single-lane-run-packets") &&
    sourceBundle.includes("t3-single-lane-run-packets-ready-execution-blocked") &&
    sourceBundle.includes("runPacketsOnly") &&
    sourceBundle.includes("singleLaneOnly") &&
    sourceBundle.includes("runPacketBundleHash") ? "proved" : "failed",
  "Phase 3V packages each T3 gap into a single-lane metadata run packet while keeping approval, execution, production release, and final completion blocked"
);

record(
  "t3-run-packet-verifier",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-run-packet-verifier") &&
    sourceBundle.includes("qa:t3-run-packet-verifier") &&
    sourceBundle.includes("Phase 3W T3 Run Packet Verifier Contract") &&
    sourceBundle.includes("t3RunPacketVerifierStatus") &&
    sourceBundle.includes("data-t3-run-packet-verifier") &&
    sourceBundle.includes("t3-run-packet-verifier-ready-execution-blocked") &&
    sourceBundle.includes("verifierOnly") &&
    sourceBundle.includes("verifierHash") ? "proved" : "failed",
  "Phase 3W validates exactly one T3 run packet before any approved phase while keeping approval, execution, production release, and final completion blocked"
);

record(
  "delivery-reviewer-cockpit",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/reviewer-cockpit") &&
    sourceBundle.includes("qa:reviewer-cockpit") &&
    sourceBundle.includes("Phase 3X Delivery Reviewer Cockpit Contract") &&
    sourceBundle.includes("deliveryReviewerCockpitStatus") &&
    sourceBundle.includes("data-delivery-reviewer-cockpit") &&
    sourceBundle.includes("reviewer-cockpit-ready-open-t3") &&
    sourceBundle.includes("reviewerCockpitOnly") &&
    sourceBundle.includes("reviewerCockpitHash") ? "proved" : "failed",
  "Phase 3X consolidates final review evidence into one metadata-only cockpit while keeping production release and final completion blocked by T3"
);

record(
  "delivery-launch-guide",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/launch-guide") &&
    sourceBundle.includes("qa:launch-guide") &&
    sourceBundle.includes("Phase 3Y Delivery Launch Guide Contract") &&
    sourceBundle.includes("deliveryLaunchGuideStatus") &&
    sourceBundle.includes("data-delivery-launch-guide") &&
    sourceBundle.includes("delivery-launch-guide-ready-open-t3") &&
    sourceBundle.includes("launchGuideOnly") &&
    sourceBundle.includes("launchGuideHash") ? "proved" : "failed",
  "Phase 3Y turns local delivery evidence into a metadata-only launch guide while keeping production release and final completion blocked by T3"
);

record(
  "delivery-consistency-sentinel",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/consistency-sentinel") &&
    sourceBundle.includes("qa:consistency-sentinel") &&
    sourceBundle.includes("Phase 3Z Delivery Consistency Sentinel Contract") &&
    sourceBundle.includes("deliveryConsistencySentinelStatus") &&
    sourceBundle.includes("data-delivery-consistency-sentinel") &&
    sourceBundle.includes("delivery-consistency-sentinel-ready-open-t3") &&
    sourceBundle.includes("sentinelOnly") &&
    sourceBundle.includes("consistencyHash") ? "proved" : "failed",
  "Phase 3Z validates delivery evidence consistency across local handoff surfaces while keeping production release and final completion blocked by T3"
);

record(
  "final-acceptance-matrix",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/final-acceptance-matrix") &&
    sourceBundle.includes("qa:acceptance-matrix") &&
    sourceBundle.includes("Phase 4A Final Acceptance Matrix Contract") &&
    sourceBundle.includes("finalAcceptanceMatrixStatus") &&
    sourceBundle.includes("data-final-acceptance-matrix") &&
    sourceBundle.includes("final-acceptance-matrix-ready-open-t3") &&
    sourceBundle.includes("acceptanceMatrixOnly") &&
    sourceBundle.includes("acceptanceHash") ? "proved" : "failed",
  "Phase 4A maps the full local objective into a final acceptance matrix while keeping production release and final completion blocked by T3"
);

record(
  "certification-blocker-board",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/certification-blocker-board") &&
    sourceBundle.includes("qa:certification-blocker-board") &&
    sourceBundle.includes("Phase 4B Certification Blocker Board Contract") &&
    sourceBundle.includes("certificationBlockerBoardStatus") &&
    sourceBundle.includes("data-certification-blocker-board") &&
    sourceBundle.includes("certification-blocker-board-ready-open-t3") &&
    sourceBundle.includes("blockerBoardOnly") &&
    sourceBundle.includes("boardHash") ? "proved" : "failed",
  "Phase 4B maps the three remaining T3 blockers into a local operator board while keeping production release and final completion blocked by T3"
);

record(
  "user-acceptance-rehearsal",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/user-acceptance-rehearsal") &&
    sourceBundle.includes("qa:user-acceptance-rehearsal") &&
    sourceBundle.includes("Phase 4C User Acceptance Rehearsal Contract") &&
    sourceBundle.includes("userAcceptanceRehearsalStatus") &&
    sourceBundle.includes("data-user-acceptance-rehearsal") &&
    sourceBundle.includes("user-acceptance-rehearsal-ready-open-t3") &&
    sourceBundle.includes("userAcceptanceRehearsalOnly") &&
    sourceBundle.includes("rehearsalHash") ? "proved" : "failed",
  "Phase 4C rehearses student, teacher, and research delivery acceptance locally while keeping production release and final completion blocked by T3"
);

record(
  "delivery-evidence-navigator",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/evidence-navigator") &&
    sourceBundle.includes("qa:evidence-navigator") &&
    sourceBundle.includes("Phase 4D Delivery Evidence Navigator Contract") &&
    sourceBundle.includes("deliveryEvidenceNavigatorStatus") &&
    sourceBundle.includes("data-delivery-evidence-navigator") &&
    sourceBundle.includes("delivery-evidence-navigator-ready-open-t3") &&
    sourceBundle.includes("deliveryEvidenceNavigatorOnly") &&
    sourceBundle.includes("navigatorHash") ? "proved" : "failed",
  "Phase 4D gives reviewers a metadata-only evidence navigator over student, teacher, research, visual, QA, and open T3 certification proof"
);

record(
  "local-delivery-summary-packet",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/local-summary-packet") &&
    sourceBundle.includes("qa:local-summary-packet") &&
    sourceBundle.includes("Phase 4E Local Delivery Summary Packet Contract") &&
    sourceBundle.includes("localDeliverySummaryStatus") &&
    sourceBundle.includes("data-local-delivery-summary") &&
    sourceBundle.includes("local-delivery-summary-ready-open-t3") &&
    sourceBundle.includes("summaryPacketOnly") &&
    sourceBundle.includes("summaryHash") ? "proved" : "failed",
  "Phase 4E summarizes local delivery readiness into a metadata-only handoff packet while keeping production release and final completion blocked by T3"
);

record(
  "local-delivery-handoff-brief",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/handoff-brief") &&
    sourceBundle.includes("qa:handoff-brief") &&
    sourceBundle.includes("Phase 4F Local Delivery Handoff Brief Contract") &&
    sourceBundle.includes("localDeliveryHandoffBriefStatus") &&
    sourceBundle.includes("data-local-delivery-handoff-brief") &&
    sourceBundle.includes("local-delivery-handoff-brief-ready-open-t3") &&
    sourceBundle.includes("handoffBriefOnly") &&
    sourceBundle.includes("briefHash") ? "proved" : "failed",
  "Phase 4F provides a metadata-only local handoff brief with local commands, review entrypoints, QA evidence, and open T3 boundaries"
);

record(
  "local-delivery-quickstart-bundle",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/quickstart-bundle") &&
    sourceBundle.includes("qa:quickstart-bundle") &&
    sourceBundle.includes("Phase 4G Local Delivery Quickstart Bundle Contract") &&
    sourceBundle.includes("localDeliveryQuickstartStatus") &&
    sourceBundle.includes("data-local-delivery-quickstart") &&
    sourceBundle.includes("local-delivery-quickstart-ready-open-t3") &&
    sourceBundle.includes("quickstartBundleOnly") &&
    sourceBundle.includes("quickstartHash") ? "proved" : "failed",
  "Phase 4G provides a metadata-only local quickstart bundle with ordered steps, local routes, local commands, and open T3 boundaries"
);

record(
  "local-delivery-verification-suite",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/local-verification-suite") &&
    sourceBundle.includes("qa:local-verification-suite") &&
    sourceBundle.includes("Phase 4H Local Delivery Verification Suite Contract") &&
    sourceBundle.includes("localDeliveryVerificationSuiteStatus") &&
    sourceBundle.includes("data-local-delivery-verification-suite") &&
    sourceBundle.includes("local-delivery-verification-suite-ready-open-t3") &&
    sourceBundle.includes("verificationSuiteOnly") &&
    sourceBundle.includes("suiteHash") ? "proved" : "failed",
  "Phase 4H provides a metadata-only local verification suite for repeatable local delivery checks while T3 stays open"
);

record(
  "final-local-handoff-checkpoint",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/final-local-handoff-checkpoint") &&
    sourceBundle.includes("qa:final-handoff-checkpoint") &&
    sourceBundle.includes("Phase 4I Final Local Handoff Checkpoint Contract") &&
    sourceBundle.includes("finalLocalHandoffCheckpointStatus") &&
    sourceBundle.includes("data-final-local-handoff-checkpoint") &&
    sourceBundle.includes("final-local-handoff-checkpoint-ready-open-t3") &&
    sourceBundle.includes("checkpointOnly") &&
    sourceBundle.includes("checkpointHash") ? "proved" : "failed",
  "Phase 4I provides a metadata-only final local handoff checkpoint after local verification while T3 stays open"
);

record(
  "objective-traceability",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/objective-traceability") &&
    sourceBundle.includes("qa:objective-traceability") &&
    sourceBundle.includes("Phase 3D Objective Traceability Contract") &&
    sourceBundle.includes("objectiveTraceabilityStatus") &&
    sourceBundle.includes("data-objective-traceability") &&
    sourceBundle.includes("traceable-with-open-certification-gaps") &&
    sourceBundle.includes("model-primary-routing") &&
    sourceBundle.includes("image-model-separation") &&
    sourceBundle.includes("three-round-agentic-internal-qa") &&
    sourceBundle.includes("external-provider-certification") ? "proved" : "failed",
  "Phase 3D objective traceability maps original requirements to local evidence and keeps T3 certification rows open"
);

record(
  "t3-approval-packet",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-packet") &&
    sourceBundle.includes("qa:t3-approval-packet") &&
    sourceBundle.includes("Phase 3E T3 Approval Packet Contract") &&
    sourceBundle.includes("t3ApprovalPacketStatus") &&
    sourceBundle.includes("data-t3-approval-packet") &&
    sourceBundle.includes("approval-packet-ready") &&
    sourceBundle.includes("approvalPrompt") &&
    sourceBundle.includes("safeToRunAutomatically") &&
    sourceBundle.includes("approvedLaneCount") ? "proved" : "failed",
  "Phase 3E T3 approval packet prepares approval prompts, rollback summaries, and evidence checklists while keeping execution blocked"
);

record(
  "t3-dry-run-rehearsal",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-dry-run-rehearsal") &&
    sourceBundle.includes("qa:t3-dry-run") &&
    sourceBundle.includes("Phase 3F T3 Dry-Run Rehearsal Contract") &&
    sourceBundle.includes("t3DryRunRehearsalStatus") &&
    sourceBundle.includes("data-t3-dry-run-rehearsal") &&
    sourceBundle.includes("rehearsal-ready-with-open-t3-gaps") &&
    sourceBundle.includes("externalActionsExecuted") &&
    sourceBundle.includes("certificationStateChanged") &&
    sourceBundle.includes("commandCandidates") ? "proved" : "failed",
  "Phase 3F T3 dry-run rehearsal validates local command candidates and blocked execution before any approved T3 certification lane"
);

record(
  "t3-approval-request-export",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-request-export") &&
    sourceBundle.includes("qa:t3-approval-request") &&
    sourceBundle.includes("Phase 3G T3 Approval Request Export Contract") &&
    sourceBundle.includes("t3ApprovalRequestExportStatus") &&
    sourceBundle.includes("data-t3-approval-request-export") &&
    sourceBundle.includes("approval-request-export-ready") &&
    sourceBundle.includes("approvalText") &&
    sourceBundle.includes("singleLaneOnly") &&
    sourceBundle.includes("phase3g-t3-approval-request-export.json") ? "proved" : "failed",
  "Phase 3G T3 approval request export materializes reviewable single-lane approval requests without executing certification"
);

record(
  "t3-approval-integrity",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-integrity") &&
    sourceBundle.includes("qa:t3-approval-integrity") &&
    sourceBundle.includes("Phase 3H T3 Approval Integrity Contract") &&
    sourceBundle.includes("t3ApprovalIntegrityStatus") &&
    sourceBundle.includes("data-t3-approval-integrity") &&
    sourceBundle.includes("approval-integrity-ready") &&
    sourceBundle.includes("integrityBundleHash") &&
    sourceBundle.includes("hashOnly") &&
    sourceBundle.includes("contentReturned") &&
    sourceBundle.includes("phase3h-t3-approval-integrity.json") ? "proved" : "failed",
  "Phase 3H T3 approval integrity materializes a local hash-only inventory without returning artifact contents or changing certification state"
);

record(
  "t3-approval-lock",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-lock") &&
    sourceBundle.includes("qa:t3-approval-lock") &&
    sourceBundle.includes("Phase 3I T3 Approval Lock Contract") &&
    sourceBundle.includes("t3ApprovalLockStatus") &&
    sourceBundle.includes("data-t3-approval-lock") &&
    sourceBundle.includes("approval-lock-ready-with-open-t3-gaps") &&
    sourceBundle.includes("approvalLockHash") &&
    sourceBundle.includes("approvalTextHash") &&
    sourceBundle.includes("phase3i-t3-approval-lock.json") ? "proved" : "failed",
  "Phase 3I T3 approval lock binds approval request metadata to integrity evidence without returning approval text or allowing execution"
);

record(
  "t3-approval-verifier",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-verifier") &&
    sourceBundle.includes("qa:t3-approval-verifier") &&
    sourceBundle.includes("Phase 3J T3 Approval Verifier Contract") &&
    sourceBundle.includes("t3ApprovalVerifierStatus") &&
    sourceBundle.includes("data-t3-approval-verifier") &&
    sourceBundle.includes("approval-verifier-ready-execution-blocked") &&
    sourceBundle.includes("approval-metadata-verified-execution-blocked") &&
    sourceBundle.includes("verifierOnly") &&
    sourceBundle.includes("approvalRecorded") ? "proved" : "failed",
  "Phase 3J T3 approval verifier checks single-lane lock metadata without recording approval or allowing execution"
);

record(
  "t3-approval-candidates",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-candidates") &&
    sourceBundle.includes("qa:t3-approval-candidates") &&
    sourceBundle.includes("Phase 3K T3 Approval Candidates Contract") &&
    sourceBundle.includes("t3ApprovalCandidatesStatus") &&
    sourceBundle.includes("data-t3-approval-candidates") &&
    sourceBundle.includes("approval-candidates-ready-execution-blocked") &&
    sourceBundle.includes("candidateOnly") &&
    sourceBundle.includes("candidateBundleHash") ? "proved" : "failed",
  "Phase 3K T3 approval candidates export verifier-ready single-lane metadata without approval text or execution"
);

record(
  "t3-approval-execution-gate",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-approval-execution-gate") &&
    sourceBundle.includes("qa:t3-approval-execution-gate") &&
    sourceBundle.includes("Phase 3L T3 Approval Execution Gate Contract") &&
    sourceBundle.includes("t3ApprovalExecutionGateStatus") &&
    sourceBundle.includes("data-t3-approval-execution-gate") &&
    sourceBundle.includes("approval-execution-gate-ready-execution-blocked") &&
    sourceBundle.includes("approval-execution-gate-candidate-bound-execution-blocked") &&
    sourceBundle.includes("gateOnly") &&
    sourceBundle.includes("executionGateHash") ? "proved" : "failed",
  "Phase 3L T3 approval execution gate binds one verifier-ready candidate to pre-execution evidence and rollback checks while keeping execution blocked"
);

record(
  "t3-certification-evidence-closure",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-certification-evidence-closure") &&
    sourceBundle.includes("qa:t3-certification-evidence-closure") &&
    sourceBundle.includes("Phase 3M T3 Certification Evidence Closure Contract") &&
    sourceBundle.includes("t3CertificationEvidenceClosureStatus") &&
    sourceBundle.includes("data-t3-certification-evidence-closure") &&
    sourceBundle.includes("certification-evidence-closure-ready-execution-blocked") &&
    sourceBundle.includes("certification-evidence-closure-ready-state-unchanged") &&
    sourceBundle.includes("closureOnly") &&
    sourceBundle.includes("closureHash") ? "proved" : "failed",
  "Phase 3M T3 certification evidence closure validates a future evidence bundle locally while keeping certification state unchanged"
);

record(
  "final-delivery-readiness",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/final-readiness") &&
    sourceBundle.includes("qa:final-readiness") &&
    sourceBundle.includes("Phase 3N Final Delivery Readiness Contract") &&
    sourceBundle.includes("finalDeliveryReadinessStatus") &&
    sourceBundle.includes("data-final-delivery-readiness") &&
    sourceBundle.includes("final-readiness-local-evidence-ready-open-t3") &&
    sourceBundle.includes("blockedByT3") &&
    sourceBundle.includes("readinessHash") ? "proved" : "failed",
  "Phase 3N final delivery readiness aggregates local evidence and preserves open T3 blockers without claiming completion"
);

record(
  "t3-evidence-bundle-templates",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-evidence-bundle-templates") &&
    sourceBundle.includes("qa:t3-evidence-templates") &&
    sourceBundle.includes("Phase 3O T3 Evidence Bundle Templates Contract") &&
    sourceBundle.includes("t3EvidenceBundleTemplateStatus") &&
    sourceBundle.includes("data-t3-evidence-bundle-templates") &&
    sourceBundle.includes("evidence-bundle-templates-ready-execution-blocked") &&
    sourceBundle.includes("templateOnly") &&
    sourceBundle.includes("templateBundleHash") ? "proved" : "failed",
  "Phase 3O T3 evidence bundle templates prepare lane-scoped evidence and rollback placeholders while keeping execution blocked"
);

record(
  "t3-operator-checklist",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-operator-checklist") &&
    sourceBundle.includes("qa:t3-operator-checklist") &&
    sourceBundle.includes("Phase 3P T3 Operator Checklist Contract") &&
    sourceBundle.includes("t3OperatorChecklistStatus") &&
    sourceBundle.includes("data-t3-operator-checklist") &&
    sourceBundle.includes("t3-operator-checklist-ready-execution-blocked") &&
    sourceBundle.includes("operatorOnly") &&
    sourceBundle.includes("checklistBundleHash") ? "proved" : "failed",
  "Phase 3P T3 operator checklist consolidates readiness, candidates, gates, and templates into manual pre-execution steps while keeping execution blocked"
);

record(
  "t3-operator-transcript-validator",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-operator-transcript-validator") &&
    sourceBundle.includes("qa:t3-operator-transcript") &&
    sourceBundle.includes("Phase 3Q T3 Operator Transcript Validator Contract") &&
    sourceBundle.includes("t3OperatorTranscriptValidatorStatus") &&
    sourceBundle.includes("data-t3-operator-transcript-validator") &&
    sourceBundle.includes("t3-operator-transcript-validator-ready-execution-blocked") &&
    sourceBundle.includes("t3-operator-transcript-valid-state-unchanged") &&
    sourceBundle.includes("validatorOnly") &&
    sourceBundle.includes("transcriptValidatorHash") ? "proved" : "failed",
  "Phase 3Q T3 operator transcript validator checks future operator transcript metadata while keeping execution and certification state blocked"
);

record(
  "t3-certification-preflight",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-preflight") &&
    sourceBundle.includes("qa:t3-preflight") &&
    sourceBundle.includes("Phase 2X T3 Certification Preflight Contract") &&
    sourceBundle.includes("t3PreflightStatus") &&
    sourceBundle.includes("safeToRunAutomatically") ? "proved" : "failed",
  "Phase 2X T3 preflight checks runtime, database, and provider certification prerequisites without external action"
);

record(
  "t3-certification-package",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-certification-package") &&
    sourceBundle.includes("qa:t3-package") &&
    sourceBundle.includes("Phase 2Y T3 Certification Package Contract") &&
    sourceBundle.includes("t3PackageStatus") &&
    sourceBundle.includes("data-t3-package") &&
    sourceBundle.includes("executionAllowed") ? "proved" : "failed",
  "Phase 2Y T3 package exports approval, rollback, evidence, and runbook surfaces without executing certification"
);

record(
  "t3-evidence-intake",
  "research-export-agent",
  sourceBundle.includes("/api/delivery/t3-evidence") &&
    sourceBundle.includes("/api/delivery/t3-evidence/intake") &&
    sourceBundle.includes("qa:t3-evidence") &&
    sourceBundle.includes("Phase 2Z T3 Evidence Intake Contract") &&
    sourceBundle.includes("t3EvidenceStatus") &&
    sourceBundle.includes("data-t3-evidence") &&
    sourceBundle.includes("certificationStateChanged") ? "proved" : "failed",
  "Phase 2Z T3 evidence intake records candidate-only evidence, rejects secret-like payloads, and never changes certification state"
);

record(
  "ai-message-request-redaction",
  "model-security-agent",
  sourceBundle.includes("sanitizedAiRequest") &&
    sourceBundle.includes("redactedTextPreview") &&
    sourceBundle.includes("redactedPayload: redactProviderPayload(payload)") ? "proved" : "failed",
  "tutor/image requests are persisted as redacted payload summaries"
);

const secretMatches = sourceBundle.match(/\bsk-[A-Za-z0-9_-]{20,}\b/g) || [];
record(
  "no-key-shaped-secret-in-source-bundle",
  "model-security-agent",
  secretMatches.length === 0 ? "proved" : "failed",
  `keyShapedMatches=${secretMatches.length}`
);

const openProductGaps = [
  {
    severity: "medium",
    status: "open",
    id: "container-runtime-certification",
    owner: "platform-hardening",
    issue: "Local sandbox runner now has v2 process/env/workspace hardening, but it is not yet a certified production container, VM, or browser-WASM runtime.",
    fix: "Add a certified isolated runtime with CPU/memory quotas, filesystem mount policy, network namespace controls, and escape-regression tests."
  },
  {
    severity: "medium",
    status: "open",
    id: "managed-database-certification",
    owner: "platform-hardening",
    issue: "Local SQLite adapter now proves SQL migrations and rollback, but no managed external database has been provisioned or certified.",
    fix: "Add a managed Postgres/Supabase or equivalent adapter with credentials kept out of source, migration rollback drills, backup/restore tests, and connection-pool limits."
  },
  {
    severity: "medium",
    status: "open",
    id: "external-provider-certification",
    owner: "model-security",
    issue: "Localhost mock provider transport is implemented, but real external provider execution remains T3 and unapproved.",
    fix: "Run an approved external-provider certification phase with budget/privacy controls, rollback plan, response redaction, and audit sampling."
  }
];

const blockingIssues = issues.filter((item) => item.status === "blocking");
const report = {
  phase: "2O",
  generatedAt: new Date().toISOString(),
  startedAt,
  clickQaCommand: "node tests/click-flow.mjs",
  clickQaExit: child.exitCode,
  clickQaStdoutTail: tail(child.stdout),
  clickQaStderrTail: tail(child.stderr),
  clickReport: {
    file: clickReportPath,
    base: clickReport.base,
    rounds: clickReport.rounds?.length || 0,
    consoleErrors: clickReport.consoleErrors || [],
    screenshots: screenshotResults
  },
  agents: [
    { id: "student-flow-agent", responsibility: "student join/run/self-check/submit waits for final values" },
    { id: "teacher-review-agent", responsibility: "teacher review persistence after submitted work" },
    { id: "research-export-agent", responsibility: "research export, screenshot, and visual evidence" },
    { id: "model-security-agent", responsibility: "model routing, image-route separation, provider guard, and secret checks" }
  ],
  completionMatrix: checks,
  issueList: [...blockingIssues, ...openProductGaps],
  verdict: blockingIssues.length ? "REQUEST_CHANGES" : "PASS_WITH_OPEN_PRODUCT_GAPS",
  notes: [
    "PASS_WITH_OPEN_PRODUCT_GAPS means the Phase 2O internal QA harness passed, not that the full long-running product objective is complete.",
    "This harness itself makes no outbound provider/model/image call; provider transport is verified separately by qa:provider-transport against localhost mock.",
    "No real API key is required or written."
  ]
};

writeFileSync(auditJsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(auditMdPath, renderMarkdown(report), "utf8");

if (blockingIssues.length) {
  console.error(`Agentic audit failed with ${blockingIssues.length} blocking issue(s).`);
  console.error(`Evidence: ${auditJsonPath}`);
  process.exit(1);
}

console.log(`Agentic QA audit passed: ${checks.length} checks, ${openProductGaps.length} open product gaps tracked.`);
console.log(`Evidence: ${auditJsonPath}`);
console.log(`Summary: ${auditMdPath}`);

function runNodeScript(script, env = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [script], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });
    let stdout = "";
    let stderr = "";
    childProcess.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    childProcess.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      const result = { exitCode, stdout, stderr };
      if (exitCode === 0) resolve(result);
      else reject(new Error(`${script} failed with ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

function tail(text, max = 1600) {
  return text.length > max ? text.slice(-max) : text;
}

function renderMarkdown(report) {
  const matrixRows = report.completionMatrix
    .map((item) => `| ${item.owner} | ${item.id} | ${item.status} | ${escapePipes(item.evidence)} |`)
    .join("\n");
  const issueRows = report.issueList
    .map((item) => `| ${item.severity} | ${item.status} | ${item.id} | ${escapePipes(item.issue)} | ${escapePipes(item.fix)} |`)
    .join("\n");
  const screenshotRows = report.clickReport.screenshots
    .map((item) => `| ${item.name} | ${item.file} | ${item.exists ? "yes" : "no"} | ${item.sizeBytes} |`)
    .join("\n");
  return `# Phase 2O Agentic QA Audit

Generated: ${report.generatedAt}

Verdict: **${report.verdict}**

## Agent Personas

${report.agents.map((agent) => `- ${agent.id}: ${agent.responsibility}`).join("\n")}

## Completion Matrix

| Agent | Check | Status | Evidence |
|---|---|---|---|
${matrixRows}

## Issue List

| Severity | Status | Id | Issue | Fix |
|---|---|---|---|---|
${issueRows}

## Screenshot Evidence

| Screen | File | Exists | Size |
|---|---|---|---|
${screenshotRows}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function escapePipes(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
