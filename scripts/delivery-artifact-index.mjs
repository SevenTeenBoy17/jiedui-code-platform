import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const BASE_REQUIRED_ARTIFACTS = [
  "qa-artifacts/phase2s-completion-audit.json",
  "qa-artifacts/phase2s-completion-audit.md",
  "qa-artifacts/phase2o-agentic-audit.json",
  "qa-artifacts/phase2o-agentic-audit.md",
  "qa-artifacts/phase3b-delivery-handoff-dossier.json",
  "qa-artifacts/phase3b-delivery-handoff-dossier.md",
  "qa-artifacts/QA_REPORT.md",
  "specs/phase2s-delivery-completion-audit-contract.md",
  "specs/phase3a-delivery-handoff-dossier-contract.md",
  "specs/phase3b-delivery-handoff-export-contract.md",
  "specs/phase3c-delivery-artifact-index-contract.md",
  "scripts/delivery-handoff-dossier.mjs",
  "scripts/export-delivery-handoff.mjs",
  "scripts/delivery-artifact-index.mjs",
  "tests/delivery-handoff-dossier.mjs",
  "tests/delivery-handoff-export.mjs",
  "tests/delivery-artifact-index.mjs"
];

export function deliveryArtifactIndex({
  dossier = {},
  generatedAt = new Date().toISOString(),
  extraArtifacts = []
} = {}) {
  const requiredArtifacts = unique([
    ...BASE_REQUIRED_ARTIFACTS,
    ...(dossier.artifactManifest || []),
    ...extraArtifacts
  ]);
  const artifactInventory = requiredArtifacts.map((path, index) => inspectArtifact(path, index));
  const readyArtifactCount = artifactInventory.filter((item) => item.exists).length;
  const missingArtifactCount = artifactInventory.length - readyArtifactCount;
  const hashCount = artifactInventory.filter((item) => item.sha256).length;
  const localEvidencePassed = Boolean(dossier.localEvidencePassed) && missingArtifactCount === 0;
  const openCertificationGapCount = Number(dossier.openCertificationGapCount || 0);
  const status = localEvidencePassed
    ? "artifact-index-ready-with-open-certification-gaps"
    : "artifact-index-incomplete";

  return {
    phase: "3C",
    generatedAt,
    status,
    finalGoalComplete: false,
    localEvidencePassed,
    openCertificationGapCount,
    artifactCount: artifactInventory.length,
    readyArtifactCount,
    missingArtifactCount,
    hashCount,
    contentReturned: false,
    requiredArtifacts,
    artifactInventory,
    guardrails: {
      contentReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      certificationExecution: false,
      finalCompletionClaimed: false
    }
  };
}

function inspectArtifact(path, index) {
  const exists = existsSync(path);
  const base = {
    id: artifactId(path, index),
    path,
    category: artifactCategory(path),
    required: true,
    exists,
    sizeBytes: 0,
    sha256: null
  };
  if (!exists) return base;
  const buffer = readFileSync(path);
  const stats = statSync(path);
  return {
    ...base,
    sizeBytes: stats.size,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
}

function artifactId(path, index) {
  return `${String(index + 1).padStart(2, "0")}-${path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

function artifactCategory(path) {
  if (path.startsWith("qa-artifacts/")) return "qa-artifact";
  if (path.startsWith("specs/")) return "contract";
  if (path.startsWith("scripts/")) return "runtime-helper";
  if (path.startsWith("tests/")) return "qa-script";
  const ext = extname(path).replace(".", "");
  return ext || "artifact";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
