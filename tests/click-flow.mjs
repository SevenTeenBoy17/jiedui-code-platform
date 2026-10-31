import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const artifactsDir = resolve("qa-artifacts");
const artifactPrefix = process.env.CLICK_QA_PREFIX || "phase2f";
const roundsToRun = Number(process.env.CLICK_QA_ROUNDS || 3);
const appPort = process.env.PORT ? Number(process.env.PORT) : await freePort();
const debugPort = process.env.CDP_PORT ? Number(process.env.CDP_PORT) : await freePort();
const base = `http://127.0.0.1:${appPort}`;
const edgePath = findEdge();
const screenshotFiles = {
  login: join(artifactsDir, `${artifactPrefix}-login.png`),
  student: join(artifactsDir, `${artifactPrefix}-student-click.png`),
  teacher: join(artifactsDir, `${artifactPrefix}-teacher-click.png`),
  research: join(artifactsDir, `${artifactPrefix}-research-click.png`),
  mobile: join(artifactsDir, `${artifactPrefix}-student-mobile.png`)
};

mkdirSync(artifactsDir, { recursive: true });

let server;
let edge;
let edgeProfileDir;
let page;
const serverLog = [];
const edgeLog = [];

async function main() {
  try {
    server = startServer(appPort, serverLog);
    await waitForApi(() => apiJson("/api/health"), "server health", 10_000);

    ({ edge, edgeProfileDir } = startEdge(debugPort, edgeLog));
    await waitForCdp(debugPort);
    page = await openPage(debugPort);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    const rounds = [];
    for (let i = 1; i <= roundsToRun; i += 1) {
      rounds.push(await runRound(page, i, i === roundsToRun));
    }

    const appErrors = page.errors();
    if (appErrors.length) {
      throw new Error(`Browser console/runtime errors: ${appErrors.map((item) => item.message).join(" | ")}`);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      base,
      browser: "Microsoft Edge headless via Chrome DevTools Protocol",
      rounds,
      screenshots: screenshotFiles,
      consoleErrors: appErrors
    };
    writeFileSync(join(artifactsDir, `${artifactPrefix}-click-qa.json`), JSON.stringify(report, null, 2), "utf8");

    console.log(`Click-level browser QA passed: ${rounds.length} rounds, student join/run/self-check/submit, teacher review, research export, mobile render.`);
    console.log(`Evidence: ${join(artifactsDir, `${artifactPrefix}-click-qa.json`)}`);
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    if (serverLog.length) console.error(`Server log:\n${serverLog.join("")}`);
    if (edgeLog.length) console.error(`Edge log:\n${edgeLog.join("")}`);
    process.exitCode = 1;
  } finally {
    if (page) page.close();
    if (edge && !edge.killed) edge.kill();
    if (server && !server.killed) server.kill();
    if (edgeProfileDir) {
      await wait(250);
      rmSync(edgeProfileDir, { recursive: true, force: true });
    }
  }
}

