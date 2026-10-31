import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3148);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), CODEX_SANDBOX_CERT_TEST_SECRET: "phase2t-secret-value" }
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function runJob(code) {
  return request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code })
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      ready = health.status === "ready";
      if (ready) break;
    } catch {
      await wait(150);
    }
  }
  if (!ready) throw new Error(`server did not become ready: ${serverLog}`);

  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const initial = await request("/api/sandbox/certification");
  if (initial.certified !== false || initial.status !== "readiness-only") {
    failures.push("sandbox certification endpoint must start as readiness-only and certified=false");
  }
  if (!initial.missingCertificationControls?.includes("cpu-quota-enforced-by-runtime") ||
      !initial.missingCertificationControls?.includes("kernel-container-vm-or-browser-wasm-isolation-proof")) {
    failures.push("sandbox certification endpoint did not list required production certification controls");
  }

  await runJob("print('cert readiness safe')");
  await runJob("print(__import__('os').environ)");
  await runJob("print(open('../outside.txt').read())");
  await runJob("import urllib.request\nprint(urllib.request.urlopen('https://example.invalid'))");

  const readiness = await request("/api/sandbox/certification");
  if (readiness.certified !== false ||
      readiness.status !== "readiness-only" ||
      readiness.locallyReady !== true ||
      readiness.evidenceCounts?.v2Jobs < 4 ||
      readiness.evidenceCounts?.scrubbedEnvJobs < 4 ||
      readiness.evidenceCounts?.cleanedWorkspaceJobs < 4 ||
      readiness.evidenceCounts?.escapeBlockedJobs < 3) {
    failures.push(`sandbox certification readiness evidence incomplete: ${JSON.stringify(readiness.evidenceCounts || {})}`);
  }
  const missingLocalControls = (readiness.localControls || []).filter((item) => item.status !== "proved-local");
  if (missingLocalControls.length) {
    failures.push(`local readiness controls not proved: ${missingLocalControls.map((item) => item.id).join(", ")}`);
  }
  if ((readiness.missingCertificationControls || []).length < 8) {
    failures.push("production certification missing-control list is too weak");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.sandboxCertificationStatus !== "readiness-only" ||
      report.sandboxCertified !== false ||
      report.sandboxLocallyReadyForCertification !== true ||
      report.sandboxMissingCertificationControlCount < 8 ||
      report.sandboxCertificationEvidenceCounts?.escapeBlockedJobs < 3) {
    failures.push("report export missing sandbox certification readiness fields");
  }

  const exposed = JSON.stringify({ initial, readiness, report });
  if (exposed.includes("phase2t-secret-value")) {
    failures.push("sandbox certification readiness exposed parent secret value");
  }
} catch (error) {
  failures.push(error.stack || error.message);
} finally {
  server.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(serverLog.slice(-2000));
  process.exit(1);
}

console.log("Sandbox certification readiness QA passed: endpoint, local controls, report fields, certified=false, and no secret exposure.");
