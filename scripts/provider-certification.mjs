import { modelProviderStatus } from "./model-provider.mjs";

export const PROVIDER_CERTIFICATION_STATUS = "readiness-only";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function providerCertificationReadiness(contracts = {}, aiMessages = [], env = process.env) {
  const messages = Array.isArray(aiMessages) ? aiMessages : [];
  const status = modelProviderStatus(contracts, env);
  const liveGuards = messages.map((item) => item.reply?.liveGuard).filter(Boolean);
  const blockedGuards = liveGuards.filter((guard) => guard.allowed === false);
  const liveTransports = messages.map((item) => item.reply?.liveTransport).filter(Boolean);
  const successfulLoopbackTransports = liveTransports.filter((item) =>
    item.outboundCall === true &&
    item.ok === true &&
    item.secretEcho === false &&
    loopbackHosts.has(item.providerHost)
  );
  const codingTransport = successfulLoopbackTransports.some((item) => item.providerPath === "/v1/responses");
  const imageTransport = successfulLoopbackTransports.some((item) => item.providerPath === "/v1/images");
  const providerEvidence = messages.map((item) => item.reply?.providerAdapter).filter(Boolean);
  const redactedRequests = messages.map((item) => item.request).filter(Boolean);
  const modelRoutes = messages.map((item) => item.reply?.modelRoute).filter(Boolean);
  const fallbackRoute = modelRoutes.some((route) => route.selectedModel === contracts.coding?.fallbackModel && route.fallbackUsed === true);
  const imageRoute = modelRoutes.some((route) => route.selectedModel === contracts.image?.model && route.path === "image");
  const noSecretEcho = [...liveTransports, ...providerEvidence].every((item) => item.secretEcho !== true && item.request?.secretEcho !== true);
  const localControls = [
    control("model-routing", contracts.coding?.primaryModel === "claude-sonnet-4-6" && contracts.coding?.fallbackModel === "gpt-5.3-codex-spark" && contracts.coding?.fallbackAfterMs === 1000, `primary=${contracts.coding?.primaryModel}, fallback=${contracts.coding?.fallbackModel}, threshold=${contracts.coding?.fallbackAfterMs}`),
    control("image-route-separation", contracts.image?.model === "gpt-image-2" && (imageRoute || imageTransport), `image=${contracts.image?.model}, imageRoute=${imageRoute}, imageTransport=${imageTransport}`),
    control("live-call-guard", blockedGuards.length > 0, `blockedGuards=${blockedGuards.length}`),
    control("payload-redaction", redactedRequests.some((item) => item.redactedPayload || item.redactedTextPreview) || messages.some((item) => item.reply?.liveGuard), `redactedRequests=${redactedRequests.length}`),
    control("localhost-mock-transport", codingTransport && imageTransport, `codingTransport=${codingTransport}, imageTransport=${imageTransport}`),
    control("secret-non-echo", noSecretEcho, `secretEcho=false surfaces=${liveTransports.length + providerEvidence.length}`),
    control("route-audit", modelRoutes.length > 0 && providerEvidence.length > 0, `modelRoutes=${modelRoutes.length}, providerEvidence=${providerEvidence.length}`),
    control("fallback-route-evidence", fallbackRoute || successfulLoopbackTransports.some((item) => item.selectedModel === contracts.coding?.fallbackModel), `fallbackRoute=${fallbackRoute}`),
    control("report-export-ready", successfulLoopbackTransports.length >= 2 || providerEvidence.length > 0, `loopbackTransports=${successfulLoopbackTransports.length}, providerEvidence=${providerEvidence.length}`)
  ];
  const locallyReady = localControls.every((item) => item.status === "proved-local");
  return {
    certified: false,
    status: PROVIDER_CERTIFICATION_STATUS,
    provider: status.provider,
    providerMode: status.mode,
    locallyReady,
    modelContracts: {
      primaryModel: contracts.coding?.primaryModel || null,
      fallbackModel: contracts.coding?.fallbackModel || null,
      fallbackAfterMs: contracts.coding?.fallbackAfterMs || null,
      imageModel: contracts.image?.model || null
    },
    evidenceCounts: {
      aiMessages: messages.length,
      modelRoutes: modelRoutes.length,
      providerEvidence: providerEvidence.length,
      liveGuards: liveGuards.length,
      blockedGuards: blockedGuards.length,
      liveTransports: liveTransports.length,
      successfulLoopbackTransports: successfulLoopbackTransports.length,
      secretEchoCount: liveTransports.filter((item) => item.secretEcho === true).length
    },
    localControls,
    missingCertificationControls: [
      "approved-real-provider-call-with-human-authorization",
      "secret-manager-backed-provider-key",
      "budget-and-cost-cap-enforcement",
      "provider-rate-limit-and-retry-budget",
      "privacy-dpa-and-student-data-review",
      "production-audit-retention-policy",
      "provider-kill-switch-and-rollback-drill",
      "sampled-response-quality-and-safety-review",
      "incident-response-drill-for-provider-failure"
    ],
    nextCertificationStep: "Run an approved T3 external-provider certification phase with a managed secret, cost cap, privacy review, rollback switch, sampled response audit, and explicit human authorization.",
    notes: [
      "This readiness bundle is local evidence only.",
      "It intentionally does not certify real external provider execution.",
      "No real API key is required, stored, echoed, or sent by this readiness check."
    ]
  };
}

function control(id, passed, evidence) {
  return {
    id,
    status: passed ? "proved-local" : "missing-local-evidence",
    evidence
  };
}