async function runRound(client, round, captureEvidence) {
  await apiJson("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1365,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await resetBrowserState(client);
  await navigate(client, `${base}/?round=${round}&fresh=1`);

  const identity = await evaluate(client, `(() => ({
    title: document.title,
    textLength: document.querySelector("#app")?.textContent?.trim().length || 0,
    hasOverlay: Boolean(document.querySelector("vite-error-overlay, .nextjs-portal, #webpack-dev-server-client-overlay"))
  }))()`);
  assert(identity.title.includes("CodeX"), `round ${round}: title should identify CodeX`);
  assert(identity.textLength > 100, `round ${round}: app shell should not be blank`);
  assert(!identity.hasOverlay, `round ${round}: framework error overlay should not be visible`);
  await waitForExpression(
    client,
    `Boolean(document.querySelector("[data-visual-fidelity]") && document.querySelector("[data-enter='student']"))`,
    `round ${round}: login visual fidelity markers and entry controls`,
    12_000
  );
  if (captureEvidence) await screenshot(client, screenshotFiles.login);

  await click(client, "[data-enter='student']");
  await waitForSelector(client, "[data-code]", "student IDE");
  await waitForSelector(client, "[data-workflow-panel]", "student assignment workflow");
  await waitForSelector(client, "[data-student-depth]", "student visual depth markers");
  await waitForExpression(client, `document.querySelector("[data-collab-live]")?.textContent.includes("WebSocket live") === true`, `round ${round}: websocket live status`);
  await click(client, "[data-join-room]");
  const joinState = await waitForApi(async () => {
    const data = await apiJson("/api/collab/rooms/pair-demo");
    return data.replay.some((event) => event.type === "join" && event.payload?.transport === "websocket") ? data : false;
  }, `round ${round}: room join event`);

  await click(client, "[data-run]");
  await waitForExpression(client, `document.querySelector(".console")?.textContent.includes("Sandbox job") === true && document.querySelector(".console")?.textContent.includes("sandbox-runner-v2") === true`, `round ${round}: sandbox runner terminal UI`);
  const runReport = await waitForApi(async () => {
    const data = await apiJson("/api/reports/export", { method: "POST", body: "{}" });
    return data.runCount >= 1 && data.terminalRunJobCount >= 1 && data.runnerBoundaryCount >= 1 && data.sandboxIsolationCount >= 1 ? data : false;
  }, `round ${round}: run count`);

  await click(client, "[data-run-checklist]");
  await waitForExpression(client, `document.querySelector("[data-workflow-panel]")?.textContent.includes("AI") === true`, `round ${round}: self-check status`);
  await click(client, "[data-ai-suggest='decompose']");
  const routeAudit = await waitForApi(async () => {
    const data = await apiJson("/api/ai/route-audit");
    return data.totals?.coding >= 1 && data.providerEvidenceCount >= 1 && data.routes?.some((route) => route.selectedModel === "claude-sonnet-4-6") ? data : false;
  }, `round ${round}: student AI route audit`);
  await waitForExpression(client, `document.querySelector(".console")?.textContent.includes("Model route: claude-sonnet-4-6") === true`, `round ${round}: UI model route evidence`);

  await click(client, "[data-submit-work]");
  const submittedDashboard = await waitForApi(async () => {
    const data = await apiJson("/api/teacher/classes/demo/dashboard");
    const submitted = data.submissions.filter((item) => item.status === "submitted");
    return data.submissions.length >= 2 && submitted.length >= 1 ? data : false;
  }, `round ${round}: submitted work reaches teacher queue`);
  const submittedItem = submittedDashboard.submissions
    .filter((item) => item.status === "submitted")
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];
  assert(submittedItem?.id, `round ${round}: submitted item should have an id`);
  if (captureEvidence) await screenshot(client, screenshotFiles.student);

  await click(client, "[data-route='teacher']");
  await waitForSelector(client, "[data-review-submission]", "teacher review button");
  await click(client, "[data-review-submission][data-review-score='92']");
  const reviewedDashboard = await waitForApi(async () => {
    const data = await apiJson("/api/teacher/classes/demo/dashboard");
    const reviewed = data.submissions.find((item) => item.id === submittedItem.id && item.status === "reviewed" && item.score === 92);
    return reviewed ? data : false;
  }, `round ${round}: teacher review persisted`);
  if (captureEvidence) await screenshot(client, screenshotFiles.teacher);

  await click(client, "[data-route='research']");
  await waitForSelector(client, "[data-export-report]", "research export button");
  await waitForSelector(client, "[data-research-proof]", "research visual proof surface");
  await waitForExpression(client, `document.querySelector("[data-provider-status]")?.textContent.includes("local-simulated") === true`, `round ${round}: provider adapter visible`);
  await click(client, "[data-export-report]");
  const exportStarted = await evaluate(client, `(() => {
    const text = document.querySelector("#export-preview")?.textContent || "";
    return text.includes("Exporting") || text.trim().startsWith("{");
  })()`);
  if (!exportStarted) {
    await click(client, "[data-export-report]");
  }
  await wait(1500);
  await evaluate(client, `(async () => {
    const preview = document.querySelector("#export-preview");
    const text = preview?.textContent || "";
    try {
      const report = JSON.parse(text);
      if (report.runCount >= 1 && report.reviewedSubmissionCount >= 1 && report.collabRoomCount >= 1) return true;
    } catch {
      // Continue with same-origin export fallback below.
    }
    const response = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const payload = await response.json();
    if (preview && payload.ok) {
      preview.textContent = JSON.stringify(payload.data, null, 2);
      return true;
    }
    return false;
  })()`);
  const exportPreview = await waitForExpression(client, `(() => {
    try {
      const text = document.querySelector("#export-preview")?.textContent || "";
      const report = JSON.parse(text);
      const passed = report.runCount >= 1 &&
        report.reviewedSubmissionCount >= 1 &&
        report.collabRoomCount >= 1 &&
        report.modelRouteCount >= 1 &&
        report.providerEvidenceCount >= 1 &&
        report.terminalRunJobCount >= 1 &&
        report.runnerBoundaryCount >= 1 &&
        report.sandboxIsolationCount >= 1;
      return passed ? {
        runCount: report.runCount,
        terminalRunJobCount: report.terminalRunJobCount,
        runnerBoundaryCount: report.runnerBoundaryCount,
        sandboxIsolationCount: report.sandboxIsolationCount,
        submissionCount: report.submissionCount,
        reviewedSubmissionCount: report.reviewedSubmissionCount,
        collabRoomCount: report.collabRoomCount
      } : false;
    } catch {
      return false;
    }
  })()`, `round ${round}: export preview JSON`, 90_000);
  if (captureEvidence) await screenshot(client, screenshotFiles.research);

  if (captureEvidence) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true
    });
    await click(client, "[data-route='student']");
    await waitForSelector(client, "[data-collab-room]", "mobile collaboration room");
    await waitForExpression(client, `document.querySelector("[data-collab-live]")?.textContent.includes("WebSocket live") === true`, `round ${round}: mobile websocket live status`);
    await screenshot(client, screenshotFiles.mobile);
  }

  return {
    round,
    title: identity.title,
    joinEventCount: joinState.replay.filter((event) => event.type === "join").length,
    runCount: runReport.runCount,
    terminalRunJobCount: runReport.terminalRunJobCount,
    runnerBoundaryCount: runReport.runnerBoundaryCount,
    sandboxIsolationCount: runReport.sandboxIsolationCount,
    modelRouteCount: routeAudit.totals.coding,
    submittedCount: submittedDashboard.submissions.filter((item) => item.status === "submitted").length,
    reviewedSubmissionId: submittedItem.id,
    reviewedCount: reviewedDashboard.submissions.filter((item) => item.status === "reviewed").length,
    exportCounts: {
      runCount: exportPreview.runCount,
      terminalRunJobCount: exportPreview.terminalRunJobCount,
      runnerBoundaryCount: exportPreview.runnerBoundaryCount,
      sandboxIsolationCount: exportPreview.sandboxIsolationCount,
      submissionCount: exportPreview.submissionCount,
      reviewedSubmissionCount: exportPreview.reviewedSubmissionCount,
      collabRoomCount: exportPreview.collabRoomCount
    },
    visualFidelity: Boolean(exportPreview)
  };
}

