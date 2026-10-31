import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3234);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4d-delivery-evidence-navigator.json";
const outputMarkdownPath = "qa-artifacts/phase4d-delivery-evidence-navigator.md";

const cli = spawnSync(process.execPath, ["scripts/delivery-evidence-navigator.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`delivery evidence navigator CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 3000) {
  failures.push("Phase 4D JSON delivery evidence navigator artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 4D Markdown delivery evidence navigator artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertNavigator(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4D Delivery Evidence Navigator") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| student-evidence-navigation | ready-local | yes |")) {
    failures.push("Phase 4D Markdown summary missing navigator guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4D Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4D offline artifacts exposed a key-shaped token or secret assignment");
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

  const navigator = await request("/api/delivery/evidence-navigator");
  assertNavigator(navigator, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryEvidenceNavigatorStatus !== "delivery-evidence-navigator-ready-open-t3" ||
      report.deliveryEvidenceNavigatorOnly !== true ||
      report.deliveryEvidenceNavigatorLocalPassed !== true ||
      report.deliveryEvidenceNavigatorReadyForHumanReview !== true ||
      report.deliveryEvidenceNavigatorReadyForProductionRelease !== false ||
      report.deliveryEvidenceNavigatorSectionCount !== 5 ||
      report.deliveryEvidenceNavigatorReadySectionCount !== 5 ||
      report.deliveryEvidenceNavigatorBlockedSectionCount !== 0 ||
      report.deliveryEvidenceNavigatorOpenT3GapCount !== 3 ||
      report.deliveryEvidenceNavigatorContentReturned !== false ||
      report.deliveryEvidenceNavigatorFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryEvidenceNavigatorHash || "")) {
    failures.push("report export missing Phase 4D delivery evidence navigator fields");
  }

  const exposed = JSON.stringify({ navigator, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4D endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4D endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4D endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Delivery evidence navigator QA passed: artifacts, endpoint/report fields, five ready metadata sections, finalGoalComplete=false, and no secret exposure.");

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

function assertNavigator(report, label) {
  if (report.phase !== "4D" ||
      report.status !== "delivery-evidence-navigator-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.deliveryEvidenceNavigatorOnly !== true ||
      report.localNavigationPassed !== true ||
      report.readyForHumanReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.navigationSectionCount !== 5 ||
      report.readyNavigationSectionCount !== 5 ||
      report.blockedNavigationSectionCount !== 0 ||
      report.evidenceFileCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.navigatorHash || "")) {
    failures.push(`${label} delivery evidence navigator has invalid top-level fields`);
  }
  const sectionIds = (report.sections || []).map((entry) => entry.id);
  for (const id of [
    "student-evidence-navigation",
    "teacher-evidence-navigation",
    "research-delivery-navigation",
    "visual-and-agentic-qa-navigation",
    "t3-certification-navigation"
  ]) {
    if (!sectionIds.includes(id)) failures.push(`${label} delivery evidence navigator missing section: ${id}`);
  }
  if (!report.sections?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.evidenceRefCount >= 3 &&
    entry.blockedByT3 === true &&
    entry.executionAllowed === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false &&
    entry.evidenceRefs?.every((ref) => ref.exists && ref.contentReturned === false && /^[a-f0-9]{64}$/.test(ref.sha256 || ""))
  )) {
    failures.push(`${label} delivery evidence navigator sections are not ready metadata-only rows`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 9 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} delivery evidence navigator evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} delivery evidence navigator did not preserve three open T3 gaps`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.screenshotBytesReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.providerResponsesReturned !== false ||
      report.guardrails?.databaseConnectionStringsReturned !== false ||
      report.guardrails?.reviewCommandsExecuted !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.productionRelease !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} delivery evidence navigator guardrails are not blocked`);
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
