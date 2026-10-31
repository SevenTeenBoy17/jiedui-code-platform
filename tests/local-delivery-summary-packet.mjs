import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3239);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4e-local-delivery-summary-packet.json";
const outputMarkdownPath = "qa-artifacts/phase4e-local-delivery-summary-packet.md";

const cli = spawnSync(process.execPath, ["scripts/local-delivery-summary-packet.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`local delivery summary packet CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 3000) {
  failures.push("Phase 4E JSON local delivery summary packet artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 4E Markdown local delivery summary packet artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertSummary(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4E Local Delivery Summary Packet") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| student-acceptance-summary | ready-local | yes |")) {
    failures.push("Phase 4E Markdown summary missing delivery guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4E Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4E offline artifacts exposed a key-shaped token or secret assignment");
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

  const summary = await request("/api/delivery/local-summary-packet");
  assertSummary(summary, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.localDeliverySummaryStatus !== "local-delivery-summary-ready-open-t3" ||
      report.localDeliverySummaryOnly !== true ||
      report.localDeliverySummaryLocalPassed !== true ||
      report.localDeliverySummaryReadyForHumanDelivery !== true ||
      report.localDeliverySummaryReadyForProductionRelease !== false ||
      report.localDeliverySummarySectionCount !== 6 ||
      report.localDeliverySummaryReadySectionCount !== 6 ||
      report.localDeliverySummaryBlockedSectionCount !== 0 ||
      report.localDeliverySummaryOpenT3GapCount !== 3 ||
      report.localDeliverySummaryContentReturned !== false ||
      report.localDeliverySummaryFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliverySummaryHash || "")) {
    failures.push("report export missing Phase 4E local delivery summary fields");
  }

  const exposed = JSON.stringify({ summary, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4E endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4E endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4E endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("Local delivery summary packet QA passed: artifacts, endpoint/report fields, six ready summary sections, finalGoalComplete=false, and no secret exposure.");

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

function assertSummary(report, label) {
  if (report.phase !== "4E" ||
      report.status !== "local-delivery-summary-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.summaryPacketOnly !== true ||
      report.localSummaryPassed !== true ||
      report.readyForHumanDelivery !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.summarySectionCount !== 6 ||
      report.readySummarySectionCount !== 6 ||
      report.blockedSummarySectionCount !== 0 ||
      report.localRequirementCount < 45 ||
      report.provedCheckCount < 66 ||
      report.evidenceFileCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.summaryHash || "")) {
    failures.push(`${label} local delivery summary packet has invalid top-level fields`);
  }
  const sectionIds = (report.sections || []).map((entry) => entry.id);
  for (const id of [
    "product-scope-summary",
    "student-acceptance-summary",
    "teacher-management-summary",
    "research-delivery-summary",
    "visual-agentic-qa-summary",
    "open-t3-gap-summary"
  ]) {
    if (!sectionIds.includes(id)) failures.push(`${label} local delivery summary packet missing section: ${id}`);
  }
  if (!report.sections?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.blockedByT3 === true &&
    entry.executionAllowed === false &&
    entry.contentReturned === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} local delivery summary sections are not ready and safely blocked`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 9 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} local delivery summary evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} local delivery summary did not preserve three open T3 gaps`);
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
    failures.push(`${label} local delivery summary guardrails are not blocked`);
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
