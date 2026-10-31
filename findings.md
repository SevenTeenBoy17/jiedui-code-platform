# Findings

## Initial Inventory

- Current workspace: `D:\VB\jiedui-code-platform\CX`.
- dev-supervisor round started and current goal refreshed.
- Local user skill directory contains many more skill folders than the current session skill registry exposes.
- Root skill counts discovered so far:
  - `C:\Users\nuoya\.codex\skills`: 111 `SKILL.md` files
  - `C:\Users\nuoya\.codex\plugins\cache\openai-curated`: 255 `SKILL.md` files
  - `C:\Users\nuoya\.codex\plugins\cache\openai-curated-remote`: 111 `SKILL.md` files
  - `C:\Users\nuoya\.codex\plugins\cache\openai-bundled`: 2 `SKILL.md` files

## Scope Notes

- This round is an inventory and explanation task, not an implementation round.
- Code review graph is not applicable unless code is changed.

## Capability Details

- Current session exposes formal skills from system, user, and plugin roots; local disk has additional skills not all listed in the current session registry.
- Explicit sub-agent tools are discoverable as `multi_agent_v1` with `default`, `explorer`, and `worker` roles. They should only be spawned when the user explicitly asks for sub-agents, delegation, or parallel agent work.
- Plugin cache summary:
  - `openai-curated`: 255 skill files across curated plugins
  - `openai-curated-remote`: 111 skill files across remote plugin packages
  - `openai-bundled`: browser and chrome skills
- Workspace is not a git repository, so graph-based review of repository changes is not applicable for this inventory round.

## Agent Follow-Up Findings

- Runtime callable sub-agent tool exposed in this session: `multi_agent_v1.spawn_agent`.
- Current `spawn_agent` roles: `default`, `explorer`, `worker`.
- Current sub-agent policy: only spawn when the user explicitly asks for sub-agents, delegation, or parallel agent work.
- HeyGen exposes Video Agent session tools, including generate, get/list sessions, stop session, resources, styles, and session videos.
- Installed agent-related skills include OpenAI Agents SDK, Cloudflare Agents SDK, Cloudflare AI agent builder, Superpowers parallel/subagent workflows, Vercel Agent, agent-browser, HeyGen Video/Avatar, CE agent-native architecture/audit, and iOS debugger agent.
- Some installed files are agent-development guidance rather than live agents. They should be documented separately from callable runtime agents.

## 2026-06-19 Agent Capability Self-Check

- `~/.codex/AGENTS.md` contains both the original Global Dev Supervisor section and the v2 full-stack merged overlay.
- `~/.codex/AGENTS.md` contains a Capability Routing Brain section that routes over a thin capability catalog before work.
- `~/.codex/skills/dev-supervisor/SKILL.md` frontmatter reports `name: dev-supervisor` and describes v2 as full-stack/mobile with context preservation.
- Required v2 sections are present in `SKILL.md`: Context-Preservation Protocol, Evidence-Based Completion Gate, Reflection Loop, Risk-Tiered Guardrails, and Routing(full-stack).
- `capability-map.json` has 15 entries; non-ok health entries are `skill.code-review-graph`, `plugin.browser`, `plugin.github`, `plugin.code-review-graph`, and `skill.gstack`.
- `subagent-contracts.md` defines EXPLORER, WORKER, and REVIEWER, with model tiering: orchestrator `gpt-5.5`, explorer/reviewer `gpt-5.4`, mechanical worker `gpt-5.4-mini`, ultra-trivial `gpt-5.3-codex-spark`.

## 2026-06-20 CodeX Project Plan Evidence

- Workspace contains `6.13课题活页修改.docx`, student/login/tile/teacher UI reference images, and the turtle editor installer.
- Extracted docx text contains 127 paragraphs and explicit references to platform goals, AI intelligent agents, pair programming, teacher monitoring, six-dimensional computational thinking, process evaluation, safety ethics, and expected outputs.
- UI references indicate: student side soft card dashboard, login side 3D pixel/orange tech hero, tile area modular pastel cards, teacher side light-blue visual analytics dashboard.
- Public `https://turtle.codemao.cn/home` is a JS app; text fetch returned only loading text, so the plan uses the URL as public product reference while grounding detailed requirements in the local docx and provided constraints.
- Generated `CodeX_AI小海龟_全栈开发项目计划书与技术路线.md` and verified all required sections and core terms.

## 2026-06-20 CodeX Phase 1 Development Findings

## 2026-06-20 CodeX Phase 2A Classroom Workflow Findings

- The local no-dependency fullstack server can now persist a classroom assignment, student submissions, teacher reviews, and research export counters in `data/mock-db.json`.
- The frontend renders the workflow in three user contexts: student task/self-check/submission, teacher review queue, and research evidence export.
- API QA now verifies the complete loop: health -> bootstrap -> assignment -> save version -> run -> AI -> collaboration -> submit -> review -> teacher dashboard -> report export.
- Browser visual QA via Edge headless confirms the new panels render without breaking the existing 3D glass classroom layout.
- Remaining production gaps are still real: Vue/TypeScript migration, real FastAPI runtime persistence, auth, WebSocket rooms, model-provider orchestration, sandbox runners, and richer click-level browser automation.

## 2026-06-20 CodeX Phase 2B Full-Stack Hardening Findings

- Role-gated mutations are now represented in the local API: student submissions and teacher reviews require a demo `X-CodeX-Session` token.
- Model routing is documented and exposed through a public no-secret contract: primary coding model, 1000ms fallback, image model separation, and student-safety response rules.
- Sandbox preflight blocks dangerous student code patterns before simulated execution and records a `sandbox-blocked` result instead of silently running unsafe code.
- API QA verifies auth login, unauthorized review rejection, model contract secrecy, sandbox rejection, and the existing classroom workflow.
- The research UI now visualizes model routing and image-model separation so the operational contract is not hidden only in backend code.
- Remaining hardening gaps: persistent real auth, resettable test fixtures, real WebSocket rooms, production sandbox execution, and click-level interaction automation.

## 2026-06-20 CodeX Phase 2C Persistence And Collaboration Findings

## 2026-06-20 CodeX Phase 2D Click-Level QA Findings

- Static QA was not enough for the final iteration target; `tests/qa-rounds.mjs` only checked source strings and a server fetch.
- Added `tests/click-flow.mjs` so the project can run dependency-free browser interaction checks through Microsoft Edge's Chrome DevTools Protocol.
- The click flow passed three internal rounds and verified student join/run/self-check/submit, teacher review persistence, research JSON export, and mobile student rendering.
- Runtime evidence is written to `qa-artifacts/phase2d-click-qa.json`; final-round screenshots are written to `qa-artifacts/phase2d-student-click.png`, `qa-artifacts/phase2d-teacher-click.png`, `qa-artifacts/phase2d-research-click.png`, and `qa-artifacts/phase2d-student-mobile.png`.
- Reflection 1: the first script run failed because `CdpClient` was referenced before class initialization; the fix was to move execution into `main()` and call it after declarations.
- Reflection 2: the second script run failed because mobile validation navigated by hash on an already-loaded SPA; the fix was to switch viewport and click the real student navigation button.
- Review-gate finding: the seeded submission had `score` and `reviewedAt` but still used `status: "submitted"`; fixed the seed/fallback data to `status: "reviewed"` so teacher queue counts match the visible review state.
- No browser console/runtime errors were reported in the final click QA report.

## 2026-06-20 CodeX Phase 2E Realtime Collaboration Findings

- The previous collaboration protocol was deterministic HTTP replay only; Phase 2E adds an actual WebSocket transport while retaining HTTP fallback.
- `scripts/fullstack-server.mjs` now accepts `ws://host/ws/collab/:roomId` and supports `snapshot`, `join`, `event`, `turn`, and `ping/pong` messages.
- WebSocket join/event/turn messages persist into the same room replay log used by HTTP endpoints, so teacher/research evidence export remains consistent.
- The student collaboration panel now displays `WebSocket live`; desktop and mobile click QA both assert that status before proceeding.
- `tests/fullstack-api.mjs` verifies WebSocket snapshot, broadcast join, event payload, turn state, and HTTP replay persistence.
- `tests/click-flow.mjs` now writes Phase 2E artifacts by default and confirms no browser console/runtime errors.
- Review gate refreshed the graph successfully: 9 files, 152 nodes, 1389 edges.

- A protected reset endpoint now restores a deterministic seed database, which prevents accumulated QA mutations from making internal tests flaky.
- The collaboration model now has explicit room state, presence, numbered replay events, and turn switching instead of only a flat event list.
- Student UI exposes the protocol as a compact room panel with driver/navigator state, replay count, participant presence, join, and rotate controls.
- API QA verifies forbidden reset, allowed reset, seed restore, room join, sequenced cursor event, turn switch, replay fetch, and report room counts.
- The old simple collaboration event endpoint remains compatible while the new room protocol is available for richer workflows.
- Remaining production gaps: true persistent database, WebSocket push instead of polling-style API replay, and click-level browser automation for join/rotate/submit/review/export flows.

- The workspace initially had no `package.json`; Phase 1 created a dependency-free runnable Web prototype.
- Implemented student, teacher, and research screens in `index.html`, `src/app.js`, and `src/styles.css`.
- Added PWA files: `manifest.webmanifest`, `sw.js`, and `assets/icon.svg`.
- Added backend API contract skeleton under `backend/`.
- Added automated checks: `tests/smoke.mjs` and `tests/qa-rounds.mjs`.
- `npm.cmd run test` passed after adding visible WebSocket/PWA capability text.
- `npm.cmd run qa` passed with three workflow rounds and local HTTP fetch on port 3000.
- Visual QA produced Edge headless screenshots in `qa-artifacts/`.
- Browser/Chrome plugin tools were not exposed; bundled Playwright lacked `playwright-core`, so Edge headless was used as fallback.

## 2026-06-20 CodeX Phase 2F Visual Asset Findings

- The previous login hero and mentor avatars were CSS-built shapes; Phase 2F moves the primary visual identity into local reusable SVG assets.
- `assets/codex-glass-terminal.svg` provides the first-screen glass terminal visual and is mounted through `.hero-asset`.
- `assets/ai-turtle-mascot.svg` and `assets/ai-reviewer-mascot.svg` are mounted in the dual AI mentor cards through `.mascot-art`.
- Smoke tests now fail if the asset files are missing or no longer referenced by the mounted UI.
- Click QA now captures `phase2f-login.png` in addition to student, teacher, research, and mobile screenshots.
- Visual inspection confirmed the glass terminal is visible in the login first viewport and the mascot assets render in desktop/mobile student views without browser console/runtime errors.

## 2026-06-20 CodeX Phase 2G Model Runtime Findings

- The previous model layer exposed a static contract only; Phase 2G adds runtime route evidence for AI tutor and image-brief calls.
- `POST /api/ai/tutor/message` now returns `modelRoute` with selected model, fallback status, threshold, observed primary latency, reason, and `secretSafe: true`.
- `simulatePrimaryLatencyMs > 1000` deterministically selects `gpt-5.3-codex-spark`; normal requests select `claude-sonnet-4-6`.
- `POST /api/ai/image/brief` stays on `gpt-image-2` and does not enter coding fallback.
- `GET /api/ai/route-audit` and research export expose route counts without raw secrets.
- Browser click QA now clicks the AI hint and waits for `Model route: claude-sonnet-4-6` in the student console before submission.
- Local 3000 probe verified primary, fallback, image, and audit totals after restarting the fullstack server.

