import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const RUNNER_ENGINE = "sandbox-runner-v2";
export const RUNNER_ISOLATION = "process-scrubbed-temp-workspace-no-exec";
export const RUNNER_ENV_POLICY = "allowlist-scrubbed";
export const OUTPUT_LIMIT_BYTES = 64 * 1024;

const envAllowlist = new Set([
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP"
]);

const secretNamePattern = /api|key|token|secret|authorization|credential|password/i;

export function sandboxPreflight(language, code) {
  const source = String(code || "");
  const rules = [
    { id: "python-os", pattern: /\bimport\s+os\b|\bfrom\s+os\s+import\b|\bos\.(environ|listdir|system|getcwd)/i, languages: ["python"], message: "Python os module and environment access are blocked in student sandbox." },
    { id: "python-subprocess", pattern: /\bsubprocess\b|\bsocket\b|\bshutil\b|\bpathlib\b/i, languages: ["python"], message: "Process, socket, and filesystem modules are blocked." },
    { id: "python-network", pattern: /\brequests\b|\burllib\b|\bhttp\.client\b|\bftplib\b|\bwebsocket\b/i, languages: ["python"], message: "Network libraries are blocked in student sandbox." },
    { id: "python-eval", pattern: /\beval\s*\(|\bexec\s*\(|\bopen\s*\(|\binput\s*\(|__import__\s*\(/i, languages: ["python"], message: "eval, exec, dynamic import, input, and direct file access are blocked." },
    { id: "path-traversal", pattern: /\.\.[/\\]|[A-Za-z]:\\|\/etc\/|\/proc\/|~[/\\]/i, languages: ["python", "c", "cpp"], message: "Path traversal and host filesystem paths are blocked." },
    { id: "c-system", pattern: /\bsystem\s*\(|\bfork\s*\(|\bexec[a-z]*\s*\(|#include\s*<\s*(fstream|filesystem|unistd\.h|sys\/socket\.h|windows\.h)\s*>/i, languages: ["c", "cpp"], message: "Native system, process, file, and socket calls are blocked." },
    { id: "runaway-loop", pattern: /while\s*\(?\s*(true|1)\s*\)?\s*:|while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\)/i, languages: ["python", "c", "cpp"], message: "Unbounded loops need teacher approval before running." }
  ];
  const violations = rules
    .filter((rule) => rule.languages.includes(language) && rule.pattern.test(source))
    .map((rule) => ({ id: rule.id, message: rule.message }));
  return sandboxPolicy({
    allowed: violations.length === 0,
    safetyLabel: violations.length === 0 ? "sandbox-ok" : "sandbox-blocked",
    violations
  });
}

export function sandboxPolicy(extra = {}) {
  return {
    allowed: extra.allowed !== false,
    safetyLabel: extra.safetyLabel || "sandbox-ok",
    violations: extra.violations || [],
    maxRuntimeMs: Number(extra.maxRuntimeMs || 2000),
    network: "disabled",
    filesystem: "ephemeral-temp-workspace",
    process: "no-shell-child-process",
    outputLimitBytes: OUTPUT_LIMIT_BYTES,
    blockedPatterns: [
      "os/subprocess/socket/pathlib",
      "requests/urllib/http.client",
      "eval/exec/open/input/__import__",
      "system/fork/exec/native filesystem",
      "path traversal",
      "unbounded loop"
    ]
  };
}

export function runnerMetadata(extra = {}) {
  const workspace = extra.workspace || {};
  return {
    engine: RUNNER_ENGINE,
    isolation: RUNNER_ISOLATION,
    isolationTier: "T2-local-hardened",
    network: "disabled",
    filesystem: "ephemeral-temp-workspace",
    process: "no-shell-child-process",
    envPolicy: RUNNER_ENV_POLICY,
    secretEnvPresent: false,
    outputLimitBytes: OUTPUT_LIMIT_BYTES,
    workspace: {
      kind: "ephemeral-temp",
      created: workspace.created !== false,
      cleaned: workspace.cleaned === true,
      pathExposed: false
    },
    ...extra,
    workspace: {
      kind: "ephemeral-temp",
      created: workspace.created !== false,
      cleaned: workspace.cleaned === true,
      pathExposed: false,
      ...(workspace.id ? { id: workspace.id } : {})
    }
  };
}

export function createSandboxWorkspace() {
  const path = mkdtempSync(join(tmpdir(), "codex-sandbox-"));
  return {
    path,
    id: path.split(/[/\\]/).pop() || "codex-sandbox"
  };
}

export function cleanupSandboxWorkspace(workspace) {
  if (!workspace?.path) return false;
  rmSync(workspace.path, { recursive: true, force: true });
  return true;
}

export function createScrubbedEnv(baseEnv = process.env, workspace) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (envAllowlist.has(key) && !secretNamePattern.test(key)) env[key] = value;
  }
  if (workspace?.path) {
    env.TEMP = workspace.path;
    env.TMP = workspace.path;
  }
  env.CODEX_SANDBOX = "1";
  env.CODEX_SANDBOX_NETWORK = "disabled";
  return env;
}

export function scrubbedEnvHasSecret(env = {}) {
  return Object.keys(env).some((key) => secretNamePattern.test(key));
}
