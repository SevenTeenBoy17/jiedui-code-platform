import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3217);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3x-delivery-reviewer-cockpit.json";
const outputMarkdownPath = "qa-artifacts/phase3x-delivery-reviewer-cockpit.md";

const cli = spawnSync(process.execPath, ["scripts/delivery-reviewer-cockpit.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`delivery reviewer cockpit CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2000) {
  failures.push("Phase 3X JSON reviewer cockpit artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 3X Markdown reviewer cockpit artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertReviewerCockpit(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3X Delivery Reviewer Cockpit") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3X Markdown summary missing cockpit guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3X Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3X offline artifacts exposed a key-shaped token or secret assignment");
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

  const cockpit = await request("/api/delivery/reviewer-cockpit");
  assertReviewerCockpit(cockpit, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryReviewerCockpitStatus !== "reviewer-cockpit-ready-open-t3" ||
      report.deliveryReviewerCockpitOnly !== true ||
      report.deliveryReviewerCockpitReadyForHumanReview !== true ||
      report.deliveryReviewerCockpitReadyForProductionRelease !== false ||
      report.deliveryReviewerCockpitSectionCount !== 8 ||
      report.deliveryReviewerCockpitReadySectionCount !== 7 ||
      report.deliveryReviewerCockpitBlockedSectionCount !== 1 ||
      report.deliveryReviewerCockpitOpenT3GapCount !== 3 ||
      report.deliveryReviewerCockpitContentReturned !== false ||
      report.deliveryReviewerCockpitFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryReviewerCockpitHash || "")) {
    failures.push("report export missing Phase 3X reviewer cockpit fields");
  }

  const exposed = JSON.stringify({ cockpit, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3X endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3X endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:/.test(exposed)) {
    failures.push("Phase 3X endpoint or report exposed artifact/evidence/screenshot/approval body fields");
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

console.log("Delivery reviewer cockpit QA passed: artifacts, endpoint/report fields, eight review sections, open T3 gaps, finalGoalComplete=false, and no secret exposure.");

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

function assertReviewerCockpit(report, label) {
  if (report.phase !== "3X" ||
      report.status !== "reviewer-cockpit-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.reviewerCockpitOnly !== true ||
      report.readyForHumanReview !== true ||
      report.readyForProductionRelease !== false ||
      report.localEvidenceReady !== true ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.sectionCount !== 8 ||
      report.readySectionCount !== 7 ||
      report.blockedSectionCount !== 1 ||
      !/^[a-f0-9]{64}$/.test(report.reviewerCockpitHash || "")) {
    failures.push(`${label} reviewer cockpit report has invalid top-level fields`);
  }
  const expectedSections = [
    "local-evidence",
    "agentic-qa",
    "visual-storyboard",
    "artifact-integrity",
    "objective-traceability",
    "release-candidate",
    "t3-run-packet-verifier",
    "production-release-gate"
  ];
  const sectionIds = (report.sections || []).map((section) => section.id);
  for (const id of expectedSections) {
    if (!sectionIds.includes(id)) failures.push(`${label} reviewer cockpit missing section: ${id}`);
  }
  if (!report.sections?.some((section) => section.id === "production-release-gate" && section.status === "blocked-open")) {
    failures.push(`${label} reviewer cockpit did not preserve blocked production-release gate`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 7 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} reviewer cockpit evidence files missing hash metadata`);
  }
  if (report.sourceSummaries?.artifactIndex?.contentReturned !== false ||
      report.sourceSummaries?.agenticReplay?.screenshotBytesReturned !== false ||
      report.sourceSummaries?.visualStoryboard?.screenshotBytesEmbedded !== false ||
      report.sourceSummaries?.releaseCandidate?.readyForProductionRelease !== false ||
      report.sourceSummaries?.runPacketVerifier?.executionAllowed !== false ||
      report.sourceSummaries?.finalReadiness?.finalGoalComplete !== false) {
    failures.push(`${label} reviewer cockpit source summaries lost guardrail state`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} reviewer cockpit did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} reviewer cockpit guardrails are not blocked`);
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
