import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3228);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase4b-certification-blocker-board.json";
const outputMarkdownPath = "qa-artifacts/phase4b-certification-blocker-board.md";

const cli = spawnSync(process.execPath, ["scripts/certification-blocker-board.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`certification blocker board CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 2500) {
  failures.push("Phase 4B JSON certification blocker board artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 1000) {
  failures.push("Phase 4B Markdown certification blocker board artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertBlockerBoard(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 4B Certification Blocker Board") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**") ||
      !markdown.includes("| container-runtime-certification | runtime | open |")) {
    failures.push("Phase 4B Markdown summary missing blocker guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 4B Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 4B offline artifacts exposed a key-shaped token or secret assignment");
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

  const board = await request("/api/delivery/certification-blocker-board");
  assertBlockerBoard(board, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.certificationBlockerBoardStatus !== "certification-blocker-board-ready-open-t3" ||
      report.certificationBlockerBoardOnly !== true ||
      report.certificationBlockerBoardLocalPassed !== true ||
      report.certificationBlockerBoardBlockerCount !== 3 ||
      report.certificationBlockerBoardReadyBlockerCount !== 3 ||
      report.certificationBlockerBoardClosedBlockerCount !== 0 ||
      report.certificationBlockerBoardOpenT3GapCount !== 3 ||
      report.certificationBlockerBoardContentReturned !== false ||
      report.certificationBlockerBoardFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.certificationBlockerBoardHash || "")) {
    failures.push("report export missing Phase 4B certification blocker board fields");
  }

  const exposed = JSON.stringify({ board, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 4B endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 4B endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBodyContent"\s*:|screenshotBytes"\s*:|approvalTextContent"\s*:/.test(exposed)) {
    failures.push("Phase 4B endpoint or report exposed artifact/evidence/screenshot/approval body fields");
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

console.log("Certification blocker board QA passed: artifacts, endpoint/report fields, three open ready blockers, finalGoalComplete=false, and no secret exposure.");

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

function assertBlockerBoard(report, label) {
  if (report.phase !== "4B" ||
      report.status !== "certification-blocker-board-ready-open-t3" ||
      report.finalGoalComplete !== false ||
      report.blockerBoardOnly !== true ||
      report.localBoardPassed !== true ||
      report.readyForProductionRelease !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.contentReturned !== false ||
      report.blockerCount !== 3 ||
      report.readyBlockerCount !== 3 ||
      report.closedBlockerCount !== 0 ||
      report.laneTrackCount !== 3 ||
      report.nextActionCount !== 3 ||
      report.evidenceFileCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.boardHash || "")) {
    failures.push(`${label} certification blocker board has invalid top-level fields`);
  }
  const blockerIds = (report.blockers || []).map((entry) => entry.id);
  for (const id of ["container-runtime-certification", "managed-database-certification", "external-provider-certification"]) {
    if (!blockerIds.includes(id)) failures.push(`${label} certification blocker board missing blocker: ${id}`);
  }
  if (!report.blockers?.every((entry) =>
    entry.status === "open" &&
    entry.riskTier === "T3" &&
    entry.localReady === true &&
    entry.approvalRequired === true &&
    entry.singleLaneOnly === true &&
    entry.cannotAutoRun === true &&
    entry.approvalRecorded === false &&
    entry.executionAllowed === false &&
    entry.externalActionsExecuted === false &&
    entry.certificationStateChanged === false &&
    entry.finalGoalComplete === false
  )) {
    failures.push(`${label} certification blocker board rows are not safely blocked`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 9 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} certification blocker board evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} certification blocker board did not preserve three open T3 gaps`);
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
    failures.push(`${label} certification blocker board guardrails are not blocked`);
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
