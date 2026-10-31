export function modelProviderStatus(contracts, env = process.env) {
  const configured = Boolean(env.CODEX_MODEL_API_KEY);
  const liveEnabled = env.CODEX_ENABLE_LIVE_MODEL === "1";
  const baseUrl = providerBaseUrlInfo(env);
  const mode = configured && liveEnabled
    ? "live-ready"
    : configured
      ? "configured-disabled"
      : "local-simulated";

  return {
    provider: "codex-model-gateway",
    mode,
    configured,
    liveEnabled,
    secretSafe: true,
    keySource: configured ? "environment" : null,
    coding: {
      primaryModel: contracts.coding.primaryModel,
      fallbackModel: contracts.coding.fallbackModel,
      fallbackAfterMs: contracts.coding.fallbackAfterMs
    },
    image: {
      model: contracts.image.model,
      separatedFromCoding: true
    },
    transport: {
      dryRunOnly: mode !== "live-ready",
      outboundCalls: 0,
      baseUrlConfigured: baseUrl.configured,
      baseUrlHost: baseUrl.host,
      loopbackOnly: !baseUrl.configured || baseUrl.loopback,
      liveCallRequires: ["CODEX_MODEL_API_KEY", "CODEX_ENABLE_LIVE_MODEL=1", "CODEX_MODEL_BASE_URL", "X-CodeX-Live-Model: allow"]
    }
  };
}

export function sanitizedProviderRequest(modelRoute, payload = {}, contracts = {}, env = process.env) {
  const status = modelProviderStatus(contracts, env);
  const path = modelRoute.path === "image" ? "/v1/images" : "/v1/responses";
  return {
    provider: status.provider,
    mode: status.mode,
    path,
    model: modelRoute.selectedModel,
    fallbackUsed: Boolean(modelRoute.fallbackUsed),
    secretSafe: true,
    secretEcho: false,
    sendable: status.mode === "live-ready",
    dryRunOnly: status.transport.dryRunOnly,
    bodyShape: modelRoute.path === "image"
      ? ["model", "prompt", "quality", "style"]
      : ["model", "input", "metadata"],
    promptBytes: Buffer.byteLength(String(payload.prompt || payload.message || ""), "utf8"),
    codeBytes: modelRoute.path === "coding" ? Buffer.byteLength(String(payload.code || ""), "utf8") : 0
  };
}

export function providerAdapterEvidence(modelRoute, payload = {}, contracts = {}, env = process.env) {
  return {
    status: modelProviderStatus(contracts, env),
    request: sanitizedProviderRequest(modelRoute, payload, contracts, env)
  };
}

const keyPattern = /\b(sk-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]{8,})\b/g;
const sensitiveFieldPattern = /api[-_]?key|token|authorization|password|secret/i;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function summarizeText(value) {
  const text = String(value).replace(keyPattern, "[REDACTED_SECRET]");
  return {
    preview: text.slice(0, 120),
    bytes: Buffer.byteLength(text, "utf8"),
    truncated: text.length > 120
  };
}

export function redactProviderPayload(value, fieldName = "") {
  if (sensitiveFieldPattern.test(fieldName)) return "[REDACTED_FIELD]";
  if (typeof value === "string") return summarizeText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactProviderPayload(item));
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactProviderPayload(item, key)])
    );
  }
  return null;
}

function providerBaseUrlInfo(env = process.env) {
  const raw = env.CODEX_MODEL_BASE_URL;
  if (!raw) {
    return { configured: false, valid: false, host: null, loopback: false, origin: null };
  }
  try {
    const url = new URL(raw);
    const host = url.hostname;
    const loopback = loopbackHosts.has(host);
    return {
      configured: true,
      valid: url.protocol === "http:" || url.protocol === "https:",
      host,
      loopback,
      origin: url.origin
    };
  } catch {
    return { configured: true, valid: false, host: null, loopback: false, origin: null };
  }
}