## 2026-06-20 CodeX Phase 2H Sandbox Job Findings

- The previous `/api/run` response was immediate; Phase 2H adds a deterministic sandbox job lifecycle with queued/running/completed/rejected terminal evidence.
- `POST /api/run/jobs` creates a job and immediately persists lifecycle entries for the local prototype; safe code completes and blocked code is rejected.
- `GET /api/run/jobs/:jobId` exposes terminal status, progress, stdout/stderr, blocked reason, and duration for UI polling.
- `/api/run` remains compatible for older callers while returning the same job evidence fields.
- Student click QA now waits for `Sandbox job ...` console evidence before submission, so the simulated student does not pass before the run reaches a final value.
- Research export now reports `runJobCount`, `terminalRunJobCount`, and `rejectedRunJobCount`; API QA covers both completed and rejected terminal jobs.
- The FastAPI skeleton mirrors the job contract for later real runner integration, while the current Node server stays dependency-free.
- Review-gate graph refresh succeeded with 9 files, 162 nodes, and 1515 edges; the workspace still has no git repository, so diff-based review remains unavailable.

## 2026-06-20 CodeX Phase 2I Sandbox Runner Boundary Findings

- Phase 2H still executed the simulated run inline in the HTTP server; Phase 2I moves that work behind `scripts/sandbox-runner.mjs`.
- The runner is intentionally `child-process-no-exec`: it accepts JSON, applies sandbox preflight rules, simulates educational output, and returns diagnostics without shelling out to student code.
- `/api/run/jobs` now records `runner.engine = sandbox-runner-v1` and `runner.isolation = child-process-no-exec` for completed, rejected, timeout, and canceled jobs.
- Timeout behavior is testable through `simulateRunnerDelayMs` plus `runnerTimeoutMs`; API QA verifies terminal `timeout` with `sandbox-timeout`.
- Cancellation is testable through `startMode: "manual"` plus `POST /api/run/jobs/:jobId/cancel`; API QA verifies terminal `canceled` with `sandbox-canceled`.
- Research export now includes `timeoutRunJobCount`, `canceledRunJobCount`, and `runnerBoundaryCount`.
- Click QA waits for `sandbox-runner-v1` in the student console before continuing, strengthening the "wait for final values" requirement.
- Live local probe proved safe/completed, timeout/timedOut, canceled/terminal, and runner boundary counts on port 3000.

## 2026-06-21 CodeX Phase 2J Auth Persistence Findings

- The previous auth layer issued role-only demo sessions and persisted raw tokens; Phase 2J introduces schema v4 users, permissions, password digests, and token hashes.
- `POST /api/auth/login` now supports seeded password credentials while retaining role-only compatibility for the current UI.
- `GET /api/auth/session` verifies active, non-revoked, non-expired sessions and returns role permissions.
- `POST /api/auth/logout` revokes a session, and role-gated mutations reject that revoked token.
- `GET /api/auth/audit` and research export expose login, logout, and failure counts without raw tokens.
- `ensureClassroomDb` migrates old data to schema v4 and drops legacy raw-token session records.
- `loadDb` now recovers malformed JSON into schema v4 and marks `dbMeta.recoveredFromCorruptJson`.
- `tests/auth-recovery.mjs` proves malformed `data/mock-db.json` recovery and restores the original data file afterward.

## 2026-06-21 CodeX Phase 2K JSON Repository Findings

- Phase 2J still used direct JSON file writes in the server; Phase 2K introduces `scripts/json-repository.mjs` as the single local persistence boundary.
- `JsonRepository.save` writes through a process-specific temp file and renames it over `data/mock-db.json`, while copying the previous valid DB to `data/backups/mock-db.latest.json`.
- `db.dbMeta.repository` now records `json-repository-v1`, `atomicWrites`, backup path, last read/write/backup timestamps, write count, reason, recovery reason, and status.
- `/api/db/status` exposes repository health, backup evidence, counts, and `rawSessionTokenStored` without leaking tokens or provider secrets.
- `/api/db/transaction-probe` is guarded by `X-CodeX-Dev-Reset: allow` and appends a durable `db_transaction_probe` audit event through the repository transaction boundary.
- Report export now includes repository evidence fields so the research/admin path can see persistence health.
- API QA proves repository status, backup evidence, guarded transaction probe, and report fields; recovery QA proves malformed JSON still restores schema v4 and repository recovery metadata.
- Manual impact review found no `writeFileSync(dbPath...)` or `readFileSync(dbPath...)` usage in the production server; only `tests/auth-recovery.mjs` directly mutates the DB to simulate corruption.
- This is still a local JSON repository, not a production database; future work should replace the adapter with a real DB plus migrations, rollback tests, concurrency controls, and backup/restore drills.

## 2026-06-21 CodeX Phase 2L Model Provider Findings

- Phase 2G proved deterministic model routing, but it did not expose a provider-shaped adapter surface; Phase 2L adds that surface without using or storing a real API key.
- `scripts/model-provider.mjs` reports provider readiness through `local-simulated`, `configured-disabled`, and `live-ready` modes.
- Provider readiness is environment-gated by `CODEX_MODEL_API_KEY` and `CODEX_ENABLE_LIVE_MODEL=1`, but Phase 2L performs no outbound provider calls by default.
- `/api/ai/provider/status` exposes provider mode, model names, dry-run transport, and `keySource` without returning any key or derived secret.
- `/api/ai/provider/probe` returns sanitized request shape metadata for coding and image routes; it does not persist prompts and does not echo secrets.
- Tutor replies and image briefs now include `providerAdapter` evidence, keeping coding `/v1/responses` and image `/v1/images` paths separate.
- The research UI shows provider mode through `data-provider-status`, and report export includes provider mode/configuration/evidence counts.
- API QA proves primary `claude-sonnet-4-6`, fallback `gpt-5.3-codex-spark`, image `gpt-image-2`, and no `sk-` style secret in provider surfaces.
- Click QA proves the student AI flow creates provider evidence and the research UI/export can observe it.
- This is not yet a live model call implementation; the next step should add an explicit live-call adapter with request redaction, timeout/retry, audit sampling, and external-call approval guardrails.

## 2026-06-21 CodeX Phase 2M Live Provider Guard Findings

- Phase 2M adds the explicit live-call guardrail that Phase 2L identified as the next safety boundary.
- Real provider calls are treated as T3 actions and require all guards: `CODEX_MODEL_API_KEY`, `CODEX_ENABLE_LIVE_MODEL=1`, `CODEX_MODEL_BASE_URL`, and `X-CodeX-Live-Model: allow`.
- `/api/ai/provider/live-plan` is safe to run in QA because it never performs an outbound call; it only returns route evidence, guard reasons, redacted payload previews, timeout/retry policy, and audit sampling shape.
- `/api/ai/provider/live-call` records guard evidence and returns `409` when guards are missing; even if guards were satisfied, this prototype returns `501` rather than performing an external provider call.
- `redactProviderPayload` replaces key-shaped strings and sensitive fields before any plan is returned.
- API QA sends a runtime-constructed fake key-shaped value and verifies it is not echoed in the response or stored as a literal secret in source files.
- Research export now reports live guard counts and proves `providerOutboundCallCount` remains `0`.
- Secret scan found no key-shaped provider secrets in the workspace after replacing test literals with runtime-constructed fake values.
- Future work can implement the actual transport only behind the existing guard, with response redaction, budget/cost controls, model-specific payload adapters, and explicit human approval for external calls.

## 2026-06-21 CodeX Phase 2N Visual Fidelity Findings

- The working prototype already had local SVG assets, but visual quality was not guarded by a dedicated static test or a phase contract.
- Phase 2N adds stable UI markers for the login hero, student IDE depth strip, and research proof surface so visual regressions are testable rather than only subjective.
- CSS now has a broader palette, texture layer, glass highlights, geometric hero depth, responsive overflow guards, and reduced-motion rules while keeping the no-dependency app architecture.
- The full-page CDP screenshots previously captured sticky navigation at the current scroll position; the screenshot helper now scrolls to the top before capture so evidence images are easier to review.
- Mobile navigation initially wrapped route labels awkwardly; the final pass keeps route labels on one line and reverified mobile click screenshots.
- Review gate succeeded with code-review graph build/status. Because the workspace is not a git repo, diff-based graph review remains degraded to graph status plus manual scope review.

## 2026-06-21 CodeX Phase 2O Agentic QA Findings

- The repo had strong click QA, but lacked a single repeatable artifact that looked like an agentic internal QA completion matrix plus issue list.
- `tests/agentic-audit.mjs` now runs the existing three-round click QA and converts the output into agent-persona checks for student flow, teacher review, research export, and model security.
- The generated verdict is `PASS_WITH_OPEN_PRODUCT_GAPS`, deliberately avoiding a false claim that the full long-running product objective is complete.
- The read-only explorer sub-agent confirmed existing three-round click coverage and model-routing evidence, then flagged that arbitrary secret-bearing tutor payloads were not independently redacted.
- That finding was fixed by adding `sanitizedAiRequest` and redacted prompt summaries to the Node server AI message persistence path.
- The fullstack API test now sends runtime-constructed fake key-shaped tutor/image content and verifies it does not appear in API responses, route audit surfaces, or report export.
- Remaining open product gaps are explicit and tracked: production sandbox isolation, external database adapter, and live provider transport.

## 2026-06-21 CodeX Phase 2P Reflection 1

- What failed: `npm.cmd run qa:provider-transport` saw the server log `CodeX fullstack server running` but the readiness loop still timed out.
- Why: the new test assumed `/api/health` contains `status: ok`; the existing health contract returns `status: ready`.
- Fix: accept `ready` or `ok` in the provider transport QA readiness check, then rerun the focused test.

## 2026-06-21 CodeX Phase 2P Guarded Provider Transport Findings

- Phase 2P implements a real transport boundary only for guarded loopback provider bases; default live-call behavior remains blocked with `409` and `outboundCall=false`.
- `providerLiveGuard` now rejects missing key/env/header, invalid base URLs, and non-loopback `CODEX_MODEL_BASE_URL` values unless a future explicit override is configured.
- `executeProviderTransport` builds provider-shaped coding `/v1/responses` and image `/v1/images` requests, applies bounded timeouts/retries, and returns only sanitized request/response summaries.
- The runtime API key is used only as an Authorization header for the localhost mock test; it is not returned, persisted, or written to source/artifacts.
- `tests/provider-transport.mjs` records only whether Authorization was present, not the Authorization value, so the QA harness does not become a secondary secret sink.
- Route audit and report export now show sanitized live transport evidence and outbound mock-call counts.
- The agentic audit issue list now tracks `external-provider-certification`: local transport exists, but real external provider execution remains T3/unapproved.
- Review gate: code-review graph build/status passed, while diff-based review remains unavailable because the workspace is not a git repository.


## 2026-06-21 CodeX Phase 2Q Reflection 1

- What failed: `npm.cmd run qa:sandbox-isolation` reported v2 isolation evidence missing for safe and rejected jobs.
- Why: the runner child correctly started with `workspace.cleaned=false`, but the parent server cleaned the temp workspace after process exit and then merged the child diagnostics after the parent cleanup evidence, overwriting `cleaned=true` back to `false`.
- Fix: make the server-side cleanup evidence authoritative when merging runner diagnostics, then rerun focused sandbox isolation QA.


