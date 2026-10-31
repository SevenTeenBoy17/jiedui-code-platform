import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3164);
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
  throw new Error(`delivery handoff dossier server did not become ready: ${log}`);
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

  const dossier = await request("/api/delivery/handoff-dossier");
  const gapIds = (dossier.openCertificationGaps || []).map((gap) => gap.id);
  if (dossier.status !== "handoff-ready-with-open-certification-gaps" ||
      dossier.finalGoalComplete !== false ||
      dossier.localEvidencePassed !== true ||
      dossier.openCertificationGapCount !== 3 ||
      dossier.localRequirementCount < 15 ||
      dossier.agenticQa?.provedCheckCount < 36 ||
      dossier.t3Package?.executionAllowed !== false ||
      dossier.t3Evidence?.certificationStateChanged !== false ||
      dossier.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery handoff dossier did not preserve local-evidence/open-gap state");
  }
  for (const expected of ["container-runtime-certification", "managed-database-certification", "external-provider-certification"]) {
    if (!gapIds.includes(expected)) failures.push(`handoff dossier missing open gap: ${expected}`);
  }
  for (const expectedSection of ["agentic-internal-qa", "t3-package-and-evidence-intake", "open-certification-gaps"]) {
    if (!dossier.sections?.includes(expectedSection)) failures.push(`handoff dossier missing section: ${expectedSection}`);
  }
  if ((dossier.artifactManifest || []).length < 8 ||
      !dossier.artifactManifest.includes("qa-artifacts/phase2s-completion-audit.json") ||
      !dossier.artifactManifest.includes("qa-artifacts/phase2o-agentic-audit.json")) {
    failures.push("handoff dossier artifact manifest is incomplete");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.handoffDossierStatus !== "handoff-ready-with-open-certification-gaps" ||
      report.handoffDossierFinalGoalComplete !== false ||
      report.handoffDossierArtifactCount < 8 ||
      report.handoffDossierOpenGapCount !== 3 ||
      report.handoffDossierLocalRequirementCount < 15 ||
      report.handoffDossierAgenticProvedCheckCount < 36 ||
      report.handoffDossierT3EvidenceCandidateCount !== 0) {
    failures.push("report export missing delivery handoff dossier summary fields");
  }

  const exposed = JSON.stringify({ dossier, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|CODEX_MODEL_API_KEY/.test(exposed)) {
    failures.push("delivery handoff dossier exposed key-shaped or env-secret material");
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

console.log("Delivery handoff dossier QA passed: endpoint, report fields, artifact manifest, open T3 gaps, finalGoalComplete=false, and no secret exposure.");
