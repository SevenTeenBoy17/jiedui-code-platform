#!/usr/bin/env node

import { OUTPUT_LIMIT_BYTES, runnerMetadata, sandboxPreflight } from "./sandbox-isolation.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function simulateRun(language, code) {
  if (language === "python") {
    const prints = [...String(code).matchAll(/print\((["'`])(.+?)\1\)/g)].map((match) => match[2]);
    return {
      status: "completed",
      stdout: prints.length ? prints.join("\n") : "Canvas updated: turtle path generated",
      stderr: "",
      durationMs: 48,
      canvasCommands: ["circle", "forward", "turn"]
    };
  }
  return {
    status: "completed",
    stdout: language === "cpp" ? "gcd(24, 18)=6" : "Computational thinking challenge: excellent",
    stderr: "",
    durationMs: 64,
    canvasCommands: []
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function main() {
  const startedAt = new Date().toISOString();
  const payload = JSON.parse(await readStdin() || "{}");
  const language = payload.language || "python";
  const code = payload.code || "";
  const sandbox = sandboxPreflight(language, code);
  const sourceBytes = Buffer.byteLength(String(code), "utf8");
  const stdinBytes = Buffer.byteLength(String(payload.stdin || ""), "utf8");
  const baseDiagnostics = {
    startedAt,
    timeoutMs: payload.runnerTimeoutMs || sandbox.maxRuntimeMs,
    sourceBytes,
    stdinBytes,
    outputLimitBytes: OUTPUT_LIMIT_BYTES,
    workspace: { created: true, cleaned: false, id: payload.sandboxWorkspaceId || null }
  };

  await sleep(payload.simulateRunnerDelayMs);

  if (!sandbox.allowed) {
    process.stdout.write(JSON.stringify({
      status: "rejected",
      stdout: "",
      stderr: sandbox.violations.map((item) => item.message).join("\n"),
      durationMs: 0,
      canvasCommands: [],
      sandbox,
      runnerDiagnostics: runnerMetadata({ ...baseDiagnostics, blocked: true, completedAt: new Date().toISOString() })
    }));
    return;
  }

  const result = simulateRun(language, code);
  const stdoutBytes = Buffer.byteLength(result.stdout || "", "utf8");
  process.stdout.write(JSON.stringify({
    ...result,
    stdout: stdoutBytes > OUTPUT_LIMIT_BYTES ? result.stdout.slice(0, OUTPUT_LIMIT_BYTES) : result.stdout,
    sandbox,
    runnerDiagnostics: runnerMetadata({
      ...baseDiagnostics,
      blocked: false,
      stdoutBytes,
      outputTruncated: stdoutBytes > OUTPUT_LIMIT_BYTES,
      completedAt: new Date().toISOString()
    })
  }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    status: "failed",
    stdout: "",
    stderr: error.message,
    durationMs: 0,
    canvasCommands: [],
    sandbox: {
      allowed: false,
      safetyLabel: "sandbox-runner-error",
      violations: [{ id: "runner-error", message: error.message }],
      maxRuntimeMs: 2000,
      network: "disabled",
      filesystem: "ephemeral-temp-workspace",
      outputLimitBytes: OUTPUT_LIMIT_BYTES
    },
    runnerDiagnostics: runnerMetadata({
      failed: true,
      completedAt: new Date().toISOString()
    })
  }));
  process.exitCode = 1;
});