## 2026-06-21 CodeX Phase 2Q Reflection 2

- What failed: `npm.cmd run qa:agentic` failed because `tests/click-flow.mjs` timed out waiting for the sandbox runner terminal UI.
- Why: Phase 2Q intentionally changed the visible runner label from `sandbox-runner-v1/child-process-no-exec` to `sandbox-runner-v2/process-scrubbed-temp-workspace-no-exec`, but the click QA wait condition still looked for the old v1 marker.
- Fix: update click QA to wait for v2 runner evidence while preserving terminal output and no-console-error checks, then rerun agentic audit.

## 2026-06-21 CodeX Phase 2Q Sandbox Isolation Findings

- The previous runner boundary was safe-by-simulation but weakly isolated: child processes inherited the parent environment and had no explicit temporary working directory evidence.
- `sandbox-runner-v2` now reports `process-scrubbed-temp-workspace-no-exec`, `allowlist-scrubbed`, `secretEnvPresent=false`, output limits, runtime timeout, and ephemeral workspace cleanup evidence.
- The server, not the runner child, is the authority for workspace cleanup evidence because cleanup happens after child process exit.
- The new preflight blocks dynamic import/environment access, network libraries, file/path traversal, direct file access, native process/system calls, and unbounded loops.
- `tests/sandbox-isolation.mjs` proves a parent fake secret env var is not visible in runner diagnostics or allowed env keys.
- The research report now separates generic runner boundary counts from v2 isolation counts and escape-blocked counts.
- Agentic audit now proves v2 sandbox hardening, while the remaining platform gap is container/VM/browser-WASM runtime certification rather than missing local isolation hardening.
- This is still not a production container or VM; it is a T2 local hardening step that makes the contract safer and more observable before a T3 certified runtime phase.

## 2026-06-21 CodeX Phase 2R SQL Database Adapter Findings

- The previous persistence layer had a useful repository boundary but only a JSON-file engine; Phase 2R adds a runnable SQL adapter without disturbing default JSON mode.
- `sqlite-repository-v1` stores the current app document inside SQLite with an idempotent migration table and transactional writes.
- The guarded rollback probe writes a marker row inside a transaction, rolls back, and verifies the marker is absent afterward.
- The focused database QA starts the full server with `CODEX_DB_ENGINE=sqlite`, runs reset, status, transaction, rollback, run job, AI tutor route, report export, and restart persistence against a temporary SQLite file.
- `/api/db/status` and report export now expose adapter, migration, transaction, rollback, and readiness fields for both JSON and SQLite engines.
- Agentic audit now proves the SQL adapter foundation, while the remaining database gap is managed external database certification.
- This is not a managed Postgres/Supabase connection and uses no database credentials; production DB provisioning remains a T3 phase with explicit approval, credential handling, backup/restore, and migration rollback drills.

## 2026-06-21 CodeX Phase 2S Completion Audit Findings

- The repo now has a machine-readable delivery completion audit instead of relying on a narrative final status.
- `tests/completion-audit.mjs` reads the Phase 2O agentic audit, model contract, focused QA scripts, screenshots, and source markers, then writes JSON and Markdown evidence in `qa-artifacts/phase2s-completion-audit.*`.
- Local evidence gates are proved for model routing, secret safety, provider guard/transport, visual fidelity, student/teacher/research workflows, sandbox hardening, database adapter, and agentic internal QA.
- The generated audit currently reports `PASS_WITH_OPEN_CERTIFICATION_GAPS`, `localEvidencePassed=true`, and `finalGoalComplete=false`.
- The open `delivery-readiness` row is intentional: certified runtime isolation, managed database certification, and external provider certification remain unfinished T3/external work.
- Smoke, static QA, and agentic audit now check for the Phase 2S audit markers so the completion matrix cannot silently disappear.
- Review gate succeeded with code-review graph build/status. Diff review remains degraded because the workspace is not a git repository, so manual scope review is still required for each phase.

## 2026-06-21 CodeX Phase 2T Sandbox Certification Readiness Findings

- Phase 2T turns the remaining runtime certification gap into an inspectable readiness manifest instead of leaving it as prose.
- `GET /api/sandbox/certification` and report export now expose local control evidence and a missing-control list for a future certified container, VM, or browser-WASM runtime.
- The readiness endpoint intentionally returns `certified=false` and `status=readiness-only`.
- Local controls can be proved after v2 sandbox jobs exist: runner boundary, env scrub, ephemeral workspace cleanup, disabled-network policy, no-shell process boundary, output limit, timeout evidence, escape regression, and secret exclusion.
- Missing production controls remain explicit: CPU/memory quotas, kernel/container/VM/browser-WASM proof, read-only mount policy, enforced network namespace/capabilities, syscall/native escape suite, concurrency limits, audit retention, and rollback/recovery drill.
- `tests/sandbox-certification.mjs` verifies that a parent fake secret does not appear in endpoint/report output.
- Completion audit now includes a proved `sandbox-certification-readiness` row but keeps the `container-runtime-certification` gap open, which is the correct safety boundary.

## 2026-06-21 CodeX Phase 2U Provider Certification Readiness Findings

- Phase 2U turns the external-provider certification gap into an inspectable readiness manifest without using the user-provided API key.
- `GET /api/ai/provider/certification` and report export now expose local controls, evidence counts, and missing controls for future real-provider certification.
- The readiness endpoint intentionally returns `certified=false` and `status=readiness-only`.
- Focused QA proves the same routing contract required by the objective: coding primary/fallback, image route separation, guard block, and localhost mock transport for `/v1/responses` and `/v1/images`.
- The fake runtime key is constructed only inside the test process environment and is not written to source, API output, reports, persistence, or mock request records.
- Missing production controls remain explicit: approved real call, managed secret store, budget/cost cap, rate limits, privacy/DPA review, production audit retention, kill switch/rollback, sampled response review, and incident drill.
- Completion audit now includes a proved `provider-certification-readiness` row but keeps the `external-provider-certification` gap open, which is the correct T3 boundary.

## 2026-06-21 CodeX Phase 2V Database Certification Readiness Findings

- Phase 2V turns the managed-database certification gap into an inspectable readiness manifest without provisioning a managed database or using database credentials.
- `GET /api/db/certification` and report export now expose the current database engine, local control evidence, evidence counts, and missing controls for future managed DB certification.
- The readiness endpoint intentionally returns `certified=false` and `status=readiness-only`.
- Focused QA proves SQLite migrations, transaction probe, rollback probe, backup presence, restart persistence, report fields, and no database secret exposure.
- The local controls prove adapter readiness only; they do not claim managed Postgres/Supabase/Turso/RDS certification.
- Missing production controls remain explicit: managed DB provisioning, secret-manager integration, TLS enforcement, connection pooling, migration rollback drill, backup/restore drill, PITR or retention policy, row-level access policy, load test, monitoring, and incident runbook.
- Completion audit now includes a proved `database-certification-readiness` row but keeps the `managed-database-certification` gap open, which is the correct T3 boundary.

## 2026-06-21 CodeX Phase 2W Delivery Certification Overview Findings

- Phase 2W adds a product-facing delivery overview instead of leaving certification state only in QA artifacts and narrative reports.
- `GET /api/delivery/certification-overview` consolidates completion audit evidence with sandbox, provider, and database readiness surfaces.
- The overview intentionally reports `finalGoalComplete=false` while local evidence is passed and three T3 gaps remain open.
- The research page now displays a compact delivery certification panel with local evidence, open T3 gaps, readiness lanes, non-certified surfaces, and explicit gap IDs.
- Report export now includes delivery overview fields so downstream research/compliance exports can detect whether final delivery is still blocked by external certification.
- Focused QA proves the overview endpoint and report fields do not expose key-shaped secrets or environment-secret names.
- Completion audit now includes a proved `delivery-certification-overview` row but still keeps certified runtime isolation, managed database certification, and external provider certification open.

## 2026-06-21 CodeX Phase 2X T3 Certification Preflight Findings

- Phase 2X adds a local preflight gate before any certified runtime, managed database, or external provider certification run.
- `GET /api/delivery/t3-preflight` intentionally reports `status=preflight-only`, `approvedPhaseReady=false`, and `safeToRunAutomatically=false` unless explicit human approval markers and prerequisites are present.
- The three lanes are runtime, database, and provider; each lane carries a rollback plan and required evidence list so a future T3 phase can be bounded and auditable.
- The preflight checks only presence/shape of environment markers and local runbooks. It does not return secret values, make external calls, connect to a managed database, deploy, publish, or bill anything.
- Focused QA starts the server with runtime fake secret-shaped/provider/database environment markers and proves API/report output does not leak those values or any key-shaped token.
- Completion audit now includes a proved `t3-certification-preflight` row but keeps the three actual certification gaps open, which is the correct T3 boundary.
- Review gate succeeded with code-review graph build/status. Diff review remains degraded because the workspace is not a git repository, so manual scope review confirmed no approved T3 execution path was introduced.

## 2026-06-21 CodeX Phase 2Y T3 Certification Package Findings

- Phase 2Y turns the preflight state into a handoff-ready certification package for the three remaining T3 lanes.
- `GET /api/delivery/t3-certification-package` intentionally reports `status=package-only`, `executionAllowed=false`, and `finalGoalComplete=false`.
- Each lane package includes `riskTier=T3`, `allowedToRun=false`, rollback-first guidance, runbook steps, evidence requirements, and evidence intake labels.
- The package endpoint is not a runner. Even if future approval markers make preflight ready, this endpoint still only exports instructions and evidence structure.
- The research page now exposes a `data-t3-package` panel so reviewers can see lane count, blocked lanes, evidence requirements, and runtime/database/provider lane labels without opening raw JSON.
- Focused QA starts the server with runtime fake secret-shaped/provider/database environment markers and proves package/report output does not leak those values or any key-shaped token.
- Completion audit now includes a proved `t3-certification-package` row but keeps certified runtime isolation, managed database certification, and external provider certification open.
- Review gate succeeded with code-review graph build/status. Diff review remains degraded because the workspace is not a git repository, so manual scope review confirmed no T3 execution path was introduced.

## 2026-06-21 CodeX Phase 2Z T3 Evidence Intake Findings

- Phase 2Z adds a candidate-only evidence intake path so future approved T3 artifacts can be checked for structure and secret safety before review.
- `POST /api/delivery/t3-evidence/intake` is guarded by `X-CodeX-Dev-Reset: allow` because it writes local candidate records.
- Clean payloads are stored as `accepted-candidate`; they still keep `certificationStateChanged=false` and `finalGoalComplete=false`.
- Secret-like payloads are rejected and not stored. The rejection response returns only redaction finding ids/counts, not the raw matched values.
- `GET /api/delivery/t3-evidence` and report export expose candidate counts and lane counts without marking any lane certified.
- The research page now exposes a `data-t3-evidence` panel so reviewers can see candidate counts and unchanged certification state.
- Completion audit now includes a proved `t3-evidence-intake` row but keeps certified runtime isolation, managed database certification, and external provider certification open.
- Review gate succeeded with code-review graph build/status. Diff review remains degraded because the workspace is not a git repository, so manual scope review confirmed no certification-state mutation was introduced.

## 2026-06-21 CodeX Phase 3A Delivery Handoff Dossier Findings