export function providerLiveGuard(headers = {}, contracts = {}, env = process.env) {
  const status = modelProviderStatus(contracts, env);
  const explicitApproval = headers["x-codex-live-model"] === "allow";
  const baseUrl = providerBaseUrlInfo(env);
  const blockingReasons = [];
  if (!status.configured) blockingReasons.push("missing CODEX_MODEL_API_KEY");
  if (!status.liveEnabled) blockingReasons.push("missing CODEX_ENABLE_LIVE_MODEL=1");
  if (!baseUrl.configured) blockingReasons.push("missing CODEX_MODEL_BASE_URL");
  if (baseUrl.configured && !baseUrl.valid) blockingReasons.push("invalid CODEX_MODEL_BASE_URL");
  if (baseUrl.configured && baseUrl.valid && !baseUrl.loopback && env.CODEX_ALLOW_EXTERNAL_MODEL_BASE_URL !== "1") {
    blockingReasons.push("external CODEX_MODEL_BASE_URL requires CODEX_ALLOW_EXTERNAL_MODEL_BASE_URL=1");
  }
  if (!explicitApproval) blockingReasons.push("missing X-CodeX-Live-Model: allow");
  return {
    riskTier: "T3-external-model-call",
    allowed: blockingReasons.length === 0,
    blockingReasons,
    explicitApproval,
    baseUrlConfigured: baseUrl.configured,
    baseUrlHost: baseUrl.host,
    loopbackBaseUrl: baseUrl.loopback,
    providerMode: status.mode,
    outboundCalls: 0,
    rollback: "Unset CODEX_ENABLE_LIVE_MODEL or remove CODEX_MODEL_API_KEY to disable live calls."
  };
}

export function providerLivePlan(modelRoute, payload = {}, contracts = {}, headers = {}, env = process.env) {
  const guard = providerLiveGuard(headers, contracts, env);
  const providerRequest = sanitizedProviderRequest(modelRoute, payload, contracts, env);
  return {
    guard,
    modelRoute,
    providerRequest: {
      ...providerRequest,
      sendable: guard.allowed,
      dryRunOnly: !guard.allowed
    },
    redactedPayload: redactProviderPayload(payload),
    timeoutMs: Number(env.CODEX_MODEL_TIMEOUT_MS || 4500),
    retryPolicy: {
      maxRetries: modelRoute.path === "image" ? 0 : 1,
      retryOn: ["timeout", "429", "5xx"],
      backoffMs: 250
    },
    auditSample: {
      storePrompt: false,
      storeCode: false,
      storeProviderResponse: false,
      keepRouteMetadata: true
    },
    outboundCall: false,
    secretEcho: false
  };
}

export function buildProviderTransportRequest(modelRoute, payload = {}, contracts = {}, env = process.env) {
  const baseUrl = providerBaseUrlInfo(env);
  if (!baseUrl.origin) throw new Error("CODEX_MODEL_BASE_URL is not configured for transport");
  const providerRequest = sanitizedProviderRequest(modelRoute, payload, contracts, env);
  const endpointUrl = new URL(providerRequest.path, `${baseUrl.origin}/`).toString();
  const prompt = String(payload.prompt || payload.message || "");
  const code = String(payload.code || "");
  const body = modelRoute.path === "image"
    ? {
        model: modelRoute.selectedModel,
        prompt,
        quality: payload.quality || "high",
        style: payload.style || "cartoon-glass"
      }
    : {
        model: modelRoute.selectedModel,
        input: [prompt, code ? `Student code:\n${code}` : ""].filter(Boolean).join("\n\n"),
        metadata: {
          route: modelRoute.path,
          fallbackUsed: Boolean(modelRoute.fallbackUsed),
          fallbackAfterMs: modelRoute.fallbackAfterMs ?? null
        }
      };
  return {
    providerRequest,
    endpointUrl,
    body,
    bodyShape: Object.keys(body),
    redactedBody: redactProviderPayload(body)
  };
}

function parseProviderResponse(rawText) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function providerResponsePreview(parsed, rawText) {
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.output_text === "string") return summarizeText(parsed.output_text);
    if (typeof parsed.text === "string") return summarizeText(parsed.text);
    if (Array.isArray(parsed.data) && parsed.data[0]?.revised_prompt) return summarizeText(parsed.data[0].revised_prompt);
  }
  return summarizeText(rawText || "");
}

