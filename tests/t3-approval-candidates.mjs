import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const port = Number(process.env.PORT || 3183);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3k-t3-approval-candidates.json";
const outputMarkdownPath = "qa-artifacts/phase3k-t3-approval-candidates.md";
const laneIds = ["runtime", "database", "provider"];

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-approval-candidates.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`approval candidates CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 900) {
  failures.push("Phase 3K JSON approval candidates artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 600) {
  failures.push("Phase 3K Markdown approval candidates artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertCandidatesReport(artifactReport, "offline artifact");
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3K T3 Approval Candidates") ||
      !markdown.includes("Candidate only: **yes**") ||
      !markdown.includes("Approval recorded: **no**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3K Markdown summary missing required guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3K Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3K offline artifacts exposed a key-shaped token or secret assignment");
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

  const endpointReport = await request("/api/delivery/t3-approval-candidates");
  assertCandidatesReport(endpointReport, "endpoint");

  for (const candidate of endpointReport.candidates || []) {
    const verifier = await request("/api/delivery/t3-approval-verifier", {
      method: "POST",
      body: JSON.stringify({
        laneId: candidate.laneId,
        approvalLockHash: candidate.approvalLockHash,
        approvalTextHash: candidate.approvalTextHash
      })
    });
    if (verifier.status !== "approval-metadata-verified-execution-blocked" ||
        verifier.verificationPassed !== true ||
        verifier.approvalRecorded !== false ||
        verifier.executionAllowed !== false ||
        verifier.contentReturned !== false) {
      failures.push(`candidate did not verify through Phase 3J verifier: ${candidate.laneId}`);
    }
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalCandidatesStatus !== "approval-candidates-ready-execution-blocked" ||
      report.t3ApprovalCandidatesOnly !== true ||
      report.t3ApprovalCandidateCount !== 3 ||
      report.t3ApprovalCandidateVerifierPassCount !== 3 ||
      report.t3ApprovalCandidatesExecutionAllowed !== false ||
      report.t3ApprovalCandidatesFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalCandidatesHash || "")) {
    failures.push("report export missing Phase 3K T3 approval candidate fields");
  }

  const serialized = JSON.stringify({ endpointReport, report });
  if (serialized.includes("I explicitly approve only the")) {
    failures.push("Phase 3K endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3K endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 approval candidates QA passed: three verifier-ready candidate payloads, verifier cross-checks, report fields, finalGoalComplete=false, no approval text content, and no secret exposure.");

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

function assertCandidatesReport(report, label) {
  if (report.phase !== "3K" ||
      report.status !== "approval-candidates-ready-execution-blocked" ||
      report.finalGoalComplete !== false ||
      report.candidateOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.lockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      report.verifierStatus !== "approval-verifier-ready-execution-blocked" ||
      report.candidateCount !== 3 ||
      report.verifierPassCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(report.approvalLockHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.integrityBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.candidateBundleHash || "")) {
    failures.push(`${label} approval candidates report has invalid top-level fields`);
  }
  const byId = new Map((report.candidates || []).map((candidate) => [candidate.laneId, candidate]));
  for (const laneId of laneIds) {
    const candidate = byId.get(laneId);
    if (!candidate ||
        candidate.riskTier !== "T3" ||
        candidate.singleLaneOnly !== true ||
        candidate.verificationPassed !== true ||
        candidate.approvalRecorded !== false ||
        candidate.approved !== false ||
        candidate.executionAllowed !== false ||
        candidate.certificationStateChanged !== false ||
        candidate.externalActionsExecuted !== false ||
        !/^[a-f0-9]{64}$/.test(candidate.approvalLockHash || "") ||
        !/^[a-f0-9]{64}$/.test(candidate.approvalTextHash || "")) {
      failures.push(`${label} missing valid approval candidate for ${laneId}`);
    }
    if (candidate && Object.hasOwn(candidate, "approvalText")) {
      failures.push(`${label} returned approval text content for ${laneId}`);
    }
  }
  if (report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} approval candidates guardrails do not preserve blocked T3 state`);
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
