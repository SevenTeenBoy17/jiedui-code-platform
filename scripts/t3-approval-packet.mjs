const LANE_METADATA = {
  runtime: {
    approvalPrompt: "Approve exactly one bounded T3 runtime certification lane using a non-production certified container, VM, or browser-WASM runtime.",
    remainingWork: "Run certified runtime isolation with quota, mount, network, escape-regression, audit retention, and rollback evidence."
  },
  database: {
    approvalPrompt: "Approve exactly one bounded T3 managed database certification lane using a disposable managed database and secret-manager reference.",
    remainingWork: "Run managed database certification with TLS, migration rollback, backup/restore/PITR, access policy, load, monitoring, and incident evidence."
  },
  provider: {
    approvalPrompt: "Approve exactly one bounded T3 external provider certification lane using managed secrets, budget cap, privacy review, and kill switch.",
    remainingWork: "Run real provider certification with request redaction, response audit, retry/rate-limit evidence, budget tracking, and rollback drill."
  }
};

export function t3ApprovalPacket({
  t3Package = {},
  traceability = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const packageLanes = t3Package.lanePackages || [];
  const lanes = packageLanes.map((lane) => approvalLane(lane, traceability));
  const approvedLaneCount = lanes.filter((lane) => lane.approved).length;
  const blockedLaneCount = lanes.filter((lane) => !lane.approved || !lane.preflightReady).length;
  const evidenceRequirementCount = lanes.reduce((count, lane) => count + lane.evidenceChecklist.length, 0);
  const rollbackStepCount = lanes.reduce((count, lane) => count + lane.rollbackSummary.length, 0);

  return {
    phase: "3E",
    generatedAt,
    status: "approval-packet-ready",
    finalGoalComplete: false,
    executionAllowed: false,
    safeToRunAutomatically: false,
    approvalRequired: true,
    laneCount: lanes.length,
    approvedLaneCount,
    blockedLaneCount,
    evidenceRequirementCount,
    rollbackStepCount,
    lanes,
    guardrails: {
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      finalCompletionClaimed: false
    },
    nextStep: "A human must explicitly approve one lane before any T3 certification command or outward action is allowed."
  };
}

function approvalLane(lane, traceability) {
  const meta = LANE_METADATA[lane.id] || {
    approvalPrompt: `Approve exactly one bounded T3 ${lane.id} certification lane.`,
    remainingWork: "Run the approved lane with rollback and evidence review."
  };
  return {
    id: lane.id,
    targetGap: lane.targetGap,
    riskTier: "T3",
    approvalRequired: true,
    approved: false,
    allowedToRun: false,
    preflightReady: lane.preflightReady === true,
    approvalPrompt: meta.approvalPrompt,
    preExecutionChecks: [
      `Confirm target gap remains open: ${lane.targetGap}`,
      `Confirm approval marker is explicitly granted for ${lane.id}`,
      "Confirm rollback summary is visible before execution",
      "Confirm evidence checklist owner is assigned",
      "Confirm no secret value is pasted into the request or logs"
    ],
    rollbackSummary: lane.rollbackPlan || [],
    evidenceChecklist: unique([...(lane.evidenceRequired || []), ...(lane.evidenceIntake || [])]),
    remainingWork: traceabilityWork(lane.targetGap, traceability) || meta.remainingWork
  };
}

function traceabilityWork(targetGap, traceability) {
  const idMap = {
    "container-runtime-certification": "certified-runtime-isolation",
    "managed-database-certification": "managed-database-certification",
    "external-provider-certification": "external-provider-certification"
  };
  return (traceability.matrix || []).find((row) => row.id === idMap[targetGap])?.remainingWork;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
