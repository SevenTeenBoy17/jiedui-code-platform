import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3260);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json";
const outputMarkdownPath = "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md";

const cli = spawnSync(process.execPath, ["scripts/local-delivery-quickstart-bundle.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`local delivery quickstart bundle CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 4500) {
  failures.push("Phase 4G JSON local delivery quickstart bundle artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1600) {
  failures.push("Phase 4G Markdown local delivery quickstart bundle artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertQuickstart(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4G Local Delivery Quickstart Bundle") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("npm.cmd run qa:quickstart-bundle") ||
      !markdown.includes("http://127.0.0.1:3000/#research")) {
    failures.push("Phase 4G Markdown quickstart missing local review guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4G Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4G offline artifacts exposed a key-shaped token or secret assignment");
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

  const quickstart = await request("/api/delivery/quickstart-bundle");
  assertQuickstart(quickstart, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.localDeliveryQuickstartStatus !== "local-delivery-quickstart-ready-open-t3" ||
      report.localDeliveryQuickstartOnly !== true ||
      report.localDeliveryQuickstartLocalPassed !== true ||
      report.localDeliveryQuickstartReadyForLocalRunbookReview !== true ||
      report.localDeliveryQuickstartReadyForProductionRelease !== false ||
      report.localDeliveryQuickstartStepCount !== 7 ||
      report.localDeliveryQuickstartReadyStepCount !== 7 ||
      report.localDeliveryQuickstartBlockedStepCount !== 0 ||
      report.localDeliveryQuickstartLocalCommandCount < 8 ||
      report.localDeliveryQuickstartLocalRouteCount < 6 ||
      report.localDeliveryQuickstartLocalRequirementCount < 47 ||
      report.localDeliveryQuickstartProvedCheckCount < 68 ||
      report.localDeliveryQuickstartOpenT3GapCount !== 3 ||
      report.localDeliveryQuickstartContentReturned !== false ||
      report.localDeliveryQuickstartFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryQuickstartHash || "")) {
    failures.push("report export missing Phase 4G local delivery quickstart fields");
  }

  const exposed = JSON.stringify({ quickstart, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4G endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4G endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4G endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Local delivery quickstart bundle QA passed: artifacts, endpoint/report fields, ordered steps, local routes/commands metadata, finalGoalComplete=false, and no secret exposure.");

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

function assertQuickstart(report, label) {
  if (report.phase !== "4G" ||
      report.status !== "local-delivery-quickstart-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.quickstartBundleOnly !== true ||
      report.localQuickstartPassed !== true ||
      report.readyForLocalRunbookReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.quickstartStepCount !== 7 ||
      report.readyQuickstartStepCount !== 7 ||
      report.blockedQuickstartStepCount !== 0 ||
      report.localCommandCount < 8 ||
      report.localRouteCount < 6 ||
      report.localRequirementCount < 47 ||
      report.provedCheckCount < 68 ||
      report.evidenceFileCount < 10 ||
      !/^[a-f0-9]{64}$/.test(report.quickstartHash || "")) {
    failures.push(`${label} local delivery quickstart bundle has invalid top-level fields`);
  }
  const stepIds = (report.quickstartSteps || []).map((entry) => entry.id);
  for (const id of [
    "confirm-local-only-boundary",
    "start-local-server",
    "inspect-student-workflow",
    "inspect-teacher-workflow",
    "inspect-research-delivery",
    "run-local-verification",
    "stop-before-t3"
  ]) {
    if (!stepIds.includes(id)) failures.push(`${label} local delivery quickstart missing step: ${id}`);
  }
  if (!report.quickstartSteps?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.executionAllowed === false &&
    entry.executed === false &&
    entry.outputReturned === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} local delivery quickstart steps are not ready and safely blocked`);
  }
  if (!Array.isArray(report.localCommands) ||
      report.localCommands.length < 8 ||
      !report.localCommands.every((command) =>
        command.localOnly === true &&
        command.requiresSecret === false &&
        command.outwardAction === false &&
        command.executionAllowed === false &&
        command.executed === false &&
        command.outputReturned === false
      )) {
    failures.push(`${label} local delivery quickstart commands are not metadata-only`);
  }
  if (!Array.isArray(report.localRoutes) ||
      report.localRoutes.length < 6 ||
      !report.localRoutes.every((route) => route.localOnly === true && route.requiresSecret === false && route.outwardAction === false && route.contentReturned === false)) {
    failures.push(`${label} local delivery quickstart routes are not metadata-only`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 10 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} local delivery quickstart evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} local delivery quickstart did not preserve three open T3 gaps`);
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
    failures.push(`${label} local delivery quickstart guardrails are not blocked`);
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
