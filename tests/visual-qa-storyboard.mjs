import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3201);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3s-visual-qa-storyboard.json";
const outputMarkdownPath = "qa-artifacts/phase3s-visual-qa-storyboard.md";

const cli = spawnSync(process.execPath, ["scripts/visual-qa-storyboard.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`Visual QA storyboard CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2500) {
  failures.push("Phase 3S JSON storyboard artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 3S Markdown storyboard artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertStoryboard(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3S Visual QA Storyboard") ||
      !markdown.includes("Storyboard only: **yes**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3S Markdown summary missing storyboard guardrail text");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3S offline artifacts exposed a key-shaped token or secret assignment");
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

  const endpointReport = await request("/api/delivery/visual-storyboard");
  assertStoryboard(endpointReport, "endpoint");

  const firstFrame = endpointReport.frames?.[0];
  if (!firstFrame?.imageSrc) {
    failures.push("visual storyboard did not expose a local image source");
  } else {
    const imageResponse = await fetch(`${base}${firstFrame.imageSrc}`);
    if (!imageResponse.ok || !String(imageResponse.headers.get("content-type") || "").includes("image/png")) {
      failures.push("visual storyboard image source did not serve a PNG screenshot");
    }
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.visualStoryboardStatus !== "visual-storyboard-ready-open-t3" ||
      report.visualStoryboardOnly !== true ||
      report.visualStoryboardSurfaceCount < 5 ||
      report.visualStoryboardReadySurfaceCount !== report.visualStoryboardSurfaceCount ||
      report.visualStoryboardReplayRoundCount < 3 ||
      report.visualStoryboardScreenshotHashCount < 5 ||
      report.visualStoryboardChecksPassed !== true ||
      report.visualStoryboardFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.visualStoryboardHash || "")) {
    failures.push("report export missing Phase 3S visual storyboard fields");
  }

  const exposed = JSON.stringify({ endpointReport, report });
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3S endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (exposed.includes("\"bytes\"") || exposed.includes("\"content\":\"") || exposed.includes("data:image/")) {
    failures.push("Phase 3S endpoint or report embedded screenshot bytes or artifact body content");
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

console.log("Visual QA storyboard QA passed: artifacts, endpoint/report fields, screenshot metadata, local image serving, finalGoalComplete=false, and no secret exposure.");

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

function assertStoryboard(report, label) {
  if (report.phase !== "3S" ||
      report.status !== "visual-storyboard-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.storyboardOnly !== true ||
      report.localVisualEvidence !== true ||
      report.screenshotBytesEmbedded !== false ||
      report.artifactBodyContentReturned !== false ||
      report.surfaceCount < 5 ||
      report.readySurfaceCount !== report.surfaceCount ||
      report.screenshotHashCount < 5 ||
      report.replayRoundCount < 3 ||
      report.provedCheckCount < 54 ||
      report.openProductGapCount !== 3 ||
      report.visualChecksPassed !== true ||
      !/^[a-f0-9]{64}$/.test(report.storyboardHash || "")) {
    failures.push(`${label} visual QA storyboard has invalid top-level fields`);
  }
  const roles = new Set((report.frames || []).map((frame) => frame.role));
  for (const role of ["entry", "student", "teacher", "researcher", "mobile"]) {
    if (!roles.has(role)) failures.push(`${label} visual QA storyboard missing role ${role}`);
  }
  for (const frame of report.frames || []) {
    if (frame.screenshotBytesEmbedded !== false ||
        frame.exists !== true ||
        frame.sizeBytes <= 0 ||
        !frame.imageSrc?.startsWith("/qa-artifacts/") ||
        !/^[a-f0-9]{64}$/.test(frame.sha256 || "")) {
      failures.push(`${label} invalid storyboard frame metadata for ${frame.id || "unknown"}`);
    }
  }
  if (report.guardrails?.screenshotBytesEmbedded !== false ||
      report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} visual storyboard guardrails are not blocked`);
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
