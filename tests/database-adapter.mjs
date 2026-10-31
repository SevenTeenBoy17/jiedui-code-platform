import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const failures = [];
const port = Number(process.env.PORT || 3143);
const base = `http://127.0.0.1:${port}`;
const dbPath = resolve("qa-artifacts", "phase2r-sqlite", "codex-test.sqlite");
const backupPath = resolve("qa-artifacts", "phase2r-sqlite", "codex-test.sqlite.latest");

mkdirSync(dirname(dbPath), { recursive: true });
for (const path of [dbPath, backupPath, `${dbPath}-wal`, `${dbPath}-shm`, `${backupPath}-wal`, `${backupPath}-shm`]) {
  rmSync(path, { force: true });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = { ...process.env, PORT: String(port), CODEX_DB_ENGINE: "sqlite", CODEX_SQLITE_DB_PATH: dbPath, CODEX_SQLITE_BACKUP_PATH: backupPath };
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
      if (health.repository === "sqlite-repository-v1") return { child, log: () => log };
    } catch {
      await wait(150);
    }
  }
  throw new Error(`sqlite server did not become ready: ${log}`);
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
  if (response.ok || payload.ok) {
    throw new Error(`${path} unexpectedly succeeded: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

let server;
try {
  server = await startServer();

  const reset = await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (reset.dbMeta?.repository?.engine !== "sqlite-repository-v1") failures.push("reset did not persist through sqlite repository");

  const initialStatus = await request("/api/db/status");
  if (initialStatus.engine !== "sqlite-repository-v1" ||
      initialStatus.adapter !== "node:sqlite" ||
      initialStatus.transactionalWrites !== true ||
      initialStatus.rollbackSupported !== true ||
      initialStatus.externalReady !== true ||
      !initialStatus.migrationsApplied?.includes("001_app_document_store")) {
    failures.push("sqlite db status missing adapter, migration, transaction, or rollback evidence");
  }
  if (!initialStatus.backup?.exists || initialStatus.backup?.sizeBytes < 100) {
    failures.push("sqlite db status missing backup evidence");
  }

  const forbiddenRollback = await requestFailure("/api/db/rollback-probe", { method: "POST", body: "{}" });
  if (forbiddenRollback.status !== 403) failures.push("rollback probe without guard did not return 403");

  const rollbackProbe = await request("/api/db/rollback-probe", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (rollbackProbe.rollback?.supported !== true || rollbackProbe.rollback?.rolledBack !== true || rollbackProbe.rollback?.markerAbsent !== true) {
    failures.push("sqlite rollback probe did not prove rollback");
  }

  const transactionProbe = await request("/api/db/transaction-probe", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (transactionProbe.dbStatus?.engine !== "sqlite-repository-v1" || transactionProbe.dbStatus?.writeCount <= initialStatus.writeCount) {
    failures.push("sqlite transaction probe did not increment write count");
  }

  const runJob = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('sqlite adapter qa')" })
  });
  if (runJob.job?.status !== "completed" || !runJob.result?.stdout?.includes("sqlite adapter qa")) {
    failures.push("sqlite-backed run job did not complete");
  }

  const ai = await request("/api/ai/tutor/message", {
    method: "POST",
    body: JSON.stringify({ tutorRole: "reviewer", code: "print('sqlite')", message: "check persistence", simulatePrimaryLatencyMs: 1200 })
  });
  if (ai.modelRoute?.selectedModel !== "gpt-5.3-codex-spark" || ai.providerAdapter?.status?.provider !== "codex-model-gateway") {
    failures.push("sqlite-backed AI route did not preserve model/provider evidence");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.repositoryEngine !== "sqlite-repository-v1" ||
      report.repositoryAdapter !== "node:sqlite" ||
      report.repositoryTransactionalWrites !== true ||
      report.repositoryRollbackSupported !== true ||
      !report.repositoryMigrationsApplied?.includes("001_app_document_store") ||
      report.repositoryBackupExists !== true) {
    failures.push("report export missing sqlite adapter fields");
  }

  server.child.kill();
  await wait(350);
  server = await startServer();
  const persisted = await request("/api/db/status");
  if (persisted.engine !== "sqlite-repository-v1" || persisted.counts?.authEvents < 2 || persisted.counts?.runJobs < 1) {
    failures.push("sqlite repository did not persist data across server restart");
  }
} catch (error) {
  failures.push(error.stack || error.message);
} finally {
  if (server?.child) server.child.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Database adapter QA passed: sqlite migrations, rollback, transaction, restart persistence, and report evidence.");
