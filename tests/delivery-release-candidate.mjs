import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3204);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3t-delivery-release-candidate.json";
const outputMarkdownPath = "qa-artifacts/phase3t-delivery-release-candidate.md";

const cli = spawnSync(process.execPath, ["scripts/delivery-release-candidate.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`delivery release candidate CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1500) {
  failures.push("Phase 3T JSON release candidate artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 900) {
  failures.push("Phase 3T Markdown release candidate artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertReleaseCandidate(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3T Delivery Release Candidate") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3T Markdown summary missing release-candidate guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3T Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3T offline artifacts exposed a key-shaped token or secret assignment");
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

  const releaseCandidate = await request("/api/delivery/release-candidate");
  assertReleaseCandidate(releaseCandidate, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.releaseCandidateStatus !== "release-candidate-local-evidence-ready-open-t3" ||
      report.releaseCandidateOnly !== true ||
      report.releaseCandidateReadyForHumanReview !== true ||
      report.releaseCandidateReadyForProductionRelease !== false ||
      report.releaseCandidateLocalEvidenceReady !== true ||
      report.releaseCandidateOpenT3GapCount !== 3 ||
      report.releaseCandidateCheckCount < 6 ||
      report.releaseCandidateReadyCheckCount < 5 ||
      report.releaseCandidateBlockedCheckCount !== 1 ||
      report.releaseCandidateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.releaseCandidateHash || "")) {
    failures.push("report export missing Phase 3T release candidate fields");
  }

  const exposed = JSON.stringify({ releaseCandidate, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3T endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3T endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|screenshotBytes"\s*:/.test(exposed)) {
    failures.push("Phase 3T endpoint or report exposed artifact body or screenshot byte fields");
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

console.log("Delivery release candidate QA passed: artifacts, endpoint/report fields, local evidence ready, T3 blocked, finalGoalComplete=false, and no secret exposure.");

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

function assertReleaseCandidate(report, label) {
  if (report.phase !== "3T" ||
      report.status !== "release-candidate-local-evidence-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.releaseCandidateOnly !== true ||
      report.readyForHumanReview !== true ||
      report.readyForProductionRelease !== false ||
      report.localEvidenceReady !== true ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.releaseCheckCount < 6 ||
      report.readyReleaseCheckCount < 5 ||
      report.blockedReleaseCheckCount !== 1 ||
      !/^[a-f0-9]{64}$/.test(report.releaseCandidateHash || "")) {
    failures.push(`${label} release candidate report has invalid top-level fields`);
  }
  if (!Array.isArray(report.releaseChecks) ||
      !report.releaseChecks.some((check) => check.id === "visual-storyboard" && check.status === "ready") ||
      !report.releaseChecks.some((check) => check.id === "t3-certification-gate" && check.status === "blocked-open")) {
    failures.push(`${label} release candidate checks did not preserve visual evidence plus T3 block`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 7 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} release candidate evidence files missing hash metadata`);
  }
  if (report.sourceSummaries?.visualStoryboard?.screenshotBytesEmbedded !== false ||
      report.sourceSummaries?.artifactIndex?.contentReturned !== false ||
      report.sourceSummaries?.traceability?.openRequirementCount !== 3 ||
      report.sourceSummaries?.finalReadiness?.finalGoalComplete !== false) {
    failures.push(`${label} release candidate source summaries lost guardrail state`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} release candidate did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} release candidate guardrails are not blocked`);
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