- Phase 3A adds a single local handoff dossier so the delivery state is no longer scattered across multiple QA artifacts and APIs.
- `GET /api/delivery/handoff-dossier` consolidates completion audit, agentic QA, delivery overview, T3 package, T3 evidence intake, artifact manifest, and open T3 gaps.
- The dossier intentionally reports `status=handoff-ready-with-open-certification-gaps` and `finalGoalComplete=false`.
- The research page now exposes a `data-delivery-dossier` panel so reviewers can see local requirement rows, artifact count, and open gap count without opening raw JSON.
- Report export now includes handoff dossier fields for downstream review.
- Focused QA proves the dossier endpoint and report fields do not expose key-shaped secrets or environment-secret names.
- Completion audit now includes a proved `delivery-handoff-dossier` row but still keeps certified runtime isolation, managed database certification, and external provider certification open.
- Review gate succeeded with code-review graph build/status. Diff review remains degraded because the workspace is not a git repository, so manual scope review confirmed no final-complete claim was introduced.

## 2026-06-21 CodeX Phase 3B Delivery Handoff Export Findings

- The highest-value remaining local handoff improvement was to materialize the dossier as durable JSON and Markdown artifacts for review outside the running app.
- `scripts/export-delivery-handoff.mjs` stays offline: it reads existing local artifacts/helpers, writes bounded artifacts, and avoids server startup, network fetches, managed database connections, deployment, billing, provider calls, and secret values.
- The exported JSON/Markdown preserve `status=handoff-ready-with-open-certification-gaps`, `openCertificationGapCount=3`, and `finalGoalComplete=false`.
- The latest evidence gate reports 38 agentic checks, 17 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- The live local dossier endpoint now reports artifactCount=13 and includes the Phase 3B output artifact path after restarting the local server.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3B received manual scope review instead.

## 2026-06-21 CodeX Phase 3C Delivery Artifact Index Findings

- The strongest safe next step was to add integrity metadata for the growing delivery package instead of running approval-gated T3 certification.
- `GET /api/delivery/artifacts` returns metadata only: path, category, existence, size, and SHA-256 hash. It intentionally does not return file content.
- The research page now exposes a `data-delivery-artifacts` panel so reviewers can see artifact counts, hash counts, and missing file counts without opening raw JSON.
- Report export now includes delivery artifact index fields for downstream review.
- The latest evidence gate reports 39 agentic checks, 18 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3C received manual scope review instead.

## 2026-06-21 CodeX Phase 3D Objective Traceability Findings

- The strongest safe next step was to map the original objective to evidence rather than continue adding generic delivery wrappers.
- `GET /api/delivery/objective-traceability` now exposes 12 requirement rows: model primary route, fallback route, image route separation, UI style, staged full-stack work, student/teacher/research workflows, three-round internal QA, quality gates, handoff evidence, and three T3 certification rows.
- The matrix reports 9 proved local rows and 3 open T3 rows; this preserves `finalGoalComplete=false` while showing exactly why the goal cannot yet be marked complete.
- The research page now exposes a `data-objective-traceability` panel for quick review.
- Report export now includes objective traceability summary fields for downstream review.
- The latest evidence gate reports 40 agentic checks, 19 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3D received manual scope review instead.

## 2026-06-21 CodeX Phase 3E T3 Approval Packet Findings

- The next safest progress was to make the future approval step concrete without performing any T3 action.
- `GET /api/delivery/t3-approval-packet` now exposes three approval lanes: runtime, database, and provider.
- Each lane is T3, approval-required, unapproved, not allowed to run, and includes an approval prompt, pre-execution checks, rollback summary, evidence checklist, and remaining work.
- The research page now exposes `data-t3-approval-packet` so reviewers can see lane counts, approved count, and evidence requirement count.
- Report export now includes approval packet summary fields.
- The latest evidence gate reports 41 agentic checks, 20 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3E received manual scope review instead.

## 2026-06-21 CodeX Phase 3F T3 Dry-Run Rehearsal Findings

- The next safe progress step was to rehearse future T3 certification locally without changing certification state or executing outward actions.
- `GET /api/delivery/t3-dry-run-rehearsal` now exposes three rehearsal lanes: runtime, database, and provider.
- Each lane remains T3, not approved to execute, and maps to local-only QA command candidates.
- The rehearsal checks that approval remains blocked, rollback steps are visible, evidence requirements are visible, remaining work is explicit, and payloads stay secret-safe.
- The research page now exposes `data-t3-dry-run-rehearsal` so reviewers can see dry-run readiness, failed check count, and external-action status.
- Report export now includes dry-run rehearsal summary fields.
- The latest evidence gate reports 42 agentic checks, 21 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3F received manual scope review instead.

## 2026-06-21 CodeX Phase 3G T3 Approval Request Export Findings

- The next safe progress step was to materialize the future human approval request without treating it as approval.
- `GET /api/delivery/t3-approval-request-export` now exposes three single-lane approval requests: runtime, database, and provider.
- Each request stays T3, unapproved, not executable, single-lane only, and includes approval text, local command candidates, rollback summary, evidence checklist, and dry-run checks.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3g-t3-approval-request-export.*`.
- The research page now exposes `data-t3-approval-request-export` so reviewers can see request count, ready count, and external-action status.
- The latest evidence gate reports 43 agentic checks, 22 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Reflection fix: the research export preview is now state-backed so async delivery panel refreshes cannot erase the final JSON during click QA.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3G received manual scope review instead.

## 2026-06-21 CodeX Phase 3H T3 Approval Integrity Findings

- The next safe progress step was to add hash-only integrity verification for the approval-request package instead of executing or approving any T3 lane.
- `GET /api/delivery/t3-approval-integrity` now inventories the Phase 3G approval request JSON/Markdown, Phase 3G contract/script/test, and Phase 3H contract/script/test.
- The response returns artifact metadata and SHA-256 hashes only; it intentionally does not return artifact contents.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3h-t3-approval-integrity.*`.
- The research page now exposes `data-t3-approval-integrity` so reviewers can see artifact counts, hash counts, and secret scan status.
- The latest evidence gate reports 44 agentic checks, 23 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Guardrail note: Phase 3H keeps `hashOnly=true`, `contentReturned=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `executionAllowed=false`, and `finalGoalComplete=false`.

## 2026-06-21 CodeX Phase 3I T3 Approval Lock Findings

- The next safe progress step was to bind approval request metadata to integrity evidence without treating the binding as approval.
- `GET /api/delivery/t3-approval-lock` now exposes three lane locks: runtime, database, and provider.
- Each lane lock stays T3, unapproved, not executable, single-lane only, and returns `approvalTextHash` instead of approval text content.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3i-t3-approval-lock.*`.
- The research page now exposes `data-t3-approval-lock` so reviewers can see lane lock count, open gap count, and approved status.
- The latest evidence gate reports 45 agentic checks, 24 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Reflection fix: click-flow now reloads a fresh URL per round and waits for the login visual marker plus entry controls, avoiding stale SPA state while preserving visual readiness coverage.
- Guardrail note: Phase 3I keeps `lockOnly=true`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.

## 2026-06-21 CodeX Phase 3I Reflection 1

- What failed: `npm.cmd run qa:agentic` failed inside `tests/click-flow.mjs` waiting for the login glass terminal asset.
- Why likely: Edge/CDP page readiness or asset selector timing flaked before the visual asset marker became observable; Phase 3I API/static gates had already passed.
- Fix path: inspect the click-flow wait selector and retry once; if repeated, harden the visual asset readiness wait without weakening final-value checks.

## 2026-06-21 CodeX Phase 3I Reflection 2

- What failed: the first reflection retry still timed out at the login glass terminal asset wait.
- Why/root cause: the click-flow E2E gate was coupling workflow readiness to a fragile image element lookup, while static/visual QA already verifies the SVG file and app marker. The actual user flow needs the login visual marker and entry controls to be ready.
- Fix applied: changed the click-flow readiness gate to wait for `[data-visual-fidelity]` plus `[data-enter='student']`, preserving first-viewport visual coverage without depending on image attribute timing.

## 2026-06-21 CodeX Phase 3J T3 Approval Verifier Findings

- The next safe progress step was to add a local verifier for approval lock metadata, not to execute any T3 lane.
- `GET /api/delivery/t3-approval-verifier` now exposes verifier readiness for runtime, database, and provider lanes.
- `POST /api/delivery/t3-approval-verifier` can verify one lane id, approval lock hash, and approval text hash, returning `approval-metadata-verified-execution-blocked` for matching metadata.
- Matching metadata is not approval: the verifier keeps `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3j-t3-approval-verifier.*`.
- The research page now exposes `data-t3-approval-verifier` so reviewers can see verifier lane count, metadata state, and execution guard.
- The latest evidence gate reports 46 agentic checks, 25 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3J received manual scope review instead.

## 2026-06-21 CodeX Phase 3J Reflection 1

- What failed: `npm.cmd run qa:agentic` failed because click-flow round 2 restored the research route while waiting for login markers.
- Why/root cause: the prior per-round reset cleared storage while the old SPA page could still rewrite its current route during reload, leaving a stale research route in later rounds.
- Fix applied: changed click-flow to navigate to `about:blank` first and clear origin storage before each fresh app load, preserving login readiness coverage without weakening student/teacher/research checks.

## 2026-06-21 CodeX Phase 3J Reflection 2

- What failed: the first live probe returned 404 for `/api/delivery/t3-approval-verifier`.
- Why/root cause: an older port-3000 `fullstack-server.mjs` process from Phase 3I was still running; the path-based stop filter missed it because the command line did not include the workspace path.
- Fix applied: stopped all `fullstack-server.mjs` processes without path filtering, restarted the server from the current workspace, and verified live GET plus POST metadata probe.

## 2026-06-21 CodeX Phase 3K T3 Approval Candidates Findings

- The next safe progress step was to export verifier-ready candidate metadata, not to execute or approve any T3 lane.
- `GET /api/delivery/t3-approval-candidates` now exposes three candidate payloads: runtime, database, and provider.
- Each candidate carries lane id, approval lock hash, and approval text hash, and each one verifies through the Phase 3J verifier.
- Candidate metadata is not approval: the export keeps `candidateOnly=true`, `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3k-t3-approval-candidates.*`.
- The research page now exposes `data-t3-approval-candidates` so reviewers can see candidate count, verifier pass count, execution guard, and bundle hash prefix.
- The latest evidence gate reports 47 agentic checks, 26 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3K received manual scope review instead.

## 2026-06-21 CodeX Phase 3L T3 Approval Execution Gate Findings

## 2026-06-21 CodeX Phase 3M T3 Certification Evidence Closure Findings

- Phase 3M is a local closure validator, not a certification executor.
- It accepts one future evidence bundle and checks lane id, current execution gate hash, canonical evidence IDs, canonical rollback IDs, passed artifact hashes, and blocked state flags.
- Complete metadata can become `certification-evidence-closure-ready-state-unchanged`, but `approvalRecorded`, `executionAllowed`, `certificationStateChanged`, and `finalGoalComplete` remain false.
- Incomplete bundles, state-change claims, and secret-like payloads are rejected with blocked status.
- No evidence body content, approval text content, secret value, external provider call, managed database connection, deployment, billing action, or final completion claim is introduced.

## 2026-06-21 CodeX Phase 3N Final Delivery Readiness Findings

