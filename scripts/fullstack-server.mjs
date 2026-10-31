import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { certificationOverview, loadCompletionAudit } from "./certification-overview.mjs";
import { deliveryArtifactIndex } from "./delivery-artifact-index.mjs";
import { agenticQaReplayDossier } from "./agentic-qa-replay-dossier.mjs";
import { visualQaStoryboard } from "./visual-qa-storyboard.mjs";
import { databaseCertificationReadiness } from "./database-certification.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { objectiveTraceability } from "./objective-traceability.mjs";
import { t3ApprovalPacket } from "./t3-approval-packet.mjs";
import { buildT3ApprovalRequestExport } from "./t3-approval-request-export.mjs";
import { t3ApprovalIntegrity } from "./t3-approval-integrity.mjs";
import { t3ApprovalLock } from "./t3-approval-lock.mjs";
import { t3ApprovalVerifier } from "./t3-approval-verifier.mjs";
import { t3ApprovalCandidates } from "./t3-approval-candidates.mjs";
import { t3ApprovalExecutionGate } from "./t3-approval-execution-gate.mjs";
import { t3CertificationEvidenceClosure } from "./t3-certification-evidence-closure.mjs";
import { finalDeliveryReadiness } from "./final-delivery-readiness.mjs";
import { deliveryReleaseCandidate } from "./delivery-release-candidate.mjs";
import { t3CertificationNextActions } from "./t3-certification-next-actions.mjs";
import { t3SingleLaneRunPackets } from "./t3-single-lane-run-packets.mjs";
import { t3RunPacketVerifier } from "./t3-run-packet-verifier.mjs";
import { deliveryReviewerCockpit } from "./delivery-reviewer-cockpit.mjs";
import { deliveryLaunchGuide } from "./delivery-launch-guide.mjs";
import { deliveryConsistencySentinel } from "./delivery-consistency-sentinel.mjs";
import { finalAcceptanceMatrix } from "./final-acceptance-matrix.mjs";
import { certificationBlockerBoard } from "./certification-blocker-board.mjs";
import { userAcceptanceRehearsal } from "./user-acceptance-rehearsal.mjs";
import { deliveryEvidenceNavigator } from "./delivery-evidence-navigator.mjs";
import { localDeliverySummaryPacket } from "./local-delivery-summary-packet.mjs";
import { localDeliveryHandoffBrief } from "./local-delivery-handoff-brief.mjs";
import { localDeliveryQuickstartBundle } from "./local-delivery-quickstart-bundle.mjs";
import { localDeliveryVerificationSuite } from "./local-delivery-verification-suite.mjs";
import { finalLocalHandoffCheckpoint } from "./final-local-handoff-checkpoint.mjs";
import { t3EvidenceBundleTemplates } from "./t3-evidence-bundle-templates.mjs";
import { t3OperatorChecklist } from "./t3-operator-checklist.mjs";
import { t3OperatorTranscriptValidator } from "./t3-operator-transcript-validator.mjs";
import { t3DryRunRehearsal } from "./t3-dry-run-rehearsal.mjs";
import { JsonRepository } from "./json-repository.mjs";
import { SqliteRepository } from "./sqlite-repository.mjs";
import { executeProviderTransport, modelProviderStatus, providerAdapterEvidence, providerLivePlan, redactProviderPayload, sanitizedProviderRequest } from "./model-provider.mjs";
import { providerCertificationReadiness } from "./provider-certification.mjs";
import { sandboxCertificationReadiness } from "./sandbox-certification.mjs";
import { intakeT3Evidence, summarizeT3Evidence } from "./t3-evidence-intake.mjs";
import { t3CertificationPackage } from "./t3-certification-package.mjs";
import { OUTPUT_LIMIT_BYTES, cleanupSandboxWorkspace, createSandboxWorkspace, createScrubbedEnv, runnerMetadata, sandboxPolicy, sandboxPreflight, scrubbedEnvHasSecret } from "./sandbox-isolation.mjs";
import { t3CertificationPreflight } from "./t3-certification-preflight.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const dbPath = join(root, "data", "mock-db.json");
const dbBackupPath = join(root, "data", "backups", "mock-db.latest.json");
const sqliteDbPath = process.env.CODEX_SQLITE_DB_PATH || join(root, "data", "codex.sqlite");
const sqliteBackupPath = process.env.CODEX_SQLITE_BACKUP_PATH || join(root, "data", "backups", "codex.sqlite.latest");
const modelContractsPath = join(root, "data", "model-contracts.json");
const completionAuditPath = join(root, "qa-artifacts", "phase2s-completion-audit.json");
const agenticAuditPath = join(root, "qa-artifacts", "phase2o-agentic-audit.json");
const sandboxRunnerPath = join(root, "scripts", "sandbox-runner.mjs");
function relativeToRoot(path) {
  return normalize(path).startsWith(root)
    ? normalize(path).slice(root.length + 1).replaceAll("\\", "/")
    : path;
}

function createRepository() {
  if (process.env.CODEX_DB_ENGINE === "sqlite") {
    return new SqliteRepository({
      dbPath: sqliteDbPath,
      backupPath: sqliteBackupPath,
      relativeDbPath: relativeToRoot(sqliteDbPath),
      relativeBackupPath: relativeToRoot(sqliteBackupPath)
    });
  }
  return new JsonRepository({
    dbPath,
    backupPath: dbBackupPath,
    relativeBackupPath: "data/backups/mock-db.latest.json"
  });
}

const repository = createRepository();
const wsRooms = new Map();

const seedCode = `# Python 海龟绘图：画一个学习徽章
speed(8)
color("#4A90E2")
circle(72)
left(90)
forward(110)
right(135)
color("#F5A623")
forward(80)
left(90)
forward(80)
print("AI小海龟：作品运行完成！")`;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function loadDb() {
  const loaded = repository.load(createSeedDb);
  if (loaded.recovered) {
    loaded.db.dbMeta.recoveredFromCorruptJson = true;
    loaded.db.authEvents.push({
      id: `auth-${Date.now()}-recover`,
      type: "db_recovered",
      userId: "system",
      role: "system",
      ok: true,
      createdAt: new Date().toISOString()
    });
    saveDb(loaded.db, "recover-corrupt-json");
  }
  return loaded.db;
}

function loadModelContracts() {
  return JSON.parse(readFileSync(modelContractsPath, "utf8"));
}

function loadJsonFile(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function saveDb(db, reason = "api-save") {
  return repository.save(db, { reason });
}

function activeSessionCount(db) {
  return (db.sessions || []).filter((session) => !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now()).length;
}

function revokedSessionCount(db) {
  return (db.sessions || []).filter((session) => session.revokedAt).length;
}

function rawSessionTokenStored(db) {
  return (db.sessions || []).some((session) => Object.hasOwn(session, "token"));
}

function dbStatus(db) {
  const { repository: repositoryMeta, backup } = repository.status(db);
  return {
    engine: repositoryMeta.engine,
    adapter: repositoryMeta.adapter,
    atomicWrites: repositoryMeta.atomicWrites,
    transactionalWrites: repositoryMeta.transactionalWrites,
    schemaVersion: db.dbMeta?.schemaVersion || 0,
    status: repositoryMeta.status,
    dbPath: repositoryMeta.dbPath || null,
    writeCount: repositoryMeta.writeCount,
    migrationsApplied: repositoryMeta.migrationsApplied || [],
    rollbackSupported: Boolean(repositoryMeta.rollbackSupported),
    externalReady: Boolean(repositoryMeta.externalReady),
    lastReadAt: repositoryMeta.lastReadAt,
    lastWriteAt: repositoryMeta.lastWriteAt,
    lastBackupAt: repositoryMeta.lastBackupAt,
    lastReason: repositoryMeta.lastReason,
    lastRecoveryReason: repositoryMeta.lastRecoveryReason,
    backup,
    counts: {
      users: (db.users || []).length,
      activeSessions: activeSessionCount(db),
      revokedSessions: revokedSessionCount(db),
      authEvents: (db.authEvents || []).length,
      runJobs: (db.runJobs || []).length
    },
    security: {
      rawSessionTokenStored: rawSessionTokenStored(db)
    }
  };
}

function databaseCertificationFor(db, extraEvidence = {}) {
  const { repository: repositoryMeta, backup } = repository.status(db);
  const sqliteMode = repositoryMeta.engine === "sqlite-repository-v1";
  return databaseCertificationReadiness({ repository: repositoryMeta, backup }, {
    sqlite: {
      adapter: repositoryMeta.adapter,
      migrationsApplied: repositoryMeta.migrationsApplied || [],
      transactionalWrites: Boolean(repositoryMeta.transactionalWrites),
      rollbackSupported: Boolean(repositoryMeta.rollbackSupported),
      backupExists: backup.exists,
      restartPersistence: sqliteMode && Number(repositoryMeta.writeCount || 0) > 0
    },
    transactionProbe: Boolean(repositoryMeta.transactionalWrites),
    rollbackProbe: Boolean(repositoryMeta.rollbackSupported),
    report: {
      repositoryEngine: repositoryMeta.engine,
      repositoryAdapter: repositoryMeta.adapter,
      repositoryBackupExists: backup.exists
    },
    secretSafety: {
      databaseUrlPresent: Boolean(process.env.DATABASE_URL),
      keyShapedSecretMatches: 0
    },
    ...extraEvidence
  });
}

function deliveryCertificationOverviewFor(db) {
  return certificationOverview({
    databaseCertification: databaseCertificationFor(db),
    sandboxCertification: sandboxCertificationReadiness(db.runJobs || []),
    providerCertification: providerCertificationReadiness(loadModelContracts(), db.aiMessages || []),
    completionAudit: loadCompletionAudit(completionAuditPath)
  });
}

function t3CertificationPreflightFor() {
  return t3CertificationPreflight(process.env, {
    sandboxPolicy: sandboxPolicy()
  });
}

function t3CertificationPackageFor(db) {
  return t3CertificationPackage({
    preflight: t3CertificationPreflightFor(),
    overview: deliveryCertificationOverviewFor(db)
  });
}

function deliveryHandoffDossierFor(db) {
  const completionAudit = loadCompletionAudit(completionAuditPath);
  const overview = deliveryCertificationOverviewFor(db);
  const t3Preflight = t3CertificationPreflightFor();
  const t3Package = t3CertificationPackage({ preflight: t3Preflight, overview });
  const t3Evidence = summarizeT3Evidence(db.t3EvidenceCandidates || []);
  return deliveryHandoffDossier({
    completionAudit,
    agenticAudit: loadJsonFile(agenticAuditPath, {}),
    overview,
    t3Package,
    t3Evidence,
    modelContracts: loadModelContracts()
  });
}

function deliveryArtifactIndexFor(db) {
  return deliveryArtifactIndex({
    dossier: deliveryHandoffDossierFor(db)
  });
}

function agenticQaReplayDossierFor() {
  return agenticQaReplayDossier();
}

function visualQaStoryboardFor() {
  return visualQaStoryboard();
}

function objectiveTraceabilityFor(db) {
  const dossier = deliveryHandoffDossierFor(db);
  const artifactIndex = deliveryArtifactIndex({ dossier });
  return objectiveTraceability({
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {}),
    dossier,
    artifactIndex
  });
}

function t3ApprovalPacketFor(db) {
  const t3Package = t3CertificationPackageFor(db);
  const traceability = objectiveTraceabilityFor(db);
  return t3ApprovalPacket({ t3Package, traceability });
}

function t3DryRunRehearsalFor(db) {
  return t3DryRunRehearsal({ approvalPacket: t3ApprovalPacketFor(db) });
}

function t3ApprovalRequestExportFor(db) {
  const approvalPacket = t3ApprovalPacketFor(db);
  const rehearsal = t3DryRunRehearsal({ approvalPacket });
  return buildT3ApprovalRequestExport({ approvalPacket, rehearsal });
}

function t3ApprovalIntegrityFor() {
  return t3ApprovalIntegrity();
}

function t3ApprovalLockFor(db) {
  return t3ApprovalLock({
    approvalRequest: t3ApprovalRequestExportFor(db),
    integrity: t3ApprovalIntegrityFor(),
    completionAudit: loadCompletionAudit(completionAuditPath)
  });
}

function t3ApprovalVerifierFor(db, candidate = null) {
  return t3ApprovalVerifier({
    lock: t3ApprovalLockFor(db),
    candidate
  });
}

function t3ApprovalCandidatesFor(db) {
  return t3ApprovalCandidates({
    lock: t3ApprovalLockFor(db)
  });
}

function t3ApprovalExecutionGateFor(db, candidate = null) {
  const lock = t3ApprovalLockFor(db);
  return t3ApprovalExecutionGate({
    lock,
    candidates: t3ApprovalCandidates({ lock }),
    candidate
  });
}

function t3CertificationEvidenceClosureFor(db, evidenceBundle = null) {
  return t3CertificationEvidenceClosure({
    executionGate: t3ApprovalExecutionGateFor(db),
    evidenceBundle
  });
}

function t3EvidenceBundleTemplatesFor(db) {
  return t3EvidenceBundleTemplates({
    executionGate: t3ApprovalExecutionGateFor(db)
  });
}

function t3OperatorChecklistFor(db) {
  const candidates = t3ApprovalCandidatesFor(db);
  const executionGate = t3ApprovalExecutionGateFor(db);
  const templates = t3EvidenceBundleTemplates({ executionGate });
  return t3OperatorChecklist({
    finalReadiness: finalDeliveryReadinessFor(db),
    candidates,
    executionGate,
    templates
  });
}

function t3OperatorTranscriptValidatorFor(db, transcript = null) {
  return t3OperatorTranscriptValidator({
    checklist: t3OperatorChecklistFor(db),
    transcript
  });
}

function finalDeliveryReadinessFor(db) {
  const completionAudit = loadCompletionAudit(completionAuditPath);
  const agenticAudit = loadJsonFile(agenticAuditPath, {});
  const overview = deliveryCertificationOverviewFor(db);
  const t3Package = t3CertificationPackageFor(db);
  const t3Evidence = summarizeT3Evidence(db.t3EvidenceCandidates || []);
  const dossier = deliveryHandoffDossier({
    completionAudit,
    agenticAudit,
    overview,
    t3Package,
    t3Evidence,
    modelContracts: loadModelContracts()
  });
  const artifactIndex = deliveryArtifactIndex({ dossier });
  const traceability = objectiveTraceability({
    completionAudit,
    agenticAudit,
    dossier,
    artifactIndex
  });
  return finalDeliveryReadiness({
    completionAudit,
    agenticAudit,
    overview,
    t3Package,
    t3Evidence,
    modelContracts: loadModelContracts(),
    dossier,
    artifactIndex,
    traceability,
    evidenceClosure: t3CertificationEvidenceClosureFor(db)
  });
}

