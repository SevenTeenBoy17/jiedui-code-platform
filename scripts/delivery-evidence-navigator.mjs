import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryArtifactIndex } from "./delivery-artifact-index.mjs";
import { deliveryHandoffDossier } from "./delivery-handoff-dossier.mjs";
import { userAcceptanceRehearsal } from "./user-acceptance-rehearsal.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase4d-delivery-evidence-navigator.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase4d-delivery-evidence-navigator.md";

const REQUIRED_EVIDENCE = [
  "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
  "qa-artifacts/phase4b-certification-blocker-board.json",
  "qa-artifacts/phase4a-final-acceptance-matrix.json",
  "qa-artifacts/phase3b-delivery-handoff-dossier.json",
  "specs/phase3c-delivery-artifact-index-contract.md",
  "qa-artifacts/phase3s-visual-qa-storyboard.json",
  "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2o-agentic-audit.json"
];

export function deliveryEvidenceNavigator({
  generatedAt = new Date().toISOString(),
  userAcceptance = readJson("qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
  artifactIndex = readJson("qa-artifacts/phase3c-delivery-artifact-index.json"),
  blockerBoard = readJson("qa-artifacts/phase4b-certification-blocker-board.json"),
  visualStoryboard = readJson("qa-artifacts/phase3s-visual-qa-storyboard.json"),
  agenticReplay = readJson("qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
  completionAudit = readJson("qa-artifacts/phase2s-completion-audit.json"),
  agenticAudit = readJson("qa-artifacts/phase2o-agentic-audit.json")
} = {}) {
  const uat = hasStatus(userAcceptance) ? userAcceptance : userAcceptanceRehearsal();
  const artifacts = hasStatus(artifactIndex) ? artifactIndex : deliveryArtifactIndex({ dossier: deliveryHandoffDossier() });
  const evidenceFiles = REQUIRED_EVIDENCE.map((path) => evidenceFile(path));
  const provedCheckIds = provedIds(agenticAudit);
  const openGaps = normalizeGaps(uat.openCertificationGaps || blockerBoard.openCertificationGaps || completionAudit.openCertificationGaps || []);

  const sections = [
    navigatorSection({
      id: "student-evidence-navigation",
      title: "Student learning evidence",
      purpose: "Find local final-value waits, sandbox run proof, visual frame metadata, and student acceptance status.",
      checks: [
        uat.rehearsals?.some((item) => item.id === "student-learning-rehearsal" && item.localReady === true),
        provedCheckIds.has("round-1-terminal-sandbox"),
        visualStoryboard.status === "visual-storyboard-ready-open-t3"
      ],
      evidenceRefs: [
        evidenceRef("user-acceptance-rehearsal", "qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
        evidenceRef("visual-storyboard", "qa-artifacts/phase3s-visual-qa-storyboard.json"),
        evidenceRef("agentic-replay", "qa-artifacts/phase3r-agentic-qa-replay-dossier.json")
      ]
    }),
    navigatorSection({
      id: "teacher-evidence-navigation",
      title: "Teacher management evidence",
      purpose: "Find teacher review flow proof, class management metadata, handoff status, and export-readiness checks.",
      checks: [
        uat.rehearsals?.some((item) => item.id === "teacher-management-rehearsal" && item.localReady === true),
        provedCheckIds.has("round-2-teacher-review-final"),
        uat.readyForHumanReview === true
      ],
      evidenceRefs: [
        evidenceRef("user-acceptance-rehearsal", "qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
        evidenceRef("qa-report", "qa-artifacts/QA_REPORT.md"),
        evidenceRef("completion-audit", "qa-artifacts/phase2s-completion-audit.json")
      ]
    }),
    navigatorSection({
      id: "research-delivery-navigation",
      title: "Research delivery evidence",
      purpose: "Find the artifact inventory, completion audit, final acceptance, consistency, and handoff metadata.",
      checks: [
        Number(artifacts.readyArtifactCount || 0) > 0,
        artifacts.contentReturned === false,
        Number(completionAudit.localRequirementCount || 0) >= 44
      ],
      evidenceRefs: [
        evidenceRef("artifact-index-contract", "specs/phase3c-delivery-artifact-index-contract.md"),
        evidenceRef("handoff-dossier", "qa-artifacts/phase3b-delivery-handoff-dossier.json"),
        evidenceRef("completion-audit", "qa-artifacts/phase2s-completion-audit.json"),
        evidenceRef("final-acceptance-matrix", "qa-artifacts/phase4a-final-acceptance-matrix.json")
      ]
    }),
    navigatorSection({
      id: "visual-and-agentic-qa-navigation",
      title: "Visual and agentic QA evidence",
      purpose: "Find screenshot hash metadata, three-round click replay, proved checks, and quality guard evidence.",
      checks: [
        visualStoryboard.status === "visual-storyboard-ready-open-t3",
        agenticReplay.status === "agentic-qa-replay-ready-open-t3",
        Number(agenticReplay.clickRoundCount || 0) >= 3,
        Math.max(Number(agenticReplay.provedCheckCount || 0), provedCheckIds.size) >= 65
      ],
      evidenceRefs: [
        evidenceRef("visual-storyboard", "qa-artifacts/phase3s-visual-qa-storyboard.json"),
        evidenceRef("agentic-replay", "qa-artifacts/phase3r-agentic-qa-replay-dossier.json"),
        evidenceRef("agentic-audit", "qa-artifacts/phase2o-agentic-audit.json")
      ]
    }),
    navigatorSection({
      id: "t3-certification-navigation",
      title: "Open T3 certification evidence",
      purpose: "Find the exact runtime, database, and provider blockers plus the next safe approval-gated lane.",
      checks: [
        blockerBoard.status === "certification-blocker-board-ready-open-t3",
        Number(blockerBoard.readyBlockerCount || 0) === 3,
        Number(blockerBoard.closedBlockerCount || 0) === 0,
        openGaps.length === 3
      ],
      evidenceRefs: [
        evidenceRef("certification-blocker-board", "qa-artifacts/phase4b-certification-blocker-board.json"),
        evidenceRef("user-acceptance-rehearsal", "qa-artifacts/phase4c-user-acceptance-rehearsal.json"),
        evidenceRef("completion-audit", "qa-artifacts/phase2s-completion-audit.json")
      ]
    })
  ];

  const readyNavigationSectionCount = sections.filter((item) => item.localReady).length;
  const localNavigationPassed =
    sections.length === 5 &&
    readyNavigationSectionCount === 5 &&
    uat.localUserAcceptancePassed === true &&
    artifacts.contentReturned === false &&
    openGaps.length === 3 &&
    evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""));
  const status = localNavigationPassed
    ? "delivery-evidence-navigator-ready-open-t3"
    : "delivery-evidence-navigator-needs-local-evidence";
  const navigatorHash = sha256(JSON.stringify({
    status,
    sections: sections.map((item) => [item.id, item.localReady, item.status]),
    evidenceHashes: evidenceFiles.map((file) => file.sha256 || ""),
    openT3GapCount: openGaps.length,
    finalGoalComplete: false
  }));

  return {
    phase: "4D",
    generatedAt,
    status,
    finalGoalComplete: false,
    deliveryEvidenceNavigatorOnly: true,
    localNavigationPassed,
    readyForHumanReview: localNavigationPassed,
    readyForProductionRelease: false,
    blockedByT3: true,
    contentReturned: false,
    navigationSectionCount: sections.length,
    readyNavigationSectionCount,
    blockedNavigationSectionCount: sections.length - readyNavigationSectionCount,
    openT3GapCount: openGaps.length,
    evidenceFileCount: evidenceFiles.length,
    navigatorHash,
    sections,
    evidenceFiles,
    openCertificationGaps: openGaps,
    sourceSummaries: {
      userAcceptance: {
        status: uat.status || "unknown",
        localUserAcceptancePassed: uat.localUserAcceptancePassed === true,
        finalGoalComplete: Boolean(uat.finalGoalComplete)
      },
      artifactIndex: {
        status: artifacts.status || "unknown",
        readyArtifactCount: Number(artifacts.readyArtifactCount || 0),
        contentReturned: Boolean(artifacts.contentReturned)
      },
      blockerBoard: {
        status: blockerBoard.status || "unknown",
        readyBlockerCount: Number(blockerBoard.readyBlockerCount || 0),
        closedBlockerCount: Number(blockerBoard.closedBlockerCount || 0)
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
      providerResponsesReturned: false,
      databaseConnectionStringsReturned: false,
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

export function writeDeliveryEvidenceNavigator(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  let report = deliveryEvidenceNavigator(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryEvidenceNavigatorMarkdown(report), "utf8");
  report = deliveryEvidenceNavigator(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderDeliveryEvidenceNavigatorMarkdown(report), "utf8");
  return report;
}

export function renderDeliveryEvidenceNavigatorMarkdown(report) {
  const rows = report.sections
    .map((item) => `| ${item.id} | ${item.status} | ${item.localReady ? "yes" : "no"} | ${item.evidenceRefCount} | ${item.purpose} |`)
    .join("\n");

  return `# Phase 4D Delivery Evidence Navigator

Generated: ${report.generatedAt}

Status: **${report.status}**

Navigator only: **${report.deliveryEvidenceNavigatorOnly ? "yes" : "no"}**

Local navigation passed: **${report.localNavigationPassed ? "yes" : "no"}**

Ready for production release: **${report.readyForProductionRelease ? "yes" : "no"}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Navigator hash:

\`\`\`text
${report.navigatorHash}
\`\`\`

| Section | Status | Local ready | Evidence refs | Purpose |
|---|---|---:|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This navigator returns metadata, paths, statuses, counts, and hashes only.
- It does not return evidence bodies, screenshots, approval text, secrets, provider responses, database connection strings, review command output, deployment state, certification execution, or final completion.
`;
}

function navigatorSection({ id, title, purpose, checks, evidenceRefs }) {
  const localReady = checks.every(Boolean) && evidenceRefs.every((item) => item.exists && /^[a-f0-9]{64}$/.test(item.sha256 || ""));
  return {
    id,
    title,
    purpose,
    status: localReady ? "ready-local" : "needs-local-evidence",
    localReady,
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    blockedByT3: true,
    executionAllowed: false,
    contentReturned: false,
    finalGoalComplete: false
  };
}

function evidenceRef(id, path) {
  const file = evidenceFile(path);
  return {
    id,
    path,
    exists: file.exists,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    contentReturned: false
  };
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

function provedIds(audit) {
  const rows = Array.isArray(audit.completionMatrix)
    ? audit.completionMatrix
    : (Array.isArray(audit.checks) ? audit.checks : []);
  return new Set(rows.filter((item) => item.status === "proved").map((item) => item.id));
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
  const report = writeDeliveryEvidenceNavigator();
  console.log(`Delivery evidence navigator written: ${report.status} (${report.navigatorHash})`);
}
