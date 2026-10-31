import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const failures = [];
const providerRequests = [];
const fakeKey = `sk-${["cert", "ready", "local", "mock", "token", "654321"].join("")}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk.toString(); });
    req.on("end", () => resolve(raw));
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function getOpenPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const mockProvider = createServer(async (req, res) => {
  const raw = await readRequestBody(req);
  const parsed = raw ? JSON.parse(raw) : {};
  providerRequests.push({
    method: req.method,
    url: req.url,
    authorizationPresent: Boolean(req.headers.authorization),
    body: parsed
  });
  if (req.url === "/v1/responses") {
    json(res, 200, { id: "resp_cert_ready", output_text: `Certification mock coding response for ${parsed.model}` });
    return;
  }
  if (req.url === "/v1/images") {
    json(res, 200, { created: Date.now(), data: [{ revised_prompt: `Certification mock image response for ${parsed.model}` }] });
    return;
  }
  json(res, 404, { error: "unknown path" });
});

const mockPort = await getOpenPort();
await new Promise((resolve) => mockProvider.listen(mockPort, "127.0.0.1", resolve));

const appPort = Number(process.env.PORT || await getOpenPort());
const base = `http://127.0.0.1:${appPort}`;
const mockBase = `http://127.0.0.1:${mockPort}`;
const server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(appPort),
    CODEX_MODEL_API_KEY: fakeKey,
    CODEX_ENABLE_LIVE_MODEL: "1",
    CODEX_MODEL_BASE_URL: mockBase,
    CODEX_MODEL_TIMEOUT_MS: "2000"
  }
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

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

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      ready = health.status === "ready" || health.status === "ok";
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

  const initial = await request("/api/ai/provider/certification");
  if (initial.certified !== false || initial.status !== "readiness-only" || initial.provider !== "codex-model-gateway") {
    failures.push("provider certification endpoint must start readiness-only and certified=false");
  }
  if (!initial.missingCertificationControls?.includes("secret-manager-backed-provider-key") ||
      !initial.missingCertificationControls?.includes("approved-real-provider-call-with-human-authorization")) {
    failures.push("provider certification endpoint missing real-certification control list");
  }

  const fakePromptSecret = `sk-${["prompt", "redact", "cert", "test", "123456"].join("")}`;
  const blocked = await requestFailure("/api/ai/provider/live-call", {
    method: "POST",
    body: JSON.stringify({
      taskType: "coding",
      prompt: `blocked certification readiness ${fakePromptSecret}`,
      apiKey: fakeKey,
      simulatePrimaryLatencyMs: 1250
    })
  });
  if (blocked.status !== 409 || blocked.payload?.data?.plan?.outboundCall !== false || blocked.payload?.data?.plan?.secretEcho !== false) {
    failures.push("blocked provider live-call did not produce safe guard evidence");
  }

  const codingLive = await request("/api/ai/provider/live-call", {
    method: "POST",
    headers: { "X-CodeX-Live-Model": "allow" },
    body: JSON.stringify({
      taskType: "coding",
      prompt: "Certification readiness coding mock.",
      code: "for i in range(2): print(i)",
      simulatePrimaryLatencyMs: 1250
    })
  });
  if (codingLive.liveTransport?.providerPath !== "/v1/responses" ||
      codingLive.liveTransport?.selectedModel !== "gpt-5.3-codex-spark" ||
      codingLive.liveTransport?.outboundCall !== true ||
      codingLive.liveTransport?.secretEcho !== false) {
    failures.push("coding provider readiness transport evidence invalid");
  }

  const imageLive = await request("/api/ai/provider/live-call", {
    method: "POST",
    headers: { "X-CodeX-Live-Model": "allow" },
    body: JSON.stringify({ taskType: "image", prompt: "Certification readiness glass mascot." })
  });
  if (imageLive.liveTransport?.providerPath !== "/v1/images" ||
      imageLive.liveTransport?.selectedModel !== "gpt-image-2" ||
      imageLive.liveTransport?.outboundCall !== true ||
      imageLive.liveTransport?.secretEcho !== false) {
    failures.push("image provider readiness transport evidence invalid");
  }

  const readiness = await request("/api/ai/provider/certification");
  if (readiness.certified !== false ||
      readiness.status !== "readiness-only" ||
      readiness.locallyReady !== true ||
      readiness.evidenceCounts?.successfulLoopbackTransports < 2 ||
      readiness.evidenceCounts?.blockedGuards < 1 ||
      readiness.evidenceCounts?.secretEchoCount !== 0 ||
      readiness.localControls?.some((item) => item.status !== "proved-local")) {
    failures.push(`provider certification readiness incomplete: ${JSON.stringify(readiness.evidenceCounts || {})}`);
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.providerCertificationStatus !== "readiness-only" ||
      report.providerCertified !== false ||
      report.providerLocallyReadyForCertification !== true ||
      report.providerMissingCertificationControlCount < 8 ||
      report.providerCertificationEvidenceCounts?.successfulLoopbackTransports < 2) {
    failures.push("report export missing provider certification readiness fields");
  }

  const persisted = readFileSync("data/mock-db.json", "utf8");
  const exposed = JSON.stringify({ initial, blocked, codingLive, imageLive, readiness, report, persisted, providerRequests });
  if (exposed.includes(fakeKey) || exposed.includes(fakePromptSecret) || exposed.includes("Bearer ")) {
    failures.push("provider certification readiness exposed fake secret through API, report, persistence, or mock recorder");
  }
  if (providerRequests.length !== 2 || providerRequests.some((item) => item.authorizationPresent !== true)) {
    failures.push("mock provider did not receive exactly the two approved loopback calls");
  }
} catch (error) {
  failures.push(error.stack || error.message);
} finally {
  server.kill();
  await new Promise((resolve) => mockProvider.close(resolve));
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(serverLog.slice(-2000));
  process.exit(1);
}

console.log("Provider certification readiness QA passed: guard, redaction, localhost mock coding/image transport, report fields, certified=false, and no secret exposure.");
