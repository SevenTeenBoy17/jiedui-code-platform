import { OUTPUT_LIMIT_BYTES, runnerMetadata, sandboxPolicy } from "./sandbox-isolation.mjs";

export const SANDBOX_CERTIFICATION_STATUS = "readiness-only";

const escapeViolationIds = new Set([
  "python-os",
  "python-subprocess",
  "python-network",
  "python-eval",
  "path-traversal",
  "c-system"
]);

export function sandboxCertificationReadiness(runJobs = []) {
  const jobs = Array.isArray(runJobs) ? runJobs : [];
  const runner = runnerMetadata({ workspace: { created: false, cleaned: true } });
  const policy = sandboxPolicy();
  const v2Jobs = jobs.filter((job) => job.runner?.engine === "sandbox-runner-v2");
  const escapeBlockedJobs = jobs.filter((job) => (job.result?.sandbox?.violations || []).some((violation) => escapeViolationIds.has(violation.id)));
  const timeoutJobs = jobs.filter((job) => job.status === "timeout" || job.runner?.timedOut === true);
  const cleanedWorkspaceJobs = v2Jobs.filter((job) => job.runner?.workspace?.cleaned === true && job.runner?.workspace?.pathExposed === false);
  const scrubbedEnvJobs = v2Jobs.filter((job) => job.runner?.envPolicy === "allowlist-scrubbed" && job.runner?.secretEnvPresent === false);
  const localControls = [
    control("runner-boundary", v2Jobs.length > 0, `sandbox-runner-v2 jobs=${v2Jobs.length}`),
    control("env-scrub", scrubbedEnvJobs.length > 0, `allowlist-scrubbed secret-free jobs=${scrubbedEnvJobs.length}`),
    control("ephemeral-workspace", cleanedWorkspaceJobs.length > 0, `cleaned path-hidden jobs=${cleanedWorkspaceJobs.length}`),
    control("network-policy", policy.network === "disabled", `policy.network=${policy.network}`),
    control("process-boundary", policy.process === "no-shell-child-process", `policy.process=${policy.process}`),
    control("output-limit", policy.outputLimitBytes === OUTPUT_LIMIT_BYTES, `outputLimitBytes=${policy.outputLimitBytes}`),
    control("timeout-bound", v2Jobs.some((job) => Number(job.runner?.timeoutMs || 0) > 0) || timeoutJobs.length > 0, `timeoutEvidence=${timeoutJobs.length || v2Jobs.length}`),
    control("escape-regression", escapeBlockedJobs.length >= 3, `escapeBlockedJobs=${escapeBlockedJobs.length}`),
    control("secret-exclusion", scrubbedEnvJobs.every((job) => job.runner?.secretEnvPresent === false), `secretEnvPresent=false jobs=${scrubbedEnvJobs.length}`)
  ];
  const locallyReady = localControls.every((item) => item.status === "proved-local");
  return {
    certified: false,
    status: SANDBOX_CERTIFICATION_STATUS,
    locallyReady,
    runner,
    policy,
    evidenceCounts: {
      runJobs: jobs.length,
      v2Jobs: v2Jobs.length,
      scrubbedEnvJobs: scrubbedEnvJobs.length,
      cleanedWorkspaceJobs: cleanedWorkspaceJobs.length,
      escapeBlockedJobs: escapeBlockedJobs.length,
      timeoutJobs: timeoutJobs.length
    },
    localControls,
    missingCertificationControls: [
      "cpu-quota-enforced-by-runtime",
      "memory-quota-enforced-by-runtime",
      "kernel-container-vm-or-browser-wasm-isolation-proof",
      "read-only-host-filesystem-mount-policy",
      "network-namespace-or-browser-capability-enforcement",
      "syscall-native-escape-regression-suite",
      "concurrency-and-queue-isolation-limits",
      "audit-retention-and-forensics-export",
      "runtime-rollback-and-recovery-drill"
    ],
    nextCertificationStep: "Run an approved T3 certification phase against a real container, VM, or browser-WASM runtime and attach quota, namespace, mount, escape, audit, rollback, and recovery evidence.",
    notes: [
      "This readiness bundle is local evidence only.",
      "It intentionally does not certify a production sandbox runtime.",
      "The current runner remains a no-exec educational boundary until a T3 runtime is approved and certified."
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
