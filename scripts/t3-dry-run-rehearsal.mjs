const COMMAND_CANDIDATES = {
  runtime: [
    "npm.cmd run qa:sandbox-certification",
    "npm.cmd run qa:sandbox-isolation",
    "npm.cmd run qa:completion"
  ],
  database: [
    "npm.cmd run qa:db-certification",
    "npm.cmd run qa:db-adapter",
    "npm.cmd run qa:completion"
  ],
  provider: [
    "npm.cmd run qa:provider-certification",
    "npm.cmd run qa:provider-transport",
    "npm.cmd run qa:completion"
  ]
};

export function t3DryRunRehearsal({
  approvalPacket = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const lanes = (approvalPacket.lanes || []).map(rehearsalLane);
  const dryRunCheckCount = lanes.reduce((count, lane) => count + lane.checks.length, 0);
  const passedDryRunCheckCount = lanes.reduce((count, lane) => count + lane.checks.filter((check) => check.passed).length, 0);
  const failedDryRunCheckCount = dryRunCheckCount - passedDryRunCheckCount;
  const readyLaneCount = lanes.filter((lane) => lane.dryRunReady).length;

  return {
    phase: "3F",
    generatedAt,
    status: "rehearsal-ready-with-open-t3-gaps",
    finalGoalComplete: false,
    rehearsalOnly: true,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    executionAllowed: false,
    safeToRunAutomatically: false,
    approvalPacketStatus: approvalPacket.status || "missing",
    laneCount: lanes.length,
    readyLaneCount,
    blockedLaneCount: lanes.filter((lane) => !lane.approvedToExecute).length,
    dryRunCheckCount,
    passedDryRunCheckCount,
    failedDryRunCheckCount,
    lanes,
    guardrails: {
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      certificationStateChanged: false,
      finalCompletionClaimed: false
    },
    nextStep: "Use this rehearsal as the local pre-run proof before requesting explicit approval for exactly one T3 certification lane."
  };
}

function rehearsalLane(lane) {
  const commandCandidates = COMMAND_CANDIDATES[lane.id] || ["npm.cmd run qa:completion"];
  const serialized = JSON.stringify(lane);
  const checks = [
    check("risk-tier-t3", lane.riskTier === "T3"),
    check("approval-remains-blocked", lane.approved === false && lane.allowedToRun === false),
    check("pre-execution-checks-visible", (lane.preExecutionChecks || []).length >= 5),
    check("rollback-visible", (lane.rollbackSummary || []).length >= 3),
    check("evidence-checklist-visible", (lane.evidenceChecklist || []).length >= 6),
    check("remaining-work-visible", /(approve|run|certification)/i.test(String(lane.remainingWork || ""))),
    check("local-command-candidates-visible", commandCandidates.length >= 3 && commandCandidates.every((cmd) => cmd.startsWith("npm.cmd run qa:"))),
    check("secret-safe-payload", !/\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(serialized))
  ];

  return {
    id: lane.id,
    targetGap: lane.targetGap,
    riskTier: "T3",
    approvedToExecute: false,
    dryRunReady: checks.every((item) => item.passed),
    commandCandidates,
    checks,
    rollbackStepCount: (lane.rollbackSummary || []).length,
    evidenceRequirementCount: (lane.evidenceChecklist || []).length,
    nextApprovedAction: lane.remainingWork || "Request explicit approval for this single T3 lane before execution."
  };
}

function check(id, passed) {
  return { id, passed: Boolean(passed) };
}

