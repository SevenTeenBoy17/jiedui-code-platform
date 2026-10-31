import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3252);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4f-local-delivery-handoff-brief.json";
const outputMarkdownPath = "qa-artifacts/phase4f-local-delivery-handoff-brief.md";

const cli = spawnSync(process.execPath, ["scripts/local-delivery-handoff-brief.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`local delivery handoff brief CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 3500) {
  failures.push("Phase 4F JSON local delivery handoff brief artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1200) {
  failures.push("Phase 4F Markdown local delivery handoff brief artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertBrief(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4F Local Delivery Handoff Brief") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| local-run-commands | ready-local | yes |") ||
      !markdown.includes("npm.cmd run qa:handoff-brief")) {
    failures.push("Phase 4F Markdown brief missing handoff guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4F Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4F offline artifacts exposed a key-shaped token or secret assignment");
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

  const brief = await request("/api/delivery/handoff-brief");
  assertBrief(brief, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.localDeliveryHandoffBriefStatus !== "local-delivery-handoff-brief-ready-open-t3" ||
      report.localDeliveryHandoffBriefOnly !== true ||
      report.localDeliveryHandoffBriefLocalPassed !== true ||
      report.localDeliveryHandoffBriefReadyForUserReview !== true ||
      report.localDeliveryHandoffBriefReadyForProductionRelease !== false ||
      report.localDeliveryHandoffBriefSectionCount !== 6 ||
      report.localDeliveryHandoffBriefReadySectionCount !== 6 ||
      report.localDeliveryHandoffBriefBlockedSectionCount !== 0 ||
      report.localDeliveryHandoffBriefLocalCommandCount < 5 ||
      report.localDeliveryHandoffBriefLocalRequirementCount < 46 ||
      report.localDeliveryHandoffBriefProvedCheckCount < 67 ||
      report.localDeliveryHandoffBriefOpenT3GapCount !== 3 ||
      report.localDeliveryHandoffBriefContentReturned !== false ||
      report.localDeliveryHandoffBriefFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryHandoffBriefHash || "")) {
    failures.push("report export missing Phase 4F local delivery handoff brief fields");
  }

  const exposed = JSON.stringify({ brief, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4F endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4F endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4F endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Local delivery handoff brief QA passed: artifacts, endpoint/report fields, six ready sections, local command metadata, finalGoalComplete=false, and no secret exposure.");

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

function assertBrief(report, label) {
  if (report.phase !== "4F" ||
      report.status !== "local-delivery-handoff-brief-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.handoffBriefOnly !== true ||
      report.localHandoffPassed !== true ||
      report.readyForUserReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.briefSectionCount !== 6 ||
      report.readyBriefSectionCount !== 6 ||
      report.blockedBriefSectionCount !== 0 ||
      report.localCommandCount < 5 ||
      report.localRequirementCount < 46 ||
      report.provedCheckCount < 67 ||
      report.evidenceFileCount < 8 ||
      !/^[a-f0-9]{64}$/.test(report.briefHash || "")) {
    failures.push(`${label} local delivery handoff brief has invalid top-level fields`);
  }
  const sectionIds = (report.sections || []).map((entry) => entry.id);
  for (const id of [
    "handoff-entrypoints",
    "local-run-commands",
    "student-teacher-review",
    "qa-evidence",
    "delivery-artifacts",
    "t3-boundary"
  ]) {
    if (!sectionIds.includes(id)) failures.push(`${label} local delivery handoff brief missing section: ${id}`);
  }
  if (!report.sections?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.blockedByT3 === true &&
    entry.executionAllowed === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} local delivery handoff sections are not ready and safely blocked`);
  }
  if (!Array.isArray(report.localCommands) ||
      report.localCommands.length < 5 ||
      !report.localCommands.every((command) =>
        command.localOnly === true &&
        command.requiresSecret === false &&
        command.outwardAction === false &&
        command.executionAllowed === false &&
        command.executed === false &&
        command.outputReturned === false
      )) {
    failures.push(`${label} local delivery handoff commands are not metadata-only`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 8 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} local delivery handoff evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} local delivery handoff did not preserve three open T3 gaps`);
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
    failures.push(`${label} local delivery handoff guardrails are not blocked`);
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
