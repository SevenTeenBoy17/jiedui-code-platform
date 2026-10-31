import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { t3SingleLaneRunPackets } from "./t3-single-lane-run-packets.mjs";

const DEFAULT_OUTPUT_JSON = "qa-artifacts/phase3w-t3-run-packet-verifier.json";
const DEFAULT_OUTPUT_MARKDOWN = "qa-artifacts/phase3w-t3-run-packet-verifier.md";
const PACKET_ARTIFACT_PATH = "qa-artifacts/phase3v-t3-single-lane-run-packets.json";

export function t3RunPacketVerifier({
  generatedAt = new Date().toISOString(),
  runPacketBundle = loadRunPacketBundle(),
  packet = null
} = {}) {
  const submittedPackets = normalizeSubmittedPackets(packet);
  const supplied = submittedPackets.length > 0;
  const packetVerifications = (runPacketBundle.runPackets || []).map((runPacket) => validatePacket({
    runPacket,
    runPacketBundle,
    submittedPackets
  }));
  const verifiedPacketCount = packetVerifications.filter((item) => item.packetValid).length;
  const singlePacketOnly = submittedPackets.length <= 1 && !Array.isArray(packet);
  const status = supplied
    ? verifiedPacketCount === 1 && singlePacketOnly
      ? "t3-run-packet-verified-execution-blocked"
      : "t3-run-packet-rejected-execution-blocked"
    : "t3-run-packet-verifier-ready-execution-blocked";
  const verifierHash = sha256(JSON.stringify({
    status,
    runPacketBundleHash: runPacketBundle.runPacketBundleHash || "",
    submittedPacketCount: submittedPackets.length,
    verifiedPacketCount,
    lanes: packetVerifications.map((item) => ({
      laneId: item.laneId,
      packetSupplied: item.packetSupplied,
      packetValid: item.packetValid,
      rejectionReasons: item.rejectionReasons
    }))
  }));

  return {
    phase: "3W",
    generatedAt,
    status,
    finalGoalComplete: false,
    verifierOnly: true,
    verificationPassed: supplied && verifiedPacketCount === 1 && singlePacketOnly,
    approved: false,
    approvalRecorded: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    runPacketBundleStatus: runPacketBundle.status || "missing",
    runPacketsOnly: runPacketBundle.runPacketsOnly === true,
    runPacketBundleHash: runPacketBundle.runPacketBundleHash || "",
    verifierHash,
    packetVerificationCount: packetVerifications.length,
    readyPacketVerificationCount: packetVerifications.filter((item) => item.packetReady).length,
    submittedPacketCount: submittedPackets.length,
    verifiedPacketCount,
    packetSummary: {
      supplied,
      laneIds: submittedPackets.map((item) => item.laneId).filter(Boolean),
      validCount: verifiedPacketCount,
      rejectedCount: supplied ? Math.max(0, submittedPackets.length - verifiedPacketCount) : 0,
      singlePacketOnly
    },
    packetVerifications,
    openCertificationGaps: runPacketBundle.openCertificationGaps || [],
    guardrails: {
      contentReturned: false,
      artifactBodyContentReturned: false,
      evidenceBodyContentReturned: false,
      approvalTextReturned: false,
      secretValuesReturned: false,
      keyShapedTokensReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      approvalRecorded: false,
      certificationExecution: false,
      certificationStateChanged: false,
      finalCompletionClaimed: false
    },
    nextStep: "Use this verifier before any approved T3 phase to bind exactly one current run packet; verification still executes nothing and changes no certification state."
  };
}

export function writeT3RunPacketVerifier(options = {}) {
  const outputJsonPath = options.outputJsonPath || DEFAULT_OUTPUT_JSON;
  const outputMarkdownPath = options.outputMarkdownPath || DEFAULT_OUTPUT_MARKDOWN;
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  mkdirSync(dirname(outputMarkdownPath), { recursive: true });
  const report = t3RunPacketVerifier(options);
  writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, renderT3RunPacketVerifierMarkdown(report), "utf8");
  return report;
}

