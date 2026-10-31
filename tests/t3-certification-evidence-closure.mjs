import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const port = Number(process.env.PORT || 3188);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3m-t3-certification-evidence-closure.json";
const outputMarkdownPath = "qa-artifacts/phase3m-t3-certification-evidence-closure.md";

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-certification-evidence-closure.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`certification evidence closure CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1200) {
  failures.push("Phase 3M JSON certification evidence closure artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3M Markdown certification evidence closure artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertClosureReport(artifactReport, "offline artifact", false);
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3M T3 Certification Evidence Closure") ||
      !markdown.includes("Closure only: **yes**") ||
      !markdown.includes("Approval recorded: **no**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3M Markdown summary missing required guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3M Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3M offline artifacts exposed a key-shaped token or secret assignment");
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

  const gate = await request("/api/delivery/t3-approval-execution-gate");
  const endpointReport = await request("/api/delivery/t3-certification-evidence-closure");
  assertClosureReport(endpointReport, "endpoint", false);

  const validBundle = buildEvidenceBundle(gate.gateLanes[0], gate.executionGateHash);
  const validated = await request("/api/delivery/t3-certification-evidence-closure", {
    method: "POST",
    body: JSON.stringify(validBundle)
  });
  assertClosureReport(validated, "validated bundle", true);
  if (validated.evidenceBundle.laneId !== validBundle.laneId ||
      validated.evidenceBundle.closureReady !== true ||
      validated.evidenceBundle.evidenceComplete !== true ||
      validated.evidenceBundle.rollbackComplete !== true) {
    failures.push("Phase 3M valid evidence bundle was not closure-ready");
  }

  const incomplete = await request("/api/delivery/t3-certification-evidence-closure", {
    method: "POST",
    body: JSON.stringify({
      ...validBundle,
      evidenceItems: validBundle.evidenceItems.slice(1)
    })
  });
  if (incomplete.status !== "certification-evidence-closure-rejected-execution-blocked" ||
      incomplete.evidenceBundle.closureReady !== false ||
      !incomplete.evidenceBundle.rejectionReasons.includes("missing-required-evidence") ||
      incomplete.executionAllowed !== false) {
    failures.push("Phase 3M incomplete evidence bundle was not rejected safely");
  }

  const secretRejected = await request("/api/delivery/t3-certification-evidence-closure", {
    method: "POST",
    body: JSON.stringify({
      ...validBundle,
      note: ["sk", "redacted-example-value-with-many-characters"].join("-")
    })
  });
  if (secretRejected.status !== "certification-evidence-closure-rejected-execution-blocked" ||
      secretRejected.evidenceBundle.secretExposure !== true ||
      secretRejected.executionAllowed !== false) {
    failures.push("Phase 3M secret-like evidence bundle was not rejected safely");
  }

  const stateClaimRejected = await request("/api/delivery/t3-certification-evidence-closure", {
    method: "POST",
    body: JSON.stringify({
      ...validBundle,
      certificationStateChanged: true
    })
  });
  if (stateClaimRejected.status !== "certification-evidence-closure-rejected-execution-blocked" ||
      !stateClaimRejected.evidenceBundle.rejectionReasons.includes("state-change-claim-not-allowed") ||
      stateClaimRejected.finalGoalComplete !== false) {
    failures.push("Phase 3M state-change claim was not rejected safely");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3CertificationEvidenceClosureStatus !== "certification-evidence-closure-ready-execution-blocked" ||
      report.t3CertificationEvidenceClosureOnly !== true ||
      report.t3CertificationEvidenceClosureLaneCount !== 3 ||
      report.t3CertificationEvidenceClosureReadyLaneCount !== 3 ||
      report.t3CertificationEvidenceClosureSubmittedBundleCount !== 0 ||
      report.t3CertificationEvidenceClosureValidatedBundleCount !== 0 ||
      report.t3CertificationEvidenceClosureExecutionAllowed !== false ||
      report.t3CertificationEvidenceClosureFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3CertificationEvidenceClosureHash || "")) {
    failures.push("report export missing Phase 3M T3 certification evidence closure fields");
  }

  const serialized = JSON.stringify({ endpointReport, validated, incomplete, secretRejected, stateClaimRejected, report });
  if (serialized.includes("I explicitly approve only the")) {
    failures.push("Phase 3M endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3M endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 certification evidence closure QA passed: closure artifacts, GET/POST validation, rejection paths, report fields, finalGoalComplete=false, no evidence content, and no secret exposure.");

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

function buildEvidenceBundle(lane, executionGateHash) {
  return {
    laneId: lane.laneId,
    executionGateHash,
    evidenceItems: lane.requiredEvidence.map((id, index) => ({
      id,
      status: "passed",
      artifactHash: hash(`evidence-${lane.laneId}-${index}`)
    })),
    rollbackResults: lane.rollbackChecks.map((id, index) => ({
      id,
      status: "passed",
      artifactHash: hash(`rollback-${lane.laneId}-${index}`)
    })),
    actionsExecuted: [],
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false
  };
}

function assertClosureReport(report, label, validatedExpected) {
  const expectedStatus = validatedExpected
    ? "certification-evidence-closure-ready-state-unchanged"
    : "certification-evidence-closure-ready-execution-blocked";
  if (report.phase !== "3M" ||
      report.status !== expectedStatus ||
      report.finalGoalComplete !== false ||
      report.closureOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.gateStatus !== "approval-execution-gate-ready-execution-blocked" ||
      report.laneClosureCount !== 3 ||
      report.readyLaneClosureCount !== 3 ||
      report.submittedEvidenceBundleCount !== (validatedExpected ? 1 : 0) ||
      report.validatedEvidenceBundleCount !== (validatedExpected ? 1 : 0) ||
      !/^[a-f0-9]{64}$/.test(report.executionGateHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.closureHash || "")) {
    failures.push(`${label} certification evidence closure report has invalid top-level fields`);
  }
  for (const lane of report.laneClosures || []) {
    if (lane.riskTier !== "T3" ||
        lane.metadataVerified !== true ||
        lane.evidenceRequirementCount < 5 ||
        lane.rollbackRequirementCount < 3 ||
        lane.approvalRecorded !== false ||
        lane.approved !== false ||
        lane.executionAllowed !== false ||
        lane.certificationStateChanged !== false ||
        lane.externalActionsExecuted !== false) {
      failures.push(`${label} invalid lane closure for ${lane.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.evidenceContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} certification evidence closure guardrails do not preserve blocked T3 state`);
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

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