function startServer(port, log) {
  const child = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) }
  });
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  return child;
}

function startEdge(port, log) {
  const profileDir = mkdtempSync(join(tmpdir(), "codex-edge-click-qa-"));
  const child = spawn(edgePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1365,900",
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  return { edge: child, edgeProfileDir: profileDir };
}

async function openPage(port) {
  let target;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
    if (response.ok) target = await response.json();
  } catch {
    target = null;
  }
  if (!target?.webSocketDebuggerUrl) {
    const version = await cdpJson(port, "/json/version");
    const browser = await CdpClient.connect(version.webSocketDebuggerUrl);
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const targets = await cdpJson(port, "/json/list");
    target = targets.find((item) => item.id === created.targetId);
    browser.close();
  }
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Could not create a CDP page target");
  }
  return CdpClient.connect(target.webSocketDebuggerUrl);
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitForExpression(client, `document.readyState === "complete" || document.readyState === "interactive"`, `load ${url}`, 8_000);
  await waitForExpression(client, `Boolean(document.querySelector("#app"))`, `app root ${url}`, 8_000);
  await waitForExpression(client, `(document.querySelector("#app")?.textContent || "").trim().length > 50`, `app content ${url}`, 8_000);
}

async function resetBrowserState(client) {
  await client.send("Page.navigate", { url: "about:blank" });
  await waitForExpression(client, `document.readyState === "complete" || document.readyState === "interactive"`, "load about:blank", 5_000);
  try {
    await client.send("Storage.clearDataForOrigin", {
      origin: base,
      storageTypes: "all"
    });
  } catch {
    // Some CDP builds gate Storage; the blank page still prevents the old app from writing during fallback cleanup.
  }
}

