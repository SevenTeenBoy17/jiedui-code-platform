import { readFileSync, existsSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "assets/codex-glass-terminal.svg",
  "assets/ai-turtle-mascot.svg",
  "assets/ai-reviewer-mascot.svg",
  "manifest.webmanifest",
  "sw.js",
  "scripts/sandbox-runner.mjs",
  "scripts/sandbox-isolation.mjs",
  "scripts/sandbox-certification.mjs",
  "scripts/provider-certification.mjs",
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
  "scripts/json-repository.mjs",
  "scripts/sqlite-repository.mjs",
  "scripts/model-provider.mjs",
  "tests/agentic-audit.mjs",
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
  "tests/provider-transport.mjs",
  "tests/provider-certification.mjs",
  "tests/completion-audit.mjs",
  "tests/visual-fidelity.mjs",
  "specs/phase2s-delivery-completion-audit-contract.md",
  "specs/phase2t-sandbox-certification-readiness-contract.md",
  "specs/phase2u-provider-certification-readiness-contract.md",
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
  "specs/phase2r-sql-database-adapter-contract.md",
  "specs/phase2q-sandbox-isolation-hardening-contract.md",
  "specs/phase2p-live-provider-transport-contract.md",
  "specs/phase2o-agentic-qa-audit-contract.md",
  "specs/phase2n-visual-fidelity-contract.md",
  "backend/main.py"
];

const requiredTerms = [
  "小龟导师",
  "智伴导师",
  "Python",
  "C++",
  "WebSocket",
  "云端版本历史",
  "教师后端",
  "计算思维",
  "PWA"
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`missing file: ${file}`);
}

