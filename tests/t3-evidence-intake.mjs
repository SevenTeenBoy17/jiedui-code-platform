import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3162);
const base = `http://127.0.0.1:${port}`;
const fakeProviderKey = `sk-${"phase2zFakeProviderSecret123456789"}`;
const fakeDatabaseUrl = "postgres://codex_user:phase2z-secret-password@example.invalid:5432/codex";

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
  throw new Error(`t3 evidence intake server did not become ready: ${log}`);
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

async function requestFailure(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

function cleanEvidence() {
  return {
    lane: "provider",
    approvalRef: "local-approval-record-phase2z",
    operator: "codex-local-qa",
    rollbackResult: "passed",
    reviewGate: "pending",
    evidenceItems: [
      { type: "operator-approval-record", summary: "Approval marker exists in local audit notes.", artifactRef: "qa-artifacts/approval-local.txt" },
      { type: "rollback-drill-result", summary: "Rollback drill completed against local mock provider route.", artifactRef: "qa-artifacts/rollback-local.txt" },
      { type: "secret-redaction-proof", summary: "Request and response summaries contain no secret values.", artifactRef: "qa-artifacts/redaction-local.txt" }
    ]
  };
}

function secretEvidence() {
  return {
    ...cleanEvidence(),
    approvalRef: "secret-like-payload-must-reject",
    evidenceItems: [
      { type: "operator-approval-record", summary: `This includes ${fakeProviderKey}`, artifactRef: "qa-artifacts/secret-local.txt" },
      { type: "managed-db-proof", summary: `This includes ${fakeDatabaseUrl}`, artifactRef: "qa-artifacts/db-local.txt" },
      { type: "env-name", summary: "CODEX_MODEL_API_KEY and DATABASE_URL must not be accepted", artifactRef: "qa-artifacts/env-local.txt" }
    ]
  };
}

let server;
try {
  server = await startServer();
  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const initial = await request("/api/delivery/t3-evidence");
  if (initial.status !== "candidate-only" ||
      initial.finalGoalComplete !== false ||
      initial.certificationStateChanged !== false ||
      initial.candidateCount !== 0 ||
      initial.guardrails?.secretValuesReturned !== false ||
      initial.guardrails?.marksCertified !== false) {
    failures.push("initial T3 evidence summary did not expose safe empty candidate-only state");
  }

  const forbidden = await requestFailure("/api/delivery/t3-evidence/intake", {
    method: "POST",
    body: JSON.stringify(cleanEvidence())
  });
  if (forbidden.status !== 403) failures.push("T3 evidence intake without guard did not return 403");

  const accepted = await request("/api/delivery/t3-evidence/intake", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: JSON.stringify(cleanEvidence())
  });
  if (accepted.status !== "accepted-candidate" ||
      accepted.stored !== true ||
      accepted.certificationStateChanged !== false ||
      accepted.candidate?.finalGoalComplete !== false ||
      accepted.summary?.candidateCount !== 1 ||
      accepted.summary?.acceptedCandidateCount !== 1 ||
      accepted.summary?.laneCounts?.provider !== 1) {
    failures.push("clean T3 evidence was not stored as a provider candidate only");
  }

  const rejected = await requestFailure("/api/delivery/t3-evidence/intake", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: JSON.stringify(secretEvidence())
  });
  if (rejected.status !== 422 ||
      rejected.payload?.data?.status !== "rejected-candidate" ||
      rejected.payload?.data?.stored !== false ||
      !rejected.payload?.data?.redactionFindings?.length) {
    failures.push("secret-like T3 evidence was not rejected with redaction findings");
  }

  const summary = await request("/api/delivery/t3-evidence");
  if (summary.candidateCount !== 1 ||
      summary.acceptedCandidateCount !== 1 ||
      summary.certificationStateChanged !== false ||
      summary.finalGoalComplete !== false) {
    failures.push("T3 evidence summary changed after rejected secret-like payload");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3EvidenceStatus !== "candidate-only" ||
      report.t3EvidenceCandidateCount !== 1 ||
      report.t3EvidenceAcceptedCandidateCount !== 1 ||
      report.t3EvidenceCertificationStateChanged !== false) {
    failures.push("report export missing T3 evidence intake fields");
  }

  const exposed = JSON.stringify({ accepted, rejected, summary, report });
  for (const secretValue of [fakeProviderKey, fakeDatabaseUrl, "phase2z-secret-password"]) {
    if (exposed.includes(secretValue)) failures.push(`T3 evidence intake leaked secret value marker: ${secretValue.slice(0, 12)}`);
  }
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed)) {
    failures.push("T3 evidence intake exposed a key-shaped token");
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

console.log("T3 evidence intake QA passed: guarded intake, clean candidate storage, secret rejection, report fields, no certification state change, and no secret exposure.");
