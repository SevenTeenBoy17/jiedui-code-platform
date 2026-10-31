import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3225);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4a-final-acceptance-matrix.json";
const outputMarkdownPath = "qa-artifacts/phase4a-final-acceptance-matrix.md";

const cli = spawnSync(process.execPath, ["scripts/final-acceptance-matrix.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`final acceptance matrix CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2000) {
  failures.push("Phase 4A JSON final acceptance matrix artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 4A Markdown final acceptance matrix artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertAcceptanceMatrix(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4A Final Acceptance Matrix") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| runtime-container-certification | blocked-t3 |")) {
    failures.push("Phase 4A Markdown summary missing acceptance guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4A Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4A offline artifacts exposed a key-shaped token or secret assignment");
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

  const matrix = await request("/api/delivery/final-acceptance-matrix");
  assertAcceptanceMatrix(matrix, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.finalAcceptanceMatrixStatus !== "final-acceptance-matrix-ready-open-t3" ||
      report.finalAcceptanceMatrixOnly !== true ||
      report.finalAcceptanceMatrixLocalPassed !== true ||
      report.finalAcceptanceMatrixRowCount < 13 ||
      report.finalAcceptanceMatrixProvedRowCount < 10 ||
      report.finalAcceptanceMatrixBlockedRowCount !== 3 ||
      report.finalAcceptanceMatrixOpenT3GapCount !== 3 ||
      report.finalAcceptanceMatrixContentReturned !== false ||
      report.finalAcceptanceMatrixFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalAcceptanceMatrixHash || "")) {
    failures.push("report export missing Phase 4A final acceptance matrix fields");
  }

  const exposed = JSON.stringify({ matrix, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4A endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4A endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:/.test(exposed)) {
    failures.push("Phase 4A endpoint or report exposed artifact/evidence/screenshot/approval body fields");
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

console.log("Final acceptance matrix QA passed: artifacts, endpoint/report fields, proved local rows, blocked T3 rows, finalGoalComplete=false, and no secret exposure.");

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

function assertAcceptanceMatrix(report, label) {
  if (report.phase !== "4A" ||
      report.status !== "final-acceptance-matrix-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.acceptanceMatrixOnly !== true ||
      report.localAcceptancePassed !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.acceptanceRowCount < 13 ||
      report.provedRowCount < 10 ||
      report.blockedRowCount !== 3 ||
      report.failedRowCount !== 0 ||
      report.evidenceFileCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.acceptanceHash || "")) {
    failures.push(`${label} final acceptance matrix has invalid top-level fields`);
  }
  const rowIds = (report.rows || []).map((entry) => entry.id);
  for (const id of ["model-routing-fallback", "image-route-separation", "student-workflow", "teacher-workflow", "research-compliance-workflow", "visual-ui-evidence", "three-internal-qa-rounds", "runtime-container-certification", "managed-database-certification", "external-provider-certification"]) {
    if (!rowIds.includes(id)) failures.push(`${label} final acceptance matrix missing row: ${id}`);
  }
  if (!report.rows?.filter((entry) => entry.status === "blocked-t3").every((entry) => entry.passed === true)) {
    failures.push(`${label} final acceptance matrix T3 blocked rows are not tracked as present`);
  }
  if (!report.rows?.filter((entry) => entry.status === "local-proved").every((entry) => entry.passed === true)) {
    failures.push(`${label} final acceptance matrix local rows are not all proved`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 9 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} final acceptance matrix evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} final acceptance matrix did not preserve three open T3 gaps`);
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
    failures.push(`${label} final acceptance matrix guardrails are not blocked`);
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