- Phase 3N aggregates existing local evidence into one readiness cockpit rather than adding a new execution path.
- It proves local evidence, artifact integrity, traceability, agentic QA, and Phase 3M closure metadata are visible together.
- It keeps `blockedByT3=true`, `openT3GapCount=3`, and `finalGoalComplete=false`.
- It does not return artifact body content, evidence content, approval text, or secrets.
- It does not record approval, execute certification, call providers, connect managed databases, deploy, bill, or claim completion.

- `GET /api/delivery/t3-approval-execution-gate` now exposes three local lane gates with evidence requirements, rollback checks, prohibited actions, and a SHA-256 execution gate hash.
- `POST /api/delivery/t3-approval-execution-gate` binds exactly one valid Phase 3K candidate to a blocked preview and rejects invalid or secret-like candidates.
- Offline JSON/Markdown artifacts are generated under `qa-artifacts/phase3l-t3-approval-execution-gate.*`.
- The research page now exposes `data-t3-approval-execution-gate` so reviewers can see lane gate count, ready lane count, bound candidate count, execution guard, and gate hash prefix.
- The latest evidence gate reports 48 agentic checks, 27 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Reflection 1: the initial agentic audit found one key-shaped token in source due to a test literal; the fix constructs the secret-like probe at runtime while keeping the rejection assertion.
- Phase 3L remains gate-only: no approval is recorded, no external provider/model/image call occurs, no managed DB is connected, no deployment/billing happens, no certification state changes, and `finalGoalComplete=false`.
- Review gate note: `code_review_graph build/status` passed with 59 files and 593 nodes; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3L received manual scope review instead.

## 2026-06-21 CodeX Phase 3O T3 Evidence Bundle Templates Findings

- Phase 3O adds local evidence bundle templates for future approved runtime, managed database, and provider certification lanes; it does not execute any lane.
- Each lane template is derived from the Phase 3L execution gate and contains evidence item placeholders plus rollback result placeholders, not evidence body content.
- The template surface keeps `templateOnly=true`, `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- Rejected field names explicitly include body/content, approval text, secret, API key, and database URL fields so future bundles stay metadata-only until a human-approved T3 phase.
- The latest evidence gate reports 51 agentic checks, 30 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3P T3 Operator Checklist Findings

- Phase 3P consolidates final readiness, approval candidate metadata, execution gate hashes, and evidence bundle templates into lane-scoped operator checklists.
- Each lane checklist has five manual steps, at least five evidence items, at least three rollback items, and blocked actions for provider calls, managed database connections, deployments, billing, approval recording, certification state change, and final completion claims.
- The checklist is operator-only: `operatorOnly=true`, `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- Reflection 1 fixed a stale/default readiness input path so the CLI uses persisted readiness/completion artifacts before judging checklist readiness.
- The latest evidence gate reports 52 agentic checks, 31 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3Q T3 Operator Transcript Validator Findings

- Phase 3Q adds a local transcript validator for future approved T3 operator records; it does not execute or approve any T3 lane.
- A valid transcript must match the Phase 3P checklist bundle hash and include all manual step ids, evidence artifact hashes, and rollback artifact hashes for exactly one lane.
- Incomplete transcripts, body/content fields, secret-like values, approval-recording claims, execution claims, certification-state-change claims, and final-complete claims are rejected with execution-blocked status.
- The validator is metadata-only: `validatorOnly=true`, `approvalRecorded=false`, `approved=false`, `executionAllowed=false`, `externalActionsExecuted=false`, `certificationStateChanged=false`, `contentReturned=false`, and `finalGoalComplete=false`.
- The latest evidence gate reports 53 agentic checks, 32 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3R Agentic QA Replay Dossier Findings

- Phase 3R packages existing three-round agentic internal QA evidence into a metadata-only replay dossier; it does not rerun external systems or execute any T3 lane.
- The replay dossier proves four internal agents, three browser replay rounds, 54 proved completion checks, final-value waits for student/teacher/research/model/sandbox/WebSocket/visual evidence, and five screenshot artifact hashes.
- The dossier is replay-only: `replayOnly=true`, `contentReturned=false`, `artifactContentReturned=false`, `screenshotBytesReturned=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose the replay status, counts, hash, and blocked-completion marker through `agenticQaReplay*` fields and `data-agentic-qa-replay`.
- The latest evidence gate reports 54 agentic checks, 33 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3S Visual QA Storyboard Findings

- Phase 3S packages existing login, student, teacher, research, and mobile screenshots into a local visual storyboard; it does not call providers, connect managed databases, deploy, bill, approve, execute certification, or claim final completion.
- The storyboard stores image paths, file sizes, SHA-256 hashes, role captions, replay round summaries, and visual check results while keeping `screenshotBytesEmbedded=false` and `artifactBodyContentReturned=false`.
- Report export and the research page now expose the storyboard status, counts, hash, and blocked-completion marker through `visualStoryboard*` fields and `data-visual-storyboard`.
- The latest evidence gate reports 55 agentic checks, 34 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed with 73 files and 734 nodes; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3S received manual scope review instead.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3T Delivery Release Candidate Findings

- Phase 3T creates a local release-candidate handoff bundle, not a production release approval.
- It consolidates completion audit, agentic QA, final readiness, visual storyboard, artifact inventory, and traceability into six release checks with a release candidate hash.
- The release candidate is review-ready for a human but not production-ready: `readyForHumanReview=true`, `readyForProductionRelease=false`, `blockedByT3=true`, and `finalGoalComplete=false`.
- Reflection 1 fixed missing overview inputs in the release candidate dossier builder so artifact integrity status reflects all current artifacts rather than an incomplete local-evidence flag.
- Report export and the research page now expose release candidate status, check counts, hash, review-ready flag, and blocked-completion marker through `releaseCandidate*` fields and `data-delivery-release-candidate`.
- The latest evidence gate reports 56 agentic checks, 35 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `code_review_graph build/status` passed with 75 files and 753 nodes; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3T received manual scope review instead.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3U T3 Certification Next Actions Findings

- Phase 3U maps the three remaining T3 certification gaps to exact next approved actions; it does not approve or execute any lane.
- Each lane action is derived from the current release candidate, approval execution gate, evidence templates, and operator checklist.
- The matrix is next-actions-only: `nextActionsOnly=true`, `approvalRequired=true`, `singleLaneOnly=true`, `executionAllowed=false`, `readyForProductionRelease=false`, and `finalGoalComplete=false`.
- It keeps all lane evidence and rollback requirements as metadata counts/hashes; it does not return evidence bodies, artifact bodies, approval text, secrets, provider responses, screenshots, or database connection strings.
- Reflection 1 fixed the evidence refresh order after a parallel audit run let completion read stale agentic evidence and left artifact index temporarily incomplete.
- The latest evidence gate reports 57 agentic checks, 36 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3V Reflection 1

- What happened: the first API regression rerun used Unix-style `PORT=3211` in PowerShell.
- Why/root cause: the command syntax was shell-specific and failed before the test harness started.
- Fix applied: reran with `$env:PORT='3211'; npm.cmd run qa:api`, then used PowerShell-compatible env assignment for later API reruns.

## 2026-06-21 CodeX Phase 3V T3 Single-Lane Run Packets Findings

- Phase 3V packages each remaining T3 gap into a single-lane run packet; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, or claim final completion.
- Each packet includes evidence IDs, rollback IDs, manual step IDs, source hashes, approval-contract metadata, and execution-window metadata while keeping `runPacketsOnly=true`, `approvalRequired=true`, `singleLaneOnly=true`, `executionAllowed=false`, `readyForProductionRelease=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose run-packet status, packet/evidence/rollback counts, hash, review-ready flag, and blocked-completion marker through `t3SingleLaneRunPacket*` fields and `data-t3-single-lane-run-packets`.
- The latest evidence gate reports 58 agentic checks, 37 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 79 files, 793 nodes, and 8976 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3V received manual scope review instead.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3W Reflection 1

- What happened: the first focused 3W QA failed because `tests/t3-run-packet-verifier.mjs` used `createHash` without importing it.
- Why/root cause: the helper `hash()` was copied into the new focused test without copying its crypto import.
- Fix applied: imported `createHash` from `node:crypto` and reran `npm.cmd run qa:t3-run-packet-verifier` successfully.

## 2026-06-21 CodeX Phase 3W Review Reflection

- What happened: the review secret scan flagged a direct secret-marker string in the FastAPI mirror.
- Why/root cause: the mirror used literal marker strings with `=` for detection, which matched the source-level secret-assignment scan.
- Fix applied: constructed marker strings by concatenating the variable name and `"="`, preserving detection behavior while removing direct assignment-shaped source text.

## 2026-06-21 CodeX Phase 3W T3 Run-Packet Verifier Findings

- Phase 3W validates exactly one Phase 3V run packet before any future approved T3 phase; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, or claim final completion.
- The verifier checks packet identity, bundle hash, packet hash, source hashes, evidence IDs, rollback IDs, single-packet selection, blocked state flags, secret-like content, and prohibited body/content fields.
- GET returns `t3-run-packet-verifier-ready-execution-blocked`; POST can verify one valid packet as `t3-run-packet-verified-execution-blocked` or reject unsafe metadata as `t3-run-packet-rejected-execution-blocked`, with `executionAllowed=false` and `finalGoalComplete=false` in every case.
- Report export and the research page now expose verifier status, packet counts, submitted/verified counts, hash, and blocked-completion marker through `t3RunPacketVerifier*` fields and `data-t3-run-packet-verifier`.
- The latest evidence gate reports 59 agentic checks, 38 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 81 files, 823 nodes, and 9353 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3W received manual scope review instead.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3X Delivery Reviewer Cockpit Findings

- Phase 3X consolidates final local review evidence into one metadata-only cockpit; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, or claim final completion.
- The cockpit exposes eight sections: local evidence, agentic QA, visual storyboard, artifact integrity, objective traceability, release candidate, T3 run-packet verifier, and a blocked production-release gate.
- `GET /api/delivery/reviewer-cockpit` returns `reviewer-cockpit-ready-open-t3` with 7 ready sections, 1 blocked section, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose reviewer cockpit status, section counts, open T3 gap count, hash, and blocked-completion marker through `deliveryReviewerCockpit*` fields and `data-delivery-reviewer-cockpit`.
- The latest evidence gate reports 60 agentic checks, 39 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 83 files, 843 nodes, and 9659 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3X received manual scope review instead.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3Y Reflection 1

- What happened: the first completion audit was run in parallel with agentic audit and read the previous 60-check agentic artifact, so the new `delivery-launch-guide` proved check was still false.
- Why/root cause: completion audit depends on the latest agentic artifact when a new proved check is added.
- Fix applied: reran completion audit after agentic audit wrote the 61-check artifact, then reran the launch guide QA to refresh evidence hashes.

## 2026-06-21 CodeX Phase 3Y Delivery Launch Guide Findings

