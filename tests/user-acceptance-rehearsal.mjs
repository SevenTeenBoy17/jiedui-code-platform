import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3231);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4c-user-acceptance-rehearsal.json";
const outputMarkdownPath = "qa-artifacts/phase4c-user-acceptance-rehearsal.md";

const cli = spawnSync(process.execPath, ["scripts/user-acceptance-rehearsal.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`user acceptance rehearsal CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2500) {
  failures.push("Phase 4C JSON user acceptance rehearsal artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 4C Markdown user acceptance rehearsal artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertRehearsal(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4C User Acceptance Rehearsal") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| student-learning-rehearsal | student | ready-local | yes |")) {
    failures.push("Phase 4C Markdown summary missing rehearsal guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4C Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4C offline artifacts exposed a key-shaped token or secret assignment");
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

  const rehearsal = await request("/api/delivery/user-acceptance-rehearsal");
  assertRehearsal(rehearsal, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.userAcceptanceRehearsalStatus !== "user-acceptance-rehearsal-ready-open-t3" ||
      report.userAcceptanceRehearsalOnly !== true ||
      report.userAcceptanceRehearsalLocalPassed !== true ||
      report.userAcceptanceRehearsalReadyForHumanReview !== true ||
      report.userAcceptanceRehearsalReadyForProductionRelease !== false ||
      report.userAcceptanceRehearsalRehearsalCount !== 3 ||
      report.userAcceptanceRehearsalReadyRehearsalCount !== 3 ||
      report.userAcceptanceRehearsalBlockedRehearsalCount !== 0 ||
      report.userAcceptanceRehearsalOpenT3GapCount !== 3 ||
      report.userAcceptanceRehearsalContentReturned !== false ||
      report.userAcceptanceRehearsalFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.userAcceptanceRehearsalHash || "")) {
    failures.push("report export missing Phase 4C user acceptance rehearsal fields");
  }

  const exposed = JSON.stringify({ rehearsal, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4C endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4C endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:|providerResponse"\s*:|databaseUrl"\s*:/.test(exposed)) {
    failures.push("Phase 4C endpoint or report exposed artifact/evidence/screenshot/provider/database body fields");
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

console.log("User acceptance rehearsal QA passed: artifacts, endpoint/report fields, three ready local rehearsals, finalGoalComplete=false, and no secret exposure.");

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

function assertRehearsal(report, label) {
  if (report.phase !== "4C" ||
      report.status !== "user-acceptance-rehearsal-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.userAcceptanceRehearsalOnly !== true ||
      report.localUserAcceptancePassed !== true ||
      report.readyForHumanReview !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.rehearsalCount !== 3 ||
      report.readyRehearsalCount !== 3 ||
      report.blockedRehearsalCount !== 0 ||
      report.evidenceFileCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.rehearsalHash || "")) {
    failures.push(`${label} user acceptance rehearsal has invalid top-level fields`);
  }
  const rehearsalIds = (report.rehearsals || []).map((entry) => entry.id);
  for (const id of ["student-learning-rehearsal", "teacher-management-rehearsal", "research-delivery-rehearsal"]) {
    if (!rehearsalIds.includes(id)) failures.push(`${label} user acceptance rehearsal missing row: ${id}`);
  }
  if (!report.rehearsals?.every((entry) =>
    entry.status === "ready-local" &&
    entry.localReady === true &&
    entry.finalValueWaited === true &&
    entry.visualEvidenceReady === true &&
    entry.contentQualityReady === true &&
    entry.logicReady === true &&
    entry.blockedByT3 === true &&
    entry.executionAllowed === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} user acceptance rehearsal rows are not locally ready and safely blocked`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 9 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} user acceptance rehearsal evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} user acceptance rehearsal did not preserve three open T3 gaps`);
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
    failures.push(`${label} user acceptance rehearsal guardrails are not blocked`);
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
