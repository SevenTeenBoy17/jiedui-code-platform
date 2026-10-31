import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3175);
const base = `http://127.0.0.1:${port}`;
const jsonPath = "qa-artifacts/phase3g-t3-approval-request-export.json";
const mdPath = "qa-artifacts/phase3g-t3-approval-request-export.md";

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
  throw new Error(`T3 approval request export server did not become ready: ${log}`);
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

function assertExportShape(exported, label) {
  if (exported.status !== "approval-request-export-ready" ||
      exported.finalGoalComplete !== false ||
      exported.exportOnly !== true ||
      exported.externalActionsExecuted !== false ||
      exported.certificationStateChanged !== false ||
      exported.executionAllowed !== false ||
      exported.approvalRequestCount !== 3 ||
      exported.requestReadyCount !== 3 ||
      exported.guardrails?.certificationExecution !== false) {
    failures.push(`${label} did not preserve blocked export-only state`);
  }
  const requestIds = (exported.requests || []).map((request) => request.id);
  for (const expected of ["runtime", "database", "provider"]) {
    if (!requestIds.includes(expected)) failures.push(`${label} missing approval request: ${expected}`);
  }
  for (const request of exported.requests || []) {
    if (request.riskTier !== "T3" ||
        request.approvalRequired !== true ||
        request.approved !== false ||
        request.executionAllowed !== false ||
        request.singleLaneOnly !== true ||
        request.requestReady !== true ||
        !/approve only the .* T3 certification lane/i.test(request.approvalText || "") ||
        (request.localCommandCandidates || []).length < 3 ||
        (request.rollbackSummary || []).length < 3 ||
        (request.evidenceChecklist || []).length < 6 ||
        (request.dryRunChecks || []).some((check) => check.passed !== true)) {
      failures.push(`${label} request ${request.id} missing single-lane approval, rollback, evidence, or dry-run proof`);
    }
  }
}

let server;
try {
  const cli = spawnSync(process.execPath, ["scripts/t3-approval-request-export.mjs"], {
    encoding: "utf8",
    env: serverEnv()
  });
  if (cli.status !== 0) {
    failures.push(`approval request export CLI failed: ${cli.stderr || cli.stdout}`);
  }
  if (!existsSync(jsonPath) || statSync(jsonPath).size < 1000) failures.push("approval request JSON artifact missing or too small");
  if (!existsSync(mdPath) || statSync(mdPath).size < 1000) failures.push("approval request Markdown artifact missing or too small");
  const persisted = JSON.parse(readFileSync(jsonPath, "utf8"));
  assertExportShape(persisted, "persisted export");

  server = await startServer();
  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const preview = await request("/api/delivery/t3-approval-request-export");
  assertExportShape(preview, "endpoint export");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalRequestExportStatus !== "approval-request-export-ready" ||
      report.t3ApprovalRequestExportOnly !== true ||
      report.t3ApprovalRequestExternalActionsExecuted !== false ||
      report.t3ApprovalRequestCertificationStateChanged !== false ||
      report.t3ApprovalRequestExecutionAllowed !== false ||
      report.t3ApprovalRequestCount !== 3 ||
      report.t3ApprovalRequestReadyCount !== 3 ||
      report.t3ApprovalRequestFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval request export fields");
  }

  const exposed = `${JSON.stringify({ persisted, preview, report })}\n${readFileSync(mdPath, "utf8")}`;
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(exposed)) {
    failures.push("T3 approval request export exposed key-shaped or environment-secret material");
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

console.log("T3 approval request export QA passed: JSON/Markdown artifacts, three single-lane requests, report fields, finalGoalComplete=false, and no secret exposure.");

