import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3h-t3-approval-integrity.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3h-t3-approval-integrity.md";

const BASE_ARTIFACTS = [
  "qa-artifacts/phase3g-t3-approval-request-export.json",
  "qa-artifacts/phase3g-t3-approval-request-export.md",
  "specs/phase3g-t3-approval-request-export-contract.md",
  "scripts/t3-approval-request-export.mjs",
  "tests/t3-approval-request-export.mjs",
  "specs/phase3h-t3-approval-integrity-contract.md",
  "scripts/t3-approval-integrity.mjs",
  "tests/t3-approval-integrity.mjs"
];

const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/;

export function t3ApprovalIntegrity({
  generatedAt = new Date().toISOString(),
  extraArtifacts = []
} = {}) {
  const requiredArtifacts = unique([...BASE_ARTIFACTS, ...extraArtifacts]);
  const artifactInventory = requiredArtifacts.map((path, index) => inspectArtifact(path, index));
  const readyArtifactCount = artifactInventory.filter((item) => item.exists).length;
  const missingArtifactCount = artifactInventory.length - readyArtifactCount;
  const hashCount = artifactInventory.filter((item) => item.sha256).length;
  const secretExposure = artifactInventory.some((item) => item.secretLikeMatch === true);
  const integrityBundleHash = bundleHash(artifactInventory);

  return {
    phase: "3H",
    generatedAt,
    status: missingArtifactCount === 0 && !secretExposure ? "approval-integrity-ready" : "approval-integrity-incomplete",
    finalGoalComplete: false,
    hashOnly: true,
    contentReturned: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    executionAllowed: false,
    artifactCount: artifactInventory.length,
    readyArtifactCount,
    missingArtifactCount,
    hashCount,
    secretExposure,
    integrityBundleHash,
    artifactInventory,
    guardrails: {
      contentReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: secretExposure,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      certificationStateChanged: false,
      finalCompletionClaimed: false
    },
    nextStep: "Verify this hash-only integrity bundle immediately before any future human-approved T3 certification lane."
  };
}

export function writeT3ApprovalIntegrity(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const initialReport = t3ApprovalIntegrity(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(initialReport, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalIntegrityMarkdown(initialReport), "utf8");
  const finalReport = t3ApprovalIntegrity(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3ApprovalIntegrityMarkdown(finalReport), "utf8");
  return finalReport;
}

export function renderT3ApprovalIntegrityMarkdown(report) {
  const rows = report.artifactInventory
    .map((item) => `| ${item.path} | ${item.exists ? "yes" : "no"} | ${item.sizeBytes} | ${item.sha256 || "-"} |`)
    .join("\n");

  return `# Phase 3H T3 Approval Integrity

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Hash only: **${report.hashOnly ? "yes" : "no"}**

Content returned: **${report.contentReturned ? "yes" : "no"}**

Integrity bundle hash:

\`\`\`text
${report.integrityBundleHash}
\`\`\`

| Artifact | Exists | Size bytes | SHA-256 |
|---|---|---:|---|
${rows}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This integrity report is local and hash-only.
- It does not approve, execute, or certify any T3 lane.
- Re-run it immediately before any future approved T3 certification phase.
`;
}

function inspectArtifact(path, index) {
  const exists = existsSync(path);
  const base = {
    id: `${String(index + 1).padStart(2, "0")}-${path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`,
    path,
    category: artifactCategory(path),
    required: true,
    exists,
    sizeBytes: 0,
    sha256: null,
    secretLikeMatch: false
  };
  if (!exists) return base;
  const buffer = readFileSync(path);
  return {
    ...base,
    sizeBytes: statSync(path).size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    secretLikeMatch: SECRET_PATTERN.test(buffer.toString("utf8"))
  };
}

function bundleHash(items) {
  const material = items
    .map((item) => `${item.path}:${item.exists}:${item.sizeBytes}:${item.sha256 || "missing"}`)
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}

function artifactCategory(path) {
  if (path.startsWith("qa-artifacts/")) return "qa-artifact";
  if (path.startsWith("specs/")) return "contract";
  if (path.startsWith("scripts/")) return "runtime-helper";
  if (path.startsWith("tests/")) return "qa-script";
  return extname(path).replace(".", "") || "artifact";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const report = writeT3ApprovalIntegrity();
  console.log(`T3 approval integrity written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; artifacts=${report.artifactCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
