import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const failures = [];
const port = Number(process.env.PORT || 3153);
const base = `http://127.0.0.1:${port}`;
const dbPath = resolve("qa-artifacts", "phase2v-sqlite", "codex-cert.sqlite");
const backupPath = resolve("qa-artifacts", "phase2v-sqlite", "codex-cert.sqlite.latest");
const fakeSecret = "phase2v-db-secret-value";

mkdirSync(dirname(dbPath), { recursive: true });
for (const path of [dbPath, backupPath, `${dbPath}-wal`, `${dbPath}-shm`, `${backupPath}-wal`, `${backupPath}-shm`]) {
  rmSync(path, { force: true });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = {
    ...process.env,
    PORT: String(port),
    CODEX_DB_ENGINE: "sqlite",
    CODEX_SQLITE_DB_PATH: dbPath,
    CODEX_SQLITE_BACKUP_PATH: backupPath,
    CODEX_DB_CERT_TEST_SECRET: fakeSecret
  };
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
      if (health.repository === "sqlite-repository-v1") return { child, log: () => log };
    } catch {
      await wait(150);
    }
  }
  throw new Error(`sqlite cert server did not become ready: ${log}`);
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

  const initial = await request("/api/db/certification");
  if (initial.certified !== false ||
      initial.status !== "readiness-only" ||
      initial.currentEngine !== "sqlite-repository-v1" ||
      !initial.missingCertificationControls?.includes("managed-postgres-or-supabase-provisioned") ||
      !initial.missingCertificationControls?.includes("secret-manager-backed-database-url")) {
    failures.push("database certification endpoint did not expose readiness-only non-certified sqlite status");
  }
  if (initial.locallyReady !== true || initial.localControls?.some((item) => item.status !== "proved-local")) {
    failures.push(`database certification local controls incomplete after sqlite reset: ${JSON.stringify(initial.evidenceCounts || {})}`);
  }

  const transactionProbe = await request("/api/db/transaction-probe", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (transactionProbe.dbStatus?.engine !== "sqlite-repository-v1" || transactionProbe.dbStatus?.writeCount < 2) {
    failures.push("transaction probe did not persist through sqlite repository");
  }

  const rollbackProbe = await request("/api/db/rollback-probe", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (rollbackProbe.rollback?.supported !== true || rollbackProbe.rollback?.rolledBack !== true || rollbackProbe.rollback?.markerAbsent !== true) {
    failures.push("rollback probe did not prove sqlite rollback");
  }

  await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('db certification readiness')" })
  });

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.databaseCertificationStatus !== "readiness-only" ||
      report.databaseCertified !== false ||
      report.databaseLocallyReadyForCertification !== true ||
      report.databaseMissingCertificationControlCount < 10 ||
      report.databaseCertificationEvidenceCounts?.provedLocalControlCount < 10 ||
      report.repositoryEngine !== "sqlite-repository-v1" ||
      report.repositoryBackupExists !== true) {
    failures.push("report export missing database certification readiness fields");
  }

  server.child.kill();
  await wait(350);
  server = await startServer();

  const persisted = await request("/api/db/status");
  if (persisted.engine !== "sqlite-repository-v1" || persisted.counts?.runJobs < 1 || persisted.counts?.authEvents < 2) {
    failures.push("sqlite certification evidence did not persist across restart");
  }

  const restartedCertification = await request("/api/db/certification");
  if (restartedCertification.certified !== false ||
      restartedCertification.status !== "readiness-only" ||
      restartedCertification.locallyReady !== true ||
      restartedCertification.evidenceCounts?.backupExists !== true) {
    failures.push("database certification readiness did not survive sqlite restart");
  }

  const exposed = JSON.stringify({ initial, transactionProbe, rollbackProbe, report, persisted, restartedCertification });
  if (exposed.includes(fakeSecret) || /postgres:\/\/|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i.test(exposed)) {
    failures.push("database certification readiness exposed fake secret or database credential markers");
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

console.log("Database certification readiness QA passed: sqlite migrations, transaction, rollback, backup, restart persistence, report fields, certified=false, and no DB secret exposure.");
