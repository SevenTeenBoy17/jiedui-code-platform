import { existsSync, readFileSync, statSync } from "node:fs";
import { buildDeliveryHandoffExport, writeDeliveryHandoffExport } from "../scripts/export-delivery-handoff.mjs";

const jsonPath = "qa-artifacts/phase3b-delivery-handoff-dossier.json";
const markdownPath = "qa-artifacts/phase3b-delivery-handoff-dossier.md";
const failures = [];

try {
  const preview = buildDeliveryHandoffExport({ generatedAt: "2026-06-21T00:00:00.000Z" });
  if (preview.status !== "handoff-ready-with-open-certification-gaps" ||
      preview.finalGoalComplete !== false ||
      preview.localEvidencePassed !== true ||
      preview.openCertificationGapCount !== 3 ||
      preview.guardrails?.offlineOnlyExport !== true ||
      preview.guardrails?.externalCalls !== false ||
      preview.guardrails?.managedDatabaseConnections !== false ||
      preview.guardrails?.deployments !== false ||
      preview.guardrails?.finalCompletionClaimed !== false) {
    failures.push("preview export did not preserve offline/open-gap guardrail state");
  }

  const report = writeDeliveryHandoffExport();
  if (!existsSync(jsonPath) || statSync(jsonPath).size < 1000) failures.push("JSON handoff export artifact is missing or too small");
  if (!existsSync(markdownPath) || statSync(markdownPath).size < 1000) failures.push("Markdown handoff export artifact is missing or too small");

  const persisted = JSON.parse(readFileSync(jsonPath, "utf8"));
  const markdown = readFileSync(markdownPath, "utf8");
  const gapIds = (persisted.openCertificationGaps || []).map((gap) => gap.id);
  if (persisted.phase !== "3B" ||
      persisted.status !== "handoff-ready-with-open-certification-gaps" ||
      persisted.finalGoalComplete !== false ||
      persisted.localEvidencePassed !== true ||
      persisted.openCertificationGapCount !== 3 ||
      persisted.artifactCount < 12 ||
      persisted.handoffSummary?.agenticProvedCheckCount < 37 ||
      persisted.handoffSummary?.t3PackageExecutionAllowed !== false ||
      persisted.guardrails?.certificationExecution !== false) {
    failures.push("persisted export artifact has incorrect summary fields");
  }
  for (const expected of ["container-runtime-certification", "managed-database-certification", "external-provider-certification"]) {
    if (!gapIds.includes(expected)) failures.push(`export missing open gap: ${expected}`);
  }
  for (const artifact of [jsonPath, markdownPath, "specs/phase3b-delivery-handoff-export-contract.md"]) {
    if (!persisted.artifactManifest.includes(artifact)) failures.push(`export artifact manifest missing ${artifact}`);
  }
  for (const heading of ["# Phase 3B Delivery Handoff Export", "## Open Certification Gaps", "## Materialized Artifacts", "## Guardrails", "Final goal complete: **no**"]) {
    if (!markdown.includes(heading)) failures.push(`markdown export missing heading or marker: ${heading}`);
  }

  const exposed = `${JSON.stringify(report)}\n${JSON.stringify(persisted)}\n${markdown}`;
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /\b(?:CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\b/.test(exposed)) {
    failures.push("handoff export exposed key-shaped or environment-secret material");
  }

  const exporterSource = readFileSync("scripts/export-delivery-handoff.mjs", "utf8");
  if (/\bfetch\s*\(|\bspawn\s*\(|https?:\/\//.test(exporterSource)) {
    failures.push("handoff export script contains network/server execution primitives");
  }
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Delivery handoff export QA passed: JSON/Markdown artifacts, open T3 gaps, finalGoalComplete=false, offline guardrails, and no secret exposure.");
