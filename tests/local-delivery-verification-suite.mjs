import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3266);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4h-local-delivery-verification-suite.json";
const outputMarkdownPath = "qa-artifacts/phase4h-local-delivery-verification-suite.md";

const cli = spawnSync(process.execPath, ["scripts/local-delivery-verification-suite.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`local delivery verification suite CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 4500) {
  failures.push("Phase 4H JSON local delivery verification suite artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1400) {
  failures.push("Phase 4H Markdown local delivery verification suite artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertVerificationSuite(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4H Local Delivery Verification Suite") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("npm.cmd run qa:local-verification-suite") ||
      !markdown.includes("npm.cmd run qa:agentic")) {
    failures.push("Phase 4H Markdown suite missing local verification guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4H Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4H offline artifacts exposed a key-shaped token or secret assignment");
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

  const suite = await request("/api/delivery/local-verification-suite");
  assertVerificationSuite(suite, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.localDeliveryVerificationSuiteStatus !== "local-delivery-verification-suite-ready-open-t3" ||
      report.localDeliveryVerificationSuiteOnly !== true ||
      report.localDeliveryVerificationSuiteLocalPassed !== true ||
      report.localDeliveryVerificationSuiteReadyForLocalVerificationReview !== true ||
      report.localDeliveryVerificationSuiteReadyForProductionRelease !== false ||
      report.localDeliveryVerificationSuiteCheckCount !== 10 ||
      report.localDeliveryVerificationSuiteReadyCheckCount !== 10 ||
      report.localDeliveryVerificationSuiteBlockedCheckCount !== 0 ||
      report.localDeliveryVerificationSuiteLocalCommandCount !== 10 ||
      report.localDeliveryVerificationSuiteEvidenceFileCount < 12 ||
      report.localDeliveryVerificationSuiteLocalRequirementCount < 48 ||
      report.localDeliveryVerificationSuiteProvedCheckCount < 69 ||
      report.localDeliveryVerificationSuiteOpenT3GapCount !== 3 ||
      report.localDeliveryVerificationSuiteContentReturned !== false ||
      report.localDeliveryVerificationSuiteFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryVerificationSuiteHash || "")) {
    failures.push("report export missing Phase 4H local delivery verification suite fields");
  }

  const exposed = JSON.stringify({ suite, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4H endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4H endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4H endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Local delivery verification suite QA passed: artifacts, endpoint/report fields, ordered checks, command metadata, finalGoalComplete=false, and no secret exposure.");

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

function assertVerificationSuite(report, label) {
  if (report.phase !== "4H" ||
      report.status !== "local-delivery-verification-suite-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.verificationSuiteOnly !== true ||
      report.localVerificationPassed !== true ||
      report.readyForLocalVerificationReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.verificationCheckCount !== 10 ||
      report.readyVerificationCheckCount !== 10 ||
      report.blockedVerificationCheckCount !== 0 ||
      report.localCommandCount !== 10 ||
      report.localRequirementCount < 48 ||
      report.provedCheckCount < 69 ||
      report.evidenceFileCount < 12 ||
      !/^[a-f0-9]{64}$/.test(report.suiteHash || "")) {
    failures.push(`${label} local delivery verification suite has invalid top-level fields`);
  }
  const checkIds = (report.verificationChecks || []).map((entry) => entry.id);
  for (const id of [
    "quickstart-artifact-ready",
    "focused-suite-command-registered",
    "api-regression-command-registered",
    "smoke-command-registered",
    "agentic-audit-command-registered",
    "completion-audit-command-registered",
    "evidence-files-hashed",
    "open-t3-gaps-preserved"
  ]) {
    if (!checkIds.includes(id)) failures.push(`${label} local delivery verification suite missing check: ${id}`);
  }
  if (!report.verificationChecks?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.executionAllowed === false &&
    entry.executed === false &&
    entry.outputReturned === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} local delivery verification checks are not ready and safely blocked`);
  }
  if (!Array.isArray(report.localCommands) ||
      report.localCommands.length !== 10 ||
      !report.localCommands.every((command) =>
        command.localOnly === true &&
        command.requiresSecret === false &&
        command.outwardAction === false &&
        command.executionAllowed === false &&
        command.executed === false &&
        command.outputReturned === false
      )) {
    failures.push(`${label} local delivery verification commands are not metadata-only`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 12 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} local delivery verification evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} local delivery verification did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.providerResponsesReturned !== false ||
      report.guardrails?.databaseConnectionStringsReturned !== false ||
      report.guardrails?.reviewCommandsExecuted !== false ||
      report.guardrails?.commandOutputReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.productionRelease !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} local delivery verification guardrails are not blocked`);
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