const app = readFileSync("src/app.js", "utf8");
const html = readFileSync("index.html", "utf8");
const css = readFileSync("src/styles.css", "utf8");
const runner = readFileSync("scripts/sandbox-runner.mjs", "utf8");
const isolation = readFileSync("scripts/sandbox-isolation.mjs", "utf8");
const sandboxCertification = readFileSync("scripts/sandbox-certification.mjs", "utf8");
const providerCertification = readFileSync("scripts/provider-certification.mjs", "utf8");
const databaseCertification = readFileSync("scripts/database-certification.mjs", "utf8");
const certificationOverview = readFileSync("scripts/certification-overview.mjs", "utf8");
const handoffDossier = readFileSync("scripts/delivery-handoff-dossier.mjs", "utf8");
const handoffExport = readFileSync("scripts/export-delivery-handoff.mjs", "utf8");
const artifactIndex = readFileSync("scripts/delivery-artifact-index.mjs", "utf8");
const agenticReplay = readFileSync("scripts/agentic-qa-replay-dossier.mjs", "utf8");
const visualStoryboard = readFileSync("scripts/visual-qa-storyboard.mjs", "utf8");
const releaseCandidate = readFileSync("scripts/delivery-release-candidate.mjs", "utf8");
const t3NextActions = readFileSync("scripts/t3-certification-next-actions.mjs", "utf8");
const t3RunPackets = readFileSync("scripts/t3-single-lane-run-packets.mjs", "utf8");
const t3RunPacketVerifier = readFileSync("scripts/t3-run-packet-verifier.mjs", "utf8");
const deliveryReviewerCockpit = readFileSync("scripts/delivery-reviewer-cockpit.mjs", "utf8");
const deliveryLaunchGuide = readFileSync("scripts/delivery-launch-guide.mjs", "utf8");
const deliveryConsistencySentinel = readFileSync("scripts/delivery-consistency-sentinel.mjs", "utf8");
const finalAcceptanceMatrix = readFileSync("scripts/final-acceptance-matrix.mjs", "utf8");
const certificationBlockerBoard = readFileSync("scripts/certification-blocker-board.mjs", "utf8");
const userAcceptanceRehearsal = readFileSync("scripts/user-acceptance-rehearsal.mjs", "utf8");
const deliveryEvidenceNavigator = readFileSync("scripts/delivery-evidence-navigator.mjs", "utf8");
const localDeliverySummaryPacket = readFileSync("scripts/local-delivery-summary-packet.mjs", "utf8");
const localDeliveryHandoffBrief = readFileSync("scripts/local-delivery-handoff-brief.mjs", "utf8");
const localDeliveryQuickstartBundle = readFileSync("scripts/local-delivery-quickstart-bundle.mjs", "utf8");
const localDeliveryVerificationSuite = readFileSync("scripts/local-delivery-verification-suite.mjs", "utf8");
const finalLocalHandoffCheckpoint = readFileSync("scripts/final-local-handoff-checkpoint.mjs", "utf8");
const objectiveTraceability = readFileSync("scripts/objective-traceability.mjs", "utf8");
const t3ApprovalPacket = readFileSync("scripts/t3-approval-packet.mjs", "utf8");
const t3DryRunRehearsal = readFileSync("scripts/t3-dry-run-rehearsal.mjs", "utf8");
const t3ApprovalRequestExport = readFileSync("scripts/t3-approval-request-export.mjs", "utf8");
const t3ApprovalIntegrity = readFileSync("scripts/t3-approval-integrity.mjs", "utf8");
const t3ApprovalLock = readFileSync("scripts/t3-approval-lock.mjs", "utf8");
const t3ApprovalVerifier = readFileSync("scripts/t3-approval-verifier.mjs", "utf8");
const t3ApprovalCandidates = readFileSync("scripts/t3-approval-candidates.mjs", "utf8");
const t3ApprovalExecutionGate = readFileSync("scripts/t3-approval-execution-gate.mjs", "utf8");
const t3CertificationEvidenceClosure = readFileSync("scripts/t3-certification-evidence-closure.mjs", "utf8");
const finalDeliveryReadiness = readFileSync("scripts/final-delivery-readiness.mjs", "utf8");
const t3EvidenceBundleTemplates = readFileSync("scripts/t3-evidence-bundle-templates.mjs", "utf8");
const t3OperatorChecklist = readFileSync("scripts/t3-operator-checklist.mjs", "utf8");
const t3OperatorTranscriptValidator = readFileSync("scripts/t3-operator-transcript-validator.mjs", "utf8");
const t3Preflight = readFileSync("scripts/t3-certification-preflight.mjs", "utf8");
const t3Package = readFileSync("scripts/t3-certification-package.mjs", "utf8");
const t3Evidence = readFileSync("scripts/t3-evidence-intake.mjs", "utf8");
const repository = readFileSync("scripts/json-repository.mjs", "utf8");
const sqliteRepository = readFileSync("scripts/sqlite-repository.mjs", "utf8");
const provider = readFileSync("scripts/model-provider.mjs", "utf8");
const packageManifest = readFileSync("package.json", "utf8");
const visualQa = readFileSync("tests/visual-fidelity.mjs", "utf8");
const agenticQa = readFileSync("tests/agentic-audit.mjs", "utf8");
const sandboxIsolationQa = readFileSync("tests/sandbox-isolation.mjs", "utf8");
const sandboxCertificationQa = readFileSync("tests/sandbox-certification.mjs", "utf8");
const databaseAdapterQa = readFileSync("tests/database-adapter.mjs", "utf8");
const databaseCertificationQa = readFileSync("tests/database-certification.mjs", "utf8");
const certificationOverviewQa = readFileSync("tests/certification-overview.mjs", "utf8");
const handoffDossierQa = readFileSync("tests/delivery-handoff-dossier.mjs", "utf8");
const handoffExportQa = readFileSync("tests/delivery-handoff-export.mjs", "utf8");
const artifactIndexQa = readFileSync("tests/delivery-artifact-index.mjs", "utf8");
const agenticReplayQa = readFileSync("tests/agentic-qa-replay-dossier.mjs", "utf8");
const visualStoryboardQa = readFileSync("tests/visual-qa-storyboard.mjs", "utf8");
const releaseCandidateQa = readFileSync("tests/delivery-release-candidate.mjs", "utf8");
const t3NextActionsQa = readFileSync("tests/t3-certification-next-actions.mjs", "utf8");
const t3RunPacketsQa = readFileSync("tests/t3-single-lane-run-packets.mjs", "utf8");
const t3RunPacketVerifierQa = readFileSync("tests/t3-run-packet-verifier.mjs", "utf8");
const deliveryReviewerCockpitQa = readFileSync("tests/delivery-reviewer-cockpit.mjs", "utf8");
const deliveryLaunchGuideQa = readFileSync("tests/delivery-launch-guide.mjs", "utf8");
const deliveryConsistencySentinelQa = readFileSync("tests/delivery-consistency-sentinel.mjs", "utf8");
const finalAcceptanceMatrixQa = readFileSync("tests/final-acceptance-matrix.mjs", "utf8");
const certificationBlockerBoardQa = readFileSync("tests/certification-blocker-board.mjs", "utf8");
const userAcceptanceRehearsalQa = readFileSync("tests/user-acceptance-rehearsal.mjs", "utf8");
const deliveryEvidenceNavigatorQa = readFileSync("tests/delivery-evidence-navigator.mjs", "utf8");
const localDeliverySummaryPacketQa = readFileSync("tests/local-delivery-summary-packet.mjs", "utf8");
const localDeliveryHandoffBriefQa = readFileSync("tests/local-delivery-handoff-brief.mjs", "utf8");
const localDeliveryQuickstartBundleQa = readFileSync("tests/local-delivery-quickstart-bundle.mjs", "utf8");
const localDeliveryVerificationSuiteQa = readFileSync("tests/local-delivery-verification-suite.mjs", "utf8");
const finalLocalHandoffCheckpointQa = readFileSync("tests/final-local-handoff-checkpoint.mjs", "utf8");
const objectiveTraceabilityQa = readFileSync("tests/objective-traceability.mjs", "utf8");
const t3ApprovalPacketQa = readFileSync("tests/t3-approval-packet.mjs", "utf8");
const t3DryRunRehearsalQa = readFileSync("tests/t3-dry-run-rehearsal.mjs", "utf8");
const t3ApprovalRequestExportQa = readFileSync("tests/t3-approval-request-export.mjs", "utf8");
const t3ApprovalIntegrityQa = readFileSync("tests/t3-approval-integrity.mjs", "utf8");
const t3ApprovalLockQa = readFileSync("tests/t3-approval-lock.mjs", "utf8");
const t3ApprovalVerifierQa = readFileSync("tests/t3-approval-verifier.mjs", "utf8");
const t3ApprovalCandidatesQa = readFileSync("tests/t3-approval-candidates.mjs", "utf8");
const t3ApprovalExecutionGateQa = readFileSync("tests/t3-approval-execution-gate.mjs", "utf8");
const t3CertificationEvidenceClosureQa = readFileSync("tests/t3-certification-evidence-closure.mjs", "utf8");
const finalDeliveryReadinessQa = readFileSync("tests/final-delivery-readiness.mjs", "utf8");
const t3EvidenceBundleTemplatesQa = readFileSync("tests/t3-evidence-bundle-templates.mjs", "utf8");
const t3OperatorChecklistQa = readFileSync("tests/t3-operator-checklist.mjs", "utf8");
const t3OperatorTranscriptValidatorQa = readFileSync("tests/t3-operator-transcript-validator.mjs", "utf8");
const t3PreflightQa = readFileSync("tests/t3-certification-preflight.mjs", "utf8");
const t3PackageQa = readFileSync("tests/t3-certification-package.mjs", "utf8");
const t3EvidenceQa = readFileSync("tests/t3-evidence-intake.mjs", "utf8");
const providerTransportQa = readFileSync("tests/provider-transport.mjs", "utf8");
const providerCertificationQa = readFileSync("tests/provider-certification.mjs", "utf8");
const completionAuditQa = readFileSync("tests/completion-audit.mjs", "utf8");
const phase2sSpec = readFileSync("specs/phase2s-delivery-completion-audit-contract.md", "utf8");
const phase2tSpec = readFileSync("specs/phase2t-sandbox-certification-readiness-contract.md", "utf8");
const phase2uSpec = readFileSync("specs/phase2u-provider-certification-readiness-contract.md", "utf8");
const phase2vSpec = readFileSync("specs/phase2v-database-certification-readiness-contract.md", "utf8");
const phase2wSpec = readFileSync("specs/phase2w-delivery-certification-overview-contract.md", "utf8");
const phase2xSpec = readFileSync("specs/phase2x-t3-certification-preflight-contract.md", "utf8");
const phase2ySpec = readFileSync("specs/phase2y-t3-certification-package-contract.md", "utf8");
const phase2zSpec = readFileSync("specs/phase2z-t3-evidence-intake-contract.md", "utf8");
const phase3aSpec = readFileSync("specs/phase3a-delivery-handoff-dossier-contract.md", "utf8");
const phase3bSpec = readFileSync("specs/phase3b-delivery-handoff-export-contract.md", "utf8");
const phase3cSpec = readFileSync("specs/phase3c-delivery-artifact-index-contract.md", "utf8");
const phase3rSpec = readFileSync("specs/phase3r-agentic-qa-replay-dossier-contract.md", "utf8");
const phase3sSpec = readFileSync("specs/phase3s-visual-qa-storyboard-contract.md", "utf8");
const phase3tSpec = readFileSync("specs/phase3t-delivery-release-candidate-contract.md", "utf8");
const phase3uSpec = readFileSync("specs/phase3u-t3-certification-next-actions-contract.md", "utf8");
const phase3vSpec = readFileSync("specs/phase3v-t3-single-lane-run-packets-contract.md", "utf8");
const phase3wSpec = readFileSync("specs/phase3w-t3-run-packet-verifier-contract.md", "utf8");
const phase3xSpec = readFileSync("specs/phase3x-delivery-reviewer-cockpit-contract.md", "utf8");
const phase3ySpec = readFileSync("specs/phase3y-delivery-launch-guide-contract.md", "utf8");
const phase3zSpec = readFileSync("specs/phase3z-delivery-consistency-sentinel-contract.md", "utf8");
const phase4aSpec = readFileSync("specs/phase4a-final-acceptance-matrix-contract.md", "utf8");
const phase4bSpec = readFileSync("specs/phase4b-certification-blocker-board-contract.md", "utf8");
const phase4cSpec = readFileSync("specs/phase4c-user-acceptance-rehearsal-contract.md", "utf8");
const phase4dSpec = readFileSync("specs/phase4d-delivery-evidence-navigator-contract.md", "utf8");
const phase4eSpec = readFileSync("specs/phase4e-local-delivery-summary-packet-contract.md", "utf8");
const phase4fSpec = readFileSync("specs/phase4f-local-delivery-handoff-brief-contract.md", "utf8");
const phase4gSpec = readFileSync("specs/phase4g-local-delivery-quickstart-bundle-contract.md", "utf8");
const phase4hSpec = readFileSync("specs/phase4h-local-delivery-verification-suite-contract.md", "utf8");
const phase4iSpec = readFileSync("specs/phase4i-final-local-handoff-checkpoint-contract.md", "utf8");
const phase3dSpec = readFileSync("specs/phase3d-objective-traceability-contract.md", "utf8");
const phase3eSpec = readFileSync("specs/phase3e-t3-approval-packet-contract.md", "utf8");
const phase3fSpec = readFileSync("specs/phase3f-t3-dry-run-rehearsal-contract.md", "utf8");
const phase3gSpec = readFileSync("specs/phase3g-t3-approval-request-export-contract.md", "utf8");
const phase3hSpec = readFileSync("specs/phase3h-t3-approval-integrity-contract.md", "utf8");
const phase3iSpec = readFileSync("specs/phase3i-t3-approval-lock-contract.md", "utf8");
const phase3jSpec = readFileSync("specs/phase3j-t3-approval-verifier-contract.md", "utf8");
const phase3kSpec = readFileSync("specs/phase3k-t3-approval-candidates-contract.md", "utf8");
const phase3lSpec = readFileSync("specs/phase3l-t3-approval-execution-gate-contract.md", "utf8");
const phase3mSpec = readFileSync("specs/phase3m-t3-certification-evidence-closure-contract.md", "utf8");
const phase3nSpec = readFileSync("specs/phase3n-final-delivery-readiness-contract.md", "utf8");
const phase3oSpec = readFileSync("specs/phase3o-t3-evidence-bundle-templates-contract.md", "utf8");
const phase3pSpec = readFileSync("specs/phase3p-t3-operator-checklist-contract.md", "utf8");
const phase3qSpec = readFileSync("specs/phase3q-t3-operator-transcript-validator-contract.md", "utf8");
const phase2rSpec = readFileSync("specs/phase2r-sql-database-adapter-contract.md", "utf8");
const phase2qSpec = readFileSync("specs/phase2q-sandbox-isolation-hardening-contract.md", "utf8");
const phase2pSpec = readFileSync("specs/phase2p-live-provider-transport-contract.md", "utf8");
const phase2nSpec = readFileSync("specs/phase2n-visual-fidelity-contract.md", "utf8");
const phase2oSpec = readFileSync("specs/phase2o-agentic-qa-audit-contract.md", "utf8");
const combined = `${app}\n${html}\n${css}\n${runner}\n${isolation}\n${sandboxCertification}\n${providerCertification}\n${databaseCertification}\n${certificationOverview}\n${handoffDossier}\n${handoffExport}\n${artifactIndex}\n${agenticReplay}\n${visualStoryboard}\n${releaseCandidate}\n${t3NextActions}\n${t3RunPackets}\n${t3RunPacketVerifier}\n${deliveryReviewerCockpit}\n${deliveryLaunchGuide}\n${deliveryConsistencySentinel}\n${finalAcceptanceMatrix}\n${certificationBlockerBoard}\n${userAcceptanceRehearsal}\n${deliveryEvidenceNavigator}\n${localDeliverySummaryPacket}\n${localDeliveryHandoffBrief}\n${localDeliveryQuickstartBundle}\n${localDeliveryVerificationSuite}\n${finalLocalHandoffCheckpoint}\n${objectiveTraceability}\n${t3ApprovalPacket}\n${t3DryRunRehearsal}\n${t3ApprovalRequestExport}\n${t3ApprovalIntegrity}\n${t3ApprovalLock}\n${t3ApprovalVerifier}\n${t3ApprovalCandidates}\n${t3ApprovalExecutionGate}\n${t3CertificationEvidenceClosure}\n${finalDeliveryReadiness}\n${t3EvidenceBundleTemplates}\n${t3OperatorChecklist}\n${t3OperatorTranscriptValidator}\n${t3Preflight}\n${t3Package}\n${t3Evidence}\n${repository}\n${sqliteRepository}\n${provider}\n${packageManifest}\n${visualQa}\n${agenticQa}\n${sandboxIsolationQa}\n${sandboxCertificationQa}\n${databaseAdapterQa}\n${databaseCertificationQa}\n${certificationOverviewQa}\n${handoffDossierQa}\n${handoffExportQa}\n${artifactIndexQa}\n${agenticReplayQa}\n${visualStoryboardQa}\n${releaseCandidateQa}\n${t3NextActionsQa}\n${t3RunPacketsQa}\n${t3RunPacketVerifierQa}\n${deliveryReviewerCockpitQa}\n${deliveryLaunchGuideQa}\n${deliveryConsistencySentinelQa}\n${finalAcceptanceMatrixQa}\n${certificationBlockerBoardQa}\n${userAcceptanceRehearsalQa}\n${deliveryEvidenceNavigatorQa}\n${localDeliverySummaryPacketQa}\n${localDeliveryHandoffBriefQa}\n${localDeliveryQuickstartBundleQa}\n${localDeliveryVerificationSuiteQa}\n${finalLocalHandoffCheckpointQa}\n${objectiveTraceabilityQa}\n${t3ApprovalPacketQa}\n${t3DryRunRehearsalQa}\n${t3ApprovalRequestExportQa}\n${t3ApprovalIntegrityQa}\n${t3ApprovalLockQa}\n${t3ApprovalVerifierQa}\n${t3ApprovalCandidatesQa}\n${t3ApprovalExecutionGateQa}\n${t3CertificationEvidenceClosureQa}\n${finalDeliveryReadinessQa}\n${t3EvidenceBundleTemplatesQa}\n${t3OperatorChecklistQa}\n${t3OperatorTranscriptValidatorQa}\n${t3PreflightQa}\n${t3PackageQa}\n${t3EvidenceQa}\n${providerTransportQa}\n${providerCertificationQa}\n${completionAuditQa}\n${phase2sSpec}\n${phase2tSpec}\n${phase2uSpec}\n${phase2vSpec}\n${phase2wSpec}\n${phase2xSpec}\n${phase2ySpec}\n${phase2zSpec}\n${phase3aSpec}\n${phase3bSpec}\n${phase3cSpec}\n${phase3rSpec}\n${phase3sSpec}\n${phase3tSpec}\n${phase3uSpec}\n${phase3vSpec}\n${phase3wSpec}\n${phase3xSpec}\n${phase3ySpec}\n${phase3zSpec}\n${phase4aSpec}\n${phase4bSpec}\n${phase4cSpec}\n${phase4dSpec}\n${phase4eSpec}\n${phase4fSpec}\n${phase4gSpec}\n${phase4hSpec}\n${phase4iSpec}\n${phase3dSpec}\n${phase3eSpec}\n${phase3fSpec}\n${phase3gSpec}\n${phase3hSpec}\n${phase3iSpec}\n${phase3jSpec}\n${phase3kSpec}\n${phase3lSpec}\n${phase3mSpec}\n${phase3nSpec}\n${phase3oSpec}\n${phase3pSpec}\n${phase3qSpec}\n${phase2rSpec}\n${phase2qSpec}\n${phase2pSpec}\n${phase2nSpec}\n${phase2oSpec}`;

