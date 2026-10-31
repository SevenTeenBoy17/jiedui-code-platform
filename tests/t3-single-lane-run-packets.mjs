import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3210);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3v-t3-single-lane-run-packets.json";
const outputMarkdownPath = "qa-artifacts/phase3v-t3-single-lane-run-packets.md";

const cli = spawnSync(process.execPath, ["scripts/t3-single-lane-run-packets.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 single-lane run packets CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1800) {
  failures.push("Phase 3V JSON run-packet artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 900) {
  failures.push("Phase 3V Markdown run-packet artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertRunPackets(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3V T3 Single-Lane Run Packets") ||
      !markdown.includes("Execution allowed: **no**") ||
      !markdown.includes("Ready for production release: **no**") ||
      !markdown.includes("Final goal complete: **no**")) {
    failures.push("Phase 3V Markdown summary missing blocked release guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3V Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3V offline artifacts exposed a key-shaped token or secret assignment");
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

  const runPackets = await request("/api/delivery/t3-single-lane-run-packets");
  assertRunPackets(runPackets, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3SingleLaneRunPacketStatus !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      report.t3SingleLaneRunPacketOnly !== true ||
      report.t3SingleLaneRunPacketReadyForHumanReview !== true ||
      report.t3SingleLaneRunPacketReadyForProductionRelease !== false ||
      report.t3SingleLaneRunPacketExecutionAllowed !== false ||
      report.t3SingleLaneRunPacketOpenT3GapCount !== 3 ||
      report.t3SingleLaneRunPacketCount !== 3 ||
      report.t3SingleLaneRunPacketReadyCount !== 3 ||
      report.t3SingleLaneRunPacketEvidenceRequirementCount < 15 ||
      report.t3SingleLaneRunPacketRollbackRequirementCount < 9 ||
      report.t3SingleLaneRunPacketFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3SingleLaneRunPacketHash || "")) {
    failures.push("report export missing Phase 3V run-packet fields");
  }

  const exposed = JSON.stringify({ runPackets, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3V endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3V endpoint or report exposed a key-shaped token or secret assignment");
  }
  if (/"body"\s*:|artifactBodyContent"\s*:|evidenceBody"\s*:|screenshotBytes"\s*:/.test(exposed)) {
    failures.push("Phase 3V endpoint or report exposed body content or screenshot byte fields");
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

console.log("T3 single-lane run-packets QA passed: artifacts, endpoint/report fields, three packets, T3 blocked, finalGoalComplete=false, and no secret exposure.");

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

function assertRunPackets(report, label) {
  if (report.phase !== "3V" ||
      report.status !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      report.finalGoalComplete !== false ||
      report.runPacketsOnly !== true ||
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
      report.packetCount !== 3 ||
      report.readyPacketCount !== 3 ||
      report.evidenceRequirementCount < 15 ||
      report.rollbackRequirementCount < 9 ||
      !/^[a-f0-9]{64}$/.test(report.runPacketBundleHash || "")) {
    failures.push(`${label} run-packet report has invalid top-level fields`);
  }
  if (!Array.isArray(report.runPackets) ||
      report.runPackets.length !== 3 ||
      !report.runPackets.every((packet) =>
        ["runtime", "database", "provider"].includes(packet.laneId) &&
        packet.riskTier === "T3" &&
        packet.packetReady === true &&
        packet.approvalRequired === true &&
        packet.singleLaneOnly === true &&
        packet.executionAllowed === false &&
        packet.certificationStateChanged === false &&
        packet.finalGoalComplete === false &&
        packet.evidenceIds.length >= 5 &&
        packet.rollbackIds.length >= 3 &&
        packet.approvalContract?.approvalTextContentAllowed === false &&
        packet.executionWindow?.runExactlyOnce === true &&
        /^[a-f0-9]{64}$/.test(packet.packetHash || "")
      )) {
    failures.push(`${label} run packets are not ready/blocked metadata lanes`);
  }
  if (!Array.isArray(report.evidenceFiles) ||
      report.evidenceFiles.length < 5 ||
      !report.evidenceFiles.every((file) => file.exists && file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256 || ""))) {
    failures.push(`${label} run-packet evidence files missing hash metadata`);
  }
  if (!Array.isArray(report.openCertificationGaps) ||
      report.openCertificationGaps.length !== 3 ||
      !report.openCertificationGaps.every((gap) => gap.riskTier === "T3" && gap.status === "open")) {
    failures.push(`${label} run packets did not preserve three open T3 gaps`);
  }
  if (report.productionReleaseGate?.canRelease !== false ||
      report.productionReleaseGate?.currentClosedGapCount !== 0) {
    failures.push(`${label} run-packet production release gate is not blocked`);
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.deployments !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} run-packet guardrails are not blocked`);
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
