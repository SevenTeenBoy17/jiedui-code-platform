import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3198);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3r-agentic-qa-replay-dossier.json";
const outputMarkdownPath = "qa-artifacts/phase3r-agentic-qa-replay-dossier.md";

const cli = spawnSync(process.execPath, ["scripts/agentic-qa-replay-dossier.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`Agentic QA replay dossier CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1400) {
  failures.push("Phase 3R JSON replay dossier artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3R Markdown replay dossier artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertReplayDossier(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3R Agentic QA Replay Dossier") ||
      !markdown.includes("Replay only: **yes**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3R Markdown summary missing replay guardrail text");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3R offline artifacts exposed a key-shaped token or secret assignment");
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

  const endpointReport = await request("/api/delivery/agentic-qa-replay");
  assertReplayDossier(endpointReport, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.agenticQaReplayStatus !== "agentic-qa-replay-ready-open-t3" ||
      report.agenticQaReplayOnly !== true ||
      report.agenticQaReplayAgentCount < 4 ||
      report.agenticQaReplayClickRoundCount < 3 ||
      report.agenticQaReplayProvedCheckCount < 53 ||
      report.agenticQaReplayOpenProductGapCount !== 3 ||
      report.agenticQaReplayFinalValueWaitsPassed !== true ||
      report.agenticQaReplayScreenshotHashCount < 5 ||
      report.agenticQaReplayFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.agenticQaReplayHash || "")) {
    failures.push("report export missing Phase 3R agentic QA replay fields");
  }

  const exposed = JSON.stringify({ endpointReport, report });
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3R endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (exposed.includes("\"bytes\"") || exposed.includes("\"content\":\"")) {
    failures.push("Phase 3R endpoint or report returned artifact body content");
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

console.log("Agentic QA replay dossier QA passed: artifacts, endpoint/report fields, replay hashes, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function assertReplayDossier(report, label) {
  if (report.phase !== "3R" ||
      report.status !== "agentic-qa-replay-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.replayOnly !== true ||
      report.contentReturned !== false ||
      report.artifactContentReturned !== false ||
      report.screenshotBytesReturned !== false ||
      report.agentCount < 4 ||
      report.completionCheckCount < 53 ||
      report.provedCheckCount !== report.completionCheckCount ||
      report.openProductGapCount !== 3 ||
      report.clickRoundCount < 3 ||
      report.finalValueWaitsPassed !== true ||
      report.screenshotArtifactCount < 5 ||
      report.readyScreenshotArtifactCount < 5 ||
      report.screenshotHashCount < 5 ||
      !/^[a-f0-9]{64}$/.test(report.replayHash || "")) {
    failures.push(`${label} agentic QA replay dossier has invalid top-level fields`);
  }
  for (const artifact of report.screenshotArtifacts || []) {
    if (artifact.contentReturned !== false ||
        artifact.exists !== true ||
        artifact.sizeBytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256 || "")) {
      failures.push(`${label} invalid screenshot artifact metadata for ${artifact.id || "unknown"}`);
    }
  }
  if (report.guardrails?.artifactContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} replay dossier guardrails are not blocked`);
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
