import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3190);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3n-final-delivery-readiness.json";
const outputMarkdownPath = "qa-artifacts/phase3n-final-delivery-readiness.md";

const cli = spawnSync(process.execPath, ["scripts/final-delivery-readiness.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`final delivery readiness CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1200) {
  failures.push("Phase 3N JSON final delivery readiness artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3N Markdown final delivery readiness artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertReadinessReport(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3N Final Delivery Readiness") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("Blocked by T3: **yes**")) {
    failures.push("Phase 3N Markdown summary missing readiness guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3N Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3N offline artifacts exposed a key-shaped token or secret assignment");
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

  const readiness = await request("/api/delivery/final-readiness");
  assertReadinessReport(readiness, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.finalDeliveryReadinessStatus !== "final-readiness-local-evidence-ready-open-t3" ||
      report.finalDeliveryReadinessLocalEvidencePassed !== true ||
      report.finalDeliveryReadinessArtifactIntegrityPassed !== true ||
      report.finalDeliveryReadinessObjectiveTraceable !== true ||
      report.finalDeliveryReadinessAgenticPassed !== true ||
      report.finalDeliveryReadinessOpenT3GapCount !== 3 ||
      report.finalDeliveryReadinessBlockedByT3 !== true ||
      report.finalDeliveryReadinessFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalDeliveryReadinessHash || "")) {
    failures.push("report export missing Phase 3N final delivery readiness fields");
  }

  const exposed = JSON.stringify({ readiness, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3N endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3N endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("Final delivery readiness QA passed: cockpit artifacts, endpoint/report fields, open T3 blockers, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function assertReadinessReport(report, label) {
  if (report.phase !== "3N" ||
      report.status !== "final-readiness-local-evidence-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.localEvidencePassed !== true ||
      report.artifactIntegrityPassed !== true ||
      report.objectiveTraceable !== true ||
      report.agenticPassed !== true ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(report.readinessHash || "")) {
    failures.push(`${label} final delivery readiness report has invalid top-level fields`);
  }
  if (report.completionAudit?.localRequirementCount < 28 ||
      report.agenticAudit?.provedCheckCount < 49 ||
      report.artifactIntegrity?.missingArtifactCount !== 0 ||
      report.traceability?.openRequirementCount !== 3 ||
      report.evidenceClosure?.closureOnly !== true ||
      report.evidenceClosure?.executionAllowed !== false) {
    failures.push(`${label} final delivery readiness evidence summaries are incomplete`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} final delivery readiness did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactContentReturned !== false ||
      report.guardrails?.evidenceContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} final delivery readiness guardrails are not blocked`);
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
