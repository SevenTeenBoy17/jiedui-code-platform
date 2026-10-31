import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3169);
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
  throw new Error(`objective traceability server did not become ready: ${log}`);
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

  const traceability = await request("/api/delivery/objective-traceability");
  if (traceability.status !== "traceable-with-open-certification-gaps" ||
      traceability.finalGoalComplete !== false ||
      traceability.localEvidencePassed !== true ||
      traceability.openCertificationGapCount !== 3 ||
      traceability.requirementCount !== 12 ||
      traceability.provedRequirementCount !== 9 ||
      traceability.openRequirementCount !== 3 ||
      traceability.blockedRequirementCount !== 0 ||
      traceability.guardrails?.certificationExecution !== false) {
    failures.push("objective traceability summary did not preserve proved/open requirement counts");
  }
  const rowIds = (traceability.matrix || []).map((item) => item.id);
  for (const expected of [
    "model-primary-routing",
    "model-fallback-routing",
    "image-model-separation",
    "frontend-3d-glass-cartoon-ui",
    "three-round-agentic-internal-qa",
    "delivery-handoff-evidence",
    "certified-runtime-isolation",
    "managed-database-certification",
    "external-provider-certification"
  ]) {
    if (!rowIds.includes(expected)) failures.push(`traceability matrix missing row: ${expected}`);
  }
  const t3Rows = traceability.matrix.filter((item) => item.riskTier === "T3");
  if (t3Rows.length !== 3 || !t3Rows.every((item) => item.status === "open" && item.remainingWork.includes("Explicitly approve"))) {
    failures.push("traceability matrix did not keep all T3 certification rows open with approval work");
  }
  if (!traceability.matrix.some((item) => item.id === "image-model-separation" && item.evidence.join(" ").includes("gpt-image"))) {
    failures.push("traceability matrix missing image model separation evidence");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.objectiveTraceabilityStatus !== "traceable-with-open-certification-gaps" ||
      report.objectiveTraceabilityRequirementCount !== 12 ||
      report.objectiveTraceabilityProvedRequirementCount !== 9 ||
      report.objectiveTraceabilityOpenRequirementCount !== 3 ||
      report.objectiveTraceabilityBlockedRequirementCount !== 0 ||
      report.objectiveTraceabilityFinalGoalComplete !== false) {
    failures.push("report export missing objective traceability summary fields");
  }

  const exposed = JSON.stringify({ traceability, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(exposed)) {
    failures.push("objective traceability exposed key-shaped or environment-secret material");
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

console.log("Objective traceability QA passed: 12 mapped requirements, 9 proved local rows, 3 open T3 rows, report fields, finalGoalComplete=false, and no secret exposure.");
