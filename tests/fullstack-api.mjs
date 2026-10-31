import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const port = Number(process.env.PORT || 3100);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["scripts/fullstack-server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), CODEX_SANDBOX_TEST_SECRET: "phase2q-secret-value" }
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function connectWebSocket(path) {
  const url = `${base.replace("http://", "ws://")}${path}`;
  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    const waiter = waiters.shift();
    if (waiter) waiter(payload);
    else queue.push(payload);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error(`WebSocket failed: ${url}`)), { once: true });
  });
  return {
    send(payload) {
      socket.send(JSON.stringify(payload));
    },
    next(timeoutMs = 3000) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`WebSocket message timeout: ${url}`)), timeoutMs);
        waiters.push((payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });
    },
    close() {
      socket.close();
    }
  };
}

const failures = [];

function hasV2SandboxIsolation(runner) {
  return runner?.engine === "sandbox-runner-v2" &&
    runner?.isolation === "process-scrubbed-temp-workspace-no-exec" &&
    runner?.envPolicy === "allowlist-scrubbed" &&
    runner?.secretEnvPresent === false &&
    runner?.workspace?.kind === "ephemeral-temp" &&
    runner?.workspace?.cleaned === true &&
    runner?.workspace?.pathExposed === false &&
    runner?.outputLimitBytes === 65536 &&
    !(runner?.envKeysAllowed || []).some((key) => /SECRET|TOKEN|KEY|API/i.test(key));
}