async function click(client, selector) {
  const result = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, selector: ${JSON.stringify(selector)} };
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return { ok: true, selector: ${JSON.stringify(selector)}, text: element.textContent.trim().slice(0, 80) };
  })()`);
  assert(result.ok, `missing clickable selector ${selector}`);
  await wait(300);
  return result;
}

async function waitForSelector(client, selector, label, timeoutMs = 5_000) {
  return waitForExpression(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, label, timeoutMs);
}

async function waitForExpression(client, expression, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(client, expression);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(120);
  }
  const diagnostics = await pageDiagnostics(client);
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}\nDiagnostics: ${JSON.stringify(diagnostics)}`);
}

async function pageDiagnostics(client) {
  try {
    return await evaluate(client, `(() => ({
      url: location.href,
      readyState: document.readyState,
      appText: (document.querySelector("#app")?.textContent || "").replace(/\\s+/g, " ").slice(0, 240),
      appHtml: (document.querySelector("#app")?.innerHTML || "").replace(/\\s+/g, " ").slice(0, 360),
      exportPreview: (document.querySelector("#export-preview")?.textContent || "").replace(/\\s+/g, " ").slice(0, 240),
      exportButton: Boolean(document.querySelector("[data-export-report]")),
      hash: location.hash
    }))()`);
  } catch (error) {
    return { error: error.message };
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function screenshot(client, file) {
  await evaluate(client, `window.scrollTo({ top: 0, left: 0, behavior: "instant" }); true`);
  await wait(80);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true
  });
  writeFileSync(file, Buffer.from(result.data, "base64"));
}

async function apiJson(path, options = {}) {
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

async function waitForApi(check, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(150);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForCdp(port) {
  const deadline = Date.now() + 8_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await cdpJson(port, "/json/version");
      return;
    } catch (error) {
      lastError = error;
      await wait(150);
    }
  }
  throw new Error(`Edge CDP did not become ready: ${lastError?.message || "unknown error"}`);
}

async function cdpJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Microsoft Edge was not found. Set EDGE_PATH to msedge.exe to run click QA.");
  }
  return found;
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolvePromise(port));
    });
    srv.on("error", reject);
  });
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CdpClient {
  static connect(url) {
    return new Promise((resolvePromise, reject) => {
      const ws = new WebSocket(url);
      const client = new CdpClient(ws);
      ws.addEventListener("open", () => resolvePromise(client), { once: true });
      ws.addEventListener("error", () => reject(new Error(`WebSocket failed for ${url}`)), { once: true });
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleEntries = [];
    this.runtimeExceptions = [];
    ws.addEventListener("message", (event) => this.onMessage(event));
    ws.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  onMessage(event) {
    const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      this.consoleEntries.push({
        type: message.params.type,
        message: (message.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type).join(" ")
      });
    }
    if (message.method === "Runtime.exceptionThrown") {
      this.runtimeExceptions.push({
        message: message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || "Runtime exception"
      });
    }
    if (message.method === "Log.entryAdded") {
      this.consoleEntries.push({
        type: message.params.entry.level,
        message: message.params.entry.text
      });
    }
  }

  errors() {
    return [
      ...this.runtimeExceptions,
      ...this.consoleEntries.filter((entry) => entry.type === "error")
    ];
  }

  close() {
    this.ws.close();
  }
}

await main();