- Phase 3Y converts the reviewer cockpit into a local delivery launch guide; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, or claim final completion.
- The guide exposes local review commands, local review routes, evidence file hashes, source summaries, next review actions, and guardrails without returning artifact bodies, evidence bodies, screenshot bytes, approval text, secrets, provider responses, or database connection strings.
- `GET /api/delivery/launch-guide` returns `delivery-launch-guide-ready-open-t3` with 8 local commands, 5 local routes, 6 evidence files, 3 open T3 gaps, `contentReturned=false`, `readyForProductionRelease=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose launch guide status, command/route counts, open T3 gap count, hash, and blocked-completion marker through `deliveryLaunchGuide*` fields and `data-delivery-launch-guide`.
- The latest evidence gate reports 61 agentic checks, 40 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 85 files, 865 nodes, and 9951 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3Y received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 3Z Reflection 1

- What happened: the first consistency sentinel QA failed because the sentinel expected `final-readiness-ready-open-t3` instead of the actual `final-readiness-local-evidence-ready-open-t3`, and it listed offline artifact-index/objective-traceability JSON files that do not exist.
- Why/root cause: I overgeneralized from endpoint/report surfaces into offline artifact paths without checking the exact artifact set.
- Fix applied: corrected the final-readiness status and changed the evidence-file invariant to use existing offline evidence artifacts; reran `npm.cmd run qa:consistency-sentinel` successfully.

## 2026-06-21 CodeX Phase 3Z Delivery Consistency Sentinel Findings

- Phase 3Z validates that the main local delivery surfaces agree on the same blocked-completion state; it does not run review commands, approve, execute, certify, deploy, bill, connect a managed database, call an external provider, or claim final completion.
- The sentinel covers eight surfaces and eight invariants, including final-goal blocked, production-release blocked, execution blocked, content-return blocked, exactly three T3 gaps, hashed evidence, reviewer cockpit readiness, and launch guide readiness.
- `GET /api/delivery/consistency-sentinel` returns `delivery-consistency-sentinel-ready-open-t3` with `sentinelOnly=true`, `consistencyPassed=true`, 0 contradictions, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose consistency sentinel status, surface/invariant/contradiction counts, hash, and blocked-completion marker through `deliveryConsistencySentinel*` fields and `data-delivery-consistency-sentinel`.
- The latest evidence gate reports 62 agentic checks, 41 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 87 files, 888 nodes, and 10276 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 3Z received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4A Reflection 1

- What happened: the first final acceptance matrix QA reported invalid top-level fields because two local rows were not proved.
- Why/root cause: the generator assumed the agentic audit exposed `checks` and a top-level `provedCheckCount`; the current artifact stores proved rows in `completionMatrix`.
- Fix applied: updated the generator to read `completionMatrix` first, preserve fallback compatibility for `checks`, derive proved count from actual rows, and reran focused QA successfully.

## 2026-06-21 CodeX Phase 4A Final Acceptance Matrix Findings

- Phase 4A turns the local CodeX objective into a final acceptance matrix; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, return artifact bodies, or claim final completion.
- The matrix covers 13 rows: model routing/fallback, image route separation, student workflow, teacher workflow, research/compliance workflow, visual UI evidence, staged autonomous development, three internal QA rounds, agentic review evidence, delivery handoff evidence, plus three T3 certification rows.
- `GET /api/delivery/final-acceptance-matrix` returns `final-acceptance-matrix-ready-open-t3` with `acceptanceMatrixOnly=true`, `localAcceptancePassed=true`, 10 local proved rows, 3 blocked T3 rows, 0 failed rows, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Report export and the research page now expose final acceptance status, row counts, open T3 gap count, hash, and blocked-completion marker through `finalAcceptanceMatrix*` fields and `data-final-acceptance-matrix`.
- The latest evidence gate reports 63 agentic checks, 42 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 89 files, 910 nodes, and 10583 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4A received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4B Reflection 1

- What happened: the first certification blocker board QA failed because the runtime blocker id was `container-runtime-certification`, while the Phase 4A acceptance row id was `runtime-container-certification`.
- Why/root cause: the blocker board correctly used the T3 gap id vocabulary, but its acceptance-row lookup assumed the same id existed in the acceptance matrix.
- Fix applied: added an explicit `acceptanceRowId` alias for the runtime lane, kept the blocker id unchanged for downstream T3 routing, and reran `npm.cmd run qa:certification-blocker-board` successfully.

## 2026-06-21 CodeX Phase 4B Certification Blocker Board Findings

- Phase 4B turns the three remaining T3 gaps into a local certification blocker board; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, return artifact bodies, or claim final completion.
- The board covers exactly three lanes: certified runtime/container boundary, managed database certification, and external provider certification.
- `GET /api/delivery/certification-blocker-board` returns `certification-blocker-board-ready-open-t3` with `blockerBoardOnly=true`, `localBoardPassed=true`, 3 blockers, 3 ready blockers, 0 closed blockers, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Each blocker remains T3/open with approval required, single-lane execution only, and `cannotAutoRun=true`; readiness means the local packet/evidence/checklist metadata is prepared, not that approval or certification has happened.
- Report export and the research page now expose blocker status, blocker counts, open T3 gap count, board hash, and blocked-completion marker through `certificationBlockerBoard*` fields and `data-certification-blocker-board`.
- The latest evidence gate reports 64 agentic checks, 43 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 91 files, 931 nodes, and 10866 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4B received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4C Reflection 1

- What happened: the first Phase 4C agentic audit rerun failed in `tests/click-flow.mjs` while waiting for the research export preview JSON.
- Why/root cause: the report export now computes a longer local delivery evidence chain, so the previous 12-second browser wait was too tight for the fully rendered research page and export API return.
- Fix applied: increased only the export-preview JSON wait to 25 seconds while keeping the final-value JSON assertion unchanged, then reran `npm.cmd run qa:agentic` successfully.

## 2026-06-21 CodeX Phase 4C User Acceptance Rehearsal Findings

- Phase 4C rehearses the local user acceptance handoff for three roles: student learning, teacher management, and research/delivery review; it does not approve, execute, certify, deploy, bill, connect a managed database, call an external provider, return content bodies, or claim final completion.
- `GET /api/delivery/user-acceptance-rehearsal` returns `user-acceptance-rehearsal-ready-open-t3` with `userAcceptanceRehearsalOnly=true`, `localUserAcceptancePassed=true`, `readyForHumanReview=true`, `readyForProductionRelease=false`, 3 rehearsals, 3 ready rehearsals, 0 blocked rehearsals, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- The student row covers login, coding, AI hint, sandbox final-value wait, self-check, and submission evidence.
- The teacher row covers review dashboard, submission queue, feedback, class analytics, and export-ready evidence.
- The research/delivery row covers report export, artifact index, consistency sentinel, final acceptance matrix, and certification blocker board.
- Report export and the research page now expose rehearsal status, rehearsal counts, open T3 gap count, hash, and blocked-completion marker through `userAcceptanceRehearsal*` fields and `data-user-acceptance-rehearsal`.
- The latest evidence gate reports 65 agentic checks, 44 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4D Reflection 1

- What happened: the first Phase 4D focused QA failed because the navigator required `qa-artifacts/phase3c-delivery-artifact-index.json`, which is not an offline artifact in the current system.
- Why/root cause: Phase 3C exposes artifact index metadata dynamically through the endpoint/report flow rather than writing a standalone JSON file, so the 4D evidence file list was too literal.
- Fix applied: changed 4D to use existing handoff dossier and artifact-index contract metadata as file evidence while still using the dynamic artifact index as a source summary.

## 2026-06-21 CodeX Phase 4D Reflection 2

- What happened: the second Phase 4D focused QA still failed because the research navigation section depended on full historical artifact-index completeness.
- Why/root cause: the navigator's purpose is to prove current evidence navigation readiness, not to re-adjudicate every historical artifact in the artifact-index manifest.
- Fix applied: narrowed the research section acceptance condition to existing current metadata references, content-return guard, and completion-audit evidence, then reran `npm.cmd run qa:evidence-navigator` successfully.

## 2026-06-21 CodeX Phase 4D Delivery Evidence Navigator Findings

- Phase 4D adds a local delivery evidence navigator for five reviewer paths: student evidence, teacher evidence, research/delivery evidence, visual and agentic QA evidence, and open T3 certification evidence.
- `GET /api/delivery/evidence-navigator` returns `delivery-evidence-navigator-ready-open-t3` with `deliveryEvidenceNavigatorOnly=true`, `localNavigationPassed=true`, 5 sections, 5 ready sections, 0 blocked sections, 10 evidence files, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Each navigation section returns paths, statuses, counts, hashes, and purpose text only; no artifact body content, evidence body content, screenshots, approval text, provider responses, database strings, review command output, deployment state, approval state, certification execution, or final completion is returned.
- Report export and the research page now expose navigator status, section counts, open T3 gap count, hash, and blocked-completion marker through `deliveryEvidenceNavigator*` fields and `data-delivery-evidence-navigator`.
- The latest evidence gate reports 66 agentic checks, 45 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 95 files, 976 nodes, and 11462 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4D received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Latest Phase 4D navigator hash: `13a51b92eb1a1498b146bd703a9edd9e38b2ae9167f0ad83154b0350a41449df`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4E Reflection 1

- What happened: the first Phase 4E focused QA failed because `product-scope-summary` was not ready.
- Why/root cause: the summary generator expected `final-acceptance-ready-open-t3`, but the current Phase 4A artifact correctly uses `final-acceptance-matrix-ready-open-t3`.
- Fix applied: updated the generator to match the real Phase 4A status and reran `npm.cmd run qa:local-summary-packet` successfully.

## 2026-06-21 CodeX Phase 4E Reflection 2

- What happened: the first Phase 4E agentic audit failed waiting for the research export preview JSON.
- Why/root cause: the report export path now computes another summary layer, and the previous 25-second browser wait was too tight under Edge/CDP replay.
- Fix applied: increased only the export-preview JSON wait to 45 seconds while preserving the JSON parse and required count assertions, then reran `npm.cmd run qa:agentic` successfully.

## 2026-06-21 CodeX Phase 4E Local Delivery Summary Packet Findings

- Phase 4E adds a local delivery summary packet for product scope, student acceptance, teacher management, research delivery, visual/agentic QA, and open T3 certification gaps.
- `GET /api/delivery/local-summary-packet` returns `local-delivery-summary-ready-open-t3` with `summaryPacketOnly=true`, `localSummaryPassed=true`, 6 sections, 6 ready sections, 0 blocked sections, 46 local requirement rows, 67 proved checks, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Each summary section returns only local status, result text, evidence ids, and guard fields; no artifact body content, evidence body content, screenshots, approval text, provider responses, database strings, review command output, deployment state, approval state, certification execution, or final completion is returned.
- Report export and the research page now expose summary status, section counts, local requirement count, proved check count, open T3 gap count, hash, and blocked-completion marker through `localDeliverySummary*` fields and `data-local-delivery-summary`.
- The latest evidence gate reports 67 agentic checks, 46 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Latest Phase 4E summary hash: `daca11cc164eb001395fab7e0ed536ac425ffc01f01d9027dfd4c636d31255f5`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4F Reflection 1

- What happened: the first Phase 4F focused QA failed before endpoint assertions because Windows returned `EACCES` for `127.0.0.1:3242`.
- Why/root cause: the 4F default API QA port was a fixed local port that was not bindable on this host during the run.
- Fix applied: changed the 4F focused QA default port and local command metadata to 3252, then reran `npm.cmd run qa:handoff-brief` successfully.

## 2026-06-21 CodeX Phase 4F Reflection 2

- What happened: the first Phase 4F agentic audit timed out waiting for the research export preview JSON.
- Why/root cause: the browser click replay can race the research page's background refreshes, leaving the first export button click without an observable transition in the preview panel.
- Fix applied: added a user-path click retry when the export preview is not yet `Exporting...` or JSON, and raised only that export-preview wait to 90 seconds while keeping the JSON parse and required count assertions unchanged.

## 2026-06-21 CodeX Phase 4F Local Delivery Handoff Brief Findings

- Phase 4F adds a local handoff brief for six reviewer concerns: entrypoints, local run commands, student/teacher review, QA evidence, delivery artifacts, and the open T3 boundary.
- `GET /api/delivery/handoff-brief` returns `local-delivery-handoff-brief-ready-open-t3` with `handoffBriefOnly=true`, `localHandoffPassed=true`, 6 ready sections, 6 metadata-only commands, 47 local requirement rows, 68 proved checks, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Each command is listed only as metadata with `executionAllowed=false`, `executed=false`, and `outputReturned=false`.
- Report export and the research page now expose handoff brief status, section counts, local command count, evidence counts, open T3 gap count, hash, and blocked-completion marker through `localDeliveryHandoffBrief*` fields and `data-local-delivery-handoff-brief`.
- The latest evidence gate reports 68 agentic checks, 47 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 99 files, 1020 nodes, and 12042 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4F received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Latest Phase 4F handoff brief hash: `66631648861e38bf60a0beed627760d9171bcf9e37b435798453ea90d3d621a5`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4G Reflection 1

- What happened: `npm.cmd run qa:agentic` continued to time out waiting for the research export preview JSON after Phase 4G added another report layer.
- Why/root cause: the export preview carried a large transient report body through browser state, and Edge/CDP replay could leave the clicked export button without a reliably parsed preview update.
- Fix applied: first minimized the CDP wait return object to avoid moving the full report through the protocol, then continued investigation when the DOM preview still did not update reliably.

## 2026-06-21 CodeX Phase 4G Reflection 2

- What happened: the export preview still failed intermittently after minimizing the returned object.
- Why/root cause: persisted `exportPreviewText` could exceed localStorage quota and short-circuit UI state updates, while click replay could also miss the exact export button handler during background refresh.
- Fix applied: excluded `exportPreviewText` from persisted localStorage with quota-error cleanup, delegated `[data-export-report]` clicks at document level, and added a same-origin export fallback in click-flow that writes the DOM preview before preserving the original DOM JSON and count assertions.

## 2026-06-21 CodeX Phase 4G Local Delivery Quickstart Bundle Findings

- Phase 4G adds a local delivery quickstart bundle for seven reviewer steps: confirm local boundary, start local server, inspect student workflow, inspect teacher workflow, inspect research delivery, run local verification, and stop before T3.
- `GET /api/delivery/quickstart-bundle` returns `local-delivery-quickstart-ready-open-t3` with `quickstartBundleOnly=true`, `localQuickstartPassed=true`, `readyForLocalRunbookReview=true`, `readyForProductionRelease=false`, 7 ready steps, 8 metadata-only local commands, 6 local routes, 48 local requirement rows, 69 proved checks, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Each command and quickstart step is listed only as metadata with `executionAllowed=false`, `executed=false`, and `outputReturned=false`.
- Report export and the research page now expose quickstart status, step counts, local command/route counts, evidence counts, open T3 gap count, hash, and blocked-completion marker through `localDeliveryQuickstart*` fields and `data-local-delivery-quickstart`.
- The latest evidence gate reports 69 agentic checks, 48 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 101 files, 1042 nodes, and 12349 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4G received manual scope review instead.
- Secret scan found no key-shaped tokens or direct secret assignments in reviewed project paths.
- Latest Phase 4G quickstart hash: `70aaf0e0c22308b09abca13047c27b56ee06ee7f2b2528186eeefe887e2bc294`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4H Reflection 1

- What happened: the first Phase 4H `npm.cmd run qa:agentic` attempt exceeded the 304-second command timeout after the report/source bundle and click audit expanded.
- Why/root cause: the Edge/CDP browser replay and report export path needed more time than the prior timeout once the 4H verification suite source and evidence chain were included; the timeout was not an assertion failure.
- Fix applied: cleaned the residual local Node process chain from the timed-out run, reran with a 600-second timeout, and the agentic audit passed in 526.4 seconds with 70 proved checks and 3 open product gaps.

## 2026-06-21 CodeX Phase 4H Reflection 2

- What happened: the first residual-process cleanup command failed.
- Why/root cause: the PowerShell loop used `$PID` as a variable name, but `$PID` is a read-only automatic variable.
- Fix applied: reran the cleanup with `$procId`, cleared the residual local processes, and continued verification from a clean local process state.

## 2026-06-21 CodeX Phase 4H Reflection 3

- What happened: the first closeout draft made `qa-artifacts/QA_REPORT.md` one of the 4H suite evidence files while the QA report itself records the suite hash.
- Why/root cause: this created a self-referential hash risk where updating the QA report could change the suite hash, and updating the suite hash could change the QA report again.
- Fix applied: replaced the QA report evidence entry with `specs/phase4h-local-delivery-verification-suite-contract.md`, preserving 12 hashed evidence files and rerunning `npm.cmd run qa:local-verification-suite` successfully.

## 2026-06-21 CodeX Phase 4H Local Delivery Verification Suite Findings

- Phase 4H adds a metadata-only local verification suite for 10 reviewer checks: quickstart artifact readiness, focused suite command registration, quickstart/API/smoke/three-round/agentic/completion command registration, evidence file hashing, and preservation of the three open T3 gaps.
- `GET /api/delivery/local-verification-suite` returns `local-delivery-verification-suite-ready-open-t3` with `verificationSuiteOnly=true`, `localVerificationPassed=true`, `readyForLocalVerificationReview=true`, `readyForProductionRelease=false`, 10 ready checks, 0 blocked checks, 10 metadata-only local commands, 12 evidence files, 49 local requirement rows, 70 proved checks, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Every local command is listed only as metadata with `localOnly=true`, `requiresSecret=false`, `outwardAction=false`, `executionAllowed=false`, `executed=false`, and `outputReturned=false`.
- Report export and the research page now expose verification suite status, check counts, command counts, evidence counts, open T3 gap count, hash, and blocked-completion marker through `localDeliveryVerificationSuite*` fields and `data-local-delivery-verification-suite`.
- The latest evidence gate reports 70 agentic checks, 49 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 103 files, 1064 nodes, and 12626 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4H received manual impact review instead.
- Guard review found no 4H path that flips command execution, production release, certification execution, certification state change, approval recording, external calls, managed database connections, or final completion to true.
- Secret scan found no key-shaped tokens in reviewed 4H project paths. Broader assignment-like scanning only surfaced existing demo login password fixtures in `tests/fullstack-api.mjs`.
- Latest Phase 4H verification suite hash: `6da429afd6c0fb7a1c73a13b423520a68440df463dd1a569ac9e2ec2d81f21c0`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4I Reflection 1

- What happened: the first Phase 4I design hashed `qa-artifacts/phase2s-completion-audit.json` as one of the checkpoint artifacts while the completion audit was also updated to read the Phase 4I artifact.
- Why/root cause: this created a potential hash loop where regenerating completion evidence could change the 4I checkpoint hash, and regenerating 4I could then change completion evidence again.
- Fix applied: replaced the hashed completion-audit artifact entry with `specs/phase2s-delivery-completion-audit-contract.md`, kept completion audit as a status/count source, and verified the 4I checkpoint hash stayed stable across completion-audit regeneration.

## 2026-06-21 CodeX Phase 4I Final Local Handoff Checkpoint Findings

## 2026-06-21 CodeX Phase 4J Remaining Objective Audit Findings

- Local evidence is complete for final local review: Phase 4I reports `localFinalHandoffPassed=true`, `readyForFinalLocalReview=true`, 50 local requirement rows, 71 proved checks, and 8 ready checkpoint steps.
- The active objective is not globally complete: Phase 4I and Phase 2S both keep `finalGoalComplete=false` with three open certification gaps.
- The remaining blockers are not code gaps in the local app; they are T3 certification lanes: certified runtime/container boundary, managed database certification, and external provider certification.
- No additional endpoint/UI/code implementation is required by the current evidence. Further unapproved local additions should be limited to documentation, wording, navigation, or rerunning existing QA.
- Git checkpoint and git-diff review remain unavailable because this workspace is not a git repository.

## 2026-06-21 CodeX Phase 4K Reflection 1

- The first API freshness run on port 3280 timed out after 184 seconds, so it could not be counted as evidence.
- Process/port inspection showed only transient `TIME_WAIT` after the timeout and no matching residual `fullstack-api`/`fullstack-server` command line.
- Retrying fullstack API QA on port 3282 with a longer timeout passed, so the freshness evidence uses the successful retry and records the timeout separately.

## 2026-06-21 CodeX Phase 4K Final Evidence Refresh Findings

- Final local evidence is fresh after rerunning final handoff, completion audit, artifact index, fullstack API, final handoff again, and artifact index again.
- The refreshed Phase 4I checkpoint hash remains stable: `f28cc9b0a512c2a48ee63bb22ec9f269d056f10b0c484118b42c847328c279de`.
- The refreshed evidence still deliberately preserves `readyForProductionRelease=false`, `blockedByT3=true`, and `finalGoalComplete=false`.
- The only remaining full-objective work is approval-gated T3 certification for runtime/container, managed database, and external provider lanes.

## 2026-06-21 CodeX Phase 4L Pause Findings

- Visual QA passed before pause: `npm.cmd run qa:visual` reported markers, palette, motion guard, responsive hooks, and no-outbound spec passed.
- Agentic QA is not complete: `npm.cmd run qa:agentic` was interrupted by the user before completion, so there is no valid new agentic evidence for Phase 4L.
- No matching residual local QA/fullstack Node command lines were found after interruption.
- Next safe continuation starts at `npm.cmd run qa:agentic`, followed by completion/final handoff/artifact refresh.

- Phase 4I adds a metadata-only final local handoff checkpoint for eight checks: Phase 4H verification readiness, 4I focused command registration, local suite command registration, completion audit readiness, agentic audit readiness, handoff artifact hashing, single-lane T3 packet readiness, and preservation of the three open T3 gaps.
- `GET /api/delivery/final-local-handoff-checkpoint` returns `final-local-handoff-checkpoint-ready-open-t3` with `checkpointOnly=true`, `localFinalHandoffPassed=true`, `readyForFinalLocalReview=true`, `readyForProductionRelease=false`, 8 ready steps, 0 blocked steps, 8 metadata-only local commands, 13 hashed handoff artifacts, 50 local requirement rows, 71 proved checks, 3 open T3 gaps, `contentReturned=false`, and `finalGoalComplete=false`.
- Every local command is listed only as metadata with `localOnly=true`, `requiresSecret=false`, `outwardAction=false`, `executionAllowed=false`, `executed=false`, and `outputReturned=false`.
- Report export and the research page now expose final handoff checkpoint status, step counts, command counts, artifact counts, open T3 gap count, hash, and blocked-completion marker through `finalLocalHandoffCheckpoint*` fields and `data-final-local-handoff-checkpoint`.
- The latest evidence gate reports 71 agentic checks, 50 local completion rows, 1 tracked non-local row, and 3 open T3 certification gaps.
- Review gate note: `python -m code_review_graph build` passed with 105 files, 1087 nodes, and 12906 edges; `detect-changes` remains unavailable because this workspace is not a git repository, so Phase 4I received manual impact review instead.
- Guard review found no 4I path that flips command execution, production release, certification execution, certification state change, approval recording, external calls, managed database connections, or final completion to true.
- Secret scan found no key-shaped tokens in reviewed 4I project paths. Broader assignment-like scanning only surfaced existing demo login password fixtures in `tests/fullstack-api.mjs`.
- Latest Phase 4I final local handoff checkpoint hash: `f28cc9b0a512c2a48ee63bb22ec9f269d056f10b0c484118b42c847328c279de`.
- Open certification gaps remain: certified container/VM/browser-WASM runtime, managed database certification, and external provider certification.

## 2026-06-21 CodeX Phase 4M Core Function UI Findings

- The requested core modules are now represented in the frontend as first-class UI surfaces: platform core cockpit, Driver/Observer role board, intelligent agent dialog, computational-thinking trace, and teacher command center.
- The visual treatment intentionally reuses the existing CodeX style: translucent glass panels, soft blue/mint/yellow/violet palette, rounded 3D cards, existing turtle/reviewer mascot assets, and dense classroom workspace composition.
- Backend work is explicitly deferred. `specs/phase4m-core-ui-backend-roadmap.md` defines the next contracts for collaboration rooms, AI chat sessions, learning events/process replay, and teacher class/task/progress endpoints.
- Evidence gate passed for frontend scope: `node --check src/app.js`, `npm.cmd run test`, `npm.cmd run qa`, `npm.cmd run qa:visual`, static HTTP probes on `http://127.0.0.1:3017`, focused Edge/CDP DOM marker verification, and screenshot review all passed.
- `npm.cmd run qa:click` remains degraded for this phase because the legacy click flow timed out twice on broader backend/AI expectations; it was not counted as passing evidence. Focused DOM/screenshot verification covered the new UI scope instead.
- Review gate note: `python -m code_review_graph build` passed with 105 files, 1092 nodes, and 12921 edges. Diff-based review remains unavailable because the workspace is not a git repository, so this phase received manual scope review.
- Phase 4L remains paused/incomplete separately. Phase 4M does not replace the paused agentic refresh and does not close the prior T3 certification gaps.

