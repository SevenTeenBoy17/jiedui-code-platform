import { existsSync } from "node:fs";

const RUNTIME_APPROVAL_ENV = "CODEX_T3_RUNTIME_APPROVED";
const DATABASE_APPROVAL_ENV = "CODEX_T3_DATABASE_APPROVED";
const PROVIDER_APPROVAL_ENV = "CODEX_T3_PROVIDER_APPROVED";

export function t3CertificationPreflight(env = process.env, context = {}) {
  const lanes = [
    runtimeLane(env, context),
    databaseLane(env),
    providerLane(env)
  ];
  const globalBlockers = [
    {
      id: "human-approval-required",
      present: lanes.every((lane) => approvalPresent(lane.approvalEnv, env)),
      required: true,
      message: "Every T3 certification lane requires an explicit human approval marker before any outward action."
    },
    {
      id: "rollback-plan-required",
      present: lanes.every((lane) => lane.rollbackPlan?.length > 0),
      required: true,
      message: "Every T3 certification lane must publish a rollback plan before execution."
    },
    {
      id: "no-secret-values-in-preflight",
      present: true,
      required: true,
      message: "Preflight reports only presence and shape; secret values are never returned."
    }
  ];
  const readyLaneCount = lanes.filter((lane) => lane.ready).length;
  const approvedPhaseReady = readyLaneCount === lanes.length && globalBlockers.every((item) => item.present);

  return {
    status: "preflight-only",
    approvedPhaseReady,
    safeToRunAutomatically: false,
    t3ApprovalRequired: true,
    lanes,
    globalBlockers: globalBlockers.filter((item) => !item.present),
    evidencePolicy: {
      secretValuesReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      checksOnlyPresenceAndLocalTooling: true
    },
    nextStep: approvedPhaseReady
      ? "A human may approve one bounded T3 certification lane and run it with rollback visible."
      : "Provide explicit approval markers and required managed/runtime/provider prerequisites before any T3 certification run."
  };
}

function runtimeLane(env, context) {
  const checks = [
    check("approval-marker", approvalPresent(RUNTIME_APPROVAL_ENV, env), RUNTIME_APPROVAL_ENV),
    check("sandbox-policy-contract", Boolean(context.sandboxPolicy), "local sandbox policy loaded"),
    check("runtime-candidate", hasAny(env, ["CODEX_CERT_RUNTIME", "CODEX_CONTAINER_RUNTIME", "CODEX_WASM_RUNTIME"]), "container/VM/browser-WASM runtime candidate present"),
    check("quota-plan", present(env.CODEX_CERT_RUNTIME_QUOTA_PLAN), "CPU/memory quota plan marker present"),
    check("rollback-runbook", existsSync("specs/phase2t-sandbox-certification-readiness-contract.md"), "runtime readiness contract exists")
  ];
  return lane({
    id: "runtime",
    targetGap: "container-runtime-certification",
    approvalEnv: RUNTIME_APPROVAL_ENV,
    checks,
    rollbackPlan: [
      "Disable certified runtime routing and return to sandbox-runner-v2 no-exec local harness.",
      "Preserve failed runtime logs and escape-regression evidence for review.",
      "Keep arbitrary public code execution blocked until runtime certification passes."
    ],
    evidenceRequired: [
      "runtime isolation proof",
      "CPU and memory quota evidence",
      "filesystem mount policy",
      "network namespace or browser capability proof",
      "syscall/native escape regression",
      "audit retention and rollback evidence"
    ]
  });
}

function databaseLane(env) {
  const checks = [
    check("approval-marker", approvalPresent(DATABASE_APPROVAL_ENV, env), DATABASE_APPROVAL_ENV),
    check("managed-database-url-present", present(env.DATABASE_URL), "DATABASE_URL present"),
    check("secret-manager-marker", present(env.CODEX_DB_SECRET_MANAGER), "secret manager marker present"),
    check("tls-required", env.CODEX_DB_TLS_REQUIRED === "1", "TLS required marker set"),
    check("rollback-runbook", existsSync("specs/phase2v-database-certification-readiness-contract.md"), "database readiness contract exists")
  ];
  return lane({
    id: "database",
    targetGap: "managed-database-certification",
    approvalEnv: DATABASE_APPROVAL_ENV,
    checks,
    rollbackPlan: [
      "Stop routing writes to the managed database and return to local JSON/SQLite repository mode.",
      "Restore from verified backup or PITR checkpoint if a migration corrupts data.",
      "Revoke temporary database credentials used for certification."
    ],
    evidenceRequired: [
      "managed database provisioning proof",
      "secret manager reference, not secret value",
      "TLS connection enforcement",
      "migration forward and rollback logs",
      "backup/restore or PITR drill",
      "access policy review and load test"
    ]
  });
}

function providerLane(env) {
  const checks = [
    check("approval-marker", approvalPresent(PROVIDER_APPROVAL_ENV, env), PROVIDER_APPROVAL_ENV),
    check("provider-key-present", present(env.CODEX_MODEL_API_KEY), "CODEX_MODEL_API_KEY present"),
    check("provider-base-url-present", present(env.CODEX_MODEL_BASE_URL), "CODEX_MODEL_BASE_URL present"),
    check("live-model-enabled", env.CODEX_ENABLE_LIVE_MODEL === "1", "CODEX_ENABLE_LIVE_MODEL=1"),
    check("budget-cap-marker", present(env.CODEX_PROVIDER_BUDGET_CAP), "provider budget cap marker present"),
    check("rollback-runbook", existsSync("specs/phase2u-provider-certification-readiness-contract.md"), "provider readiness contract exists")
  ];
  return lane({
    id: "provider",
    targetGap: "external-provider-certification",
    approvalEnv: PROVIDER_APPROVAL_ENV,
    checks,
    rollbackPlan: [
      "Disable CODEX_ENABLE_LIVE_MODEL and route back to local simulated provider mode.",
      "Revoke or rotate the provider key if any request/response audit fails.",
      "Keep image generation on the image-only route and coding fallback on the coding route."
    ],
    evidenceRequired: [
      "approved real provider call",
      "managed secret reference",
      "cost cap and retry budget",
      "student data privacy review",
      "sampled response quality review",
      "kill switch and incident drill"
    ]
  });
}

function lane({ id, targetGap, approvalEnv, checks, rollbackPlan, evidenceRequired }) {
  const missing = checks.filter((item) => item.required && !item.present).map((item) => item.id);
  return {
    id,
    targetGap,
    approvalRequired: true,
    approvalEnv,
    ready: missing.length === 0,
    checks,
    missing,
    rollbackPlan,
    evidenceRequired
  };
}

function check(id, presentValue, evidence) {
  return {
    id,
    present: Boolean(presentValue),
    required: true,
    evidence
  };
}

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAny(env, keys) {
  return keys.some((key) => present(env[key]));
}

function approvalPresent(key, env) {
  return env[key] === "approved";
}