for (const term of requiredTerms) {
  if (!combined.includes(term)) failures.push(`missing term: ${term}`);
}

if (!combined.includes("data-run")) failures.push("run control not found");
if (!combined.includes("data-download")) failures.push("download control not found");
if (!combined.includes("data-upload")) failures.push("upload control not found");
if (!combined.includes("serviceWorker")) failures.push("service worker registration not found");
if (!css.includes("@media")) failures.push("responsive media query not found");
if (!combined.includes("codex-glass-terminal.svg")) failures.push("glass terminal asset not mounted");
if (!combined.includes("ai-turtle-mascot.svg")) failures.push("turtle mascot asset not mounted");
if (!combined.includes("ai-reviewer-mascot.svg")) failures.push("reviewer mascot asset not mounted");
if (!combined.includes("sandbox-runner-v2")) failures.push("sandbox runner v2 boundary not found");
if (!combined.includes("process-scrubbed-temp-workspace-no-exec")) failures.push("sandbox runner isolation label not found");
if (!combined.includes("allowlist-scrubbed")) failures.push("sandbox env scrub policy not found");
if (!combined.includes("qa:sandbox-isolation")) failures.push("sandbox isolation QA script not found");
if (!combined.includes("qa:sandbox-certification")) failures.push("sandbox certification QA script not found");
if (!combined.includes("/api/sandbox/certification")) failures.push("sandbox certification endpoint not found");
if (!combined.includes("readiness-only")) failures.push("sandbox certification readiness marker not found");
if (!combined.includes("certified: false")) failures.push("sandbox certification non-certified marker not found");
if (!combined.includes("json-repository-v1")) failures.push("JSON repository engine not found");
if (!combined.includes("atomicWrites")) failures.push("JSON repository atomic write metadata not found");
if (!combined.includes("sqlite-repository-v1")) failures.push("SQLite repository adapter not found");
if (!combined.includes("qa:db-adapter")) failures.push("database adapter QA script not found");
if (!combined.includes("qa:db-certification")) failures.push("database certification QA script not found");
if (!combined.includes("/api/db/certification")) failures.push("database certification endpoint not found");
if (!combined.includes("databaseCertificationStatus")) failures.push("database certification report marker not found");
if (!combined.includes("qa:certification-overview")) failures.push("delivery certification overview QA script not found");
if (!combined.includes("/api/delivery/certification-overview")) failures.push("delivery certification overview endpoint not found");
if (!combined.includes("deliveryOverviewStatus")) failures.push("delivery certification overview report marker not found");
if (!combined.includes("data-delivery-overview")) failures.push("delivery certification overview UI marker not found");
if (!combined.includes("Phase 2W Delivery Certification Overview Contract")) failures.push("delivery certification overview contract not found");
if (!combined.includes("qa:handoff-dossier")) failures.push("delivery handoff dossier QA script not found");
if (!combined.includes("/api/delivery/handoff-dossier")) failures.push("delivery handoff dossier endpoint not found");
if (!combined.includes("handoffDossierStatus")) failures.push("delivery handoff dossier report marker not found");
if (!combined.includes("data-delivery-dossier")) failures.push("delivery handoff dossier UI marker not found");
if (!combined.includes("Phase 3A Delivery Handoff Dossier Contract")) failures.push("delivery handoff dossier contract not found");
if (!combined.includes("qa:handoff-export")) failures.push("delivery handoff export QA script not found");
if (!combined.includes("writeDeliveryHandoffExport")) failures.push("delivery handoff export writer not found");
if (!combined.includes("phase3b-delivery-handoff-dossier.json")) failures.push("delivery handoff export JSON artifact not found");
if (!combined.includes("phase3b-delivery-handoff-dossier.md")) failures.push("delivery handoff export Markdown artifact not found");
if (!combined.includes("Phase 3B Delivery Handoff Export Contract")) failures.push("delivery handoff export contract not found");
if (!combined.includes("offlineOnlyExport")) failures.push("delivery handoff export offline guard not found");
if (!combined.includes("qa:artifact-index")) failures.push("delivery artifact index QA script not found");
if (!combined.includes("/api/delivery/artifacts")) failures.push("delivery artifact index endpoint not found");
if (!combined.includes("deliveryArtifactIndexStatus")) failures.push("delivery artifact index report marker not found");
if (!combined.includes("data-delivery-artifacts")) failures.push("delivery artifact index UI marker not found");
if (!combined.includes("Phase 3C Delivery Artifact Index Contract")) failures.push("delivery artifact index contract not found");
if (!combined.includes("artifact-index-ready-with-open-certification-gaps")) failures.push("delivery artifact index status marker not found");
if (!combined.includes("contentReturned")) failures.push("delivery artifact index content guard not found");
if (!combined.includes("sha256")) failures.push("delivery artifact index hash marker not found");
if (!combined.includes("qa:agentic-replay")) failures.push("agentic QA replay QA script not found");
if (!combined.includes("/api/delivery/agentic-qa-replay")) failures.push("agentic QA replay endpoint not found");
if (!combined.includes("agenticQaReplayStatus")) failures.push("agentic QA replay report marker not found");
if (!combined.includes("data-agentic-qa-replay")) failures.push("agentic QA replay UI marker not found");
if (!combined.includes("Phase 3R Agentic QA Replay Dossier Contract")) failures.push("agentic QA replay contract not found");
if (!combined.includes("agentic-qa-replay-ready-open-t3")) failures.push("agentic QA replay status marker not found");
if (!combined.includes("replayOnly")) failures.push("agentic QA replay-only guard not found");
if (!combined.includes("screenshotBytesReturned")) failures.push("agentic QA screenshot byte guard not found");
if (!combined.includes("replayHash")) failures.push("agentic QA replay hash marker not found");
if (!combined.includes("qa:visual-storyboard")) failures.push("visual QA storyboard QA script not found");
if (!combined.includes("/api/delivery/visual-storyboard")) failures.push("visual QA storyboard endpoint not found");
if (!combined.includes("visualStoryboardStatus")) failures.push("visual QA storyboard report marker not found");
if (!combined.includes("data-visual-storyboard")) failures.push("visual QA storyboard UI marker not found");
if (!combined.includes("Phase 3S Visual QA Storyboard Contract")) failures.push("visual QA storyboard contract not found");
if (!combined.includes("visual-storyboard-ready-open-t3")) failures.push("visual QA storyboard status marker not found");
if (!combined.includes("storyboardOnly")) failures.push("visual QA storyboard-only guard not found");
if (!combined.includes("screenshotBytesEmbedded")) failures.push("visual QA storyboard byte guard not found");
if (!combined.includes("storyboardHash")) failures.push("visual QA storyboard hash marker not found");
if (!combined.includes("qa:release-candidate")) failures.push("delivery release candidate QA script not found");
if (!combined.includes("/api/delivery/release-candidate")) failures.push("delivery release candidate endpoint not found");
if (!combined.includes("releaseCandidateStatus")) failures.push("delivery release candidate report marker not found");
if (!combined.includes("data-delivery-release-candidate")) failures.push("delivery release candidate UI marker not found");
if (!combined.includes("Phase 3T Delivery Release Candidate Contract")) failures.push("delivery release candidate contract not found");
if (!combined.includes("release-candidate-local-evidence-ready-open-t3")) failures.push("delivery release candidate status marker not found");
if (!combined.includes("releaseCandidateOnly")) failures.push("delivery release candidate-only guard not found");
if (!combined.includes("readyForProductionRelease")) failures.push("delivery release candidate production-release guard not found");
if (!combined.includes("releaseCandidateHash")) failures.push("delivery release candidate hash marker not found");
if (!combined.includes("qa:t3-next-actions")) failures.push("T3 certification next-actions QA script not found");
if (!combined.includes("/api/delivery/t3-certification-next-actions")) failures.push("T3 certification next-actions endpoint not found");
if (!combined.includes("t3CertificationNextActionsStatus")) failures.push("T3 certification next-actions report marker not found");
if (!combined.includes("data-t3-certification-next-actions")) failures.push("T3 certification next-actions UI marker not found");
if (!combined.includes("Phase 3U T3 Certification Next Actions Contract")) failures.push("T3 certification next-actions contract not found");
if (!combined.includes("t3-certification-next-actions-ready-execution-blocked")) failures.push("T3 certification next-actions status marker not found");
if (!combined.includes("nextActionsOnly")) failures.push("T3 certification next-actions-only guard not found");
if (!combined.includes("singleLaneOnly")) failures.push("T3 certification single-lane guard not found");
if (!combined.includes("nextActionsHash")) failures.push("T3 certification next-actions hash marker not found");
if (!combined.includes("qa:t3-run-packets")) failures.push("T3 single-lane run-packet QA script not found");
if (!combined.includes("/api/delivery/t3-single-lane-run-packets")) failures.push("T3 single-lane run-packet endpoint not found");
if (!combined.includes("t3SingleLaneRunPacketStatus")) failures.push("T3 single-lane run-packet report marker not found");
if (!combined.includes("data-t3-single-lane-run-packets")) failures.push("T3 single-lane run-packet UI marker not found");
if (!combined.includes("Phase 3V T3 Single-Lane Run Packets Contract")) failures.push("T3 single-lane run-packet contract not found");
if (!combined.includes("t3-single-lane-run-packets-ready-execution-blocked")) failures.push("T3 single-lane run-packet status marker not found");
if (!combined.includes("runPacketsOnly")) failures.push("T3 single-lane run-packet-only guard not found");
if (!combined.includes("runPacketBundleHash")) failures.push("T3 single-lane run-packet hash marker not found");
if (!combined.includes("qa:t3-run-packet-verifier")) failures.push("T3 run-packet verifier QA script not found");
if (!combined.includes("/api/delivery/t3-run-packet-verifier")) failures.push("T3 run-packet verifier endpoint not found");
if (!combined.includes("t3RunPacketVerifierStatus")) failures.push("T3 run-packet verifier report marker not found");
if (!combined.includes("data-t3-run-packet-verifier")) failures.push("T3 run-packet verifier UI marker not found");
if (!combined.includes("Phase 3W T3 Run Packet Verifier Contract")) failures.push("T3 run-packet verifier contract not found");
if (!combined.includes("t3-run-packet-verifier-ready-execution-blocked")) failures.push("T3 run-packet verifier status marker not found");
if (!combined.includes("verifierOnly")) failures.push("T3 run-packet verifier-only guard not found");
if (!combined.includes("verifierHash")) failures.push("T3 run-packet verifier hash marker not found");
if (!combined.includes("qa:reviewer-cockpit")) failures.push("delivery reviewer cockpit QA script not found");
if (!combined.includes("/api/delivery/reviewer-cockpit")) failures.push("delivery reviewer cockpit endpoint not found");
if (!combined.includes("deliveryReviewerCockpitStatus")) failures.push("delivery reviewer cockpit report marker not found");
if (!combined.includes("data-delivery-reviewer-cockpit")) failures.push("delivery reviewer cockpit UI marker not found");
if (!combined.includes("Phase 3X Delivery Reviewer Cockpit Contract")) failures.push("delivery reviewer cockpit contract not found");
if (!combined.includes("reviewer-cockpit-ready-open-t3")) failures.push("delivery reviewer cockpit status marker not found");
if (!combined.includes("reviewerCockpitOnly")) failures.push("delivery reviewer cockpit-only guard not found");
if (!combined.includes("reviewerCockpitHash")) failures.push("delivery reviewer cockpit hash marker not found");
if (!combined.includes("qa:launch-guide")) failures.push("delivery launch guide QA script not found");
if (!combined.includes("/api/delivery/launch-guide")) failures.push("delivery launch guide endpoint not found");
if (!combined.includes("deliveryLaunchGuideStatus")) failures.push("delivery launch guide report marker not found");
if (!combined.includes("data-delivery-launch-guide")) failures.push("delivery launch guide UI marker not found");
if (!combined.includes("Phase 3Y Delivery Launch Guide Contract")) failures.push("delivery launch guide contract not found");
if (!combined.includes("delivery-launch-guide-ready-open-t3")) failures.push("delivery launch guide status marker not found");
if (!combined.includes("launchGuideOnly")) failures.push("delivery launch guide-only guard not found");
if (!combined.includes("launchGuideHash")) failures.push("delivery launch guide hash marker not found");
if (!combined.includes("qa:consistency-sentinel")) failures.push("delivery consistency sentinel QA script not found");
if (!combined.includes("/api/delivery/consistency-sentinel")) failures.push("delivery consistency sentinel endpoint not found");
if (!combined.includes("deliveryConsistencySentinelStatus")) failures.push("delivery consistency sentinel report marker not found");
if (!combined.includes("data-delivery-consistency-sentinel")) failures.push("delivery consistency sentinel UI marker not found");
if (!combined.includes("Phase 3Z Delivery Consistency Sentinel Contract")) failures.push("delivery consistency sentinel contract not found");
if (!combined.includes("delivery-consistency-sentinel-ready-open-t3")) failures.push("delivery consistency sentinel status marker not found");
if (!combined.includes("sentinelOnly")) failures.push("delivery consistency sentinel-only guard not found");
if (!combined.includes("consistencyHash")) failures.push("delivery consistency sentinel hash marker not found");
if (!combined.includes("qa:acceptance-matrix")) failures.push("final acceptance matrix QA script not found");
if (!combined.includes("/api/delivery/final-acceptance-matrix")) failures.push("final acceptance matrix endpoint not found");
if (!combined.includes("finalAcceptanceMatrixStatus")) failures.push("final acceptance matrix report marker not found");
if (!combined.includes("data-final-acceptance-matrix")) failures.push("final acceptance matrix UI marker not found");
if (!combined.includes("Phase 4A Final Acceptance Matrix Contract")) failures.push("final acceptance matrix contract not found");
if (!combined.includes("final-acceptance-matrix-ready-open-t3")) failures.push("final acceptance matrix status marker not found");
if (!combined.includes("acceptanceMatrixOnly")) failures.push("final acceptance matrix-only guard not found");
if (!combined.includes("acceptanceHash")) failures.push("final acceptance matrix hash marker not found");
if (!combined.includes("qa:certification-blocker-board")) failures.push("certification blocker board QA script not found");
if (!combined.includes("/api/delivery/certification-blocker-board")) failures.push("certification blocker board endpoint not found");
if (!combined.includes("certificationBlockerBoardStatus")) failures.push("certification blocker board report marker not found");
if (!combined.includes("data-certification-blocker-board")) failures.push("certification blocker board UI marker not found");
if (!combined.includes("Phase 4B Certification Blocker Board Contract")) failures.push("certification blocker board contract not found");
if (!combined.includes("certification-blocker-board-ready-open-t3")) failures.push("certification blocker board status marker not found");
if (!combined.includes("blockerBoardOnly")) failures.push("certification blocker board-only guard not found");
if (!combined.includes("boardHash")) failures.push("certification blocker board hash marker not found");
if (!combined.includes("qa:user-acceptance-rehearsal")) failures.push("user acceptance rehearsal QA script not found");
if (!combined.includes("/api/delivery/user-acceptance-rehearsal")) failures.push("user acceptance rehearsal endpoint not found");
if (!combined.includes("userAcceptanceRehearsalStatus")) failures.push("user acceptance rehearsal report marker not found");
if (!combined.includes("data-user-acceptance-rehearsal")) failures.push("user acceptance rehearsal UI marker not found");
if (!combined.includes("Phase 4C User Acceptance Rehearsal Contract")) failures.push("user acceptance rehearsal contract not found");
if (!combined.includes("user-acceptance-rehearsal-ready-open-t3")) failures.push("user acceptance rehearsal status marker not found");
if (!combined.includes("userAcceptanceRehearsalOnly")) failures.push("user acceptance rehearsal-only guard not found");
if (!combined.includes("rehearsalHash")) failures.push("user acceptance rehearsal hash marker not found");
if (!combined.includes("qa:evidence-navigator")) failures.push("delivery evidence navigator QA script not found");
if (!combined.includes("/api/delivery/evidence-navigator")) failures.push("delivery evidence navigator endpoint not found");
if (!combined.includes("deliveryEvidenceNavigatorStatus")) failures.push("delivery evidence navigator report marker not found");
if (!combined.includes("data-delivery-evidence-navigator")) failures.push("delivery evidence navigator UI marker not found");
if (!combined.includes("Phase 4D Delivery Evidence Navigator Contract")) failures.push("delivery evidence navigator contract not found");
if (!combined.includes("delivery-evidence-navigator-ready-open-t3")) failures.push("delivery evidence navigator status marker not found");
if (!combined.includes("deliveryEvidenceNavigatorOnly")) failures.push("delivery evidence navigator-only guard not found");
if (!combined.includes("navigatorHash")) failures.push("delivery evidence navigator hash marker not found");
if (!combined.includes("qa:local-summary-packet")) failures.push("local delivery summary QA script not found");
if (!combined.includes("/api/delivery/local-summary-packet")) failures.push("local delivery summary endpoint not found");
if (!combined.includes("localDeliverySummaryStatus")) failures.push("local delivery summary report marker not found");
if (!combined.includes("data-local-delivery-summary")) failures.push("local delivery summary UI marker not found");
if (!combined.includes("Phase 4E Local Delivery Summary Packet Contract")) failures.push("local delivery summary contract not found");
if (!combined.includes("local-delivery-summary-ready-open-t3")) failures.push("local delivery summary status marker not found");
if (!combined.includes("summaryPacketOnly")) failures.push("local delivery summary-only guard not found");
if (!combined.includes("summaryHash")) failures.push("local delivery summary hash marker not found");
if (!combined.includes("qa:handoff-brief")) failures.push("local delivery handoff brief QA script not found");
if (!combined.includes("/api/delivery/handoff-brief")) failures.push("local delivery handoff brief endpoint not found");
if (!combined.includes("localDeliveryHandoffBriefStatus")) failures.push("local delivery handoff brief report marker not found");
if (!combined.includes("data-local-delivery-handoff-brief")) failures.push("local delivery handoff brief UI marker not found");
if (!combined.includes("Phase 4F Local Delivery Handoff Brief Contract")) failures.push("local delivery handoff brief contract not found");
if (!combined.includes("local-delivery-handoff-brief-ready-open-t3")) failures.push("local delivery handoff brief status marker not found");
if (!combined.includes("handoffBriefOnly")) failures.push("local delivery handoff brief-only guard not found");
if (!combined.includes("briefHash")) failures.push("local delivery handoff brief hash marker not found");
if (!combined.includes("qa:quickstart-bundle")) failures.push("local delivery quickstart QA script not found");
if (!combined.includes("/api/delivery/quickstart-bundle")) failures.push("local delivery quickstart endpoint not found");
if (!combined.includes("localDeliveryQuickstartStatus")) failures.push("local delivery quickstart report marker not found");
if (!combined.includes("data-local-delivery-quickstart")) failures.push("local delivery quickstart UI marker not found");
if (!combined.includes("Phase 4G Local Delivery Quickstart Bundle Contract")) failures.push("local delivery quickstart contract not found");
if (!combined.includes("local-delivery-quickstart-ready-open-t3")) failures.push("local delivery quickstart status marker not found");
if (!combined.includes("quickstartBundleOnly")) failures.push("local delivery quickstart-only guard not found");
if (!combined.includes("quickstartHash")) failures.push("local delivery quickstart hash marker not found");
if (!combined.includes("qa:local-verification-suite")) failures.push("local delivery verification suite QA script not found");
if (!combined.includes("/api/delivery/local-verification-suite")) failures.push("local delivery verification suite endpoint not found");
if (!combined.includes("localDeliveryVerificationSuiteStatus")) failures.push("local delivery verification suite report marker not found");
if (!combined.includes("data-local-delivery-verification-suite")) failures.push("local delivery verification suite UI marker not found");
if (!combined.includes("Phase 4H Local Delivery Verification Suite Contract")) failures.push("local delivery verification suite contract not found");
if (!combined.includes("local-delivery-verification-suite-ready-open-t3")) failures.push("local delivery verification suite status marker not found");
if (!combined.includes("verificationSuiteOnly")) failures.push("local delivery verification suite-only guard not found");
if (!combined.includes("suiteHash")) failures.push("local delivery verification suite hash marker not found");
if (!combined.includes("qa:final-handoff-checkpoint")) failures.push("final local handoff checkpoint QA script not found");
if (!combined.includes("/api/delivery/final-local-handoff-checkpoint")) failures.push("final local handoff checkpoint endpoint not found");
if (!combined.includes("finalLocalHandoffCheckpointStatus")) failures.push("final local handoff checkpoint report marker not found");
if (!combined.includes("data-final-local-handoff-checkpoint")) failures.push("final local handoff checkpoint UI marker not found");
if (!combined.includes("Phase 4I Final Local Handoff Checkpoint Contract")) failures.push("final local handoff checkpoint contract not found");
if (!combined.includes("final-local-handoff-checkpoint-ready-open-t3")) failures.push("final local handoff checkpoint status marker not found");
if (!combined.includes("checkpointOnly")) failures.push("final local handoff checkpoint-only guard not found");
if (!combined.includes("checkpointHash")) failures.push("final local handoff checkpoint hash marker not found");
if (!combined.includes("qa:objective-traceability")) failures.push("objective traceability QA script not found");
if (!combined.includes("/api/delivery/objective-traceability")) failures.push("objective traceability endpoint not found");
if (!combined.includes("objectiveTraceabilityStatus")) failures.push("objective traceability report marker not found");
if (!combined.includes("data-objective-traceability")) failures.push("objective traceability UI marker not found");
if (!combined.includes("Phase 3D Objective Traceability Contract")) failures.push("objective traceability contract not found");
if (!combined.includes("traceable-with-open-certification-gaps")) failures.push("objective traceability status marker not found");
if (!combined.includes("model-primary-routing")) failures.push("objective traceability model primary row not found");
if (!combined.includes("external-provider-certification")) failures.push("objective traceability external provider row not found");
if (!combined.includes("qa:t3-approval-packet")) failures.push("T3 approval packet QA script not found");
if (!combined.includes("/api/delivery/t3-approval-packet")) failures.push("T3 approval packet endpoint not found");
if (!combined.includes("t3ApprovalPacketStatus")) failures.push("T3 approval packet report marker not found");
if (!combined.includes("data-t3-approval-packet")) failures.push("T3 approval packet UI marker not found");
if (!combined.includes("Phase 3E T3 Approval Packet Contract")) failures.push("T3 approval packet contract not found");
if (!combined.includes("approval-packet-ready")) failures.push("T3 approval packet status marker not found");
if (!combined.includes("approvalPrompt")) failures.push("T3 approval packet approval prompt not found");
if (!combined.includes("safeToRunAutomatically")) failures.push("T3 approval packet auto-run guard not found");
if (!combined.includes("qa:t3-dry-run")) failures.push("T3 dry-run rehearsal QA script not found");
if (!combined.includes("/api/delivery/t3-dry-run-rehearsal")) failures.push("T3 dry-run rehearsal endpoint not found");
if (!combined.includes("t3DryRunRehearsalStatus")) failures.push("T3 dry-run rehearsal report marker not found");
if (!combined.includes("data-t3-dry-run-rehearsal")) failures.push("T3 dry-run rehearsal UI marker not found");
if (!combined.includes("Phase 3F T3 Dry-Run Rehearsal Contract")) failures.push("T3 dry-run rehearsal contract not found");
if (!combined.includes("rehearsal-ready-with-open-t3-gaps")) failures.push("T3 dry-run rehearsal status marker not found");
if (!combined.includes("externalActionsExecuted")) failures.push("T3 dry-run external action guard not found");
if (!combined.includes("certificationStateChanged")) failures.push("T3 dry-run certification state guard not found");
if (!combined.includes("qa:t3-approval-request")) failures.push("T3 approval request export QA script not found");
if (!combined.includes("/api/delivery/t3-approval-request-export")) failures.push("T3 approval request export endpoint not found");
if (!combined.includes("t3ApprovalRequestExportStatus")) failures.push("T3 approval request export report marker not found");
if (!combined.includes("data-t3-approval-request-export")) failures.push("T3 approval request export UI marker not found");
if (!combined.includes("Phase 3G T3 Approval Request Export Contract")) failures.push("T3 approval request export contract not found");
if (!combined.includes("approval-request-export-ready")) failures.push("T3 approval request export status marker not found");
if (!combined.includes("approvalText")) failures.push("T3 approval request approval text not found");
if (!combined.includes("singleLaneOnly")) failures.push("T3 approval request single-lane guard not found");
if (!combined.includes("qa:t3-approval-integrity")) failures.push("T3 approval integrity QA script not found");
if (!combined.includes("/api/delivery/t3-approval-integrity")) failures.push("T3 approval integrity endpoint not found");
if (!combined.includes("t3ApprovalIntegrityStatus")) failures.push("T3 approval integrity report marker not found");
if (!combined.includes("data-t3-approval-integrity")) failures.push("T3 approval integrity UI marker not found");
if (!combined.includes("Phase 3H T3 Approval Integrity Contract")) failures.push("T3 approval integrity contract not found");
if (!combined.includes("approval-integrity-ready")) failures.push("T3 approval integrity status marker not found");
if (!combined.includes("integrityBundleHash")) failures.push("T3 approval integrity bundle hash marker not found");
if (!combined.includes("hashOnly")) failures.push("T3 approval integrity hash-only guard not found");
if (!combined.includes("contentReturned")) failures.push("T3 approval integrity content guard not found");
if (!combined.includes("qa:t3-approval-lock")) failures.push("T3 approval lock QA script not found");
if (!combined.includes("/api/delivery/t3-approval-lock")) failures.push("T3 approval lock endpoint not found");
if (!combined.includes("t3ApprovalLockStatus")) failures.push("T3 approval lock report marker not found");
if (!combined.includes("data-t3-approval-lock")) failures.push("T3 approval lock UI marker not found");
if (!combined.includes("Phase 3I T3 Approval Lock Contract")) failures.push("T3 approval lock contract not found");
if (!combined.includes("approval-lock-ready-with-open-t3-gaps")) failures.push("T3 approval lock status marker not found");
if (!combined.includes("approvalLockHash")) failures.push("T3 approval lock hash marker not found");
if (!combined.includes("approvalTextHash")) failures.push("T3 approval lock approval-text hash marker not found");
if (!combined.includes("lockOnly")) failures.push("T3 approval lock-only guard not found");
if (!combined.includes("qa:t3-approval-verifier")) failures.push("T3 approval verifier QA script not found");
if (!combined.includes("/api/delivery/t3-approval-verifier")) failures.push("T3 approval verifier endpoint not found");
if (!combined.includes("t3ApprovalVerifierStatus")) failures.push("T3 approval verifier report marker not found");
if (!combined.includes("data-t3-approval-verifier")) failures.push("T3 approval verifier UI marker not found");
if (!combined.includes("Phase 3J T3 Approval Verifier Contract")) failures.push("T3 approval verifier contract not found");
if (!combined.includes("approval-verifier-ready-execution-blocked")) failures.push("T3 approval verifier ready status marker not found");
if (!combined.includes("approval-metadata-verified-execution-blocked")) failures.push("T3 approval verifier verified status marker not found");
if (!combined.includes("verifierOnly")) failures.push("T3 approval verifier-only guard not found");
if (!combined.includes("approvalRecorded")) failures.push("T3 approval verifier approval-record guard not found");
if (!combined.includes("qa:t3-approval-candidates")) failures.push("T3 approval candidates QA script not found");
if (!combined.includes("/api/delivery/t3-approval-candidates")) failures.push("T3 approval candidates endpoint not found");
if (!combined.includes("t3ApprovalCandidatesStatus")) failures.push("T3 approval candidates report marker not found");
if (!combined.includes("data-t3-approval-candidates")) failures.push("T3 approval candidates UI marker not found");
if (!combined.includes("Phase 3K T3 Approval Candidates Contract")) failures.push("T3 approval candidates contract not found");
if (!combined.includes("approval-candidates-ready-execution-blocked")) failures.push("T3 approval candidates status marker not found");
if (!combined.includes("candidateOnly")) failures.push("T3 approval candidate-only guard not found");
if (!combined.includes("candidateBundleHash")) failures.push("T3 approval candidates bundle hash marker not found");
if (!combined.includes("qa:t3-approval-execution-gate")) failures.push("T3 approval execution gate QA script not found");
if (!combined.includes("/api/delivery/t3-approval-execution-gate")) failures.push("T3 approval execution gate endpoint not found");
if (!combined.includes("t3ApprovalExecutionGateStatus")) failures.push("T3 approval execution gate report marker not found");
if (!combined.includes("data-t3-approval-execution-gate")) failures.push("T3 approval execution gate UI marker not found");
if (!combined.includes("Phase 3L T3 Approval Execution Gate Contract")) failures.push("T3 approval execution gate contract not found");
if (!combined.includes("approval-execution-gate-ready-execution-blocked")) failures.push("T3 approval execution gate ready status marker not found");
if (!combined.includes("approval-execution-gate-candidate-bound-execution-blocked")) failures.push("T3 approval execution gate bound status marker not found");
if (!combined.includes("gateOnly")) failures.push("T3 approval execution gate-only guard not found");
if (!combined.includes("executionGateHash")) failures.push("T3 approval execution gate hash marker not found");
if (!combined.includes("qa:t3-certification-evidence-closure")) failures.push("T3 certification evidence closure QA script not found");
if (!combined.includes("/api/delivery/t3-certification-evidence-closure")) failures.push("T3 certification evidence closure endpoint not found");
if (!combined.includes("t3CertificationEvidenceClosureStatus")) failures.push("T3 certification evidence closure report marker not found");
if (!combined.includes("data-t3-certification-evidence-closure")) failures.push("T3 certification evidence closure UI marker not found");
if (!combined.includes("Phase 3M T3 Certification Evidence Closure Contract")) failures.push("T3 certification evidence closure contract not found");
if (!combined.includes("certification-evidence-closure-ready-execution-blocked")) failures.push("T3 certification evidence closure ready status marker not found");
if (!combined.includes("certification-evidence-closure-ready-state-unchanged")) failures.push("T3 certification evidence closure validated status marker not found");
if (!combined.includes("closureOnly")) failures.push("T3 certification evidence closure-only guard not found");
if (!combined.includes("closureHash")) failures.push("T3 certification evidence closure hash marker not found");
if (!combined.includes("qa:final-readiness")) failures.push("final delivery readiness QA script not found");
if (!combined.includes("/api/delivery/final-readiness")) failures.push("final delivery readiness endpoint not found");
if (!combined.includes("finalDeliveryReadinessStatus")) failures.push("final delivery readiness report marker not found");
if (!combined.includes("data-final-delivery-readiness")) failures.push("final delivery readiness UI marker not found");
if (!combined.includes("Phase 3N Final Delivery Readiness Contract")) failures.push("final delivery readiness contract not found");
if (!combined.includes("final-readiness-local-evidence-ready-open-t3")) failures.push("final delivery readiness status marker not found");
if (!combined.includes("blockedByT3")) failures.push("final delivery readiness T3 blocker marker not found");
if (!combined.includes("readinessHash")) failures.push("final delivery readiness hash marker not found");
if (!combined.includes("qa:t3-evidence-templates")) failures.push("T3 evidence bundle templates QA script not found");
if (!combined.includes("/api/delivery/t3-evidence-bundle-templates")) failures.push("T3 evidence bundle templates endpoint not found");
if (!combined.includes("t3EvidenceBundleTemplateStatus")) failures.push("T3 evidence bundle templates report marker not found");
if (!combined.includes("data-t3-evidence-bundle-templates")) failures.push("T3 evidence bundle templates UI marker not found");
if (!combined.includes("Phase 3O T3 Evidence Bundle Templates Contract")) failures.push("T3 evidence bundle templates contract not found");
if (!combined.includes("evidence-bundle-templates-ready-execution-blocked")) failures.push("T3 evidence bundle templates status marker not found");
if (!combined.includes("templateOnly")) failures.push("T3 evidence bundle template-only guard not found");
if (!combined.includes("templateBundleHash")) failures.push("T3 evidence bundle template hash marker not found");
if (!combined.includes("qa:t3-operator-checklist")) failures.push("T3 operator checklist QA script not found");
if (!combined.includes("/api/delivery/t3-operator-checklist")) failures.push("T3 operator checklist endpoint not found");
if (!combined.includes("t3OperatorChecklistStatus")) failures.push("T3 operator checklist report marker not found");
if (!combined.includes("data-t3-operator-checklist")) failures.push("T3 operator checklist UI marker not found");
if (!combined.includes("Phase 3P T3 Operator Checklist Contract")) failures.push("T3 operator checklist contract not found");
if (!combined.includes("t3-operator-checklist-ready-execution-blocked")) failures.push("T3 operator checklist status marker not found");
if (!combined.includes("operatorOnly")) failures.push("T3 operator-only guard not found");
if (!combined.includes("checklistBundleHash")) failures.push("T3 operator checklist hash marker not found");
if (!combined.includes("qa:t3-operator-transcript")) failures.push("T3 operator transcript validator QA script not found");
if (!combined.includes("/api/delivery/t3-operator-transcript-validator")) failures.push("T3 operator transcript validator endpoint not found");
if (!combined.includes("t3OperatorTranscriptValidatorStatus")) failures.push("T3 operator transcript validator report marker not found");
if (!combined.includes("data-t3-operator-transcript-validator")) failures.push("T3 operator transcript validator UI marker not found");
if (!combined.includes("Phase 3Q T3 Operator Transcript Validator Contract")) failures.push("T3 operator transcript validator contract not found");
if (!combined.includes("t3-operator-transcript-validator-ready-execution-blocked")) failures.push("T3 operator transcript validator ready status marker not found");
if (!combined.includes("t3-operator-transcript-valid-state-unchanged")) failures.push("T3 operator transcript validator valid status marker not found");
if (!combined.includes("validatorOnly")) failures.push("T3 operator transcript validator-only guard not found");
if (!combined.includes("transcriptValidatorHash")) failures.push("T3 operator transcript validator hash marker not found");
if (!combined.includes("qa:t3-preflight")) failures.push("T3 preflight QA script not found");
if (!combined.includes("/api/delivery/t3-preflight")) failures.push("T3 preflight endpoint not found");
if (!combined.includes("t3PreflightStatus")) failures.push("T3 preflight report marker not found");
if (!combined.includes("Phase 2X T3 Certification Preflight Contract")) failures.push("T3 preflight contract not found");
if (!combined.includes("safeToRunAutomatically")) failures.push("T3 preflight auto-run guard marker not found");
if (!combined.includes("qa:t3-package")) failures.push("T3 package QA script not found");
if (!combined.includes("/api/delivery/t3-certification-package")) failures.push("T3 package endpoint not found");
if (!combined.includes("t3PackageStatus")) failures.push("T3 package report marker not found");
if (!combined.includes("data-t3-package")) failures.push("T3 package UI marker not found");
if (!combined.includes("Phase 2Y T3 Certification Package Contract")) failures.push("T3 package contract not found");
if (!combined.includes("executionAllowed")) failures.push("T3 package execution guard marker not found");
if (!combined.includes("qa:t3-evidence")) failures.push("T3 evidence QA script not found");
if (!combined.includes("/api/delivery/t3-evidence")) failures.push("T3 evidence endpoint not found");
if (!combined.includes("/api/delivery/t3-evidence/intake")) failures.push("T3 evidence intake endpoint not found");
if (!combined.includes("t3EvidenceStatus")) failures.push("T3 evidence report marker not found");
if (!combined.includes("data-t3-evidence")) failures.push("T3 evidence UI marker not found");
if (!combined.includes("Phase 2Z T3 Evidence Intake Contract")) failures.push("T3 evidence contract not found");
if (!combined.includes("certificationStateChanged")) failures.push("T3 evidence state-change guard marker not found");
if (!combined.includes("qa:completion")) failures.push("completion audit QA script not found");
if (!combined.includes("PASS_WITH_OPEN_CERTIFICATION_GAPS")) failures.push("completion audit verdict marker not found");
if (!combined.includes("finalGoalComplete")) failures.push("completion audit final-goal marker not found");
if (!combined.includes("codex-model-gateway")) failures.push("model provider adapter not found");
if (!combined.includes("dryRunOnly")) failures.push("model provider dry-run safety not found");
if (!combined.includes("T3-external-model-call")) failures.push("model provider live guard not found");
if (!combined.includes("redactProviderPayload")) failures.push("model provider redaction not found");
if (!combined.includes("executeProviderTransport")) failures.push("model provider transport executor not found");
if (!combined.includes("localhost mock provider")) failures.push("provider transport localhost mock QA not found");
if (!combined.includes("qa:provider-certification")) failures.push("provider certification QA script not found");
if (!combined.includes("/api/ai/provider/certification")) failures.push("provider certification endpoint not found");
if (!combined.includes("providerCertificationStatus")) failures.push("provider certification report marker not found");
if (!combined.includes("data-visual-fidelity")) failures.push("visual fidelity login marker not found");
if (!combined.includes("data-student-depth")) failures.push("visual fidelity student marker not found");
if (!combined.includes("data-research-proof")) failures.push("visual fidelity research marker not found");
if (!combined.includes("student-flow-agent")) failures.push("agentic QA student persona not found");
if (!combined.includes("PASS_WITH_OPEN_PRODUCT_GAPS")) failures.push("agentic QA verdict marker not found");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Smoke checks passed: files, core terms, controls, PWA, responsive CSS.");
