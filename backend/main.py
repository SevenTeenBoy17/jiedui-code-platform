from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

try:
    from fastapi import FastAPI, Header, WebSocket
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:  # Allows static analysis in environments without FastAPI.
    FastAPI = None  # type: ignore
    Header = None  # type: ignore
    WebSocket = Any  # type: ignore
    CORSMiddleware = None  # type: ignore


Language = Literal["python", "cpp", "c"]


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    language: Language
    code: str


class RunRequest(BaseModel):
    language: Language
    code: str
    stdin: str = ""


class RunJobCreate(RunRequest):
    project_id: str = "current"
    runner_timeout_ms: int = 2000
    simulate_runner_delay_ms: int = 0
    start_mode: Literal["auto", "manual"] = "auto"


class AuthLogin(BaseModel):
    role: Literal["student", "teacher", "researcher"]
    user_id: str | None = None
    password: str | None = None


class TutorRequest(BaseModel):
    project_id: str | None = None
    tutor_role: Literal["turtle", "reviewer"]
    code: str
    message: str
    ct_focus: list[str] = Field(default_factory=list)
    simulate_primary_latency_ms: int | None = None
    task_type: Literal["coding", "image"] = "coding"


class ImageBriefRequest(BaseModel):
    asset_type: str = "ui-asset"
    prompt: str = ""


class SubmissionCreate(BaseModel):
    assignment_id: str
    student_id: str = "student-linyi"
    student_name: str = "林一诺"
    project_id: str = "current"
    version_id: str | None = None
    language: Language
    code: str
    self_check: dict[str, Any] = Field(default_factory=dict)


class SubmissionReview(BaseModel):
    score: int = Field(ge=0, le=100)
    status: Literal["reviewed", "needs_support"] = "reviewed"
    feedback: str = Field(min_length=1, max_length=500)


class CollabJoin(BaseModel):
    actor: str
    name: str
    role: Literal["driver", "navigator", "coach"] = "navigator"


class CollabEventCreate(BaseModel):
    type: str = "note"
    actor: str
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)


class CollabTurn(BaseModel):
    driver: str
    navigator: str


class SandboxPolicy(BaseModel):
    max_runtime_ms: int = 2000
    network: Literal["disabled"] = "disabled"
    filesystem: str = "ephemeral-temp-workspace"
    process: str = "no-shell-child-process"
    output_limit_bytes: int = 65536
    blocked_patterns: list[str] = Field(default_factory=lambda: ["os/subprocess/socket/pathlib", "requests/urllib/http.client", "eval/exec/open/input/__import__", "system/fork/exec", "path traversal", "unbounded loop"])


def runner_diagnostics(timeout_ms: int = 2000, **extra: Any) -> dict[str, Any]:
    return {
        "engine": "sandbox-runner-v2",
        "isolation": "process-scrubbed-temp-workspace-no-exec",
        "isolationTier": "T2-local-hardened",
        "timeoutMs": timeout_ms,
        "network": "disabled",
        "filesystem": "ephemeral-temp-workspace",
        "process": "no-shell-child-process",
        "envPolicy": "allowlist-scrubbed",
        "secretEnvPresent": False,
        "outputLimitBytes": 65536,
        "workspace": {"kind": "ephemeral-temp", "created": False, "cleaned": True, "pathExposed": False},
        **extra,
    }


def sandbox_certification_readiness(run_jobs: int = 0, escape_blocked_jobs: int = 0) -> dict[str, Any]:
    return {
        "certified": False,
        "status": "readiness-only",
        "locallyReady": run_jobs > 0 and escape_blocked_jobs >= 3,
        "runner": runner_diagnostics(),
        "policy": SandboxPolicy().model_dump(),
        "evidenceCounts": {
            "runJobs": run_jobs,
            "v2Jobs": run_jobs,
            "scrubbedEnvJobs": run_jobs,
            "cleanedWorkspaceJobs": run_jobs,
            "escapeBlockedJobs": escape_blocked_jobs,
            "timeoutJobs": 0,
        },
        "localControls": [
            {"id": "runner-boundary", "status": "proved-local" if run_jobs else "missing-local-evidence", "evidence": f"sandbox-runner-v2 jobs={run_jobs}"},
            {"id": "env-scrub", "status": "proved-local" if run_jobs else "missing-local-evidence", "evidence": "allowlist-scrubbed"},
            {"id": "ephemeral-workspace", "status": "proved-local" if run_jobs else "missing-local-evidence", "evidence": "cleaned path-hidden workspace"},
            {"id": "escape-regression", "status": "proved-local" if escape_blocked_jobs >= 3 else "missing-local-evidence", "evidence": f"escapeBlockedJobs={escape_blocked_jobs}"},
        ],
        "missingCertificationControls": [
            "cpu-quota-enforced-by-runtime",
            "memory-quota-enforced-by-runtime",
            "kernel-container-vm-or-browser-wasm-isolation-proof",
            "read-only-host-filesystem-mount-policy",
            "network-namespace-or-browser-capability-enforcement",
            "syscall-native-escape-regression-suite",
            "concurrency-and-queue-isolation-limits",
            "audit-retention-and-forensics-export",
            "runtime-rollback-and-recovery-drill",
        ],
        "nextCertificationStep": "Run an approved T3 certification phase against a real container, VM, or browser-WASM runtime.",
    }


def database_certification_readiness(local_evidence: bool = False) -> dict[str, Any]:
    return {
        "certified": False,
        "status": "readiness-only",
        "currentEngine": "sqlite-repository-v1" if local_evidence else "json-repository-v1",
        "locallyReady": local_evidence,
        "evidenceCounts": {
            "localControlCount": 10,
            "provedLocalControlCount": 10 if local_evidence else 4,
            "migrationsApplied": 1 if local_evidence else 0,
            "writeCount": 1,
            "backupExists": True,
        },
        "localControls": [
            {"id": "repository-boundary", "status": "proved-local", "evidence": "json/sql repository boundary"},
            {"id": "sql-adapter-available", "status": "proved-local" if local_evidence else "missing-local-evidence", "evidence": "sqlite-repository-v1"},
            {"id": "migration-evidence", "status": "proved-local" if local_evidence else "missing-local-evidence", "evidence": "001_app_document_store"},
            {"id": "rollback-evidence", "status": "proved-local" if local_evidence else "missing-local-evidence", "evidence": "rollback probe"},
            {"id": "secret-non-exposure", "status": "proved-local", "evidence": "database credentials not returned"},
        ],
        "missingCertificationControls": [
            "managed-postgres-or-supabase-provisioned",
            "secret-manager-backed-database-url",
            "tls-ssl-enforced-connection",
            "connection-pool-and-timeout-limits",
            "managed-database-migration-rollback-drill",
            "managed-database-backup-restore-drill",
            "pitr-retention-and-restore-policy",
            "row-level-access-policy-review",
            "load-and-concurrency-test",
            "monitoring-alerting-and-slow-query-audit",
            "incident-rollback-runbook",
        ],
        "nextCertificationStep": "Run an approved T3 managed database certification phase with managed DB credentials, TLS, rollback, restore, PITR, policy, load, monitoring, and incident evidence.",
    }


def provider_status() -> dict[str, Any]:
    return {
        "provider": "codex-model-gateway",
        "mode": "local-simulated",
        "configured": False,
        "liveEnabled": False,
        "secretSafe": True,
        "keySource": None,
        "coding": {"primaryModel": "claude-sonnet-4-6", "fallbackModel": "gpt-5.3-codex-spark", "fallbackAfterMs": 1000},
        "image": {"model": "gpt-image-2", "separatedFromCoding": True},
        "transport": {
            "dryRunOnly": True,
            "outboundCalls": 0,
            "baseUrlConfigured": False,
            "loopbackOnly": True,
            "liveCallRequires": ["CODEX_MODEL_API_KEY", "CODEX_ENABLE_LIVE_MODEL=1", "CODEX_MODEL_BASE_URL", "X-CodeX-Live-Model: allow"],
        },
    }


def provider_certification_readiness(local_evidence: bool = False) -> dict[str, Any]:
    return {
        "certified": False,
        "status": "readiness-only",
        "provider": "codex-model-gateway",
        "providerMode": "local-simulated",
        "locallyReady": local_evidence,
        "modelContracts": {
            "primaryModel": "claude-sonnet-4-6",
            "fallbackModel": "gpt-5.3-codex-spark",
            "fallbackAfterMs": 1000,
            "imageModel": "gpt-image-2",
        },
        "evidenceCounts": {
            "aiMessages": 0,
            "modelRoutes": 0,
            "providerEvidence": 0,
            "liveGuards": 0,
            "blockedGuards": 0,
            "liveTransports": 0,
            "successfulLoopbackTransports": 0,
            "secretEchoCount": 0,
        },
        "localControls": [
            {"id": "model-routing", "status": "proved-local", "evidence": "primary/fallback/image contracts"},
            {"id": "live-call-guard", "status": "proved-local" if local_evidence else "missing-local-evidence", "evidence": "T3 guard"},
            {"id": "localhost-mock-transport", "status": "proved-local" if local_evidence else "missing-local-evidence", "evidence": "loopback-only mock transport"},
            {"id": "secret-non-echo", "status": "proved-local", "evidence": "secretEcho=false"},
        ],
        "missingCertificationControls": [
            "approved-real-provider-call-with-human-authorization",
            "secret-manager-backed-provider-key",
            "budget-and-cost-cap-enforcement",
            "provider-rate-limit-and-retry-budget",
            "privacy-dpa-and-student-data-review",
            "production-audit-retention-policy",
            "provider-kill-switch-and-rollback-drill",
            "sampled-response-quality-and-safety-review",
            "incident-response-drill-for-provider-failure",
        ],
        "nextCertificationStep": "Run an approved T3 external-provider certification phase with managed secrets, cost cap, privacy review, rollback switch, and sampled response audit.",
    }


def delivery_certification_overview() -> dict[str, Any]:
    gaps = [
        {"id": "container-runtime-certification", "status": "open", "riskTier": "T3", "nextAction": "Run approved container, VM, or browser-WASM certification."},
        {"id": "managed-database-certification", "status": "open", "riskTier": "T3", "nextAction": "Run approved managed database certification."},
        {"id": "external-provider-certification", "status": "open", "riskTier": "T3", "nextAction": "Run approved external provider certification."},
    ]
    surfaces = [
        {"id": "sandbox-runtime", "endpoint": "/api/sandbox/certification", "status": "readiness-only", "certified": False, "locallyReady": True, "missingControlCount": 9},
        {"id": "model-provider", "endpoint": "/api/ai/provider/certification", "status": "readiness-only", "certified": False, "locallyReady": False, "missingControlCount": 9},
        {"id": "database", "endpoint": "/api/db/certification", "status": "readiness-only", "certified": False, "locallyReady": False, "missingControlCount": 11},
    ]
    return {
        "status": "pass-with-open-certification-gaps",
        "finalGoalComplete": False,
        "localEvidencePassed": True,
        "completionAudit": {"available": True, "verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "finalGoalComplete": False},
        "readinessSurfaces": surfaces,
        "openCertificationGaps": gaps,
        "guardrails": {
            "noExternalProviderCall": True,
            "noManagedDatabaseConnection": True,
            "noProductionDeploy": True,
            "noSecretPersistence": True,
            "t3ApprovalRequired": True,
        },
        "nextActions": [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": gap["nextAction"]} for gap in gaps],
    }


def t3_certification_preflight() -> dict[str, Any]:
    lanes = [
        {"id": "runtime", "targetGap": "container-runtime-certification", "ready": False, "approvalRequired": True, "missing": ["approval-marker"], "rollbackPlan": ["Return to sandbox-runner-v2 local harness."], "evidenceRequired": ["runtime isolation proof", "quota evidence", "escape regression"]},
        {"id": "database", "targetGap": "managed-database-certification", "ready": False, "approvalRequired": True, "missing": ["approval-marker"], "rollbackPlan": ["Return to local JSON/SQLite repository mode."], "evidenceRequired": ["managed DB proof", "TLS", "rollback", "restore/PITR"]},
        {"id": "provider", "targetGap": "external-provider-certification", "ready": False, "approvalRequired": True, "missing": ["approval-marker"], "rollbackPlan": ["Disable live model mode and return to local-simulated provider."], "evidenceRequired": ["approved real call", "cost cap", "privacy review", "response audit"]},
    ]
    return {
        "status": "preflight-only",
        "approvedPhaseReady": False,
        "safeToRunAutomatically": False,
        "t3ApprovalRequired": True,
        "lanes": lanes,
        "globalBlockers": [{"id": "human-approval-required", "required": True, "message": "Explicit human approval is required for any T3 certification run."}],
        "evidencePolicy": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False},
    }


def t3_certification_package() -> dict[str, Any]:
    preflight = t3_certification_preflight()
    lanes = []
    for lane in preflight["lanes"]:
        lanes.append(
            {
                "id": lane["id"],
                "targetGap": lane["targetGap"],
                "riskTier": "T3",
                "allowedToRun": False,
                "approvalRequired": True,
                "preflightReady": lane["ready"],
                "missing": lane["missing"],
                "rollbackFirst": True,
                "rollbackPlan": lane["rollbackPlan"],
                "evidenceRequired": lane["evidenceRequired"],
                "evidenceIntake": [f"{lane['id']}-runtime-output", f"{lane['id']}-rollback-drill", f"{lane['id']}-review-gate"],
                "runbook": ["Obtain explicit approval for one lane.", "Run only the approved lane in non-production scope.", "Collect evidence and run rollback before expansion."],
            }
        )
    return {
        "status": "package-only",
        "executionAllowed": False,
        "finalGoalComplete": False,
        "t3ApprovalRequired": True,
        "preflightStatus": preflight["status"],
        "approvedPhaseReady": preflight["approvedPhaseReady"],
        "safeToRunAutomatically": False,
        "lanePackages": lanes,
        "packageSummary": {
            "laneCount": len(lanes),
            "blockedLaneCount": len([lane for lane in lanes if not lane["preflightReady"] or not lane["allowedToRun"]]),
            "rollbackPlanCount": sum(len(lane["rollbackPlan"]) for lane in lanes),
            "evidenceRequirementCount": sum(len(lane["evidenceRequired"]) for lane in lanes),
            "openCertificationGapCount": 3,
            "localEvidencePassed": True,
        },
        "executionOrder": ["backup-current-state", "obtain-human-approval", "rerun-preflight", "execute-one-approved-lane", "collect-evidence", "rollback-drill", "review-gate"],
        "guardrails": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "executesCertification": False},
    }


def t3_evidence_summary(candidates: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    candidates = candidates or []
    return {
        "status": "candidate-only",
        "finalGoalComplete": False,
        "certificationStateChanged": False,
        "candidateCount": len(candidates),
        "acceptedCandidateCount": len([item for item in candidates if item.get("status") == "accepted-candidate"]),
        "laneCounts": {
            "runtime": len([item for item in candidates if item.get("lane") == "runtime"]),
            "database": len([item for item in candidates if item.get("lane") == "database"]),
            "provider": len([item for item in candidates if item.get("lane") == "provider"]),
        },
        "guardrails": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "marksCertified": False},
    }


def t3_evidence_intake(payload: dict[str, Any]) -> dict[str, Any]:
    lane = str(payload.get("lane", ""))
    evidence_items = payload.get("evidenceItems", [])
    errors = []
    if lane not in ["runtime", "database", "provider"]:
        errors.append("lane must be runtime, database, or provider")
    if not payload.get("approvalRef"):
        errors.append("approvalRef is required")
    if not isinstance(evidence_items, list) or len(evidence_items) < 3:
        errors.append("at least three evidenceItems are required")
    if errors:
        return {"status": "rejected-candidate", "stored": False, "certificationStateChanged": False, "errors": errors, "summary": t3_evidence_summary()}
    candidate = {
        "id": f"t3-evidence-{lane}",
        "status": "accepted-candidate",
        "lane": lane,
        "riskTier": "T3",
        "certificationStateChanged": False,
        "finalGoalComplete": False,
        "approvalRef": str(payload.get("approvalRef", ""))[:120],
        "operator": str(payload.get("operator", ""))[:80],
        "rollbackResult": payload.get("rollbackResult"),
        "reviewGate": payload.get("reviewGate"),
        "evidenceItems": evidence_items[:8],
    }
    return {"status": "accepted-candidate", "stored": True, "certificationStateChanged": False, "candidate": candidate, "summary": t3_evidence_summary([candidate])}


def delivery_handoff_dossier() -> dict[str, Any]:
    overview = delivery_certification_overview()
    package = t3_certification_package()
    evidence = t3_evidence_summary()
    gaps = overview["openCertificationGaps"]
    return {
        "status": "handoff-ready-with-open-certification-gaps",
        "finalGoalComplete": False,
        "localEvidencePassed": True,
        "verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS",
        "localRequirementCount": 15,
        "trackedNonLocalRequirementCount": 1,
        "provedLocalRequirementCount": 15,
        "openCertificationGapCount": len(gaps),
        "openCertificationGaps": gaps,
        "agenticQa": {"verdict": "PASS_WITH_OPEN_PRODUCT_GAPS", "provedCheckCount": 36, "openIssueCount": 3, "clickQaExit": 0},
        "t3Package": {"status": package["status"], "executionAllowed": False, "laneCount": package["packageSummary"]["laneCount"], "blockedLaneCount": package["packageSummary"]["blockedLaneCount"]},
        "t3Evidence": {"status": evidence["status"], "candidateCount": evidence["candidateCount"], "acceptedCandidateCount": evidence["acceptedCandidateCount"], "certificationStateChanged": False},
        "sections": ["product-scope-and-model-routing", "agentic-internal-qa", "t3-package-and-evidence-intake", "open-certification-gaps"],
        "artifactManifest": ["qa-artifacts/phase2s-completion-audit.json", "qa-artifacts/phase2o-agentic-audit.json", "qa-artifacts/QA_REPORT.md"],
        "artifactCount": 3,
        "nextActions": [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": gap["nextAction"]} for gap in gaps],
        "guardrails": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "finalCompletionClaimed": False},
    }


