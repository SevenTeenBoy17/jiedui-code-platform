import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3207);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3u-t3-certification-next-actions.json";
const outputMarkdownPath = "qa-artifacts/phase3u-t3-certification-next-actions.md";

const cli = spawnSync(process.execPath, ["scripts/t3-certification-next-actions.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 certification next actions CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1500) {
  failures.push("Phase 3U JSON next-actions artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 900) {
  failures.push("Phase 3U Markdown next-actions artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertNextActions(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3U T3 Certification Next Actions") ||
      !markdown.includes("Execution allowed: **no**") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3U Markdown summary missing blocked release guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3U Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3U offline artifacts exposed a key-shaped token or secret assignment");
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

  const nextActions = await request("/api/delivery/t3-certification-next-actions");
  assertNextActions(nextActions, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3CertificationNextActionsStatus !== "t3-certification-next-actions-ready-execution-blocked" ||
      report.t3CertificationNextActionsOnly !== true ||
      report.t3CertificationNextActionsReadyForHumanReview !== true ||
      report.t3CertificationNextActionsReadyForProductionRelease !== false ||
      report.t3CertificationNextActionsExecutionAllowed !== false ||
      report.t3CertificationNextActionsOpenT3GapCount !== 3 ||
      report.t3CertificationNextActionsLaneCount !== 3 ||
      report.t3CertificationNextActionsReadyLaneCount !== 3 ||
      report.t3CertificationNextActionsEvidenceRequirementCount < 15 ||
      report.t3CertificationNextActionsRollbackRequirementCount < 9 ||
      report.t3CertificationNextActionsFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3CertificationNextActionsHash || "")) {
    failures.push("report export missing Phase 3U next-action fields");
  }

  const exposed = JSON.stringify({ nextActions, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3U endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3U endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBody"\s*:|screenshotBytes"\s*:/.test(exposed)) {
    failures.push("Phase 3U endpoint or report exposed body content or screenshot byte fields");
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

console.log("T3 certification next-actions QA passed: artifacts, endpoint/report fields, three lane actions, T3 blocked, finalGoalComplete=false, and no secret exposure.");

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

function assertNextActions(report, label) {
  if (report.phase !== "3U" ||
      report.status !== "t3-certification-next-actions-ready-execution-blocked" ||
      report.finalGoalComplete !== false ||
      report.nextActionsOnly !== true ||
      report.readyForHumanReview !== true ||
      report.readyForProductionRelease !== false ||
      report.localEvidenceReady !== true ||
      report.approvalRequired !== true ||
      report.singleLaneOnly !== true ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.blockedByT3 !== true ||
      report.openT3GapCount !== 3 ||
      report.laneActionCount !== 3 ||
      report.readyLaneActionCount !== 3 ||
      report.evidenceRequirementCount < 15 ||
      report.rollbackRequirementCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.nextActionsHash || "")) {
    failures.push(`${label} next-actions report has invalid top-level fields`);
  }
  if (!Array.isArray(report.laneActions) ||
      report.laneActions.length !== 3 ||
      !report.laneActions.every((lane) =>
        ["runtime", "database", "provider"].includes(lane.laneId) &&
        lane.riskTier === "T3" &&
        lane.actionReady === true &&
        lane.approvalRequired === true &&
        lane.executionAllowed === false &&
        lane.certificationStateChanged === false &&
        lane.finalGoalComplete === false &&
        lane.evidenceRequirementCount >= 5 &&
        lane.rollbackRequirementCount >= 3 &&
        /^[a-f0-9]{64}$/.test(lane.laneHash || "")
      )) {
    failures.push(`${label} next-actions lanes are not ready/blocked metadata lanes`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 5 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} next-actions evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} next-actions did not preserve three open T3 gaps`);
  }
  if (report.productionReleaseGate?.canRelease !== false ||
      report.productionReleaseGate?.currentClosedGapCount !== 0) {
    failures.push(`${label} next-actions production release gate is not blocked`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.deployments !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} next-actions guardrails are not blocked`);
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
