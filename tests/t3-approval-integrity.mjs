import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const port = Number(process.env.PORT || 3177);
const base = `http://127.0.0.1:${port}`;
const outputJsonPath = "qa-artifacts/phase3h-t3-approval-integrity.json";
const outputMarkdownPath = "qa-artifacts/phase3h-t3-approval-integrity.md";
const requiredArtifactPaths = [
  "qa-artifacts/phase3g-t3-approval-request-export.json",
  "qa-artifacts/phase3g-t3-approval-request-export.md",
  "specs/phase3g-t3-approval-request-export-contract.md",
  "scripts/t3-approval-request-export.mjs",
  "tests/t3-approval-request-export.mjs",
  "specs/phase3h-t3-approval-integrity-contract.md",
  "scripts/t3-approval-integrity.mjs",
  "tests/t3-approval-integrity.mjs"
];

const failures = [];

const cli = spawnSync(process.execPath, ["scripts/t3-approval-integrity.mjs"], {
  encoding: "utf8",
  env: scrubEnv()
});
if (cli.status !== 0) {
  failures.push(`integrity CLI failed: ${cli.stdout}\n${cli.stderr}`);
}

if (!existsSync(outputJsonPath) || statSync(outputJsonPath).size < 800) {
  failures.push("Phase 3H JSON integrity artifact missing or too small");
}
if (!existsSync(outputMarkdownPath) || statSync(outputMarkdownPath).size < 500) {
  failures.push("Phase 3H Markdown integrity artifact missing or too small");
}

if (!failures.length) {
  const artifactReport = JSON.parse(readFileSync(outputJsonPath, "utf8"));
  assertIntegrityReport(artifactReport, "offline artifact");
  const artifactMarkdown = readFileSync(outputMarkdownPath, "utf8");
  if (!artifactMarkdown.includes("# Phase 3H T3 Approval Integrity") ||
      !artifactMarkdown.includes("Hash only: **yes**") ||
      !artifactMarkdown.includes("Content returned: **no**")) {
    failures.push("Phase 3H Markdown summary missing required guardrail text");
  }
  if (hasSecretExposure(JSON.stringify(artifactReport)) || hasSecretExposure(artifactMarkdown)) {
    failures.push("Phase 3H offline artifacts exposed a key-shaped token or secret assignment");
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

  const endpointReport = await request("/api/delivery/t3-approval-integrity");
  assertIntegrityReport(endpointReport, "endpoint");

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.t3ApprovalIntegrityStatus !== "approval-integrity-ready" ||
      report.t3ApprovalIntegrityHashOnly !== true ||
      report.t3ApprovalIntegrityContentReturned !== false ||
      report.t3ApprovalIntegrityArtifactCount < requiredArtifactPaths.length ||
      report.t3ApprovalIntegrityReadyArtifactCount !== report.t3ApprovalIntegrityArtifactCount ||
      report.t3ApprovalIntegrityMissingArtifactCount !== 0 ||
      report.t3ApprovalIntegrityHashCount !== report.t3ApprovalIntegrityArtifactCount ||
      report.t3ApprovalIntegritySecretExposure !== false ||
      report.t3ApprovalIntegrityFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalIntegrityBundleHash || "")) {
    failures.push("report export missing Phase 3H T3 approval integrity fields");
  }

  const serialized = JSON.stringify({ endpointReport, report });
  if (hasSecretExposure(serialized)) {
    failures.push("Phase 3H endpoint or report exposed a key-shaped token or secret assignment");
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

console.log("T3 approval integrity QA passed: hash-only inventory, bundle hash, report fields, finalGoalComplete=false, and no secret exposure.");

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

function assertIntegrityReport(report, label) {
  if (report.phase !== "3H" ||
      report.status !== "approval-integrity-ready" ||
      report.finalGoalComplete !== false ||
      report.hashOnly !== true ||
      report.contentReturned !== false ||
      report.externalActionsExecuted !== false ||
      report.certificationStateChanged !== false ||
      report.executionAllowed !== false ||
      report.secretExposure !== false ||
      !/^[a-f0-9]{64}$/.test(report.integrityBundleHash || "")) {
    failures.push(`${label} integrity report has invalid top-level guardrail fields`);
  }
  if (report.artifactCount < requiredArtifactPaths.length ||
      report.readyArtifactCount !== report.artifactCount ||
      report.missingArtifactCount !== 0 ||
      report.hashCount !== report.artifactCount ||
      !Array.isArray(report.artifactInventory)) {
    failures.push(`${label} integrity report has invalid artifact counts`);
  }
  const byPath = new Map((report.artifactInventory || []).map((item) => [item.path, item]));
  for (const artifactPath of requiredArtifactPaths) {
    const item = byPath.get(artifactPath);
    if (!item || item.exists !== true || item.sizeBytes <= 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || "")) {
      failures.push(`${label} missing hash metadata for ${artifactPath}`);
    }
    if (item && Object.hasOwn(item, "content")) {
      failures.push(`${label} returned artifact content for ${artifactPath}`);
    }
  }
  if (report.guardrails?.certificationExecution !== false ||
      report.guardrails?.externalCalls !== false ||
      report.guardrails?.managedDatabaseConnections !== false ||
      report.guardrails?.finalCompletionClaimed !== false) {
    failures.push(`${label} integrity report guardrails do not preserve blocked T3 state`);
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
