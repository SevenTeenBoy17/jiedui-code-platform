import { spawn } from "node:child_process";

const failures = [];
const port = Number(process.env.PORT || 3167);
const base = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverEnv() {
  const env = { ...process.env, PORT: String(port) };
  delete env.CODEX_MODEL_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.DATABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  return env;
}

async function startServer() {
  const child = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv()
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk.toString(); });
  child.stderr.on("data", (chunk) => { log += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      if (health.status === "ready") return { child, log: () => log };
    } catch {
      await wait(150);
    }
  }
  throw new Error(`delivery artifact index server did not become ready: ${log}`);
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

let server;
try {
  server = await startServer();
  await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });

  const index = await request("/api/delivery/artifacts");
  if (index.status !== "artifact-index-ready-with-open-certification-gaps" ||
      index.finalGoalComplete !== false ||
      index.localEvidencePassed !== true ||
      index.openCertificationGapCount !== 3 ||
      index.artifactCount < 17 ||
      index.readyArtifactCount !== index.artifactCount ||
      index.missingArtifactCount !== 0 ||
      index.hashCount !== index.artifactCount ||
      index.contentReturned !== false ||
      index.guardrails?.contentReturned !== false ||
      index.guardrails?.certificationExecution !== false) {
    failures.push("delivery artifact index did not expose complete metadata-only open-gap state");
  }

  for (const expected of [
    "qa-artifacts/phase3b-delivery-handoff-dossier.json",
    "qa-artifacts/phase3b-delivery-handoff-dossier.md",
    "specs/phase3c-delivery-artifact-index-contract.md",
    "specs/phase3r-agentic-qa-replay-dossier-contract.md",
    "scripts/agentic-qa-replay-dossier.mjs",
    "tests/agentic-qa-replay-dossier.mjs",
    "qa-artifacts/phase3r-agentic-qa-replay-dossier.json",
    "qa-artifacts/phase3r-agentic-qa-replay-dossier.md",
    "specs/phase3s-visual-qa-storyboard-contract.md",
    "scripts/visual-qa-storyboard.mjs",
    "tests/visual-qa-storyboard.mjs",
    "qa-artifacts/phase3s-visual-qa-storyboard.json",
    "qa-artifacts/phase3s-visual-qa-storyboard.md",
    "specs/phase3t-delivery-release-candidate-contract.md",
    "scripts/delivery-release-candidate.mjs",
    "tests/delivery-release-candidate.mjs",
    "qa-artifacts/phase3t-delivery-release-candidate.json",
    "qa-artifacts/phase3t-delivery-release-candidate.md",
    "specs/phase3u-t3-certification-next-actions-contract.md",
    "scripts/t3-certification-next-actions.mjs",
    "tests/t3-certification-next-actions.mjs",
    "qa-artifacts/phase3u-t3-certification-next-actions.json",
    "qa-artifacts/phase3u-t3-certification-next-actions.md",
    "specs/phase3v-t3-single-lane-run-packets-contract.md",
    "scripts/t3-single-lane-run-packets.mjs",
    "tests/t3-single-lane-run-packets.mjs",
    "qa-artifacts/phase3v-t3-single-lane-run-packets.json",
    "qa-artifacts/phase3v-t3-single-lane-run-packets.md",
    "specs/phase3w-t3-run-packet-verifier-contract.md",
    "scripts/t3-run-packet-verifier.mjs",
    "tests/t3-run-packet-verifier.mjs",
    "qa-artifacts/phase3w-t3-run-packet-verifier.json",
    "qa-artifacts/phase3w-t3-run-packet-verifier.md",
    "specs/phase3x-delivery-reviewer-cockpit-contract.md",
    "scripts/delivery-reviewer-cockpit.mjs",
    "tests/delivery-reviewer-cockpit.mjs",
    "qa-artifacts/phase3x-delivery-reviewer-cockpit.json",
    "qa-artifacts/phase3x-delivery-reviewer-cockpit.md",
    "specs/phase3y-delivery-launch-guide-contract.md",
    "scripts/delivery-launch-guide.mjs",
    "tests/delivery-launch-guide.mjs",
    "qa-artifacts/phase3y-delivery-launch-guide.json",
    "qa-artifacts/phase3y-delivery-launch-guide.md",
    "specs/phase3z-delivery-consistency-sentinel-contract.md",
    "scripts/delivery-consistency-sentinel.mjs",
    "tests/delivery-consistency-sentinel.mjs",
    "qa-artifacts/phase3z-delivery-consistency-sentinel.json",
    "qa-artifacts/phase3z-delivery-consistency-sentinel.md",
    "specs/phase4a-final-acceptance-matrix-contract.md",
    "scripts/final-acceptance-matrix.mjs",
    "tests/final-acceptance-matrix.mjs",
    "qa-artifacts/phase4a-final-acceptance-matrix.json",
    "qa-artifacts/phase4a-final-acceptance-matrix.md",
    "specs/phase4b-certification-blocker-board-contract.md",
    "scripts/certification-blocker-board.mjs",
    "tests/certification-blocker-board.mjs",
    "qa-artifacts/phase4b-certification-blocker-board.json",
    "qa-artifacts/phase4b-certification-blocker-board.md",
    "specs/phase4c-user-acceptance-rehearsal-contract.md",
    "scripts/user-acceptance-rehearsal.mjs",
    "tests/user-acceptance-rehearsal.mjs",
    "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
    "qa-artifacts/phase4c-user-acceptance-rehearsal.md",
    "specs/phase4d-delivery-evidence-navigator-contract.md",
    "scripts/delivery-evidence-navigator.mjs",
    "tests/delivery-evidence-navigator.mjs",
    "qa-artifacts/phase4d-delivery-evidence-navigator.json",
    "qa-artifacts/phase4d-delivery-evidence-navigator.md",
    "specs/phase4e-local-delivery-summary-packet-contract.md",
    "scripts/local-delivery-summary-packet.mjs",
    "tests/local-delivery-summary-packet.mjs",
    "qa-artifacts/phase4e-local-delivery-summary-packet.json",
    "qa-artifacts/phase4e-local-delivery-summary-packet.md",
    "specs/phase4f-local-delivery-handoff-brief-contract.md",
    "scripts/local-delivery-handoff-brief.mjs",
    "tests/local-delivery-handoff-brief.mjs",
    "qa-artifacts/phase4f-local-delivery-handoff-brief.json",
    "qa-artifacts/phase4f-local-delivery-handoff-brief.md",
    "specs/phase4g-local-delivery-quickstart-bundle-contract.md",
    "scripts/local-delivery-quickstart-bundle.mjs",
    "tests/local-delivery-quickstart-bundle.mjs",
    "qa-artifacts/phase4g-local-delivery-quickstart-bundle.json",
    "qa-artifacts/phase4g-local-delivery-quickstart-bundle.md",
    "specs/phase4h-local-delivery-verification-suite-contract.md",
    "scripts/local-delivery-verification-suite.mjs",
    "tests/local-delivery-verification-suite.mjs",
    "qa-artifacts/phase4h-local-delivery-verification-suite.json",
    "qa-artifacts/phase4h-local-delivery-verification-suite.md",
    "specs/phase4i-final-local-handoff-checkpoint-contract.md",
    "scripts/final-local-handoff-checkpoint.mjs",
    "tests/final-local-handoff-checkpoint.mjs",
    "qa-artifacts/phase4i-final-local-handoff-checkpoint.json",
    "qa-artifacts/phase4i-final-local-handoff-checkpoint.md",
    "specs/phase3h-t3-approval-integrity-contract.md",
    "scripts/delivery-artifact-index.mjs",
    "scripts/t3-approval-integrity.mjs",
    "tests/t3-approval-integrity.mjs",
    "qa-artifacts/phase3h-t3-approval-integrity.json",
    "qa-artifacts/phase3h-t3-approval-integrity.md",
    "specs/phase3i-t3-approval-lock-contract.md",
    "scripts/t3-approval-lock.mjs",
    "tests/t3-approval-lock.mjs",
    "qa-artifacts/phase3i-t3-approval-lock.json",
    "qa-artifacts/phase3i-t3-approval-lock.md",
    "specs/phase3j-t3-approval-verifier-contract.md",
    "scripts/t3-approval-verifier.mjs",
    "tests/t3-approval-verifier.mjs",
    "qa-artifacts/phase3j-t3-approval-verifier.json",
    "qa-artifacts/phase3j-t3-approval-verifier.md",
    "specs/phase3k-t3-approval-candidates-contract.md",
    "scripts/t3-approval-candidates.mjs",
    "tests/t3-approval-candidates.mjs",
    "qa-artifacts/phase3k-t3-approval-candidates.json",
    "qa-artifacts/phase3k-t3-approval-candidates.md",
    "specs/phase3l-t3-approval-execution-gate-contract.md",
    "scripts/t3-approval-execution-gate.mjs",
    "tests/t3-approval-execution-gate.mjs",
    "qa-artifacts/phase3l-t3-approval-execution-gate.json",
    "qa-artifacts/phase3l-t3-approval-execution-gate.md",
    "specs/phase3m-t3-certification-evidence-closure-contract.md",
    "scripts/t3-certification-evidence-closure.mjs",
    "tests/t3-certification-evidence-closure.mjs",
    "qa-artifacts/phase3m-t3-certification-evidence-closure.json",
    "qa-artifacts/phase3m-t3-certification-evidence-closure.md",
    "specs/phase3n-final-delivery-readiness-contract.md",
    "scripts/final-delivery-readiness.mjs",
    "tests/final-delivery-readiness.mjs",
    "qa-artifacts/phase3n-final-delivery-readiness.json",
    "qa-artifacts/phase3n-final-delivery-readiness.md",
    "specs/phase3o-t3-evidence-bundle-templates-contract.md",
    "scripts/t3-evidence-bundle-templates.mjs",
    "tests/t3-evidence-bundle-templates.mjs",
    "qa-artifacts/phase3o-t3-evidence-bundle-templates.json",
    "qa-artifacts/phase3o-t3-evidence-bundle-templates.md",
    "specs/phase3p-t3-operator-checklist-contract.md",
    "scripts/t3-operator-checklist.mjs",
    "tests/t3-operator-checklist.mjs",
    "qa-artifacts/phase3p-t3-operator-checklist.json",
    "qa-artifacts/phase3p-t3-operator-checklist.md",
    "specs/phase3q-t3-operator-transcript-validator-contract.md",
    "scripts/t3-operator-transcript-validator.mjs",
    "tests/t3-operator-transcript-validator.mjs",
    "qa-artifacts/phase3q-t3-operator-transcript-validator.json",
    "qa-artifacts/phase3q-t3-operator-transcript-validator.md",
    "tests/delivery-artifact-index.mjs"
  ]) {
    if (!index.requiredArtifacts?.includes(expected)) failures.push(`artifact index missing required artifact: ${expected}`);
  }
  if (!index.artifactInventory?.every((item) => item.exists && item.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(item.sha256 || ""))) {
    failures.push("artifact index inventory missing size/hash metadata");
  }
  if (index.artifactInventory?.some((item) => Object.hasOwn(item, "content") || Object.hasOwn(item, "body"))) {
    failures.push("artifact index returned artifact content fields");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (report.deliveryArtifactIndexStatus !== "artifact-index-ready-with-open-certification-gaps" ||
      report.deliveryArtifactIndexArtifactCount < 17 ||
      report.deliveryArtifactIndexReadyArtifactCount !== report.deliveryArtifactIndexArtifactCount ||
      report.deliveryArtifactIndexMissingArtifactCount !== 0 ||
      report.deliveryArtifactIndexHashCount !== report.deliveryArtifactIndexArtifactCount ||
      report.deliveryArtifactIndexContentReturned !== false ||
      report.deliveryArtifactIndexFinalGoalComplete !== false) {
    failures.push("report export missing delivery artifact index summary fields");
  }

  const exposed = JSON.stringify({ index, report });
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(exposed) ||
      /CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(exposed)) {
    failures.push("delivery artifact index exposed key-shaped or environment-secret material");
  }
} catch (error) {
  failures.push(error.message);
} finally {
  if (server?.child) server.child.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Delivery artifact index QA passed: metadata-only inventory, SHA-256 hashes, report fields, open T3 gaps, finalGoalComplete=false, and no secret exposure.");