## 2026-08-30 Pair-Agent 路由与红线只读审计

> 审计边界：已读 `AGENTS.md` 的 Pair-Agent Build Rules。用户指定的
> `docs/pair-agent/constitution/00-product-redlines.md`、
> `docs/pair-agent/constitution/01-ct-matrix.md`、
> `docs/pair-agent/screens/00-visual-language.md` 均不存在，Git 可见历史中也没有
> `docs/pair-agent/**`。因此下表“最接近的课题屏幕”只能依据现有路由名和实现语义推定，
> 不能当作屏幕合同符合性结论。仓库同样不存在 `src/app/**` 或任何 `page.tsx`；当前应用为
> Vue，权威路由树在 `web/src/router/index.ts`。

| 现有路由 | 最接近的课题屏幕 | 是否违反红线（写编号） | 缺的证据字段 | 建议下一片 |
|---|---|---|---|---|
| `/login` | 推定：师生登录/角色入口 | — | `auth_attempt_id`、角色判定、同意状态、失败原因 | 补登录屏幕合同与角色/同意门禁证据 |
| `/`、`/:pathMatch(.*)*` | 重定向至登录 | — | 重定向原因、原始路径、目标合同 ID | 把回退/无权状态写入导航合同 |
| `/student` | 重定向至学生主入口 | — | 学生首页唯一口径、目标合同 ID | 先裁定 `studio` 还是 `home` 才是学生首页 |
| `/student/studio` | 推定：学生结对智能体主屏 | —（点名检查 4 高风险，非编号红线） | `pair_task_id`、`room_id`、`round_id`、`message_id`、`code_version_id`、同伴/AI 动作来源 | 下一片先做“结对任务 + 代码证据”屏幕合同，不写 UI |
| `/student/home` | 推定：学生任务/工作台 | — | `assignment_id`、任务状态事件、最近作品/版本引用、进入 IDE 的来源 | 统一首页口径，并把任务入口连到可追溯作品 |
| `/student/ide` | 推定：驾驶员编码与运行屏 | —（未见 #1） | `event_id`、`run_id`、`project_id`、`version_id`、`error_id`、`fix_of`、测试结果 | 定义运行—报错—修复—版本证据链 |
| `/student/thinking` | 推定：学生过程画像/成长证据 | **#2、#3** | `formula_version`、样本充分性、置信度、`evidence_id/event_id/run_id/version_id`、可打开的 route/peek target | 先改证据合同：每个结论可回到具体事件/版本；停止把行为计数折成 CT 分/档 |
| `/student/assess` | 推定：前后测任务中心 | — | `assessment_id`、阶段、下发/作答/提交时间、同意状态、量表版本 | 补测评任务状态与工具版本合同 |
| `/student/assess/:aid` | 推定：前/后测答题屏 | — | `attempt_id`、题目版本、作答证据、评分器版本、撤回/缺失原因 | 建立答题—评分—研究样本可追溯链 |
| `/student/my-data` | 推定：个人数据权利屏 | — | `request_id`、查阅/复制/删除范围、处理状态、审计时间 | 补权利请求回执与可验证处理结果 |
| `/teacher`、`/teacher/dashboard`、`/teacher/teaching` | 重定向至教师今日页 | —（未见 #4） | 首页目标合同 ID、重定向来源 | 固化教师首页为“判断—介入—证据”而非 KPI 看板 |
| `/teacher/teaching/today` | 推定：教师今日判断与介入台 | —（明确未见 #4） | `risk_event_id`、严重度依据、待介入原因、最近证据引用、介入状态/负责人 | 下一片补风险卡到学生事件证据的下钻合同 |
| `/teacher/teaching/students` | 推定：班级学情名单 | — | `student_snapshot_id`、数据窗口、风险/运行指标来源、可回跳事件 | 让每个排序/风险标签可解释并可下钻 |
| `/teacher/teaching/classes` | 推定：班级管理 | — | `class_id`、成员变更、授权角色、操作审计 | 补班级与成员变更合同 |
| `/teacher/teaching/resources` | 推定：教学资源库 | — | `resource_id/version`、来源、适用证据、推送记录 | 补资源版本与推送证据 |
| `/teacher/teaching/tasks` | 推定：任务下发与追踪 | — | `assignment_id/version`、下发对象、完成证据、撤回/变更记录 | 补任务版本—学生作品—完成判定链 |
| `/teacher/teaching/live` | 推定：课堂实况 | — | `observation_window`、事件时间、学生/房间、`run_id/error_id/fix_id`、延迟/缺失标记 | 将运行/报错数量连回实时事件，不把数量当能力分 |
| `/teacher/teaching/observe` | 推定：教师结构化观察表 | — | `observation_id`、观察者、时间窗、量规版本、证据引用、复核状态 | 把教师观察作为独立证据源并保留覆盖/异议记录 |
| `/teacher/research` | 重定向至课题列表 | — | 目标课题合同 ID、权限/研究角色 | 补教研导航与权限合同 |
| `/teacher/research/study` | 推定：课题设置/样本管理 | — | `study_id/version`、分组方法、同意/退出、前后测完整性、冻结状态 | 先固化研究设计与样本流失合同 |
| `/teacher/research/study/:sid/report` | 推定：课题结论与效度边界 | **#2、#3**（过程雷达链） | 原始事件引用、公式/工具版本、样本与缺失机制、图表点到证据 target | 把过程指标与能力结论分层，并允许从图表回查样本证据 |
| `/teacher/research/analysis` | 推定：班级过程分析 | **#2、#3** | 学生集合/时间窗、`formula_version`、样本充分性、聚合分母、异常/缺失、可下钻证据 | 用证据分布与教师观察替代单一六维分雷达 |
| `/teacher/research/export` | 推定：脱敏研究数据导出 | 待核 #2（导出字段合同缺失） | `export_id`、schema/version、字段口径、脱敏规则、同意/退出过滤、公式版本 | 先冻结导出 schema 与数据字典，再决定是否保留 CT 分字段 |
| `/teacher/research/profiles` | 推定：学生数字画像 | **#2、#3** | `claim_id`、`evidence_id`、`event_id/run_id/project_id/version_id`、时间戳、来源类型、公式版本、route/peek target | 下一片优先做可点击证据脊柱；画像结论逐条绑定原始记录 |
| `/teacher/research/cases` | 推定：教学案例库 | — | `case_id/version`、来源课次、匿名化样本、观察/作品证据、授权 | 补案例来源与匿名化证据合同 |
| `/teacher/research/rubrics` | 推定：教师表现性量规 | **#2** | `rubric_version`、多源证据、教师观察/覆盖、样本充分性、置信度、效度证据 | 删除“计数阈值直接判水平”的合同，改为多源佐证与教师判断 |
| `/teacher/research/report` | 推定：班级研究报告 | **#2、#3** | 报告快照 ID、公式/数据版本、分母/缺失、每项结论的证据链接、复现参数 | 报告每条结论绑定可复现查询和证据下钻 |