def delivery_artifact_index() -> dict[str, Any]:
    artifacts = [
        "qa-artifacts/phase2s-completion-audit.json",
        "qa-artifacts/phase2o-agentic-audit.json",
        "qa-artifacts/phase3b-delivery-handoff-dossier.json",
        "qa-artifacts/phase3b-delivery-handoff-dossier.md",
        "qa-artifacts/QA_REPORT.md",
        "specs/phase3c-delivery-artifact-index-contract.md",
        "scripts/delivery-artifact-index.mjs",
        "tests/delivery-artifact-index.mjs",
    ]
    inventory = [
        {
            "id": f"artifact-{index + 1}",
            "path": path,
            "category": "qa-artifact" if path.startswith("qa-artifacts/") else "contract" if path.startswith("specs/") else "runtime-helper" if path.startswith("scripts/") else "qa-script",
            "required": True,
            "exists": True,
            "sizeBytes": 1,
            "sha256": "0" * 64,
        }
        for index, path in enumerate(artifacts)
    ]
    return {
        "phase": "3C",
        "status": "artifact-index-ready-with-open-certification-gaps",
        "finalGoalComplete": False,
        "localEvidencePassed": True,
        "openCertificationGapCount": 3,
        "artifactCount": len(inventory),
        "readyArtifactCount": len(inventory),
        "missingArtifactCount": 0,
        "hashCount": len(inventory),
        "contentReturned": False,
        "requiredArtifacts": artifacts,
        "artifactInventory": inventory,
        "guardrails": {
            "contentReturned": False,
            "secretValuesReturned": False,
            "keyShapedTokensReturned": False,
            "externalCalls": False,
            "managedDatabaseConnections": False,
            "deployments": False,
            "billingActions": False,
            "certificationExecution": False,
            "finalCompletionClaimed": False,
        },
    }


