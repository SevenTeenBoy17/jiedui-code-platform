import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3140);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), CODEX_SANDBOX_TEST_SECRET: "phase2q-secret-value" }
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

function hasV2Isolation(runner) {
  return runner?.engine === "sandbox-runner-v2" &&
    runner?.isolation === "process-scrubbed-temp-workspace-no-exec" &&
    runner?.envPolicy === "allowlist-scrubbed" &&
    runner?.secretEnvPresent === false &&
    runner?.workspace?.kind === "ephemeral-temp" &&
    runner?.workspace?.cleaned === true &&
    runner?.workspace?.pathExposed === false &&
    runner?.outputLimitBytes === 65536 &&
    !(runner?.envKeysAllowed || []).some((key) => /SECRET|TOKEN|KEY|API/i.test(key));
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

  const policy = await request("/api/sandbox/policy");
  if (policy.policy?.filesystem !== "ephemeral-temp-workspace" ||
      policy.policy?.process !== "no-shell-child-process" ||
      policy.policy?.outputLimitBytes !== 65536 ||
      policy.runner?.engine !== "sandbox-runner-v2" ||
      policy.runner?.envPolicy !== "allowlist-scrubbed") {
    failures.push("sandbox policy endpoint did not expose v2 isolation contract");
  }

  const safe = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('isolated qa')" })
  });
  if (safe.job?.status !== "completed" ||
      !safe.result?.stdout?.includes("isolated qa") ||
      !hasV2Isolation(safe.job?.runner) ||
      !hasV2Isolation(safe.result?.runnerDiagnostics)) {
    failures.push("safe sandbox job did not complete with v2 isolation evidence");
  }

  const envEscape = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print(__import__('os').environ)" })
  });
  if (envEscape.job?.status !== "rejected" ||
      !envEscape.result?.sandbox?.violations?.some((item) => item.id === "python-eval" || item.id === "python-os") ||
      !hasV2Isolation(envEscape.job?.runner)) {
    failures.push("environment escape was not rejected with v2 isolation evidence");
  }

  const pathEscape = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print(open('../outside.txt').read())" })
  });
  if (pathEscape.job?.status !== "rejected" ||
      !pathEscape.result?.sandbox?.violations?.some((item) => item.id === "python-eval" || item.id === "path-traversal") ||
      !hasV2Isolation(pathEscape.job?.runner)) {
    failures.push("path/file escape was not rejected with v2 isolation evidence");
  }

  const networkEscape = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "import urllib.request\nprint(urllib.request.urlopen('https://example.invalid'))" })
  });
  if (networkEscape.job?.status !== "rejected" ||
      !networkEscape.result?.sandbox?.violations?.some((item) => item.id === "python-network") ||
      !hasV2Isolation(networkEscape.job?.runner)) {
    failures.push("network escape was not rejected with v2 isolation evidence");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.sandboxIsolationCount < 4 || report.sandboxEscapeBlockedCount < 3 || report.runnerBoundaryCount < 4) {
    failures.push("report did not count v2 sandbox isolation and escape-blocked evidence");
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

console.log("Sandbox isolation QA passed: v2 policy, safe run, env/path/network escape blocking, and report counts.");
