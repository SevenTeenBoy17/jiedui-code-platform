import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const port = Number(process.env.PORT || 3179);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3i-t3-approval-lock.json";
const outputMarkdownPath = "qa-artifacts/phase3i-t3-approval-lock.md";
const laneIds = ["runtime", "database", "provider"];

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-approval-lock.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`approval lock CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 900) {
  failures.push("Phase 3I JSON approval lock artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 600) {
  failures.push("Phase 3I Markdown approval lock artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertLockReport(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3I T3 Approval Lock") ||
      !markdown.includes("Lock only: **yes**") ||
      !markdown.includes("Approved: **no**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3I Markdown summary missing required guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3I Markdown leaked approval text content instead of hashes");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3I offline artifacts exposed a key-shaped token or secret assignment");
  }
}

const server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...scrubEnv(), PORT: String(port) }
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

try {
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {
      await wait(250);
    }
  }
  if (!ready) throw new Error(`server not ready: ${serverLog}`);

  const endpointReport = await request("/api/delivery/t3-approval-lock");
  assertLockReport(endpointReport, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalLockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      report.t3ApprovalLockOnly !== true ||
      report.t3ApprovalLockApproved !== false ||
      report.t3ApprovalLockExecutionAllowed !== false ||
      report.t3ApprovalLockLaneCount !== 3 ||
      report.t3ApprovalLockOpenGapCount !== 3 ||
      report.t3ApprovalLockFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalLockHash || "")) {
    failures.push("report export missing Phase 3I T3 approval lock fields");
  }

  const serialized = JSON.stringify({ endpointReport, report });
  if (serialized.includes("I explicitly approve only the")) {
    failures.push("Phase 3I endpoint or report leaked approval text content instead of hashes");
  }
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3I endpoint or report exposed a key-shaped token or secret assignment");
  }
} catch (error) {
  failures.push(error.message);
} finally {
  server.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("T3 approval lock QA passed: lock hash, lane hashes, report fields, finalGoalComplete=false, no approval text content, and no secret exposure.");

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

function assertLockReport(report, label) {
  if (report.phase !== "3I" ||
      report.status !== "approval-lock-ready-with-open-t3-gaps" ||
      report.finalGoalComplete !== false ||
      report.lockOnly !== true ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.approvalRequestStatus !== "approval-request-export-ready" ||
      report.approvalRequestCount !== 3 ||
      report.requestReadyCount !== 3 ||
      report.integrityStatus !== "approval-integrity-ready" ||
      report.openCertificationGapCount !== 3 ||
      report.laneLockCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(report.integrityBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.approvalLockHash || "")) {
    failures.push(`${label} approval lock report has invalid top-level fields`);
  }
  const byId = new Map((report.laneLocks || []).map((lane) => [lane.id, lane]));
  for (const laneId of laneIds) {
    const lane = byId.get(laneId);
    if (!lane ||
        lane.requestReady !== true ||
        lane.approved !== false ||
        lane.executionAllowed !== false ||
        lane.singleLaneOnly !== true ||
        lane.localCommandCandidateCount < 3 ||
        lane.rollbackStepCount < 3 ||
        lane.evidenceItemCount < 6 ||
        lane.dryRunCheckCount < 8 ||
        !/^[a-f0-9]{64}$/.test(lane.approvalTextHash || "")) {
      failures.push(`${label} missing valid lane lock for ${laneId}`);
    }
    if (lane && Object.hasOwn(lane, "approvalText")) {
      failures.push(`${label} returned approval text content for ${laneId}`);
    }
  }
  if (report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} approval lock guardrails do not preserve blocked T3 state`);
  }
}

function scrubEnv() {
  const env = { ...process.env };
  delete env.CODEX_MODEL_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.DATABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
}

function hasSecretExposure(text) {
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
