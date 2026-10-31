const ALLOWED_LANES = new Set(["runtime", "database", "provider"]);
const ALLOWED_ROLLBACK_RESULTS = new Set(["passed", "failed", "not-run"]);
const ALLOWED_REVIEW_GATES = new Set(["passed", "failed", "pending"]);
const SECRET_PATTERNS = [
  { id: "key-shaped-token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: "database-url", pattern: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/gi },
  { id: "secret-env-name", pattern: /\b(?:CODEX_MODEL_API_KEY|OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\b/g },
  { id: "credential-url", pattern: /:\/\/[^:\s/@]+:[^@\s/]+@/g }
];

export function summarizeT3Evidence(candidates = []) {
  const accepted = candidates.filter((item) => item.status === "accepted-candidate");
  const laneCounts = Object.fromEntries(
    [...ALLOWED_LANES].map((lane) => [lane, accepted.filter((item) => item.lane === lane).length])
  );
  return {
    status: "candidate-only",
    finalGoalComplete: false,
    certificationStateChanged: false,
    candidateCount: candidates.length,
    acceptedCandidateCount: accepted.length,
    laneCounts,
    latestCandidateAt: candidates.at(-1)?.createdAt || null,
    guardrails: {
      secretValuesReturned: false,
      externalCalls: false,
      managedDatabaseConnections: false,
      deployments: false,
      billingActions: false,
      marksCertified: false
    }
  };
}

export function intakeT3Evidence(payload = {}, existingCandidates = [], now = new Date().toISOString()) {
  const validation = validatePayload(payload);
  const secretFindings = findSecretLikeContent(payload);
  const rejected = validation.errors.length > 0 || secretFindings.length > 0;

  if (rejected) {
    return {
      status: "rejected-candidate",
      stored: false,
      certificationStateChanged: false,
      errors: validation.errors,
      redactionFindings: secretFindings.map((item) => ({ id: item.id, count: item.count })),
      summary: summarizeT3Evidence(existingCandidates)
    };
  }

  const lane = String(payload.lane || "").trim();
  const candidate = {
    id: `t3-evidence-${Date.now()}-${lane}`,
    status: "accepted-candidate",
    lane,
    riskTier: "T3",
    certificationStateChanged: false,
    finalGoalComplete: false,
    approvalRef: boundedText(payload.approvalRef, 120),
    operator: boundedText(payload.operator, 80),
    rollbackResult: payload.rollbackResult,
    reviewGate: payload.reviewGate,
    evidenceItems: payload.evidenceItems.map((item, index) => ({
      id: `evidence-${index + 1}`,
      type: boundedText(item.type, 80),
      summary: boundedText(item.summary, 240),
      artifactRef: boundedText(item.artifactRef, 160)
    })),
    createdAt: now
  };
  const nextCandidates = [...existingCandidates, candidate];
  return {
    status: "accepted-candidate",
    stored: true,
    certificationStateChanged: false,
    candidate,
    summary: summarizeT3Evidence(nextCandidates)
  };
}

function validatePayload(payload) {
  const errors = [];
  if (!ALLOWED_LANES.has(String(payload.lane || "").trim())) {
    errors.push("lane must be runtime, database, or provider");
  }
  if (!present(payload.approvalRef)) errors.push("approvalRef is required");
  if (!present(payload.operator)) errors.push("operator is required");
  if (!ALLOWED_ROLLBACK_RESULTS.has(payload.rollbackResult)) {
    errors.push("rollbackResult must be passed, failed, or not-run");
  }
  if (!ALLOWED_REVIEW_GATES.has(payload.reviewGate)) {
    errors.push("reviewGate must be passed, failed, or pending");
  }
  if (!Array.isArray(payload.evidenceItems) || payload.evidenceItems.length < 3) {
    errors.push("at least three evidenceItems are required");
  } else {
    payload.evidenceItems.forEach((item, index) => {
      if (!present(item?.type)) errors.push(`evidenceItems[${index}].type is required`);
      if (!present(item?.summary)) errors.push(`evidenceItems[${index}].summary is required`);
      if (!present(item?.artifactRef)) errors.push(`evidenceItems[${index}].artifactRef is required`);
    });
  }
  return { errors };
}

function findSecretLikeContent(value) {
  const text = JSON.stringify(value || {});
  return SECRET_PATTERNS
    .map(({ id, pattern }) => {
      const matches = text.match(pattern) || [];
      return { id, count: matches.length };
    })
    .filter((item) => item.count > 0);
}

function boundedText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}
