import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3192);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3o-t3-evidence-bundle-templates.json";
const outputMarkdownPath = "qa-artifacts/phase3o-t3-evidence-bundle-templates.md";

const cli = spawnSync(process.execPath, ["scripts/t3-evidence-bundle-templates.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 evidence bundle templates CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1400) {
  failures.push("Phase 3O JSON evidence template artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3O Markdown evidence template artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertTemplateReport(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3O T3 Evidence Bundle Templates") ||
      !markdown.includes("Template only: **yes**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3O Markdown summary missing template guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3O Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3O offline artifacts exposed a key-shaped token or secret assignment");
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

  const templates = await request("/api/delivery/t3-evidence-bundle-templates");
  assertTemplateReport(templates, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3EvidenceBundleTemplateStatus !== "evidence-bundle-templates-ready-execution-blocked" ||
      report.t3EvidenceBundleTemplateOnly !== true ||
      report.t3EvidenceBundleTemplateLaneCount !== 3 ||
      report.t3EvidenceBundleTemplateReadyLaneCount !== 3 ||
      report.t3EvidenceBundleTemplateEvidenceItemCount < 15 ||
      report.t3EvidenceBundleTemplateRollbackResultCount < 9 ||
      report.t3EvidenceBundleTemplateExecutionAllowed !== false ||
      report.t3EvidenceBundleTemplateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3EvidenceBundleTemplateHash || "")) {
    failures.push("report export missing Phase 3O T3 evidence bundle template fields");
  }

  const exposed = JSON.stringify({ templates, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3O endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3O endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 evidence bundle templates QA passed: artifacts, endpoint/report fields, per-lane templates, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function assertTemplateReport(report, label) {
  if (report.phase !== "3O" ||
      report.status !== "evidence-bundle-templates-ready-execution-blocked" ||
      report.finalGoalComplete !== false ||
      report.templateOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.laneTemplateCount !== 3 ||
      report.readyLaneTemplateCount !== 3 ||
      report.evidenceItemCount < 15 ||
      report.rollbackResultCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.executionGateHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.templateBundleHash || "")) {
    failures.push(`${label} T3 evidence bundle template report has invalid top-level fields`);
  }
  for (const template of report.laneTemplates || []) {
    if (template.riskTier !== "T3" ||
        template.templateReady !== true ||
        template.approvalRecorded !== false ||
        template.executionAllowed !== false ||
        template.certificationStateChanged !== false ||
        template.finalGoalComplete !== false ||
        template.evidenceItems.length < 5 ||
        template.rollbackResults.length < 3 ||
        !template.evidenceItems.every((item) => item.artifactHashRequired === true && item.bodyContentAllowed === false) ||
        !template.rollbackResults.every((item) => item.artifactHashRequired === true && item.bodyContentAllowed === false)) {
      failures.push(`${label} invalid evidence template lane ${template.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.artifactContentReturned !== false ||
      report.guardrails?.evidenceContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} T3 evidence template guardrails are not blocked`);
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