function deliveryReleaseCandidateFor(db) {
  const completionAudit = loadCompletionAudit(completionAuditPath);
  const agenticAudit = loadJsonFile(agenticAuditPath, {});
  const dossier = deliveryHandoffDossierFor(db);
  const artifactIndex = deliveryArtifactIndex({ dossier });
  const traceability = objectiveTraceability({
    completionAudit,
    agenticAudit,
    dossier,
    artifactIndex
  });
  return deliveryReleaseCandidate({
    completionAudit,
    agenticAudit,
    finalReadiness: finalDeliveryReadinessFor(db),
    agenticReplay: agenticQaReplayDossierFor(),
    visualStoryboard: visualQaStoryboardFor(),
    dossier,
    artifactIndex,
    traceability
  });
}

function t3CertificationNextActionsFor(db) {
  const executionGate = t3ApprovalExecutionGateFor(db);
  const templates = t3EvidenceBundleTemplates({ executionGate });
  const checklist = t3OperatorChecklistFor(db);
  return t3CertificationNextActions({
    releaseCandidate: deliveryReleaseCandidateFor(db),
    executionGate,
    templates,
    checklist
  });
}

function t3SingleLaneRunPacketsFor(db) {
  const executionGate = t3ApprovalExecutionGateFor(db);
  const templates = t3EvidenceBundleTemplates({ executionGate });
  const checklist = t3OperatorChecklistFor(db);
  const nextActions = t3CertificationNextActions({
    releaseCandidate: deliveryReleaseCandidateFor(db),
    executionGate,
    templates,
    checklist
  });
  return t3SingleLaneRunPackets({
    nextActions,
    executionGate,
    templates,
    checklist
  });
}

function t3RunPacketVerifierFor(db, packet = null) {
  return t3RunPacketVerifier({
    runPacketBundle: t3SingleLaneRunPacketsFor(db),
    packet
  });
}

function deliveryReviewerCockpitFor(db) {
  const completionAudit = loadCompletionAudit(completionAuditPath);
  const agenticAudit = loadJsonFile(agenticAuditPath, {});
  const dossier = deliveryHandoffDossierFor(db);
  const artifactIndex = deliveryArtifactIndex({ dossier });
  const traceability = objectiveTraceability({
    completionAudit,
    agenticAudit,
    dossier,
    artifactIndex
  });
  const finalReadiness = finalDeliveryReadinessFor(db);
  const agenticReplay = agenticQaReplayDossierFor();
  const visualStoryboard = visualQaStoryboardFor();
  const releaseCandidate = deliveryReleaseCandidate({
    completionAudit,
    agenticAudit,
    finalReadiness,
    agenticReplay,
    visualStoryboard,
    dossier,
    artifactIndex,
    traceability
  });
  const runPacketBundle = t3SingleLaneRunPacketsFor(db);
  return deliveryReviewerCockpit({
    completionAudit,
    agenticAudit,
    modelContracts: loadModelContracts(),
    dossier,
    artifactIndex,
    traceability,
    agenticReplay,
    visualStoryboard,
    finalReadiness,
    releaseCandidate,
    runPacketBundle,
    runPacketVerifier: t3RunPacketVerifier({ runPacketBundle })
  });
}

function deliveryLaunchGuideFor(db) {
  const reviewerCockpit = deliveryReviewerCockpitFor(db);
  return deliveryLaunchGuide({
    reviewerCockpit,
    releaseCandidate: deliveryReleaseCandidateFor(db),
    finalReadiness: finalDeliveryReadinessFor(db)
  });
}

