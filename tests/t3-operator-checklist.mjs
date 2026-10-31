import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3194);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3p-t3-operator-checklist.json";
const outputMarkdownPath = "qa-artifacts/phase3p-t3-operator-checklist.md";

const cli = spawnSync(process.execPath, ["scripts/t3-operator-checklist.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 operator checklist CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1700) {
  failures.push("Phase 3P JSON operator checklist artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3P Markdown operator checklist artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertChecklistReport(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3P T3 Operator Checklist") ||
      !markdown.includes("Operator only: **yes**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3P Markdown summary missing operator guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3P Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3P offline artifacts exposed a key-shaped token or secret assignment");
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
  for (let i = 0; i < 40; i += 1) {
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {
      await wait(150);
    }
  }
  if (!ready) throw new Error(`server not ready: ${serverLog}`);

  const checklist = await request("/api/delivery/t3-operator-checklist");
  assertChecklistReport(checklist, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3OperatorChecklistStatus !== "t3-operator-checklist-ready-execution-blocked" ||
      report.t3OperatorChecklistOnly !== true ||
      report.t3OperatorChecklistLaneCount !== 3 ||
      report.t3OperatorChecklistReadyLaneCount !== 3 ||
      report.t3OperatorChecklistManualStepCount < 15 ||
      report.t3OperatorChecklistEvidenceItemCount < 15 ||
      report.t3OperatorChecklistRollbackItemCount < 9 ||
      report.t3OperatorChecklistExecutionAllowed !== false ||
      report.t3OperatorChecklistFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3OperatorChecklistHash || "")) {
    failures.push("report export missing Phase 3P T3 operator checklist fields");
  }

  const exposed = JSON.stringify({ checklist, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3P endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3P endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 operator checklist QA passed: artifacts, endpoint/report fields, per-lane manual steps, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function assertChecklistReport(report, label) {
  if (report.phase !== "3P" ||
      report.status !== "t3-operator-checklist-ready-execution-blocked" ||
      report.finalGoalComplete !== false ||
      report.operatorOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.laneChecklistCount !== 3 ||
      report.readyLaneChecklistCount !== 3 ||
      report.manualStepCount < 15 ||
      report.evidenceItemCount < 15 ||
      report.rollbackItemCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.readinessHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.candidateBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.executionGateHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.templateBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.checklistBundleHash || "")) {
    failures.push(`${label} T3 operator checklist report has invalid top-level fields`);
  }
  for (const lane of report.laneChecklists || []) {
    if (lane.riskTier !== "T3" ||
        lane.checklistReady !== true ||
        lane.approvalRecorded !== false ||
        lane.executionAllowed !== false ||
        lane.certificationStateChanged !== false ||
        lane.contentReturned !== false ||
        lane.manualSteps.length < 5 ||
        lane.evidenceChecklist.length < 5 ||
        lane.rollbackChecklist.length < 3 ||
        !lane.manualSteps.every((step) => step.required === true && step.outwardActionAllowed === false) ||
        !lane.evidenceChecklist.every((item) => item.artifactHashRequired === true && item.bodyContentAllowed === false) ||
        !lane.rollbackChecklist.every((item) => item.artifactHashRequired === true && item.bodyContentAllowed === false)) {
      failures.push(`${label} invalid operator checklist lane ${lane.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.artifactContentReturned !== false ||
      report.guardrails?.evidenceContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} T3 operator checklist guardrails are not blocked`);
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