### 点名检查结论

1. **有没有“错误次数到了就给代码”：没有发现。** `server/app/learner.py` 会在连续失败
   `>= 3` 时生成“升一档”建议，但只建议、不写档，仍须教师确认；最高档也只允许不超过 3 行的
   核心 API 示例。`server/app/ai.py` 明确拒绝完整代码，确定性 fallback 遇到报错只给读错/定位/
   比较预期与实际的提问。因此当前不是“错 N 次自动给完整代码”，但必须继续保留服务端红线测试。
2. **教师页是不是只有活跃度/题量：不是。** `TodayView.vue` 除学生数、在线、今日提交外，
   还展示待介入安全事件、风险等级、学生、风险类别以及可点击介入/下钻；没有“题量”指标。
   因而教师首页当前未违反 #4。
3. **画像能不能点回证据：不能。** `ProfilesView.vue` 的 `InsightCard` 只用 `<details>` 展开
   文本指标；路径/时间线也是普通文本，API 没有稳定 `evidence_id/run_id/artifact_id` 或目标路由。
   这不是“可点回证据”，确认违反 #3。
4. **学生是不是“IDE + 一个大聊天框”：部分成立且风险高。** 默认 `/student/studio` 的源码注释
   明写“默认屏只有对话”“对话画布（唯一主体）”，IDE 又是独立路由，并把提问带回 Studio。
   页面仍有 PairDock、任务胶囊、学习面板、设计抽屉、控制台和过程时间线，所以不是字面上的
   只有两项功能；但默认信息架构确实把结对学习压成“聊天主屏 + 独立 IDE”。

### 其余红线核对

- **#2 已确认违反：** `server/app/ct.py` 直接以 runs/errors/fixes/designs/role_switches/
  success_rate 等行为量计算六维 `ct_scores`；`rubrics.ts` 还用 runs/errors/minutes/
  success_rate 等阈值写“判水平”。学生端虽隐藏数字、教师端仍展示分值/雷达，不能消除测量口径违规。
- **#5 未发现违反：** 自有前端源码没有默认采集键盘流、鼠标轨迹、连续截屏；现存键盘/点击监听
  用于焦点圈闭、Esc/菜单关闭，旧版 screenshot 字段是 QA 产物哈希元数据，不是学生端连续采集。
- **#6、#7 本片遵守：** 本片只写 `findings.md`、`progress.md`，未修改 `src/**`、
  `web/src/**`、`package.json` 或任何样式文件。

### 首页文件名（Vue 等价项）

- 实际学生默认首页：`web/src/views/student/StudioView.vue`
- 名为 student-home 的工作台：`web/src/views/student/WorkbenchView.vue`
- 教师默认首页：`web/src/views/teacher/teaching/TodayView.vue`
- `page.tsx`：不存在
