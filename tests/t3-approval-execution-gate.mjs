import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const port = Number(process.env.PORT || 3185);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3l-t3-approval-execution-gate.json";
const outputMarkdownPath = "qa-artifacts/phase3l-t3-approval-execution-gate.md";

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-approval-execution-gate.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`approval execution gate CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1100) {
  failures.push("Phase 3L JSON approval execution gate artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3L Markdown approval execution gate artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertGateReport(artifactReport, "offline artifact", false);
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3L T3 Approval Execution Gate") ||
      !markdown.includes("Gate only: **yes**") ||
      !markdown.includes("Approval recorded: **no**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3L Markdown summary missing required guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3L Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3L offline artifacts exposed a key-shaped token or secret assignment");
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
  for (let i = 0; i < 30; i += 1) {
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {
      await wait(250);
    }
  }
  if (!ready) throw new Error(`server not ready: ${serverLog}`);

  const candidates = await request("/api/delivery/t3-approval-candidates");
  const endpointReport = await request("/api/delivery/t3-approval-execution-gate");
  assertGateReport(endpointReport, "endpoint", false);

  const validCandidate = candidates.candidates?.[0];
  const bound = await request("/api/delivery/t3-approval-execution-gate", {
    method: "POST",
    body: JSON.stringify({
      laneId: validCandidate.laneId,
      approvalLockHash: validCandidate.approvalLockHash,
      approvalTextHash: validCandidate.approvalTextHash
    })
  });
  assertGateReport(bound, "bound candidate", true);
  if (bound.boundLaneId !== validCandidate.laneId ||
      bound.candidate.bound !== true ||
      bound.candidate.verificationPassed !== true) {
    failures.push("Phase 3L valid candidate was not bound to the execution gate");
  }

  const rejected = await request("/api/delivery/t3-approval-execution-gate", {
    method: "POST",
    body: JSON.stringify({
      laneId: "unknown",
      approvalLockHash: validCandidate.approvalLockHash,
      approvalTextHash: validCandidate.approvalTextHash
    })
  });
  if (rejected.status !== "approval-execution-gate-rejected-execution-blocked" ||
      rejected.candidate.bound !== false ||
      rejected.executionAllowed !== false ||
      !rejected.candidate.rejectionReasons.includes("candidate-not-in-current-bundle")) {
    failures.push("Phase 3L invalid candidate was not rejected safely");
  }

  const secretRejected = await request("/api/delivery/t3-approval-execution-gate", {
    method: "POST",
    body: JSON.stringify({
      laneId: validCandidate.laneId,
      approvalLockHash: validCandidate.approvalLockHash,
      approvalTextHash: validCandidate.approvalTextHash,
      note: ["sk", "redacted-example-value-with-many-characters"].join("-")
    })
  });
  if (secretRejected.status !== "approval-execution-gate-rejected-execution-blocked" ||
      secretRejected.candidate.secretExposure !== true ||
      secretRejected.executionAllowed !== false) {
    failures.push("Phase 3L secret-like candidate was not rejected safely");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalExecutionGateStatus !== "approval-execution-gate-ready-execution-blocked" ||
      report.t3ApprovalExecutionGateOnly !== true ||
      report.t3ApprovalExecutionGateLaneCount !== 3 ||
      report.t3ApprovalExecutionGateReadyLaneCount !== 3 ||
      report.t3ApprovalExecutionGateBoundCandidateCount !== 0 ||
      report.t3ApprovalExecutionGateExecutionAllowed !== false ||
      report.t3ApprovalExecutionGateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalExecutionGateHash || "")) {
    failures.push("report export missing Phase 3L T3 approval execution gate fields");
  }

  const serialized = JSON.stringify({ endpointReport, bound, rejected, secretRejected, report });
  if (serialized.includes("I explicitly approve only the")) {
    failures.push("Phase 3L endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3L endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 approval execution gate QA passed: gate artifacts, GET/POST candidate binding, rejection paths, report fields, finalGoalComplete=false, no approval text content, and no secret exposure.");

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

function assertGateReport(report, label, boundExpected) {
  const expectedStatus = boundExpected
    ? "approval-execution-gate-candidate-bound-execution-blocked"
    : "approval-execution-gate-ready-execution-blocked";
  if (report.phase !== "3L" ||
      report.status !== expectedStatus ||
      report.finalGoalComplete !== false ||
      report.gateOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.candidateBundleStatus !== "approval-candidates-ready-execution-blocked" ||
      report.laneGateCount !== 3 ||
      report.readyLaneGateCount !== 3 ||
      report.boundCandidateCount !== (boundExpected ? 1 : 0) ||
      !/^[a-f0-9]{64}$/.test(report.candidateBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.approvalLockHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.executionGateHash || "")) {
    failures.push(`${label} approval execution gate report has invalid top-level fields`);
  }
  for (const lane of report.gateLanes || []) {
    if (lane.riskTier !== "T3" ||
        lane.metadataVerified !== true ||
        lane.preExecutionChecksPassed !== true ||
        lane.approvalRecorded !== false ||
        lane.approved !== false ||
        lane.executionAllowed !== false ||
        lane.certificationStateChanged !== false ||
        lane.externalActionsExecuted !== false ||
        !Array.isArray(lane.requiredEvidence) ||
        lane.requiredEvidence.length < 5 ||
        !Array.isArray(lane.rollbackChecks) ||
        lane.rollbackChecks.length < 3 ||
        !Array.isArray(lane.prohibitedActions) ||
        !lane.prohibitedActions.includes("execute-certification")) {
      failures.push(`${label} invalid lane gate for ${lane.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.approvalRecorded !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} approval execution gate guardrails do not preserve blocked T3 state`);
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