function shouldRetryTransport(statusCode, error, retryPolicy) {
  if (!retryPolicy) return false;
  if (error) return error.name === "AbortError" || /timeout|aborted/i.test(error.message || "");
  return statusCode === 429 || statusCode >= 500;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function executeProviderTransport(plan, payload = {}, contracts = {}, env = process.env, fetchImpl = fetch) {
  if (!plan?.guard?.allowed) {
    return {
      outboundCall: false,
      ok: false,
      blocked: true,
      providerPath: plan?.providerRequest?.path || null,
      selectedModel: plan?.modelRoute?.selectedModel || null,
      secretEcho: false,
      error: "guard-not-allowed"
    };
  }

  const request = buildProviderTransportRequest(plan.modelRoute, payload, contracts, env);
  const timeoutMs = Math.max(250, Number(plan.timeoutMs || env.CODEX_MODEL_TIMEOUT_MS || 4500));
  const retryPolicy = plan.retryPolicy || { maxRetries: 0, retryOn: [], backoffMs: 0 };
  const maxAttempts = Math.max(1, Number(retryPolicy.maxRetries || 0) + 1);
  const startedAt = Date.now();
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const response = await fetchWithTimeout(fetchImpl, request.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.CODEX_MODEL_API_KEY}`,
          "X-CodeX-Route": plan.modelRoute.path
        },
        body: JSON.stringify(request.body)
      }, timeoutMs);
      const rawText = await response.text();
      const parsed = parseProviderResponse(rawText);
      const statusCode = response.status;
      const secretEcho = Boolean(env.CODEX_MODEL_API_KEY && rawText.includes(env.CODEX_MODEL_API_KEY));
      lastResult = {
        outboundCall: true,
        ok: response.ok,
        providerStatusCode: statusCode,
        providerPath: request.providerRequest.path,
        providerHost: plan.guard.baseUrlHost,
        selectedModel: plan.modelRoute.selectedModel,
        fallbackUsed: Boolean(plan.modelRoute.fallbackUsed),
        attemptCount: attempt,
        durationMs: Date.now() - startedAt,
        secretEcho,
        request: {
          ...request.providerRequest,
          sendable: true,
          dryRunOnly: false,
          bodyShape: request.bodyShape,
          redactedBody: request.redactedBody
        },
        responseSummary: {
          contentType: response.headers.get("content-type") || null,
          bytes: Buffer.byteLength(rawText || "", "utf8"),
          preview: providerResponsePreview(parsed, rawText),
          redactedBody: redactProviderPayload(parsed),
          attemptDurationMs: Date.now() - attemptStartedAt
        }
      };
      if (response.ok || attempt >= maxAttempts || !shouldRetryTransport(statusCode, null, retryPolicy)) {
        return lastResult;
      }
    } catch (error) {
      lastResult = {
        outboundCall: true,
        ok: false,
        providerStatusCode: null,
        providerPath: request.providerRequest.path,
        providerHost: plan.guard.baseUrlHost,
        selectedModel: plan.modelRoute.selectedModel,
        fallbackUsed: Boolean(plan.modelRoute.fallbackUsed),
        attemptCount: attempt,
        durationMs: Date.now() - startedAt,
        secretEcho: false,
        request: {
          ...request.providerRequest,
          sendable: true,
          dryRunOnly: false,
          bodyShape: request.bodyShape,
          redactedBody: request.redactedBody
        },
        error: {
          name: error.name || "Error",
          message: summarizeText(error.message || "provider transport failed")
        }
      };
      if (attempt >= maxAttempts || !shouldRetryTransport(null, error, retryPolicy)) {
        return lastResult;
      }
    }
    if (retryPolicy.backoffMs) {
      await new Promise((resolve) => setTimeout(resolve, Number(retryPolicy.backoffMs)));
    }
  }

  return lastResult;
}