export function renderT3RunPacketVerifierMarkdown(report) {
  const rows = report.packetVerifications
    .map((packet) => `| ${packet.laneId} | ${packet.packetReady ? "yes" : "no"} | ${packet.packetSupplied ? "yes" : "no"} | ${packet.packetValid ? "yes" : "no"} | ${packet.rejectionReasons.join(", ") || "none"} |`)
    .join("\n");

  return `# Phase 3W T3 Run Packet Verifier

Generated: ${report.generatedAt}

Status: **${report.status}**

Final goal complete: **${report.finalGoalComplete ? "yes" : "no"}**

Verifier only: **${report.verifierOnly ? "yes" : "no"}**

Execution allowed: **${report.executionAllowed ? "yes" : "no"}**

Verifier hash:

\`\`\`text
${report.verifierHash}
\`\`\`

| Lane | Packet ready | Packet supplied | Packet valid | Rejection reasons |
|---|---|---|---|---|
${rows}

## Packet Summary

- supplied: ${report.packetSummary.supplied}
- submittedPacketCount: ${report.submittedPacketCount}
- verifiedPacketCount: ${report.verifiedPacketCount}
- rejectedCount: ${report.packetSummary.rejectedCount}
- singlePacketOnly: ${report.packetSummary.singlePacketOnly}

## Guardrails

${Object.entries(report.guardrails).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Notes

- This verifier checks run-packet metadata only.
- It does not include evidence body content, artifact body content, approval text, provider responses, database connection strings, or secrets.
- It never records approval, executes certification, calls external providers, connects managed databases, deploys, bills, or claims final completion.
`;
}

function validatePacket({ runPacket, runPacketBundle, submittedPackets }) {
  const submitted = submittedPackets.find((item) => item.laneId === runPacket.laneId || item.packetId === runPacket.packetId) || null;
  const normalized = normalizePacket(submitted);
  const packetSupplied = Boolean(submitted);
  const packetHashMatches = packetSupplied && normalized.packetHash === runPacket.packetHash && isSha256(normalized.packetHash);
  const bundleHashMatches = packetSupplied && normalized.runPacketBundleHash === runPacketBundle.runPacketBundleHash && isSha256(normalized.runPacketBundleHash);
  const sourceHashesMatch = packetSupplied && sameObject(normalized.sourceHashes, runPacket.sourceHashes);
  const evidenceIdsMatch = packetSupplied && sameList(normalized.evidenceIds, runPacket.evidenceIds);
  const rollbackIdsMatch = packetSupplied && sameList(normalized.rollbackIds, runPacket.rollbackIds);
  const packetIdentityMatches = packetSupplied &&
    normalized.packetId === runPacket.packetId &&
    normalized.laneId === runPacket.laneId &&
    normalized.targetGap === runPacket.targetGap;
  const stateFlagsSafe = normalized.approvalRecorded === false &&
    normalized.approved === false &&
    normalized.executionAllowed === false &&
    normalized.externalActionsExecuted === false &&
    normalized.certificationStateChanged === false &&
    normalized.finalGoalComplete === false &&
    normalized.contentReturned === false;
  const singleLaneOnly = normalized.singleLaneOnly === true && submittedPackets.length === 1;
  const secretExposure = packetSupplied && hasSecretExposure(JSON.stringify(submitted));
  const prohibitedContentField = packetSupplied && hasProhibitedContentField(submitted);
  const packetValid = Boolean(
    packetSupplied &&
    runPacket.packetReady === true &&
    packetIdentityMatches &&
    packetHashMatches &&
    bundleHashMatches &&
    sourceHashesMatch &&
    evidenceIdsMatch &&
    rollbackIdsMatch &&
    singleLaneOnly &&
    stateFlagsSafe &&
    !secretExposure &&
    !prohibitedContentField
  );

  const rejectionReasons = [];
  if (packetSupplied && !packetIdentityMatches) rejectionReasons.push("packet-identity-mismatch");
  if (packetSupplied && !packetHashMatches) rejectionReasons.push("packet-hash-mismatch");
  if (packetSupplied && !bundleHashMatches) rejectionReasons.push("bundle-hash-mismatch");
  if (packetSupplied && !sourceHashesMatch) rejectionReasons.push("source-hash-mismatch");
  if (packetSupplied && !evidenceIdsMatch) rejectionReasons.push("evidence-ids-mismatch");
  if (packetSupplied && !rollbackIdsMatch) rejectionReasons.push("rollback-ids-mismatch");
  if (packetSupplied && !singleLaneOnly) rejectionReasons.push("not-single-packet");
  if (packetSupplied && !stateFlagsSafe) rejectionReasons.push("state-change-claim-not-allowed");
  if (packetSupplied && secretExposure) rejectionReasons.push("secret-like-packet-content");
  if (packetSupplied && prohibitedContentField) rejectionReasons.push("body-content-field-not-allowed");

  return {
    packetId: runPacket.packetId,
    laneId: runPacket.laneId,
    targetGap: runPacket.targetGap,
    riskTier: "T3",
    packetReady: runPacket.packetReady === true,
    packetSupplied,
    packetValid,
    packetIdentityMatches,
    packetHashMatches,
    bundleHashMatches,
    sourceHashesMatch,
    evidenceIdsMatch,
    rollbackIdsMatch,
    singleLaneOnly,
    stateFlagsSafe,
    secretExposure,
    prohibitedContentField,
    evidenceIdCount: (runPacket.evidenceIds || []).length,
    rollbackIdCount: (runPacket.rollbackIds || []).length,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    contentReturned: false,
    finalGoalComplete: false,
    rejectionReasons: [...new Set(rejectionReasons)]
  };
}