function deliveryConsistencySentinelFor(db) {
  const finalReadiness = finalDeliveryReadinessFor(db);
  const releaseCandidate = deliveryReleaseCandidateFor(db);
  const reviewerCockpit = deliveryReviewerCockpitFor(db);
  const launchGuide = deliveryLaunchGuide({
    reviewerCockpit,
    releaseCandidate,
    finalReadiness
  });
  return deliveryConsistencySentinel({
    launchGuide,
    reviewerCockpit,
    releaseCandidate,
    finalReadiness,
    artifactIndex: deliveryArtifactIndex({ dossier: deliveryHandoffDossierFor(db) }),
    traceability: objectiveTraceabilityFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function finalAcceptanceMatrixFor(db) {
  const finalReadiness = finalDeliveryReadinessFor(db);
  const releaseCandidate = deliveryReleaseCandidateFor(db);
  const reviewerCockpit = deliveryReviewerCockpitFor(db);
  const launchGuide = deliveryLaunchGuide({
    reviewerCockpit,
    releaseCandidate,
    finalReadiness
  });
  const consistencySentinel = deliveryConsistencySentinel({
    launchGuide,
    reviewerCockpit,
    releaseCandidate,
    finalReadiness,
    artifactIndex: deliveryArtifactIndex({ dossier: deliveryHandoffDossierFor(db) }),
    traceability: objectiveTraceabilityFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
  return finalAcceptanceMatrix({
    consistencySentinel,
    launchGuide,
    reviewerCockpit,
    releaseCandidate,
    finalReadiness,
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function certificationBlockerBoardFor(db) {
  const finalAcceptance = finalAcceptanceMatrixFor(db);
  return certificationBlockerBoard({
    finalAcceptance,
    runPackets: t3SingleLaneRunPacketsFor(db),
    runPacketVerifier: t3RunPacketVerifierFor(db),
    evidenceTemplates: t3EvidenceBundleTemplatesFor(db),
    operatorChecklist: t3OperatorChecklistFor(db),
    transcriptValidator: t3OperatorTranscriptValidatorFor(db),
    nextActions: t3CertificationNextActionsFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function userAcceptanceRehearsalFor(db) {
  const finalAcceptance = finalAcceptanceMatrixFor(db);
  const blockerBoard = certificationBlockerBoardFor(db);
  return userAcceptanceRehearsal({
    finalAcceptance,
    blockerBoard,
    consistencySentinel: deliveryConsistencySentinelFor(db),
    launchGuide: deliveryLaunchGuideFor(db),
    reviewerCockpit: deliveryReviewerCockpitFor(db),
    visualStoryboard: visualQaStoryboardFor(db),
    agenticReplay: agenticQaReplayDossierFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function deliveryEvidenceNavigatorFor(db) {
  return deliveryEvidenceNavigator({
    userAcceptance: userAcceptanceRehearsalFor(db),
    artifactIndex: deliveryArtifactIndex({ dossier: deliveryHandoffDossierFor(db) }),
    blockerBoard: certificationBlockerBoardFor(db),
    visualStoryboard: visualQaStoryboardFor(db),
    agenticReplay: agenticQaReplayDossierFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function localDeliverySummaryPacketFor(db) {
  return localDeliverySummaryPacket({
    evidenceNavigator: deliveryEvidenceNavigatorFor(db),
    userAcceptance: userAcceptanceRehearsalFor(db),
    blockerBoard: certificationBlockerBoardFor(db),
    finalAcceptance: finalAcceptanceMatrixFor(db),
    consistencySentinel: deliveryConsistencySentinelFor(db),
    visualStoryboard: visualQaStoryboardFor(db),
    agenticReplay: agenticQaReplayDossierFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function localDeliveryHandoffBriefFor(db) {
  return localDeliveryHandoffBrief({
    localSummary: localDeliverySummaryPacketFor(db),
    evidenceNavigator: deliveryEvidenceNavigatorFor(db),
    userAcceptance: userAcceptanceRehearsalFor(db),
    launchGuide: deliveryLaunchGuideFor(db),
    reviewerCockpit: deliveryReviewerCockpitFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function localDeliveryQuickstartBundleFor(db) {
  return localDeliveryQuickstartBundle({
    handoffBrief: localDeliveryHandoffBriefFor(db),
    localSummary: localDeliverySummaryPacketFor(db),
    evidenceNavigator: deliveryEvidenceNavigatorFor(db),
    launchGuide: deliveryLaunchGuideFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {})
  });
}

function localDeliveryVerificationSuiteFor(db) {
  return localDeliveryVerificationSuite({
    quickstartBundle: localDeliveryQuickstartBundleFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {}),
    packageManifest: loadJsonFile("package.json", {})
  });
}

function finalLocalHandoffCheckpointFor(db) {
  return finalLocalHandoffCheckpoint({
    verificationSuite: localDeliveryVerificationSuiteFor(db),
    completionAudit: loadCompletionAudit(completionAuditPath),
    agenticAudit: loadJsonFile(agenticAuditPath, {}),
    packageManifest: loadJsonFile("package.json", {})
  });
}

function seedRoom(events = []) {
  return {
    id: "pair-demo",
    title: "海龟徽章结对房间",
    mode: "student-ai",
    turn: {
      driver: "student-linyi",
      navigator: "ai-turtle",
      switchedAt: "2026-06-20T08:40:00.000Z"
    },
    presence: [
      { actor: "student-linyi", name: "林一诺", role: "driver", status: "online", joinedAt: "2026-06-20T08:40:00.000Z" },
      { actor: "ai-turtle", name: "小龟导师", role: "coach", status: "online", joinedAt: "2026-06-20T08:40:05.000Z" }
    ],
    events: events.map((event, index) => ({
      id: event.id || `room-seed-${index + 1}`,
      roomId: event.sessionId || "pair-demo",
      sequence: index + 1,
      type: event.type || "note",
      actor: event.actor || "system",
      message: event.message || "协作事件",
      payload: {},
      createdAt: event.createdAt || new Date().toISOString()
    })),
    updatedAt: new Date().toISOString()
  };
}

function passwordDigest(userId, password) {
  const hex = createHash("sha256").update(`codex-demo:${userId}:${password}`).digest("hex");
  return `sha256:${hex.match(/.{1,16}/g).join(":")}`;
}

function sessionTokenHash(token) {
  const hex = createHash("sha256").update(`codex-session:${token}`).digest("hex");
  return `sha256:${hex.match(/.{1,16}/g).join(":")}`;
}

function permissionsForRole(role) {
  const permissions = {
    student: ["read_assignment", "save_version", "run_code", "submit_work", "join_room"],
    teacher: ["read_assignment", "review_submission", "switch_turn", "read_dashboard", "join_room"],
    researcher: ["read_reports", "read_audit", "export_research"]
  };
  return permissions[role] || [];
}

function seedUsers() {
  return [
    {
      id: "student-linyi",
      name: "林一诺",
      role: "student",
      status: "active",
      auth: { provider: "demo-password", passwordDigest: passwordDigest("student-linyi", "demo-student"), passwordUpdatedAt: "2026-06-20T00:00:00.000Z" },
      permissions: permissionsForRole("student")
    },
    {
      id: "teacher-lishen",
      name: "李深老师",
      role: "teacher",
      status: "active",
      auth: { provider: "demo-password", passwordDigest: passwordDigest("teacher-lishen", "demo-teacher"), passwordUpdatedAt: "2026-06-20T00:00:00.000Z" },
      permissions: permissionsForRole("teacher")
    },
    {
      id: "researcher-demo",
      name: "课题研究员",
      role: "researcher",
      status: "active",
      auth: { provider: "demo-password", passwordDigest: passwordDigest("researcher-demo", "demo-research"), passwordUpdatedAt: "2026-06-20T00:00:00.000Z" },
      permissions: permissionsForRole("researcher")
    }
  ];
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    status: user.status,
    permissions: user.permissions || permissionsForRole(user.role)
  };
}

function createSeedDb() {
  const collabEvents = [
    {
      id: "evt-1",
      sessionId: "pair-demo",
      actor: "student-linyi",
      type: "role",
      message: "Driver 写入 turtle.circle",
      createdAt: "2026-06-20T08:41:00.000Z"
    },
    {
      id: "evt-2",
      sessionId: "pair-demo",
      actor: "navigator",
      type: "review",
      message: "Navigator 标注缺少边界测试",
      createdAt: "2026-06-20T08:43:00.000Z"
    }
  ];
  return {
    dbMeta: { schemaVersion: 4, resetAt: new Date().toISOString(), resetCount: 1, recoveredFromCorruptJson: false },
    projects: {
      current: {
        id: "current",
        ownerId: "student-linyi",
        title: "海龟徽章",
        language: "python",
        latestVersionId: "v1"
      }
    },
    versions: [
      { id: "v1", projectId: "current", label: "初始模板", language: "python", savedAt: "08:30", code: seedCode }
    ],
    runs: [],
    aiMessages: [],
    t3EvidenceCandidates: [],
    collabEvents,
    users: seedUsers(),
    sessions: [],
    authEvents: [
      { id: "auth-seed", userId: "system", role: "system", type: "seed", ok: true, createdAt: new Date().toISOString() }
    ],
    collabRooms: { "pair-demo": seedRoom(collabEvents) },
    assignments: [
      {
        id: "assign-turtle-badge",
        title: "海龟徽章创作",
        brief: "用 Python turtle 画出代表小组学习精神的徽章，并用 3 句话解释分解、抽象和调试过程。",
        dueAt: "2026-06-26T09:00:00.000Z",
        ctFocus: ["分解", "抽象", "算法", "调试"],
        rubric: [
          { label: "作品能运行并生成图形", weight: 30 },
          { label: "能解释核心步骤与变量", weight: 30 },
          { label: "至少一次自检和版本保存", weight: 20 },
          { label: "同伴或 AI 建议被采纳", weight: 20 }
        ]
      }
    ],
    submissions: [
      {
        id: "sub-seed-linyi",
        assignmentId: "assign-turtle-badge",
        studentId: "student-linyi",
        studentName: "林一诺",
        projectId: "current",
        versionId: "v1",
        language: "python",
        status: "reviewed",
        score: 86,
        feedback: "图形完整，下一步请补充边界测试和同伴解释记录。",
        submittedAt: "2026-06-20T09:10:00.000Z",
        reviewedAt: "2026-06-20T09:18:00.000Z",
        selfCheck: { runs: 2, savedVersion: true, explanationReady: true, aiReviewed: true }
      }
    ],
    teacher: {
      classId: "class-8-3",
      className: "初二 3 班",
      onlineStudents: 31,
      totalStudents: 36,
      effectiveHints: 128,
      interventionNeeded: 8,
      projects: [
        { title: "海龟徽章", language: "Python", progress: 78, ct: "分解 / 调试", status: "进行中" },
        { title: "最大公约数", language: "C++", progress: 46, ct: "算法", status: "待指导" },
        { title: "温度换算器", language: "C", progress: 92, ct: "抽象", status: "已提交" }
      ],
      ctDimensions: { "抽象": 72, "分解": 81, "建模": 62, "算法": 68, "调试": 74, "迁移": 55 }
    }
  };
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function envelope(data, ok = true) {
  return {
    ok,
    data,
    traceId: randomUUID(),
    servedAt: new Date().toISOString()
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function publicModelContracts() {
  const contracts = loadModelContracts();
  return {
    version: contracts.version,
    updated: contracts.updated,
    coding: contracts.coding,
    image: contracts.image,
    runtime: contracts.runtime,
    provider: modelProviderStatus(contracts),
    studentSafety: contracts.studentSafety,
    secrets: { policy: contracts.secrets.policy }
  };
}

function modelRouteFor(payload = {}) {
  const contracts = loadModelContracts();
  const routeId = `route-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  if (payload.taskType === "image") {
    return {
      id: routeId,
      path: "image",
      selectedModel: contracts.image.model,
      fallbackUsed: false,
      fallbackAfterMs: null,
      observedPrimaryLatencyMs: null,
      secretSafe: true,
      reason: "image-model-path",
      separationRule: contracts.image.separationRule
    };
  }

  const observedPrimaryLatencyMs = Math.max(0, Number(payload.simulatePrimaryLatencyMs ?? 320));
  const fallbackAfterMs = contracts.coding.fallbackAfterMs;
  const fallbackUsed = observedPrimaryLatencyMs > fallbackAfterMs;
  return {
    id: routeId,
    path: "coding",
    primaryModel: contracts.coding.primaryModel,
    fallbackModel: contracts.coding.fallbackModel,
    selectedModel: fallbackUsed ? contracts.coding.fallbackModel : contracts.coding.primaryModel,
    fallbackUsed,
    fallbackAfterMs,
    observedPrimaryLatencyMs,
    secretSafe: true,
    reason: fallbackUsed ? "primary-load-timeout" : "primary-ready"
  };
}

function providerStatus() {
  return modelProviderStatus(loadModelContracts());
}

function redactedTextPreview(value) {
  const redacted = redactProviderPayload(String(value || ""));
  return typeof redacted === "object" && redacted ? redacted.preview : String(redacted || "");
}

function sanitizedAiRequest(payload = {}) {
  return {
    taskType: payload.taskType === "image" ? "image" : "coding",
    tutorRole: payload.tutorRole === "reviewer" ? "reviewer" : "turtle",
    assetType: payload.assetType ? String(payload.assetType).slice(0, 60) : undefined,
    ctFocus: Array.isArray(payload.ctFocus) ? payload.ctFocus.slice(0, 8).map((item) => String(item).slice(0, 40)) : [],
    simulatePrimaryLatencyMs: payload.simulatePrimaryLatencyMs === undefined ? undefined : Number(payload.simulatePrimaryLatencyMs),
    redactedPayload: redactProviderPayload(payload)
  };
}

function providerProbe(payload = {}) {
  const contracts = loadModelContracts();
  const taskType = payload.taskType === "image" ? "image" : "coding";
  const modelRoute = modelRouteFor({ ...payload, taskType });
  return {
    providerStatus: modelProviderStatus(contracts),
    modelRoute,
    providerRequest: sanitizedProviderRequest(modelRoute, payload, contracts),
    secretEcho: false
  };
}

function providerLivePlanFor(payload = {}, headers = {}) {
  const contracts = loadModelContracts();
  const taskType = payload.taskType === "image" ? "image" : "coding";
  const modelRoute = modelRouteFor({ ...payload, taskType });
  return providerLivePlan(modelRoute, payload, contracts, headers);
}

function routeAuditTotals(routes = []) {
  return {
    total: routes.length,
    fallback: routes.filter((route) => route.fallbackUsed).length,
    image: routes.filter((route) => route.path === "image").length,
    coding: routes.filter((route) => route.path === "coding").length
  };
}

function recordAuthEvent(db, event = {}) {
  db.authEvents ||= [];
  const authEvent = {
    id: `auth-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: event.type || "unknown",
    userId: event.userId || "anonymous",
    role: event.role || "unknown",
    ok: event.ok !== false,
    reason: event.reason || null,
    sessionHash: event.sessionHash || null,
    createdAt: new Date().toISOString()
  };
  db.authEvents.push(authEvent);
  db.authEvents = db.authEvents.slice(-200);
  return authEvent;
}

function authEventTotals(events = []) {
  return events.reduce((totals, event) => {
    totals.total += 1;
    totals[event.type] = (totals[event.type] || 0) + 1;
    if (event.ok === false) totals.failure += 1;
    return totals;
  }, { total: 0, failure: 0 });
}

function currentSession(req, db) {
  const token = req.headers["x-codex-session"];
  if (!token) return null;
  const tokenHash = sessionTokenHash(token);
  const session = (db.sessions || []).find((item) => item.tokenHash === tokenHash) || null;
  if (!session || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = (db.users || []).find((item) => item.id === session.userId && item.status === "active");
  if (!user) return null;
  return { ...session, user, permissions: user.permissions || permissionsForRole(user.role) };
}

function requireRole(req, res, db, roles) {
  const session = currentSession(req, db);
  if (!session || !roles.includes(session.role)) {
    json(res, 403, envelope({ error: "Forbidden", requiredRoles: roles }, false));
    return null;
  }
  return session;
}

function issueSession(db, user, assurance = "password") {
  db.sessions ||= [];
  const rawToken = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 120 * 60 * 1000).toISOString();
  const tokenHash = sessionTokenHash(rawToken);
  const session = {
    tokenHash,
    userId: user.id,
    role: user.role,
    assurance,
    createdAt: createdAt.toISOString(),
    expiresAt,
    revokedAt: null
  };
  db.sessions.push(session);
  db.sessions = db.sessions.slice(-100);
  recordAuthEvent(db, { type: "login", userId: user.id, role: user.role, ok: true, sessionHash: tokenHash });
  return { rawToken, session };
}

function verifyCredentials(db, body = {}) {
  const role = ["student", "teacher", "researcher"].includes(body.role) ? body.role : "student";
  const fallbackUserId = role === "teacher" ? "teacher-lishen" : role === "researcher" ? "researcher-demo" : "student-linyi";
  const userId = body.userId || fallbackUserId;
  const user = (db.users || []).find((item) => item.id === userId && item.status === "active");
  if (!user) return { ok: false, role, userId, reason: "user-not-found" };
  if (body.password || body.userId) {
    const expected = user.auth?.passwordDigest;
    const actual = passwordDigest(user.id, body.password || "");
    if (!expected || actual !== expected) return { ok: false, role: user.role, userId: user.id, reason: "invalid-credentials" };
    return { ok: true, user, assurance: "password" };
  }
  return { ok: true, user, assurance: "demo-role" };
}

function ensureRoom(db, roomId = "pair-demo") {
  db.collabRooms ||= {};
  if (!db.collabRooms[roomId]) {
    db.collabRooms[roomId] = {
      ...seedRoom([]),
      id: roomId,
      title: roomId === "pair-demo" ? "海龟徽章结对房间" : `协作房间 ${roomId}`,
      events: [],
      presence: []
    };
  }
  return db.collabRooms[roomId];
}

function appendRoomEvent(db, roomId, eventInput) {
  const room = ensureRoom(db, roomId);
  const lastSequence = room.events.at(-1)?.sequence || 0;
  const createdAt = new Date().toISOString();
  const event = {
    id: `room-${Date.now()}-${lastSequence + 1}`,
    roomId,
    sequence: lastSequence + 1,
    type: eventInput.type || "note",
    actor: eventInput.actor || "system",
    message: eventInput.message || "协作事件",
    payload: eventInput.payload || {},
    createdAt
  };
  room.events.push(event);
  room.updatedAt = createdAt;
  db.collabEvents.push({
    id: event.id,
    sessionId: roomId,
    actor: event.actor,
    type: event.type,
    message: event.message,
    createdAt
  });
  return event;
}

function roomSnapshot(db, roomId) {
  const room = ensureRoom(db, roomId);
  return {
    room,
    replay: room.events.slice(-20),
    presence: room.presence
  };
}

function wsSend(client, payload) {
  if (client.socket.destroyed) return false;
  client.socket.write(encodeWsFrame(JSON.stringify(payload)));
  return true;
}

function broadcastRoom(roomId, payload) {
  const clients = wsRooms.get(roomId);
  if (!clients) return;
  for (const client of clients) wsSend(client, payload);
}

function encodeWsFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const header = [0x81];
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(127, 0, 0, 0, 0, (payload.length >> 24) & 0xff, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff);
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function decodeWsFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (high !== 0) throw new Error("WebSocket frame too large");
      length = low;
    }
    const masked = Boolean(second & 0x80);
    let mask;
    if (masked) {
      if (offset + 4 > buffer.length) break;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (offset + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (masked && mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    frames.push({ opcode, text: payload.toString("utf8") });
  }
  return frames;
}

function handleWsMessage(client, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    wsSend(client, { type: "error", error: "Invalid JSON" });
    return;
  }

  const db = ensureClassroomDb(loadDb());
  const room = ensureRoom(db, client.roomId);

  if (message.type === "ping") {
    wsSend(client, { type: "pong", servedAt: new Date().toISOString() });
    return;
  }

  if (message.type === "join") {
    const actor = message.actor || "student-linyi";
    const participant = {
      actor,
      name: message.name || actor,
      role: message.role || "navigator",
      status: "online",
      transport: "websocket",
      joinedAt: new Date().toISOString()
    };
    room.presence = room.presence.filter((item) => item.actor !== actor);
    room.presence.push(participant);
    const event = appendRoomEvent(db, room.id, {
      type: "join",
      actor,
      message: `${participant.name} joined via WebSocket`,
      payload: { role: participant.role, transport: "websocket" }
    });
    saveDb(db);
    broadcastRoom(room.id, { type: "room:update", action: "join", event, ...roomSnapshot(db, room.id) });
    return;
  }

  if (message.type === "event") {
    const event = appendRoomEvent(db, room.id, {
      type: message.eventType || "note",
      actor: message.actor || "student-linyi",
      message: message.message || "WebSocket collaboration event",
      payload: { ...(message.payload || {}), transport: "websocket" }
    });
    saveDb(db);
    broadcastRoom(room.id, { type: "room:update", action: "event", event, ...roomSnapshot(db, room.id) });
    return;
  }

  if (message.type === "turn") {
    room.turn = {
      driver: message.driver || room.turn?.navigator || "student-linyi",
      navigator: message.navigator || room.turn?.driver || "ai-turtle",
      switchedAt: new Date().toISOString()
    };
    const event = appendRoomEvent(db, room.id, {
      type: "turn",
      actor: message.actor || "student-linyi",
      message: `Driver switched to ${room.turn.driver} via WebSocket`,
      payload: { ...room.turn, transport: "websocket" }
    });
    saveDb(db);
    broadcastRoom(room.id, { type: "room:update", action: "turn", event, ...roomSnapshot(db, room.id) });
    return;
  }

  wsSend(client, { type: "error", error: `Unsupported message type: ${message.type || "missing"}` });
}

function handleUpgrade(req, socket) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const match = url.pathname.match(/^\/ws\/collab\/([^/]+)$/);
  const key = req.headers["sec-websocket-key"];
  if (!match || !key) {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const roomId = decodeURIComponent(match[1]);
  const client = { socket, roomId, id: randomUUID() };
  if (!wsRooms.has(roomId)) wsRooms.set(roomId, new Set());
  wsRooms.get(roomId).add(client);
  socket.setNoDelay(true);

  const db = ensureClassroomDb(loadDb());
  wsSend(client, { type: "snapshot", ...roomSnapshot(db, roomId) });

  socket.on("data", (chunk) => {
    try {
      for (const frame of decodeWsFrames(chunk)) {
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode === 0x1) handleWsMessage(client, frame.text);
      }
    } catch (error) {
      wsSend(client, { type: "error", error: error.message });
    }
  });

  const cleanup = () => {
    const clients = wsRooms.get(roomId);
    if (!clients) return;
    clients.delete(client);
    if (!clients.size) wsRooms.delete(roomId);
  };
  socket.on("close", cleanup);
  socket.on("end", cleanup);
  socket.on("error", cleanup);
}

function simulateRun(language, code) {
  if (language === "python") {
    const prints = [...String(code).matchAll(/print\((["'`])(.+?)\1\)/g)].map((match) => match[2]);
    return {
      status: "completed",
      stdout: prints.length ? prints.join("\n") : "Canvas 已更新：海龟轨迹生成成功",
      stderr: "",
      durationMs: 48,
      canvasCommands: ["circle", "forward", "turn"]
    };
  }
  return {
    status: "completed",
    stdout: language === "cpp" ? "gcd(24, 18)=6" : "计算思维挑战：优秀",
    stderr: "",
    durationMs: 64,
    canvasCommands: []
  };
}

function boundedRunnerTimeout(value, fallback = 2000) {
  const requested = Number(value ?? fallback);
  if (!Number.isFinite(requested)) return fallback;
  return Math.max(10, Math.min(Math.round(requested), 5000));
}

function executeSandboxRunner(payload = {}) {
  const timeoutMs = boundedRunnerTimeout(payload.runnerTimeoutMs, 2000);
  const startedAt = new Date().toISOString();
  const workspace = createSandboxWorkspace();
  const scrubbedEnv = createScrubbedEnv(process.env, workspace);
  const inputPayload = JSON.stringify({ ...payload, runnerTimeoutMs: timeoutMs, sandboxWorkspaceId: workspace.id });
  let spawned;
  let cleanedWorkspace = false;
  try {
    spawned = spawnSync(process.execPath, [sandboxRunnerPath], {
      input: inputPayload,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: OUTPUT_LIMIT_BYTES,
      windowsHide: true,
      shell: false,
      cwd: workspace.path,
      env: scrubbedEnv
    });
  } finally {
    cleanedWorkspace = cleanupSandboxWorkspace(workspace);
  }
  const isolationEvidence = {
    timeoutMs,
    startedAt,
    completedAt: new Date().toISOString(),
    envPolicy: "allowlist-scrubbed",
    envKeysAllowed: Object.keys(scrubbedEnv).sort(),
    secretEnvPresent: scrubbedEnvHasSecret(scrubbedEnv),
    stdinBytes: Buffer.byteLength(String(payload.stdin || ""), "utf8"),
    sourceBytes: Buffer.byteLength(String(payload.code || ""), "utf8"),
    inputBytes: Buffer.byteLength(inputPayload, "utf8"),
    outputLimitBytes: OUTPUT_LIMIT_BYTES,
    workspace: { id: workspace.id, created: true, cleaned: cleanedWorkspace }
  };

  if (!spawned) {
    return {
      status: "failed",
      stdout: "",
      stderr: "Sandbox runner did not start.",
      durationMs: 0,
      canvasCommands: [],
      sandbox: sandboxPolicy({
        allowed: false,
        safetyLabel: "sandbox-runner-error",
        violations: [{ id: "runner-not-started", message: "Sandbox runner did not start." }],
        maxRuntimeMs: timeoutMs
      }),
      runnerDiagnostics: runnerMetadata({ ...isolationEvidence, failed: true })
    };
  }

  if (spawned.error?.code === "ETIMEDOUT" || spawned.signal) {
    return {
      status: "timeout",
      stdout: "",
      stderr: `Sandbox runner exceeded ${timeoutMs}ms.`,
      durationMs: timeoutMs,
      canvasCommands: [],
      sandbox: sandboxPolicy({
        allowed: false,
        safetyLabel: "sandbox-timeout",
        violations: [{ id: "runner-timeout", message: `Sandbox runner exceeded ${timeoutMs}ms.` }],
        maxRuntimeMs: timeoutMs
      }),
      runnerDiagnostics: runnerMetadata({
        ...isolationEvidence,
        timedOut: true,
        exitCode: spawned.status ?? null,
        signal: spawned.signal || "SIGTERM"
      })
    };
  }

  if (spawned.error) {
    return {
      status: "failed",
      stdout: "",
      stderr: spawned.error.message,
      durationMs: 0,
      canvasCommands: [],
      sandbox: sandboxPolicy({
        allowed: false,
        safetyLabel: "sandbox-runner-error",
        violations: [{ id: "runner-spawn-error", message: spawned.error.message }],
        maxRuntimeMs: timeoutMs
      }),
      runnerDiagnostics: runnerMetadata({
        ...isolationEvidence,
        failed: true,
        exitCode: spawned.status ?? null
      })
    };
  }

  try {
    const parsed = JSON.parse(spawned.stdout || "{}");
    return {
      ...parsed,
      runnerDiagnostics: runnerMetadata({
        ...(parsed.runnerDiagnostics || {}),
        ...isolationEvidence,
        timedOut: false,
        exitCode: spawned.status ?? 0,
        stderrBytes: Buffer.byteLength(spawned.stderr || "", "utf8")
      })
    };
  } catch {
    return {
      status: "failed",
      stdout: spawned.stdout || "",
      stderr: "Sandbox runner returned invalid JSON.",
      durationMs: 0,
      canvasCommands: [],
      sandbox: sandboxPolicy({
        allowed: false,
        safetyLabel: "sandbox-runner-error",
        violations: [{ id: "runner-invalid-json", message: "Sandbox runner returned invalid JSON." }],
        maxRuntimeMs: timeoutMs
      }),
      runnerDiagnostics: runnerMetadata({
        ...isolationEvidence,
        failed: true,
        exitCode: spawned.status ?? null
      })
    };
  }
}

function createRunJob(db, payload = {}) {
  db.runJobs ||= [];
  const language = payload.language || "python";
  const code = payload.code || "";
  const createdAt = new Date().toISOString();
  const timeoutMs = boundedRunnerTimeout(payload.runnerTimeoutMs, 2000);
  const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const lifecycle = [
    { status: "created", progress: 0, at: createdAt },
    { status: "queued", progress: 25, at: createdAt }
  ];
  const runner = runnerMetadata({ timeoutMs, timedOut: false, state: "queued", workspace: { created: false, cleaned: true } });
  if (payload.startMode === "manual") {
    const job = {
      id: jobId,
      projectId: payload.projectId || "current",
      language,
      status: "queued",
      progress: 25,
      terminal: false,
      stdin: payload.stdin || "",
      result: null,
      runner,
      lifecycle,
      createdAt
    };
    db.runJobs.push(job);
    db.runJobs = db.runJobs.slice(-100);
    return job;
  }

  lifecycle.push({ status: "running", progress: 70, at: new Date().toISOString() });
  const result = executeSandboxRunner({ ...payload, language, code, runnerTimeoutMs: timeoutMs });
  const terminalStatus = ["rejected", "timeout", "failed"].includes(result.status) ? result.status : "completed";
  lifecycle.push({ status: terminalStatus, progress: 100, at: createdAt });
  const job = {
    id: jobId,
    projectId: payload.projectId || "current",
    language,
    status: terminalStatus,
    progress: 100,
    terminal: true,
    stdin: payload.stdin || "",
    result,
    runner: result.runnerDiagnostics || runnerMetadata({ timeoutMs, timedOut: false }),
    lifecycle,
    createdAt,
    completedAt: new Date().toISOString()
  };
  db.runJobs.push(job);
  db.runJobs = db.runJobs.slice(-100);
  db.runs.push({ id: `run-${Date.now()}`, jobId, ...result, language, createdAt });
  return job;
}

function cancelRunJob(db, jobId) {
  const job = (db.runJobs || []).find((item) => item.id === jobId);
  if (!job) return { status: 404, body: { error: "Run job not found" } };
  if (job.terminal) return { status: 409, body: { error: "Run job already terminal", job } };
  const canceledAt = new Date().toISOString();
  job.status = "canceled";
  job.progress = 100;
  job.terminal = true;
  job.completedAt = canceledAt;
  job.runner = runnerMetadata({ ...(job.runner || {}), canceled: true, completedAt: canceledAt, workspace: { created: false, cleaned: true } });
  job.result = {
    status: "canceled",
    stdout: "",
    stderr: "Run job canceled before sandbox execution.",
    durationMs: 0,
    canvasCommands: [],
    sandbox: {
      allowed: false,
      safetyLabel: "sandbox-canceled",
      violations: [{ id: "runner-canceled", message: "Run job canceled before sandbox execution." }],
      maxRuntimeMs: job.runner.timeoutMs || 2000,
      network: "disabled",
      filesystem: "read-only virtual workspace"
    },
    runnerDiagnostics: job.runner
  };
  job.lifecycle.push({ status: "canceled", progress: 100, at: canceledAt });
  db.runs.push({ id: `run-${Date.now()}`, jobId, ...job.result, language: job.language, createdAt: canceledAt });
  return { status: 200, body: { job, result: job.result } };
}

function tutorReply(payload) {
  const reviewer = payload.tutorRole === "reviewer";
  const contracts = loadModelContracts();
  const modelRoute = modelRouteFor({ ...payload, taskType: "coding" });
  return {
    role: reviewer ? "智伴导师" : "小龟导师",
    message: reviewer
      ? "智伴导师建议：先补一个边界测试，再说明为什么当前输出可信。"
      : "小龟导师建议：把任务拆成输入、处理、输出三步，并先写出伪代码。",
    ctTags: reviewer ? ["验证优化", "迁移"] : ["分解", "抽象", "算法"],
    safetyLabel: "ok",
    explanationSummary: "这是面向学生的可解释思路摘要，不包含模型原始隐性推理。",
    modelRoute,
    providerAdapter: providerAdapterEvidence(modelRoute, payload, contracts)
  };
}

function imageBriefReply(payload) {
  const contracts = loadModelContracts();
  const modelRoute = modelRouteFor({ ...payload, taskType: "image" });
  return {
    assetType: String(payload.assetType || "ui-asset").slice(0, 60),
    assetBrief: [
      "3D glass semi-transparent and opaque forms",
      "cartoon-friendly education tone",
      "high-contrast readable UI composition",
      "no coding-model route for image generation"
    ],
    promptSummary: redactedTextPreview(payload.prompt).slice(0, 240),
    safetyLabel: "ok",
    modelRoute,
    providerAdapter: providerAdapterEvidence(modelRoute, payload, contracts)
  };
}

function ensureClassroomDb(db) {
  db.dbMeta ||= { schemaVersion: 4, resetAt: null, resetCount: 0, recoveredFromCorruptJson: false };
  db.dbMeta.schemaVersion = Math.max(Number(db.dbMeta.schemaVersion || 0), 4);
  if (db.dbMeta.recoveredFromCorruptJson === undefined) db.dbMeta.recoveredFromCorruptJson = false;
  db.users ||= seedUsers();
  db.users = db.users.map((user) => ({
    ...user,
    status: user.status || "active",
    permissions: user.permissions || permissionsForRole(user.role),
    auth: user.auth?.passwordDigest ? user.auth : {
      provider: "demo-password",
      passwordDigest: passwordDigest(user.id, user.role === "teacher" ? "demo-teacher" : user.role === "researcher" ? "demo-research" : "demo-student"),
      passwordUpdatedAt: "2026-06-20T00:00:00.000Z"
    }
  }));
  db.sessions = (db.sessions || [])
    .filter((session) => session.tokenHash && !session.token)
    .map((session) => ({ ...session, revokedAt: session.revokedAt || null }));
  db.authEvents ||= [];
  db.aiMessages ||= [];
  db.t3EvidenceCandidates ||= [];
  db.runJobs ||= [];
  db.assignments ||= [
    {
      id: "assign-turtle-badge",
      title: "海龟徽章创作",
      brief: "用 Python turtle 画出代表小组学习精神的徽章，并用 3 句话解释分解、抽象和调试过程。",
      dueAt: "2026-06-26T09:00:00.000Z",
      ctFocus: ["分解", "抽象", "算法", "调试"],
      rubric: [
        { label: "作品能运行并生成图形", weight: 30 },
        { label: "能解释核心步骤与变量", weight: 30 },
        { label: "至少一次自检和版本保存", weight: 20 },
        { label: "同伴或 AI 建议被采纳", weight: 20 }
      ]
    }
  ];
  db.submissions ||= [
    {
      id: "sub-seed-linyi",
      assignmentId: "assign-turtle-badge",
      studentId: "student-linyi",
      studentName: "林一诺",
      projectId: "current",
      versionId: db.projects?.current?.latestVersionId || "v1",
      language: "python",
      status: "reviewed",
      score: 86,
      feedback: "图形完整，下一步请补充边界测试和同伴解释记录。",
      submittedAt: "2026-06-20T09:10:00.000Z",
      reviewedAt: "2026-06-20T09:18:00.000Z",
      selfCheck: {
        runs: 2,
        savedVersion: true,
        explanationReady: true,
        aiReviewed: true
      }
    }
  ];
  db.collabRooms ||= { "pair-demo": seedRoom(db.collabEvents || []) };
  ensureRoom(db, "pair-demo");
  return db;
}

async function handleApi(req, res, url) {
  const db = ensureClassroomDb(loadDb());

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, envelope({ status: "ready", db: repository.defaultMetadata().engine, repository: repository.defaultMetadata().engine }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/db/status") {
    json(res, 200, envelope(dbStatus(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/db/certification") {
    json(res, 200, envelope(databaseCertificationFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/certification-overview") {
    json(res, 200, envelope(deliveryCertificationOverviewFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-preflight") {
    json(res, 200, envelope(t3CertificationPreflightFor()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-certification-package") {
    json(res, 200, envelope(t3CertificationPackageFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-evidence") {
    json(res, 200, envelope(summarizeT3Evidence(db.t3EvidenceCandidates || [])));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/handoff-dossier") {
    json(res, 200, envelope(deliveryHandoffDossierFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/artifacts") {
    json(res, 200, envelope(deliveryArtifactIndexFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/agentic-qa-replay") {
    json(res, 200, envelope(agenticQaReplayDossierFor()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/visual-storyboard") {
    json(res, 200, envelope(visualQaStoryboardFor()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/objective-traceability") {
    json(res, 200, envelope(objectiveTraceabilityFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-packet") {
    json(res, 200, envelope(t3ApprovalPacketFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-dry-run-rehearsal") {
    json(res, 200, envelope(t3DryRunRehearsalFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-request-export") {
    json(res, 200, envelope(t3ApprovalRequestExportFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-integrity") {
    json(res, 200, envelope(t3ApprovalIntegrityFor()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-lock") {
    json(res, 200, envelope(t3ApprovalLockFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-verifier") {
    json(res, 200, envelope(t3ApprovalVerifierFor(db)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-approval-verifier") {
    const body = await readBody(req);
    json(res, 200, envelope(t3ApprovalVerifierFor(db, body)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-candidates") {
    json(res, 200, envelope(t3ApprovalCandidatesFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-approval-execution-gate") {
    json(res, 200, envelope(t3ApprovalExecutionGateFor(db)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-approval-execution-gate") {
    const body = await readBody(req);
    json(res, 200, envelope(t3ApprovalExecutionGateFor(db, body)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-certification-evidence-closure") {
    json(res, 200, envelope(t3CertificationEvidenceClosureFor(db)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-certification-evidence-closure") {
    const body = await readBody(req);
    json(res, 200, envelope(t3CertificationEvidenceClosureFor(db, body)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/final-readiness") {
    json(res, 200, envelope(finalDeliveryReadinessFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/release-candidate") {
    json(res, 200, envelope(deliveryReleaseCandidateFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-certification-next-actions") {
    json(res, 200, envelope(t3CertificationNextActionsFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-single-lane-run-packets") {
    json(res, 200, envelope(t3SingleLaneRunPacketsFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-run-packet-verifier") {
    json(res, 200, envelope(t3RunPacketVerifierFor(db)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-run-packet-verifier") {
    const body = await readBody(req);
    json(res, 200, envelope(t3RunPacketVerifierFor(db, body)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/reviewer-cockpit") {
    json(res, 200, envelope(deliveryReviewerCockpitFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/launch-guide") {
    json(res, 200, envelope(deliveryLaunchGuideFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/consistency-sentinel") {
    json(res, 200, envelope(deliveryConsistencySentinelFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/final-acceptance-matrix") {
    json(res, 200, envelope(finalAcceptanceMatrixFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/certification-blocker-board") {
    json(res, 200, envelope(certificationBlockerBoardFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/user-acceptance-rehearsal") {
    json(res, 200, envelope(userAcceptanceRehearsalFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/evidence-navigator") {
    json(res, 200, envelope(deliveryEvidenceNavigatorFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/local-summary-packet") {
    json(res, 200, envelope(localDeliverySummaryPacketFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/handoff-brief") {
    json(res, 200, envelope(localDeliveryHandoffBriefFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/quickstart-bundle") {
    json(res, 200, envelope(localDeliveryQuickstartBundleFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/local-verification-suite") {
    json(res, 200, envelope(localDeliveryVerificationSuiteFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/final-local-handoff-checkpoint") {
    json(res, 200, envelope(finalLocalHandoffCheckpointFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-evidence-bundle-templates") {
    json(res, 200, envelope(t3EvidenceBundleTemplatesFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-operator-checklist") {
    json(res, 200, envelope(t3OperatorChecklistFor(db)));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/delivery/t3-operator-transcript-validator") {
    json(res, 200, envelope(t3OperatorTranscriptValidatorFor(db)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-operator-transcript-validator") {
    const body = await readBody(req);
    json(res, 200, envelope(t3OperatorTranscriptValidatorFor(db, body)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/delivery/t3-evidence/intake") {
    if (req.headers["x-codex-dev-reset"] !== "allow") {
      json(res, 403, envelope({ error: "T3 evidence intake requires X-CodeX-Dev-Reset: allow" }, false));
      return true;
    }
    const body = await readBody(req);
    const result = intakeT3Evidence(body, db.t3EvidenceCandidates || []);
    if (result.stored && result.candidate) {
      db.t3EvidenceCandidates ||= [];
      db.t3EvidenceCandidates.push(result.candidate);
      saveDb(db, "t3-evidence-intake");
    }
    json(res, result.stored ? 200 : 422, envelope(result, result.stored));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/sandbox/policy") {
    json(res, 200, envelope({
      policy: sandboxPolicy(),
      runner: runnerMetadata({ workspace: { created: false, cleaned: true } })
    }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/sandbox/certification") {
    json(res, 200, envelope(sandboxCertificationReadiness(db.runJobs || [])));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/db/transaction-probe") {
    if (req.headers["x-codex-dev-reset"] !== "allow") {
      json(res, 403, envelope({ error: "Transaction probe requires X-CodeX-Dev-Reset: allow" }, false));
      return true;
    }
    const event = recordAuthEvent(db, { type: "db_transaction_probe", userId: "system", role: "system", ok: true });
    repository.transaction(db, () => db, { reason: "transaction-probe" });
    json(res, 200, envelope({ event, authEventCount: (db.authEvents || []).length, dbStatus: dbStatus(db) }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/db/rollback-probe") {
    if (req.headers["x-codex-dev-reset"] !== "allow") {
      json(res, 403, envelope({ error: "Rollback probe requires X-CodeX-Dev-Reset: allow" }, false));
      return true;
    }
    const rollback = repository.rollbackProbe();
    json(res, 200, envelope({ rollback, dbStatus: dbStatus(db) }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/dev/reset") {
    if (req.headers["x-codex-dev-reset"] !== "allow") {
      json(res, 403, envelope({ error: "Reset requires X-CodeX-Dev-Reset: allow" }, false));
      return true;
    }
    const previousResetCount = Number(db.dbMeta?.resetCount || 0);
    const seeded = createSeedDb();
    seeded.dbMeta.resetCount = previousResetCount + 1;
    seeded.dbMeta.resetAt = new Date().toISOString();
    saveDb(seeded);
    json(res, 200, envelope({ dbMeta: seeded.dbMeta, project: seeded.projects.current, room: seeded.collabRooms["pair-demo"], userCount: seeded.users.length }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const verified = verifyCredentials(db, body);
    if (!verified.ok) {
      recordAuthEvent(db, { type: "login_failure", userId: verified.userId, role: verified.role, ok: false, reason: verified.reason });
      saveDb(db);
      json(res, 401, envelope({ error: "Invalid credentials", reason: verified.reason }, false));
      return true;
    }
    const { rawToken, session } = issueSession(db, verified.user, verified.assurance);
    saveDb(db);
    json(res, 200, envelope({
      sessionToken: rawToken,
      user: publicUser(verified.user),
      expiresInMinutes: 120,
      assurance: verified.assurance,
      session: { ...session, revoked: Boolean(session.revokedAt) }
    }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const session = currentSession(req, db);
    if (!session) {
      json(res, 401, envelope({ error: "Session invalid or expired" }, false));
      return true;
    }
    json(res, 200, envelope({
      user: publicUser(session.user),
      session: {
        tokenHash: session.tokenHash,
        userId: session.userId,
        role: session.role,
        assurance: session.assurance,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revoked: false
      },
      permissions: session.permissions
    }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const session = currentSession(req, db);
    if (!session) {
      json(res, 401, envelope({ error: "Session invalid or expired" }, false));
      return true;
    }
    const stored = db.sessions.find((item) => item.tokenHash === session.tokenHash);
    stored.revokedAt = new Date().toISOString();
    recordAuthEvent(db, { type: "logout", userId: session.userId, role: session.role, ok: true, sessionHash: session.tokenHash });
    saveDb(db);
    json(res, 200, envelope({ revoked: true, session: { ...stored, revoked: true }, user: publicUser(session.user) }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/audit") {
    const events = (db.authEvents || []).slice(-50);
    json(res, 200, envelope({ events, totals: authEventTotals(db.authEvents || []) }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/model-contracts") {
    json(res, 200, envelope(publicModelContracts()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/provider/status") {
    json(res, 200, envelope(providerStatus()));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/provider/certification") {
    json(res, 200, envelope(providerCertificationReadiness(loadModelContracts(), db.aiMessages || [])));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/provider/probe") {
    const body = await readBody(req);
    json(res, 200, envelope(providerProbe(body)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/provider/live-plan") {
    const body = await readBody(req);
    json(res, 200, envelope(providerLivePlanFor(body, req.headers)));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/provider/live-call") {
    const body = await readBody(req);
    const plan = providerLivePlanFor(body, req.headers);
    const aiMessage = {
      id: `ai-live-${Date.now()}`,
      request: sanitizedAiRequest(body),
      reply: { modelRoute: plan.modelRoute, providerAdapter: { status: providerStatus(), request: plan.providerRequest }, liveGuard: plan.guard },
      createdAt: new Date().toISOString()
    };
    if (!plan.guard.allowed) {
      db.aiMessages.push(aiMessage);
      saveDb(db);
      json(res, 409, envelope({ error: "Live provider call blocked by guardrails", plan }, false));
      return true;
    }
    const liveTransport = await executeProviderTransport(plan, body, loadModelContracts());
    aiMessage.reply.liveTransport = liveTransport;
    aiMessage.reply.providerAdapter = { status: providerStatus(), request: liveTransport.request || plan.providerRequest };
    db.aiMessages.push(aiMessage);
    saveDb(db);
    json(res, liveTransport.ok ? 200 : 502, envelope({ plan, liveTransport }, liveTransport.ok));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    json(res, 200, envelope({
      project: db.projects.current,
      versions: db.versions,
      teacher: db.teacher,
      assignment: db.assignments[0],
      submissions: db.submissions.slice(-12),
      collabRoom: ensureRoom(db, "pair-demo"),
      dbMeta: db.dbMeta,
      auth: {
        users: db.users.map(publicUser),
        activeSessionCount: activeSessionCount(db),
        authEventCount: (db.authEvents || []).length
      },
      collabEvents: db.collabEvents.slice(-10)
    }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/classrooms/demo/assignments/current") {
    json(res, 200, envelope({ assignment: db.assignments[0], submissions: db.submissions.slice(-12) }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/projects/current/versions") {
    const body = await readBody(req);
    const version = {
      id: `v-${Date.now()}`,
      projectId: "current",
      label: body.label || "云端保存",
      language: body.language,
      savedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      code: body.code || ""
    };
    db.versions.push(version);
    db.projects.current.latestVersionId = version.id;
    db.projects.current.language = version.language;
    saveDb(db);
    json(res, 200, envelope({ version, versions: db.versions }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readBody(req);
    const job = createRunJob(db, body);
    saveDb(db);
    json(res, 200, envelope({
      ...job.result,
      jobId: job.id,
      jobStatus: job.status,
      jobProgress: job.progress,
      terminal: job.terminal,
      lifecycle: job.lifecycle,
      runner: job.runner
    }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/run/jobs") {
    const body = await readBody(req);
    const job = createRunJob(db, body);
    saveDb(db);
    json(res, 200, envelope({ job, result: job.result }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/run/jobs") {
    const jobs = (db.runJobs || []).slice(-20);
    json(res, 200, envelope({ jobs, terminalCount: jobs.filter((job) => job.terminal).length }));
    return true;
  }

  const runJobCancelMatch = url.pathname.match(/^\/api\/run\/jobs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && runJobCancelMatch) {
    const canceled = cancelRunJob(db, runJobCancelMatch[1]);
    if (canceled.status === 200) saveDb(db);
    json(res, canceled.status, envelope(canceled.body, canceled.status < 400));
    return true;
  }

  const runJobMatch = url.pathname.match(/^\/api\/run\/jobs\/([^/]+)$/);
  if (req.method === "GET" && runJobMatch) {
    const job = (db.runJobs || []).find((item) => item.id === runJobMatch[1]);
    if (!job) {
      json(res, 404, envelope({ error: "Run job not found" }, false));
      return true;
    }
    json(res, 200, envelope({ job, result: job.result }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/tutor/message") {
    const body = await readBody(req);
    const reply = tutorReply(body);
    db.aiMessages.push({ id: `ai-${Date.now()}`, request: sanitizedAiRequest(body), reply, createdAt: new Date().toISOString() });
    saveDb(db);
    json(res, 200, envelope(reply));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/image/brief") {
    const body = await readBody(req);
    const reply = imageBriefReply(body);
    db.aiMessages.push({ id: `ai-image-${Date.now()}`, request: sanitizedAiRequest({ ...body, taskType: "image" }), reply, createdAt: new Date().toISOString() });
    saveDb(db);
    json(res, 200, envelope(reply));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/route-audit") {
    const routes = db.aiMessages
      .map((item) => item.reply?.modelRoute)
      .filter(Boolean)
      .slice(-20);
    const providerAdapters = db.aiMessages
      .map((item) => item.reply?.providerAdapter)
      .filter(Boolean)
      .slice(-20);
    const liveTransports = db.aiMessages
      .map((item) => item.reply?.liveTransport)
      .filter(Boolean)
      .slice(-20);
    json(res, 200, envelope({
      routes,
      totals: routeAuditTotals(routes),
      providerStatus: providerStatus(),
      providerEvidenceCount: providerAdapters.length,
      providerAdapters,
      liveTransportCount: liveTransports.length,
      liveTransports
    }));
    return true;
  }

  const roomMatch = url.pathname.match(/^\/api\/collab\/rooms\/([^/]+)$/);
  if (req.method === "GET" && roomMatch) {
    const room = ensureRoom(db, roomMatch[1]);
    json(res, 200, envelope({ room, replay: room.events.slice(-20), presence: room.presence }));
    return true;
  }

  const roomJoinMatch = url.pathname.match(/^\/api\/collab\/rooms\/([^/]+)\/join$/);
  if (req.method === "POST" && roomJoinMatch) {
    const session = requireRole(req, res, db, ["student", "teacher"]);
    if (!session) return true;
    const body = await readBody(req);
    const room = ensureRoom(db, roomJoinMatch[1]);
    const actor = body.actor || session.id;
    const participant = {
      actor,
      name: body.name || session.name,
      role: body.role || (session.role === "teacher" ? "coach" : "navigator"),
      status: "online",
      joinedAt: new Date().toISOString()
    };
    room.presence = room.presence.filter((item) => item.actor !== actor);
    room.presence.push(participant);
    const event = appendRoomEvent(db, room.id, {
      type: "join",
      actor,
      message: `${participant.name} 加入协作房间`,
      payload: { role: participant.role }
    });
    saveDb(db);
    json(res, 200, envelope({ room, event, presence: room.presence, replay: room.events.slice(-20) }));
    return true;
  }

  const roomEventMatch = url.pathname.match(/^\/api\/collab\/rooms\/([^/]+)\/events$/);
  if (req.method === "POST" && roomEventMatch) {
    const session = requireRole(req, res, db, ["student", "teacher"]);
    if (!session) return true;
    const body = await readBody(req);
    const event = appendRoomEvent(db, roomEventMatch[1], {
      type: body.type || "note",
      actor: body.actor || session.id,
      message: body.message || "协作事件",
      payload: body.payload || {}
    });
    saveDb(db);
    const room = ensureRoom(db, roomEventMatch[1]);
    json(res, 200, envelope({ event, room, replay: room.events.slice(-20), presence: room.presence }));
    return true;
  }

  const roomTurnMatch = url.pathname.match(/^\/api\/collab\/rooms\/([^/]+)\/turn$/);
  if (req.method === "POST" && roomTurnMatch) {
    const session = requireRole(req, res, db, ["student", "teacher"]);
    if (!session) return true;
    const body = await readBody(req);
    const room = ensureRoom(db, roomTurnMatch[1]);
    room.turn = {
      driver: body.driver || room.turn?.navigator || session.id,
      navigator: body.navigator || room.turn?.driver || "ai-turtle",
      switchedAt: new Date().toISOString()
    };
    const event = appendRoomEvent(db, room.id, {
      type: "turn",
      actor: session.id,
      message: `Driver 切换为 ${room.turn.driver}`,
      payload: room.turn
    });
    saveDb(db);
    json(res, 200, envelope({ room, event, replay: room.events.slice(-20), presence: room.presence }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/collab/events") {
    const body = await readBody(req);
    const event = {
      id: `evt-${Date.now()}`,
      sessionId: body.sessionId || "pair-demo",
      actor: body.actor || "system",
      type: body.type || "note",
      message: body.message || "协作事件",
      createdAt: new Date().toISOString()
    };
    db.collabEvents.push(event);
    saveDb(db);
    json(res, 200, envelope({ event, events: db.collabEvents.slice(-10) }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/submissions") {
    const session = requireRole(req, res, db, ["student"]);
    if (!session) return true;
    const body = await readBody(req);
    const latestVersion = db.versions[db.versions.length - 1];
    const submission = {
      id: `sub-${Date.now()}`,
      assignmentId: body.assignmentId || db.assignments[0].id,
      studentId: body.studentId || "student-linyi",
      studentName: body.studentName || "林一诺",
      projectId: body.projectId || "current",
      versionId: body.versionId || latestVersion?.id || "v1",
      language: body.language || db.projects.current.language,
      status: "submitted",
      score: null,
      feedback: "等待教师批阅",
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      selfCheck: {
        runs: Number(body.selfCheck?.runs || 1),
        savedVersion: Boolean(body.selfCheck?.savedVersion),
        explanationReady: Boolean(body.selfCheck?.explanationReady),
        aiReviewed: Boolean(body.selfCheck?.aiReviewed)
      }
    };
    db.submissions.push(submission);
    db.teacher.interventionNeeded = db.submissions.filter((item) => item.status === "submitted").length;
    db.collabEvents.push({
      id: `evt-${Date.now()}`,
      sessionId: "pair-demo",
      actor: submission.studentId,
      type: "submission",
      message: `${submission.studentName} 提交了《${db.assignments[0].title}》`,
      createdAt: submission.submittedAt
    });
    saveDb(db);
    json(res, 200, envelope({ submission, submissions: db.submissions.slice(-12) }));
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/teacher\/submissions\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    const session = requireRole(req, res, db, ["teacher"]);
    if (!session) return true;
    const body = await readBody(req);
    const submission = db.submissions.find((item) => item.id === reviewMatch[1]);
    if (!submission) {
      json(res, 404, envelope({ error: "Submission not found" }, false));
      return true;
    }
    submission.status = body.status || "reviewed";
    submission.score = Number(body.score ?? submission.score ?? 88);
    submission.feedback = body.feedback || "已完成批阅：请继续说明算法选择与调试证据。";
    submission.reviewedAt = new Date().toISOString();
    db.teacher.interventionNeeded = db.submissions.filter((item) => item.status === "submitted").length;
    saveDb(db);
    json(res, 200, envelope({ submission, submissions: db.submissions.slice(-12) }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/teacher/classes/demo/dashboard") {
    json(res, 200, envelope({
      ...db.teacher,
      assignment: db.assignments[0],
      submissions: db.submissions.slice(-12),
      runJobs: (db.runJobs || []).slice(-10),
      aiLogs: db.aiMessages.slice(-10).map((item) => ({
        student: "林一诺",
        tutor: item.reply.role || item.reply.assetType || "AI视觉资产",
        tag: (item.reply.ctTags || [item.reply.modelRoute?.path || "route"]).join(" / "),
        message: item.reply.message || item.reply.promptSummary || "AI route audit",
        route: item.reply.modelRoute,
        risk: item.reply.modelRoute?.fallbackUsed ? "mid" : "low"
      }))
    }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/reports/export") {
    const dbCertification = databaseCertificationFor(db);
    const sandboxCertification = sandboxCertificationReadiness(db.runJobs || []);
    const providerCertification = providerCertificationReadiness(loadModelContracts(), db.aiMessages || []);
    const completionAuditData = loadCompletionAudit(completionAuditPath);
    const agenticAuditData = loadJsonFile(agenticAuditPath, {});
    const deliveryOverview = certificationOverview({
      databaseCertification: dbCertification,
      sandboxCertification,
      providerCertification,
      completionAudit: completionAuditData
    });
    const t3Preflight = t3CertificationPreflightFor();
    const t3Package = t3CertificationPackage({
      preflight: t3Preflight,
      overview: deliveryOverview
    });
    const t3Evidence = summarizeT3Evidence(db.t3EvidenceCandidates || []);
    const handoffDossier = deliveryHandoffDossier({
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      overview: deliveryOverview,
      t3Package,
      t3Evidence,
      modelContracts: loadModelContracts()
    });
    const deliveryArtifacts = deliveryArtifactIndex({ dossier: handoffDossier });
    const agenticReplay = agenticQaReplayDossier();
    const visualStoryboard = visualQaStoryboard();
    const traceability = objectiveTraceability({
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      dossier: handoffDossier,
      artifactIndex: deliveryArtifacts
    });
    const t3Approval = t3ApprovalPacket({ t3Package, traceability });
    const t3DryRun = t3DryRunRehearsal({ approvalPacket: t3Approval });
    const t3ApprovalRequest = buildT3ApprovalRequestExport({ approvalPacket: t3Approval, rehearsal: t3DryRun });
    const t3Integrity = t3ApprovalIntegrity();
    const t3Lock = t3ApprovalLock({
      approvalRequest: t3ApprovalRequest,
      integrity: t3Integrity,
      completionAudit: completionAuditData
    });
    const t3Verifier = t3ApprovalVerifier({ lock: t3Lock });
    const t3Candidates = t3ApprovalCandidates({ lock: t3Lock });
    const t3ExecutionGate = t3ApprovalExecutionGate({ lock: t3Lock, candidates: t3Candidates });
    const t3EvidenceClosure = t3CertificationEvidenceClosure({ executionGate: t3ExecutionGate });
    const t3EvidenceTemplates = t3EvidenceBundleTemplates({ executionGate: t3ExecutionGate });
    const finalReadiness = finalDeliveryReadiness({
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      overview: deliveryOverview,
      t3Package,
      t3Evidence,
      modelContracts: loadModelContracts(),
      dossier: handoffDossier,
      artifactIndex: deliveryArtifacts,
      traceability,
      evidenceClosure: t3EvidenceClosure
    });
    const releaseCandidate = deliveryReleaseCandidate({
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      finalReadiness,
      agenticReplay,
      visualStoryboard,
      dossier: handoffDossier,
      artifactIndex: deliveryArtifacts,
      traceability
    });
    const t3Operator = t3OperatorChecklist({
      finalReadiness,
      candidates: t3Candidates,
      executionGate: t3ExecutionGate,
      templates: t3EvidenceTemplates
    });
    const t3NextActions = t3CertificationNextActions({
      releaseCandidate,
      executionGate: t3ExecutionGate,
      templates: t3EvidenceTemplates,
      checklist: t3Operator
    });
    const t3RunPackets = t3SingleLaneRunPackets({
      nextActions: t3NextActions,
      executionGate: t3ExecutionGate,
      templates: t3EvidenceTemplates,
      checklist: t3Operator
    });
    const t3RunVerifier = t3RunPacketVerifier({
      runPacketBundle: t3RunPackets
    });
    const deliveryReviewer = deliveryReviewerCockpit({
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      modelContracts: loadModelContracts(),
      dossier: handoffDossier,
      artifactIndex: deliveryArtifacts,
      traceability,
      agenticReplay,
      visualStoryboard,
      finalReadiness,
      releaseCandidate,
      runPacketBundle: t3RunPackets,
      runPacketVerifier: t3RunVerifier
    });
    const deliveryLaunch = deliveryLaunchGuide({
      reviewerCockpit: deliveryReviewer,
      releaseCandidate,
      finalReadiness
    });
    const deliveryConsistency = deliveryConsistencySentinel({
      launchGuide: deliveryLaunch,
      reviewerCockpit: deliveryReviewer,
      releaseCandidate,
      finalReadiness,
      artifactIndex: deliveryArtifacts,
      traceability,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const finalAcceptance = finalAcceptanceMatrix({
      consistencySentinel: deliveryConsistency,
      launchGuide: deliveryLaunch,
      reviewerCockpit: deliveryReviewer,
      releaseCandidate,
      finalReadiness,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const certificationBlockers = certificationBlockerBoard({
      finalAcceptance,
      runPackets: t3RunPackets,
      runPacketVerifier: t3RunVerifier,
      evidenceTemplates: t3EvidenceTemplates,
      operatorChecklist: t3Operator,
      nextActions: t3NextActions,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const userAcceptance = userAcceptanceRehearsal({
      finalAcceptance,
      blockerBoard: certificationBlockers,
      consistencySentinel: deliveryConsistency,
      launchGuide: deliveryLaunch,
      reviewerCockpit: deliveryReviewer,
      visualStoryboard,
      agenticReplay,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const evidenceNavigator = deliveryEvidenceNavigator({
      userAcceptance,
      artifactIndex: deliveryArtifacts,
      blockerBoard: certificationBlockers,
      visualStoryboard,
      agenticReplay,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const localSummary = localDeliverySummaryPacket({
      evidenceNavigator,
      userAcceptance,
      blockerBoard: certificationBlockers,
      finalAcceptance,
      consistencySentinel: deliveryConsistency,
      visualStoryboard,
      agenticReplay,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const handoffBrief = localDeliveryHandoffBrief({
      localSummary,
      evidenceNavigator,
      userAcceptance,
      launchGuide: deliveryLaunch,
      reviewerCockpit: deliveryReviewer,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const quickstartBundle = localDeliveryQuickstartBundle({
      handoffBrief,
      localSummary,
      evidenceNavigator,
      launchGuide: deliveryLaunch,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData
    });
    const verificationSuite = localDeliveryVerificationSuite({
      quickstartBundle,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      packageManifest: loadJsonFile("package.json", {})
    });
    const finalHandoffCheckpoint = finalLocalHandoffCheckpoint({
      verificationSuite,
      completionAudit: completionAuditData,
      agenticAudit: agenticAuditData,
      packageManifest: loadJsonFile("package.json", {})
    });
    const t3OperatorTranscript = t3OperatorTranscriptValidator({
      checklist: t3Operator
    });
    const report = {
      className: db.teacher.className,
      generatedAt: new Date().toISOString(),
      dimensions: Object.keys(db.teacher.ctDimensions),
      projects: db.teacher.projects,
      aiMessageCount: db.aiMessages.length,
      runCount: db.runs.length,
      collabEventCount: db.collabEvents.length,
      collabRoomCount: Object.keys(db.collabRooms || {}).length,
      assignmentCount: db.assignments.length,
      submissionCount: db.submissions.length,
      reviewedSubmissionCount: db.submissions.filter((item) => item.status === "reviewed").length,
      userCount: (db.users || []).length,
      activeSessionCount: activeSessionCount(db),
      revokedSessionCount: revokedSessionCount(db),
      authEventCount: (db.authEvents || []).length,
      authFailureCount: (db.authEvents || []).filter((event) => event.ok === false).length,
      repositoryEngine: db.dbMeta?.repository?.engine || "json-repository-v1",
      repositoryAdapter: db.dbMeta?.repository?.adapter || "json-file",
      repositoryTransactionalWrites: Boolean(db.dbMeta?.repository?.transactionalWrites),
      repositoryMigrationsApplied: db.dbMeta?.repository?.migrationsApplied || [],
      repositoryRollbackSupported: Boolean(db.dbMeta?.repository?.rollbackSupported),
      repositoryExternalReady: Boolean(db.dbMeta?.repository?.externalReady),
      repositoryWriteCount: Number(db.dbMeta?.repository?.writeCount || 0),
      repositoryBackupPath: db.dbMeta?.repository?.backupPath || "data/backups/mock-db.latest.json",
      repositoryBackupExists: repository.status(db).backup.exists,
      databaseCertificationStatus: dbCertification.status,
      databaseCertified: dbCertification.certified,
      databaseLocallyReadyForCertification: dbCertification.locallyReady,
      databaseMissingCertificationControlCount: dbCertification.missingCertificationControls.length,
      databaseCertificationEvidenceCounts: dbCertification.evidenceCounts,
      runJobCount: (db.runJobs || []).length,
      terminalRunJobCount: (db.runJobs || []).filter((job) => job.terminal).length,
      rejectedRunJobCount: (db.runJobs || []).filter((job) => job.status === "rejected").length,
      timeoutRunJobCount: (db.runJobs || []).filter((job) => job.status === "timeout").length,
      canceledRunJobCount: (db.runJobs || []).filter((job) => job.status === "canceled").length,
      runnerBoundaryCount: (db.runJobs || []).filter((job) => String(job.runner?.engine || "").startsWith("sandbox-runner")).length,
      sandboxIsolationCount: (db.runJobs || []).filter((job) => job.runner?.engine === "sandbox-runner-v2" && job.runner?.envPolicy === "allowlist-scrubbed" && job.runner?.secretEnvPresent === false).length,
      sandboxEscapeBlockedCount: (db.runJobs || []).filter((job) => (job.result?.sandbox?.violations || []).some((violation) => ["python-os", "python-subprocess", "python-network", "python-eval", "path-traversal", "c-system"].includes(violation.id))).length,
      sandboxCertificationStatus: sandboxCertification.status,
      sandboxCertified: sandboxCertification.certified,
      sandboxLocallyReadyForCertification: sandboxCertification.locallyReady,
      sandboxMissingCertificationControlCount: sandboxCertification.missingCertificationControls.length,
      sandboxCertificationEvidenceCounts: sandboxCertification.evidenceCounts,
      modelRouteCount: db.aiMessages.filter((item) => item.reply?.modelRoute).length,
      fallbackRouteCount: db.aiMessages.filter((item) => item.reply?.modelRoute?.fallbackUsed).length,
      imageRouteCount: db.aiMessages.filter((item) => item.reply?.modelRoute?.path === "image").length,
      providerMode: providerStatus().mode,
      providerConfigured: providerStatus().configured,
      providerLiveEnabled: providerStatus().liveEnabled,
      providerEvidenceCount: db.aiMessages.filter((item) => item.reply?.providerAdapter).length,
      providerLiveGuardCount: db.aiMessages.filter((item) => item.reply?.liveGuard).length,
      providerLiveBlockedCount: db.aiMessages.filter((item) => item.reply?.liveGuard && !item.reply.liveGuard.allowed).length,
      providerOutboundCallCount: db.aiMessages.filter((item) => item.reply?.liveTransport?.outboundCall).length,
      providerTransportFailureCount: db.aiMessages.filter((item) => item.reply?.liveTransport && !item.reply.liveTransport.ok).length,
      providerCertificationStatus: providerCertification.status,
      providerCertified: providerCertification.certified,
      providerLocallyReadyForCertification: providerCertification.locallyReady,
      providerMissingCertificationControlCount: providerCertification.missingCertificationControls.length,
      providerCertificationEvidenceCounts: providerCertification.evidenceCounts,
      deliveryOverviewStatus: deliveryOverview.status,
      deliveryFinalGoalComplete: deliveryOverview.finalGoalComplete,
      deliveryLocalEvidencePassed: deliveryOverview.localEvidencePassed,
      deliveryOpenCertificationGapCount: deliveryOverview.openCertificationGaps.length,
      deliveryReadinessSurfaceCount: deliveryOverview.readinessSurfaces.length,
      t3PreflightStatus: t3Preflight.status,
      t3PreflightApprovedPhaseReady: t3Preflight.approvedPhaseReady,
      t3PreflightLaneCount: t3Preflight.lanes.length,
      t3PreflightReadyLaneCount: t3Preflight.lanes.filter((lane) => lane.ready).length,
      t3PreflightGlobalBlockerCount: t3Preflight.globalBlockers.length,
      t3PackageStatus: t3Package.status,
      t3PackageExecutionAllowed: t3Package.executionAllowed,
      t3PackageLaneCount: t3Package.packageSummary.laneCount,
      t3PackageBlockedLaneCount: t3Package.packageSummary.blockedLaneCount,
      t3PackageRollbackPlanCount: t3Package.packageSummary.rollbackPlanCount,
      t3PackageEvidenceRequirementCount: t3Package.packageSummary.evidenceRequirementCount,
      t3EvidenceStatus: t3Evidence.status,
      t3EvidenceCandidateCount: t3Evidence.candidateCount,
      t3EvidenceAcceptedCandidateCount: t3Evidence.acceptedCandidateCount,
      t3EvidenceCertificationStateChanged: t3Evidence.certificationStateChanged,
      handoffDossierStatus: handoffDossier.status,
      handoffDossierFinalGoalComplete: handoffDossier.finalGoalComplete,
      handoffDossierArtifactCount: handoffDossier.artifactCount,
      handoffDossierOpenGapCount: handoffDossier.openCertificationGapCount,
      handoffDossierLocalRequirementCount: handoffDossier.localRequirementCount,
      handoffDossierAgenticProvedCheckCount: handoffDossier.agenticQa.provedCheckCount,
      handoffDossierT3EvidenceCandidateCount: handoffDossier.t3Evidence.candidateCount,
      deliveryArtifactIndexStatus: deliveryArtifacts.status,
      deliveryArtifactIndexArtifactCount: deliveryArtifacts.artifactCount,
      deliveryArtifactIndexReadyArtifactCount: deliveryArtifacts.readyArtifactCount,
      deliveryArtifactIndexMissingArtifactCount: deliveryArtifacts.missingArtifactCount,
      deliveryArtifactIndexHashCount: deliveryArtifacts.hashCount,
      deliveryArtifactIndexContentReturned: deliveryArtifacts.contentReturned,
      deliveryArtifactIndexFinalGoalComplete: deliveryArtifacts.finalGoalComplete,
      agenticQaReplayStatus: agenticReplay.status,
      agenticQaReplayOnly: agenticReplay.replayOnly,
      agenticQaReplayAgentCount: agenticReplay.agentCount,
      agenticQaReplayClickRoundCount: agenticReplay.clickRoundCount,
      agenticQaReplayProvedCheckCount: agenticReplay.provedCheckCount,
      agenticQaReplayOpenProductGapCount: agenticReplay.openProductGapCount,
      agenticQaReplayFinalValueWaitsPassed: agenticReplay.finalValueWaitsPassed,
      agenticQaReplayScreenshotHashCount: agenticReplay.screenshotHashCount,
      agenticQaReplayHash: agenticReplay.replayHash,
      agenticQaReplayFinalGoalComplete: agenticReplay.finalGoalComplete,
      visualStoryboardStatus: visualStoryboard.status,
      visualStoryboardOnly: visualStoryboard.storyboardOnly,
      visualStoryboardSurfaceCount: visualStoryboard.surfaceCount,
      visualStoryboardReadySurfaceCount: visualStoryboard.readySurfaceCount,
      visualStoryboardReplayRoundCount: visualStoryboard.replayRoundCount,
      visualStoryboardScreenshotHashCount: visualStoryboard.screenshotHashCount,
      visualStoryboardChecksPassed: visualStoryboard.visualChecksPassed,
      visualStoryboardHash: visualStoryboard.storyboardHash,
      visualStoryboardFinalGoalComplete: visualStoryboard.finalGoalComplete,
      objectiveTraceabilityStatus: traceability.status,
      objectiveTraceabilityRequirementCount: traceability.requirementCount,
      objectiveTraceabilityProvedRequirementCount: traceability.provedRequirementCount,
      objectiveTraceabilityOpenRequirementCount: traceability.openRequirementCount,
      objectiveTraceabilityBlockedRequirementCount: traceability.blockedRequirementCount,
      objectiveTraceabilityFinalGoalComplete: traceability.finalGoalComplete,
      t3ApprovalPacketStatus: t3Approval.status,
      t3ApprovalPacketExecutionAllowed: t3Approval.executionAllowed,
      t3ApprovalPacketLaneCount: t3Approval.laneCount,
      t3ApprovalPacketApprovedLaneCount: t3Approval.approvedLaneCount,
      t3ApprovalPacketBlockedLaneCount: t3Approval.blockedLaneCount,
      t3ApprovalPacketEvidenceRequirementCount: t3Approval.evidenceRequirementCount,
      t3ApprovalPacketRollbackStepCount: t3Approval.rollbackStepCount,
      t3ApprovalPacketFinalGoalComplete: t3Approval.finalGoalComplete,
      t3DryRunRehearsalStatus: t3DryRun.status,
      t3DryRunRehearsalOnly: t3DryRun.rehearsalOnly,
      t3DryRunExternalActionsExecuted: t3DryRun.externalActionsExecuted,
      t3DryRunCertificationStateChanged: t3DryRun.certificationStateChanged,
      t3DryRunExecutionAllowed: t3DryRun.executionAllowed,
      t3DryRunLaneCount: t3DryRun.laneCount,
      t3DryRunReadyLaneCount: t3DryRun.readyLaneCount,
      t3DryRunBlockedLaneCount: t3DryRun.blockedLaneCount,
      t3DryRunCheckCount: t3DryRun.dryRunCheckCount,
      t3DryRunFailedCheckCount: t3DryRun.failedDryRunCheckCount,
      t3DryRunFinalGoalComplete: t3DryRun.finalGoalComplete,
      t3ApprovalRequestExportStatus: t3ApprovalRequest.status,
      t3ApprovalRequestExportOnly: t3ApprovalRequest.exportOnly,
      t3ApprovalRequestExternalActionsExecuted: t3ApprovalRequest.externalActionsExecuted,
      t3ApprovalRequestCertificationStateChanged: t3ApprovalRequest.certificationStateChanged,
      t3ApprovalRequestExecutionAllowed: t3ApprovalRequest.executionAllowed,
      t3ApprovalRequestCount: t3ApprovalRequest.approvalRequestCount,
      t3ApprovalRequestReadyCount: t3ApprovalRequest.requestReadyCount,
      t3ApprovalRequestFinalGoalComplete: t3ApprovalRequest.finalGoalComplete,
      t3ApprovalIntegrityStatus: t3Integrity.status,
      t3ApprovalIntegrityHashOnly: t3Integrity.hashOnly,
      t3ApprovalIntegrityContentReturned: t3Integrity.contentReturned,
      t3ApprovalIntegrityArtifactCount: t3Integrity.artifactCount,
      t3ApprovalIntegrityReadyArtifactCount: t3Integrity.readyArtifactCount,
      t3ApprovalIntegrityMissingArtifactCount: t3Integrity.missingArtifactCount,
      t3ApprovalIntegrityHashCount: t3Integrity.hashCount,
      t3ApprovalIntegritySecretExposure: t3Integrity.secretExposure,
      t3ApprovalIntegrityBundleHash: t3Integrity.integrityBundleHash,
      t3ApprovalIntegrityFinalGoalComplete: t3Integrity.finalGoalComplete,
      t3ApprovalLockStatus: t3Lock.status,
      t3ApprovalLockOnly: t3Lock.lockOnly,
      t3ApprovalLockApproved: t3Lock.approved,
      t3ApprovalLockExecutionAllowed: t3Lock.executionAllowed,
      t3ApprovalLockLaneCount: t3Lock.laneLockCount,
      t3ApprovalLockOpenGapCount: t3Lock.openCertificationGapCount,
      t3ApprovalLockHash: t3Lock.approvalLockHash,
      t3ApprovalLockFinalGoalComplete: t3Lock.finalGoalComplete,
      t3ApprovalVerifierStatus: t3Verifier.status,
      t3ApprovalVerifierOnly: t3Verifier.verifierOnly,
      t3ApprovalVerifierPassed: t3Verifier.verificationPassed,
      t3ApprovalVerifierExecutionAllowed: t3Verifier.executionAllowed,
      t3ApprovalVerifierLaneCount: t3Verifier.laneVerificationCount,
      t3ApprovalVerifierReadyLaneCount: t3Verifier.readyLaneVerificationCount,
      t3ApprovalVerifierFinalGoalComplete: t3Verifier.finalGoalComplete,
      t3ApprovalCandidatesStatus: t3Candidates.status,
      t3ApprovalCandidatesOnly: t3Candidates.candidateOnly,
      t3ApprovalCandidateCount: t3Candidates.candidateCount,
      t3ApprovalCandidateVerifierPassCount: t3Candidates.verifierPassCount,
      t3ApprovalCandidatesExecutionAllowed: t3Candidates.executionAllowed,
      t3ApprovalCandidatesHash: t3Candidates.candidateBundleHash,
      t3ApprovalCandidatesFinalGoalComplete: t3Candidates.finalGoalComplete,
      t3ApprovalExecutionGateStatus: t3ExecutionGate.status,
      t3ApprovalExecutionGateOnly: t3ExecutionGate.gateOnly,
      t3ApprovalExecutionGateLaneCount: t3ExecutionGate.laneGateCount,
      t3ApprovalExecutionGateReadyLaneCount: t3ExecutionGate.readyLaneGateCount,
      t3ApprovalExecutionGateBoundCandidateCount: t3ExecutionGate.boundCandidateCount,
      t3ApprovalExecutionGateExecutionAllowed: t3ExecutionGate.executionAllowed,
      t3ApprovalExecutionGateHash: t3ExecutionGate.executionGateHash,
      t3ApprovalExecutionGateFinalGoalComplete: t3ExecutionGate.finalGoalComplete,
      t3CertificationEvidenceClosureStatus: t3EvidenceClosure.status,
      t3CertificationEvidenceClosureOnly: t3EvidenceClosure.closureOnly,
      t3CertificationEvidenceClosureLaneCount: t3EvidenceClosure.laneClosureCount,
      t3CertificationEvidenceClosureReadyLaneCount: t3EvidenceClosure.readyLaneClosureCount,
      t3CertificationEvidenceClosureSubmittedBundleCount: t3EvidenceClosure.submittedEvidenceBundleCount,
      t3CertificationEvidenceClosureValidatedBundleCount: t3EvidenceClosure.validatedEvidenceBundleCount,
      t3CertificationEvidenceClosureExecutionAllowed: t3EvidenceClosure.executionAllowed,
      t3CertificationEvidenceClosureHash: t3EvidenceClosure.closureHash,
      t3CertificationEvidenceClosureFinalGoalComplete: t3EvidenceClosure.finalGoalComplete,
      finalDeliveryReadinessStatus: finalReadiness.status,
      finalDeliveryReadinessLocalEvidencePassed: finalReadiness.localEvidencePassed,
      finalDeliveryReadinessArtifactIntegrityPassed: finalReadiness.artifactIntegrityPassed,
      finalDeliveryReadinessObjectiveTraceable: finalReadiness.objectiveTraceable,
      finalDeliveryReadinessAgenticPassed: finalReadiness.agenticPassed,
      finalDeliveryReadinessOpenT3GapCount: finalReadiness.openT3GapCount,
      finalDeliveryReadinessBlockedByT3: finalReadiness.blockedByT3,
      finalDeliveryReadinessHash: finalReadiness.readinessHash,
      finalDeliveryReadinessFinalGoalComplete: finalReadiness.finalGoalComplete,
      releaseCandidateStatus: releaseCandidate.status,
      releaseCandidateOnly: releaseCandidate.releaseCandidateOnly,
      releaseCandidateReadyForHumanReview: releaseCandidate.readyForHumanReview,
      releaseCandidateReadyForProductionRelease: releaseCandidate.readyForProductionRelease,
      releaseCandidateLocalEvidenceReady: releaseCandidate.localEvidenceReady,
      releaseCandidateOpenT3GapCount: releaseCandidate.openT3GapCount,
      releaseCandidateCheckCount: releaseCandidate.releaseCheckCount,
      releaseCandidateReadyCheckCount: releaseCandidate.readyReleaseCheckCount,
      releaseCandidateBlockedCheckCount: releaseCandidate.blockedReleaseCheckCount,
      releaseCandidateHash: releaseCandidate.releaseCandidateHash,
      releaseCandidateFinalGoalComplete: releaseCandidate.finalGoalComplete,
      t3CertificationNextActionsStatus: t3NextActions.status,
      t3CertificationNextActionsOnly: t3NextActions.nextActionsOnly,
      t3CertificationNextActionsReadyForHumanReview: t3NextActions.readyForHumanReview,
      t3CertificationNextActionsReadyForProductionRelease: t3NextActions.readyForProductionRelease,
      t3CertificationNextActionsExecutionAllowed: t3NextActions.executionAllowed,
      t3CertificationNextActionsOpenT3GapCount: t3NextActions.openT3GapCount,
      t3CertificationNextActionsLaneCount: t3NextActions.laneActionCount,
      t3CertificationNextActionsReadyLaneCount: t3NextActions.readyLaneActionCount,
      t3CertificationNextActionsManualStepCount: t3NextActions.manualStepCount,
      t3CertificationNextActionsEvidenceRequirementCount: t3NextActions.evidenceRequirementCount,
      t3CertificationNextActionsRollbackRequirementCount: t3NextActions.rollbackRequirementCount,
      t3CertificationNextActionsHash: t3NextActions.nextActionsHash,
      t3CertificationNextActionsFinalGoalComplete: t3NextActions.finalGoalComplete,
      t3SingleLaneRunPacketStatus: t3RunPackets.status,
      t3SingleLaneRunPacketOnly: t3RunPackets.runPacketsOnly,
      t3SingleLaneRunPacketReadyForHumanReview: t3RunPackets.readyForHumanReview,
      t3SingleLaneRunPacketReadyForProductionRelease: t3RunPackets.readyForProductionRelease,
      t3SingleLaneRunPacketExecutionAllowed: t3RunPackets.executionAllowed,
      t3SingleLaneRunPacketOpenT3GapCount: t3RunPackets.openT3GapCount,
      t3SingleLaneRunPacketCount: t3RunPackets.packetCount,
      t3SingleLaneRunPacketReadyCount: t3RunPackets.readyPacketCount,
      t3SingleLaneRunPacketManualStepCount: t3RunPackets.manualStepCount,
      t3SingleLaneRunPacketEvidenceRequirementCount: t3RunPackets.evidenceRequirementCount,
      t3SingleLaneRunPacketRollbackRequirementCount: t3RunPackets.rollbackRequirementCount,
      t3SingleLaneRunPacketHash: t3RunPackets.runPacketBundleHash,
      t3SingleLaneRunPacketFinalGoalComplete: t3RunPackets.finalGoalComplete,
      t3RunPacketVerifierStatus: t3RunVerifier.status,
      t3RunPacketVerifierOnly: t3RunVerifier.verifierOnly,
      t3RunPacketVerifierPassed: t3RunVerifier.verificationPassed,
      t3RunPacketVerifierPacketCount: t3RunVerifier.packetVerificationCount,
      t3RunPacketVerifierReadyPacketCount: t3RunVerifier.readyPacketVerificationCount,
      t3RunPacketVerifierSubmittedPacketCount: t3RunVerifier.submittedPacketCount,
      t3RunPacketVerifierVerifiedPacketCount: t3RunVerifier.verifiedPacketCount,
      t3RunPacketVerifierExecutionAllowed: t3RunVerifier.executionAllowed,
      t3RunPacketVerifierHash: t3RunVerifier.verifierHash,
      t3RunPacketVerifierFinalGoalComplete: t3RunVerifier.finalGoalComplete,
      deliveryReviewerCockpitStatus: deliveryReviewer.status,
      deliveryReviewerCockpitOnly: deliveryReviewer.reviewerCockpitOnly,
      deliveryReviewerCockpitReadyForHumanReview: deliveryReviewer.readyForHumanReview,
      deliveryReviewerCockpitReadyForProductionRelease: deliveryReviewer.readyForProductionRelease,
      deliveryReviewerCockpitSectionCount: deliveryReviewer.sectionCount,
      deliveryReviewerCockpitReadySectionCount: deliveryReviewer.readySectionCount,
      deliveryReviewerCockpitBlockedSectionCount: deliveryReviewer.blockedSectionCount,
      deliveryReviewerCockpitOpenT3GapCount: deliveryReviewer.openT3GapCount,
      deliveryReviewerCockpitContentReturned: deliveryReviewer.contentReturned,
      deliveryReviewerCockpitHash: deliveryReviewer.reviewerCockpitHash,
      deliveryReviewerCockpitFinalGoalComplete: deliveryReviewer.finalGoalComplete,
      deliveryLaunchGuideStatus: deliveryLaunch.status,
      deliveryLaunchGuideOnly: deliveryLaunch.launchGuideOnly,
      deliveryLaunchGuideReadyForLocalReview: deliveryLaunch.readyForLocalReview,
      deliveryLaunchGuideReadyForProductionRelease: deliveryLaunch.readyForProductionRelease,
      deliveryLaunchGuideCommandCount: deliveryLaunch.commandCount,
      deliveryLaunchGuideRouteCount: deliveryLaunch.routeCount,
      deliveryLaunchGuideOpenT3GapCount: deliveryLaunch.openT3GapCount,
      deliveryLaunchGuideContentReturned: deliveryLaunch.contentReturned,
      deliveryLaunchGuideHash: deliveryLaunch.launchGuideHash,
      deliveryLaunchGuideFinalGoalComplete: deliveryLaunch.finalGoalComplete,
      deliveryConsistencySentinelStatus: deliveryConsistency.status,
      deliveryConsistencySentinelOnly: deliveryConsistency.sentinelOnly,
      deliveryConsistencySentinelPassed: deliveryConsistency.consistencyPassed,
      deliveryConsistencySentinelSurfaceCount: deliveryConsistency.surfaceCount,
      deliveryConsistencySentinelInvariantCount: deliveryConsistency.invariantCount,
      deliveryConsistencySentinelContradictionCount: deliveryConsistency.contradictionCount,
      deliveryConsistencySentinelOpenT3GapCount: deliveryConsistency.openT3GapCount,
      deliveryConsistencySentinelContentReturned: deliveryConsistency.contentReturned,
      deliveryConsistencySentinelHash: deliveryConsistency.consistencyHash,
      deliveryConsistencySentinelFinalGoalComplete: deliveryConsistency.finalGoalComplete,
      finalAcceptanceMatrixStatus: finalAcceptance.status,
      finalAcceptanceMatrixOnly: finalAcceptance.acceptanceMatrixOnly,
      finalAcceptanceMatrixLocalPassed: finalAcceptance.localAcceptancePassed,
      finalAcceptanceMatrixRowCount: finalAcceptance.acceptanceRowCount,
      finalAcceptanceMatrixProvedRowCount: finalAcceptance.provedRowCount,
      finalAcceptanceMatrixBlockedRowCount: finalAcceptance.blockedRowCount,
      finalAcceptanceMatrixOpenT3GapCount: finalAcceptance.openT3GapCount,
      finalAcceptanceMatrixContentReturned: finalAcceptance.contentReturned,
      finalAcceptanceMatrixHash: finalAcceptance.acceptanceHash,
      finalAcceptanceMatrixFinalGoalComplete: finalAcceptance.finalGoalComplete,
      certificationBlockerBoardStatus: certificationBlockers.status,
      certificationBlockerBoardOnly: certificationBlockers.blockerBoardOnly,
      certificationBlockerBoardLocalPassed: certificationBlockers.localBoardPassed,
      certificationBlockerBoardBlockerCount: certificationBlockers.blockerCount,
      certificationBlockerBoardReadyBlockerCount: certificationBlockers.readyBlockerCount,
      certificationBlockerBoardClosedBlockerCount: certificationBlockers.closedBlockerCount,
      certificationBlockerBoardOpenT3GapCount: certificationBlockers.openT3GapCount,
      certificationBlockerBoardContentReturned: certificationBlockers.contentReturned,
      certificationBlockerBoardHash: certificationBlockers.boardHash,
      certificationBlockerBoardFinalGoalComplete: certificationBlockers.finalGoalComplete,
      userAcceptanceRehearsalStatus: userAcceptance.status,
      userAcceptanceRehearsalOnly: userAcceptance.userAcceptanceRehearsalOnly,
      userAcceptanceRehearsalLocalPassed: userAcceptance.localUserAcceptancePassed,
      userAcceptanceRehearsalReadyForHumanReview: userAcceptance.readyForHumanReview,
      userAcceptanceRehearsalReadyForProductionRelease: userAcceptance.readyForProductionRelease,
      userAcceptanceRehearsalRehearsalCount: userAcceptance.rehearsalCount,
      userAcceptanceRehearsalReadyRehearsalCount: userAcceptance.readyRehearsalCount,
      userAcceptanceRehearsalBlockedRehearsalCount: userAcceptance.blockedRehearsalCount,
      userAcceptanceRehearsalOpenT3GapCount: userAcceptance.openT3GapCount,
      userAcceptanceRehearsalContentReturned: userAcceptance.contentReturned,
      userAcceptanceRehearsalHash: userAcceptance.rehearsalHash,
      userAcceptanceRehearsalFinalGoalComplete: userAcceptance.finalGoalComplete,
      deliveryEvidenceNavigatorStatus: evidenceNavigator.status,
      deliveryEvidenceNavigatorOnly: evidenceNavigator.deliveryEvidenceNavigatorOnly,
      deliveryEvidenceNavigatorLocalPassed: evidenceNavigator.localNavigationPassed,
      deliveryEvidenceNavigatorReadyForHumanReview: evidenceNavigator.readyForHumanReview,
      deliveryEvidenceNavigatorReadyForProductionRelease: evidenceNavigator.readyForProductionRelease,
      deliveryEvidenceNavigatorSectionCount: evidenceNavigator.navigationSectionCount,
      deliveryEvidenceNavigatorReadySectionCount: evidenceNavigator.readyNavigationSectionCount,
      deliveryEvidenceNavigatorBlockedSectionCount: evidenceNavigator.blockedNavigationSectionCount,
      deliveryEvidenceNavigatorOpenT3GapCount: evidenceNavigator.openT3GapCount,
      deliveryEvidenceNavigatorContentReturned: evidenceNavigator.contentReturned,
      deliveryEvidenceNavigatorHash: evidenceNavigator.navigatorHash,
      deliveryEvidenceNavigatorFinalGoalComplete: evidenceNavigator.finalGoalComplete,
      localDeliverySummaryStatus: localSummary.status,
      localDeliverySummaryOnly: localSummary.summaryPacketOnly,
      localDeliverySummaryLocalPassed: localSummary.localSummaryPassed,
      localDeliverySummaryReadyForHumanDelivery: localSummary.readyForHumanDelivery,
      localDeliverySummaryReadyForProductionRelease: localSummary.readyForProductionRelease,
      localDeliverySummarySectionCount: localSummary.summarySectionCount,
      localDeliverySummaryReadySectionCount: localSummary.readySummarySectionCount,
      localDeliverySummaryBlockedSectionCount: localSummary.blockedSummarySectionCount,
      localDeliverySummaryLocalRequirementCount: localSummary.localRequirementCount,
      localDeliverySummaryProvedCheckCount: localSummary.provedCheckCount,
      localDeliverySummaryOpenT3GapCount: localSummary.openT3GapCount,
      localDeliverySummaryContentReturned: localSummary.contentReturned,
      localDeliverySummaryHash: localSummary.summaryHash,
      localDeliverySummaryFinalGoalComplete: localSummary.finalGoalComplete,
      localDeliveryHandoffBriefStatus: handoffBrief.status,
      localDeliveryHandoffBriefOnly: handoffBrief.handoffBriefOnly,
      localDeliveryHandoffBriefLocalPassed: handoffBrief.localHandoffPassed,
      localDeliveryHandoffBriefReadyForUserReview: handoffBrief.readyForUserReview,
      localDeliveryHandoffBriefReadyForProductionRelease: handoffBrief.readyForProductionRelease,
      localDeliveryHandoffBriefSectionCount: handoffBrief.briefSectionCount,
      localDeliveryHandoffBriefReadySectionCount: handoffBrief.readyBriefSectionCount,
      localDeliveryHandoffBriefBlockedSectionCount: handoffBrief.blockedBriefSectionCount,
      localDeliveryHandoffBriefLocalCommandCount: handoffBrief.localCommandCount,
      localDeliveryHandoffBriefLocalRequirementCount: handoffBrief.localRequirementCount,
      localDeliveryHandoffBriefProvedCheckCount: handoffBrief.provedCheckCount,
      localDeliveryHandoffBriefOpenT3GapCount: handoffBrief.openT3GapCount,
      localDeliveryHandoffBriefContentReturned: handoffBrief.contentReturned,
      localDeliveryHandoffBriefHash: handoffBrief.briefHash,
      localDeliveryHandoffBriefFinalGoalComplete: handoffBrief.finalGoalComplete,
      localDeliveryQuickstartStatus: quickstartBundle.status,
      localDeliveryQuickstartOnly: quickstartBundle.quickstartBundleOnly,
      localDeliveryQuickstartLocalPassed: quickstartBundle.localQuickstartPassed,
      localDeliveryQuickstartReadyForLocalRunbookReview: quickstartBundle.readyForLocalRunbookReview,
      localDeliveryQuickstartReadyForProductionRelease: quickstartBundle.readyForProductionRelease,
      localDeliveryQuickstartStepCount: quickstartBundle.quickstartStepCount,
      localDeliveryQuickstartReadyStepCount: quickstartBundle.readyQuickstartStepCount,
      localDeliveryQuickstartBlockedStepCount: quickstartBundle.blockedQuickstartStepCount,
      localDeliveryQuickstartLocalCommandCount: quickstartBundle.localCommandCount,
      localDeliveryQuickstartLocalRouteCount: quickstartBundle.localRouteCount,
      localDeliveryQuickstartLocalRequirementCount: quickstartBundle.localRequirementCount,
      localDeliveryQuickstartProvedCheckCount: quickstartBundle.provedCheckCount,
      localDeliveryQuickstartOpenT3GapCount: quickstartBundle.openT3GapCount,
      localDeliveryQuickstartContentReturned: quickstartBundle.contentReturned,
      localDeliveryQuickstartHash: quickstartBundle.quickstartHash,
      localDeliveryQuickstartFinalGoalComplete: quickstartBundle.finalGoalComplete,
      localDeliveryVerificationSuiteStatus: verificationSuite.status,
      localDeliveryVerificationSuiteOnly: verificationSuite.verificationSuiteOnly,
      localDeliveryVerificationSuiteLocalPassed: verificationSuite.localVerificationPassed,
      localDeliveryVerificationSuiteReadyForLocalVerificationReview: verificationSuite.readyForLocalVerificationReview,
      localDeliveryVerificationSuiteReadyForProductionRelease: verificationSuite.readyForProductionRelease,
      localDeliveryVerificationSuiteCheckCount: verificationSuite.verificationCheckCount,
      localDeliveryVerificationSuiteReadyCheckCount: verificationSuite.readyVerificationCheckCount,
      localDeliveryVerificationSuiteBlockedCheckCount: verificationSuite.blockedVerificationCheckCount,
      localDeliveryVerificationSuiteLocalCommandCount: verificationSuite.localCommandCount,
      localDeliveryVerificationSuiteEvidenceFileCount: verificationSuite.evidenceFileCount,
      localDeliveryVerificationSuiteLocalRequirementCount: verificationSuite.localRequirementCount,
      localDeliveryVerificationSuiteProvedCheckCount: verificationSuite.provedCheckCount,
      localDeliveryVerificationSuiteOpenT3GapCount: verificationSuite.openT3GapCount,
      localDeliveryVerificationSuiteContentReturned: verificationSuite.contentReturned,
      localDeliveryVerificationSuiteHash: verificationSuite.suiteHash,
      localDeliveryVerificationSuiteFinalGoalComplete: verificationSuite.finalGoalComplete,
      finalLocalHandoffCheckpointStatus: finalHandoffCheckpoint.status,
      finalLocalHandoffCheckpointOnly: finalHandoffCheckpoint.checkpointOnly,
      finalLocalHandoffCheckpointLocalPassed: finalHandoffCheckpoint.localFinalHandoffPassed,
      finalLocalHandoffCheckpointReadyForFinalLocalReview: finalHandoffCheckpoint.readyForFinalLocalReview,
      finalLocalHandoffCheckpointReadyForProductionRelease: finalHandoffCheckpoint.readyForProductionRelease,
      finalLocalHandoffCheckpointStepCount: finalHandoffCheckpoint.checkpointStepCount,
      finalLocalHandoffCheckpointReadyStepCount: finalHandoffCheckpoint.readyCheckpointStepCount,
      finalLocalHandoffCheckpointBlockedStepCount: finalHandoffCheckpoint.blockedCheckpointStepCount,
      finalLocalHandoffCheckpointLocalCommandCount: finalHandoffCheckpoint.localCommandCount,
      finalLocalHandoffCheckpointArtifactCount: finalHandoffCheckpoint.handoffArtifactCount,
      finalLocalHandoffCheckpointLocalRequirementCount: finalHandoffCheckpoint.localRequirementCount,
      finalLocalHandoffCheckpointProvedCheckCount: finalHandoffCheckpoint.provedCheckCount,
      finalLocalHandoffCheckpointOpenT3GapCount: finalHandoffCheckpoint.openT3GapCount,
      finalLocalHandoffCheckpointContentReturned: finalHandoffCheckpoint.contentReturned,
      finalLocalHandoffCheckpointHash: finalHandoffCheckpoint.checkpointHash,
      finalLocalHandoffCheckpointFinalGoalComplete: finalHandoffCheckpoint.finalGoalComplete,
      t3EvidenceBundleTemplateStatus: t3EvidenceTemplates.status,
      t3EvidenceBundleTemplateOnly: t3EvidenceTemplates.templateOnly,
      t3EvidenceBundleTemplateLaneCount: t3EvidenceTemplates.laneTemplateCount,
      t3EvidenceBundleTemplateReadyLaneCount: t3EvidenceTemplates.readyLaneTemplateCount,
      t3EvidenceBundleTemplateEvidenceItemCount: t3EvidenceTemplates.evidenceItemCount,
      t3EvidenceBundleTemplateRollbackResultCount: t3EvidenceTemplates.rollbackResultCount,
      t3EvidenceBundleTemplateExecutionAllowed: t3EvidenceTemplates.executionAllowed,
      t3EvidenceBundleTemplateHash: t3EvidenceTemplates.templateBundleHash,
      t3EvidenceBundleTemplateFinalGoalComplete: t3EvidenceTemplates.finalGoalComplete,
      t3OperatorChecklistStatus: t3Operator.status,
      t3OperatorChecklistOnly: t3Operator.operatorOnly,
      t3OperatorChecklistLaneCount: t3Operator.laneChecklistCount,
      t3OperatorChecklistReadyLaneCount: t3Operator.readyLaneChecklistCount,
      t3OperatorChecklistManualStepCount: t3Operator.manualStepCount,
      t3OperatorChecklistEvidenceItemCount: t3Operator.evidenceItemCount,
      t3OperatorChecklistRollbackItemCount: t3Operator.rollbackItemCount,
      t3OperatorChecklistExecutionAllowed: t3Operator.executionAllowed,
      t3OperatorChecklistHash: t3Operator.checklistBundleHash,
      t3OperatorChecklistFinalGoalComplete: t3Operator.finalGoalComplete,
      t3OperatorTranscriptValidatorStatus: t3OperatorTranscript.status,
      t3OperatorTranscriptValidatorOnly: t3OperatorTranscript.validatorOnly,
      t3OperatorTranscriptValidatorLaneCount: t3OperatorTranscript.laneValidationCount,
      t3OperatorTranscriptValidatorReadyLaneCount: t3OperatorTranscript.readyLaneValidationCount,
      t3OperatorTranscriptValidatorSubmittedTranscriptCount: t3OperatorTranscript.submittedTranscriptCount,
      t3OperatorTranscriptValidatorValidatedTranscriptCount: t3OperatorTranscript.validatedTranscriptCount,
      t3OperatorTranscriptValidatorExecutionAllowed: t3OperatorTranscript.executionAllowed,
      t3OperatorTranscriptValidatorHash: t3OperatorTranscript.transcriptValidatorHash,
      t3OperatorTranscriptValidatorFinalGoalComplete: t3OperatorTranscript.finalGoalComplete,
      modelRoutes: db.aiMessages.map((item) => item.reply?.modelRoute).filter(Boolean).slice(-10)
    };
    json(res, 200, envelope(report));
    return true;
  }

  return false;
}

function resolvePath(url) {
  const clean = decodeURIComponent(url.pathname);
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, "index.html");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) json(res, 404, envelope({ error: "Not found" }, false));
      return;
    }

    const file = resolvePath(url);
    if (!file || !existsSync(file)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 500, envelope({ error: error.message }, false));
  }
});

server.on("upgrade", handleUpgrade);

server.listen(port, "127.0.0.1", () => {
  console.log(`CodeX fullstack server running at http://127.0.0.1:${port}`);
});
