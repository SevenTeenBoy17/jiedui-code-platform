import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3173);
const base = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = { ...process.env, PORT: String(port) };
  delete env.CODEX_MODEL_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.DATABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
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
  throw new Error(`T3 dry-run rehearsal server did not become ready: ${log}`);
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
  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const rehearsal = await request("/api/delivery/t3-dry-run-rehearsal");
  if (rehearsal.status !== "rehearsal-ready-with-open-t3-gaps" ||
      rehearsal.finalGoalComplete !== false ||
      rehearsal.rehearsalOnly !== true ||
      rehearsal.externalActionsExecuted !== false ||
      rehearsal.certificationStateChanged !== false ||
      rehearsal.executionAllowed !== false ||
      rehearsal.safeToRunAutomatically !== false ||
      rehearsal.laneCount !== 3 ||
      rehearsal.readyLaneCount !== 3 ||
      rehearsal.blockedLaneCount !== 3 ||
      rehearsal.dryRunCheckCount < 24 ||
      rehearsal.failedDryRunCheckCount !== 0 ||
      rehearsal.guardrails?.certificationExecution !== false) {
    failures.push("T3 dry-run rehearsal did not preserve local-only blocked state");
  }
  const laneIds = (rehearsal.lanes || []).map((lane) => lane.id);
  for (const expected of ["runtime", "database", "provider"]) {
    if (!laneIds.includes(expected)) failures.push(`dry-run rehearsal missing lane: ${expected}`);
  }
  for (const lane of rehearsal.lanes || []) {
    if (lane.riskTier !== "T3" ||
        lane.approvedToExecute !== false ||
        lane.dryRunReady !== true ||
        (lane.commandCandidates || []).length < 3 ||
        !(lane.commandCandidates || []).every((cmd) => cmd.startsWith("npm.cmd run qa:")) ||
        (lane.checks || []).some((check) => check.passed !== true) ||
        lane.rollbackStepCount < 3 ||
        lane.evidenceRequirementCount < 6 ||
        !/(approve|run|certification)/i.test(String(lane.nextApprovedAction || ""))) {
      failures.push(`dry-run lane ${lane.id} missing local command candidates or passing checks`);
    }
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3DryRunRehearsalStatus !== "rehearsal-ready-with-open-t3-gaps" ||
      report.t3DryRunRehearsalOnly !== true ||
      report.t3DryRunExternalActionsExecuted !== false ||
      report.t3DryRunCertificationStateChanged !== false ||
      report.t3DryRunExecutionAllowed !== false ||
      report.t3DryRunLaneCount !== 3 ||
      report.t3DryRunReadyLaneCount !== 3 ||
      report.t3DryRunBlockedLaneCount !== 3 ||
      report.t3DryRunCheckCount < 24 ||
      report.t3DryRunFailedCheckCount !== 0 ||
      report.t3DryRunFinalGoalComplete !== false) {
    failures.push("report export missing T3 dry-run rehearsal fields");
  }

  const exposed = JSON.stringify({ rehearsal, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(exposed)) {
    failures.push("T3 dry-run rehearsal exposed key-shaped or environment-secret material");
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

console.log("T3 dry-run rehearsal QA passed: three local-only lanes, all dry-run checks passed, execution/certification unchanged, report fields, finalGoalComplete=false, and no secret exposure.");

