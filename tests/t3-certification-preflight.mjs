import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3158);
const base = `http://127.0.0.1:${port}`;
const fakeProviderKey = `sk-${"phase2xFakeProviderSecret123456789"}`;
const fakeDatabaseUrl = "postgres://codex_user:phase2x-secret-password@example.invalid:5432/codex";

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
    CODEX_PROVIDER_BUDGET_CAP: "local-preflight-budget-marker",
    DATABASE_URL: fakeDatabaseUrl,
    CODEX_DB_SECRET_MANAGER: "local-preflight-secret-manager-marker",
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
  throw new Error(`t3 preflight server did not become ready: ${log}`);
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
  const preflight = await request("/api/delivery/t3-preflight");
  if (preflight.status !== "preflight-only" ||
      preflight.approvedPhaseReady !== false ||
      preflight.safeToRunAutomatically !== false ||
      preflight.t3ApprovalRequired !== true ||
      preflight.evidencePolicy?.secretValuesReturned !== false ||
      preflight.evidencePolicy?.externalCalls !== false ||
      preflight.evidencePolicy?.managedDatabaseConnections !== false ||
      preflight.evidencePolicy?.deployments !== false) {
    failures.push("T3 preflight did not expose safe preflight-only guardrail state");
  }
  if ((preflight.lanes || []).length !== 3) failures.push("T3 preflight did not return exactly three lanes");
  for (const expected of ["runtime", "database", "provider"]) {
    const lane = (preflight.lanes || []).find((item) => item.id === expected);
    if (!lane) {
      failures.push(`missing T3 preflight lane: ${expected}`);
      continue;
    }
    if (lane.approvalRequired !== true || lane.ready !== false || !lane.missing?.includes("approval-marker")) {
      failures.push(`T3 preflight lane ${expected} did not remain blocked by approval marker`);
    }
    if (!lane.rollbackPlan?.length || !lane.evidenceRequired?.length) {
      failures.push(`T3 preflight lane ${expected} missing rollback/evidence plan`);
    }
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3PreflightStatus !== "preflight-only" ||
      report.t3PreflightApprovedPhaseReady !== false ||
      report.t3PreflightLaneCount !== 3 ||
      report.t3PreflightReadyLaneCount !== 0 ||
      report.t3PreflightGlobalBlockerCount < 1) {
    failures.push("report export missing T3 preflight summary fields");
  }

  const exposed = JSON.stringify({ preflight, report });
  for (const secretValue of [fakeProviderKey, fakeDatabaseUrl, "phase2x-secret-password"]) {
    if (exposed.includes(secretValue)) failures.push(`T3 preflight leaked secret value marker: ${secretValue.slice(0, 12)}`);
  }
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed)) {
    failures.push("T3 preflight exposed a key-shaped token");
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

console.log("T3 certification preflight QA passed: three lanes, approval gate, rollback/evidence plans, report fields, no external action, and no secret exposure.");
