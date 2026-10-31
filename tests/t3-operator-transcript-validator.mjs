import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3196);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3q-t3-operator-transcript-validator.json";
const outputMarkdownPath = "qa-artifacts/phase3q-t3-operator-transcript-validator.md";

const cli = spawnSync(process.execPath, ["scripts/t3-operator-transcript-validator.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 operator transcript validator CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1400) {
  failures.push("Phase 3Q JSON transcript validator artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 700) {
  failures.push("Phase 3Q Markdown transcript validator artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertTranscriptValidatorReport(artifactReport, "offline artifact", false);
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3Q T3 Operator Transcript Validator") ||
      !markdown.includes("Validator only: **yes**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3Q Markdown summary missing validator guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3Q Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3Q offline artifacts exposed a key-shaped token or secret assignment");
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

  const checklist = await request("/api/delivery/t3-operator-checklist");
  const endpointReport = await request("/api/delivery/t3-operator-transcript-validator");
  assertTranscriptValidatorReport(endpointReport, "endpoint", false);

  const validTranscript = buildTranscript(checklist.laneChecklists[0], checklist.checklistBundleHash);
  const validated = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify(validTranscript)
  });
  assertTranscriptValidatorReport(validated, "validated transcript", true);
  if (validated.transcriptSummary.laneIds[0] !== validTranscript.laneId ||
      validated.validatedTranscriptCount !== 1 ||
      validated.laneValidations.find((lane) => lane.laneId === validTranscript.laneId)?.transcriptValid !== true) {
    failures.push("Phase 3Q valid transcript was not validated safely");
  }

  const incomplete = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify({
      ...validTranscript,
      manualStepIds: validTranscript.manualStepIds.slice(1)
    })
  });
  if (incomplete.status !== "t3-operator-transcript-rejected-execution-blocked" ||
      incomplete.validatedTranscriptCount !== 0 ||
      !incomplete.laneValidations.some((lane) => lane.rejectionReasons.includes("missing-manual-steps")) ||
      incomplete.executionAllowed !== false) {
    failures.push("Phase 3Q incomplete transcript was not rejected safely");
  }

  const secretRejected = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify({
      ...validTranscript,
      note: ["sk", "redacted-example-value-with-many-characters"].join("-")
    })
  });
  if (secretRejected.status !== "t3-operator-transcript-rejected-execution-blocked" ||
      secretRejected.validatedTranscriptCount !== 0 ||
      !secretRejected.laneValidations.some((lane) => lane.secretExposure === true)) {
    failures.push("Phase 3Q secret-like transcript was not rejected safely");
  }

  const contentRejected = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify({
      ...validTranscript,
      evidenceBody: "runtime output body is intentionally not allowed"
    })
  });
  if (contentRejected.status !== "t3-operator-transcript-rejected-execution-blocked" ||
      !contentRejected.laneValidations.some((lane) => lane.prohibitedContentField === true) ||
      contentRejected.contentReturned !== false) {
    failures.push("Phase 3Q transcript body content field was not rejected safely");
  }

  const stateClaimRejected = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify({
      ...validTranscript,
      approvalRecorded: true,
      certificationStateChanged: true,
      finalGoalComplete: true
    })
  });
  if (stateClaimRejected.status !== "t3-operator-transcript-rejected-execution-blocked" ||
      !stateClaimRejected.laneValidations.some((lane) => lane.rejectionReasons.includes("state-change-claim-not-allowed")) ||
      stateClaimRejected.finalGoalComplete !== false) {
    failures.push("Phase 3Q state-change transcript claim was not rejected safely");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3OperatorTranscriptValidatorStatus !== "t3-operator-transcript-validator-ready-execution-blocked" ||
      report.t3OperatorTranscriptValidatorOnly !== true ||
      report.t3OperatorTranscriptValidatorLaneCount !== 3 ||
      report.t3OperatorTranscriptValidatorReadyLaneCount !== 3 ||
      report.t3OperatorTranscriptValidatorSubmittedTranscriptCount !== 0 ||
      report.t3OperatorTranscriptValidatorValidatedTranscriptCount !== 0 ||
      report.t3OperatorTranscriptValidatorExecutionAllowed !== false ||
      report.t3OperatorTranscriptValidatorFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3OperatorTranscriptValidatorHash || "")) {
    failures.push("report export missing Phase 3Q T3 operator transcript validator fields");
  }

  const exposed = JSON.stringify({ endpointReport, validated, incomplete, secretRejected, contentRejected, stateClaimRejected, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3Q endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3Q endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 operator transcript validator QA passed: artifacts, GET/POST validation, rejection paths, report fields, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function buildTranscript(lane, checklistBundleHash) {
  return {
    laneId: lane.laneId,
    checklistBundleHash,
    manualStepIds: lane.manualSteps.map((step) => step.id),
    evidenceArtifactHashes: lane.evidenceChecklist.map((item, index) => ({
      id: item.id,
      status: "passed",
      artifactHash: hash(`evidence-${lane.laneId}-${index}`)
    })),
    rollbackArtifactHashes: lane.rollbackChecklist.map((item, index) => ({
      id: item.id,
      status: "passed",
      artifactHash: hash(`rollback-${lane.laneId}-${index}`)
    })),
    actionsExecuted: [],
    approvalRecorded: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false,
    contentReturned: false
  };
}

function assertTranscriptValidatorReport(report, label, validatedExpected) {
  const expectedStatus = validatedExpected
    ? "t3-operator-transcript-valid-state-unchanged"
    : "t3-operator-transcript-validator-ready-execution-blocked";
  if (report.phase !== "3Q" ||
      report.status !== expectedStatus ||
      report.finalGoalComplete !== false ||
      report.validatorOnly !== true ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.checklistStatus !== "t3-operator-checklist-ready-execution-blocked" ||
      report.operatorOnly !== true ||
      report.laneValidationCount !== 3 ||
      report.readyLaneValidationCount !== 3 ||
      report.submittedTranscriptCount !== (validatedExpected ? 1 : 0) ||
      report.validatedTranscriptCount !== (validatedExpected ? 1 : 0) ||
      !/^[a-f0-9]{64}$/.test(report.checklistBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.transcriptValidatorHash || "")) {
    failures.push(`${label} T3 operator transcript validator report has invalid top-level fields`);
  }
  for (const lane of report.laneValidations || []) {
    if (lane.riskTier !== "T3" ||
        lane.checklistReady !== true ||
        lane.manualStepCount < 5 ||
        lane.evidenceArtifactCount < 5 ||
        lane.rollbackArtifactCount < 3 ||
        lane.approvalRecorded !== false ||
        lane.approved !== false ||
        lane.executionAllowed !== false ||
        lane.certificationStateChanged !== false ||
        lane.contentReturned !== false) {
      failures.push(`${label} invalid transcript validator lane ${lane.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.artifactContentReturned !== false ||
      report.guardrails?.evidenceContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} T3 operator transcript validator guardrails are not blocked`);
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
