import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3219);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3z-delivery-consistency-sentinel.json";
const outputMarkdownPath = "qa-artifacts/phase3z-delivery-consistency-sentinel.md";

const cli = spawnSync(process.execPath, ["scripts/delivery-consistency-sentinel.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`delivery consistency sentinel CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2000) {
  failures.push("Phase 3Z JSON consistency sentinel artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 3Z Markdown consistency sentinel artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertConsistencySentinel(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3Z Delivery Consistency Sentinel") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| launch-guide-ready | pass |")) {
    failures.push("Phase 3Z Markdown summary missing sentinel guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3Z Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3Z offline artifacts exposed a key-shaped token or secret assignment");
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

  const sentinel = await request("/api/delivery/consistency-sentinel");
  assertConsistencySentinel(sentinel, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryConsistencySentinelStatus !== "delivery-consistency-sentinel-ready-open-t3" ||
      report.deliveryConsistencySentinelOnly !== true ||
      report.deliveryConsistencySentinelPassed !== true ||
      report.deliveryConsistencySentinelSurfaceCount < 7 ||
      report.deliveryConsistencySentinelInvariantCount < 7 ||
      report.deliveryConsistencySentinelContradictionCount !== 0 ||
      report.deliveryConsistencySentinelOpenT3GapCount !== 3 ||
      report.deliveryConsistencySentinelContentReturned !== false ||
      report.deliveryConsistencySentinelFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryConsistencySentinelHash || "")) {
    failures.push("report export missing Phase 3Z consistency sentinel fields");
  }

  const exposed = JSON.stringify({ sentinel, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3Z endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3Z endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:/.test(exposed)) {
    failures.push("Phase 3Z endpoint or report exposed artifact/evidence/screenshot/approval body fields");
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

console.log("Delivery consistency sentinel QA passed: artifacts, endpoint/report fields, zero contradictions, open T3 gaps, finalGoalComplete=false, and no secret exposure.");

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

function assertConsistencySentinel(report, label) {
  if (report.phase !== "3Z" ||
      report.status !== "delivery-consistency-sentinel-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.sentinelOnly !== true ||
      report.consistencyPassed !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.contradictionCount !== 0 ||
      report.surfaceCount < 7 ||
      report.invariantCount < 7 ||
      report.evidenceFileCount < 8 ||
      !/^[a-f0-9]{64}$/.test(report.consistencyHash || "")) {
    failures.push(`${label} consistency sentinel report has invalid top-level fields`);
  }
  const surfaceIds = (report.surfaces || []).map((entry) => entry.id);
  for (const id of ["final-readiness", "release-candidate", "reviewer-cockpit", "delivery-launch-guide", "completion-audit", "agentic-audit"]) {
    if (!surfaceIds.includes(id)) failures.push(`${label} consistency sentinel missing surface: ${id}`);
  }
  const invariantIds = (report.invariants || []).map((entry) => entry.id);
  for (const id of ["final-goal-blocked", "production-release-blocked", "execution-blocked", "content-return-blocked", "three-open-t3-gaps", "required-evidence-hashed", "launch-guide-ready"]) {
    if (!invariantIds.includes(id)) failures.push(`${label} consistency sentinel missing invariant: ${id}`);
  }
  if (!report.invariants?.every((entry) => entry.passed === true)) {
    failures.push(`${label} consistency sentinel has failed invariants`);
  }
  if (!Array.isArray(report.contradictions) || report.contradictions.length !== 0) {
    failures.push(`${label} consistency sentinel reported contradictions`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 8 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} consistency sentinel evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} consistency sentinel did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.reviewCommandsExecuted !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.productionRelease !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} consistency sentinel guardrails are not blocked`);
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
