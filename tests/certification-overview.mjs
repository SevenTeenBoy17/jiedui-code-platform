import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3156);
const base = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = { ...process.env, PORT: String(port) };
  delete env.DATABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.CODEX_MODEL_API_KEY;
  delete env.CODEX_ENABLE_LIVE_MODEL;
  delete env.CODEX_MODEL_BASE_URL;
  delete env.OPENAI_API_KEY;
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
  throw new Error(`certification overview server did not become ready: ${log}`);
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

  const overview = await request("/api/delivery/certification-overview");
  const gapIds = (overview.openCertificationGaps || []).map((gap) => gap.id);
  const surfaceIds = (overview.readinessSurfaces || []).map((surface) => surface.id);
  if (overview.status !== "pass-with-open-certification-gaps" ||
      overview.finalGoalComplete !== false ||
      overview.localEvidencePassed !== true ||
      overview.completionAudit?.verdict !== "PASS_WITH_OPEN_CERTIFICATION_GAPS") {
    failures.push("delivery certification overview did not preserve pass-with-open-gaps status");
  }
  for (const expected of ["container-runtime-certification", "managed-database-certification", "external-provider-certification"]) {
    if (!gapIds.includes(expected)) failures.push(`delivery overview missing gap: ${expected}`);
  }
  for (const expected of ["sandbox-runtime", "model-provider", "database"]) {
    if (!surfaceIds.includes(expected)) failures.push(`delivery overview missing readiness surface: ${expected}`);
  }
  if ((overview.openCertificationGaps || []).some((gap) => gap.riskTier !== "T3" || gap.status !== "open")) {
    failures.push("delivery overview gaps are not T3 open gaps");
  }
  if ((overview.readinessSurfaces || []).some((surface) => surface.certified !== false || surface.status !== "readiness-only")) {
    failures.push("delivery overview readiness surfaces did not remain non-certified readiness-only");
  }
  if (overview.guardrails?.noExternalProviderCall !== true ||
      overview.guardrails?.noManagedDatabaseConnection !== true ||
      overview.guardrails?.noProductionDeploy !== true ||
      overview.guardrails?.t3ApprovalRequired !== true) {
    failures.push("delivery overview guardrails missing no-outbound/no-managed/no-deploy/T3 flags");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryOverviewStatus !== "pass-with-open-certification-gaps" ||
      report.deliveryFinalGoalComplete !== false ||
      report.deliveryLocalEvidencePassed !== true ||
      report.deliveryOpenCertificationGapCount !== 3 ||
      report.deliveryReadinessSurfaceCount !== 3) {
    failures.push("report export missing delivery certification overview fields");
  }

  const exposed = JSON.stringify({ overview, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|CODEX_MODEL_API_KEY/.test(exposed)) {
    failures.push("delivery overview exposed key-shaped or env-secret material");
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

console.log("Delivery certification overview QA passed: endpoint, report fields, open T3 gaps, non-certified readiness surfaces, and no secret exposure.");
