import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3272);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4i-final-local-handoff-checkpoint.json";
const outputMarkdownPath = "qa-artifacts/phase4i-final-local-handoff-checkpoint.md";

const cli = spawnSync(process.execPath, ["scripts/final-local-handoff-checkpoint.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`final local handoff checkpoint CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 5200) {
  failures.push("Phase 4I JSON final local handoff checkpoint artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1800) {
  failures.push("Phase 4I Markdown final local handoff checkpoint artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertCheckpoint(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4I Final Local Handoff Checkpoint") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("npm.cmd run qa:final-handoff-checkpoint") ||
      !markdown.includes("qa-artifacts/phase4h-local-delivery-verification-suite.json")) {
    failures.push("Phase 4I Markdown checkpoint missing local handoff guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4I Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4I offline artifacts exposed a key-shaped token or secret assignment");
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

  const checkpoint = await request("/api/delivery/final-local-handoff-checkpoint");
  assertCheckpoint(checkpoint, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.finalLocalHandoffCheckpointStatus !== "final-local-handoff-checkpoint-ready-open-t3" ||
      report.finalLocalHandoffCheckpointOnly !== true ||
      report.finalLocalHandoffCheckpointLocalPassed !== true ||
      report.finalLocalHandoffCheckpointReadyForFinalLocalReview !== true ||
      report.finalLocalHandoffCheckpointReadyForProductionRelease !== false ||
      report.finalLocalHandoffCheckpointStepCount !== 8 ||
      report.finalLocalHandoffCheckpointReadyStepCount !== 8 ||
      report.finalLocalHandoffCheckpointBlockedStepCount !== 0 ||
      report.finalLocalHandoffCheckpointLocalCommandCount !== 8 ||
      report.finalLocalHandoffCheckpointArtifactCount < 13 ||
      report.finalLocalHandoffCheckpointLocalRequirementCount < 49 ||
      report.finalLocalHandoffCheckpointProvedCheckCount < 70 ||
      report.finalLocalHandoffCheckpointOpenT3GapCount !== 3 ||
      report.finalLocalHandoffCheckpointContentReturned !== false ||
      report.finalLocalHandoffCheckpointFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalLocalHandoffCheckpointHash || "")) {
    failures.push("report export missing Phase 4I final local handoff checkpoint fields");
  }

  const exposed = JSON.stringify({ checkpoint, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4I endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4I endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4I endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Final local handoff checkpoint QA passed: artifacts, endpoint/report fields, ordered checkpoint steps, command metadata, finalGoalComplete=false, and no secret exposure.");

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

function assertCheckpoint(report, label) {
  if (report.phase !== "4I" ||
      report.status !== "final-local-handoff-checkpoint-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.checkpointOnly !== true ||
      report.localFinalHandoffPassed !== true ||
      report.readyForFinalLocalReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.checkpointStepCount !== 8 ||
      report.readyCheckpointStepCount !== 8 ||
      report.blockedCheckpointStepCount !== 0 ||
      report.localCommandCount !== 8 ||
      report.handoffArtifactCount < 13 ||
      report.localRequirementCount < 49 ||
      report.provedCheckCount < 70 ||
      !/^[a-f0-9]{64}$/.test(report.checkpointHash || "")) {
    failures.push(`${label} final local handoff checkpoint has invalid top-level fields`);
  }
  const stepIds = (report.checkpointSteps || []).map((entry) => entry.id);
  for (const id of [
    "phase4h-verification-suite-ready",
    "final-checkpoint-command-registered",
    "local-completion-audit-ready",
    "agentic-audit-ready",
    "handoff-artifacts-hashed",
    "single-lane-t3-packets-ready",
    "open-t3-gaps-preserved"
  ]) {
    if (!stepIds.includes(id)) failures.push(`${label} final local handoff checkpoint missing step: ${id}`);
  }
  if (!report.checkpointSteps?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.executionAllowed === false &&
    entry.executed === false &&
    entry.outputReturned === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} final local handoff checkpoint steps are not ready and safely blocked`);
  }
  if (!Array.isArray(report.localCommands) ||
      report.localCommands.length !== 8 ||
      !report.localCommands.every((command) =>
        command.localOnly === true &&
        command.requiresSecret === false &&
        command.outwardAction === false &&
        command.executionAllowed === false &&
        command.executed === false &&
        command.outputReturned === false
      )) {
    failures.push(`${label} final local handoff checkpoint commands are not metadata-only`);
  }
  if (!Array.isArray(report.handoffArtifacts) ||
      report.handoffArtifacts.length < 13 ||
      !report.handoffArtifacts.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} final local handoff checkpoint artifacts missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} final local handoff checkpoint did not preserve three open T3 gaps`);
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
    failures.push(`${label} final local handoff checkpoint guardrails are not blocked`);
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
