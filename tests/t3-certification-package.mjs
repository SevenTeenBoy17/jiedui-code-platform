import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3160);
const base = `http://127.0.0.1:${port}`;
const fakeProviderKey = `sk-${"phase2yFakeProviderSecret123456789"}`;
const fakeDatabaseUrl = "postgres://codex_user:phase2y-secret-password@example.invalid:5432/codex";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  return {
    ...process.env,
    PORT: String(port),
    CODEX_MODEL_API_KEY: fakeProviderKey,
    CODEX_MODEL_BASE_URL: "https://provider.example.invalid",
    CODEX_ENABLE_LIVE_MODEL: "1",
    CODEX_PROVIDER_BUDGET_CAP: "local-package-budget-marker",
    DATABASE_URL: fakeDatabaseUrl,
    CODEX_DB_SECRET_MANAGER: "local-package-secret-manager-marker",
    CODEX_DB_TLS_REQUIRED: "1",
    CODEX_CERT_RUNTIME: "container-runtime-marker",
    CODEX_CERT_RUNTIME_QUOTA_PLAN: "quota-plan-marker"
  };
}

async function startServer() {
  const child = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv()
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk.toString(); });
  child.stderr.on("data", (chunk) => { log += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      if (health.status === "ready") return { child, log: () => log };
    } catch {
      await wait(150);
    }
  }
  throw new Error(`t3 certification package server did not become ready: ${log}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

let server;
try {
  server = await startServer();
  const pack = await request("/api/delivery/t3-certification-package");
  if (pack.status !== "package-only" ||
      pack.executionAllowed !== false ||
      pack.finalGoalComplete !== false ||
      pack.safeToRunAutomatically !== false ||
      pack.t3ApprovalRequired !== true ||
      pack.guardrails?.secretValuesReturned !== false ||
      pack.guardrails?.externalCalls !== false ||
      pack.guardrails?.managedDatabaseConnections !== false ||
      pack.guardrails?.deployments !== false ||
      pack.guardrails?.executesCertification !== false) {
    failures.push("T3 package did not expose safe package-only guardrail state");
  }
  if ((pack.lanePackages || []).length !== 3 || pack.packageSummary?.laneCount !== 3) {
    failures.push("T3 package did not return exactly three lane packages");
  }
  for (const expected of ["runtime", "database", "provider"]) {
    const lane = (pack.lanePackages || []).find((item) => item.id === expected);
    if (!lane) {
      failures.push(`missing T3 package lane: ${expected}`);
      continue;
    }
    if (lane.riskTier !== "T3" || lane.allowedToRun !== false || lane.rollbackFirst !== true) {
      failures.push(`T3 package lane ${expected} did not remain blocked and rollback-first`);
    }
    if (!lane.rollbackPlan?.length || !lane.evidenceRequired?.length || !lane.evidenceIntake?.length || !lane.runbook?.length) {
      failures.push(`T3 package lane ${expected} missing runbook, rollback, or evidence intake`);
    }
  }
  if (!pack.executionOrder?.includes("obtain-explicit-human-approval-for-one-lane") ||
      !pack.executionOrder?.includes("run-rollback-drill-before-expanding-scope")) {
    failures.push("T3 package execution order did not require approval and rollback drill");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3PackageStatus !== "package-only" ||
      report.t3PackageExecutionAllowed !== false ||
      report.t3PackageLaneCount !== 3 ||
      report.t3PackageBlockedLaneCount !== 3 ||
      report.t3PackageRollbackPlanCount < 3 ||
      report.t3PackageEvidenceRequirementCount < 9) {
    failures.push("report export missing T3 package summary fields");
  }

  const exposed = JSON.stringify({ pack, report });
  for (const secretValue of [fakeProviderKey, fakeDatabaseUrl, "phase2y-secret-password"]) {
    if (exposed.includes(secretValue)) failures.push(`T3 package leaked secret value marker: ${secretValue.slice(0, 12)}`);
  }
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed)) {
    failures.push("T3 package exposed a key-shaped token");
  }
} catch (error) {
  failures.push(error.message);
} finally {
  if (server?.child) server.child.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("T3 certification package QA passed: package-only endpoint, three rollback-first lanes, report fields, no external action, and no secret exposure.");
