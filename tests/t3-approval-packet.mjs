import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3171);
const base = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = { ...process.env, PORT: String(port) };
  delete env.CODEX_MODEL_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.DATABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
}

async function startServer() {
  const child = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv()
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk.toString(); });
  child.stderr.on("data", (chunk) => { log += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      if (health.status === "ready") return { child, log: () => log };
    } catch {
      await wait(150);
    }
  }
  throw new Error(`T3 approval packet server did not become ready: ${log}`);
}

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

let server;
try {
  server = await startServer();
  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const packet = await request("/api/delivery/t3-approval-packet");
  if (packet.status !== "approval-packet-ready" ||
      packet.finalGoalComplete !== false ||
      packet.executionAllowed !== false ||
      packet.safeToRunAutomatically !== false ||
      packet.approvalRequired !== true ||
      packet.laneCount !== 3 ||
      packet.approvedLaneCount !== 0 ||
      packet.blockedLaneCount !== 3 ||
      packet.evidenceRequirementCount < 18 ||
      packet.rollbackStepCount < 9 ||
      packet.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval packet did not preserve blocked package-only state");
  }
  const laneIds = (packet.lanes || []).map((lane) => lane.id);
  for (const expected of ["runtime", "database", "provider"]) {
    if (!laneIds.includes(expected)) failures.push(`approval packet missing lane: ${expected}`);
  }
  for (const lane of packet.lanes || []) {
    if (lane.riskTier !== "T3" ||
        lane.approvalRequired !== true ||
        lane.approved !== false ||
        lane.allowedToRun !== false ||
        !lane.approvalPrompt ||
        (lane.preExecutionChecks || []).length < 5 ||
        (lane.rollbackSummary || []).length < 3 ||
        (lane.evidenceChecklist || []).length < 6 ||
        !/(approve|run|certification)/i.test(String(lane.remainingWork || ""))) {
      failures.push(`approval lane ${lane.id} missing approval, rollback, evidence, or remaining-work fields`);
    }
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalPacketStatus !== "approval-packet-ready" ||
      report.t3ApprovalPacketExecutionAllowed !== false ||
      report.t3ApprovalPacketLaneCount !== 3 ||
      report.t3ApprovalPacketApprovedLaneCount !== 0 ||
      report.t3ApprovalPacketBlockedLaneCount !== 3 ||
      report.t3ApprovalPacketEvidenceRequirementCount < 18 ||
      report.t3ApprovalPacketRollbackStepCount < 9 ||
      report.t3ApprovalPacketFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval packet fields");
  }

  const exposed = JSON.stringify({ packet, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(exposed)) {
    failures.push("T3 approval packet exposed key-shaped or environment-secret material");
  }
} catch (error) {
  failures.push(error.message);
} finally {
  if (server?.child) server.child.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("T3 approval packet QA passed: three package-only lanes, approvals blocked, rollback/evidence checklists, report fields, finalGoalComplete=false, and no secret exposure.");
