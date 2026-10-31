import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const failures = [];
const providerRequests = [];
const fakeKey = `sk-${["local", "mock", "provider", "runtime", "token", "123456"].join("")}`;

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
    contentType: req.headers["content-type"] || null,
    body: parsed
  });

  if (req.url === "/v1/responses") {
    json(res, 200, {
      id: "resp_local_mock",
      output_text: `Mock coding hint for ${parsed.model}`,
      usage: { input_tokens: 12, output_tokens: 8 }
    });
    return;
  }

  if (req.url === "/v1/images") {
    json(res, 200, {
      created: Date.now(),
      data: [{ revised_prompt: `Mock image brief for ${parsed.model}`, url: "https://local.invalid/mock-image.png" }]
    });
    return;
  }

  json(res, 404, { error: "unknown mock provider path" });
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

  const status = await request("/api/ai/provider/status");
  if (status.mode !== "live-ready" || status.configured !== true || status.liveEnabled !== true || status.transport?.baseUrlHost !== "127.0.0.1") {
    failures.push("provider status did not report guarded live-ready localhost mode");
  }

  const blocked = await requestFailure("/api/ai/provider/live-call", {
    method: "POST",
    body: JSON.stringify({ taskType: "coding", prompt: "blocked without header" })
  });
  if (blocked.status !== 409 || blocked.payload?.data?.plan?.outboundCall !== false || !blocked.payload?.data?.plan?.guard?.blockingReasons?.includes("missing X-CodeX-Live-Model: allow")) {
    failures.push("live-call did not remain blocked without explicit header");
  }

  const codingLive = await request("/api/ai/provider/live-call", {
    method: "POST",
    headers: { "X-CodeX-Live-Model": "allow" },
    body: JSON.stringify({
      taskType: "coding",
      prompt: "Give a turtle-style loop hint.",
      code: "for i in range(3): print(i)",
      simulatePrimaryLatencyMs: 1250
    })
  });
  if (codingLive.liveTransport?.providerPath !== "/v1/responses" ||
      codingLive.liveTransport?.selectedModel !== "gpt-5.3-codex-spark" ||
      codingLive.liveTransport?.providerStatusCode !== 200 ||
      codingLive.liveTransport?.outboundCall !== true ||
      codingLive.liveTransport?.secretEcho !== false) {
    failures.push("coding live transport did not call fallback response path successfully");
  }

  const imageLive = await request("/api/ai/provider/live-call", {
    method: "POST",
    headers: { "X-CodeX-Live-Model": "allow" },
    body: JSON.stringify({ taskType: "image", prompt: "3D glass turtle mascot brief" })
  });
  if (imageLive.liveTransport?.providerPath !== "/v1/images" ||
      imageLive.liveTransport?.selectedModel !== "gpt-image-2" ||
      imageLive.liveTransport?.providerStatusCode !== 200 ||
      imageLive.liveTransport?.outboundCall !== true ||
      imageLive.liveTransport?.secretEcho !== false) {
    failures.push("image live transport did not call image path successfully");
  }

  if (providerRequests.length !== 2) failures.push(`mock provider expected 2 calls, got ${providerRequests.length}`);
  if (providerRequests[0]?.url !== "/v1/responses" || providerRequests[0]?.body?.model !== "gpt-5.3-codex-spark") {
    failures.push("mock provider did not receive coding fallback request shape");
  }
  if (providerRequests[1]?.url !== "/v1/images" || providerRequests[1]?.body?.model !== "gpt-image-2") {
    failures.push("mock provider did not receive image request shape");
  }
  if (!providerRequests.every((item) => item.authorizationPresent === true)) {
    failures.push("mock provider did not receive Authorization header on each live call");
  }

  const routeAudit = await request("/api/ai/route-audit");
  if (routeAudit.liveTransportCount < 2 || !routeAudit.liveTransports?.every((item) => item.outboundCall === true && item.secretEcho === false)) {
    failures.push("route audit missing sanitized live transport evidence");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.providerMode !== "live-ready" || report.providerOutboundCallCount < 2 || report.providerTransportFailureCount !== 0) {
    failures.push("report export missing successful provider outbound transport counts");
  }

  const persisted = readFileSync("data/mock-db.json", "utf8");
  const exposedSurface = JSON.stringify({ status, blocked, codingLive, imageLive, routeAudit, report, persisted });
  if (exposedSurface.includes(fakeKey) || exposedSurface.includes("Bearer ")) {
    failures.push("runtime provider secret leaked through API, audit, report, or persistence");
  }
  if (JSON.stringify(providerRequests).includes(fakeKey)) {
    failures.push("mock request recorder captured raw authorization secret");
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

console.log("Provider transport QA passed: default block, guarded localhost coding/image calls, sanitized audit/report/persistence.");
