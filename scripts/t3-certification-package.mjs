const LANE_LABELS = {
  runtime: "Certified runtime isolation",
  database: "Managed database certification",
  provider: "External provider certification"
};

const RUNBOOKS = {
  runtime: [
    "Confirm the certified runtime candidate and quota policy outside source control.",
    "Run one bounded certification lane against non-production fixtures.",
    "Collect isolation, quota, mount, network, escape-regression, audit, and rollback evidence."
  ],
  database: [
    "Confirm managed database provisioning, secret-manager reference, TLS, backup, and rollback windows.",
    "Run migration and rollback drills against a disposable certification database.",
    "Collect connection, access-policy, backup/restore, PITR, load, monitoring, and incident evidence."
  ],
  provider: [
    "Confirm managed provider secret reference, cost cap, privacy review, and kill switch.",
    "Run one approved real-provider coding call and one image-route call if the lane is explicitly approved.",
    "Collect request redaction, response audit, rate-limit/retry, budget, quality, and rollback evidence."
  ]
};

export function t3CertificationPackage({ preflight, overview, generatedAt = new Date().toISOString() } = {}) {
  const lanes = preflight?.lanes || [];
  const lanePackages = lanes.map((lane) => lanePackage(lane));
  const blockedLaneCount = lanePackages.filter((lane) => !lane.preflightReady || !lane.allowedToRun).length;
  const rollbackPlanCount = lanePackages.reduce((count, lane) => count + lane.rollbackPlan.length, 0);
  const evidenceRequirementCount = lanePackages.reduce((count, lane) => count + lane.evidenceRequired.length, 0);

  return {
    status: "package-only",
    generatedAt,
    executionAllowed: false,
    finalGoalComplete: false,
    t3ApprovalRequired: true,
    preflightStatus: preflight?.status || "missing",
    approvedPhaseReady: Boolean(preflight?.approvedPhaseReady),
    safeToRunAutomatically: false,
    lanePackages,
    packageSummary: {
      laneCount: lanePackages.length,
      blockedLaneCount,
      rollbackPlanCount,
      evidenceRequirementCount,
      openCertificationGapCount: overview?.openCertificationGaps?.length || 0,
      localEvidencePassed: Boolean(overview?.localEvidencePassed)
    },
    executionOrder: [
      "backup-current-state-and-export-current-evidence",
      "obtain-explicit-human-approval-for-one-lane",
      "rerun-t3-preflight-for-that-lane",
      "execute-only-the-approved-lane-in-a-non-production-scope",
      "collect-runtime-command-output-and-artifacts",
      "run-rollback-drill-before-expanding-scope",
      "rerun-review-gate-and-completion-audit"
    ],
    guardrails: {
      secretValuesReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      executesCertification: false
    },
    artifactManifest: [
      "specs/phase2t-sandbox-certification-readiness-contract.md",
      "specs/phase2u-provider-certification-readiness-contract.md",
      "specs/phase2v-database-certification-readiness-contract.md",
      "specs/phase2x-t3-certification-preflight-contract.md",
      "specs/phase2y-t3-certification-package-contract.md",
      "qa-artifacts/phase2s-completion-audit.json"
    ],
    nextStep: "Use this package as the checklist for a future explicitly approved single-lane T3 certification phase."
  };
}

function lanePackage(lane) {
  const missing = lane.missing || [];
  return {
    id: lane.id,
    label: LANE_LABELS[lane.id] || lane.id,
    targetGap: lane.targetGap,
    riskTier: "T3",
    allowedToRun: false,
    approvalRequired: true,
    approvalMarker: lane.approvalEnv || `${lane.id}-approval-marker`,
    preflightReady: lane.ready === true,
    missing,
    blockedReason: missing.length ? missing.join(", ") : "package endpoint never executes certification",
    rollbackFirst: true,
    rollbackPlan: lane.rollbackPlan || [],
    evidenceRequired: lane.evidenceRequired || [],
    evidenceIntake: evidenceIntake(lane.id),
    runbook: RUNBOOKS[lane.id] || ["Run a bounded approved T3 lane and collect runtime evidence."]
  };
}

function evidenceIntake(id) {
  return [
    `${id}-runtime-output-or-provider-response-summary`,
    `${id}-rollback-drill-result`,
    `${id}-review-gate-result`,
    `${id}-secret-redaction-proof`,
    `${id}-operator-approval-record`
  ];
}
