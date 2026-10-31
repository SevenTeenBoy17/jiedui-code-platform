import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const port = Number(process.env.PORT || 3181);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3j-t3-approval-verifier.json";
const outputMarkdownPath = "qa-artifacts/phase3j-t3-approval-verifier.md";
const laneIds = ["runtime", "database", "provider"];

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-approval-verifier.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`approval verifier CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 900) {
  failures.push("Phase 3J JSON approval verifier artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 600) {
  failures.push("Phase 3J Markdown approval verifier artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertVerifierReport(artifactReport, "offline artifact", false);
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3J T3 Approval Verifier") ||
      !markdown.includes("Verifier only: **yes**") ||
      !markdown.includes("Approval recorded: **no**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3J Markdown summary missing required guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3J Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3J offline artifacts exposed a key-shaped token or secret assignment");
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

  const endpointReport = await request("/api/delivery/t3-approval-verifier");
  assertVerifierReport(endpointReport, "endpoint", false);

  const firstLane = endpointReport.laneVerifications?.[0];
  const validCandidateReport = await request("/api/delivery/t3-approval-verifier", {
    method: "POST",
    body: JSON.stringify({
      laneId: firstLane.id,
      approvalLockHash: endpointReport.approvalLockHash,
      approvalTextHash: firstLane.approvalTextHash
    })
  });
  assertVerifierReport(validCandidateReport, "valid candidate endpoint", true);
  if (validCandidateReport.status !== "approval-metadata-verified-execution-blocked" ||
      validCandidateReport.candidate?.lockHashMatches !== true ||
      validCandidateReport.candidate?.approvalTextHashMatches !== true ||
      validCandidateReport.candidate?.secretExposure !== false) {
    failures.push("valid Phase 3J candidate did not verify lock metadata");
  }

  const invalidCandidateReport = await request("/api/delivery/t3-approval-verifier", {
    method: "POST",
    body: JSON.stringify({
      laneId: "provider",
      approvalLockHash: "0".repeat(64),
      approvalTextHash: "1".repeat(64)
    })
  });
  if (invalidCandidateReport.status !== "approval-verifier-rejected-execution-blocked" ||
      invalidCandidateReport.verificationPassed !== false ||
      invalidCandidateReport.executionAllowed !== false ||
      !invalidCandidateReport.candidate?.rejectionReasons?.includes("approval-lock-hash-mismatch")) {
    failures.push("invalid Phase 3J candidate did not remain rejected and execution-blocked");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalVerifierStatus !== "approval-verifier-ready-execution-blocked" ||
      report.t3ApprovalVerifierOnly !== true ||
      report.t3ApprovalVerifierPassed !== false ||
      report.t3ApprovalVerifierExecutionAllowed !== false ||
      report.t3ApprovalVerifierLaneCount !== 3 ||
      report.t3ApprovalVerifierReadyLaneCount !== 3 ||
      report.t3ApprovalVerifierFinalGoalComplete !== false) {
    failures.push("report export missing Phase 3J T3 approval verifier fields");
  }

  const serialized = JSON.stringify({ endpointReport, validCandidateReport, invalidCandidateReport, report });
  if (serialized.includes("I explicitly approve only the")) {
    failures.push("Phase 3J endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3J endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 approval verifier QA passed: lock metadata verification, candidate rejection, report fields, finalGoalComplete=false, no approval text content, and no secret exposure.");

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

function assertVerifierReport(report, label, shouldPass) {
  if (report.phase !== "3J" ||
      report.finalGoalComplete !== false ||
      report.verifierOnly !== true ||
      report.verificationPassed !== shouldPass ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.lockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      report.laneVerificationCount !== 3 ||
      report.readyLaneVerificationCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(report.approvalLockHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.integrityBundleHash || "")) {
    failures.push(`${label} approval verifier report has invalid top-level fields`);
  }
  const byId = new Map((report.laneVerifications || []).map((lane) => [lane.id, lane]));
  for (const laneId of laneIds) {
    const lane = byId.get(laneId);
    if (!lane ||
        lane.requestReady !== true ||
        lane.approved !== false ||
        lane.executionAllowed !== false ||
        lane.singleLaneOnly !== true ||
        lane.lockHashMatches !== true ||
        lane.approvalTextHashPresent !== true ||
        !/^[a-f0-9]{64}$/.test(lane.approvalTextHash || "")) {
      failures.push(`${label} missing valid lane verification for ${laneId}`);
    }
    if (lane && Object.hasOwn(lane, "approvalText")) {
      failures.push(`${label} returned approval text content for ${laneId}`);
    }
  }
  if (report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} approval verifier guardrails do not preserve blocked T3 state`);
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
