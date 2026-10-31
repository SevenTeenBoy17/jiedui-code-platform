import { existsSync, readFileSync } from "node:fs";

export const EXPECTED_CERTIFICATION_GAPS = [
  {
    id: "container-runtime-certification",
    title: "Certified sandbox runtime",
    owner: "platform-hardening",
    riskTier: "T3",
    status: "open",
    blocker: true,
    issue: "Local sandbox hardening is proved, but no certified container, VM, or browser-WASM runtime has been approved and exercised.",
    nextAction: "Run an approved runtime certification phase with quota, namespace, mount, network, syscall/native escape, audit retention, and rollback evidence."
  },
  {
    id: "managed-database-certification",
    title: "Managed database certification",
    owner: "platform-hardening",
    riskTier: "T3",
    status: "open",
    blocker: true,
    issue: "Local JSON/SQLite persistence is proved, but no managed database has been provisioned or certified.",
    nextAction: "Run an approved managed database phase with secret-manager URL, TLS, pooling, rollback, restore/PITR, access policy, load, monitoring, and runbook evidence."
  },
  {
    id: "external-provider-certification",
    title: "External model provider certification",
    owner: "model-security",
    riskTier: "T3",
    status: "open",
    blocker: true,
    issue: "Local routing, redaction, guard, and localhost mock transport are proved, but real external provider calls remain unapproved.",
    nextAction: "Run an approved external-provider phase with managed secrets, cost caps, privacy review, kill switch, sampled response audit, and incident drill."
  }
];

export function loadCompletionAudit(auditPath) {
  if (!auditPath || !existsSync(auditPath)) {
    return {
      available: false,
      verdict: "missing",
      finalGoalComplete: false,
      localEvidencePassed: false,
      requirements: [],
      openCertificationGaps: EXPECTED_CERTIFICATION_GAPS
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(auditPath, "utf8"));
    return { available: true, ...parsed };
  } catch (error) {
    return {
      available: false,
      verdict: "unreadable",
      error: error.message,
      finalGoalComplete: false,
      localEvidencePassed: false,
      requirements: [],
      openCertificationGaps: EXPECTED_CERTIFICATION_GAPS
    };
  }
}

export function certificationOverview({
  sandboxCertification,
  providerCertification,
  databaseCertification,
  completionAudit
} = {}) {
  const audit = completionAudit || {};
  const requirements = audit.requirements || [];
  const localRows = requirements.filter((item) => item.localRequired !== false);
  const provedLocalRows = localRows.filter((item) => item.status === "proved");
  const auditGaps = (audit.openCertificationGaps || [])
    .filter((gap) => EXPECTED_CERTIFICATION_GAPS.some((expected) => expected.id === gap.id))
    .map((gap) => ({
      ...EXPECTED_CERTIFICATION_GAPS.find((expected) => expected.id === gap.id),
      ...gap,
      riskTier: "T3",
      status: "open",
      blocker: true
    }));
  const knownGapIds = new Set(auditGaps.map((gap) => gap.id));
  const openCertificationGaps = [
    ...auditGaps,
    ...EXPECTED_CERTIFICATION_GAPS.filter((gap) => !knownGapIds.has(gap.id))
  ];
  const readinessSurfaces = [
    readinessSurface("sandbox-runtime", "/api/sandbox/certification", sandboxCertification),
    readinessSurface("model-provider", "/api/ai/provider/certification", providerCertification),
    readinessSurface("database", "/api/db/certification", databaseCertification)
  ];
  const localEvidencePassed = Boolean(audit.localEvidencePassed) ||
    (localRows.length > 0 && localRows.length === provedLocalRows.length);
  const finalGoalComplete = Boolean(audit.finalGoalComplete) &&
    openCertificationGaps.length === 0 &&
    readinessSurfaces.every((item) => item.certified === true);
  const status = finalGoalComplete
    ? "complete"
    : localEvidencePassed
      ? "pass-with-open-certification-gaps"
      : "needs-evidence";

  return {
    status,
    finalGoalComplete,
    localEvidencePassed,
    generatedAt: new Date().toISOString(),
    completionAudit: {
      available: Boolean(audit.available),
      verdict: audit.verdict || "missing",
      finalGoalComplete: Boolean(audit.finalGoalComplete),
      localEvidencePassed,
      localRequirementCount: localRows.length,
      provedLocalRequirementCount: provedLocalRows.length
    },
    readinessSurfaces,
    openCertificationGaps,
    guardrails: {
      noExternalProviderCall: true,
      noManagedDatabaseConnection: true,
      noProductionDeploy: true,
      noSecretPersistence: true,
      t3ApprovalRequired: openCertificationGaps.every((gap) => gap.riskTier === "T3")
    },
    nextActions: openCertificationGaps.map((gap) => ({
      id: gap.id,
      riskTier: gap.riskTier,
      approvalRequired: true,
      action: gap.nextAction
    }))
  };
}

function readinessSurface(id, endpoint, certification = {}) {
  return {
    id,
    endpoint,
    status: certification.status || "unknown",
    certified: Boolean(certification.certified),
    locallyReady: Boolean(certification.locallyReady),
    missingControlCount: (certification.missingCertificationControls || certification.missingProductionControls || []).length,
    evidenceCounts: certification.evidenceCounts || {}
  };
}
