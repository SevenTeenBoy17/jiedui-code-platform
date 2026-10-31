import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const port = Number(process.env.PORT || 3214);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3w-t3-run-packet-verifier.json";
const outputMarkdownPath = "qa-artifacts/phase3w-t3-run-packet-verifier.md";

const cli = spawnSync(process.execPath, ["scripts/t3-run-packet-verifier.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`T3 run packet verifier CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 1600) {
  failures.push("Phase 3W JSON run-packet verifier artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 800) {
  failures.push("Phase 3W Markdown run-packet verifier artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertVerifierReport(artifactReport, "offline artifact", false);
  const markdown = readFileSync(outputMarkdownPath, "utf8");
  if (!markdown.includes("# Phase 3W T3 Run Packet Verifier") ||
      !markdown.includes("Verifier only: **yes**") ||
      !markdown.includes("Execution allowed: **no**")) {
    failures.push("Phase 3W Markdown summary missing verifier guardrail text");
  }
  if (markdown.includes("I explicitly approve only the")) {
    failures.push("Phase 3W Markdown leaked approval text content");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(markdown)) {
    failures.push("Phase 3W offline artifacts exposed a key-shaped token or secret assignment");
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

  const bundle = await request("/api/delivery/t3-single-lane-run-packets");
  const endpointReport = await request("/api/delivery/t3-run-packet-verifier");
  assertVerifierReport(endpointReport, "endpoint", false);

  const validPacket = buildCandidatePacket(bundle, bundle.runPackets[0]);
  const verified = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify(validPacket)
  });
  assertVerifierReport(verified, "verified packet", true);
  if (verified.packetSummary.laneIds[0] !== validPacket.laneId ||
      verified.verifiedPacketCount !== 1 ||
      verified.packetVerifications.find((packet) => packet.laneId === validPacket.laneId)?.packetValid !== true) {
    failures.push("Phase 3W valid packet was not verified safely");
  }

  const mismatch = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({ ...validPacket, packetHash: hash("wrong-packet") })
  });
  if (mismatch.status !== "t3-run-packet-rejected-execution-blocked" ||
      mismatch.verifiedPacketCount !== 0 ||
      !mismatch.packetVerifications.some((packet) => packet.rejectionReasons.includes("packet-hash-mismatch")) ||
      mismatch.executionAllowed !== false) {
    failures.push("Phase 3W packet hash mismatch was not rejected safely");
  }

  const unknown = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({ ...validPacket, laneId: "unknown", packetId: "unknown-single-lane-run-packet" })
  });
  if (unknown.status !== "t3-run-packet-rejected-execution-blocked" ||
      unknown.verifiedPacketCount !== 0) {
    failures.push("Phase 3W unknown packet was not rejected safely");
  }

  const multi = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify([
      validPacket,
      buildCandidatePacket(bundle, bundle.runPackets[1])
    ])
  });
  if (multi.status !== "t3-run-packet-rejected-execution-blocked" ||
      multi.packetSummary.singlePacketOnly !== false ||
      multi.verifiedPacketCount !== 0 ||
      !multi.packetVerifications.some((packet) => packet.rejectionReasons.includes("not-single-packet"))) {
    failures.push("Phase 3W multi-packet submission was not rejected safely");
  }

  const secretRejected = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({
      ...validPacket,
      note: ["sk", "redacted-example-value-with-many-characters"].join("-")
    })
  });
  if (secretRejected.status !== "t3-run-packet-rejected-execution-blocked" ||
      secretRejected.verifiedPacketCount !== 0 ||
      !secretRejected.packetVerifications.some((packet) => packet.secretExposure === true)) {
    failures.push("Phase 3W secret-like packet was not rejected safely");
  }

  const contentRejected = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({
      ...validPacket,
      evidenceBody: "runtime output body is intentionally not allowed"
    })
  });
  if (contentRejected.status !== "t3-run-packet-rejected-execution-blocked" ||
      !contentRejected.packetVerifications.some((packet) => packet.prohibitedContentField === true) ||
      contentRejected.contentReturned !== false) {
    failures.push("Phase 3W packet body content field was not rejected safely");
  }

  const stateClaimRejected = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({
      ...validPacket,
      approvalRecorded: true,
      certificationStateChanged: true,
      finalGoalComplete: true
    })
  });
  if (stateClaimRejected.status !== "t3-run-packet-rejected-execution-blocked" ||
      !stateClaimRejected.packetVerifications.some((packet) => packet.rejectionReasons.includes("state-change-claim-not-allowed")) ||
      stateClaimRejected.finalGoalComplete !== false) {
    failures.push("Phase 3W packet state-change claim was not rejected safely");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3RunPacketVerifierStatus !== "t3-run-packet-verifier-ready-execution-blocked" ||
      report.t3RunPacketVerifierOnly !== true ||
      report.t3RunPacketVerifierPacketCount !== 3 ||
      report.t3RunPacketVerifierReadyPacketCount !== 3 ||
      report.t3RunPacketVerifierSubmittedPacketCount !== 0 ||
      report.t3RunPacketVerifierVerifiedPacketCount !== 0 ||
      report.t3RunPacketVerifierExecutionAllowed !== false ||
      report.t3RunPacketVerifierFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3RunPacketVerifierHash || "")) {
    failures.push("report export missing Phase 3W T3 run-packet verifier fields");
  }

  const exposed = JSON.stringify({ endpointReport, verified, mismatch, unknown, multi, secretRejected, contentRejected, stateClaimRejected, report });
  if (exposed.includes("I explicitly approve only the")) {
    failures.push("Phase 3W endpoint or report leaked approval text content");
  }
  if (hasSecretExposure(exposed)) {
    failures.push("Phase 3W endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 run-packet verifier QA passed: artifacts, GET/POST validation, rejection paths, report fields, finalGoalComplete=false, no content leakage, and no secret exposure.");

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

function buildCandidatePacket(bundle, packet) {
  return {
    packetId: packet.packetId,
    laneId: packet.laneId,
    targetGap: packet.targetGap,
    runPacketBundleHash: bundle.runPacketBundleHash,
    packetHash: packet.packetHash,
    sourceHashes: packet.sourceHashes,
    evidenceIds: packet.evidenceIds,
    rollbackIds: packet.rollbackIds,
    singleLaneOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false,
    contentReturned: false
  };
}

function assertVerifierReport(report, label, verifiedExpected) {
  const expectedStatus = verifiedExpected
    ? "t3-run-packet-verified-execution-blocked"
    : "t3-run-packet-verifier-ready-execution-blocked";
  if (report.phase !== "3W" ||
      report.status !== expectedStatus ||
      report.finalGoalComplete !== false ||
      report.verifierOnly !== true ||
      report.verificationPassed !== verifiedExpected ||
      report.approvalRecorded !== false ||
      report.approved !== false ||
      report.executionAllowed !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.contentReturned !== false ||
      report.runPacketBundleStatus !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      report.runPacketsOnly !== true ||
      report.packetVerificationCount !== 3 ||
      report.readyPacketVerificationCount !== 3 ||
      report.submittedPacketCount !== (verifiedExpected ? 1 : 0) ||
      report.verifiedPacketCount !== (verifiedExpected ? 1 : 0) ||
      !/^[a-f0-9]{64}$/.test(report.runPacketBundleHash || "") ||
      !/^[a-f0-9]{64}$/.test(report.verifierHash || "")) {
    failures.push(`${label} T3 run-packet verifier report has invalid top-level fields`);
  }
  for (const packet of report.packetVerifications || []) {
    if (packet.riskTier !== "T3" ||
        packet.packetReady !== true ||
        packet.evidenceIdCount < 5 ||
        packet.rollbackIdCount < 3 ||
        packet.approvalRecorded !== false ||
        packet.approved !== false ||
        packet.executionAllowed !== false ||
        packet.certificationStateChanged !== false ||
        packet.contentReturned !== false ||
        packet.finalGoalComplete !== false) {
      failures.push(`${label} invalid run-packet verifier lane ${packet.laneId || "unknown"}`);
    }
  }
  if (report.guardrails?.artifactBodyContentReturned !== false ||
      report.guardrails?.evidenceBodyContentReturned !== false ||
      report.guardrails?.approvalTextReturned !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.certificationExecution !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} T3 run-packet verifier guardrails are not blocked`);
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