function normalizeSubmittedPackets(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => item && typeof item === "object");
}

function normalizePacket(value) {
  if (!value || typeof value !== "object") {
    return {
      packetId: "",
      laneId: "",
      targetGap: "",
      runPacketBundleHash: "",
      packetHash: "",
      sourceHashes: {},
      evidenceIds: [],
      rollbackIds: [],
      singleLaneOnly: false,
      approvalRecorded: false,
      approved: false,
      executionAllowed: false,
      externalActionsExecuted: false,
      certificationStateChanged: false,
      finalGoalComplete: false,
      contentReturned: false
    };
  }
  return {
    packetId: typeof value.packetId === "string" ? value.packetId : "",
    laneId: typeof value.laneId === "string" ? value.laneId : "",
    targetGap: typeof value.targetGap === "string" ? value.targetGap : "",
    runPacketBundleHash: typeof value.runPacketBundleHash === "string" ? value.runPacketBundleHash : "",
    packetHash: typeof value.packetHash === "string" ? value.packetHash : "",
    sourceHashes: value.sourceHashes && typeof value.sourceHashes === "object" && !Array.isArray(value.sourceHashes) ? value.sourceHashes : {},
    evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.filter((item) => typeof item === "string") : [],
    rollbackIds: Array.isArray(value.rollbackIds) ? value.rollbackIds.filter((item) => typeof item === "string") : [],
    singleLaneOnly: value.singleLaneOnly === true,
    approvalRecorded: value.approvalRecorded === true,
    approved: value.approved === true,
    executionAllowed: value.executionAllowed === true,
    externalActionsExecuted: value.externalActionsExecuted === true,
    certificationStateChanged: value.certificationStateChanged === true,
    finalGoalComplete: value.finalGoalComplete === true,
    contentReturned: value.contentReturned === true
  };
}

function loadRunPacketBundle() {
  if (existsSync(PACKET_ARTIFACT_PATH)) {
    try {
      return JSON.parse(readFileSync(PACKET_ARTIFACT_PATH, "utf8"));
    } catch {
      return t3SingleLaneRunPackets();
    }
  }
  return t3SingleLaneRunPackets();
}

function sameList(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function sameObject(a, b) {
  return JSON.stringify(sortObject(a || {})) === JSON.stringify(sortObject(b || {}));
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function hasSecretExposure(text) {
  return /\bsk-[A-Za-z0-9_-]{20,}\b|CODEX_MODEL_API_KEY\s*=|OPENAI_API_KEY\s*=|DATABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text);
}

function hasProhibitedContentField(value) {
  const prohibited = new Set([
    "body",
    "artifactBody",
    "artifactBodyContent",
    "evidenceBody",
    "evidenceBodyContent",
    "approvalText",
    "secret",
    "apiKey",
    "databaseUrl",
    "screenshotBytes"
  ]);
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(current)) {
      if (prohibited.has(key)) return true;
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return false;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = writeT3RunPacketVerifier();
  console.log(`T3 run packet verifier written: ${DEFAULT_OUTPUT_JSON}, ${DEFAULT_OUTPUT_MARKDOWN}`);
  console.log(`Status: ${report.status}; packets=${report.packetVerificationCount}; finalGoalComplete=${report.finalGoalComplete}`);
}
