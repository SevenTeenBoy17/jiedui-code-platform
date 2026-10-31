import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const dbPath = "data/mock-db.json";
const original = existsSync(dbPath) ? readFileSync(dbPath, "utf8") : "";
const port = Number(process.env.PORT || 3130);
const base = `http://127.0.0.1:${port}`;
let server;
let serverLog = "";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path) {
  const response = await fetch(`${base}${path}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload.data;
}

try {
  writeFileSync(dbPath, "{ malformed json for recovery test", "utf8");
  server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) }
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {
      await wait(200);
    }
  }
  if (!ready) throw new Error(`recovery server not ready: ${serverLog}`);

  const bootstrap = await request("/api/bootstrap");
  if (bootstrap.dbMeta?.schemaVersion !== 4 || bootstrap.dbMeta?.recoveredFromCorruptJson !== true) {
    throw new Error("corrupt JSON recovery did not mark schema v4 recovery metadata");
  }
  if (!bootstrap.auth?.users?.some((user) => user.id === "student-linyi") || bootstrap.auth?.authEventCount < 2) {
    throw new Error("corrupt JSON recovery did not restore auth users/events");
  }
  const dbStatus = await request("/api/db/status");
  if (dbStatus.engine !== "json-repository-v1" || dbStatus.status !== "recovered" || dbStatus.lastRecoveryReason !== "malformed-json") {
    throw new Error("corrupt JSON recovery did not preserve repository recovery metadata");
  }
  console.log("Auth recovery QA passed: malformed JSON recovered to schema v4 with auth seed data and repository metadata.");
} finally {
  if (server) server.kill();
  writeFileSync(dbPath, original, "utf8");
}