try {
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {
      await wait(250);
    }
  }
  if (!ready) throw new Error(`server not ready: ${serverLog}`);

  const forbiddenReset = await requestFailure("/api/dev/reset", { method: "POST", body: "{}" });
  if (forbiddenReset.status !== 403) failures.push("dev reset without header did not return 403");

  const reset = await request("/api/dev/reset", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (reset.dbMeta?.schemaVersion !== 4 || reset.project?.latestVersionId !== "v1" || !reset.room?.events?.length || reset.userCount < 3) {
    failures.push("dev reset did not restore seed database");
  }

  const bootstrap = await request("/api/bootstrap");
  if (!bootstrap.project || !bootstrap.versions?.length) failures.push("bootstrap missing project/versions");
  if (!bootstrap.assignment?.id || !Array.isArray(bootstrap.submissions)) {
    failures.push("bootstrap missing assignment/submission queue");
  }
  if (!bootstrap.collabRoom?.id || !bootstrap.dbMeta?.schemaVersion) {
    failures.push("bootstrap missing collab room or db metadata");
  }
  if (bootstrap.auth?.users?.length < 3 || bootstrap.auth?.authEventCount < 1) {
    failures.push("bootstrap missing auth persistence summary");
  }

  const initialDbStatus = await request("/api/db/status");
  if (initialDbStatus.engine !== "json-repository-v1" || initialDbStatus.atomicWrites !== true || initialDbStatus.schemaVersion !== 4) {
    failures.push("db status missing repository engine, atomic write flag, or schema version");
  }
  if (!initialDbStatus.backup?.exists || initialDbStatus.backup?.sizeBytes < 100) {
    failures.push("db status missing latest JSON backup evidence");
  }
  if (initialDbStatus.counts?.users < 3 || initialDbStatus.security?.rawSessionTokenStored !== false) {
    failures.push("db status missing user counts or raw token safety evidence");
  }

  const initialDbCertification = await request("/api/db/certification");
  if (initialDbCertification.certified !== false ||
      initialDbCertification.status !== "readiness-only" ||
      !initialDbCertification.missingCertificationControls?.includes("managed-postgres-or-supabase-provisioned") ||
      !initialDbCertification.missingCertificationControls?.includes("secret-manager-backed-database-url")) {
    failures.push("database certification endpoint did not expose readiness-only non-certified status");
  }

  const initialDeliveryOverview = await request("/api/delivery/certification-overview");
  const initialGapIds = (initialDeliveryOverview.openCertificationGaps || []).map((gap) => gap.id);
  const initialSurfaceIds = (initialDeliveryOverview.readinessSurfaces || []).map((surface) => surface.id);
  if (initialDeliveryOverview.finalGoalComplete !== false ||
      !initialGapIds.includes("container-runtime-certification") ||
      !initialGapIds.includes("managed-database-certification") ||
      !initialGapIds.includes("external-provider-certification") ||
      !initialSurfaceIds.includes("sandbox-runtime") ||
      !initialSurfaceIds.includes("model-provider") ||
      !initialSurfaceIds.includes("database") ||
      initialDeliveryOverview.guardrails?.t3ApprovalRequired !== true) {
    failures.push("delivery certification overview did not expose open T3 gaps and readiness surfaces");
  }

  const initialT3Preflight = await request("/api/delivery/t3-preflight");
  if (initialT3Preflight.status !== "preflight-only" ||
      initialT3Preflight.approvedPhaseReady !== false ||
      initialT3Preflight.safeToRunAutomatically !== false ||
      initialT3Preflight.t3ApprovalRequired !== true ||
      (initialT3Preflight.lanes || []).length !== 3 ||
      initialT3Preflight.evidencePolicy?.secretValuesReturned !== false) {
    failures.push("T3 certification preflight did not expose safe local-only guardrail state");
  }

  const initialT3Package = await request("/api/delivery/t3-certification-package");
  if (initialT3Package.status !== "package-only" ||
      initialT3Package.executionAllowed !== false ||
      initialT3Package.finalGoalComplete !== false ||
      initialT3Package.t3ApprovalRequired !== true ||
      (initialT3Package.lanePackages || []).length !== 3 ||
      initialT3Package.guardrails?.executesCertification !== false) {
    failures.push("T3 certification package did not expose safe package-only guardrail state");
  }

  const initialT3Evidence = await request("/api/delivery/t3-evidence");
  if (initialT3Evidence.status !== "candidate-only" ||
      initialT3Evidence.finalGoalComplete !== false ||
      initialT3Evidence.certificationStateChanged !== false ||
      initialT3Evidence.candidateCount !== 0 ||
      initialT3Evidence.guardrails?.marksCertified !== false) {
    failures.push("T3 evidence summary did not expose safe candidate-only state");
  }

  const forbiddenT3Evidence = await requestFailure("/api/delivery/t3-evidence/intake", {
    method: "POST",
    body: JSON.stringify({ lane: "runtime" })
  });
  if (forbiddenT3Evidence.status !== 403) failures.push("T3 evidence intake without guard did not return 403");

  const t3EvidenceCandidate = await request("/api/delivery/t3-evidence/intake", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: JSON.stringify({
      lane: "runtime",
      approvalRef: "api-qa-local-approval",
      operator: "fullstack-api-qa",
      rollbackResult: "passed",
      reviewGate: "pending",
      evidenceItems: [
        { type: "operator-approval-record", summary: "Local approval record captured.", artifactRef: "qa-artifacts/api-approval.txt" },
        { type: "rollback-drill-result", summary: "Rollback drill is documented for local runtime lane.", artifactRef: "qa-artifacts/api-rollback.txt" },
        { type: "secret-redaction-proof", summary: "No secrets are included in candidate output.", artifactRef: "qa-artifacts/api-redaction.txt" }
      ]
    })
  });
  if (t3EvidenceCandidate.status !== "accepted-candidate" ||
      t3EvidenceCandidate.stored !== true ||
      t3EvidenceCandidate.certificationStateChanged !== false ||
      t3EvidenceCandidate.summary?.candidateCount !== 1 ||
      t3EvidenceCandidate.summary?.laneCounts?.runtime !== 1) {
    failures.push("T3 evidence intake did not store a clean runtime candidate safely");
  }

  const initialHandoffDossier = await request("/api/delivery/handoff-dossier");
  if (initialHandoffDossier.status !== "handoff-ready-with-open-certification-gaps" ||
      initialHandoffDossier.finalGoalComplete !== false ||
      initialHandoffDossier.openCertificationGapCount !== 3 ||
      initialHandoffDossier.localRequirementCount < 15 ||
      initialHandoffDossier.agenticQa?.provedCheckCount < 36 ||
      initialHandoffDossier.t3Evidence?.candidateCount !== 1 ||
      initialHandoffDossier.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery handoff dossier did not expose local evidence and open T3 gaps");
  }

  const initialArtifactIndex = await request("/api/delivery/artifacts");
  if (initialArtifactIndex.status !== "artifact-index-ready-with-open-certification-gaps" ||
      initialArtifactIndex.finalGoalComplete !== false ||
      initialArtifactIndex.openCertificationGapCount !== 3 ||
      initialArtifactIndex.artifactCount < 17 ||
      initialArtifactIndex.readyArtifactCount !== initialArtifactIndex.artifactCount ||
      initialArtifactIndex.missingArtifactCount !== 0 ||
      initialArtifactIndex.hashCount !== initialArtifactIndex.artifactCount ||
      initialArtifactIndex.contentReturned !== false ||
      !initialArtifactIndex.requiredArtifacts?.includes("qa-artifacts/phase3b-delivery-handoff-dossier.json") ||
      !initialArtifactIndex.requiredArtifacts?.includes("specs/phase3c-delivery-artifact-index-contract.md") ||
      initialArtifactIndex.guardrails?.certificationExecution !== false) {
    failures.push("delivery artifact index did not expose metadata-only integrity manifest state");
  }

  const initialAgenticReplay = await request("/api/delivery/agentic-qa-replay");
  if (initialAgenticReplay.status !== "agentic-qa-replay-ready-open-t3" ||
      initialAgenticReplay.finalGoalComplete !== false ||
      initialAgenticReplay.replayOnly !== true ||
      initialAgenticReplay.contentReturned !== false ||
      initialAgenticReplay.artifactContentReturned !== false ||
      initialAgenticReplay.screenshotBytesReturned !== false ||
      initialAgenticReplay.agentCount < 4 ||
      initialAgenticReplay.clickRoundCount < 3 ||
      initialAgenticReplay.provedCheckCount < 53 ||
      initialAgenticReplay.openProductGapCount !== 3 ||
      initialAgenticReplay.finalValueWaitsPassed !== true ||
      initialAgenticReplay.screenshotHashCount < 5 ||
      !/^[a-f0-9]{64}$/.test(initialAgenticReplay.replayHash || "") ||
      initialAgenticReplay.guardrails?.externalCalls !== false ||
      initialAgenticReplay.guardrails?.finalCompletionClaimed !== false) {
    failures.push("agentic QA replay dossier did not expose replay-only internal QA evidence");
  }

  const initialVisualStoryboard = await request("/api/delivery/visual-storyboard");
  if (initialVisualStoryboard.status !== "visual-storyboard-ready-open-t3" ||
      initialVisualStoryboard.finalGoalComplete !== false ||
      initialVisualStoryboard.storyboardOnly !== true ||
      initialVisualStoryboard.localVisualEvidence !== true ||
      initialVisualStoryboard.screenshotBytesEmbedded !== false ||
      initialVisualStoryboard.artifactBodyContentReturned !== false ||
      initialVisualStoryboard.surfaceCount < 5 ||
      initialVisualStoryboard.readySurfaceCount !== initialVisualStoryboard.surfaceCount ||
      initialVisualStoryboard.screenshotHashCount < 5 ||
      initialVisualStoryboard.replayRoundCount < 3 ||
      initialVisualStoryboard.visualChecksPassed !== true ||
      !/^[a-f0-9]{64}$/.test(initialVisualStoryboard.storyboardHash || "") ||
      initialVisualStoryboard.guardrails?.externalCalls !== false ||
      initialVisualStoryboard.guardrails?.finalCompletionClaimed !== false) {
    failures.push("visual QA storyboard did not expose local screenshot review evidence safely");
  }
  const storyboardImage = await fetch(`${base}${initialVisualStoryboard.frames?.[0]?.imageSrc || ""}`);
  if (!storyboardImage.ok || !String(storyboardImage.headers.get("content-type") || "").includes("image/png")) {
    failures.push("visual QA storyboard screenshot path did not serve a PNG image");
  }

  const initialReleaseCandidate = await request("/api/delivery/release-candidate");
  if (initialReleaseCandidate.status !== "release-candidate-local-evidence-ready-open-t3" ||
      initialReleaseCandidate.finalGoalComplete !== false ||
      initialReleaseCandidate.releaseCandidateOnly !== true ||
      initialReleaseCandidate.readyForHumanReview !== true ||
      initialReleaseCandidate.readyForProductionRelease !== false ||
      initialReleaseCandidate.localEvidenceReady !== true ||
      initialReleaseCandidate.blockedByT3 !== true ||
      initialReleaseCandidate.openT3GapCount !== 3 ||
      initialReleaseCandidate.releaseCheckCount < 6 ||
      initialReleaseCandidate.readyReleaseCheckCount < 5 ||
      initialReleaseCandidate.blockedReleaseCheckCount !== 1 ||
      !/^[a-f0-9]{64}$/.test(initialReleaseCandidate.releaseCandidateHash || "") ||
      initialReleaseCandidate.guardrails?.externalCalls !== false ||
      initialReleaseCandidate.guardrails?.certificationExecution !== false ||
      initialReleaseCandidate.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery release candidate did not expose review-ready local evidence with T3 block");
  }

  const initialNextActions = await request("/api/delivery/t3-certification-next-actions");
  if (initialNextActions.status !== "t3-certification-next-actions-ready-execution-blocked" ||
      initialNextActions.finalGoalComplete !== false ||
      initialNextActions.nextActionsOnly !== true ||
      initialNextActions.readyForHumanReview !== true ||
      initialNextActions.readyForProductionRelease !== false ||
      initialNextActions.approvalRequired !== true ||
      initialNextActions.executionAllowed !== false ||
      initialNextActions.certificationStateChanged !== false ||
      initialNextActions.openT3GapCount !== 3 ||
      initialNextActions.laneActionCount !== 3 ||
      initialNextActions.readyLaneActionCount !== 3 ||
      initialNextActions.evidenceRequirementCount < 15 ||
      initialNextActions.rollbackRequirementCount < 9 ||
      !/^[a-f0-9]{64}$/.test(initialNextActions.nextActionsHash || "") ||
      initialNextActions.guardrails?.externalCalls !== false ||
      initialNextActions.guardrails?.certificationExecution !== false ||
      initialNextActions.guardrails?.finalCompletionClaimed !== false) {
    failures.push("T3 certification next actions did not expose ready metadata with execution blocked");
  }

  const initialRunPackets = await request("/api/delivery/t3-single-lane-run-packets");
  if (initialRunPackets.status !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      initialRunPackets.finalGoalComplete !== false ||
      initialRunPackets.runPacketsOnly !== true ||
      initialRunPackets.readyForHumanReview !== true ||
      initialRunPackets.readyForProductionRelease !== false ||
      initialRunPackets.approvalRequired !== true ||
      initialRunPackets.singleLaneOnly !== true ||
      initialRunPackets.executionAllowed !== false ||
      initialRunPackets.certificationStateChanged !== false ||
      initialRunPackets.openT3GapCount !== 3 ||
      initialRunPackets.packetCount !== 3 ||
      initialRunPackets.readyPacketCount !== 3 ||
      initialRunPackets.evidenceRequirementCount < 15 ||
      initialRunPackets.rollbackRequirementCount < 9 ||
      !/^[a-f0-9]{64}$/.test(initialRunPackets.runPacketBundleHash || "") ||
      initialRunPackets.guardrails?.externalCalls !== false ||
      initialRunPackets.guardrails?.certificationExecution !== false ||
      initialRunPackets.guardrails?.finalCompletionClaimed !== false) {
    failures.push("T3 single-lane run packets did not expose ready metadata with execution blocked");
  }

  const runPacketVerifier = await request("/api/delivery/t3-run-packet-verifier");
  if (runPacketVerifier.status !== "t3-run-packet-verifier-ready-execution-blocked" ||
      runPacketVerifier.finalGoalComplete !== false ||
      runPacketVerifier.verifierOnly !== true ||
      runPacketVerifier.verificationPassed !== false ||
      runPacketVerifier.executionAllowed !== false ||
      runPacketVerifier.certificationStateChanged !== false ||
      runPacketVerifier.runPacketBundleStatus !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      runPacketVerifier.runPacketsOnly !== true ||
      runPacketVerifier.packetVerificationCount !== 3 ||
      runPacketVerifier.readyPacketVerificationCount !== 3 ||
      runPacketVerifier.submittedPacketCount !== 0 ||
      runPacketVerifier.verifiedPacketCount !== 0 ||
      !/^[a-f0-9]{64}$/.test(runPacketVerifier.verifierHash || "") ||
      runPacketVerifier.guardrails?.externalCalls !== false ||
      runPacketVerifier.guardrails?.certificationExecution !== false ||
      runPacketVerifier.guardrails?.finalCompletionClaimed !== false) {
    failures.push("T3 run-packet verifier did not expose ready metadata with execution blocked");
  }

  const candidatePacket = buildRunPacketCandidate(initialRunPackets, initialRunPackets.runPackets[0]);
  const verifiedRunPacket = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify(candidatePacket)
  });
  if (verifiedRunPacket.status !== "t3-run-packet-verified-execution-blocked" ||
      verifiedRunPacket.verificationPassed !== true ||
      verifiedRunPacket.verifiedPacketCount !== 1 ||
      verifiedRunPacket.executionAllowed !== false ||
      verifiedRunPacket.finalGoalComplete !== false ||
      !verifiedRunPacket.packetVerifications.some((packet) => packet.laneId === candidatePacket.laneId && packet.packetValid === true)) {
    failures.push("T3 run-packet verifier did not validate a correct single packet safely");
  }

  const rejectedRunPacket = await request("/api/delivery/t3-run-packet-verifier", {
    method: "POST",
    body: JSON.stringify({ ...candidatePacket, approvalRecorded: true, packetHash: hash("bad-packet") })
  });
  if (rejectedRunPacket.status !== "t3-run-packet-rejected-execution-blocked" ||
      rejectedRunPacket.verifiedPacketCount !== 0 ||
      rejectedRunPacket.finalGoalComplete !== false ||
      !rejectedRunPacket.packetVerifications.some((packet) => packet.rejectionReasons.includes("packet-hash-mismatch") || packet.rejectionReasons.includes("state-change-claim-not-allowed"))) {
    failures.push("T3 run-packet verifier did not reject unsafe packet metadata");
  }

  const reviewerCockpit = await request("/api/delivery/reviewer-cockpit");
  if (reviewerCockpit.status !== "reviewer-cockpit-ready-open-t3" ||
      reviewerCockpit.finalGoalComplete !== false ||
      reviewerCockpit.reviewerCockpitOnly !== true ||
      reviewerCockpit.readyForHumanReview !== true ||
      reviewerCockpit.readyForProductionRelease !== false ||
      reviewerCockpit.localEvidenceReady !== true ||
      reviewerCockpit.blockedByT3 !== true ||
      reviewerCockpit.openT3GapCount !== 3 ||
      reviewerCockpit.contentReturned !== false ||
      reviewerCockpit.sectionCount !== 8 ||
      reviewerCockpit.readySectionCount !== 7 ||
      reviewerCockpit.blockedSectionCount !== 1 ||
      !reviewerCockpit.sections?.some((section) => section.id === "production-release-gate" && section.status === "blocked-open") ||
      !/^[a-f0-9]{64}$/.test(reviewerCockpit.reviewerCockpitHash || "") ||
      reviewerCockpit.guardrails?.externalCalls !== false ||
      reviewerCockpit.guardrails?.certificationExecution !== false ||
      reviewerCockpit.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery reviewer cockpit did not expose metadata-only review-ready/open-T3 state");
  }

  const launchGuide = await request("/api/delivery/launch-guide");
  if (launchGuide.status !== "delivery-launch-guide-ready-open-t3" ||
      launchGuide.finalGoalComplete !== false ||
      launchGuide.launchGuideOnly !== true ||
      launchGuide.readyForLocalReview !== true ||
      launchGuide.readyForProductionRelease !== false ||
      launchGuide.localEvidenceReady !== true ||
      launchGuide.blockedByT3 !== true ||
      launchGuide.openT3GapCount !== 3 ||
      launchGuide.contentReturned !== false ||
      launchGuide.commandCount < 7 ||
      launchGuide.routeCount < 5 ||
      launchGuide.evidenceFileCount < 6 ||
      !launchGuide.reviewCommands?.some((entry) => entry.command?.includes("qa:reviewer-cockpit")) ||
      !launchGuide.reviewRoutes?.some((entry) => entry.route?.includes("/api/delivery/reviewer-cockpit")) ||
      !/^[a-f0-9]{64}$/.test(launchGuide.launchGuideHash || "") ||
      launchGuide.guardrails?.externalCalls !== false ||
      launchGuide.guardrails?.certificationExecution !== false ||
      launchGuide.guardrails?.productionRelease !== false ||
      launchGuide.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery launch guide did not expose local-review-only/open-T3 state");
  }

  const consistencySentinel = await request("/api/delivery/consistency-sentinel");
  if (consistencySentinel.status !== "delivery-consistency-sentinel-ready-open-t3" ||
      consistencySentinel.finalGoalComplete !== false ||
      consistencySentinel.sentinelOnly !== true ||
      consistencySentinel.consistencyPassed !== true ||
      consistencySentinel.readyForProductionRelease !== false ||
      consistencySentinel.blockedByT3 !== true ||
      consistencySentinel.openT3GapCount !== 3 ||
      consistencySentinel.contentReturned !== false ||
      consistencySentinel.contradictionCount !== 0 ||
      consistencySentinel.surfaceCount < 7 ||
      consistencySentinel.invariantCount < 7 ||
      consistencySentinel.evidenceFileCount < 8 ||
      !consistencySentinel.surfaces?.some((entry) => entry.id === "delivery-launch-guide" && entry.ready === true) ||
      !consistencySentinel.invariants?.every((entry) => entry.passed === true) ||
      !/^[a-f0-9]{64}$/.test(consistencySentinel.consistencyHash || "") ||
      consistencySentinel.guardrails?.externalCalls !== false ||
      consistencySentinel.guardrails?.certificationExecution !== false ||
      consistencySentinel.guardrails?.productionRelease !== false ||
      consistencySentinel.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery consistency sentinel did not expose consistent local-review-only/open-T3 state");
  }

  const finalAcceptance = await request("/api/delivery/final-acceptance-matrix");
  if (finalAcceptance.status !== "final-acceptance-matrix-ready-open-t3" ||
      finalAcceptance.finalGoalComplete !== false ||
      finalAcceptance.acceptanceMatrixOnly !== true ||
      finalAcceptance.localAcceptancePassed !== true ||
      finalAcceptance.readyForProductionRelease !== false ||
      finalAcceptance.blockedByT3 !== true ||
      finalAcceptance.openT3GapCount !== 3 ||
      finalAcceptance.contentReturned !== false ||
      finalAcceptance.acceptanceRowCount < 13 ||
      finalAcceptance.provedRowCount < 10 ||
      finalAcceptance.blockedRowCount !== 3 ||
      finalAcceptance.failedRowCount !== 0 ||
      finalAcceptance.evidenceFileCount < 9 ||
      !finalAcceptance.rows?.some((entry) => entry.id === "external-provider-certification" && entry.status === "blocked-t3") ||
      !/^[a-f0-9]{64}$/.test(finalAcceptance.acceptanceHash || "") ||
      finalAcceptance.guardrails?.externalCalls !== false ||
      finalAcceptance.guardrails?.certificationExecution !== false ||
      finalAcceptance.guardrails?.productionRelease !== false ||
      finalAcceptance.guardrails?.finalCompletionClaimed !== false) {
    failures.push("final acceptance matrix did not expose local-acceptance/open-T3 state");
  }

  const blockerBoard = await request("/api/delivery/certification-blocker-board");
  if (blockerBoard.status !== "certification-blocker-board-ready-open-t3" ||
      blockerBoard.finalGoalComplete !== false ||
      blockerBoard.blockerBoardOnly !== true ||
      blockerBoard.localBoardPassed !== true ||
      blockerBoard.readyForProductionRelease !== false ||
      blockerBoard.blockedByT3 !== true ||
      blockerBoard.openT3GapCount !== 3 ||
      blockerBoard.contentReturned !== false ||
      blockerBoard.blockerCount !== 3 ||
      blockerBoard.readyBlockerCount !== 3 ||
      blockerBoard.closedBlockerCount !== 0 ||
      blockerBoard.laneTrackCount !== 3 ||
      blockerBoard.nextActionCount !== 3 ||
      blockerBoard.evidenceFileCount < 9 ||
      !blockerBoard.blockers?.every((entry) => entry.status === "open" && entry.localReady === true && entry.executionAllowed === false && entry.finalGoalComplete === false) ||
      !/^[a-f0-9]{64}$/.test(blockerBoard.boardHash || "") ||
      blockerBoard.guardrails?.externalCalls !== false ||
      blockerBoard.guardrails?.certificationExecution !== false ||
      blockerBoard.guardrails?.productionRelease !== false ||
      blockerBoard.guardrails?.finalCompletionClaimed !== false) {
    failures.push("certification blocker board did not expose open ready blocker state");
  }

  const userAcceptanceRehearsal = await request("/api/delivery/user-acceptance-rehearsal");
  if (userAcceptanceRehearsal.status !== "user-acceptance-rehearsal-ready-open-t3" ||
      userAcceptanceRehearsal.finalGoalComplete !== false ||
      userAcceptanceRehearsal.userAcceptanceRehearsalOnly !== true ||
      userAcceptanceRehearsal.localUserAcceptancePassed !== true ||
      userAcceptanceRehearsal.readyForHumanReview !== true ||
      userAcceptanceRehearsal.readyForProductionRelease !== false ||
      userAcceptanceRehearsal.blockedByT3 !== true ||
      userAcceptanceRehearsal.openT3GapCount !== 3 ||
      userAcceptanceRehearsal.contentReturned !== false ||
      userAcceptanceRehearsal.rehearsalCount !== 3 ||
      userAcceptanceRehearsal.readyRehearsalCount !== 3 ||
      userAcceptanceRehearsal.blockedRehearsalCount !== 0 ||
      userAcceptanceRehearsal.evidenceFileCount < 9 ||
      !userAcceptanceRehearsal.rehearsals?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.finalGoalComplete === false) ||
      !/^[a-f0-9]{64}$/.test(userAcceptanceRehearsal.rehearsalHash || "") ||
      userAcceptanceRehearsal.guardrails?.externalCalls !== false ||
      userAcceptanceRehearsal.guardrails?.managedDatabaseConnections !== false ||
      userAcceptanceRehearsal.guardrails?.certificationExecution !== false ||
      userAcceptanceRehearsal.guardrails?.productionRelease !== false ||
      userAcceptanceRehearsal.guardrails?.finalCompletionClaimed !== false) {
    failures.push("user acceptance rehearsal did not expose local user-acceptance/open-T3 state");
  }

  const evidenceNavigator = await request("/api/delivery/evidence-navigator");
  if (evidenceNavigator.status !== "delivery-evidence-navigator-ready-open-t3" ||
      evidenceNavigator.finalGoalComplete !== false ||
      evidenceNavigator.deliveryEvidenceNavigatorOnly !== true ||
      evidenceNavigator.localNavigationPassed !== true ||
      evidenceNavigator.readyForHumanReview !== true ||
      evidenceNavigator.readyForProductionRelease !== false ||
      evidenceNavigator.blockedByT3 !== true ||
      evidenceNavigator.openT3GapCount !== 3 ||
      evidenceNavigator.contentReturned !== false ||
      evidenceNavigator.navigationSectionCount !== 5 ||
      evidenceNavigator.readyNavigationSectionCount !== 5 ||
      evidenceNavigator.blockedNavigationSectionCount !== 0 ||
      evidenceNavigator.evidenceFileCount < 9 ||
      !evidenceNavigator.sections?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.contentReturned === false && entry.finalGoalComplete === false) ||
      !/^[a-f0-9]{64}$/.test(evidenceNavigator.navigatorHash || "") ||
      evidenceNavigator.guardrails?.externalCalls !== false ||
      evidenceNavigator.guardrails?.managedDatabaseConnections !== false ||
      evidenceNavigator.guardrails?.certificationExecution !== false ||
      evidenceNavigator.guardrails?.productionRelease !== false ||
      evidenceNavigator.guardrails?.finalCompletionClaimed !== false) {
    failures.push("delivery evidence navigator did not expose ready metadata/open-T3 state");
  }

  const localSummary = await request("/api/delivery/local-summary-packet");
  if (localSummary.status !== "local-delivery-summary-ready-open-t3" ||
      localSummary.finalGoalComplete !== false ||
      localSummary.summaryPacketOnly !== true ||
      localSummary.localSummaryPassed !== true ||
      localSummary.readyForHumanDelivery !== true ||
      localSummary.readyForProductionRelease !== false ||
      localSummary.blockedByT3 !== true ||
      localSummary.openT3GapCount !== 3 ||
      localSummary.contentReturned !== false ||
      localSummary.summarySectionCount !== 6 ||
      localSummary.readySummarySectionCount !== 6 ||
      localSummary.blockedSummarySectionCount !== 0 ||
      localSummary.localRequirementCount < 45 ||
      localSummary.provedCheckCount < 66 ||
      localSummary.evidenceFileCount < 9 ||
      !localSummary.sections?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.contentReturned === false && entry.finalGoalComplete === false) ||
      !/^[a-f0-9]{64}$/.test(localSummary.summaryHash || "") ||
      localSummary.guardrails?.externalCalls !== false ||
      localSummary.guardrails?.managedDatabaseConnections !== false ||
      localSummary.guardrails?.certificationExecution !== false ||
      localSummary.guardrails?.productionRelease !== false ||
      localSummary.guardrails?.finalCompletionClaimed !== false) {
    failures.push("local delivery summary packet did not expose ready local-summary/open-T3 state");
  }

  const handoffBrief = await request("/api/delivery/handoff-brief");
  if (handoffBrief.status !== "local-delivery-handoff-brief-ready-open-t3" ||
      handoffBrief.finalGoalComplete !== false ||
      handoffBrief.handoffBriefOnly !== true ||
      handoffBrief.localHandoffPassed !== true ||
      handoffBrief.readyForUserReview !== true ||
      handoffBrief.readyForProductionRelease !== false ||
      handoffBrief.blockedByT3 !== true ||
      handoffBrief.openT3GapCount !== 3 ||
      handoffBrief.contentReturned !== false ||
      handoffBrief.briefSectionCount !== 6 ||
      handoffBrief.readyBriefSectionCount !== 6 ||
      handoffBrief.blockedBriefSectionCount !== 0 ||
      handoffBrief.localCommandCount < 5 ||
      handoffBrief.localRequirementCount < 46 ||
      handoffBrief.provedCheckCount < 67 ||
      handoffBrief.evidenceFileCount < 8 ||
      !handoffBrief.sections?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.contentReturned === false && entry.finalGoalComplete === false) ||
      !handoffBrief.localCommands?.every((entry) => entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.outwardAction === false) ||
      !/^[a-f0-9]{64}$/.test(handoffBrief.briefHash || "") ||
      handoffBrief.guardrails?.externalCalls !== false ||
      handoffBrief.guardrails?.managedDatabaseConnections !== false ||
      handoffBrief.guardrails?.commandOutputReturned !== false ||
      handoffBrief.guardrails?.certificationExecution !== false ||
      handoffBrief.guardrails?.productionRelease !== false ||
      handoffBrief.guardrails?.finalCompletionClaimed !== false) {
    failures.push("local delivery handoff brief did not expose ready local handoff/open-T3 state");
  }

  const quickstartBundle = await request("/api/delivery/quickstart-bundle");
  if (quickstartBundle.status !== "local-delivery-quickstart-ready-open-t3" ||
      quickstartBundle.finalGoalComplete !== false ||
      quickstartBundle.quickstartBundleOnly !== true ||
      quickstartBundle.localQuickstartPassed !== true ||
      quickstartBundle.readyForLocalRunbookReview !== true ||
      quickstartBundle.readyForProductionRelease !== false ||
      quickstartBundle.blockedByT3 !== true ||
      quickstartBundle.openT3GapCount !== 3 ||
      quickstartBundle.contentReturned !== false ||
      quickstartBundle.quickstartStepCount !== 7 ||
      quickstartBundle.readyQuickstartStepCount !== 7 ||
      quickstartBundle.blockedQuickstartStepCount !== 0 ||
      quickstartBundle.localCommandCount < 8 ||
      quickstartBundle.localRouteCount < 6 ||
      quickstartBundle.localRequirementCount < 47 ||
      quickstartBundle.provedCheckCount < 68 ||
      quickstartBundle.evidenceFileCount < 10 ||
      !quickstartBundle.quickstartSteps?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.finalGoalComplete === false) ||
      !quickstartBundle.localCommands?.every((entry) => entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.outwardAction === false) ||
      !quickstartBundle.localRoutes?.every((entry) => entry.localOnly === true && entry.outwardAction === false && entry.contentReturned === false) ||
      !/^[a-f0-9]{64}$/.test(quickstartBundle.quickstartHash || "") ||
      quickstartBundle.guardrails?.externalCalls !== false ||
      quickstartBundle.guardrails?.managedDatabaseConnections !== false ||
      quickstartBundle.guardrails?.commandOutputReturned !== false ||
      quickstartBundle.guardrails?.certificationExecution !== false ||
      quickstartBundle.guardrails?.productionRelease !== false ||
      quickstartBundle.guardrails?.finalCompletionClaimed !== false) {
    failures.push("local delivery quickstart bundle did not expose ready local quickstart/open-T3 state");
  }

  const verificationSuite = await request("/api/delivery/local-verification-suite");
  if (verificationSuite.status !== "local-delivery-verification-suite-ready-open-t3" ||
      verificationSuite.finalGoalComplete !== false ||
      verificationSuite.verificationSuiteOnly !== true ||
      verificationSuite.localVerificationPassed !== true ||
      verificationSuite.readyForLocalVerificationReview !== true ||
      verificationSuite.readyForProductionRelease !== false ||
      verificationSuite.blockedByT3 !== true ||
      verificationSuite.openT3GapCount !== 3 ||
      verificationSuite.contentReturned !== false ||
      verificationSuite.verificationCheckCount !== 10 ||
      verificationSuite.readyVerificationCheckCount !== 10 ||
      verificationSuite.blockedVerificationCheckCount !== 0 ||
      verificationSuite.localCommandCount !== 10 ||
      verificationSuite.localRequirementCount < 48 ||
      verificationSuite.provedCheckCount < 69 ||
      verificationSuite.evidenceFileCount < 12 ||
      !verificationSuite.verificationChecks?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.finalGoalComplete === false) ||
      !verificationSuite.localCommands?.every((entry) => entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.outwardAction === false) ||
      !/^[a-f0-9]{64}$/.test(verificationSuite.suiteHash || "") ||
      verificationSuite.guardrails?.externalCalls !== false ||
      verificationSuite.guardrails?.managedDatabaseConnections !== false ||
      verificationSuite.guardrails?.commandOutputReturned !== false ||
      verificationSuite.guardrails?.certificationExecution !== false ||
      verificationSuite.guardrails?.productionRelease !== false ||
      verificationSuite.guardrails?.finalCompletionClaimed !== false) {
    failures.push("local delivery verification suite did not expose ready local verification/open-T3 state");
  }

  const finalHandoffCheckpoint = await request("/api/delivery/final-local-handoff-checkpoint");
  if (finalHandoffCheckpoint.status !== "final-local-handoff-checkpoint-ready-open-t3" ||
      finalHandoffCheckpoint.finalGoalComplete !== false ||
      finalHandoffCheckpoint.checkpointOnly !== true ||
      finalHandoffCheckpoint.localFinalHandoffPassed !== true ||
      finalHandoffCheckpoint.readyForFinalLocalReview !== true ||
      finalHandoffCheckpoint.readyForProductionRelease !== false ||
      finalHandoffCheckpoint.blockedByT3 !== true ||
      finalHandoffCheckpoint.openT3GapCount !== 3 ||
      finalHandoffCheckpoint.contentReturned !== false ||
      finalHandoffCheckpoint.checkpointStepCount !== 8 ||
      finalHandoffCheckpoint.readyCheckpointStepCount !== 8 ||
      finalHandoffCheckpoint.blockedCheckpointStepCount !== 0 ||
      finalHandoffCheckpoint.localCommandCount !== 8 ||
      finalHandoffCheckpoint.handoffArtifactCount < 13 ||
      finalHandoffCheckpoint.localRequirementCount < 49 ||
      finalHandoffCheckpoint.provedCheckCount < 70 ||
      !finalHandoffCheckpoint.checkpointSteps?.every((entry) => entry.status === "ready-local" && entry.localReady === true && entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.finalGoalComplete === false) ||
      !finalHandoffCheckpoint.localCommands?.every((entry) => entry.executionAllowed === false && entry.executed === false && entry.outputReturned === false && entry.outwardAction === false) ||
      !/^[a-f0-9]{64}$/.test(finalHandoffCheckpoint.checkpointHash || "") ||
      finalHandoffCheckpoint.guardrails?.externalCalls !== false ||
      finalHandoffCheckpoint.guardrails?.managedDatabaseConnections !== false ||
      finalHandoffCheckpoint.guardrails?.commandOutputReturned !== false ||
      finalHandoffCheckpoint.guardrails?.certificationExecution !== false ||
      finalHandoffCheckpoint.guardrails?.productionRelease !== false ||
      finalHandoffCheckpoint.guardrails?.finalCompletionClaimed !== false) {
    failures.push("final local handoff checkpoint did not expose ready local handoff/open-T3 state");
  }

  const initialApprovalPacket = await request("/api/delivery/t3-approval-packet");
  if (initialApprovalPacket.status !== "approval-packet-ready" ||
      initialApprovalPacket.finalGoalComplete !== false ||
      initialApprovalPacket.executionAllowed !== false ||
      initialApprovalPacket.safeToRunAutomatically !== false ||
      initialApprovalPacket.approvalRequired !== true ||
      initialApprovalPacket.laneCount !== 3 ||
      initialApprovalPacket.approvedLaneCount !== 0 ||
      initialApprovalPacket.blockedLaneCount !== 3 ||
      initialApprovalPacket.evidenceRequirementCount < 18 ||
      initialApprovalPacket.rollbackStepCount < 9 ||
      initialApprovalPacket.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval packet did not expose blocked approval-required state");
  }

  const initialDryRunRehearsal = await request("/api/delivery/t3-dry-run-rehearsal");
  if (initialDryRunRehearsal.status !== "rehearsal-ready-with-open-t3-gaps" ||
      initialDryRunRehearsal.finalGoalComplete !== false ||
      initialDryRunRehearsal.rehearsalOnly !== true ||
      initialDryRunRehearsal.externalActionsExecuted !== false ||
      initialDryRunRehearsal.certificationStateChanged !== false ||
      initialDryRunRehearsal.executionAllowed !== false ||
      initialDryRunRehearsal.safeToRunAutomatically !== false ||
      initialDryRunRehearsal.laneCount !== 3 ||
      initialDryRunRehearsal.readyLaneCount !== 3 ||
      initialDryRunRehearsal.blockedLaneCount !== 3 ||
      initialDryRunRehearsal.failedDryRunCheckCount !== 0 ||
      initialDryRunRehearsal.guardrails?.certificationExecution !== false) {
    failures.push("T3 dry-run rehearsal did not expose local-only rehearsal state");
  }

  const initialApprovalRequest = await request("/api/delivery/t3-approval-request-export");
  if (initialApprovalRequest.status !== "approval-request-export-ready" ||
      initialApprovalRequest.finalGoalComplete !== false ||
      initialApprovalRequest.exportOnly !== true ||
      initialApprovalRequest.externalActionsExecuted !== false ||
      initialApprovalRequest.certificationStateChanged !== false ||
      initialApprovalRequest.executionAllowed !== false ||
      initialApprovalRequest.approvalRequestCount !== 3 ||
      initialApprovalRequest.requestReadyCount !== 3 ||
      initialApprovalRequest.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval request export did not expose export-only request state");
  }

  const initialApprovalIntegrity = await request("/api/delivery/t3-approval-integrity");
  if (initialApprovalIntegrity.status !== "approval-integrity-ready" ||
      initialApprovalIntegrity.finalGoalComplete !== false ||
      initialApprovalIntegrity.hashOnly !== true ||
      initialApprovalIntegrity.contentReturned !== false ||
      initialApprovalIntegrity.externalActionsExecuted !== false ||
      initialApprovalIntegrity.certificationStateChanged !== false ||
      initialApprovalIntegrity.executionAllowed !== false ||
      initialApprovalIntegrity.artifactCount < 8 ||
      initialApprovalIntegrity.readyArtifactCount !== initialApprovalIntegrity.artifactCount ||
      initialApprovalIntegrity.missingArtifactCount !== 0 ||
      initialApprovalIntegrity.hashCount !== initialApprovalIntegrity.artifactCount ||
      initialApprovalIntegrity.secretExposure !== false ||
      !/^[a-f0-9]{64}$/.test(initialApprovalIntegrity.integrityBundleHash || "") ||
      initialApprovalIntegrity.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval integrity did not expose hash-only blocked integrity state");
  }

  const initialApprovalLock = await request("/api/delivery/t3-approval-lock");
  if (initialApprovalLock.status !== "approval-lock-ready-with-open-t3-gaps" ||
      initialApprovalLock.finalGoalComplete !== false ||
      initialApprovalLock.lockOnly !== true ||
      initialApprovalLock.approved !== false ||
      initialApprovalLock.executionAllowed !== false ||
      initialApprovalLock.externalActionsExecuted !== false ||
      initialApprovalLock.certificationStateChanged !== false ||
      initialApprovalLock.contentReturned !== false ||
      initialApprovalLock.approvalRequestStatus !== "approval-request-export-ready" ||
      initialApprovalLock.approvalRequestCount !== 3 ||
      initialApprovalLock.requestReadyCount !== 3 ||
      initialApprovalLock.integrityStatus !== "approval-integrity-ready" ||
      initialApprovalLock.openCertificationGapCount !== 3 ||
      initialApprovalLock.laneLockCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(initialApprovalLock.approvalLockHash || "") ||
      initialApprovalLock.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval lock did not expose lock-only blocked state");
  }

  const initialApprovalVerifier = await request("/api/delivery/t3-approval-verifier");
  if (initialApprovalVerifier.status !== "approval-verifier-ready-execution-blocked" ||
      initialApprovalVerifier.finalGoalComplete !== false ||
      initialApprovalVerifier.verifierOnly !== true ||
      initialApprovalVerifier.verificationPassed !== false ||
      initialApprovalVerifier.approvalRecorded !== false ||
      initialApprovalVerifier.approved !== false ||
      initialApprovalVerifier.executionAllowed !== false ||
      initialApprovalVerifier.externalActionsExecuted !== false ||
      initialApprovalVerifier.certificationStateChanged !== false ||
      initialApprovalVerifier.contentReturned !== false ||
      initialApprovalVerifier.lockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      initialApprovalVerifier.laneVerificationCount !== 3 ||
      initialApprovalVerifier.readyLaneVerificationCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(initialApprovalVerifier.approvalLockHash || "") ||
      initialApprovalVerifier.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval verifier did not expose verifier-only blocked state");
  }

  const initialApprovalCandidates = await request("/api/delivery/t3-approval-candidates");
  if (initialApprovalCandidates.status !== "approval-candidates-ready-execution-blocked" ||
      initialApprovalCandidates.finalGoalComplete !== false ||
      initialApprovalCandidates.candidateOnly !== true ||
      initialApprovalCandidates.approvalRecorded !== false ||
      initialApprovalCandidates.approved !== false ||
      initialApprovalCandidates.executionAllowed !== false ||
      initialApprovalCandidates.externalActionsExecuted !== false ||
      initialApprovalCandidates.certificationStateChanged !== false ||
      initialApprovalCandidates.contentReturned !== false ||
      initialApprovalCandidates.lockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      initialApprovalCandidates.verifierStatus !== "approval-verifier-ready-execution-blocked" ||
      initialApprovalCandidates.candidateCount !== 3 ||
      initialApprovalCandidates.verifierPassCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(initialApprovalCandidates.candidateBundleHash || "") ||
      initialApprovalCandidates.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval candidates did not expose candidate-only blocked state");
  }

  const initialApprovalExecutionGate = await request("/api/delivery/t3-approval-execution-gate");
  if (initialApprovalExecutionGate.status !== "approval-execution-gate-ready-execution-blocked" ||
      initialApprovalExecutionGate.finalGoalComplete !== false ||
      initialApprovalExecutionGate.gateOnly !== true ||
      initialApprovalExecutionGate.approvalRecorded !== false ||
      initialApprovalExecutionGate.approved !== false ||
      initialApprovalExecutionGate.executionAllowed !== false ||
      initialApprovalExecutionGate.externalActionsExecuted !== false ||
      initialApprovalExecutionGate.certificationStateChanged !== false ||
      initialApprovalExecutionGate.contentReturned !== false ||
      initialApprovalExecutionGate.candidateBundleStatus !== "approval-candidates-ready-execution-blocked" ||
      initialApprovalExecutionGate.laneGateCount !== 3 ||
      initialApprovalExecutionGate.readyLaneGateCount !== 3 ||
      initialApprovalExecutionGate.boundCandidateCount !== 0 ||
      !/^[a-f0-9]{64}$/.test(initialApprovalExecutionGate.executionGateHash || "") ||
      initialApprovalExecutionGate.guardrails?.certificationExecution !== false) {
    failures.push("T3 approval execution gate did not expose gate-only blocked state");
  }

  const initialGateCandidate = initialApprovalCandidates.candidates?.[0];
  const boundApprovalExecutionGate = await request("/api/delivery/t3-approval-execution-gate", {
    method: "POST",
    body: JSON.stringify({
      laneId: initialGateCandidate.laneId,
      approvalLockHash: initialGateCandidate.approvalLockHash,
      approvalTextHash: initialGateCandidate.approvalTextHash
    })
  });
  if (boundApprovalExecutionGate.status !== "approval-execution-gate-candidate-bound-execution-blocked" ||
      boundApprovalExecutionGate.candidate?.bound !== true ||
      boundApprovalExecutionGate.boundCandidateCount !== 1 ||
      boundApprovalExecutionGate.boundLaneId !== initialGateCandidate.laneId ||
      boundApprovalExecutionGate.executionAllowed !== false ||
      boundApprovalExecutionGate.approvalRecorded !== false) {
    failures.push("T3 approval execution gate did not bind a valid candidate safely");
  }

  const initialEvidenceClosure = await request("/api/delivery/t3-certification-evidence-closure");
  if (initialEvidenceClosure.status !== "certification-evidence-closure-ready-execution-blocked" ||
      initialEvidenceClosure.finalGoalComplete !== false ||
      initialEvidenceClosure.closureOnly !== true ||
      initialEvidenceClosure.approvalRecorded !== false ||
      initialEvidenceClosure.approved !== false ||
      initialEvidenceClosure.executionAllowed !== false ||
      initialEvidenceClosure.externalActionsExecuted !== false ||
      initialEvidenceClosure.certificationStateChanged !== false ||
      initialEvidenceClosure.contentReturned !== false ||
      initialEvidenceClosure.gateStatus !== "approval-execution-gate-ready-execution-blocked" ||
      initialEvidenceClosure.laneClosureCount !== 3 ||
      initialEvidenceClosure.readyLaneClosureCount !== 3 ||
      initialEvidenceClosure.submittedEvidenceBundleCount !== 0 ||
      initialEvidenceClosure.validatedEvidenceBundleCount !== 0 ||
      !/^[a-f0-9]{64}$/.test(initialEvidenceClosure.closureHash || "") ||
      initialEvidenceClosure.guardrails?.certificationExecution !== false) {
    failures.push("T3 certification evidence closure did not expose closure-only blocked state");
  }

  const closureLane = initialApprovalExecutionGate.gateLanes?.[0];
  const evidenceBundle = {
    laneId: closureLane.laneId,
    executionGateHash: initialApprovalExecutionGate.executionGateHash,
    evidenceItems: closureLane.requiredEvidence.map((id, index) => ({
      id,
      status: "passed",
      artifactHash: hash(`api-evidence-${closureLane.laneId}-${index}`)
    })),
    rollbackResults: closureLane.rollbackChecks.map((id, index) => ({
      id,
      status: "passed",
      artifactHash: hash(`api-rollback-${closureLane.laneId}-${index}`)
    })),
    actionsExecuted: [],
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false
  };
  const validatedEvidenceClosure = await request("/api/delivery/t3-certification-evidence-closure", {
    method: "POST",
    body: JSON.stringify(evidenceBundle)
  });
  if (validatedEvidenceClosure.status !== "certification-evidence-closure-ready-state-unchanged" ||
      validatedEvidenceClosure.evidenceBundle?.closureReady !== true ||
      validatedEvidenceClosure.validatedEvidenceBundleCount !== 1 ||
      validatedEvidenceClosure.executionAllowed !== false ||
      validatedEvidenceClosure.certificationStateChanged !== false ||
      validatedEvidenceClosure.finalGoalComplete !== false) {
    failures.push("T3 certification evidence closure did not validate a complete evidence bundle safely");
  }

  const finalReadiness = await request("/api/delivery/final-readiness");
  if (finalReadiness.status !== "final-readiness-local-evidence-ready-open-t3" ||
      finalReadiness.finalGoalComplete !== false ||
      finalReadiness.localEvidencePassed !== true ||
      finalReadiness.artifactIntegrityPassed !== true ||
      finalReadiness.objectiveTraceable !== true ||
      finalReadiness.agenticPassed !== true ||
      finalReadiness.blockedByT3 !== true ||
      finalReadiness.openT3GapCount !== 3 ||
      !/^[a-f0-9]{64}$/.test(finalReadiness.readinessHash || "") ||
      finalReadiness.guardrails?.certificationExecution !== false) {
    failures.push("final delivery readiness did not expose local-ready/open-T3 state");
  }

  const evidenceTemplates = await request("/api/delivery/t3-evidence-bundle-templates");
  if (evidenceTemplates.status !== "evidence-bundle-templates-ready-execution-blocked" ||
      evidenceTemplates.finalGoalComplete !== false ||
      evidenceTemplates.templateOnly !== true ||
      evidenceTemplates.approvalRecorded !== false ||
      evidenceTemplates.executionAllowed !== false ||
      evidenceTemplates.certificationStateChanged !== false ||
      evidenceTemplates.laneTemplateCount !== 3 ||
      evidenceTemplates.readyLaneTemplateCount !== 3 ||
      evidenceTemplates.evidenceItemCount < 15 ||
      evidenceTemplates.rollbackResultCount < 9 ||
      !/^[a-f0-9]{64}$/.test(evidenceTemplates.templateBundleHash || "") ||
      evidenceTemplates.guardrails?.certificationExecution !== false) {
    failures.push("T3 evidence bundle templates did not expose template-only blocked state");
  }

  const operatorChecklist = await request("/api/delivery/t3-operator-checklist");
  if (operatorChecklist.status !== "t3-operator-checklist-ready-execution-blocked" ||
      operatorChecklist.finalGoalComplete !== false ||
      operatorChecklist.operatorOnly !== true ||
      operatorChecklist.approvalRecorded !== false ||
      operatorChecklist.executionAllowed !== false ||
      operatorChecklist.certificationStateChanged !== false ||
      operatorChecklist.laneChecklistCount !== 3 ||
      operatorChecklist.readyLaneChecklistCount !== 3 ||
      operatorChecklist.manualStepCount < 15 ||
      operatorChecklist.evidenceItemCount < 15 ||
      operatorChecklist.rollbackItemCount < 9 ||
      !/^[a-f0-9]{64}$/.test(operatorChecklist.checklistBundleHash || "") ||
      operatorChecklist.guardrails?.certificationExecution !== false) {
    failures.push("T3 operator checklist did not expose operator-only blocked state");
  }

  const transcriptValidator = await request("/api/delivery/t3-operator-transcript-validator");
  if (transcriptValidator.status !== "t3-operator-transcript-validator-ready-execution-blocked" ||
      transcriptValidator.finalGoalComplete !== false ||
      transcriptValidator.validatorOnly !== true ||
      transcriptValidator.approvalRecorded !== false ||
      transcriptValidator.executionAllowed !== false ||
      transcriptValidator.certificationStateChanged !== false ||
      transcriptValidator.laneValidationCount !== 3 ||
      transcriptValidator.readyLaneValidationCount !== 3 ||
      transcriptValidator.submittedTranscriptCount !== 0 ||
      transcriptValidator.validatedTranscriptCount !== 0 ||
      !/^[a-f0-9]{64}$/.test(transcriptValidator.transcriptValidatorHash || "") ||
      transcriptValidator.guardrails?.certificationExecution !== false) {
    failures.push("T3 operator transcript validator did not expose validator-only blocked state");
  }

  const transcriptLane = operatorChecklist.laneChecklists?.[0];
  const validTranscript = {
    laneId: transcriptLane.laneId,
    checklistBundleHash: operatorChecklist.checklistBundleHash,
    manualStepIds: transcriptLane.manualSteps.map((step) => step.id),
    evidenceArtifactHashes: transcriptLane.evidenceChecklist.map((item, index) => ({
      id: item.id,
      status: "passed",
      artifactHash: hash(`api-transcript-evidence-${transcriptLane.laneId}-${index}`)
    })),
    rollbackArtifactHashes: transcriptLane.rollbackChecklist.map((item, index) => ({
      id: item.id,
      status: "passed",
      artifactHash: hash(`api-transcript-rollback-${transcriptLane.laneId}-${index}`)
    })),
    actionsExecuted: [],
    approvalRecorded: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false,
    contentReturned: false
  };
  const validatedTranscript = await request("/api/delivery/t3-operator-transcript-validator", {
    method: "POST",
    body: JSON.stringify(validTranscript)
  });
  if (validatedTranscript.status !== "t3-operator-transcript-valid-state-unchanged" ||
      validatedTranscript.validatedTranscriptCount !== 1 ||
      validatedTranscript.executionAllowed !== false ||
      validatedTranscript.certificationStateChanged !== false ||
      validatedTranscript.finalGoalComplete !== false) {
    failures.push("T3 operator transcript validator did not validate a complete transcript safely");
  }

  const forbiddenTransactionProbe = await requestFailure("/api/db/transaction-probe", { method: "POST", body: "{}" });
  if (forbiddenTransactionProbe.status !== 403) failures.push("db transaction probe without guard did not return 403");

  const transactionProbe = await request("/api/db/transaction-probe", {
    method: "POST",
    headers: { "X-CodeX-Dev-Reset": "allow" },
    body: "{}"
  });
  if (transactionProbe.event?.type !== "db_transaction_probe" || transactionProbe.authEventCount <= bootstrap.auth.authEventCount) {
    failures.push("db transaction probe did not append durable auth event evidence");
  }
  if (transactionProbe.dbStatus?.writeCount <= initialDbStatus.writeCount || transactionProbe.dbStatus?.lastReason !== "transaction-probe") {
    failures.push("db transaction probe did not save through repository transaction boundary");
  }

  const sandboxPolicy = await request("/api/sandbox/policy");
  if (sandboxPolicy.policy?.filesystem !== "ephemeral-temp-workspace" ||
      sandboxPolicy.policy?.process !== "no-shell-child-process" ||
      sandboxPolicy.policy?.outputLimitBytes !== 65536 ||
      sandboxPolicy.runner?.engine !== "sandbox-runner-v2" ||
      sandboxPolicy.runner?.envPolicy !== "allowlist-scrubbed") {
    failures.push("sandbox policy endpoint missing Phase 2Q isolation contract");
  }
  const initialSandboxCertification = await request("/api/sandbox/certification");
  if (initialSandboxCertification.certified !== false ||
      initialSandboxCertification.status !== "readiness-only" ||
      !initialSandboxCertification.missingCertificationControls?.includes("kernel-container-vm-or-browser-wasm-isolation-proof")) {
    failures.push("sandbox certification endpoint did not expose readiness-only non-certified status");
  }

  const assignmentData = await request("/api/classrooms/demo/assignments/current");
  if (!assignmentData.assignment?.title || !assignmentData.assignment?.ctFocus?.length) {
    failures.push("current assignment missing CT focus");
  }

  const modelContracts = await request("/api/ai/model-contracts");
  const modelContractRaw = JSON.stringify(modelContracts);
  if (modelContracts.coding?.fallbackAfterMs !== 1000 || modelContracts.image?.model !== "gpt-image-2") {
    failures.push("model contracts missing expected routing rules");
  }
  if (!modelContracts.runtime?.secretRedaction || modelContracts.version < 4) {
    failures.push("model contracts missing runtime audit settings");
  }
  if (modelContracts.provider?.provider !== "codex-model-gateway" || modelContracts.provider?.secretSafe !== true) {
    failures.push("model contracts missing secret-safe provider adapter status");
  }
  if (modelContractRaw.includes("sk-")) failures.push("model contracts leaked a secret-looking token");

  const providerStatus = await request("/api/ai/provider/status");
  if (providerStatus.provider !== "codex-model-gateway" || providerStatus.mode !== "local-simulated" || providerStatus.secretSafe !== true || providerStatus.keySource !== null) {
    failures.push("provider status did not report secret-safe local simulated mode");
  }
  if (JSON.stringify(providerStatus).includes("sk-")) failures.push("provider status leaked a secret-looking token");

  const initialProviderCertification = await request("/api/ai/provider/certification");
  if (initialProviderCertification.certified !== false ||
      initialProviderCertification.status !== "readiness-only" ||
      initialProviderCertification.provider !== "codex-model-gateway" ||
      !initialProviderCertification.missingCertificationControls?.includes("secret-manager-backed-provider-key") ||
      !initialProviderCertification.missingCertificationControls?.includes("approved-real-provider-call-with-human-authorization")) {
    failures.push("provider certification endpoint did not expose readiness-only non-certified status");
  }

  const providerPrimaryProbe = await request("/api/ai/provider/probe", {
    method: "POST",
    body: JSON.stringify({ taskType: "coding", prompt: "primary probe", simulatePrimaryLatencyMs: 250 })
  });
  if (providerPrimaryProbe.modelRoute?.selectedModel !== "claude-sonnet-4-6" || providerPrimaryProbe.providerRequest?.path !== "/v1/responses" || providerPrimaryProbe.secretEcho !== false) {
    failures.push("provider primary coding probe invalid");
  }

  const providerFallbackProbe = await request("/api/ai/provider/probe", {
    method: "POST",
    body: JSON.stringify({ taskType: "coding", prompt: "fallback probe", simulatePrimaryLatencyMs: 1250 })
  });
  if (providerFallbackProbe.modelRoute?.selectedModel !== "gpt-5.3-codex-spark" || providerFallbackProbe.modelRoute?.fallbackUsed !== true) {
    failures.push("provider fallback probe did not follow 1000ms rule");
  }

  const providerImageProbe = await request("/api/ai/provider/probe", {
    method: "POST",
    body: JSON.stringify({ taskType: "image", prompt: "3D glass mascot" })
  });
  if (providerImageProbe.modelRoute?.selectedModel !== "gpt-image-2" || providerImageProbe.modelRoute?.path !== "image" || providerImageProbe.providerRequest?.path !== "/v1/images") {
    failures.push("provider image probe did not stay on image model path");
  }

  const fakePromptSecret = `sk-${"testSecretShouldRedact123456"}`;
  const fakeFieldSecret = `sk-${"testFieldShouldRedact123456"}`;
  const livePlan = await request("/api/ai/provider/live-plan", {
    method: "POST",
    body: JSON.stringify({
      taskType: "coding",
      prompt: `explain with fake secret ${fakePromptSecret}`,
      code: "print('live plan')",
      apiKey: fakeFieldSecret,
      simulatePrimaryLatencyMs: 1250
    })
  });
  const livePlanRaw = JSON.stringify(livePlan);
  if (livePlan.modelRoute?.selectedModel !== "gpt-5.3-codex-spark" || livePlan.guard?.riskTier !== "T3-external-model-call" || livePlan.outboundCall !== false || livePlan.secretEcho !== false) {
    failures.push("live provider plan missing fallback route, guard, or no-outbound evidence");
  }
  if (livePlanRaw.includes(fakePromptSecret) || livePlanRaw.includes(fakeFieldSecret) || livePlan.redactedPayload?.apiKey !== "[REDACTED_FIELD]") {
    failures.push("live provider plan did not redact key-shaped or sensitive field values");
  }

  const blockedLiveCall = await requestFailure("/api/ai/provider/live-call", {
    method: "POST",
    body: JSON.stringify({ taskType: "image", prompt: "live image should be blocked" })
  });
  if (blockedLiveCall.status !== 409 || !blockedLiveCall.payload?.data?.plan?.guard?.blockingReasons?.length || blockedLiveCall.payload?.data?.plan?.outboundCall !== false) {
    failures.push("live provider call was not blocked by default guardrails");
  }

  const providerCertificationAfterGuard = await request("/api/ai/provider/certification");
  if (providerCertificationAfterGuard.certified !== false ||
      providerCertificationAfterGuard.status !== "readiness-only" ||
      providerCertificationAfterGuard.evidenceCounts?.blockedGuards < 1 ||
      providerCertificationAfterGuard.evidenceCounts?.secretEchoCount !== 0) {
    failures.push("provider certification readiness did not track blocked guard evidence safely");
  }

  const invalidLogin = await requestFailure("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId: "student-linyi", password: "wrong-password", role: "student" })
  });
  if (invalidLogin.status !== 401) failures.push("invalid password did not return 401");

  const studentLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId: "student-linyi", password: "demo-student", role: "student" })
  });
  const teacherLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId: "teacher-lishen", password: "demo-teacher", role: "teacher" })
  });
  const researcherLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ role: "researcher" })
  });
  if (!studentLogin.sessionToken || studentLogin.user?.role !== "student") failures.push("student login failed");
  if (!teacherLogin.sessionToken || teacherLogin.user?.role !== "teacher") failures.push("teacher login failed");
  if (studentLogin.assurance !== "password" || !studentLogin.user?.permissions?.includes("submit_work")) failures.push("student password login missing assurance/permissions");
  if (teacherLogin.assurance !== "password" || !teacherLogin.user?.permissions?.includes("review_submission")) failures.push("teacher password login missing assurance/permissions");
  if (researcherLogin.assurance !== "demo-role" || researcherLogin.user?.role !== "researcher") failures.push("role compatibility login failed");

  const sessionCheck = await request("/api/auth/session", { headers: { "X-CodeX-Session": studentLogin.sessionToken } });
  if (sessionCheck.user?.id !== "student-linyi" || !sessionCheck.permissions?.includes("submit_work") || sessionCheck.session?.revoked !== false) {
    failures.push("session verification missing active student permissions");
  }
  const loggedOut = await request("/api/auth/logout", { method: "POST", headers: { "X-CodeX-Session": studentLogin.sessionToken }, body: "{}" });
  if (loggedOut.revoked !== true || loggedOut.session?.revoked !== true) failures.push("logout did not revoke student session");
  const revokedSession = await requestFailure("/api/auth/session", { headers: { "X-CodeX-Session": studentLogin.sessionToken } });
  if (revokedSession.status !== 401) failures.push("revoked session verification did not return 401");
  const revokedSubmit = await requestFailure("/api/submissions", {
    method: "POST",
    headers: { "X-CodeX-Session": studentLogin.sessionToken },
    body: JSON.stringify({ assignmentId: "assign-turtle-badge", language: "python", code: "print('revoked')" })
  });
  if (revokedSubmit.status !== 403) failures.push("revoked student session was not rejected by role gate");

  const studentWorkLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId: "student-linyi", password: "demo-student", role: "student" })
  });
  const authAudit = await request("/api/auth/audit");
  if (authAudit.totals?.login_failure < 1 || authAudit.totals?.logout < 1 || authAudit.totals?.login < 3) {
    failures.push("auth audit missing login failure/logout/login totals");
  }
  if (JSON.stringify(authAudit).includes(studentLogin.sessionToken)) {
    failures.push("auth audit leaked a raw session token");
  }

  const versionData = await request("/api/projects/current/versions", {
    method: "POST",
    body: JSON.stringify({ label: "API QA 保存", language: "python", code: "print('qa')" })
  });
  if (!versionData.version?.id || !versionData.versions?.some((item) => item.id === versionData.version.id)) {
    failures.push("version save did not persist");
  }

  const run = await request("/api/run", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('qa')" })
  });
  if (!run.stdout.includes("qa")) failures.push("run output missing expected stdout");
  if (run.sandbox?.safetyLabel !== "sandbox-ok") failures.push("safe run missing sandbox ok label");
  if (!run.jobId || run.terminal !== true || run.jobProgress !== 100) failures.push("compat run missing terminal job evidence");
  if (!hasV2SandboxIsolation(run.runner) || !hasV2SandboxIsolation(run.runnerDiagnostics)) {
    failures.push("compat run missing v2 sandbox isolation diagnostics");
  }

  const runJob = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('job qa')" })
  });
  if (runJob.job?.status !== "completed" || runJob.job?.terminal !== true || runJob.result?.sandbox?.safetyLabel !== "sandbox-ok") {
    failures.push("safe run job did not reach completed terminal state");
  }
  if (!hasV2SandboxIsolation(runJob.job?.runner) || !hasV2SandboxIsolation(runJob.result?.runnerDiagnostics)) {
    failures.push("safe run job did not use v2 sandbox isolation boundary");
  }
  const fetchedRunJob = await request(`/api/run/jobs/${runJob.job.id}`);
  if (fetchedRunJob.job?.id !== runJob.job.id || fetchedRunJob.job?.progress !== 100) {
    failures.push("run job polling endpoint did not return terminal job");
  }

  const blockedRun = await request("/api/run", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "import os\nprint(os.listdir('.'))" })
  });
  if (blockedRun.status !== "rejected" || blockedRun.sandbox?.safetyLabel !== "sandbox-blocked") {
    failures.push("sandbox did not reject blocked Python code");
  }
  const blockedRunJob = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "import os\nprint(os.listdir('.'))" })
  });
  if (blockedRunJob.job?.status !== "rejected" || blockedRunJob.job?.terminal !== true || blockedRunJob.result?.sandbox?.safetyLabel !== "sandbox-blocked") {
    failures.push("blocked run job did not persist rejected terminal state");
  }
  if (!hasV2SandboxIsolation(blockedRunJob.job?.runner)) failures.push("blocked run job missing v2 runner boundary diagnostics");

  const dynamicImportEscape = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print(__import__('os').environ)" })
  });
  if (dynamicImportEscape.job?.status !== "rejected" ||
      !dynamicImportEscape.result?.sandbox?.violations?.some((item) => item.id === "python-eval" || item.id === "python-os") ||
      !hasV2SandboxIsolation(dynamicImportEscape.job?.runner)) {
    failures.push("sandbox did not reject dynamic import/environment escape attempt with v2 evidence");
  }

  const networkEscape = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "import requests\nprint(requests.get('https://example.invalid'))" })
  });
  if (networkEscape.job?.status !== "rejected" ||
      !networkEscape.result?.sandbox?.violations?.some((item) => item.id === "python-network") ||
      !hasV2SandboxIsolation(networkEscape.job?.runner)) {
    failures.push("sandbox did not reject network escape attempt with v2 evidence");
  }

  const timeoutRunJob = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('slow qa')", simulateRunnerDelayMs: 150, runnerTimeoutMs: 20 })
  });
  if (timeoutRunJob.job?.status !== "timeout" || timeoutRunJob.job?.terminal !== true || timeoutRunJob.result?.sandbox?.safetyLabel !== "sandbox-timeout" || timeoutRunJob.job?.runner?.timedOut !== true) {
    failures.push("timeout run job did not record terminal timeout diagnostics");
  }
  if (!hasV2SandboxIsolation(timeoutRunJob.job?.runner)) {
    failures.push("timeout run job missing v2 sandbox isolation diagnostics");
  }

  const queuedRunJob = await request("/api/run/jobs", {
    method: "POST",
    body: JSON.stringify({ language: "python", code: "print('cancel qa')", startMode: "manual" })
  });
  if (queuedRunJob.job?.status !== "queued" || queuedRunJob.job?.terminal !== false || queuedRunJob.job?.runner?.engine !== "sandbox-runner-v2") {
    failures.push("manual queued run job did not remain cancelable");
  }
  const canceledRunJob = await request(`/api/run/jobs/${queuedRunJob.job.id}/cancel`, { method: "POST", body: "{}" });
  if (canceledRunJob.job?.status !== "canceled" || canceledRunJob.job?.terminal !== true || canceledRunJob.result?.sandbox?.safetyLabel !== "sandbox-canceled") {
    failures.push("cancel endpoint did not persist canceled terminal job");
  }
  if (!hasV2SandboxIsolation(canceledRunJob.job?.runner)) {
    failures.push("canceled run job missing v2 sandbox isolation diagnostics");
  }

  const sandboxCertification = await request("/api/sandbox/certification");
  if (sandboxCertification.certified !== false ||
      sandboxCertification.status !== "readiness-only" ||
      sandboxCertification.locallyReady !== true ||
      sandboxCertification.evidenceCounts?.v2Jobs < 8 ||
      sandboxCertification.evidenceCounts?.escapeBlockedJobs < 4 ||
      sandboxCertification.localControls?.some((item) => item.status !== "proved-local")) {
    failures.push("sandbox certification readiness did not prove local controls while remaining uncertified");
  }

  const ai = await request("/api/ai/tutor/message", {
    method: "POST",
    body: JSON.stringify({ tutorRole: "reviewer", code: "print('qa')", message: "检查代码", ctFocus: ["验证优化"], simulatePrimaryLatencyMs: 250 })
  });
  if (!ai.message.includes("智伴导师") || ai.safetyLabel !== "ok") failures.push("AI tutor reply invalid");
  if (ai.modelRoute?.selectedModel !== "claude-sonnet-4-6" || ai.modelRoute?.fallbackUsed !== false || ai.modelRoute?.secretSafe !== true) {
    failures.push("AI primary route evidence invalid");
  }
  if (ai.providerAdapter?.request?.model !== "claude-sonnet-4-6" || ai.providerAdapter?.request?.secretEcho !== false) {
    failures.push("AI tutor reply missing sanitized provider adapter evidence");
  }

  const fallbackAi = await request("/api/ai/tutor/message", {
    method: "POST",
    body: JSON.stringify({ tutorRole: "turtle", code: "print('qa')", message: "fallback probe", simulatePrimaryLatencyMs: 1250 })
  });
  if (fallbackAi.modelRoute?.selectedModel !== "gpt-5.3-codex-spark" || fallbackAi.modelRoute?.fallbackUsed !== true || fallbackAi.modelRoute?.reason !== "primary-load-timeout") {
    failures.push("AI fallback route did not trigger after 1000ms");
  }

  const imageBrief = await request("/api/ai/image/brief", {
    method: "POST",
    body: JSON.stringify({ assetType: "mascot", prompt: "3D glass AI turtle tutor" })
  });
  if (imageBrief.modelRoute?.path !== "image" || imageBrief.modelRoute?.selectedModel !== "gpt-image-2" || imageBrief.modelRoute?.fallbackUsed !== false) {
    failures.push("image route did not stay isolated on gpt-image-2");
  }
  if (imageBrief.providerAdapter?.request?.path !== "/v1/images" || imageBrief.providerAdapter?.request?.model !== "gpt-image-2") {
    failures.push("image brief missing sanitized image provider adapter evidence");
  }

  const fakeTutorSecret = `sk-${"tutorSecretShouldRedact123456"}`;
  const fakeImageSecret = `sk-${"imageSecretShouldRedact123456"}`;
  const secretAi = await request("/api/ai/tutor/message", {
    method: "POST",
    body: JSON.stringify({
      tutorRole: "reviewer",
      code: `print(${JSON.stringify(fakeTutorSecret)})`,
      message: `redact this ${fakeTutorSecret}`,
      simulatePrimaryLatencyMs: 250
    })
  });
  const secretImageBrief = await request("/api/ai/image/brief", {
    method: "POST",
    body: JSON.stringify({ assetType: "secret-scan", prompt: `3D turtle without leaking ${fakeImageSecret}` })
  });
  const secretSurface = JSON.stringify({ secretAi, secretImageBrief });
  if (secretSurface.includes(fakeTutorSecret) || secretSurface.includes(fakeImageSecret) || secretImageBrief.promptSummary.includes(fakeImageSecret)) {
    failures.push("AI tutor/image responses leaked key-shaped student prompt content");
  }
  if (!secretImageBrief.promptSummary.includes("[REDACTED_SECRET]")) {
    failures.push("image prompt summary did not redact key-shaped prompt content");
  }

  const routeAudit = await request("/api/ai/route-audit");
  if (routeAudit.totals?.fallback < 1 || routeAudit.totals?.image < 2 || routeAudit.totals?.coding < 3) {
    failures.push("route audit totals missing primary/fallback/image evidence");
  }
  if (routeAudit.providerStatus?.provider !== "codex-model-gateway" || routeAudit.providerEvidenceCount < 5) {
    failures.push("route audit missing provider adapter evidence");
  }
  if (JSON.stringify({ ai, fallbackAi, imageBrief, secretAi, secretImageBrief, routeAudit }).includes("sk-")) {
    failures.push("AI route responses leaked a secret-looking token");
  }

  const collab = await request("/api/collab/events", {
    method: "POST",
    body: JSON.stringify({ sessionId: "pair-demo", actor: "qa", type: "review", message: "QA 协作事件" })
  });
  if (!collab.events.some((event) => event.message.includes("QA 协作事件"))) failures.push("collab event not persisted");

  const joinedRoom = await request("/api/collab/rooms/pair-demo/join", {
    method: "POST",
    headers: { "X-CodeX-Session": studentWorkLogin.sessionToken },
    body: JSON.stringify({ actor: "student-qa", name: "QA学生", role: "navigator" })
  });
  if (!joinedRoom.presence?.some((item) => item.actor === "student-qa") || !joinedRoom.replay?.length) {
    failures.push("collab room join did not update presence/replay");
  }

  const roomNote = await request("/api/collab/rooms/pair-demo/events", {
    method: "POST",
    headers: { "X-CodeX-Session": studentWorkLogin.sessionToken },
    body: JSON.stringify({ type: "cursor", actor: "student-qa", message: "QA cursor at line 4", payload: { line: 4 } })
  });
  if (!roomNote.event?.sequence || roomNote.event?.type !== "cursor") failures.push("collab room event missing sequence");

  const turn = await request("/api/collab/rooms/pair-demo/turn", {
    method: "POST",
    headers: { "X-CodeX-Session": teacherLogin.sessionToken },
    body: JSON.stringify({ driver: "student-qa", navigator: "student-linyi" })
  });
  if (turn.room?.turn?.driver !== "student-qa" || !turn.replay?.some((event) => event.type === "turn")) {
    failures.push("collab room turn switch did not persist");
  }

  const roomState = await request("/api/collab/rooms/pair-demo");
  if (!roomState.room?.presence?.length || !roomState.replay?.some((event) => event.message.includes("QA cursor"))) {
    failures.push("collab room replay did not include protocol events");
  }

  const ws = await connectWebSocket("/ws/collab/pair-demo");
  const wsSnapshot = await ws.next();
  if (wsSnapshot.type !== "snapshot" || !wsSnapshot.room?.id || !Array.isArray(wsSnapshot.replay)) {
    failures.push("websocket snapshot missing room/replay");
  }
  ws.send({ type: "join", actor: "ws-qa", name: "WS QA", role: "navigator" });
  const wsJoin = await ws.next();
  if (wsJoin.type !== "room:update" || wsJoin.action !== "join" || !wsJoin.presence?.some((item) => item.actor === "ws-qa")) {
    failures.push("websocket join did not broadcast presence");
  }
  ws.send({ type: "event", eventType: "cursor", actor: "ws-qa", message: "QA websocket cursor", payload: { line: 7 } });
  const wsEvent = await ws.next();
  if (wsEvent.type !== "room:update" || wsEvent.action !== "event" || wsEvent.event?.message !== "QA websocket cursor") {
    failures.push("websocket event did not broadcast event payload");
  }
  ws.send({ type: "turn", actor: "ws-qa", driver: "ws-qa", navigator: "student-linyi" });
  const wsTurn = await ws.next();
  if (wsTurn.type !== "room:update" || wsTurn.action !== "turn" || wsTurn.room?.turn?.driver !== "ws-qa") {
    failures.push("websocket turn did not broadcast turn state");
  }
  ws.close();

  const wsRoomState = await request("/api/collab/rooms/pair-demo");
  if (!wsRoomState.replay?.some((event) => event.message === "QA websocket cursor") || wsRoomState.room?.turn?.driver !== "ws-qa") {
    failures.push("websocket protocol did not persist to room replay");
  }

  const forbiddenReview = await requestFailure("/api/teacher/submissions/sub-seed-linyi/review", {
    method: "POST",
    body: JSON.stringify({ score: 90, status: "reviewed", feedback: "should fail" })
  });
  if (forbiddenReview.status !== 403) failures.push("unauthorized teacher review did not return 403");

  const submitted = await request("/api/submissions", {
    method: "POST",
    headers: { "X-CodeX-Session": studentWorkLogin.sessionToken },
    body: JSON.stringify({
      assignmentId: assignmentData.assignment.id,
      studentId: "student-qa",
      studentName: "QA学生",
      projectId: "current",
      versionId: versionData.version.id,
      language: "python",
      code: "print('qa')",
      selfCheck: { runs: 2, savedVersion: true, explanationReady: true, aiReviewed: true }
    })
  });
  if (!submitted.submission?.id || submitted.submission.status !== "submitted") {
    failures.push("submission did not persist");
  }

  const reviewed = await request(`/api/teacher/submissions/${submitted.submission.id}/review`, {
    method: "POST",
    headers: { "X-CodeX-Session": teacherLogin.sessionToken },
    body: JSON.stringify({ score: 93, status: "reviewed", feedback: "QA批阅通过" })
  });
  if (reviewed.submission?.status !== "reviewed" || reviewed.submission?.score !== 93) {
    failures.push("teacher review did not persist");
  }

  const teacher = await request("/api/teacher/classes/demo/dashboard");
  if (!teacher.projects?.length || !teacher.ctDimensions) failures.push("teacher dashboard missing analytics");
  if (!teacher.submissions?.some((item) => item.id === submitted.submission.id && item.status === "reviewed")) {
    failures.push("teacher dashboard missing reviewed submission");
  }

  const report = await request("/api/reports/export", { method: "POST", body: "{}" });
  if (!report.className || report.runCount < 1 || report.collabEventCount < 1 || report.collabRoomCount < 1 || report.submissionCount < 1 || report.reviewedSubmissionCount < 1) {
    failures.push("report export missing expected counts");
  }
  if (report.runJobCount < 8 || report.terminalRunJobCount < 8 || report.rejectedRunJobCount < 4) {
    failures.push("report export missing sandbox job terminal evidence counts");
  }
  if (report.timeoutRunJobCount < 1 || report.canceledRunJobCount < 1 || report.runnerBoundaryCount < 8 || report.sandboxIsolationCount < 8 || report.sandboxEscapeBlockedCount < 4) {
    failures.push("report export missing runner boundary timeout/cancel counts");
  }
  if (report.sandboxCertificationStatus !== "readiness-only" ||
      report.sandboxCertified !== false ||
      report.sandboxLocallyReadyForCertification !== true ||
      report.sandboxMissingCertificationControlCount < 8 ||
      report.sandboxCertificationEvidenceCounts?.escapeBlockedJobs < 4) {
    failures.push("report export missing sandbox certification readiness evidence");
  }
  if (report.modelRouteCount < 5 || report.fallbackRouteCount < 1 || report.imageRouteCount < 2) {
    failures.push("report export missing model route evidence counts");
  }
  if (report.providerMode !== "local-simulated" || report.providerConfigured !== false || report.providerLiveEnabled !== false || report.providerEvidenceCount < 5) {
    failures.push("report export missing provider adapter evidence counts");
  }
  if (JSON.stringify(report).includes(fakeTutorSecret) || JSON.stringify(report).includes(fakeImageSecret)) {
    failures.push("report export leaked key-shaped student prompt content");
  }
  if (report.providerLiveGuardCount < 1 || report.providerLiveBlockedCount < 1 || report.providerOutboundCallCount !== 0) {
    failures.push("report export missing live provider guard blocked evidence");
  }
  if (report.providerCertificationStatus !== "readiness-only" ||
      report.providerCertified !== false ||
      report.providerMissingCertificationControlCount < 8 ||
      report.providerCertificationEvidenceCounts?.blockedGuards < 1) {
    failures.push("report export missing provider certification readiness evidence");
  }
  if (report.userCount < 3 || report.activeSessionCount < 3 || report.revokedSessionCount < 1 || report.authEventCount < 5 || report.authFailureCount < 1) {
    failures.push("report export missing auth persistence/audit counts");
  }
  if (report.repositoryEngine !== "json-repository-v1" || report.repositoryWriteCount < 1 || report.repositoryBackupPath !== "data/backups/mock-db.latest.json" || report.repositoryBackupExists !== true) {
    failures.push("report export missing repository evidence counts");
  }
  if (report.databaseCertificationStatus !== "readiness-only" ||
      report.databaseCertified !== false ||
      report.databaseMissingCertificationControlCount < 10 ||
      report.databaseCertificationEvidenceCounts?.provedLocalControlCount < 4) {
    failures.push("report export missing database certification readiness evidence");
  }
  if (!["pass-with-open-certification-gaps", "needs-evidence"].includes(report.deliveryOverviewStatus) ||
      report.deliveryFinalGoalComplete !== false ||
      report.deliveryOpenCertificationGapCount !== 3 ||
      report.deliveryReadinessSurfaceCount !== 3) {
    failures.push("report export missing delivery certification overview fields");
  }
  if (report.t3PreflightStatus !== "preflight-only" ||
      report.t3PreflightApprovedPhaseReady !== false ||
      report.t3PreflightLaneCount !== 3 ||
      report.t3PreflightReadyLaneCount !== 0 ||
      report.t3PreflightGlobalBlockerCount < 1) {
    failures.push("report export missing T3 preflight summary fields");
  }
  if (report.t3PackageStatus !== "package-only" ||
      report.t3PackageExecutionAllowed !== false ||
      report.t3PackageLaneCount !== 3 ||
      report.t3PackageBlockedLaneCount !== 3 ||
      report.t3PackageRollbackPlanCount < 3 ||
      report.t3PackageEvidenceRequirementCount < 9) {
    failures.push("report export missing T3 package summary fields");
  }
  if (report.t3EvidenceStatus !== "candidate-only" ||
      report.t3EvidenceCandidateCount !== 1 ||
      report.t3EvidenceAcceptedCandidateCount !== 1 ||
      report.t3EvidenceCertificationStateChanged !== false) {
    failures.push("report export missing T3 evidence intake fields");
  }
  if (report.handoffDossierStatus !== "handoff-ready-with-open-certification-gaps" ||
      report.handoffDossierFinalGoalComplete !== false ||
      report.handoffDossierArtifactCount < 8 ||
      report.handoffDossierOpenGapCount !== 3 ||
      report.handoffDossierLocalRequirementCount < 15 ||
      report.handoffDossierAgenticProvedCheckCount < 36 ||
      report.handoffDossierT3EvidenceCandidateCount !== 1) {
    failures.push("report export missing delivery handoff dossier fields");
  }
  if (report.deliveryArtifactIndexStatus !== "artifact-index-ready-with-open-certification-gaps" ||
      report.deliveryArtifactIndexArtifactCount < 17 ||
      report.deliveryArtifactIndexReadyArtifactCount !== report.deliveryArtifactIndexArtifactCount ||
      report.deliveryArtifactIndexMissingArtifactCount !== 0 ||
      report.deliveryArtifactIndexHashCount !== report.deliveryArtifactIndexArtifactCount ||
      report.deliveryArtifactIndexContentReturned !== false ||
      report.deliveryArtifactIndexFinalGoalComplete !== false) {
    failures.push("report export missing delivery artifact index fields");
  }
  if (report.agenticQaReplayStatus !== "agentic-qa-replay-ready-open-t3" ||
      report.agenticQaReplayOnly !== true ||
      report.agenticQaReplayAgentCount < 4 ||
      report.agenticQaReplayClickRoundCount < 3 ||
      report.agenticQaReplayProvedCheckCount < 53 ||
      report.agenticQaReplayOpenProductGapCount !== 3 ||
      report.agenticQaReplayFinalValueWaitsPassed !== true ||
      report.agenticQaReplayScreenshotHashCount < 5 ||
      report.agenticQaReplayFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.agenticQaReplayHash || "")) {
    failures.push("report export missing agentic QA replay fields");
  }
  if (report.visualStoryboardStatus !== "visual-storyboard-ready-open-t3" ||
      report.visualStoryboardOnly !== true ||
      report.visualStoryboardSurfaceCount < 5 ||
      report.visualStoryboardReadySurfaceCount !== report.visualStoryboardSurfaceCount ||
      report.visualStoryboardReplayRoundCount < 3 ||
      report.visualStoryboardScreenshotHashCount < 5 ||
      report.visualStoryboardChecksPassed !== true ||
      report.visualStoryboardFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.visualStoryboardHash || "")) {
    failures.push("report export missing visual QA storyboard fields");
  }
  if (report.t3ApprovalPacketStatus !== "approval-packet-ready" ||
      report.t3ApprovalPacketExecutionAllowed !== false ||
      report.t3ApprovalPacketLaneCount !== 3 ||
      report.t3ApprovalPacketApprovedLaneCount !== 0 ||
      report.t3ApprovalPacketBlockedLaneCount !== 3 ||
      report.t3ApprovalPacketEvidenceRequirementCount < 18 ||
      report.t3ApprovalPacketRollbackStepCount < 9 ||
      report.t3ApprovalPacketFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval packet fields");
  }
  if (report.t3DryRunRehearsalStatus !== "rehearsal-ready-with-open-t3-gaps" ||
      report.t3DryRunRehearsalOnly !== true ||
      report.t3DryRunExternalActionsExecuted !== false ||
      report.t3DryRunCertificationStateChanged !== false ||
      report.t3DryRunExecutionAllowed !== false ||
      report.t3DryRunLaneCount !== 3 ||
      report.t3DryRunReadyLaneCount !== 3 ||
      report.t3DryRunBlockedLaneCount !== 3 ||
      report.t3DryRunCheckCount < 24 ||
      report.t3DryRunFailedCheckCount !== 0 ||
      report.t3DryRunFinalGoalComplete !== false) {
    failures.push("report export missing T3 dry-run rehearsal fields");
  }
  if (report.t3ApprovalRequestExportStatus !== "approval-request-export-ready" ||
      report.t3ApprovalRequestExportOnly !== true ||
      report.t3ApprovalRequestExternalActionsExecuted !== false ||
      report.t3ApprovalRequestCertificationStateChanged !== false ||
      report.t3ApprovalRequestExecutionAllowed !== false ||
      report.t3ApprovalRequestCount !== 3 ||
      report.t3ApprovalRequestReadyCount !== 3 ||
      report.t3ApprovalRequestFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval request export fields");
  }
  if (report.t3ApprovalIntegrityStatus !== "approval-integrity-ready" ||
      report.t3ApprovalIntegrityHashOnly !== true ||
      report.t3ApprovalIntegrityContentReturned !== false ||
      report.t3ApprovalIntegrityArtifactCount < 8 ||
      report.t3ApprovalIntegrityReadyArtifactCount !== report.t3ApprovalIntegrityArtifactCount ||
      report.t3ApprovalIntegrityMissingArtifactCount !== 0 ||
      report.t3ApprovalIntegrityHashCount !== report.t3ApprovalIntegrityArtifactCount ||
      report.t3ApprovalIntegritySecretExposure !== false ||
      report.t3ApprovalIntegrityFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval integrity fields");
  }
  if (report.t3ApprovalLockStatus !== "approval-lock-ready-with-open-t3-gaps" ||
      report.t3ApprovalLockOnly !== true ||
      report.t3ApprovalLockApproved !== false ||
      report.t3ApprovalLockExecutionAllowed !== false ||
      report.t3ApprovalLockLaneCount !== 3 ||
      report.t3ApprovalLockOpenGapCount !== 3 ||
      report.t3ApprovalLockFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalLockHash || "")) {
    failures.push("report export missing T3 approval lock fields");
  }
  if (report.t3ApprovalVerifierStatus !== "approval-verifier-ready-execution-blocked" ||
      report.t3ApprovalVerifierOnly !== true ||
      report.t3ApprovalVerifierPassed !== false ||
      report.t3ApprovalVerifierExecutionAllowed !== false ||
      report.t3ApprovalVerifierLaneCount !== 3 ||
      report.t3ApprovalVerifierReadyLaneCount !== 3 ||
      report.t3ApprovalVerifierFinalGoalComplete !== false) {
    failures.push("report export missing T3 approval verifier fields");
  }
  if (report.t3ApprovalCandidatesStatus !== "approval-candidates-ready-execution-blocked" ||
      report.t3ApprovalCandidatesOnly !== true ||
      report.t3ApprovalCandidateCount !== 3 ||
      report.t3ApprovalCandidateVerifierPassCount !== 3 ||
      report.t3ApprovalCandidatesExecutionAllowed !== false ||
      report.t3ApprovalCandidatesFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalCandidatesHash || "")) {
    failures.push("report export missing T3 approval candidates fields");
  }
  if (report.t3ApprovalExecutionGateStatus !== "approval-execution-gate-ready-execution-blocked" ||
      report.t3ApprovalExecutionGateOnly !== true ||
      report.t3ApprovalExecutionGateLaneCount !== 3 ||
      report.t3ApprovalExecutionGateReadyLaneCount !== 3 ||
      report.t3ApprovalExecutionGateBoundCandidateCount !== 0 ||
      report.t3ApprovalExecutionGateExecutionAllowed !== false ||
      report.t3ApprovalExecutionGateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3ApprovalExecutionGateHash || "")) {
    failures.push("report export missing T3 approval execution gate fields");
  }
  if (report.t3CertificationEvidenceClosureStatus !== "certification-evidence-closure-ready-execution-blocked" ||
      report.t3CertificationEvidenceClosureOnly !== true ||
      report.t3CertificationEvidenceClosureLaneCount !== 3 ||
      report.t3CertificationEvidenceClosureReadyLaneCount !== 3 ||
      report.t3CertificationEvidenceClosureSubmittedBundleCount !== 0 ||
      report.t3CertificationEvidenceClosureValidatedBundleCount !== 0 ||
      report.t3CertificationEvidenceClosureExecutionAllowed !== false ||
      report.t3CertificationEvidenceClosureFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3CertificationEvidenceClosureHash || "")) {
    failures.push("report export missing T3 certification evidence closure fields");
  }
  if (report.finalDeliveryReadinessStatus !== "final-readiness-local-evidence-ready-open-t3" ||
      report.finalDeliveryReadinessLocalEvidencePassed !== true ||
      report.finalDeliveryReadinessArtifactIntegrityPassed !== true ||
      report.finalDeliveryReadinessObjectiveTraceable !== true ||
      report.finalDeliveryReadinessAgenticPassed !== true ||
      report.finalDeliveryReadinessOpenT3GapCount !== 3 ||
      report.finalDeliveryReadinessBlockedByT3 !== true ||
      report.finalDeliveryReadinessFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalDeliveryReadinessHash || "")) {
    failures.push("report export missing final delivery readiness fields");
  }
  if (report.releaseCandidateStatus !== "release-candidate-local-evidence-ready-open-t3" ||
      report.releaseCandidateOnly !== true ||
      report.releaseCandidateReadyForHumanReview !== true ||
      report.releaseCandidateReadyForProductionRelease !== false ||
      report.releaseCandidateLocalEvidenceReady !== true ||
      report.releaseCandidateOpenT3GapCount !== 3 ||
      report.releaseCandidateCheckCount < 6 ||
      report.releaseCandidateReadyCheckCount < 5 ||
      report.releaseCandidateBlockedCheckCount !== 1 ||
      report.releaseCandidateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.releaseCandidateHash || "")) {
    failures.push("report export missing delivery release candidate fields");
  }
  if (report.t3CertificationNextActionsStatus !== "t3-certification-next-actions-ready-execution-blocked" ||
      report.t3CertificationNextActionsOnly !== true ||
      report.t3CertificationNextActionsReadyForHumanReview !== true ||
      report.t3CertificationNextActionsReadyForProductionRelease !== false ||
      report.t3CertificationNextActionsExecutionAllowed !== false ||
      report.t3CertificationNextActionsOpenT3GapCount !== 3 ||
      report.t3CertificationNextActionsLaneCount !== 3 ||
      report.t3CertificationNextActionsReadyLaneCount !== 3 ||
      report.t3CertificationNextActionsEvidenceRequirementCount < 15 ||
      report.t3CertificationNextActionsRollbackRequirementCount < 9 ||
      report.t3CertificationNextActionsFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3CertificationNextActionsHash || "")) {
    failures.push("report export missing T3 certification next-actions fields");
  }
  if (report.t3SingleLaneRunPacketStatus !== "t3-single-lane-run-packets-ready-execution-blocked" ||
      report.t3SingleLaneRunPacketOnly !== true ||
      report.t3SingleLaneRunPacketReadyForHumanReview !== true ||
      report.t3SingleLaneRunPacketReadyForProductionRelease !== false ||
      report.t3SingleLaneRunPacketExecutionAllowed !== false ||
      report.t3SingleLaneRunPacketOpenT3GapCount !== 3 ||
      report.t3SingleLaneRunPacketCount !== 3 ||
      report.t3SingleLaneRunPacketReadyCount !== 3 ||
      report.t3SingleLaneRunPacketEvidenceRequirementCount < 15 ||
      report.t3SingleLaneRunPacketRollbackRequirementCount < 9 ||
      report.t3SingleLaneRunPacketFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3SingleLaneRunPacketHash || "")) {
    failures.push("report export missing T3 single-lane run-packet fields");
  }
  if (report.t3RunPacketVerifierStatus !== "t3-run-packet-verifier-ready-execution-blocked" ||
      report.t3RunPacketVerifierOnly !== true ||
      report.t3RunPacketVerifierPassed !== false ||
      report.t3RunPacketVerifierPacketCount !== 3 ||
      report.t3RunPacketVerifierReadyPacketCount !== 3 ||
      report.t3RunPacketVerifierSubmittedPacketCount !== 0 ||
      report.t3RunPacketVerifierVerifiedPacketCount !== 0 ||
      report.t3RunPacketVerifierExecutionAllowed !== false ||
      report.t3RunPacketVerifierFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3RunPacketVerifierHash || "")) {
    failures.push("report export missing T3 run-packet verifier fields");
  }
  if (report.deliveryReviewerCockpitStatus !== "reviewer-cockpit-ready-open-t3" ||
      report.deliveryReviewerCockpitOnly !== true ||
      report.deliveryReviewerCockpitReadyForHumanReview !== true ||
      report.deliveryReviewerCockpitReadyForProductionRelease !== false ||
      report.deliveryReviewerCockpitSectionCount !== 8 ||
      report.deliveryReviewerCockpitReadySectionCount !== 7 ||
      report.deliveryReviewerCockpitBlockedSectionCount !== 1 ||
      report.deliveryReviewerCockpitOpenT3GapCount !== 3 ||
      report.deliveryReviewerCockpitContentReturned !== false ||
      report.deliveryReviewerCockpitFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryReviewerCockpitHash || "")) {
    failures.push("report export missing delivery reviewer cockpit fields");
  }
  if (report.deliveryLaunchGuideStatus !== "delivery-launch-guide-ready-open-t3" ||
      report.deliveryLaunchGuideOnly !== true ||
      report.deliveryLaunchGuideReadyForLocalReview !== true ||
      report.deliveryLaunchGuideReadyForProductionRelease !== false ||
      report.deliveryLaunchGuideCommandCount < 7 ||
      report.deliveryLaunchGuideRouteCount < 5 ||
      report.deliveryLaunchGuideOpenT3GapCount !== 3 ||
      report.deliveryLaunchGuideContentReturned !== false ||
      report.deliveryLaunchGuideFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryLaunchGuideHash || "")) {
    failures.push("report export missing delivery launch guide fields");
  }
  if (report.deliveryConsistencySentinelStatus !== "delivery-consistency-sentinel-ready-open-t3" ||
      report.deliveryConsistencySentinelOnly !== true ||
      report.deliveryConsistencySentinelPassed !== true ||
      report.deliveryConsistencySentinelSurfaceCount < 7 ||
      report.deliveryConsistencySentinelInvariantCount < 7 ||
      report.deliveryConsistencySentinelContradictionCount !== 0 ||
      report.deliveryConsistencySentinelOpenT3GapCount !== 3 ||
      report.deliveryConsistencySentinelContentReturned !== false ||
      report.deliveryConsistencySentinelFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryConsistencySentinelHash || "")) {
    failures.push("report export missing delivery consistency sentinel fields");
  }
  if (report.finalAcceptanceMatrixStatus !== "final-acceptance-matrix-ready-open-t3" ||
      report.finalAcceptanceMatrixOnly !== true ||
      report.finalAcceptanceMatrixLocalPassed !== true ||
      report.finalAcceptanceMatrixRowCount < 13 ||
      report.finalAcceptanceMatrixProvedRowCount < 10 ||
      report.finalAcceptanceMatrixBlockedRowCount !== 3 ||
      report.finalAcceptanceMatrixOpenT3GapCount !== 3 ||
      report.finalAcceptanceMatrixContentReturned !== false ||
      report.finalAcceptanceMatrixFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalAcceptanceMatrixHash || "")) {
    failures.push("report export missing final acceptance matrix fields");
  }
  if (report.certificationBlockerBoardStatus !== "certification-blocker-board-ready-open-t3" ||
      report.certificationBlockerBoardOnly !== true ||
      report.certificationBlockerBoardLocalPassed !== true ||
      report.certificationBlockerBoardBlockerCount !== 3 ||
      report.certificationBlockerBoardReadyBlockerCount !== 3 ||
      report.certificationBlockerBoardClosedBlockerCount !== 0 ||
      report.certificationBlockerBoardOpenT3GapCount !== 3 ||
      report.certificationBlockerBoardContentReturned !== false ||
      report.certificationBlockerBoardFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.certificationBlockerBoardHash || "")) {
    failures.push("report export missing certification blocker board fields");
  }
  if (report.userAcceptanceRehearsalStatus !== "user-acceptance-rehearsal-ready-open-t3" ||
      report.userAcceptanceRehearsalOnly !== true ||
      report.userAcceptanceRehearsalLocalPassed !== true ||
      report.userAcceptanceRehearsalReadyForHumanReview !== true ||
      report.userAcceptanceRehearsalReadyForProductionRelease !== false ||
      report.userAcceptanceRehearsalRehearsalCount !== 3 ||
      report.userAcceptanceRehearsalReadyRehearsalCount !== 3 ||
      report.userAcceptanceRehearsalBlockedRehearsalCount !== 0 ||
      report.userAcceptanceRehearsalOpenT3GapCount !== 3 ||
      report.userAcceptanceRehearsalContentReturned !== false ||
      report.userAcceptanceRehearsalFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.userAcceptanceRehearsalHash || "")) {
    failures.push("report export missing user acceptance rehearsal fields");
  }
  if (report.deliveryEvidenceNavigatorStatus !== "delivery-evidence-navigator-ready-open-t3" ||
      report.deliveryEvidenceNavigatorOnly !== true ||
      report.deliveryEvidenceNavigatorLocalPassed !== true ||
      report.deliveryEvidenceNavigatorReadyForHumanReview !== true ||
      report.deliveryEvidenceNavigatorReadyForProductionRelease !== false ||
      report.deliveryEvidenceNavigatorSectionCount !== 5 ||
      report.deliveryEvidenceNavigatorReadySectionCount !== 5 ||
      report.deliveryEvidenceNavigatorBlockedSectionCount !== 0 ||
      report.deliveryEvidenceNavigatorOpenT3GapCount !== 3 ||
      report.deliveryEvidenceNavigatorContentReturned !== false ||
      report.deliveryEvidenceNavigatorFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.deliveryEvidenceNavigatorHash || "")) {
    failures.push("report export missing delivery evidence navigator fields");
  }
  if (report.localDeliverySummaryStatus !== "local-delivery-summary-ready-open-t3" ||
      report.localDeliverySummaryOnly !== true ||
      report.localDeliverySummaryLocalPassed !== true ||
      report.localDeliverySummaryReadyForHumanDelivery !== true ||
      report.localDeliverySummaryReadyForProductionRelease !== false ||
      report.localDeliverySummarySectionCount !== 6 ||
      report.localDeliverySummaryReadySectionCount !== 6 ||
      report.localDeliverySummaryBlockedSectionCount !== 0 ||
      report.localDeliverySummaryLocalRequirementCount < 45 ||
      report.localDeliverySummaryProvedCheckCount < 66 ||
      report.localDeliverySummaryOpenT3GapCount !== 3 ||
      report.localDeliverySummaryContentReturned !== false ||
      report.localDeliverySummaryFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliverySummaryHash || "")) {
    failures.push("report export missing local delivery summary packet fields");
  }
  if (report.localDeliveryHandoffBriefStatus !== "local-delivery-handoff-brief-ready-open-t3" ||
      report.localDeliveryHandoffBriefOnly !== true ||
      report.localDeliveryHandoffBriefLocalPassed !== true ||
      report.localDeliveryHandoffBriefReadyForUserReview !== true ||
      report.localDeliveryHandoffBriefReadyForProductionRelease !== false ||
      report.localDeliveryHandoffBriefSectionCount !== 6 ||
      report.localDeliveryHandoffBriefReadySectionCount !== 6 ||
      report.localDeliveryHandoffBriefBlockedSectionCount !== 0 ||
      report.localDeliveryHandoffBriefLocalCommandCount < 5 ||
      report.localDeliveryHandoffBriefLocalRequirementCount < 46 ||
      report.localDeliveryHandoffBriefProvedCheckCount < 67 ||
      report.localDeliveryHandoffBriefOpenT3GapCount !== 3 ||
      report.localDeliveryHandoffBriefContentReturned !== false ||
      report.localDeliveryHandoffBriefFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryHandoffBriefHash || "")) {
    failures.push("report export missing local delivery handoff brief fields");
  }
  if (report.localDeliveryQuickstartStatus !== "local-delivery-quickstart-ready-open-t3" ||
      report.localDeliveryQuickstartOnly !== true ||
      report.localDeliveryQuickstartLocalPassed !== true ||
      report.localDeliveryQuickstartReadyForLocalRunbookReview !== true ||
      report.localDeliveryQuickstartReadyForProductionRelease !== false ||
      report.localDeliveryQuickstartStepCount !== 7 ||
      report.localDeliveryQuickstartReadyStepCount !== 7 ||
      report.localDeliveryQuickstartBlockedStepCount !== 0 ||
      report.localDeliveryQuickstartLocalCommandCount < 8 ||
      report.localDeliveryQuickstartLocalRouteCount < 6 ||
      report.localDeliveryQuickstartLocalRequirementCount < 47 ||
      report.localDeliveryQuickstartProvedCheckCount < 68 ||
      report.localDeliveryQuickstartOpenT3GapCount !== 3 ||
      report.localDeliveryQuickstartContentReturned !== false ||
      report.localDeliveryQuickstartFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryQuickstartHash || "")) {
    failures.push("report export missing local delivery quickstart bundle fields");
  }
  if (report.localDeliveryVerificationSuiteStatus !== "local-delivery-verification-suite-ready-open-t3" ||
      report.localDeliveryVerificationSuiteOnly !== true ||
      report.localDeliveryVerificationSuiteLocalPassed !== true ||
      report.localDeliveryVerificationSuiteReadyForLocalVerificationReview !== true ||
      report.localDeliveryVerificationSuiteReadyForProductionRelease !== false ||
      report.localDeliveryVerificationSuiteCheckCount !== 10 ||
      report.localDeliveryVerificationSuiteReadyCheckCount !== 10 ||
      report.localDeliveryVerificationSuiteBlockedCheckCount !== 0 ||
      report.localDeliveryVerificationSuiteLocalCommandCount !== 10 ||
      report.localDeliveryVerificationSuiteEvidenceFileCount < 12 ||
      report.localDeliveryVerificationSuiteLocalRequirementCount < 48 ||
      report.localDeliveryVerificationSuiteProvedCheckCount < 69 ||
      report.localDeliveryVerificationSuiteOpenT3GapCount !== 3 ||
      report.localDeliveryVerificationSuiteContentReturned !== false ||
      report.localDeliveryVerificationSuiteFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.localDeliveryVerificationSuiteHash || "")) {
    failures.push("report export missing local delivery verification suite fields");
  }
  if (report.finalLocalHandoffCheckpointStatus !== "final-local-handoff-checkpoint-ready-open-t3" ||
      report.finalLocalHandoffCheckpointOnly !== true ||
      report.finalLocalHandoffCheckpointLocalPassed !== true ||
      report.finalLocalHandoffCheckpointReadyForFinalLocalReview !== true ||
      report.finalLocalHandoffCheckpointReadyForProductionRelease !== false ||
      report.finalLocalHandoffCheckpointStepCount !== 8 ||
      report.finalLocalHandoffCheckpointReadyStepCount !== 8 ||
      report.finalLocalHandoffCheckpointBlockedStepCount !== 0 ||
      report.finalLocalHandoffCheckpointLocalCommandCount !== 8 ||
      report.finalLocalHandoffCheckpointArtifactCount < 13 ||
      report.finalLocalHandoffCheckpointLocalRequirementCount < 49 ||
      report.finalLocalHandoffCheckpointProvedCheckCount < 70 ||
      report.finalLocalHandoffCheckpointOpenT3GapCount !== 3 ||
      report.finalLocalHandoffCheckpointContentReturned !== false ||
      report.finalLocalHandoffCheckpointFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.finalLocalHandoffCheckpointHash || "")) {
    failures.push("report export missing final local handoff checkpoint fields");
  }
  if (report.t3EvidenceBundleTemplateStatus !== "evidence-bundle-templates-ready-execution-blocked" ||
      report.t3EvidenceBundleTemplateOnly !== true ||
      report.t3EvidenceBundleTemplateLaneCount !== 3 ||
      report.t3EvidenceBundleTemplateReadyLaneCount !== 3 ||
      report.t3EvidenceBundleTemplateEvidenceItemCount < 15 ||
      report.t3EvidenceBundleTemplateRollbackResultCount < 9 ||
      report.t3EvidenceBundleTemplateExecutionAllowed !== false ||
      report.t3EvidenceBundleTemplateFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3EvidenceBundleTemplateHash || "")) {
    failures.push("report export missing T3 evidence bundle template fields");
  }

  if (report.t3OperatorChecklistStatus !== "t3-operator-checklist-ready-execution-blocked" ||
      report.t3OperatorChecklistOnly !== true ||
      report.t3OperatorChecklistLaneCount !== 3 ||
      report.t3OperatorChecklistReadyLaneCount !== 3 ||
      report.t3OperatorChecklistManualStepCount < 15 ||
      report.t3OperatorChecklistEvidenceItemCount < 15 ||
      report.t3OperatorChecklistRollbackItemCount < 9 ||
      report.t3OperatorChecklistExecutionAllowed !== false ||
      report.t3OperatorChecklistFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3OperatorChecklistHash || "")) {
    failures.push("report export missing T3 operator checklist fields");
  }

  if (report.t3OperatorTranscriptValidatorStatus !== "t3-operator-transcript-validator-ready-execution-blocked" ||
      report.t3OperatorTranscriptValidatorOnly !== true ||
      report.t3OperatorTranscriptValidatorLaneCount !== 3 ||
      report.t3OperatorTranscriptValidatorReadyLaneCount !== 3 ||
      report.t3OperatorTranscriptValidatorSubmittedTranscriptCount !== 0 ||
      report.t3OperatorTranscriptValidatorValidatedTranscriptCount !== 0 ||
      report.t3OperatorTranscriptValidatorExecutionAllowed !== false ||
      report.t3OperatorTranscriptValidatorFinalGoalComplete !== false ||
      !/^[a-f0-9]{64}$/.test(report.t3OperatorTranscriptValidatorHash || "")) {
    failures.push("report export missing T3 operator transcript validator fields");
  }

  const appShell = await fetch(`${base}/index.html`).then((res) => res.text());
  if (!appShell.includes("CodeX / AI小海龟")) failures.push("static app shell missing product title");
} catch (error) {
  failures.push(error.message);
} finally {
  server.kill();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Fullstack API QA passed: health, reset, auth, model runtime routing, provider/sandbox/database certification readiness, delivery overview, T3 preflight/package/evidence, handoff dossier, artifact index, agentic QA replay, visual QA storyboard, delivery release candidate, T3 certification next actions, T3 single-lane run packets, T3 run-packet verifier, delivery reviewer cockpit, delivery launch guide, delivery consistency sentinel, final acceptance matrix, certification blocker board, user acceptance rehearsal, delivery evidence navigator, local delivery summary packet, objective traceability, T3 approval packet, T3 dry-run rehearsal, T3 approval request export, T3 approval integrity, T3 approval lock, T3 approval verifier, T3 approval candidates, T3 approval execution gate, T3 certification evidence closure, final delivery readiness, T3 evidence bundle templates, T3 operator checklist, T3 operator transcript validator, bootstrap, assignment, version, run, AI, image route, route audit, collaboration room protocol, WebSocket realtime transport, submission, review, teacher dashboard, report export, static shell.");

function buildRunPacketCandidate(bundle, packet) {
  return {
    packetId: packet.packetId,
    laneId: packet.laneId,
    targetGap: packet.targetGap,
    runPacketBundleHash: bundle.runPacketBundleHash,
    packetHash: packet.packetHash,
    sourceHashes: packet.sourceHashes,
    evidenceIds: packet.evidenceIds,
    rollbackIds: packet.rollbackIds,
    singleLaneOnly: true,
    approvalRecorded: false,
    approved: false,
    executionAllowed: false,
    externalActionsExecuted: false,
    certificationStateChanged: false,
    finalGoalComplete: false,
    contentReturned: false
  };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