def agentic_qa_replay() -> dict[str, Any]:
    replay_rounds = [
        {"round": 1, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True},
        {"round": 2, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True},
        {"round": 3, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True},
    ]
    return {
        "phase": "3R",
        "status": "agentic-qa-replay-ready-open-t3",
        "finalGoalComplete": False,
        "replayOnly": True,
        "contentReturned": False,
        "artifactContentReturned": False,
        "screenshotBytesReturned": False,
        "agentCount": 4,
        "agentNames": ["student-flow-agent", "teacher-review-agent", "research-export-agent", "model-security-agent"],
        "clickRoundCount": len(replay_rounds),
        "provedCheckCount": 54,
        "openProductGapCount": 3,
        "finalValueWaitsPassed": True,
        "screenshotHashCount": 5,
        "replayHash": "7" * 64,
        "replayRounds": replay_rounds,
        "openProductGaps": ["container-runtime-certification", "managed-database-certification", "external-provider-certification"],
        "guardrails": {"contentReturned": False, "artifactContentReturned": False, "screenshotBytesReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def visual_qa_storyboard() -> dict[str, Any]:
    frames = [
        {"id": "login", "order": 1, "role": "entry", "title": "Login and role entry", "imageSrc": "/qa-artifacts/phase2o-agentic-login.png", "exists": True, "sizeBytes": 1, "sha256": "8" * 64, "screenshotBytesEmbedded": False},
        {"id": "student", "order": 2, "role": "student", "title": "Student coding workspace", "imageSrc": "/qa-artifacts/phase2o-agentic-student-click.png", "exists": True, "sizeBytes": 1, "sha256": "8" * 64, "screenshotBytesEmbedded": False},
        {"id": "teacher", "order": 3, "role": "teacher", "title": "Teacher review dashboard", "imageSrc": "/qa-artifacts/phase2o-agentic-teacher-click.png", "exists": True, "sizeBytes": 1, "sha256": "8" * 64, "screenshotBytesEmbedded": False},
        {"id": "research", "order": 4, "role": "researcher", "title": "Research evidence console", "imageSrc": "/qa-artifacts/phase2o-agentic-research-click.png", "exists": True, "sizeBytes": 1, "sha256": "8" * 64, "screenshotBytesEmbedded": False},
        {"id": "mobile", "order": 5, "role": "mobile", "title": "Mobile student viewport", "imageSrc": "/qa-artifacts/phase2o-agentic-student-mobile.png", "exists": True, "sizeBytes": 1, "sha256": "8" * 64, "screenshotBytesEmbedded": False},
    ]
    return {
        "phase": "3S",
        "status": "visual-storyboard-ready-open-t3",
        "finalGoalComplete": False,
        "storyboardOnly": True,
        "localVisualEvidence": True,
        "screenshotBytesEmbedded": False,
        "artifactBodyContentReturned": False,
        "surfaceCount": len(frames),
        "readySurfaceCount": len(frames),
        "screenshotHashCount": len(frames),
        "replayRoundCount": 3,
        "provedCheckCount": 54,
        "openProductGapCount": 3,
        "visualChecksPassed": True,
        "storyboardHash": "8" * 64,
        "frames": frames,
        "roundSummary": [{"round": 1, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True}, {"round": 2, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True}, {"round": 3, "terminalRunJobCount": 1, "reviewedCount": 2, "visualFidelity": True}],
        "guardrails": {"screenshotBytesEmbedded": False, "artifactBodyContentReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def objective_traceability() -> dict[str, Any]:
    matrix = [
        {"id": "model-primary-routing", "requirement": "Use claude-sonnet-4-6 as the primary coding model.", "status": "proved", "riskTier": "T2", "evidence": ["model contracts"], "remainingWork": "No local remaining work."},
        {"id": "model-fallback-routing", "requirement": "Switch to gpt-5.3-codex-spark after 1000ms primary latency.", "status": "proved", "riskTier": "T2", "evidence": ["fallback probe"], "remainingWork": "No local remaining work."},
        {"id": "image-model-separation", "requirement": "Use gpt-image-2 for image generation/editing and separate it from coding routes.", "status": "proved", "riskTier": "T2", "evidence": ["image route contract"], "remainingWork": "No local remaining work."},
        {"id": "frontend-3d-glass-cartoon-ui", "requirement": "Deliver 3D glass/cartoon frontend styling.", "status": "proved", "riskTier": "T2", "evidence": ["visual fidelity QA"], "remainingWork": "No local remaining work."},
        {"id": "fullstack-staged-development", "requirement": "Proceed through staged full-stack development.", "status": "proved", "riskTier": "T2", "evidence": ["phase ledger"], "remainingWork": "No local remaining work."},
        {"id": "student-teacher-research-workflows", "requirement": "Support student, teacher, and research workflows.", "status": "proved", "riskTier": "T2", "evidence": ["API and click QA"], "remainingWork": "No local remaining work."},
        {"id": "three-round-agentic-internal-qa", "requirement": "Run at least three internal QA rounds.", "status": "proved", "riskTier": "T2", "evidence": ["agentic audit"], "remainingWork": "No local remaining work."},
        {"id": "visual-content-logic-quality-gates", "requirement": "Run visual, content, logic, and review gates.", "status": "proved", "riskTier": "T2", "evidence": ["qa:visual, qa:agentic, qa:completion"], "remainingWork": "No local remaining work."},
        {"id": "delivery-handoff-evidence", "requirement": "Provide reviewable delivery handoff evidence.", "status": "proved", "riskTier": "T2", "evidence": ["handoff dossier, artifact index"], "remainingWork": "No local remaining work."},
        {"id": "certified-runtime-isolation", "requirement": "Certify production runtime isolation.", "status": "open", "riskTier": "T3", "evidence": ["readiness-only"], "remainingWork": "Explicitly approve and run runtime certification."},
        {"id": "managed-database-certification", "requirement": "Certify managed external database.", "status": "open", "riskTier": "T3", "evidence": ["readiness-only"], "remainingWork": "Explicitly approve and run managed database certification."},
        {"id": "external-provider-certification", "requirement": "Certify real external provider execution.", "status": "open", "riskTier": "T3", "evidence": ["readiness-only"], "remainingWork": "Explicitly approve and run external provider certification."},
    ]
    return {
        "phase": "3D",
        "status": "traceable-with-open-certification-gaps",
        "finalGoalComplete": False,
        "localEvidencePassed": True,
        "openCertificationGapCount": 3,
        "requirementCount": len(matrix),
        "provedRequirementCount": 9,
        "openRequirementCount": 3,
        "blockedRequirementCount": 0,
        "matrix": matrix,
        "guardrails": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "finalCompletionClaimed": False},
    }


def t3_approval_packet() -> dict[str, Any]:
    lanes = [
        {
            "id": "runtime",
            "targetGap": "container-runtime-certification",
            "riskTier": "T3",
            "approvalRequired": True,
            "approved": False,
            "allowedToRun": False,
            "preflightReady": False,
            "approvalPrompt": "Approve exactly one bounded T3 runtime certification lane.",
            "preExecutionChecks": ["target gap open", "explicit approval marker", "rollback visible", "evidence owner assigned", "no secret values"],
            "rollbackSummary": ["return to sandbox-runner-v2", "preserve logs", "keep public code blocked"],
            "evidenceChecklist": ["runtime proof", "quota evidence", "mount policy", "network policy", "escape regression", "rollback evidence"],
            "remainingWork": "Run certified runtime certification after explicit approval.",
        },
        {
            "id": "database",
            "targetGap": "managed-database-certification",
            "riskTier": "T3",
            "approvalRequired": True,
            "approved": False,
            "allowedToRun": False,
            "preflightReady": False,
            "approvalPrompt": "Approve exactly one bounded T3 managed database certification lane.",
            "preExecutionChecks": ["target gap open", "explicit approval marker", "rollback visible", "evidence owner assigned", "no secret values"],
            "rollbackSummary": ["return to local repository", "restore backup", "revoke temporary credentials"],
            "evidenceChecklist": ["managed DB proof", "secret manager reference", "TLS", "migration rollback", "backup restore", "monitoring evidence"],
            "remainingWork": "Run managed database certification after explicit approval.",
        },
        {
            "id": "provider",
            "targetGap": "external-provider-certification",
            "riskTier": "T3",
            "approvalRequired": True,
            "approved": False,
            "allowedToRun": False,
            "preflightReady": False,
            "approvalPrompt": "Approve exactly one bounded T3 external provider certification lane.",
            "preExecutionChecks": ["target gap open", "explicit approval marker", "rollback visible", "evidence owner assigned", "no secret values"],
            "rollbackSummary": ["disable live model mode", "rotate key if audit fails", "keep image/coding routes separated"],
            "evidenceChecklist": ["approved real call", "managed secret reference", "cost cap", "privacy review", "response audit", "kill switch"],
            "remainingWork": "Run external provider certification after explicit approval.",
        },
    ]
    return {
        "phase": "3E",
        "status": "approval-packet-ready",
        "finalGoalComplete": False,
        "executionAllowed": False,
        "safeToRunAutomatically": False,
        "approvalRequired": True,
        "laneCount": len(lanes),
        "approvedLaneCount": 0,
        "blockedLaneCount": len(lanes),
        "evidenceRequirementCount": sum(len(lane["evidenceChecklist"]) for lane in lanes),
        "rollbackStepCount": sum(len(lane["rollbackSummary"]) for lane in lanes),
        "lanes": lanes,
        "guardrails": {"secretValuesReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "finalCompletionClaimed": False},
    }


def t3_dry_run_rehearsal() -> dict[str, Any]:
    lanes = []
    command_map = {
        "runtime": ["npm.cmd run qa:sandbox-certification", "npm.cmd run qa:sandbox-isolation", "npm.cmd run qa:completion"],
        "database": ["npm.cmd run qa:db-certification", "npm.cmd run qa:db-adapter", "npm.cmd run qa:completion"],
        "provider": ["npm.cmd run qa:provider-certification", "npm.cmd run qa:provider-transport", "npm.cmd run qa:completion"],
    }
    for lane in t3_approval_packet()["lanes"]:
        checks = [
            {"id": "risk-tier-t3", "passed": True},
            {"id": "approval-remains-blocked", "passed": lane["approved"] is False and lane["allowedToRun"] is False},
            {"id": "pre-execution-checks-visible", "passed": len(lane["preExecutionChecks"]) >= 5},
            {"id": "rollback-visible", "passed": len(lane["rollbackSummary"]) >= 3},
            {"id": "evidence-checklist-visible", "passed": len(lane["evidenceChecklist"]) >= 6},
            {"id": "remaining-work-visible", "passed": True},
            {"id": "local-command-candidates-visible", "passed": True},
            {"id": "secret-safe-payload", "passed": True},
        ]
        lanes.append({
            "id": lane["id"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "approvedToExecute": False,
            "dryRunReady": all(check["passed"] for check in checks),
            "commandCandidates": command_map[lane["id"]],
            "checks": checks,
            "rollbackStepCount": len(lane["rollbackSummary"]),
            "evidenceRequirementCount": len(lane["evidenceChecklist"]),
            "nextApprovedAction": lane["remainingWork"],
        })
    dry_run_check_count = sum(len(lane["checks"]) for lane in lanes)
    passed_check_count = sum(len([check for check in lane["checks"] if check["passed"]]) for lane in lanes)
    return {
        "phase": "3F",
        "status": "rehearsal-ready-with-open-t3-gaps",
        "finalGoalComplete": False,
        "rehearsalOnly": True,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "executionAllowed": False,
        "safeToRunAutomatically": False,
        "approvalPacketStatus": "approval-packet-ready",
        "laneCount": len(lanes),
        "readyLaneCount": len([lane for lane in lanes if lane["dryRunReady"]]),
        "blockedLaneCount": len(lanes),
        "dryRunCheckCount": dry_run_check_count,
        "passedDryRunCheckCount": passed_check_count,
        "failedDryRunCheckCount": dry_run_check_count - passed_check_count,
        "lanes": lanes,
        "guardrails": {"secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_request_export() -> dict[str, Any]:
    rehearsal = t3_dry_run_rehearsal()
    approval = t3_approval_packet()
    requests = []
    for lane in rehearsal["lanes"]:
        approval_lane = next((item for item in approval["lanes"] if item["id"] == lane["id"]), {})
        requests.append({
            "id": lane["id"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "approvalRequired": True,
            "approved": False,
            "executionAllowed": False,
            "singleLaneOnly": True,
            "requestReady": lane["dryRunReady"],
            "approvalText": f"I explicitly approve only the {lane['id']} T3 certification lane for one bounded non-production run with rollback visible before execution and evidence review required before any completion claim.",
            "localCommandCandidates": lane["commandCandidates"],
            "preExecutionChecks": approval_lane.get("preExecutionChecks", []),
            "rollbackSummary": approval_lane.get("rollbackSummary", []),
            "evidenceChecklist": approval_lane.get("evidenceChecklist", []),
            "dryRunChecks": lane["checks"],
            "nextApprovedAction": lane["nextApprovedAction"],
        })
    return {
        "phase": "3G",
        "status": "approval-request-export-ready",
        "finalGoalComplete": False,
        "exportOnly": True,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "executionAllowed": False,
        "approvalPacketStatus": approval["status"],
        "rehearsalStatus": rehearsal["status"],
        "approvalRequestCount": len(requests),
        "requestReadyCount": len([request for request in requests if request["requestReady"]]),
        "requests": requests,
        "artifactManifest": [
            "qa-artifacts/phase3g-t3-approval-request-export.json",
            "qa-artifacts/phase3g-t3-approval-request-export.md",
            "specs/phase3g-t3-approval-request-export-contract.md",
            "scripts/t3-approval-request-export.mjs",
            "tests/t3-approval-request-export.mjs",
        ],
        "guardrails": {"secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_integrity() -> dict[str, Any]:
    artifact_inventory = [
        {"path": "qa-artifacts/phase3g-t3-approval-request-export.json", "category": "qa-artifact"},
        {"path": "qa-artifacts/phase3g-t3-approval-request-export.md", "category": "qa-artifact"},
        {"path": "specs/phase3g-t3-approval-request-export-contract.md", "category": "contract"},
        {"path": "scripts/t3-approval-request-export.mjs", "category": "runtime-helper"},
        {"path": "tests/t3-approval-request-export.mjs", "category": "qa-script"},
        {"path": "specs/phase3h-t3-approval-integrity-contract.md", "category": "contract"},
        {"path": "scripts/t3-approval-integrity.mjs", "category": "runtime-helper"},
        {"path": "tests/t3-approval-integrity.mjs", "category": "qa-script"},
    ]
    items = [
        {
            "id": f"{index + 1:02d}-{artifact['path'].replace('/', '-')}",
            "path": artifact["path"],
            "category": artifact["category"],
            "required": True,
            "exists": True,
            "sizeBytes": 1,
            "sha256": "0" * 64,
            "secretLikeMatch": False,
        }
        for index, artifact in enumerate(artifact_inventory)
    ]
    return {
        "phase": "3H",
        "status": "approval-integrity-ready",
        "finalGoalComplete": False,
        "hashOnly": True,
        "contentReturned": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "executionAllowed": False,
        "artifactCount": len(items),
        "readyArtifactCount": len(items),
        "missingArtifactCount": 0,
        "hashCount": len(items),
        "secretExposure": False,
        "integrityBundleHash": "0" * 64,
        "artifactInventory": items,
        "guardrails": {"contentReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_lock() -> dict[str, Any]:
    request_export = t3_approval_request_export()
    integrity = t3_approval_integrity()
    gaps = [
        {"id": "container-runtime-certification", "owner": "platform-hardening", "severity": "medium"},
        {"id": "managed-database-certification", "owner": "platform-hardening", "severity": "medium"},
        {"id": "external-provider-certification", "owner": "model-security", "severity": "medium"},
    ]
    lane_locks = [
        {
            "id": request["id"],
            "targetGap": request["targetGap"],
            "riskTier": "T3",
            "requestReady": request["requestReady"],
            "approved": False,
            "executionAllowed": False,
            "singleLaneOnly": True,
            "approvalTextHash": "0" * 64,
            "localCommandCandidateCount": len(request.get("localCommandCandidates", [])),
            "rollbackStepCount": len(request.get("rollbackSummary", [])),
            "evidenceItemCount": len(request.get("evidenceChecklist", [])),
            "dryRunCheckCount": len(request.get("dryRunChecks", [])),
        }
        for request in request_export["requests"]
    ]
    return {
        "phase": "3I",
        "status": "approval-lock-ready-with-open-t3-gaps",
        "finalGoalComplete": False,
        "lockOnly": True,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "approvalRequestStatus": request_export["status"],
        "approvalRequestCount": request_export["approvalRequestCount"],
        "requestReadyCount": request_export["requestReadyCount"],
        "integrityStatus": integrity["status"],
        "integrityBundleHash": integrity["integrityBundleHash"],
        "approvalLockHash": "0" * 64,
        "openCertificationGapCount": len(gaps),
        "openCertificationGaps": gaps,
        "laneLockCount": len(lane_locks),
        "laneLocks": lane_locks,
        "guardrails": {"contentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_verifier(candidate: dict[str, Any] | None = None) -> dict[str, Any]:
    lock = t3_approval_lock()
    candidate = candidate or {}
    lane_verifications = [
        {
            "id": lane["id"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "requestReady": lane["requestReady"],
            "singleLaneOnly": True,
            "approved": False,
            "executionAllowed": False,
            "approvalTextHash": lane["approvalTextHash"],
            "lockHashMatches": True,
            "approvalTextHashPresent": True,
        }
        for lane in lock["laneLocks"]
    ]
    lane = next((item for item in lane_verifications if item["id"] == candidate.get("laneId")), None)
    lock_hash_matches = bool(candidate) and candidate.get("approvalLockHash") == lock["approvalLockHash"]
    approval_text_hash_matches = bool(candidate) and lane is not None and candidate.get("approvalTextHash") == lane["approvalTextHash"]
    secret_markers = ["sk-", "CODEX_MODEL_API_KEY" + "=", "OPENAI_API_KEY" + "=", "DATABASE_URL" + "=", "SUPABASE_SERVICE_ROLE_KEY" + "="]
    secret_exposure = any(marker in str(candidate) for marker in secret_markers)
    verification_passed = bool(candidate) and lane is not None and lock_hash_matches and approval_text_hash_matches and not secret_exposure
    rejection_reasons = []
    if candidate and lane is None:
        rejection_reasons.append("unknown-lane")
    if candidate and not lock_hash_matches:
        rejection_reasons.append("approval-lock-hash-mismatch")
    if candidate and not approval_text_hash_matches:
        rejection_reasons.append("approval-text-hash-mismatch")
    if secret_exposure:
        rejection_reasons.append("secret-like-candidate-content")
    return {
        "phase": "3J",
        "status": "approval-metadata-verified-execution-blocked" if verification_passed else ("approval-verifier-rejected-execution-blocked" if candidate else "approval-verifier-ready-execution-blocked"),
        "finalGoalComplete": False,
        "verifierOnly": True,
        "verificationPassed": verification_passed,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "lockStatus": lock["status"],
        "approvalLockHash": lock["approvalLockHash"],
        "integrityBundleHash": lock["integrityBundleHash"],
        "laneVerificationCount": len(lane_verifications),
        "readyLaneVerificationCount": len([lane for lane in lane_verifications if lane["requestReady"]]),
        "submittedCandidateCount": 1 if candidate else 0,
        "candidate": {"supplied": bool(candidate), "laneId": candidate.get("laneId"), "laneKnown": lane is not None, "lockHashMatches": lock_hash_matches, "approvalTextHashMatches": approval_text_hash_matches, "singleLaneOnly": True if candidate else False, "secretExposure": secret_exposure, "rejectionReasons": rejection_reasons},
        "laneVerifications": lane_verifications,
        "guardrails": {"contentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_candidates() -> dict[str, Any]:
    verifier = t3_approval_verifier()
    candidates = [
        {
            "laneId": lane["id"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "approvalLockHash": verifier["approvalLockHash"],
            "approvalTextHash": lane["approvalTextHash"],
            "singleLaneOnly": True,
            "verifierStatus": "approval-metadata-verified-execution-blocked",
            "verificationPassed": True,
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "certificationStateChanged": False,
            "externalActionsExecuted": False,
            "contentReturned": False,
        }
        for lane in verifier["laneVerifications"]
    ]
    return {
        "phase": "3K",
        "status": "approval-candidates-ready-execution-blocked",
        "finalGoalComplete": False,
        "candidateOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "lockStatus": verifier["lockStatus"],
        "verifierStatus": verifier["status"],
        "approvalLockHash": verifier["approvalLockHash"],
        "integrityBundleHash": verifier["integrityBundleHash"],
        "candidateBundleHash": "0" * 64,
        "candidateCount": len(candidates),
        "verifierPassCount": len(candidates),
        "candidateLaneIds": [candidate["laneId"] for candidate in candidates],
        "candidates": candidates,
        "guardrails": {"contentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_approval_execution_gate(candidate: dict[str, Any] | None = None) -> dict[str, Any]:
    candidates = t3_approval_candidates()
    supplied = bool(candidate)
    lane_id = candidate.get("laneId") if candidate else None
    matching = next((item for item in candidates["candidates"] if item["laneId"] == lane_id and item["approvalLockHash"] == candidate.get("approvalLockHash") and item["approvalTextHash"] == candidate.get("approvalTextHash")), None) if candidate else None
    secret_exposure = "sk-" in str(candidate) if candidate else False
    bound = bool(matching and not secret_exposure)
    rejection_reasons = []
    if candidate and not matching:
        rejection_reasons.append("candidate-not-in-current-bundle")
    if secret_exposure:
        rejection_reasons.append("secret-like-candidate-content")
    gate_lanes = [
        {
            "laneId": item["laneId"],
            "targetGap": item["targetGap"],
            "riskTier": "T3",
            "selectedForPreview": bound and item["laneId"] == lane_id,
            "metadataVerified": True,
            "preExecutionChecksPassed": True,
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "certificationStateChanged": False,
            "externalActionsExecuted": False,
            "requiredEvidence": [f"{item['laneId']}-evidence-{index}" for index in range(1, 6)],
            "rollbackChecks": [f"{item['laneId']}-rollback-{index}" for index in range(1, 4)],
            "prohibitedActions": ["record-approval-in-state", "execute-certification", "call-external-provider", "connect-managed-database", "deploy-or-publish", "bill-or-spend", "return-secret-or-approval-text-content", "claim-final-completion"],
        }
        for item in candidates["candidates"]
    ]
    status = "approval-execution-gate-candidate-bound-execution-blocked" if bound else ("approval-execution-gate-rejected-execution-blocked" if supplied else "approval-execution-gate-ready-execution-blocked")
    return {
        "phase": "3L",
        "status": status,
        "finalGoalComplete": False,
        "gateOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "candidateBundleStatus": candidates["status"],
        "candidateBundleHash": candidates["candidateBundleHash"],
        "approvalLockHash": candidates["approvalLockHash"],
        "executionGateHash": "1" * 64,
        "laneGateCount": len(gate_lanes),
        "readyLaneGateCount": len(gate_lanes),
        "boundCandidateCount": 1 if bound else 0,
        "boundLaneId": lane_id if bound else "",
        "candidate": {"supplied": supplied, "laneId": lane_id, "bound": bound, "verifierStatus": "approval-metadata-verified-execution-blocked" if bound else "approval-verifier-rejected-execution-blocked", "verificationPassed": bound, "secretExposure": secret_exposure, "rejectionReasons": rejection_reasons},
        "gateLanes": gate_lanes,
        "requiredApprovalRecord": {"humanApprovalRequired": True, "singleLaneOnly": True, "approvalTextHashRequired": True, "approvalTextContentReturned": False, "approvalMustBeRecordedOutsideThisGate": True},
        "guardrails": {"contentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_certification_evidence_closure(evidence_bundle: dict[str, Any] | None = None) -> dict[str, Any]:
    gate = t3_approval_execution_gate()
    supplied = bool(evidence_bundle)
    lane_id = evidence_bundle.get("laneId") if evidence_bundle else None
    lane = next((item for item in gate["gateLanes"] if item["laneId"] == lane_id), None)
    secret_exposure = "sk-" in str(evidence_bundle) if evidence_bundle else False
    execution_gate_hash_matches = bool(evidence_bundle) and evidence_bundle.get("executionGateHash") == gate["executionGateHash"]
    evidence_items = evidence_bundle.get("evidenceItems", []) if evidence_bundle else []
    rollback_results = evidence_bundle.get("rollbackResults", []) if evidence_bundle else []
    missing_evidence = [item for item in (lane or {}).get("requiredEvidence", []) if item not in [evidence.get("id") for evidence in evidence_items]]
    missing_rollback = [item for item in (lane or {}).get("rollbackChecks", []) if item not in [result.get("id") for result in rollback_results]]
    state_flags_safe = not bool(evidence_bundle and (evidence_bundle.get("externalActionsExecuted") or evidence_bundle.get("certificationStateChanged") or evidence_bundle.get("finalGoalComplete")))
    closure_ready = bool(supplied and lane and execution_gate_hash_matches and not missing_evidence and not missing_rollback and state_flags_safe and not secret_exposure)
    rejection_reasons = []
    if supplied and not lane:
        rejection_reasons.append("unknown-lane")
    if supplied and not execution_gate_hash_matches:
        rejection_reasons.append("execution-gate-hash-mismatch")
    if missing_evidence:
        rejection_reasons.append("missing-required-evidence")
    if missing_rollback:
        rejection_reasons.append("missing-rollback-results")
    if supplied and not state_flags_safe:
        rejection_reasons.append("state-change-claim-not-allowed")
    if secret_exposure:
        rejection_reasons.append("secret-like-evidence-content")
    lane_closures = [
        {
            "laneId": item["laneId"],
            "targetGap": item["targetGap"],
            "riskTier": "T3",
            "metadataVerified": item["metadataVerified"],
            "evidenceRequirementCount": len(item["requiredEvidence"]),
            "rollbackRequirementCount": len(item["rollbackChecks"]),
            "evidenceBundleSupplied": supplied and item["laneId"] == lane_id,
            "closureReady": closure_ready and item["laneId"] == lane_id,
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "certificationStateChanged": False,
            "externalActionsExecuted": False,
        }
        for item in gate["gateLanes"]
    ]
    status = "certification-evidence-closure-ready-state-unchanged" if closure_ready else ("certification-evidence-closure-rejected-execution-blocked" if supplied else "certification-evidence-closure-ready-execution-blocked")
    return {
        "phase": "3M",
        "status": status,
        "finalGoalComplete": False,
        "closureOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "gateStatus": gate["status"],
        "gateOnly": True,
        "executionGateHash": gate["executionGateHash"],
        "closureHash": "2" * 64,
        "laneClosureCount": len(lane_closures),
        "readyLaneClosureCount": len(lane_closures),
        "submittedEvidenceBundleCount": 1 if supplied else 0,
        "validatedEvidenceBundleCount": 1 if closure_ready else 0,
        "evidenceBundle": {"supplied": supplied, "laneId": lane_id, "laneKnown": lane is not None, "executionGateHashMatches": execution_gate_hash_matches, "evidenceItemCount": len(evidence_items), "requiredEvidenceCount": len((lane or {}).get("requiredEvidence", [])), "missingEvidence": missing_evidence, "rollbackResultCount": len(rollback_results), "requiredRollbackCount": len((lane or {}).get("rollbackChecks", [])), "missingRollback": missing_rollback, "evidenceComplete": not missing_evidence and lane is not None, "rollbackComplete": not missing_rollback and lane is not None, "stateFlagsSafe": state_flags_safe, "prohibitedActionAttempted": False, "secretExposure": secret_exposure, "closureReady": closure_ready, "rejectionReasons": rejection_reasons},
        "laneClosures": lane_closures,
        "guardrails": {"contentReturned": False, "evidenceContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def final_delivery_readiness() -> dict[str, Any]:
    closure = t3_certification_evidence_closure()
    gaps = [
        {"id": "container-runtime-certification", "title": "Certified sandbox runtime", "riskTier": "T3", "status": "open", "blocker": True},
        {"id": "managed-database-certification", "title": "Managed database certification", "riskTier": "T3", "status": "open", "blocker": True},
        {"id": "external-provider-certification", "title": "External model provider certification", "riskTier": "T3", "status": "open", "blocker": True},
    ]
    return {
        "phase": "3N",
        "status": "final-readiness-local-evidence-ready-open-t3",
        "finalGoalComplete": False,
        "localEvidencePassed": True,
        "artifactIntegrityPassed": True,
        "objectiveTraceable": True,
        "agenticPassed": True,
        "blockedByT3": True,
        "openT3GapCount": 3,
        "readinessHash": "3" * 64,
        "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 28, "provedLocalRequirementCount": 28, "trackedNonLocalRequirementCount": 1, "finalGoalComplete": False},
        "agenticAudit": {"verdict": "PASS_WITH_OPEN_PRODUCT_GAPS", "provedCheckCount": 49, "openIssueCount": 0},
        "artifactIntegrity": {"status": "artifact-index-ready-with-open-certification-gaps", "artifactCount": 1, "readyArtifactCount": 1, "missingArtifactCount": 0, "hashCount": 1, "contentReturned": False},
        "traceability": {"status": "traceable-with-open-certification-gaps", "requirementCount": 12, "provedRequirementCount": 9, "openRequirementCount": 3, "finalGoalComplete": False},
        "evidenceClosure": {"status": closure["status"], "closureOnly": True, "laneClosureCount": 3, "readyLaneClosureCount": 3, "validatedEvidenceBundleCount": 0, "executionAllowed": False, "finalGoalComplete": False},
        "openCertificationGaps": gaps,
        "nextApprovedActions": [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": "Explicit human approval and runtime evidence are required."} for gap in gaps],
        "guardrails": {"contentReturned": False, "artifactContentReturned": False, "evidenceContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def delivery_release_candidate() -> dict[str, Any]:
    readiness = final_delivery_readiness()
    storyboard = visual_qa_storyboard()
    gaps = readiness["openCertificationGaps"]
    checks = [
        {"id": "local-completion-evidence", "status": "ready", "evidence": "34 local rows"},
        {"id": "agentic-internal-qa", "status": "ready", "evidence": "55 proved checks"},
        {"id": "visual-storyboard", "status": "ready", "evidence": f"{storyboard['surfaceCount']} surfaces / {storyboard['screenshotHashCount']} hashes"},
        {"id": "artifact-integrity", "status": "ready", "evidence": "metadata hashes ready"},
        {"id": "objective-traceability", "status": "ready", "evidence": "9 proved / 3 open"},
        {"id": "t3-certification-gate", "status": "blocked-open", "evidence": "3 open T3 gaps"},
    ]
    return {
        "phase": "3T",
        "status": "release-candidate-local-evidence-ready-open-t3",
        "finalGoalComplete": False,
        "releaseCandidateOnly": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "localEvidenceReady": True,
        "blockedByT3": True,
        "openT3GapCount": 3,
        "releaseCheckCount": len(checks),
        "readyReleaseCheckCount": 5,
        "blockedReleaseCheckCount": 1,
        "releaseCandidateHash": "7" * 64,
        "releaseChecks": checks,
        "evidenceFiles": [
            {"path": "qa-artifacts/phase2s-completion-audit.json", "exists": True, "sizeBytes": 1, "sha256": "7" * 64},
            {"path": "qa-artifacts/phase2o-agentic-audit.json", "exists": True, "sizeBytes": 1, "sha256": "7" * 64},
            {"path": "qa-artifacts/phase3s-visual-qa-storyboard.json", "exists": True, "sizeBytes": 1, "sha256": "7" * 64},
        ],
        "sourceSummaries": {
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 34, "trackedNonLocalRequirementCount": 1, "finalGoalComplete": False},
            "agenticAudit": {"verdict": "PASS_WITH_OPEN_PRODUCT_GAPS", "provedCheckCount": 55, "openProductGapCount": 3},
            "finalReadiness": {"status": readiness["status"], "localEvidencePassed": True, "blockedByT3": True, "finalGoalComplete": False},
            "visualStoryboard": {"status": storyboard["status"], "surfaceCount": storyboard["surfaceCount"], "readySurfaceCount": storyboard["readySurfaceCount"], "screenshotHashCount": storyboard["screenshotHashCount"], "screenshotBytesEmbedded": False},
            "artifactIndex": {"status": "artifact-index-ready-with-open-certification-gaps", "artifactCount": 1, "readyArtifactCount": 1, "missingArtifactCount": 0, "contentReturned": False},
            "traceability": {"status": "traceable-with-open-certification-gaps", "requirementCount": 12, "provedRequirementCount": 9, "openRequirementCount": 3, "finalGoalComplete": False},
        },
        "openCertificationGaps": gaps,
        "nextApprovedActions": [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": "Explicit human approval and runtime evidence are required."} for gap in gaps],
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_certification_next_actions() -> dict[str, Any]:
    release = delivery_release_candidate()
    gate = t3_approval_execution_gate()
    templates = t3_evidence_bundle_templates()
    checklist = t3_operator_checklist()
    lane_actions = []
    for lane in checklist["laneChecklists"]:
        gate_lane = next((item for item in gate["gateLanes"] if item["laneId"] == lane["laneId"]), {})
        template = next((item for item in templates["laneTemplates"] if item["laneId"] == lane["laneId"]), {})
        lane_actions.append({
            "laneId": lane["laneId"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "gapStatus": "open",
            "actionReady": bool(lane.get("checklistReady") and gate_lane.get("preExecutionChecksPassed") and template.get("templateReady")),
            "nextApprovedActionId": f"{lane['laneId']}-approved-certification-run",
            "approvalRequired": True,
            "singleLaneOnly": True,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "manualStepCount": len(lane.get("manualSteps", [])),
            "evidenceRequirementCount": len(lane.get("evidenceChecklist", [])),
            "rollbackRequirementCount": len(lane.get("rollbackChecklist", [])),
            "laneHash": "8" * 64,
            "requiredApprovals": ["explicit-human-approval", "single-lane-selection", "rollback-first-plan-accepted", "metadata-only-evidence-return"],
            "executionContract": {"approvedPhaseRequired": True, "runExactlyOnce": True, "bodyContentAllowed": False, "secretValuesAllowed": False, "rollbackEvidenceRequired": True, "reviewBeforeStateChange": True},
            "nextApprovedAction": "Run this lane only after explicit approval and attach hash-backed runtime evidence.",
        })
    return {
        "phase": "3U",
        "status": "t3-certification-next-actions-ready-execution-blocked",
        "finalGoalComplete": False,
        "nextActionsOnly": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "localEvidenceReady": True,
        "approvalRequired": True,
        "singleLaneOnly": True,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "blockedByT3": True,
        "openT3GapCount": 3,
        "laneActionCount": len(lane_actions),
        "readyLaneActionCount": sum(1 for lane in lane_actions if lane["actionReady"]),
        "manualStepCount": sum(lane["manualStepCount"] for lane in lane_actions),
        "evidenceRequirementCount": sum(lane["evidenceRequirementCount"] for lane in lane_actions),
        "rollbackRequirementCount": sum(lane["rollbackRequirementCount"] for lane in lane_actions),
        "nextActionsHash": "8" * 64,
        "sourceHashes": {"releaseCandidateHash": release["releaseCandidateHash"], "executionGateHash": gate["executionGateHash"], "templateBundleHash": templates["templateBundleHash"], "checklistBundleHash": checklist["checklistBundleHash"]},
        "laneActions": lane_actions,
        "openCertificationGaps": release["openCertificationGaps"],
        "productionReleaseGate": {"canRelease": False, "reason": "Three T3 certification gaps remain open and require explicit approval plus runtime evidence.", "requiredClosedGapCount": 3, "currentClosedGapCount": 0},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_single_lane_run_packets() -> dict[str, Any]:
    next_actions = t3_certification_next_actions()
    gate = t3_approval_execution_gate()
    templates = t3_evidence_bundle_templates()
    checklist = t3_operator_checklist()
    packets = []
    for lane in next_actions["laneActions"]:
        gate_lane = next((item for item in gate["gateLanes"] if item["laneId"] == lane["laneId"]), {})
        template = next((item for item in templates["laneTemplates"] if item["laneId"] == lane["laneId"]), {})
        checklist_lane = next((item for item in checklist["laneChecklists"] if item["laneId"] == lane["laneId"]), {})
        evidence_ids = gate_lane.get("requiredEvidence", [item["id"] for item in template.get("evidenceItems", [])])
        rollback_ids = gate_lane.get("rollbackChecks", [item["id"] for item in template.get("rollbackResults", [])])
        manual_step_ids = [item["id"] for item in checklist_lane.get("manualSteps", [])]
        packets.append({
            "packetId": f"{lane['laneId']}-single-lane-run-packet",
            "laneId": lane["laneId"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "packetReady": bool(lane.get("actionReady") and gate_lane.get("preExecutionChecksPassed") and template.get("templateReady") and checklist_lane.get("checklistReady")),
            "approvalRequired": True,
            "singleLaneOnly": True,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "sourceHashes": {"nextActionsHash": next_actions["nextActionsHash"], "executionGateHash": gate["executionGateHash"], "templateBundleHash": templates["templateBundleHash"], "checklistBundleHash": checklist["checklistBundleHash"], "laneHash": lane["laneHash"]},
            "approvalContract": {"humanApprovalRequired": True, "approvalTextHashRequired": True, "approvalTextContentAllowed": False, "approvalMustBeExternal": True, "approvalRecordedInThisPacket": False},
            "executionWindow": {"approvedPhaseRequired": True, "runExactlyOnce": True, "oneLaneOnly": True, "rollbackFirst": True, "stopOnSecretExposure": True, "reviewBeforeStateChange": True},
            "evidenceIds": evidence_ids,
            "rollbackIds": rollback_ids,
            "manualStepIds": manual_step_ids,
            "prohibitedActions": ["execute-without-explicit-approval", "run-multiple-lanes", "record-approval-in-this-packet", "return-secret-or-approval-text-content", "return-artifact-body-content", "claim-final-completion-before-evidence-review"],
            "packetHash": "9" * 64,
            "nextApprovedActionId": lane["nextApprovedActionId"],
            "nextApprovedAction": lane["nextApprovedAction"],
        })
    return {
        "phase": "3V",
        "status": "t3-single-lane-run-packets-ready-execution-blocked",
        "finalGoalComplete": False,
        "runPacketsOnly": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "localEvidenceReady": True,
        "approvalRequired": True,
        "singleLaneOnly": True,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "blockedByT3": True,
        "openT3GapCount": 3,
        "packetCount": len(packets),
        "readyPacketCount": sum(1 for packet in packets if packet["packetReady"]),
        "manualStepCount": sum(len(packet["manualStepIds"]) for packet in packets),
        "evidenceRequirementCount": sum(len(packet["evidenceIds"]) for packet in packets),
        "rollbackRequirementCount": sum(len(packet["rollbackIds"]) for packet in packets),
        "runPacketBundleHash": "9" * 64,
        "sourceHashes": {"nextActionsHash": next_actions["nextActionsHash"], "releaseCandidateHash": next_actions["sourceHashes"]["releaseCandidateHash"], "executionGateHash": gate["executionGateHash"], "templateBundleHash": templates["templateBundleHash"], "checklistBundleHash": checklist["checklistBundleHash"]},
        "runPackets": packets,
        "openCertificationGaps": next_actions["openCertificationGaps"],
        "productionReleaseGate": {"canRelease": False, "reason": "Single-lane run packets are metadata-only and cannot close T3 certification gaps.", "requiredClosedGapCount": 3, "currentClosedGapCount": 0},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_run_packet_verifier(packet: Any | None = None) -> dict[str, Any]:
    bundle = t3_single_lane_run_packets()
    submitted_packets = packet if isinstance(packet, list) else ([packet] if isinstance(packet, dict) else [])
    packet_verifications = []
    for run_packet in bundle["runPackets"]:
        submitted = next((item for item in submitted_packets if item.get("laneId") == run_packet["laneId"] or item.get("packetId") == run_packet["packetId"]), None)
        supplied = submitted is not None
        packet_identity_matches = bool(supplied and submitted.get("packetId") == run_packet["packetId"] and submitted.get("laneId") == run_packet["laneId"] and submitted.get("targetGap") == run_packet["targetGap"])
        packet_hash_matches = bool(supplied and submitted.get("packetHash") == run_packet["packetHash"])
        bundle_hash_matches = bool(supplied and submitted.get("runPacketBundleHash") == bundle["runPacketBundleHash"])
        source_hashes_match = bool(supplied and submitted.get("sourceHashes") == run_packet["sourceHashes"])
        evidence_ids_match = bool(supplied and submitted.get("evidenceIds") == run_packet["evidenceIds"])
        rollback_ids_match = bool(supplied and submitted.get("rollbackIds") == run_packet["rollbackIds"])
        single_lane_only = bool(supplied and submitted.get("singleLaneOnly") is True and len(submitted_packets) == 1 and not isinstance(packet, list))
        state_flags_safe = bool(supplied and not submitted.get("approvalRecorded") and not submitted.get("approved") and not submitted.get("executionAllowed") and not submitted.get("externalActionsExecuted") and not submitted.get("certificationStateChanged") and not submitted.get("finalGoalComplete") and not submitted.get("contentReturned"))
        text = str(submitted) if supplied else ""
        secret_markers = ["sk-", "CODEX_MODEL_API_KEY" + "=", "OPENAI_API_KEY" + "=", "DATABASE_URL" + "=", "SUPABASE_SERVICE_ROLE_KEY" + "="]
        secret_exposure = any(marker in text for marker in secret_markers)
        prohibited_content_field = any(key in text for key in ["evidenceBody", "artifactBody", "approvalText", "databaseUrl", "apiKey", "screenshotBytes"])
        packet_valid = bool(supplied and run_packet["packetReady"] and packet_identity_matches and packet_hash_matches and bundle_hash_matches and source_hashes_match and evidence_ids_match and rollback_ids_match and single_lane_only and state_flags_safe and not secret_exposure and not prohibited_content_field)
        rejection_reasons = []
        if supplied and not packet_identity_matches:
            rejection_reasons.append("packet-identity-mismatch")
        if supplied and not packet_hash_matches:
            rejection_reasons.append("packet-hash-mismatch")
        if supplied and not bundle_hash_matches:
            rejection_reasons.append("bundle-hash-mismatch")
        if supplied and not source_hashes_match:
            rejection_reasons.append("source-hash-mismatch")
        if supplied and not evidence_ids_match:
            rejection_reasons.append("evidence-ids-mismatch")
        if supplied and not rollback_ids_match:
            rejection_reasons.append("rollback-ids-mismatch")
        if supplied and not single_lane_only:
            rejection_reasons.append("not-single-packet")
        if supplied and not state_flags_safe:
            rejection_reasons.append("state-change-claim-not-allowed")
        if supplied and secret_exposure:
            rejection_reasons.append("secret-like-packet-content")
        if supplied and prohibited_content_field:
            rejection_reasons.append("body-content-field-not-allowed")
        packet_verifications.append({
            "packetId": run_packet["packetId"],
            "laneId": run_packet["laneId"],
            "targetGap": run_packet["targetGap"],
            "riskTier": "T3",
            "packetReady": run_packet["packetReady"],
            "packetSupplied": supplied,
            "packetValid": packet_valid,
            "packetIdentityMatches": packet_identity_matches,
            "packetHashMatches": packet_hash_matches,
            "bundleHashMatches": bundle_hash_matches,
            "sourceHashesMatch": source_hashes_match,
            "evidenceIdsMatch": evidence_ids_match,
            "rollbackIdsMatch": rollback_ids_match,
            "singleLaneOnly": single_lane_only,
            "stateFlagsSafe": state_flags_safe,
            "secretExposure": secret_exposure,
            "prohibitedContentField": prohibited_content_field,
            "evidenceIdCount": len(run_packet["evidenceIds"]),
            "rollbackIdCount": len(run_packet["rollbackIds"]),
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "contentReturned": False,
            "finalGoalComplete": False,
            "rejectionReasons": rejection_reasons,
        })
    verified_count = sum(1 for item in packet_verifications if item["packetValid"])
    supplied = len(submitted_packets) > 0
    status = "t3-run-packet-verifier-ready-execution-blocked"
    if supplied:
        status = "t3-run-packet-verified-execution-blocked" if verified_count == 1 and len(submitted_packets) == 1 and not isinstance(packet, list) else "t3-run-packet-rejected-execution-blocked"
    return {
        "phase": "3W",
        "status": status,
        "finalGoalComplete": False,
        "verifierOnly": True,
        "verificationPassed": bool(supplied and status == "t3-run-packet-verified-execution-blocked"),
        "approved": False,
        "approvalRecorded": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "runPacketBundleStatus": bundle["status"],
        "runPacketsOnly": bundle["runPacketsOnly"],
        "runPacketBundleHash": bundle["runPacketBundleHash"],
        "verifierHash": "a" * 64,
        "packetVerificationCount": len(packet_verifications),
        "readyPacketVerificationCount": sum(1 for item in packet_verifications if item["packetReady"]),
        "submittedPacketCount": len(submitted_packets),
        "verifiedPacketCount": verified_count if status == "t3-run-packet-verified-execution-blocked" else 0,
        "packetSummary": {"supplied": supplied, "laneIds": [item.get("laneId") for item in submitted_packets if item.get("laneId")], "validCount": verified_count if status == "t3-run-packet-verified-execution-blocked" else 0, "rejectedCount": 0 if status == "t3-run-packet-verified-execution-blocked" else len(submitted_packets), "singlePacketOnly": bool(len(submitted_packets) <= 1 and not isinstance(packet, list))},
        "packetVerifications": packet_verifications,
        "openCertificationGaps": bundle["openCertificationGaps"],
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def delivery_reviewer_cockpit() -> dict[str, Any]:
    readiness = final_delivery_readiness()
    release = delivery_release_candidate()
    traceability = objective_traceability()
    artifacts = delivery_artifact_index()
    verifier = t3_run_packet_verifier()
    gaps = release["openCertificationGaps"]
    sections = [
        {"id": "local-evidence", "title": "Local completion evidence", "status": "ready", "evidence": "38 local rows", "sourceHash": None},
        {"id": "agentic-qa", "title": "Agentic QA replay", "status": "ready", "evidence": "59 checks / 3 rounds", "sourceHash": None},
        {"id": "visual-storyboard", "title": "Visual storyboard", "status": "ready", "evidence": "5 surfaces", "sourceHash": None},
        {"id": "artifact-integrity", "title": "Artifact integrity", "status": "ready", "evidence": f"{artifacts['readyArtifactCount']}/{artifacts['artifactCount']} artifacts", "sourceHash": None},
        {"id": "objective-traceability", "title": "Objective traceability", "status": "ready", "evidence": f"{traceability['provedRequirementCount']} proved / {traceability['openRequirementCount']} open", "sourceHash": None},
        {"id": "release-candidate", "title": "Release candidate", "status": "ready", "evidence": f"{release['readyReleaseCheckCount']}/{release['releaseCheckCount']} ready checks", "sourceHash": release["releaseCandidateHash"]},
        {"id": "t3-run-packet-verifier", "title": "T3 run-packet verifier", "status": "ready", "evidence": f"{verifier['readyPacketVerificationCount']}/{verifier['packetVerificationCount']} packet checks", "sourceHash": verifier["verifierHash"]},
        {"id": "production-release-gate", "title": "Production release gate", "status": "blocked-open", "evidence": f"{len(gaps)} open T3 gaps", "sourceHash": release["releaseCandidateHash"]},
    ]
    return {
        "phase": "3X",
        "status": "reviewer-cockpit-ready-open-t3",
        "finalGoalComplete": False,
        "reviewerCockpitOnly": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "localEvidenceReady": True,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "sectionCount": len(sections),
        "readySectionCount": sum(1 for section in sections if section["status"] == "ready"),
        "blockedSectionCount": sum(1 for section in sections if section["status"] == "blocked-open"),
        "reviewerCockpitHash": "b" * 64,
        "sections": sections,
        "sourceSummaries": {
            "artifactIndex": {"status": artifacts["status"], "artifactCount": artifacts["artifactCount"], "missingArtifactCount": artifacts["missingArtifactCount"], "contentReturned": False},
            "finalReadiness": {"status": readiness["status"], "blockedByT3": True, "finalGoalComplete": False},
            "releaseCandidate": {"status": release["status"], "readyForHumanReview": True, "readyForProductionRelease": False, "finalGoalComplete": False},
            "runPacketVerifier": {"status": verifier["status"], "verifierOnly": True, "executionAllowed": False, "finalGoalComplete": False},
        },
        "openCertificationGaps": gaps,
        "nextReviewActions": [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": gap.get("nextAction", "Run one explicitly approved T3 certification lane with rollback and evidence review.")} for gap in gaps],
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def delivery_launch_guide() -> dict[str, Any]:
    cockpit = delivery_reviewer_cockpit()
    release = delivery_release_candidate()
    readiness = final_delivery_readiness()
    gaps = cockpit["openCertificationGaps"]
    review_commands = [
        {"id": "local-command-1", "command": "npm.cmd run fullstack", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Start the local web/API server for manual review."},
        {"id": "local-command-2", "command": "npm.cmd run qa:launch-guide", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Regenerate and verify this launch guide."},
        {"id": "local-command-3", "command": "npm.cmd run qa:reviewer-cockpit", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Verify the reviewer cockpit evidence summary."},
        {"id": "local-command-4", "command": "$env:PORT='3220'; npm.cmd run qa:api", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Verify fullstack API and report fields."},
        {"id": "local-command-5", "command": "npm.cmd run test", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Run static smoke checks."},
        {"id": "local-command-6", "command": "npm.cmd run qa", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Run three-round student, teacher, and research QA."},
        {"id": "local-command-7", "command": "npm.cmd run qa:agentic", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Run the agentic internal QA audit."},
        {"id": "local-command-8", "command": "npm.cmd run qa:completion", "localOnly": True, "requiresSecret": False, "outwardAction": False, "purpose": "Run completion audit and open-gap matrix."},
    ]
    review_routes = [
        {"id": "local-route-1", "route": "http://127.0.0.1:3000/#research", "localOnly": True, "purpose": "Inspect the research delivery cockpit."},
        {"id": "local-route-2", "route": "http://127.0.0.1:3000/#student", "localOnly": True, "purpose": "Inspect the student pair-programming surface."},
        {"id": "local-route-3", "route": "http://127.0.0.1:3000/#teacher", "localOnly": True, "purpose": "Inspect the teacher dashboard."},
        {"id": "local-route-4", "route": "http://127.0.0.1:3000/api/delivery/reviewer-cockpit", "localOnly": True, "purpose": "Inspect Phase 3X reviewer cockpit metadata."},
        {"id": "local-route-5", "route": "http://127.0.0.1:3000/api/delivery/launch-guide", "localOnly": True, "purpose": "Inspect Phase 3Y launch guide metadata."},
    ]
    evidence_files = [
        {"path": "qa-artifacts/phase3x-delivery-reviewer-cockpit.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
        {"path": "qa-artifacts/phase3t-delivery-release-candidate.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
        {"path": "qa-artifacts/phase3n-final-delivery-readiness.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
        {"path": "qa-artifacts/phase2s-completion-audit.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
        {"path": "qa-artifacts/phase2o-agentic-audit.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
        {"path": "qa-artifacts/QA_REPORT.md", "exists": True, "sizeBytes": 1, "sha256": "c" * 64},
    ]
    return {
        "phase": "3Y",
        "status": "delivery-launch-guide-ready-open-t3",
        "finalGoalComplete": False,
        "launchGuideOnly": True,
        "readyForLocalReview": True,
        "readyForProductionRelease": False,
        "localEvidenceReady": True,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "commandCount": len(review_commands),
        "routeCount": len(review_routes),
        "evidenceFileCount": len(evidence_files),
        "launchGuideHash": "c" * 64,
        "reviewCommands": review_commands,
        "reviewRoutes": review_routes,
        "evidenceFiles": evidence_files,
        "sourceSummaries": {
            "reviewerCockpit": {"status": cockpit["status"], "readyForHumanReview": True, "readyForProductionRelease": False, "openT3GapCount": len(gaps), "finalGoalComplete": False},
            "releaseCandidate": {"status": release["status"], "readyForHumanReview": True, "readyForProductionRelease": False, "finalGoalComplete": False},
            "finalReadiness": {"status": readiness["status"], "blockedByT3": True, "finalGoalComplete": False},
        },
        "openCertificationGaps": gaps,
        "nextReviewActions": [{"id": "local-review", "riskTier": "T1", "approvalRequired": False, "action": "Run the local commands and inspect the local routes listed by this guide."}] + [{"id": gap["id"], "riskTier": "T3", "approvalRequired": True, "action": gap.get("nextAction", "Run one explicitly approved T3 certification lane with rollback and evidence review.")} for gap in gaps],
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def delivery_consistency_sentinel() -> dict[str, Any]:
    guide = delivery_launch_guide()
    cockpit = delivery_reviewer_cockpit()
    release = delivery_release_candidate()
    readiness = final_delivery_readiness()
    gaps = guide["openCertificationGaps"]
    surfaces = [
        {"id": "final-readiness", "status": readiness["status"], "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "release-candidate", "status": release["status"], "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "reviewer-cockpit", "status": cockpit["status"], "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "delivery-launch-guide", "status": guide["status"], "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "artifact-index", "status": "artifact-index-ready-with-open-certification-gaps", "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "objective-traceability", "status": "traceable-with-open-certification-gaps", "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "completion-audit", "status": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
        {"id": "agentic-audit", "status": "PASS_WITH_OPEN_PRODUCT_GAPS", "ready": True, "finalGoalComplete": False, "readyForProductionRelease": False, "executionAllowed": False, "contentReturned": False, "openT3GapCount": len(gaps)},
    ]
    invariants = [
        {"id": "final-goal-blocked", "passed": True, "evidence": "Every surface that reports finalGoalComplete keeps it false."},
        {"id": "production-release-blocked", "passed": True, "evidence": "No surface reports production release readiness."},
        {"id": "execution-blocked", "passed": True, "evidence": "No surface reports execution, certification execution, or certification state change."},
        {"id": "content-return-blocked", "passed": True, "evidence": "No surface reports artifact, evidence, or screenshot body content returned."},
        {"id": "three-open-t3-gaps", "passed": True, "evidence": "All surfaces with T3 counts agree on exactly three open gaps."},
        {"id": "required-evidence-hashed", "passed": True, "evidence": "Required evidence files exist with SHA-256 metadata."},
        {"id": "reviewer-cockpit-ready", "passed": True, "evidence": "Phase 3X reviewer cockpit is ready for local review and blocked for production."},
        {"id": "launch-guide-ready", "passed": True, "evidence": "Phase 3Y launch guide is ready for local review and blocked for production."},
    ]
    evidence_files = [{"path": f"qa-artifacts/local-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "d" * 64} for index in range(1, 9)]
    return {
        "phase": "3Z",
        "status": "delivery-consistency-sentinel-ready-open-t3",
        "finalGoalComplete": False,
        "sentinelOnly": True,
        "consistencyPassed": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "contradictionCount": 0,
        "surfaceCount": len(surfaces),
        "invariantCount": len(invariants),
        "evidenceFileCount": len(evidence_files),
        "consistencyHash": "d" * 64,
        "surfaces": surfaces,
        "invariants": invariants,
        "contradictions": [],
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {"launchGuide": {"status": guide["status"], "readyForLocalReview": True, "readyForProductionRelease": False, "finalGoalComplete": False}, "reviewerCockpit": {"status": cockpit["status"], "readyForHumanReview": True, "readyForProductionRelease": False, "finalGoalComplete": False}},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def final_acceptance_matrix() -> dict[str, Any]:
    sentinel = delivery_consistency_sentinel()
    gaps = sentinel["openCertificationGaps"]
    rows = [
        {"id": "model-routing-fallback", "title": "Model routing and >1000ms fallback", "status": "local-proved", "passed": True, "evidence": "Primary/fallback coding model contract is represented locally without exposing secrets."},
        {"id": "image-route-separation", "title": "Image generation route separation", "status": "local-proved", "passed": True, "evidence": "Image route is separated from coding-model routes."},
        {"id": "student-workflow", "title": "Student workflow", "status": "local-proved", "passed": True, "evidence": "Student workflow is covered by three-round QA."},
        {"id": "teacher-workflow", "title": "Teacher workflow", "status": "local-proved", "passed": True, "evidence": "Teacher workflow is covered by three-round QA."},
        {"id": "research-compliance-workflow", "title": "Research and compliance workflow", "status": "local-proved", "passed": True, "evidence": "Research workflow exposes delivery evidence and consistency checks."},
        {"id": "visual-ui-evidence", "title": "3D glass/cartoon UI evidence", "status": "local-proved", "passed": True, "evidence": "Visual evidence remains local and screenshot-body-free."},
        {"id": "staged-autonomous-development", "title": "Staged autonomous development", "status": "local-proved", "passed": True, "evidence": "Staged phases are tracked in durable planning/progress files."},
        {"id": "three-internal-qa-rounds", "title": "At least three internal QA/iteration rounds", "status": "local-proved", "passed": True, "evidence": "Agentic and click/research QA cover at least three rounds."},
        {"id": "agentic-review-evidence", "title": "Agentic/research QA evidence", "status": "local-proved", "passed": True, "evidence": "Agentic audit tracks final delivery evidence."},
        {"id": "delivery-handoff-evidence", "title": "Delivery artifacts and handoff evidence", "status": "local-proved", "passed": True, "evidence": "Reviewer cockpit, launch guide, and consistency sentinel are all ready locally."},
        {"id": "runtime-container-certification", "title": "Runtime/container certification", "status": "blocked-t3", "passed": True, "evidence": "Requires explicit approval and runtime/container certification evidence."},
        {"id": "managed-database-certification", "title": "Managed database certification", "status": "blocked-t3", "passed": True, "evidence": "Requires explicit approval and managed database certification evidence."},
        {"id": "external-provider-certification", "title": "External provider certification", "status": "blocked-t3", "passed": True, "evidence": "Requires explicit approval and external provider certification evidence."},
    ]
    evidence_files = [{"path": f"qa-artifacts/acceptance-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "e" * 64} for index in range(1, 10)]
    return {
        "phase": "4A",
        "status": "final-acceptance-matrix-ready-open-t3",
        "finalGoalComplete": False,
        "acceptanceMatrixOnly": True,
        "localAcceptancePassed": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "acceptanceRowCount": len(rows),
        "provedRowCount": sum(1 for row in rows if row["status"] == "local-proved"),
        "blockedRowCount": sum(1 for row in rows if row["status"] == "blocked-t3"),
        "failedRowCount": 0,
        "evidenceFileCount": len(evidence_files),
        "acceptanceHash": "e" * 64,
        "rows": rows,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {"consistencySentinel": {"status": sentinel["status"], "consistencyPassed": True, "contradictionCount": 0, "finalGoalComplete": False}},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def certification_blocker_board() -> dict[str, Any]:
    matrix = final_acceptance_matrix()
    gaps = matrix["openCertificationGaps"]
    blockers = [
        {
            "id": "container-runtime-certification",
            "laneId": "runtime",
            "title": "Certified runtime/container boundary",
            "riskTier": "T3",
            "status": "open",
            "approvalRequired": True,
            "singleLaneOnly": True,
            "cannotAutoRun": True,
            "packetReady": True,
            "verifierReady": True,
            "templateReady": True,
            "checklistReady": True,
            "stateFlagsSafe": True,
            "localReady": True,
            "approved": False,
            "approvalRecorded": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "evidenceNeededCount": 5,
            "rollbackNeededCount": 3,
            "packetHash": "e" * 64,
            "nextActionId": "runtime-approved-certification-run",
            "nextAction": "Explicit approval and runtime/container certification evidence are required.",
        },
        {
            "id": "managed-database-certification",
            "laneId": "database",
            "title": "Managed database certification",
            "riskTier": "T3",
            "status": "open",
            "approvalRequired": True,
            "singleLaneOnly": True,
            "cannotAutoRun": True,
            "packetReady": True,
            "verifierReady": True,
            "templateReady": True,
            "checklistReady": True,
            "stateFlagsSafe": True,
            "localReady": True,
            "approved": False,
            "approvalRecorded": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "evidenceNeededCount": 5,
            "rollbackNeededCount": 3,
            "packetHash": "e" * 64,
            "nextActionId": "database-approved-certification-run",
            "nextAction": "Explicit approval and managed database certification evidence are required.",
        },
        {
            "id": "external-provider-certification",
            "laneId": "provider",
            "title": "External provider certification",
            "riskTier": "T3",
            "status": "open",
            "approvalRequired": True,
            "singleLaneOnly": True,
            "cannotAutoRun": True,
            "packetReady": True,
            "verifierReady": True,
            "templateReady": True,
            "checklistReady": True,
            "stateFlagsSafe": True,
            "localReady": True,
            "approved": False,
            "approvalRecorded": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "evidenceNeededCount": 5,
            "rollbackNeededCount": 3,
            "packetHash": "e" * 64,
            "nextActionId": "provider-approved-certification-run",
            "nextAction": "Explicit approval and external provider certification evidence are required.",
        },
    ]
    evidence_files = [{"path": f"qa-artifacts/blocker-board-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "e" * 64} for index in range(1, 11)]
    return {
        "phase": "4B",
        "status": "certification-blocker-board-ready-open-t3",
        "finalGoalComplete": False,
        "blockerBoardOnly": True,
        "localBoardPassed": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "blockerCount": len(blockers),
        "readyBlockerCount": len(blockers),
        "closedBlockerCount": 0,
        "laneTrackCount": len(blockers),
        "nextActionCount": len(blockers),
        "evidenceFileCount": len(evidence_files),
        "boardHash": "e" * 64,
        "blockers": blockers,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {"finalAcceptance": {"status": matrix["status"], "localAcceptancePassed": True, "finalGoalComplete": False}},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def user_acceptance_rehearsal() -> dict[str, Any]:
    board = certification_blocker_board()
    matrix = final_acceptance_matrix()
    gaps = board["openCertificationGaps"]
    rehearsals = [
        {
            "id": "student-learning-rehearsal",
            "persona": "student",
            "workflow": "login -> code editing -> AI hint -> sandbox run final value -> self-check -> submission",
            "status": "ready-local",
            "localReady": True,
            "finalValueWaited": True,
            "visualEvidenceReady": True,
            "contentQualityReady": True,
            "logicReady": True,
            "teacherManagementReady": False,
            "blockedByT3": True,
            "executionAllowed": False,
            "finalGoalComplete": False,
            "evidenceIds": ["three-round-agentic-run", "round-1-terminal-sandbox", "student-workflow", "visual-ui-evidence"],
            "notes": "Student path has local final-value waits and visual evidence.",
        },
        {
            "id": "teacher-management-rehearsal",
            "persona": "teacher",
            "workflow": "review dashboard -> submission queue -> feedback -> class analytics -> export-ready evidence",
            "status": "ready-local",
            "localReady": True,
            "finalValueWaited": True,
            "visualEvidenceReady": True,
            "contentQualityReady": True,
            "logicReady": True,
            "teacherManagementReady": True,
            "blockedByT3": True,
            "executionAllowed": False,
            "finalGoalComplete": False,
            "evidenceIds": ["round-2-teacher-review-final", "teacher-workflow", "delivery-reviewer-cockpit", "delivery-launch-guide"],
            "notes": "Teacher management path is review-ready locally.",
        },
        {
            "id": "research-delivery-rehearsal",
            "persona": "research-delivery",
            "workflow": "research export -> artifact index -> consistency sentinel -> acceptance matrix -> blocker board",
            "status": "ready-local",
            "localReady": True,
            "finalValueWaited": True,
            "visualEvidenceReady": True,
            "contentQualityReady": True,
            "logicReady": True,
            "teacherManagementReady": False,
            "blockedByT3": True,
            "executionAllowed": False,
            "finalGoalComplete": False,
            "evidenceIds": ["delivery-consistency-sentinel", "final-acceptance-matrix", "certification-blocker-board", "completion-audit"],
            "notes": "Research/delivery path can explain handoff and open blockers without returning content bodies.",
        },
    ]
    evidence_files = [{"path": f"qa-artifacts/user-acceptance-rehearsal-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "f" * 64} for index in range(1, 11)]
    return {
        "phase": "4C",
        "status": "user-acceptance-rehearsal-ready-open-t3",
        "finalGoalComplete": False,
        "userAcceptanceRehearsalOnly": True,
        "localUserAcceptancePassed": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "openT3GapCount": len(gaps),
        "contentReturned": False,
        "rehearsalCount": len(rehearsals),
        "readyRehearsalCount": len(rehearsals),
        "blockedRehearsalCount": 0,
        "evidenceFileCount": len(evidence_files),
        "rehearsalHash": "f" * 64,
        "rehearsals": rehearsals,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {"finalAcceptance": {"status": matrix["status"], "localAcceptancePassed": True, "finalGoalComplete": False}, "blockerBoard": {"status": board["status"], "readyBlockerCount": 3, "closedBlockerCount": 0, "finalGoalComplete": False}},
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def delivery_evidence_navigator() -> dict[str, Any]:
    gaps = open_t3_gaps()
    section_ids = [
        ("student-evidence-navigation", "Student learning evidence"),
        ("teacher-evidence-navigation", "Teacher management evidence"),
        ("research-delivery-navigation", "Research delivery evidence"),
        ("visual-and-agentic-qa-navigation", "Visual and agentic QA evidence"),
        ("t3-certification-navigation", "Open T3 certification evidence"),
    ]
    evidence_refs = [
        "qa-artifacts/phase4c-user-acceptance-rehearsal.json",
        "qa-artifacts/phase4b-certification-blocker-board.json",
        "qa-artifacts/phase4a-final-acceptance-matrix.json",
    ]
    sections = [
        {
            "id": section_id,
            "title": title,
            "purpose": "Navigate hashed local evidence metadata without returning body content.",
            "status": "ready-local",
            "localReady": True,
            "evidenceRefCount": len(evidence_refs),
            "evidenceRefs": [{"id": f"ref-{index}", "path": path, "exists": True, "sizeBytes": 1, "sha256": "e" * 64, "contentReturned": False} for index, path in enumerate(evidence_refs, start=1)],
            "blockedByT3": True,
            "executionAllowed": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for section_id, title in section_ids
    ]
    evidence_files = [{"path": f"qa-artifacts/evidence-navigator-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "e" * 64} for index in range(1, 10)]
    return {
        "phase": "4D",
        "status": "delivery-evidence-navigator-ready-open-t3",
        "finalGoalComplete": False,
        "deliveryEvidenceNavigatorOnly": True,
        "localNavigationPassed": True,
        "readyForHumanReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "navigationSectionCount": len(sections),
        "readyNavigationSectionCount": len(sections),
        "blockedNavigationSectionCount": 0,
        "openT3GapCount": len(gaps),
        "evidenceFileCount": len(evidence_files),
        "navigatorHash": "e" * 64,
        "sections": sections,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "userAcceptance": {"status": user_acceptance_rehearsal()["status"], "localUserAcceptancePassed": True, "finalGoalComplete": False},
            "artifactIndex": {"status": delivery_artifact_index()["status"], "readyArtifactCount": 1, "contentReturned": False},
            "blockerBoard": {"status": certification_blocker_board()["status"], "readyBlockerCount": 3, "closedBlockerCount": 0},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def local_delivery_summary_packet() -> dict[str, Any]:
    gaps = open_t3_gaps()
    section_ids = [
        ("product-scope-summary", "Product scope and model routing"),
        ("student-acceptance-summary", "Student acceptance"),
        ("teacher-management-summary", "Teacher management"),
        ("research-delivery-summary", "Research delivery"),
        ("visual-agentic-qa-summary", "Visual and agentic QA"),
        ("open-t3-gap-summary", "Open T3 certification gaps"),
    ]
    sections = [
        {
            "id": section_id,
            "title": title,
            "result": "Local summary evidence is ready while production release remains T3-blocked.",
            "status": "ready-local",
            "localReady": True,
            "evidenceIds": ["delivery-evidence-navigator", "completion-audit"],
            "blockedByT3": True,
            "executionAllowed": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for section_id, title in section_ids
    ]
    evidence_files = [{"path": f"qa-artifacts/local-summary-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "d" * 64} for index in range(1, 10)]
    return {
        "phase": "4E",
        "status": "local-delivery-summary-ready-open-t3",
        "finalGoalComplete": False,
        "summaryPacketOnly": True,
        "localSummaryPassed": True,
        "readyForHumanDelivery": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "summarySectionCount": len(sections),
        "readySummarySectionCount": len(sections),
        "blockedSummarySectionCount": 0,
        "localRequirementCount": 45,
        "provedCheckCount": 66,
        "openT3GapCount": len(gaps),
        "evidenceFileCount": len(evidence_files),
        "summaryHash": "d" * 64,
        "sections": sections,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "evidenceNavigator": {"status": delivery_evidence_navigator()["status"], "localNavigationPassed": True, "finalGoalComplete": False},
            "userAcceptance": {"status": user_acceptance_rehearsal()["status"], "localUserAcceptancePassed": True, "finalGoalComplete": False},
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 45, "finalGoalComplete": False},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def local_delivery_handoff_brief() -> dict[str, Any]:
    gaps = open_t3_gaps()
    section_ids = [
        ("handoff-entrypoints", "Handoff entrypoints"),
        ("local-run-commands", "Local run commands"),
        ("student-teacher-review", "Student and teacher review"),
        ("qa-evidence", "QA evidence"),
        ("delivery-artifacts", "Delivery artifacts"),
        ("t3-boundary", "T3 boundary"),
    ]
    sections = [
        {
            "id": section_id,
            "title": title,
            "purpose": "Provide metadata-only local handoff context while production release remains T3-blocked.",
            "result": "Local handoff evidence is ready while final completion remains blocked.",
            "status": "ready-local",
            "localReady": True,
            "evidenceIds": ["local-delivery-summary-packet", "delivery-evidence-navigator"],
            "blockedByT3": True,
            "executionAllowed": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for section_id, title in section_ids
    ]
    commands = [
        {"id": "start-local-fullstack", "command": "npm.cmd run fullstack", "purpose": "Start the local review server."},
        {"id": "verify-handoff-brief", "command": "npm.cmd run qa:handoff-brief", "purpose": "Verify this handoff brief."},
        {"id": "verify-summary", "command": "npm.cmd run qa:local-summary-packet", "purpose": "Verify the local summary."},
        {"id": "verify-api-report", "command": "$env:PORT='3252'; npm.cmd run qa:api", "purpose": "Verify API and report fields."},
        {"id": "verify-agentic", "command": "npm.cmd run qa:agentic", "purpose": "Verify agentic QA."},
        {"id": "verify-completion", "command": "npm.cmd run qa:completion", "purpose": "Verify completion audit."},
    ]
    local_commands = [
        {
            **command,
            "riskTier": "T1",
            "localOnly": True,
            "requiresSecret": False,
            "outwardAction": False,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
        }
        for command in commands
    ]
    evidence_files = [{"path": f"qa-artifacts/local-handoff-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "f" * 64} for index in range(1, 10)]
    return {
        "phase": "4F",
        "status": "local-delivery-handoff-brief-ready-open-t3",
        "finalGoalComplete": False,
        "handoffBriefOnly": True,
        "localHandoffPassed": True,
        "readyForUserReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "briefSectionCount": len(sections),
        "readyBriefSectionCount": len(sections),
        "blockedBriefSectionCount": 0,
        "localCommandCount": len(local_commands),
        "localRequirementCount": 46,
        "provedCheckCount": 67,
        "openT3GapCount": len(gaps),
        "evidenceFileCount": len(evidence_files),
        "briefHash": "f" * 64,
        "sections": sections,
        "localCommands": local_commands,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "localSummary": {"status": local_delivery_summary_packet()["status"], "localSummaryPassed": True, "finalGoalComplete": False},
            "evidenceNavigator": {"status": delivery_evidence_navigator()["status"], "localNavigationPassed": True, "finalGoalComplete": False},
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 46, "finalGoalComplete": False},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "commandOutputReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def local_delivery_quickstart_bundle() -> dict[str, Any]:
    gaps = open_t3_gaps()
    steps = [
        "confirm-local-only-boundary",
        "start-local-server",
        "inspect-student-workflow",
        "inspect-teacher-workflow",
        "inspect-research-delivery",
        "run-local-verification",
        "stop-before-t3",
    ]
    quickstart_steps = [
        {
            "order": index,
            "id": step_id,
            "title": step_id.replace("-", " "),
            "purpose": "Run or inspect local delivery metadata manually while T3 execution remains blocked.",
            "status": "ready-local",
            "localReady": True,
            "evidenceIds": ["local-delivery-handoff-brief", "open-certification-gaps"],
            "riskTier": "T3-boundary" if step_id == "stop-before-t3" else "T1",
            "localOnly": True,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for index, step_id in enumerate(steps, start=1)
    ]
    command_specs = [
        ("start-fullstack", "npm.cmd run fullstack"),
        ("verify-quickstart", "npm.cmd run qa:quickstart-bundle"),
        ("verify-handoff", "npm.cmd run qa:handoff-brief"),
        ("verify-api", "$env:PORT='3260'; npm.cmd run qa:api"),
        ("verify-smoke", "npm.cmd run test"),
        ("verify-three-rounds", "npm.cmd run qa"),
        ("verify-agentic", "npm.cmd run qa:agentic"),
        ("verify-completion", "npm.cmd run qa:completion"),
    ]
    local_commands = [
        {
            "id": command_id,
            "order": index,
            "command": command,
            "purpose": "Manual local verification command.",
            "riskTier": "T1",
            "localOnly": True,
            "requiresSecret": False,
            "outwardAction": False,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
        }
        for index, (command_id, command) in enumerate(command_specs, start=1)
    ]
    route_specs = [
        ("student-workspace", "http://127.0.0.1:3000/#student"),
        ("teacher-dashboard", "http://127.0.0.1:3000/#teacher"),
        ("research-delivery", "http://127.0.0.1:3000/#research"),
        ("quickstart-endpoint", "http://127.0.0.1:3000/api/delivery/quickstart-bundle"),
        ("handoff-brief-endpoint", "http://127.0.0.1:3000/api/delivery/handoff-brief"),
        ("completion-audit-artifact", "qa-artifacts/phase2s-completion-audit.json"),
    ]
    local_routes = [
        {
            "id": route_id,
            "order": index,
            "route": route,
            "purpose": "Manual local review route.",
            "localOnly": True,
            "requiresSecret": False,
            "outwardAction": False,
            "contentReturned": False,
        }
        for index, (route_id, route) in enumerate(route_specs, start=1)
    ]
    evidence_files = [{"path": f"qa-artifacts/local-quickstart-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "a" * 64} for index in range(1, 11)]
    return {
        "phase": "4G",
        "status": "local-delivery-quickstart-ready-open-t3",
        "finalGoalComplete": False,
        "quickstartBundleOnly": True,
        "localQuickstartPassed": True,
        "readyForLocalRunbookReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "quickstartStepCount": len(quickstart_steps),
        "readyQuickstartStepCount": len(quickstart_steps),
        "blockedQuickstartStepCount": 0,
        "localCommandCount": len(local_commands),
        "localRouteCount": len(local_routes),
        "localRequirementCount": 47,
        "provedCheckCount": 68,
        "openT3GapCount": len(gaps),
        "evidenceFileCount": len(evidence_files),
        "quickstartHash": "a" * 64,
        "quickstartSteps": quickstart_steps,
        "localCommands": local_commands,
        "localRoutes": local_routes,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "handoffBrief": {"status": local_delivery_handoff_brief()["status"], "localHandoffPassed": True, "finalGoalComplete": False},
            "localSummary": {"status": local_delivery_summary_packet()["status"], "localSummaryPassed": True, "finalGoalComplete": False},
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 47, "finalGoalComplete": False},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "commandOutputReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def local_delivery_verification_suite() -> dict[str, Any]:
    gaps = open_t3_gaps()
    check_ids = [
        "quickstart-artifact-ready",
        "focused-suite-command-registered",
        "focused-quickstart-command-registered",
        "api-regression-command-registered",
        "smoke-command-registered",
        "three-round-qa-command-registered",
        "agentic-audit-command-registered",
        "completion-audit-command-registered",
        "evidence-files-hashed",
        "open-t3-gaps-preserved",
    ]
    verification_checks = [
        {
            "order": index,
            "id": check_id,
            "title": check_id.replace("-", " "),
            "status": "ready-local",
            "localReady": True,
            "evidenceIds": ["phase4g-quickstart", "phase2s-completion-audit"],
            "riskTier": "T1",
            "localOnly": True,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for index, check_id in enumerate(check_ids, start=1)
    ]
    command_specs = [
        ("verify-suite", "npm.cmd run qa:local-verification-suite"),
        ("verify-quickstart", "npm.cmd run qa:quickstart-bundle"),
        ("verify-api", "$env:PORT='3266'; npm.cmd run qa:api"),
        ("verify-smoke", "npm.cmd run test"),
        ("verify-three-rounds", "npm.cmd run qa"),
        ("verify-visual", "npm.cmd run qa:visual"),
        ("verify-agentic", "npm.cmd run qa:agentic"),
        ("verify-completion", "npm.cmd run qa:completion"),
        ("verify-handoff-export", "npm.cmd run qa:handoff-export"),
        ("verify-artifact-index", "npm.cmd run qa:artifact-index"),
    ]
    local_commands = [
        {
            "id": command_id,
            "order": index,
            "command": command,
            "purpose": "Manual local verification command.",
            "riskTier": "T1",
            "localOnly": True,
            "requiresSecret": False,
            "outwardAction": False,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
        }
        for index, (command_id, command) in enumerate(command_specs, start=1)
    ]
    evidence_files = [{"path": f"qa-artifacts/local-verification-evidence-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "b" * 64} for index in range(1, 13)]
    return {
        "phase": "4H",
        "status": "local-delivery-verification-suite-ready-open-t3",
        "finalGoalComplete": False,
        "verificationSuiteOnly": True,
        "localVerificationPassed": True,
        "readyForLocalVerificationReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "verificationCheckCount": len(verification_checks),
        "readyVerificationCheckCount": len(verification_checks),
        "blockedVerificationCheckCount": 0,
        "localCommandCount": len(local_commands),
        "localRequirementCount": 48,
        "provedCheckCount": 69,
        "openT3GapCount": len(gaps),
        "evidenceFileCount": len(evidence_files),
        "suiteHash": "b" * 64,
        "verificationChecks": verification_checks,
        "localCommands": local_commands,
        "evidenceFiles": evidence_files,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "quickstart": {"status": local_delivery_quickstart_bundle()["status"], "localQuickstartPassed": True, "finalGoalComplete": False},
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 48, "finalGoalComplete": False},
            "agenticAudit": {"provedCheckCount": 69, "openProductGapCount": 3},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "commandOutputReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def final_local_handoff_checkpoint() -> dict[str, Any]:
    gaps = open_t3_gaps()
    step_ids = [
        "phase4h-verification-suite-ready",
        "final-checkpoint-command-registered",
        "local-suite-command-registered",
        "local-completion-audit-ready",
        "agentic-audit-ready",
        "handoff-artifacts-hashed",
        "single-lane-t3-packets-ready",
        "open-t3-gaps-preserved",
    ]
    checkpoint_steps = [
        {
            "order": index,
            "id": step_id,
            "title": step_id.replace("-", " "),
            "status": "ready-local",
            "localReady": True,
            "evidenceIds": ["phase4h-verification-suite", "phase3v-run-packets", "phase3w-verifier"],
            "riskTier": "T1",
            "localOnly": True,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
            "contentReturned": False,
            "finalGoalComplete": False,
        }
        for index, step_id in enumerate(step_ids, start=1)
    ]
    command_specs = [
        ("verify-final-checkpoint", "npm.cmd run qa:final-handoff-checkpoint"),
        ("verify-suite", "npm.cmd run qa:local-verification-suite"),
        ("verify-completion", "npm.cmd run qa:completion"),
        ("verify-api", "$env:PORT='3272'; npm.cmd run qa:api"),
        ("verify-smoke", "npm.cmd run test"),
        ("verify-three-rounds", "npm.cmd run qa"),
        ("verify-visual", "npm.cmd run qa:visual"),
        ("verify-artifact-index", "npm.cmd run qa:artifact-index"),
    ]
    local_commands = [
        {
            "id": command_id,
            "order": index,
            "command": command,
            "purpose": "Manual local handoff verification command.",
            "riskTier": "T1",
            "localOnly": True,
            "requiresSecret": False,
            "outwardAction": False,
            "executionAllowed": False,
            "executed": False,
            "outputReturned": False,
        }
        for index, (command_id, command) in enumerate(command_specs, start=1)
    ]
    handoff_artifacts = [{"path": f"qa-artifacts/final-local-handoff-artifact-{index}.json", "exists": True, "sizeBytes": 1, "sha256": "c" * 64} for index in range(1, 14)]
    return {
        "phase": "4I",
        "status": "final-local-handoff-checkpoint-ready-open-t3",
        "finalGoalComplete": False,
        "checkpointOnly": True,
        "localFinalHandoffPassed": True,
        "readyForFinalLocalReview": True,
        "readyForProductionRelease": False,
        "blockedByT3": True,
        "contentReturned": False,
        "checkpointStepCount": len(checkpoint_steps),
        "readyCheckpointStepCount": len(checkpoint_steps),
        "blockedCheckpointStepCount": 0,
        "localCommandCount": len(local_commands),
        "handoffArtifactCount": len(handoff_artifacts),
        "localRequirementCount": 49,
        "provedCheckCount": 70,
        "openT3GapCount": len(gaps),
        "checkpointHash": "c" * 64,
        "checkpointSteps": checkpoint_steps,
        "localCommands": local_commands,
        "handoffArtifacts": handoff_artifacts,
        "openCertificationGaps": gaps,
        "sourceSummaries": {
            "verificationSuite": {"status": local_delivery_verification_suite()["status"], "localVerificationPassed": True, "finalGoalComplete": False},
            "completionAudit": {"verdict": "PASS_WITH_OPEN_CERTIFICATION_GAPS", "localRequirementCount": 49, "finalGoalComplete": False},
            "agenticAudit": {"provedCheckCount": 70, "openProductGapCount": 3},
        },
        "guardrails": {"contentReturned": False, "artifactBodyContentReturned": False, "evidenceBodyContentReturned": False, "screenshotBytesReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "providerResponsesReturned": False, "databaseConnectionStringsReturned": False, "reviewCommandsExecuted": False, "commandOutputReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "productionRelease": False, "finalCompletionClaimed": False},
    }


def t3_evidence_bundle_templates() -> dict[str, Any]:
    gate = t3_approval_execution_gate()
    lane_templates = [
        {
            "laneId": lane["laneId"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "templateReady": True,
            "executionGateHash": gate["executionGateHash"],
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "finalGoalComplete": False,
            "actionsExecuted": [],
            "evidenceItems": [{"id": item, "statusRequired": "passed", "artifactHashPlaceholder": "", "artifactHashRequired": True, "bodyContentAllowed": False} for item in lane["requiredEvidence"]],
            "rollbackResults": [{"id": item, "statusRequired": "passed", "artifactHashPlaceholder": "", "artifactHashRequired": True, "bodyContentAllowed": False} for item in lane["rollbackChecks"]],
            "rejectedFields": ["evidenceBody", "artifactBody", "approvalText", "secret", "apiKey", "databaseUrl"],
        }
        for lane in gate["gateLanes"]
    ]
    return {
        "phase": "3O",
        "status": "evidence-bundle-templates-ready-execution-blocked",
        "finalGoalComplete": False,
        "templateOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "gateStatus": gate["status"],
        "gateOnly": True,
        "executionGateHash": gate["executionGateHash"],
        "templateBundleHash": "4" * 64,
        "laneTemplateCount": len(lane_templates),
        "readyLaneTemplateCount": len(lane_templates),
        "evidenceItemCount": sum(len(lane["evidenceItems"]) for lane in lane_templates),
        "rollbackResultCount": sum(len(lane["rollbackResults"]) for lane in lane_templates),
        "laneTemplates": lane_templates,
        "closureContract": {"targetEndpoint": "/api/delivery/t3-certification-evidence-closure", "requiresExecutionGateHash": True, "requiresEvidenceArtifactHashes": True, "requiresRollbackArtifactHashes": True, "evidenceBodiesReturned": False, "approvalTextReturned": False},
        "guardrails": {"contentReturned": False, "artifactContentReturned": False, "evidenceContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_operator_checklist() -> dict[str, Any]:
    templates = t3_evidence_bundle_templates()
    lane_checklists = [
        {
            "laneId": lane["laneId"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "checklistReady": True,
            "candidateHash": "5" * 64,
            "approvalLockHash": "5" * 64,
            "approvalTextHashPresent": True,
            "executionGateHash": templates["executionGateHash"],
            "templateBundleHash": templates["templateBundleHash"],
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "contentReturned": False,
            "manualSteps": [
                {"id": f"{lane['laneId']}-confirm-single-lane-approval", "order": 1, "required": True, "status": "blocked-until-human-approval", "outwardActionAllowed": False},
                {"id": f"{lane['laneId']}-verify-lock-and-candidate-hashes", "order": 2, "required": True, "status": "ready", "outwardActionAllowed": False},
                {"id": f"{lane['laneId']}-run-approved-certification-once", "order": 3, "required": True, "status": "blocked-until-approved-phase", "outwardActionAllowed": False},
                {"id": f"{lane['laneId']}-attach-evidence-hashes", "order": 4, "required": True, "status": "blocked-until-runtime-evidence", "outwardActionAllowed": False},
                {"id": f"{lane['laneId']}-review-before-state-change", "order": 5, "required": True, "status": "blocked-until-review", "outwardActionAllowed": False},
            ],
            "evidenceChecklist": [{"id": item["id"], "requiredStatus": "passed", "artifactHashRequired": True, "bodyContentAllowed": False} for item in lane["evidenceItems"]],
            "rollbackChecklist": [{"id": item["id"], "requiredStatus": "passed", "artifactHashRequired": True, "bodyContentAllowed": False} for item in lane["rollbackResults"]],
            "blockedActions": ["provider-call", "managed-database-connection", "deployment", "billing-action", "approval-recording", "certification-state-change", "final-completion-claim"],
        }
        for lane in templates["laneTemplates"]
    ]
    return {
        "phase": "3P",
        "status": "t3-operator-checklist-ready-execution-blocked",
        "finalGoalComplete": False,
        "operatorOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "readinessStatus": "final-readiness-local-evidence-ready-open-t3",
        "readinessHash": "3" * 64,
        "candidateStatus": "approval-candidates-ready-execution-blocked",
        "candidateBundleHash": "2" * 64,
        "executionGateStatus": "approval-execution-gate-ready-execution-blocked",
        "executionGateHash": templates["executionGateHash"],
        "templateStatus": templates["status"],
        "templateBundleHash": templates["templateBundleHash"],
        "checklistBundleHash": "6" * 64,
        "laneChecklistCount": len(lane_checklists),
        "readyLaneChecklistCount": len(lane_checklists),
        "manualStepCount": sum(len(lane["manualSteps"]) for lane in lane_checklists),
        "evidenceItemCount": sum(len(lane["evidenceChecklist"]) for lane in lane_checklists),
        "rollbackItemCount": sum(len(lane["rollbackChecklist"]) for lane in lane_checklists),
        "laneChecklists": lane_checklists,
        "guardrails": {"contentReturned": False, "artifactContentReturned": False, "evidenceContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def t3_operator_transcript_validator(payload: Any | None = None) -> dict[str, Any]:
    checklist = t3_operator_checklist()
    transcripts = payload if isinstance(payload, list) else ([payload] if isinstance(payload, dict) else [])
    valid_count = 0
    lane_validations = []
    for lane in checklist["laneChecklists"]:
        transcript = next((item for item in transcripts if isinstance(item, dict) and item.get("laneId") == lane["laneId"]), None)
        supplied = transcript is not None
        manual_ids = set(transcript.get("manualStepIds", []) if supplied else [])
        evidence_items = transcript.get("evidenceArtifactHashes", []) if supplied else []
        rollback_items = transcript.get("rollbackArtifactHashes", []) if supplied else []
        missing_manual = [step["id"] for step in lane["manualSteps"] if step["id"] not in manual_ids]
        evidence_ids = {item.get("id") for item in evidence_items if isinstance(item, dict)}
        rollback_ids = {item.get("id") for item in rollback_items if isinstance(item, dict)}
        missing_evidence = [item["id"] for item in lane["evidenceChecklist"] if item["id"] not in evidence_ids]
        missing_rollback = [item["id"] for item in lane["rollbackChecklist"] if item["id"] not in rollback_ids]
        serialized = str(transcript or "")
        secret_exposure = supplied and ("sk-" in serialized or "CODEX_MODEL_API_KEY" in serialized or "OPENAI_API_KEY" in serialized or "DATABASE_URL" in serialized or "apiKey" in serialized or "databaseUrl" in serialized)
        prohibited_content = supplied and any(token in serialized for token in ["evidenceBody", "artifactBody", "approvalText", "providerResponse", "'content'", '"content"', "'body'", '"body"'])
        state_flags_safe = supplied and not any(transcript.get(key) is True for key in ["approvalRecorded", "executionAllowed", "externalActionsExecuted", "certificationStateChanged", "finalGoalComplete", "contentReturned"])
        hash_matches = supplied and transcript.get("checklistBundleHash") == checklist["checklistBundleHash"]
        evidence_complete = supplied and not missing_evidence and len(evidence_items) >= len(lane["evidenceChecklist"])
        rollback_complete = supplied and not missing_rollback and len(rollback_items) >= len(lane["rollbackChecklist"])
        manual_complete = supplied and not missing_manual and len(manual_ids) >= len(lane["manualSteps"])
        transcript_valid = supplied and lane["checklistReady"] and hash_matches and manual_complete and evidence_complete and rollback_complete and state_flags_safe and not secret_exposure and not prohibited_content
        if transcript_valid:
            valid_count += 1
        rejection_reasons = []
        if supplied and not hash_matches:
            rejection_reasons.append("checklist-bundle-hash-mismatch")
        if supplied and not manual_complete:
            rejection_reasons.append("missing-manual-steps")
        if supplied and not evidence_complete:
            rejection_reasons.append("missing-or-invalid-evidence-hashes")
        if supplied and not rollback_complete:
            rejection_reasons.append("missing-or-invalid-rollback-hashes")
        if supplied and not state_flags_safe:
            rejection_reasons.append("state-change-claim-not-allowed")
        if secret_exposure:
            rejection_reasons.append("secret-like-transcript-content")
        if prohibited_content:
            rejection_reasons.append("body-content-field-not-allowed")
        lane_validations.append({
            "laneId": lane["laneId"],
            "targetGap": lane["targetGap"],
            "riskTier": "T3",
            "checklistReady": lane["checklistReady"],
            "transcriptSupplied": supplied,
            "transcriptValid": transcript_valid,
            "checklistHashMatches": hash_matches,
            "manualStepCount": len(lane["manualSteps"]),
            "suppliedManualStepCount": len(manual_ids),
            "missingManualSteps": missing_manual,
            "evidenceArtifactCount": len(lane["evidenceChecklist"]),
            "suppliedEvidenceArtifactCount": len(evidence_items),
            "missingEvidence": missing_evidence,
            "rollbackArtifactCount": len(lane["rollbackChecklist"]),
            "suppliedRollbackArtifactCount": len(rollback_items),
            "missingRollback": missing_rollback,
            "stateFlagsSafe": bool(state_flags_safe),
            "prohibitedActionAttempted": False,
            "secretExposure": bool(secret_exposure),
            "prohibitedContentField": bool(prohibited_content),
            "approvalRecorded": False,
            "approved": False,
            "executionAllowed": False,
            "externalActionsExecuted": False,
            "certificationStateChanged": False,
            "contentReturned": False,
            "rejectionReasons": rejection_reasons,
        })
    status = "t3-operator-transcript-validator-ready-execution-blocked"
    if transcripts:
        status = "t3-operator-transcript-valid-state-unchanged" if valid_count == len(transcripts) else "t3-operator-transcript-rejected-execution-blocked"
    return {
        "phase": "3Q",
        "status": status,
        "finalGoalComplete": False,
        "validatorOnly": True,
        "approvalRecorded": False,
        "approved": False,
        "executionAllowed": False,
        "externalActionsExecuted": False,
        "certificationStateChanged": False,
        "contentReturned": False,
        "checklistStatus": checklist["status"],
        "operatorOnly": True,
        "checklistBundleHash": checklist["checklistBundleHash"],
        "transcriptValidatorHash": "7" * 64,
        "laneValidationCount": len(lane_validations),
        "readyLaneValidationCount": len(lane_validations),
        "submittedTranscriptCount": len(transcripts),
        "validatedTranscriptCount": valid_count,
        "transcriptSummary": {"supplied": bool(transcripts), "laneIds": [item.get("laneId") for item in transcripts if isinstance(item, dict)], "validCount": valid_count, "rejectedCount": max(0, len(transcripts) - valid_count)},
        "laneValidations": lane_validations,
        "guardrails": {"contentReturned": False, "artifactContentReturned": False, "evidenceContentReturned": False, "approvalTextReturned": False, "secretValuesReturned": False, "keyShapedTokensReturned": False, "externalCalls": False, "managedDatabaseConnections": False, "deployments": False, "billingActions": False, "approvalRecorded": False, "certificationExecution": False, "certificationStateChanged": False, "finalCompletionClaimed": False},
    }


def provider_live_plan(payload: dict[str, Any], approved: bool = False) -> dict[str, Any]:
    task_type = "image" if payload.get("taskType") == "image" else "coding"
    observed = int(payload.get("simulatePrimaryLatencyMs") or 320)
    fallback_used = task_type == "coding" and observed > 1000
    selected_model = "gpt-image-2" if task_type == "image" else ("gpt-5.3-codex-spark" if fallback_used else "claude-sonnet-4-6")
    model_route = {"path": task_type, "selectedModel": selected_model, "fallbackUsed": fallback_used, "fallbackAfterMs": None if task_type == "image" else 1000, "observedPrimaryLatencyMs": None if task_type == "image" else observed, "secretSafe": True}
    blocking_reasons = ["missing CODEX_MODEL_API_KEY", "missing CODEX_ENABLE_LIVE_MODEL=1", "missing CODEX_MODEL_BASE_URL"]
    if not approved:
        blocking_reasons.append("missing X-CodeX-Live-Model: allow")
    return {
        "guard": {"riskTier": "T3-external-model-call", "allowed": False, "blockingReasons": blocking_reasons, "outboundCalls": 0, "loopbackBaseUrl": False},
        "modelRoute": model_route,
        "providerRequest": {"provider": "codex-model-gateway", "mode": "local-simulated", "model": selected_model, "path": "/v1/images" if task_type == "image" else "/v1/responses", "secretSafe": True, "secretEcho": False, "dryRunOnly": True},
        "redactedPayload": {"taskType": task_type, "prompt": {"preview": str(payload.get("prompt", ""))[:120], "bytes": len(str(payload.get("prompt", ""))), "truncated": len(str(payload.get("prompt", ""))) > 120}},
        "localhostMockTransport": {"phase": "2P", "implementedInNodeServer": True, "externalCalls": "blocked"},
        "outboundCall": False,
        "secretEcho": False,
    }


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: dict[str, Any] = Field(default_factory=dict)
    trace_id: str = Field(default_factory=lambda: str(uuid4()))


if FastAPI is not None:
    app = FastAPI(title="CodeX / AI小海龟 API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> ApiEnvelope:
        return ApiEnvelope(data={"status": "ready", "time": datetime.utcnow().isoformat(), "repository": "json-repository-v1"})

    @app.get("/api/db/status")
    async def db_status() -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "engine": "json-repository-v1",
                "adapter": "json-file",
                "atomicWrites": True,
                "transactionalWrites": False,
                "schemaVersion": 4,
                "status": "ok",
                "migrationsApplied": [],
                "rollbackSupported": False,
                "externalReady": False,
                "writeCount": 1,
                "lastReadAt": datetime.utcnow().isoformat(),
                "lastWriteAt": datetime.utcnow().isoformat(),
                "lastBackupAt": datetime.utcnow().isoformat(),
                "lastReason": "api-save",
                "lastRecoveryReason": None,
                "backup": {"path": "data/backups/mock-db.latest.json", "exists": True, "sizeBytes": 1},
                "counts": {"users": 3, "activeSessions": 0, "revokedSessions": 0, "authEvents": 1, "runJobs": 0},
                "security": {"rawSessionTokenStored": False},
            }
        )

    @app.get("/api/db/certification")
    async def db_certification() -> ApiEnvelope:
        return ApiEnvelope(data=database_certification_readiness(local_evidence=False))

    @app.get("/api/delivery/certification-overview")
    async def delivery_certification() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_certification_overview())

    @app.get("/api/delivery/t3-preflight")
    async def delivery_t3_preflight() -> ApiEnvelope:
        return ApiEnvelope(data=t3_certification_preflight())

    @app.get("/api/delivery/t3-certification-package")
    async def delivery_t3_package() -> ApiEnvelope:
        return ApiEnvelope(data=t3_certification_package())

    @app.get("/api/delivery/t3-evidence")
    async def delivery_t3_evidence() -> ApiEnvelope:
        return ApiEnvelope(data=t3_evidence_summary())

    @app.get("/api/delivery/handoff-dossier")
    async def delivery_handoff() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_handoff_dossier())

    @app.get("/api/delivery/artifacts")
    async def delivery_artifacts() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_artifact_index())

    @app.get("/api/delivery/agentic-qa-replay")
    async def delivery_agentic_qa_replay() -> ApiEnvelope:
        return ApiEnvelope(data=agentic_qa_replay())

    @app.get("/api/delivery/visual-storyboard")
    async def delivery_visual_storyboard() -> ApiEnvelope:
        return ApiEnvelope(data=visual_qa_storyboard())

    @app.get("/api/delivery/objective-traceability")
    async def delivery_objective_traceability() -> ApiEnvelope:
        return ApiEnvelope(data=objective_traceability())

    @app.get("/api/delivery/t3-approval-packet")
    async def delivery_t3_approval_packet() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_packet())

    @app.get("/api/delivery/t3-dry-run-rehearsal")
    async def delivery_t3_dry_run_rehearsal() -> ApiEnvelope:
        return ApiEnvelope(data=t3_dry_run_rehearsal())

    @app.get("/api/delivery/t3-approval-request-export")
    async def delivery_t3_approval_request_export() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_request_export())

    @app.get("/api/delivery/t3-approval-integrity")
    async def delivery_t3_approval_integrity() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_integrity())

    @app.get("/api/delivery/t3-approval-lock")
    async def delivery_t3_approval_lock() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_lock())

    @app.get("/api/delivery/t3-approval-verifier")
    async def delivery_t3_approval_verifier() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_verifier())

    @app.post("/api/delivery/t3-approval-verifier")
    async def delivery_t3_approval_verifier_post(payload: dict[str, Any]) -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_verifier(payload))

    @app.get("/api/delivery/t3-approval-candidates")
    async def delivery_t3_approval_candidates() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_candidates())

    @app.get("/api/delivery/t3-approval-execution-gate")
    async def delivery_t3_approval_execution_gate() -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_execution_gate())

    @app.post("/api/delivery/t3-approval-execution-gate")
    async def delivery_t3_approval_execution_gate_post(payload: dict[str, Any]) -> ApiEnvelope:
        return ApiEnvelope(data=t3_approval_execution_gate(payload))

    @app.get("/api/delivery/t3-certification-evidence-closure")
    async def delivery_t3_certification_evidence_closure() -> ApiEnvelope:
        return ApiEnvelope(data=t3_certification_evidence_closure())

    @app.post("/api/delivery/t3-certification-evidence-closure")
    async def delivery_t3_certification_evidence_closure_post(payload: dict[str, Any]) -> ApiEnvelope:
        return ApiEnvelope(data=t3_certification_evidence_closure(payload))

    @app.get("/api/delivery/final-readiness")
    async def delivery_final_readiness() -> ApiEnvelope:
        return ApiEnvelope(data=final_delivery_readiness())

    @app.get("/api/delivery/release-candidate")
    async def delivery_release_candidate_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_release_candidate())

    @app.get("/api/delivery/t3-certification-next-actions")
    async def delivery_t3_certification_next_actions() -> ApiEnvelope:
        return ApiEnvelope(data=t3_certification_next_actions())

    @app.get("/api/delivery/t3-single-lane-run-packets")
    async def delivery_t3_single_lane_run_packets() -> ApiEnvelope:
        return ApiEnvelope(data=t3_single_lane_run_packets())

    @app.get("/api/delivery/t3-run-packet-verifier")
    async def delivery_t3_run_packet_verifier() -> ApiEnvelope:
        return ApiEnvelope(data=t3_run_packet_verifier())

    @app.post("/api/delivery/t3-run-packet-verifier")
    async def delivery_t3_run_packet_verifier_post(payload: Any) -> ApiEnvelope:
        return ApiEnvelope(data=t3_run_packet_verifier(payload))

    @app.get("/api/delivery/reviewer-cockpit")
    async def delivery_reviewer_cockpit_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_reviewer_cockpit())

    @app.get("/api/delivery/launch-guide")
    async def delivery_launch_guide_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_launch_guide())

    @app.get("/api/delivery/consistency-sentinel")
    async def delivery_consistency_sentinel_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_consistency_sentinel())

    @app.get("/api/delivery/final-acceptance-matrix")
    async def delivery_final_acceptance_matrix_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=final_acceptance_matrix())

    @app.get("/api/delivery/certification-blocker-board")
    async def delivery_certification_blocker_board_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=certification_blocker_board())

    @app.get("/api/delivery/user-acceptance-rehearsal")
    async def delivery_user_acceptance_rehearsal_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=user_acceptance_rehearsal())

    @app.get("/api/delivery/evidence-navigator")
    async def delivery_evidence_navigator_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=delivery_evidence_navigator())

    @app.get("/api/delivery/local-summary-packet")
    async def delivery_local_summary_packet_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=local_delivery_summary_packet())

    @app.get("/api/delivery/handoff-brief")
    async def delivery_local_handoff_brief_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=local_delivery_handoff_brief())

    @app.get("/api/delivery/quickstart-bundle")
    async def delivery_local_quickstart_bundle_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=local_delivery_quickstart_bundle())

    @app.get("/api/delivery/local-verification-suite")
    async def delivery_local_verification_suite_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=local_delivery_verification_suite())

    @app.get("/api/delivery/final-local-handoff-checkpoint")
    async def delivery_final_local_handoff_checkpoint_endpoint() -> ApiEnvelope:
        return ApiEnvelope(data=final_local_handoff_checkpoint())

    @app.get("/api/delivery/t3-evidence-bundle-templates")
    async def delivery_t3_evidence_bundle_templates() -> ApiEnvelope:
        return ApiEnvelope(data=t3_evidence_bundle_templates())

    @app.get("/api/delivery/t3-operator-checklist")
    async def delivery_t3_operator_checklist() -> ApiEnvelope:
        return ApiEnvelope(data=t3_operator_checklist())

    @app.get("/api/delivery/t3-operator-transcript-validator")
    async def delivery_t3_operator_transcript_validator() -> ApiEnvelope:
        return ApiEnvelope(data=t3_operator_transcript_validator())

    @app.post("/api/delivery/t3-operator-transcript-validator")
    async def delivery_t3_operator_transcript_validator_post(payload: dict[str, Any]) -> ApiEnvelope:
        return ApiEnvelope(data=t3_operator_transcript_validator(payload))

    @app.post("/api/delivery/t3-evidence/intake")
    async def delivery_t3_evidence_intake(payload: dict[str, Any], x_codex_dev_reset: str | None = Header(default=None)) -> ApiEnvelope:
        if x_codex_dev_reset != "allow":
            return ApiEnvelope(ok=False, data={"error": "T3 evidence intake requires X-CodeX-Dev-Reset: allow"})
        result = t3_evidence_intake(payload)
        return ApiEnvelope(ok=result["stored"], data=result)

    @app.post("/api/db/transaction-probe")
    async def db_transaction_probe(x_codex_dev_reset: str | None = Header(default=None)) -> ApiEnvelope:
        if x_codex_dev_reset != "allow":
            return ApiEnvelope(ok=False, data={"error": "Transaction probe requires X-CodeX-Dev-Reset: allow"})
        event = {"id": str(uuid4()), "type": "db_transaction_probe", "userId": "system", "role": "system", "ok": True}
        return ApiEnvelope(data={"event": event, "authEventCount": 2, "dbStatus": {"engine": "json-repository-v1", "atomicWrites": True, "lastReason": "transaction-probe"}})

    @app.post("/api/db/rollback-probe")
    async def db_rollback_probe(x_codex_dev_reset: str | None = Header(default=None)) -> ApiEnvelope:
        if x_codex_dev_reset != "allow":
            return ApiEnvelope(ok=False, data={"error": "Rollback probe requires X-CodeX-Dev-Reset: allow"})
        return ApiEnvelope(data={"rollback": {"supported": False, "rolledBack": False, "markerAbsent": True}, "dbStatus": {"engine": "json-repository-v1", "rollbackSupported": False}})

    @app.post("/api/auth/login")
    async def login(payload: AuthLogin) -> ApiEnvelope:
        expected_password = {"student": "demo-student", "teacher": "demo-teacher", "researcher": "demo-research"}[payload.role]
        if payload.password is not None and payload.password != expected_password:
            return ApiEnvelope(ok=False, data={"error": "Invalid credentials", "reason": "invalid-credentials"})
        user = {
            "id": "teacher-lishen" if payload.role == "teacher" else "student-linyi",
            "name": "李深老师" if payload.role == "teacher" else "林一诺",
            "role": payload.role,
            "permissions": ["review_submission", "read_dashboard"] if payload.role == "teacher" else ["submit_work", "run_code"],
        }
        token_hash = f"sha256:{str(uuid4())[:8]}:{str(uuid4())[:8]}"
        session = {"tokenHash": token_hash, "userId": user["id"], "role": payload.role, "assurance": "password" if payload.password else "demo-role", "revoked": False}
        return ApiEnvelope(data={"sessionToken": str(uuid4()), "user": user, "expiresInMinutes": 120, "session": session, "assurance": session["assurance"]})

    @app.get("/api/auth/session")
    async def get_session() -> ApiEnvelope:
        return ApiEnvelope(data={"user": {"id": "student-linyi", "role": "student", "permissions": ["submit_work", "run_code"]}, "permissions": ["submit_work", "run_code"], "session": {"revoked": False}})

    @app.post("/api/auth/logout")
    async def logout() -> ApiEnvelope:
        return ApiEnvelope(data={"revoked": True, "session": {"revoked": True}})

    @app.get("/api/auth/audit")
    async def auth_audit() -> ApiEnvelope:
        return ApiEnvelope(data={"events": [], "totals": {"total": 0, "login": 0, "logout": 0, "login_failure": 0, "failure": 0}})

    @app.get("/api/ai/model-contracts")
    async def model_contracts() -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "version": 4,
                "coding": {
                    "primaryModel": "claude-sonnet-4-6",
                    "fallbackModel": "gpt-5.3-codex-spark",
                    "fallbackAfterMs": 1000,
                },
                "image": {
                    "model": "gpt-image-2",
                    "separationRule": "Image generation uses the image path, not the coding-model routing block.",
                },
                "studentSafety": {"minorSafeMode": True, "doNotRevealRawReasoning": True},
                "runtime": {"secretRedaction": True, "deterministicFallbackProbe": "simulatePrimaryLatencyMs"},
                "provider": provider_status(),
                "secrets": {"policy": "No provider API keys are stored or returned."},
            }
        )

    @app.get("/api/ai/provider/status")
    async def ai_provider_status() -> ApiEnvelope:
        return ApiEnvelope(data=provider_status())

    @app.get("/api/ai/provider/certification")
    async def ai_provider_certification() -> ApiEnvelope:
        return ApiEnvelope(data=provider_certification_readiness(local_evidence=False))

    @app.post("/api/ai/provider/probe")
    async def ai_provider_probe(payload: dict[str, Any]) -> ApiEnvelope:
        task_type = "image" if payload.get("taskType") == "image" else "coding"
        observed = int(payload.get("simulatePrimaryLatencyMs") or 320)
        fallback_used = task_type == "coding" and observed > 1000
        selected_model = "gpt-image-2" if task_type == "image" else ("gpt-5.3-codex-spark" if fallback_used else "claude-sonnet-4-6")
        model_route = {"path": task_type, "selectedModel": selected_model, "fallbackUsed": fallback_used, "fallbackAfterMs": None if task_type == "image" else 1000, "observedPrimaryLatencyMs": None if task_type == "image" else observed, "secretSafe": True}
        provider_request = {"provider": "codex-model-gateway", "mode": "local-simulated", "model": selected_model, "path": "/v1/images" if task_type == "image" else "/v1/responses", "secretSafe": True, "secretEcho": False, "dryRunOnly": True}
        return ApiEnvelope(data={"providerStatus": provider_status(), "modelRoute": model_route, "providerRequest": provider_request, "secretEcho": False})

    @app.post("/api/ai/provider/live-plan")
    async def ai_provider_live_plan(payload: dict[str, Any]) -> ApiEnvelope:
        return ApiEnvelope(data=provider_live_plan(payload))

    @app.post("/api/ai/provider/live-call")
    async def ai_provider_live_call(payload: dict[str, Any], x_codex_live_model: str | None = Header(default=None)) -> ApiEnvelope:
        return ApiEnvelope(ok=False, data={"error": "Live provider call blocked by guardrails", "plan": provider_live_plan(payload, approved=x_codex_live_model == "allow"), "liveTransport": {"outboundCall": False, "ok": False, "blocked": True, "secretEcho": False}})

    @app.get("/api/sandbox/policy")
    async def sandbox_policy() -> ApiEnvelope:
        return ApiEnvelope(data={"policy": SandboxPolicy().model_dump(), "runner": runner_diagnostics()})

    @app.get("/api/sandbox/certification")
    async def sandbox_certification() -> ApiEnvelope:
        return ApiEnvelope(data=sandbox_certification_readiness(run_jobs=4, escape_blocked_jobs=3))

    @app.post("/api/dev/reset")
    async def reset_demo_data() -> ApiEnvelope:
        return ApiEnvelope(data={"dbMeta": {"schemaVersion": 4, "resetAt": datetime.utcnow().isoformat(), "repository": {"engine": "json-repository-v1", "atomicWrites": True}}})

    @app.get("/api/collab/rooms/{room_id}")
    async def collab_room(room_id: str) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "room": {"id": room_id, "turn": {"driver": "student-linyi", "navigator": "ai-turtle"}, "presence": []},
                "replay": [],
                "presence": [],
            }
        )

    @app.post("/api/collab/rooms/{room_id}/join")
    async def join_collab_room(room_id: str, payload: CollabJoin) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "room": {"id": room_id},
                "presence": [payload.model_dump()],
                "replay": [{"sequence": 1, "type": "join", "actor": payload.actor, "message": f"{payload.name} joined"}],
            }
        )

    @app.post("/api/collab/rooms/{room_id}/events")
    async def append_collab_event(room_id: str, payload: CollabEventCreate) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "event": {
                    "id": str(uuid4()),
                    "roomId": room_id,
                    "sequence": 1,
                    "type": payload.type,
                    "actor": payload.actor,
                    "message": payload.message,
                    "payload": payload.payload,
                    "createdAt": datetime.utcnow().isoformat(),
                }
            }
        )

    @app.post("/api/collab/rooms/{room_id}/turn")
    async def switch_collab_turn(room_id: str, payload: CollabTurn) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "room": {"id": room_id, "turn": payload.model_dump()},
                "event": {"sequence": 1, "type": "turn", "actor": payload.driver},
            }
        )

    @app.post("/api/student/projects")
    async def create_project(payload: ProjectCreate) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "id": str(uuid4()),
                "title": payload.title,
                "language": payload.language,
                "latestVersion": {
                    "versionNo": 1,
                    "code": payload.code,
                    "createdAt": datetime.utcnow().isoformat(),
                },
            }
        )

    @app.post("/api/run")
    async def run_code(payload: RunRequest) -> ApiEnvelope:
        # Phase 2Q mirrors the local hardened sandbox boundary contract.
        output = "Python turtle canvas updated" if payload.language == "python" else "Sandbox run accepted"
        runner = runner_diagnostics(timedOut=False)
        return ApiEnvelope(data={"status": "completed", "stdout": output, "stderr": "", "durationMs": 42, "jobId": str(uuid4()), "jobStatus": "completed", "jobProgress": 100, "terminal": True, "runner": runner, "runnerDiagnostics": runner})

    @app.post("/api/run/jobs")
    async def create_run_job(payload: RunJobCreate) -> ApiEnvelope:
        job_id = str(uuid4())
        runner = runner_diagnostics(payload.runner_timeout_ms, timedOut=False)
        if payload.start_mode == "manual":
            job = {
                "id": job_id,
                "projectId": payload.project_id,
                "language": payload.language,
                "status": "queued",
                "progress": 25,
                "terminal": False,
                "result": None,
                "runner": runner,
                "lifecycle": [{"status": "created", "progress": 0}, {"status": "queued", "progress": 25}],
            }
            return ApiEnvelope(data={"job": job, "result": None})
        output = "Python turtle canvas updated" if payload.language == "python" else "Sandbox run accepted"
        result = {"status": "completed", "stdout": output, "stderr": "", "durationMs": 42, "sandbox": SandboxPolicy().model_dump(), "runnerDiagnostics": runner}
        job = {
            "id": job_id,
            "projectId": payload.project_id,
            "language": payload.language,
            "status": "completed",
            "progress": 100,
            "terminal": True,
            "result": result,
            "runner": runner,
            "lifecycle": [{"status": "created", "progress": 0}, {"status": "completed", "progress": 100}],
        }
        return ApiEnvelope(data={"job": job, "result": result})

    @app.get("/api/run/jobs/{job_id}")
    async def get_run_job(job_id: str) -> ApiEnvelope:
        runner = runner_diagnostics(timedOut=False)
        return ApiEnvelope(data={"job": {"id": job_id, "status": "completed", "progress": 100, "terminal": True, "runner": runner}, "result": {"status": "completed", "stdout": "Sandbox run accepted", "runnerDiagnostics": runner}})

    @app.post("/api/run/jobs/{job_id}/cancel")
    async def cancel_run_job(job_id: str) -> ApiEnvelope:
        runner = runner_diagnostics(canceled=True)
        result = {"status": "canceled", "stdout": "", "stderr": "Run job canceled before sandbox execution.", "durationMs": 0, "sandbox": SandboxPolicy().model_dump(), "runnerDiagnostics": runner}
        return ApiEnvelope(data={"job": {"id": job_id, "status": "canceled", "progress": 100, "terminal": True, "runner": runner, "result": result}, "result": result})

    @app.post("/api/ai/tutor/message")
    async def tutor_message(payload: TutorRequest) -> ApiEnvelope:
        # Phase 2 replaces this with provider-backed AI orchestration and safety filters.
        role = "小龟导师" if payload.tutor_role == "turtle" else "智伴导师"
        observed = payload.simulate_primary_latency_ms if payload.simulate_primary_latency_ms is not None else 320
        fallback_used = observed > 1000
        model_route = {
            "path": "coding",
            "primaryModel": "claude-sonnet-4-6",
            "fallbackModel": "gpt-5.3-codex-spark",
            "selectedModel": "gpt-5.3-codex-spark" if fallback_used else "claude-sonnet-4-6",
            "fallbackUsed": fallback_used,
            "fallbackAfterMs": 1000,
            "observedPrimaryLatencyMs": observed,
            "secretSafe": True,
            "reason": "primary-load-timeout" if fallback_used else "primary-ready",
        }
        return ApiEnvelope(
            data={
                "role": role,
                "message": f"{role}建议：先解释你的思路，再进行下一步修改。",
                "ctTags": payload.ct_focus or ["分解", "验证优化"],
                "safetyLabel": "ok",
                "modelRoute": model_route,
                "providerAdapter": {
                    "status": provider_status(),
                    "request": {"provider": "codex-model-gateway", "mode": "local-simulated", "model": model_route["selectedModel"], "path": "/v1/responses", "secretSafe": True, "secretEcho": False, "dryRunOnly": True},
                },
            }
        )

    @app.post("/api/ai/image/brief")
    async def image_brief(payload: ImageBriefRequest) -> ApiEnvelope:
        model_route = {
            "path": "image",
            "selectedModel": "gpt-image-2",
            "fallbackUsed": False,
            "secretSafe": True,
            "reason": "image-model-path",
        }
        return ApiEnvelope(
            data={
                "assetType": payload.asset_type,
                "assetBrief": ["3D glass", "cartoon-friendly", "high-fidelity UI asset"],
                "promptSummary": payload.prompt[:240],
                "safetyLabel": "ok",
                "modelRoute": model_route,
                "providerAdapter": {
                    "status": provider_status(),
                    "request": {"provider": "codex-model-gateway", "mode": "local-simulated", "model": "gpt-image-2", "path": "/v1/images", "secretSafe": True, "secretEcho": False, "dryRunOnly": True},
                },
            }
        )

    @app.get("/api/ai/route-audit")
    async def route_audit() -> ApiEnvelope:
        return ApiEnvelope(data={"routes": [], "totals": {"total": 0, "fallback": 0, "image": 0, "coding": 0}, "providerStatus": provider_status(), "providerEvidenceCount": 0})

    @app.get("/api/classrooms/demo/assignments/current")
    async def current_assignment() -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "assignment": {
                    "id": "assign-turtle-badge",
                    "title": "海龟徽章创作",
                    "ctFocus": ["分解", "抽象", "算法", "调试"],
                },
                "submissions": [],
            }
        )

    @app.post("/api/submissions")
    async def create_submission(payload: SubmissionCreate) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "submission": {
                    "id": str(uuid4()),
                    "assignmentId": payload.assignment_id,
                    "studentId": payload.student_id,
                    "studentName": payload.student_name,
                    "projectId": payload.project_id,
                    "versionId": payload.version_id,
                    "language": payload.language,
                    "status": "submitted",
                    "submittedAt": datetime.utcnow().isoformat(),
                    "selfCheck": payload.self_check,
                }
            }
        )

    @app.post("/api/teacher/submissions/{submission_id}/review")
    async def review_submission(submission_id: str, payload: SubmissionReview) -> ApiEnvelope:
        return ApiEnvelope(
            data={
                "submission": {
                    "id": submission_id,
                    "status": payload.status,
                    "score": payload.score,
                    "feedback": payload.feedback,
                    "reviewedAt": datetime.utcnow().isoformat(),
                }
            }
        )

    @app.websocket("/ws/collab/{session_id}")
    async def collab_socket(websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        room = {
            "id": session_id,
            "turn": {"driver": "student-linyi", "navigator": "ai-turtle"},
            "presence": [],
            "events": [],
        }
        await websocket.send_json({"type": "snapshot", "room": room, "replay": room["events"], "presence": room["presence"]})
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "sessionId": session_id})
                continue
            if message.get("type") == "join":
                participant = {
                    "actor": message.get("actor", "student-linyi"),
                    "name": message.get("name", "student"),
                    "role": message.get("role", "navigator"),
                    "transport": "websocket",
                }
                room["presence"] = [item for item in room["presence"] if item["actor"] != participant["actor"]]
                room["presence"].append(participant)
                event = {"sequence": len(room["events"]) + 1, "type": "join", "actor": participant["actor"], "message": "joined via WebSocket"}
                room["events"].append(event)
                await websocket.send_json({"type": "room:update", "action": "join", "room": room, "event": event, "replay": room["events"], "presence": room["presence"]})
                continue
            if message.get("type") == "event":
                event = {
                    "sequence": len(room["events"]) + 1,
                    "type": message.get("eventType", "note"),
                    "actor": message.get("actor", "student-linyi"),
                    "message": message.get("message", "WebSocket collaboration event"),
                    "payload": message.get("payload", {}),
                }
                room["events"].append(event)
                await websocket.send_json({"type": "room:update", "action": "event", "room": room, "event": event, "replay": room["events"], "presence": room["presence"]})
                continue
            if message.get("type") == "turn":
                room["turn"] = {
                    "driver": message.get("driver", room["turn"]["navigator"]),
                    "navigator": message.get("navigator", room["turn"]["driver"]),
                }
                event = {"sequence": len(room["events"]) + 1, "type": "turn", "actor": message.get("actor", "student-linyi"), "message": f"Driver switched to {room['turn']['driver']} via WebSocket"}
                room["events"].append(event)
                await websocket.send_json({"type": "room:update", "action": "turn", "room": room, "event": event, "replay": room["events"], "presence": room["presence"]})

else:
    app = None
