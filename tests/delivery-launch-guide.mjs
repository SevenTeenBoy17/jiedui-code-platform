import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3218);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3y-delivery-launch-guide.json";
const outputMarkdownPath = "qa-artifacts/phase3y-delivery-launch-guide.md";

const cli = spawnSync(process.execPath, ["scripts/delivery-launch-guide.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`delivery launch guide CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2000) {
  failures.push("Phase 3Y JSON launch guide artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 3Y Markdown launch guide artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertLaunchGuide(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3Y Delivery Launch Guide") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("npm.cmd run qa:reviewer-cockpit")) {
    failures.push("Phase 3Y Markdown summary missing launch guide guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3Y Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3Y offline artifacts exposed a key-shaped token or secret assignment");
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

  const guide = await request("/api/delivery/launch-guide");
  assertLaunchGuide(guide, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryLaunchGuideStatus !== "delivery-launch-guide-ready-open-t3" ||
      report.deliveryLaunchGuideOnly !== true ||
      report.deliveryLaunchGuideReadyForLocalReview !== true ||
      report.deliveryLaunchGuideReadyForProductionRelease !== false ||
      report.deliveryLaunchGuideCommandCount < 7 ||
      report.deliveryLaunchGuideRouteCount < 5 ||
      report.deliveryLaunchGuideOpenT3GapCount !== 3 ||
      report.deliveryLaunchGuideContentReturned !== false ||
      report.deliveryLaunchGuideFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryLaunchGuideHash || "")) {
    failures.push("report export missing Phase 3Y launch guide fields");
  }

  const exposed = JSON.stringify({ guide, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3Y endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3Y endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:/.test(exposed)) {
    failures.push("Phase 3Y endpoint or report exposed artifact/evidence/screenshot/approval body fields");
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

console.log("Delivery launch guide QA passed: artifacts, endpoint/report fields, local commands/routes/evidence files, open T3 gaps, finalGoalComplete=false, and no secret exposure.");

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

function assertLaunchGuide(report, label) {
  if (report.phase !== "3Y" ||
      report.status !== "delivery-launch-guide-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.launchGuideOnly !== true ||
      report.readyForLocalReview !== true ||
      report.readyForProductionRelease !== false ||
      report.localEvidenceReady !== true ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.commandCount < 7 ||
      report.routeCount < 5 ||
      report.evidenceFileCount < 6 ||
      !/^[a-f0-9]{64}$/.test(report.launchGuideHash || "")) {
    failures.push(`${label} launch guide report has invalid top-level fields`);
  }
  const commandText = (report.reviewCommands || []).map((entry) => entry.command).join("\n");
  for (const marker of ["qa:reviewer-cockpit", "qa:api", "qa:agentic", "qa:completion"]) {
    if (!commandText.includes(marker)) failures.push(`${label} launch guide missing command marker: ${marker}`);
  }
  if (/deploy|publish|force-push|billing|send\s+mail|curl\s+https?:\/\/(?!127\.0\.0\.1|localhost)|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(commandText)) {
    failures.push(`${label} launch guide contains outward or secret-bearing command text`);
  }
  const routeText = (report.reviewRoutes || []).map((entry) => entry.route).join("\n");
  if (!routeText.includes("#research") ||
      !routeText.includes("/api/delivery/reviewer-cockpit") ||
      !routeText.includes("/api/delivery/launch-guide")) {
    failures.push(`${label} launch guide missing local review routes`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 6 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} launch guide evidence files missing hash metadata`);
  }
  if (report.sourceSummaries?.reviewerCockpit?.readyForProductionRelease !== false ||
      report.sourceSummaries?.releaseCandidate?.readyForProductionRelease !== false ||
      report.sourceSummaries?.finalReadiness?.finalGoalComplete !== false) {
    failures.push(`${label} launch guide source summaries lost blocked state`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} launch guide did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.productionRelease !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} launch guide guardrails are not blocked`);
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
