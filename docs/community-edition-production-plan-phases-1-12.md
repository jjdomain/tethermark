# Tethermark Community Edition Production Plan — Phases 1–12

Last updated: 2026-08-08
Purpose: durable implementation and release handoff for a fresh Codex task
Scope: Tethermark Community Edition (CE) in this repository

## How to use this tracker

At the start of a new task:

1. Read `Agent.md`, this file, `README.md`, `docs/release-checklist.md`, and `docs/static-audit-production-readiness.md`.
2. Run `git status --short --branch` and `git log -5 --oneline --decorate` before editing.
3. Confirm the status below against the code and current machine. Treat checkmarks as recorded evidence, not a substitute for rerunning affected gates.
4. Work phases in dependency order unless a phase explicitly says it can run in parallel.
5. Update this file, `PLANS.md`, and `changelog.md` whenever a phase, blocker, product boundary, or recommended order changes.

Status legend:

- **Complete** — implemented and verified for the stated boundary.
- **Mostly complete** — main path exists; named release evidence or cleanup remains.
- **Partial** — contracts or scaffolding exist, but a production path is incomplete.
- **Not started** — planned work is not materially implemented.
- **Blocked** — cannot pass on the current environment or until a named decision/dependency is resolved.

## Product boundary and production definition

Community Edition is a local or trusted-team, self-hosted AI security audit product. It must provide:

- OpenAI Codex with local ChatGPT sign-in as the default provider for operator-started audits.
- Optional API-key providers for other supported LLMs.
- Mock models only for deterministic unit tests, fixtures, CI, and offline demos; mock results must never be presented as real model validation.
- SQLite-backed local persistence, durable jobs, review history, policy snapshots, artifacts, and exports.
- Static repository audits on Windows, macOS, and Linux.
- Local runtime validation through an actual isolated runtime backend. Runtime validation is a primary CE feature, not a hosted-only feature.
- Local Admin/System Policies, governed self-learning, and exportable configuration without requiring a hosted control plane.

CE production does **not** require hosted multi-tenancy, enterprise identity, managed notifications, Supabase/Postgres, n8n, VPS scheduling, or third-party metered sandboxes. Those belong to Tethermark Cloud or AISecurityBase integration work and should not block the CE release unless a shared contract is being changed.

“Production ready” means all automated gates pass, the applicable manual gates have current evidence, a fresh user can install and complete a real audit, and runtime-validated scans execute in a real local sandbox without falling back to unisolated host execution.

## Current repository snapshot

Updated on 2026-08-08 after implementing Phase 4 production static-scanner hardening:

- Branch: `codex/community-edition-phase4-static-scanners`, created from the completed Phase 3 tree at `1a97b84`.
- Scorecard `5.5.0`, Semgrep `1.172.0`, and Trivy `0.73.0` are pinned with checksum-locked, user-isolated setup paths and supported-version enforcement. The final Windows `static-doctor` passed eight checks with no failures; its only warning was the absence of an exported GitHub token for avoiding unauthenticated Scorecard rate limits.
- Real Semgrep and Trivy adversarial-fixture execution passed on Windows in 110.5 seconds. The fixture covers symlinks, hostile filenames, large and binary files, nested repositories, secret-like values, malformed manifests, timeouts, and output flooding. A three-OS GitHub Actions matrix now installs the pinned scanners, runs the doctor and real fixture, and retains evidence for 30 days; Ubuntu and macOS evidence remains pending branch publication.
- A real static audit of `NousResearch/hermes-agent` completed repository analysis, Semgrep, and Trivy with 35 dependency vulnerabilities and explicit Scorecard timeout evidence. A separate authenticated Scorecard smoke passed in 43.6 seconds against upstream commit `b3aa561faffd64f05436e429a6415d175e534ec9`; the audit remained internal-only because its full evidence set was incomplete.
- Phase 4 deterministic verification passed on 2026-08-08: the core suite completed in 81.3 seconds, export and Codex OAuth smoke checks passed, the Pi API E2E passed in 62.1 seconds, and the browser UI E2E passed in 126.6 seconds through triage, remediation, assistant history, approval, and learning workflows.
- Phase 3's bounded commands, deterministic harness, manual workflow, and redacted evidence writer are implemented on this branch. Both primary real-provider gates passed on implementation commit `1bcf6fd` with local `openai_codex`, `gpt-5.6-sol`, and `chatgpt_session`; API-key validation remains optional secondary evidence.
- The structured integration gate passed in 6.4 seconds with one request and 14,385 measured tokens. Its redacted summary is `.artifacts/live-validation/live-llm-integration-2026-08-07T19-37-56-515Z.json`.
- The fixed-fixture E2E passed in 497.1 seconds with eight requests and 194,433 measured tokens. It completed all six required agent roles, produced nine cited findings, 24 control results, six evidence records, and 51 artifacts, then passed persistence, Markdown, SARIF, executive-export, redaction, and static-execution-block assertions. Its redacted summary is `.artifacts/live-validation/live-audit-e2e-2026-08-07T19-37-31-469Z.json`.
- Phase 3 completion `npm run release:check`: **passed** on 2026-08-07 in 79.1 seconds after both live gates and the tracker update. Build, the full regression suite, export validation, all three bundled fixtures, and the fail-closed live-validation harness passed.
- The Connections/Agent Configuration readiness check now distinguishes a cached ChatGPT authentication session from a runnable Codex CLI. It runs a bounded, no-shell `codex login status` probe, exposes an advanced command override, and blocks the audit-ready state when the CLI is missing, inaccessible, times out, or fails its auth check.
- Phase 3 `npm run release:check`: **passed** on 2026-08-06 in 124.5 seconds. Build, regression tests (including provider timeout/backoff), export validation, all three bundled fixtures, and the fail-closed live-validation harness passed without a live model call.
- Phase 3 Codex-default clarification `npm run release:check`: **passed** on 2026-08-07 in 108.6 seconds. The deterministic harness verified the standard live commands resolve to Codex and the explicitly named API commands remain secondary; no live quota was consumed.
- Phase 3 Codex readiness fix `npm run release:check`: **passed** on 2026-08-07 in 98.2 seconds. The deterministic OAuth smoke also passed the authenticated-session/CLI-unavailable regression; the real workstation smoke correctly remained blocked with `authenticated: true`, `execution_status: command_inaccessible`, and `ready: false`, without invoking a model.
- Phase 2 `npm run release:check`: **passed** on 2026-08-03 in 117.2 seconds on the final reviewed tree. Build, the full regression suite, export validation, and all three bundled validation fixtures passed with provider-policy enforcement and retry-attempt accounting enabled.
- `npm run release:check`: **passed** on 2026-08-02 in 94.4 seconds. Build, tests, export validation, and all three bundled validation fixtures passed.
- `npm run production:static-release`: **passed** on 2026-08-02 in 303.3 seconds on the final runtime-fixture implementation tree after installing Playwright Chromium and correcting the browser E2E's renamed Audits navigation selector and isolated benchmark-suite staging.
- The prior static-tool availability gap is resolved on Windows. Deterministic Pi E2E jobs intentionally disable local binaries and assert explicit skipped evidence, while the separate real-scanner gate requires executable pinned tools.
- `npm run production:runtime-readiness`: **passed** on 2026-08-02 in 36.1 seconds with Docker Desktop `29.3.0` on the Linux engine. A digest-pinned Alpine fixture executed with no network, read-only source/root filesystems, bounded writable scratch, non-root execution, dropped capabilities, no-new-privileges, CPU/memory/PID/output limits, exact policy inspection, structured evidence, and verified container/temp cleanup. Independent post-gate checks found no leftover fixture containers or temp roots. `localRuntimeProvider.execute()` remains a blocked placeholder, so real audit-target runtime execution is still Phase 8 work.
- The real Codex sign-in smoke and both bounded live inference gates now pass with a directly executable signed-in CLI.
- The Local Runtime Sandbox resolver and policy contracts exist, but `localRuntimeProvider.execute()` still returns a blocked placeholder. The Linux container backend has execution-plan scaffolding but is not yet the finished isolated CE execution path.
- The governed self-learning v1 path exists for CE and is off by default. Candidate generation/promotion is human governed. Hosted products may extend it, but it is not hosted-only.
- Local ChatGPT-session credentials are blocked for unattended/background model synthesis. The approved matrix requires API-key or mock credentials for unattended and service work.

## Phase summary

| Phase | Outcome | Current status | Primary blocker or remaining gate |
|---|---|---|---|
| 1 | Recover and stabilize the current branch | **Complete** | None; PR #1 passed final review and required checks |
| 2 | Lock CE boundaries, provider policy, and safe defaults | **Complete** | None; policy matrix, enforcement, audit fields, and regression coverage are in place |
| 3 | Separate deterministic CI from real-model release validation | **Complete** | None; both Codex/ChatGPT-session gates passed with redacted evidence on implementation commit `1bcf6fd` |
| 4 | Make static scanners production dependable | **Partial** | Ubuntu/macOS real-scanner CI evidence after branch publication |
| 5 | Calibrate audit quality, evidence integrity, and scoring | **Mostly complete** | Golden-repo calibration and false-positive review |
| 6 | Complete review, remediation, exports, and operator workflows | **Mostly complete** | Manual fresh-user workflow and release evidence |
| 7 | Implement Admin/System Policies and extensive-scan controls | **Not started** | Schema, persistence, resolver, UI/API, migrations, tests |
| 8 | Execute local runtime scans in a real isolated sandbox | **Partial** | Readiness fixture passes; provider execution is still blocked/scaffolded |
| 9 | Operationalize runtime evals and Python workers | **Partial** | Garak/Inspect/PyRIT adapters are not a verified production pipeline |
| 10 | Harden persistence, jobs, maintenance, and governed learning | **Mostly complete** | Stress/recovery tests, retention automation, learning consumption decision |
| 11 | Package, secure, and verify cross-platform installation | **Partial** | Fresh-machine installers, SBOM/signing, hardened deployment profiles |
| 12 | Run release candidate, beta, and production launch gates | **Not started** | Depends on Phases 1–11 and explicit release acceptance |

---

## Phase 1 — Recover and stabilize the current work

Status: **Complete**

Objective: preserve the recovered work, make the branch reproducible, and establish a clean baseline before new feature work.

Completed or evidenced:

- Recovered branch is on GitHub and previously had green GitHub checks.
- Provider/learning production-boundary hardening exists in commit `9a430b1`.
- Deterministic release check passed on 2026-08-02.
- Runtime readiness now executes a real isolated Docker Desktop fixture and persists assertion/cleanup evidence; real audit-target execution remains an owned Phase 8 follow-up.

Remaining tasks:

- [x] Review `git diff origin/codex/community-edition-phase1-recovery...HEAD` and confirm the pending commit contains no credentials, personal paths, generated artifacts, or unrelated files.
- [x] Push commit `9a430b1` and the Phase 1 planning/readiness update on the existing recovery branch.
- [x] Install the expected browser with `npx playwright install chromium`.
- [x] Rerun `npm run production:static-release` and save the result in the PR/release evidence. Passed locally on 2026-08-02 in 303.3 seconds on the final implementation tree.
- [x] Start Docker Desktop, select the Linux engine, confirm `docker info` reaches a Linux server, and rerun `npm run production:runtime-readiness`.
- [x] Implement isolated fixture execution and make `production:runtime-readiness` pass only after the fixture and isolation/cleanup assertions succeed. Passed locally on 2026-08-02 in 36.1 seconds.
- [x] Re-review the draft PR, mark it ready, and merge only after required checks and manual review pass. Final privacy/scope review and all required checks passed on 2026-08-03.
- [x] After merge, start subsequent phases from an updated `main` branch using a new `codex/` branch. Phase 2 began from merged `main` at `83f73a4` on `codex/community-edition-phase2-provider-policy`.

Exit criteria:

- Recovery branch is pushed, reviewed, and merged with a clean worktree.
- `release:check` and `production:static-release` are green on the release commit.
- Runtime readiness has a truthful result and an owned follow-up; it is not represented as complete until a fixture actually runs inside the selected sandbox.

## Phase 2 — Lock CE product boundaries, provider policy, and safe defaults

Status: **Complete**

Objective: make configuration behavior unambiguous and avoid accidental quota use, unsafe unattended workloads, and misleading tests.

Tasks:

- [x] Make `openai_codex` the CE default for operator-started audits.
- [x] Force mock mode in unit tests and CI, clear live credentials from test processes, and disable the learning scheduler during tests.
- [x] Keep API-key providers optional rather than making them the CE default.
- [x] Default governed learning and LLM learning synthesis to off.
- [x] Remove or rewrite the contradictory README section that says “The default environment is mock-backed.” It is now clearly labeled as an explicit deterministic-development example.
- [x] Define provider workload classes in code and docs: `interactive_operator`, `unattended_local`, and `external_service`.
- [x] Verify current provider terms and product documentation before changing the existing unattended/background ChatGPT-session block. Sources, review dates, allowed workloads, and credential types are recorded in `docs/provider-policy-decision-log.md`.
- [x] Add policy-driven provider/model allowlists, per-run budgets, rate limits, concurrency limits, exponential backoff, and a circuit breaker.
- [x] Surface exact provider, credential class, initiation mode, model, request count, token usage, timestamps, and terminal reason in local audit logs without storing authentication tokens or secrets.
- [x] Ensure no product copy, prompt, job name, or learning workflow describes output collection as training, imitation, model extraction, or distillation.

Account-safety note:

The repository cannot attribute external provider-enforcement events or guarantee that bounded use will never be flagged. Prevention therefore focuses on transparent workload classification, bounded volume, auditable operator intent, approved output-use boundaries, and non-secret request/account logs that can support incident review.

Exit criteria:

- One documented configuration matrix covers interactive CE, unattended CE, CI, and downstream service use.
- Unsupported provider/workload combinations fail before queueing any model work.
- A maintainer can reconstruct what the application requested without exposing credentials or repository secrets.

## Phase 3 — Separate deterministic CI from real-model validation

Status: **Complete**

Objective: keep CI deterministic and free while adding deliberate tests that prove real models work.

Tasks:

- [x] Unit and CI suites use mock providers only.
- [x] Add deterministic Codex ChatGPT-sign-in disconnected/readiness smoke coverage.
- [x] Add `test:integration:llm:live` for one bounded structured-output call using local Codex ChatGPT-session authentication by default; keep API-key coverage explicitly secondary.
- [x] Add `e2e:audit:codex:live` for a small, fixed repository fixture through planner, threat model, specialists, supervisor, remediation, persistence, and export.
- [x] Validate schema conformance, evidence citations, usage accounting, timeout/backoff behavior, and secret redaction—not exact prose.
- [x] Require explicit environment opt-in and a low hard request/token budget. Never run live-model tests in ordinary pull-request CI.
- [x] Provide a primary local Codex maintainer command and an explicitly secondary API-key workflow after the provider/workload policy in Phase 2 is approved.
- [x] Write a dated, redacted result summary without raw model output or local source content.
- [x] Run both live commands against a release-candidate implementation commit and preserve their passing summaries as current release evidence. Both passed on `1bcf6fd` on 2026-08-07.

Exit criteria:

- Deterministic CI remains model-free.
- A release candidate has current evidence of a real Codex ChatGPT-session inference and a real end-to-end audit; an API-key-only pass is insufficient.
- Live tests stop safely at their budget and never retry indefinitely.

## Phase 4 — Make static scanners production dependable

Status: **Implementation complete; cross-platform CI evidence pending branch publication**

Objective: make Scorecard, Semgrep, Trivy, internal analyzers, and their failure semantics reliable on supported operating systems.

Tasks:

- [x] Implement adapters and normalized evidence contracts for OpenSSF Scorecard, Semgrep, and Trivy.
- [x] Fail or degrade explicitly when local binaries are disabled, missing, blocked, timed out, or return invalid output.
- [x] Add a single `doctor`/setup path that verifies exact versions, PATH visibility for child processes, rules/config availability, and network requirements.
- [x] Decide and document whether CE bundles tools, downloads pinned releases, uses containers, or requires user installation per platform.
- [x] Pin versions/checksums and define supported-version ranges.
- [x] Ensure bundled Semgrep rules work offline; do not silently use remote rules or transmit source.
- [x] Exercise Scorecard API fallback only for eligible public GitHub targets and mark unavailable network/API evidence accurately.
- [x] Add malicious and edge-case fixtures: symlinks, path traversal, large files, binary files, nested repositories, hostile filenames, secret-like values, malformed manifests, and tool timeout/output flooding.
- [ ] Run real-tool release smoke checks on Windows, Ubuntu, and macOS and retain evidence. Windows passed locally; the three-OS artifact-retaining GitHub Actions matrix is implemented and must run after publication.
- [x] Define minimum evidence coverage for publishable versus internal-only output.

Exit criteria:

- [x] A fresh supported machine can install or resolve every required static tool through checksum-locked/user-isolated setup paths.
- [x] Readiness matches actual child-process execution, including managed Semgrep's Python runner prefix.
- [x] Missing, timed-out, flooded, or invalid tools cannot create false passes or publishable overclaims.

## Phase 5 — Calibrate audit quality, evidence integrity, and scoring

Status: **Mostly complete**

Objective: produce repeatable, defensible findings and leaderboard-ready scores.

Completed foundation:

- Model-backed planner, threat model, lane specialists, supervisor/skeptic, correction flow, and remediation path exist.
- Deterministic policy and post-supervisor integrity checks exist.
- Standards-based control results, framework rollups, baseline dimensions, publishability, and human-review signals exist.
- Golden export snapshots and bundled validation fixtures exist.

Remaining tasks:

- [ ] Create a versioned benchmark set with intentionally good, mixed, and risky repositories for ordinary, agentic, MCP/plugin, and runnable targets.
- [ ] Have a human reviewer label expected controls, findings, severity bands, evidence sufficiency, and acceptable `not_assessed` outcomes.
- [ ] Measure false positives, false negatives, score drift, model variance, and repeat-run stability.
- [ ] Calibrate weights and publishability thresholds without tuning to one repository.
- [ ] Add cross-control conflict and duplicate-finding tests.
- [ ] Require file/line or artifact citations for claims that can be statically evidenced.
- [ ] Version methodology, prompts, control catalog, policy snapshot, tool versions, and model identity on every run.
- [ ] Define leaderboard comparison rules so different packages or incomplete evidence are not compared as equivalent scans.

Exit criteria:

- Benchmark acceptance thresholds are documented and met.
- A score is traceable to applicable controls and preserved evidence.
- Material model/tool/catalog changes trigger recalibration instead of silently changing rankings.

## Phase 6 — Complete review, remediation, exports, and operator workflows

Status: **Mostly complete**

Objective: let a CE operator complete the full audit lifecycle without database or filesystem surgery.

Completed foundation:

- Durable run and job views, polling, cancellation, retry lineage, completion webhooks, and restart recovery exist.
- Review queue, assignments/actions, runtime follow-up, remediation state, and persisted settings/documents exist.
- JSON, Markdown, executive, SARIF, and related export surfaces exist.
- Local web UI and API/CLI paths exist.

Remaining tasks:

- [ ] Run a clean-machine workflow: onboarding, Codex ChatGPT sign-in, repository preflight, scan, review, remediation, runtime follow-up, exports, and restart recovery.
- [ ] Verify every UI action has loading, empty, permission, validation, retry, and failure states.
- [ ] Verify SARIF against GitHub code scanning and document manual upload/remediation-link behavior.
- [ ] Add export compatibility/version metadata and backward-compatibility tests.
- [ ] Ensure incomplete tools/runtime/model stages are prominent in the report and executive summary.
- [ ] Verify generic webhooks are signed or explicitly documented as untrusted/local-only.
- [ ] Complete operator documentation and screenshots for first run, troubleshooting, backup, and upgrade.

Exit criteria:

- A new user can complete the documented workflow without maintainer assistance.
- Review and remediation history survives restart and is present in exports.
- No UI or export hides an incomplete/blocked validation stage.

## Phase 7 — Implement Admin/System Policies and extensive-scan controls

Status: **Not started**

Objective: replace the current read-only built-in policy view with a local, versioned Admin module that resolves and freezes the controls for every scan.

### 7.1 Domain model

Keep these concepts distinct:

- **Control catalog:** immutable versioned definitions such as `openssf.token_permissions` or `harness_internal.agent_permission_boundaries`.
- **Audit package:** execution depth and resource envelope such as `baseline-static`, `agentic-static`, `deep-static`, or `runtime-validated`.
- **System policy:** administrator rules for who/what may run, required controls, providers, budgets, runtime isolation, evidence, review, retention, and learning.
- **Policy pack:** portable executable control/rule bundle referenced by a system policy.
- **Resolved scan policy:** immutable snapshot of catalog version + package + system policy version + bindings + target applicability written before execution.

The current `premium-comprehensive` package must be reviewed for CE naming/scope. Rename it to a neutral local name or hide it from CE; do not imply a hosted billing tier inside the open-source product.

### 7.2 Persistence and resolution

Implement SQLite migrations and repository contracts for:

- `system_policies`: stable identity, name, description, status, scope, timestamps.
- `system_policy_versions`: immutable version, schema version, JSON definition, checksum, creator/reason.
- `system_policy_bindings`: default and target/project/package bindings with precedence.
- `policy_resolution_snapshots`: exact effective policy stored against each run.
- `policy_change_events`: append-only create, validate, publish, default, archive, import, and rollback history.

Resolution order should be deterministic and visible: built-in safe defaults → active system default → target/project binding → allowed per-run narrowing. A run may narrow scope or budget, but must not weaken required controls, review gates, isolation, or provider restrictions unless the active policy explicitly permits an approved exception. Invalid or ambiguous resolution fails before the job is queued.

### 7.3 Admin API and UI

Add a local admin surface under **System → Policies** with:

- list/search/filter and active/default indicators;
- create from safe template, clone, edit draft, validate, compare versions, publish, archive, rollback, import, and export;
- package bindings and a “preview effective policy” action for a sample target;
- control selection grouped by framework, applicability, static/runtime assessability, and audit lane;
- provider/workload, budget, runtime, evidence, review/publication, retention, and learning sections;
- explicit warnings when a policy requests evidence the current machine cannot collect;
- immutable history and a display of which runs use each version.

Suggested API surface:

- `GET/POST /system/policies`
- `GET/PATCH /system/policies/:id`
- `POST /system/policies/:id/validate`
- `POST /system/policies/:id/publish`
- `POST /system/policies/:id/archive`
- `POST /system/policies/:id/rollback`
- `POST /system/policies/:id/set-default`
- `POST /system/policies/resolve-preview`
- `GET /system/controls` and `GET /system/audit-packages`

In CE, `auth=api_key` protects admin routes with the local API key. In `auth=none`, the UI must warn that any process/user able to reach the service can change policy; default binding should remain localhost-only.

### 7.4 Controls required for an extensive scan

An **extensive static** scan starts from `deep-static`; an **extensive runtime** scan starts from `runtime-validated` (or the renamed comprehensive-local package). The system policy requires all catalog controls that are applicable to the detected target. Non-applicable controls remain visible as `not_applicable`; runtime/external-only evidence that cannot be collected must remain `not_assessed`, never an inferred pass.

Current required-when-applicable catalog groups:

| Group | Control IDs |
|---|---|
| Repository and supply chain | `openssf.security_policy`, `openssf.dependency_update_tool`, `openssf.pinned_dependencies`, `openssf.token_permissions`, `openssf.dangerous_workflow`, `openssf.branch_protection`, `slsa.pinned_build_dependencies`, `slsa.provenance`, `nist_ssdf.disclosure_process`, `nist_ssdf.automated_security_checks` |
| AI/agentic external standards | `owasp_llm.prompt_injection_guardrails`, `owasp_llm.sensitive_information_disclosure`, `owasp_agentic.tool_misuse_boundary`, `mitre_atlas.tool_misuse_mitigation` |
| Internal auditability and evidence | `harness_internal.audit_traceability`, `harness_internal.security_logging`, `harness_internal.eval_harness_presence`, `harness_internal.architecture_evidence` |
| Internal agent/tool/data boundaries | `harness_internal.agent_tool_allowlist`, `harness_internal.agent_permission_boundaries`, `harness_internal.untrusted_content_prompt_injection`, `harness_internal.secret_env_isolation`, `harness_internal.mcp_plugin_permissions`, `harness_internal.browser_automation_safety`, `harness_internal.telemetry_log_redaction` |

The present catalog has 25 definitions. Before runtime production, extend it with explicit executable runtime controls for prompt injection, indirect injection, tool authorization/misuse, secret retrieval, data exfiltration, memory/cross-session leakage, MCP/plugin boundary abuse, unsafe output handling, excessive agency, denial/resource exhaustion, and security telemetry. Map each to the applicable OWASP LLM/Agentic, MITRE ATLAS, NIST AI RMF, and internal eval-pack references. Do not pretend the current static definitions alone constitute runtime coverage.

### 7.5 Operational guardrails for every extensive scan

| Policy area | Required default for extensive scans |
|---|---|
| Authorization | Record operator, target, purpose, scope, initiation mode, and authorization acknowledgement before queueing. |
| Provider workload | Resolve allowed provider/model/credential class against `interactive_operator`, `unattended_local`, or `external_service`; deny an unapproved combination. |
| Model budget | Hard limits for calls, total tokens, wall time, retries, and optional estimated cost; no unbounded recursive reruns. |
| Rate/concurrency | Per-provider and global concurrency limits, request pacing, exponential backoff, and a circuit breaker on repeated auth/rate/policy failures. |
| Target limits | Maximum clone size, file count, file size, generated/binary exclusions, commit/ref pinning, and timeout policy. |
| Deterministic tools | Required tools and versions are declared; missing required evidence downgrades publishability or blocks according to policy. |
| Runtime isolation | No host fallback for untrusted code; read-only target, writable artifact scratch, CPU/memory/PID/time limits, teardown verification. |
| Network | Default deny during runtime; dependency-install egress only when explicit and allowlisted; record all policy phases. |
| Secrets/data | Fake runtime credentials, environment allowlist, prompt/tool/log redaction, source-retention controls, and no raw authentication-token persistence. |
| Review/publication | High publishability threshold, human review for high/critical or incomplete evidence, explicit accepted-risk reason and expiry. |
| Learning | Off by default; explicit consent; review-derived candidates only; no training/distillation corpus; human promotion for policy/severity/evidence changes. |
| Retention | Configured retention for source snapshots, prompts/responses, artifacts, traces, and exports; deletion is auditable. |
| Observability | Persist package/policy/catalog/prompt/tool/model versions, usage, retries, errors, and final coverage with secrets redacted. |

Built-in safe templates:

- `baseline-static-safe`: low-cost repository posture, no runtime.
- `agentic-static-safe`: static agent/data controls, no runtime.
- `extensive-static-safe`: all applicable catalog controls, `deep-static` envelope, high publishability threshold, required review on incomplete evidence.
- `extensive-runtime-local-safe`: all extensive-static requirements plus executable runtime controls and a launchable isolated local backend.

### 7.6 Tests and exit criteria

Tests:

- [ ] Schema validation, checksums, immutable published versions, rollback, archive, and import/export round trips.
- [ ] Resolution precedence and negative tests proving a run cannot weaken required controls or isolation.
- [ ] API authorization and full UI create/edit/validate/publish/default/preview workflow.
- [ ] SQLite migration, backup/restore, restart, and concurrent read/write tests.
- [ ] Golden resolved-policy snapshots for each built-in template and target class.
- [ ] Extensive-scan E2E proving every applicable control is assessed or explicitly not assessed with a reason.
- [x] Provider workload tests proving disallowed background/ChatGPT-session or budget combinations fail before model calls. Covered by Phase 2 provider-policy regressions.
- [ ] Runtime tests proving no unisolated host fallback and no secret/network policy escape.

Exit criteria:

- Every new run has an immutable, exportable resolved-policy snapshot.
- Admin can safely create and activate a local policy without editing files or SQLite directly.
- “Extensive” has an exact, testable control/evidence definition rather than meaning “more model calls.”
- Policy changes cannot rewrite the meaning of completed scans or historical leaderboard entries.

## Phase 8 — Execute local runtime scans in a real isolated sandbox

Status: **Partial**

Objective: turn the current readiness/policy scaffold into actual local isolated execution.

Tasks:

- [x] Provide backend discovery/resolution, readiness statuses, policy construction, and launch gating.
- [x] Define candidate backends including gVisor, rootless Podman, Podman, Docker, and Docker Desktop.
- [ ] Implement `localRuntimeProvider.execute()` against the selected backend instead of returning a blocked placeholder.
- [ ] Keep model-backed planning, supervision, and remediation for operator-started runtime validation on the `openai_codex`/`chatgpt_session` default; require an explicit operator override for API-key routing.
- [ ] Make the Codex model subprocess inference-only for runtime-validation runs and prove it cannot launch target or host commands; do not treat its `read-only` flag as runtime-isolation evidence.
- [ ] Implement Docker first for broad CE usability, then rootless Podman and gVisor hardening on Linux.
- [ ] Never execute untrusted build/runtime commands directly on the host as a fallback.
- [ ] Use exact argv with shell disabled; validate workdir and mounts against traversal/symlink escape.
- [ ] Mount the target read-only and a separate artifacts/scratch directory read-write.
- [ ] Enforce CPU, memory, PID, wall-time, stdout/stderr, file-size, and process-tree limits.
- [ ] Default network to none; implement explicit dependency-install and runtime allowlist phases.
- [ ] Inject only synthetic/fake credentials and fake service/tool backends for adversarial checks.
- [ ] Capture image/template digest, backend/version, exact command, policy, timestamps, exit status, resource summary, artifacts, and cleanup result.
- [ ] Prove cancellation kills descendants and cleanup removes containers, volumes, temp data, and credentials.
- [ ] Add Windows Docker Desktop, macOS Docker Desktop, Linux Docker/Podman, and hardened Linux gVisor fixtures.

Exit criteria:

- `production:runtime-readiness` launches and validates fixtures inside a selected backend.
- Malicious fixtures cannot mutate the source checkout, read host secrets, use unapproved network, or leave processes/resources behind.
- Unsupported environments fail closed with an actionable static fallback.
- Release evidence includes a real runtime-validation audit using both the selected isolated backend and the local Codex ChatGPT-session default; API-only model evidence cannot close this gate.

## Phase 9 — Operationalize runtime evals and Python workers

Status: **Partial**

Objective: produce normalized behavioral evidence from real bounded evals rather than runtime-readiness metadata alone.

Tasks:

- [x] Maintain bounded TypeScript-to-Python worker contracts and adapter scaffolding.
- [ ] Pin Python environment/lockfiles and make worker setup part of `doctor`.
- [ ] Implement and verify Garak, Inspect, and PyRIT adapters behind explicit time/resource/output contracts.
- [ ] Build versioned eval packs for the runtime controls defined in Phase 7.
- [ ] Add framework-aware target startup/health detection for common Node and Python applications and agents.
- [ ] Add fake tools/services and deterministic attack fixtures for prompt/tool/MCP/memory/data-boundary scenarios.
- [ ] Normalize observations into evidence, control results, findings, coverage, and inconclusive reasons.
- [ ] Prevent eval failures or low sample counts from becoming passes.
- [ ] Add cancellation, retry, timeout, output-flood, malformed-worker-output, and partial-result tests.
- [ ] Calibrate behavior tests for repeatability and clearly label nondeterministic confidence/sample limits.

Exit criteria:

- Each supported runtime control has an executable test and traceable evidence path.
- Worker failure is contained and accurately represented.
- Runtime findings survive persistence, review, export, and rerun comparison.

## Phase 10 — Harden persistence, async lifecycle, maintenance, and governed learning

Status: **Mostly complete**

Objective: make long-running local use and recovery dependable without turning learning into uncontrolled autonomous policy change.

Completed foundation:

- SQLite local persistence, concurrent-write protection, durable async jobs/attempts, cancellation/retry, restart recovery, webhooks, artifact pruning, validation/backfill, and governed learning records exist.
- Learning is CE-capable, off by default, consent governed, and requires explicit promotion for sensitive changes.

Remaining tasks:

- [ ] Add crash-at-every-stage recovery tests, concurrent API/worker stress tests, database lock/backoff tests, and disk-full/corruption behavior.
- [ ] Add automatic backup, restore verification, migration rollback guidance, and release-to-release upgrade fixtures.
- [ ] Finish retention scheduling and ensure database rows/artifacts remain consistent after pruning.
- [ ] Decide how promoted learning overlays are consumed by planner/prompts/rules, with strict versioning and rollback.
- [ ] Keep policy/control changes, severity downgrades, suppressions, waivers, evidence reduction, and runtime-probe removal human approved.
- [ ] Keep model synthesis for learning operator initiated unless Phase 2 explicitly approves a different credential/workload combination.
- [ ] Ensure learning inputs are review signals and audit metadata, not a reusable corpus for imitating or distilling provider behavior.
- [ ] Document CE versus hosted scope: the governed core is shared/CE; hosted may add tenant policy, fleet aggregation, and managed scheduling outside this repo.

Exit criteria:

- Abrupt restart does not lose or duplicate terminal state.
- Backup/restore and upgrade are tested.
- Every learned change is explainable, versioned, reversible, and policy authorized.

## Phase 11 — Package, secure, and verify cross-platform installation

Status: **Partial**

Objective: turn a source checkout into a supportable CE distribution.

Tasks:

- [ ] Define supported Node, Python, Windows, macOS, Linux, Docker/Podman, and browser versions.
- [ ] Provide reproducible installation/update/uninstall paths and a one-command first-run setup/doctor.
- [ ] Package or securely bootstrap required browser and static/runtime tools with pinned checksums.
- [ ] Default API/UI binding to localhost; make external binding require explicit auth and warning acknowledgement.
- [ ] Threat-model API key storage, Codex sign-in/session-cache discovery, logs, artifacts, webhooks, archive extraction, repository cloning, and runtime mounts.
- [ ] Run dependency, license, secret, Semgrep, Trivy, and Scorecard release checks with triage policy.
- [ ] Produce an SBOM and signed/checksummed release artifacts; document verification.
- [ ] Add least-privilege service examples and filesystem permissions for shared trusted-team installs.
- [ ] Document data locations, backups, retention, diagnostics bundle creation, privacy, and complete credential removal.
- [ ] Validate clean install and upgrade on Windows, macOS, Ubuntu, and the supported container/server deployment.

Exit criteria:

- A new user can install, diagnose, run, update, back up, restore, and remove CE from published instructions.
- Release artifacts are reproducible enough to verify and contain no secrets or maintainer-specific state.
- Default deployment is not remotely exposed or privileged.

## Phase 12 — Release candidate, beta, and production launch

Status: **Not started**

Objective: promote CE only after current evidence proves the advertised feature boundary.

Release-candidate gates:

- [ ] Phases 1–11 exit criteria are closed or explicitly removed from the advertised release scope.
- [ ] `npm run release:check` passes on the release commit.
- [ ] `npm run production:static-release` passes on the release commit.
- [ ] `npm run production:runtime-readiness` passes and actually launches runtime fixtures.
- [ ] Real OpenAI Codex ChatGPT-session inference and end-to-end audit gates pass under the approved workload policy.
- [ ] Real static tools run on a real repository; missing evidence behavior is reviewed.
- [ ] Fresh-install, upgrade, backup/restore, cancellation/recovery, policy migration, and export compatibility pass.
- [ ] Security review, dependency/license review, SBOM, artifact checksums/signing, docs, and rollback notes are complete.
- [ ] The System Policies extensive-scan templates resolve the expected controls and immutable snapshots.

Launch sequence:

1. Cut an internal release candidate from a protected commit.
2. Run a small consented beta on representative repositories and operating systems with bounded model usage.
3. Triage product defects separately from environment gaps and expected unsupported targets.
4. Freeze methodology/catalog/prompt/package versions for the release.
5. Publish release notes with exact limitations, data behavior, provider requirements, runtime isolation strength, and migration/rollback steps.
6. Tag and publish CE artifacts only after a named maintainer accepts the release evidence.
7. Monitor issues, auth/rate failures, runtime cleanup failures, scoring drift, and upgrade failures; invoke rollback criteria when necessary.

Static-only milestone:

A static-only beta may be cut before Phases 8–9 finish only if it is explicitly named and documented as static-only. It must not advertise runtime validation as production ready. Full CE production requires the local runtime and runtime eval gates.

## Recommended execution order from this snapshot

1. Complete Phase 4 scanner installation/readiness and real-tool evidence.
2. Complete Phase 5 calibration and false-positive review.
3. Complete the Phase 6 clean-user review/remediation/export workflow evidence.
4. Implement Phase 7 System Policies and extensive-scan controls.
5. Implement Phase 8 real sandbox execution, then Phase 9 executable runtime eval packs.
6. Complete Phase 10 stress/recovery hardening and Phase 11 packaging/cross-platform security.
7. Execute Phase 12 release candidate and beta gates.

## Immediate next-task checklist

```powershell
cd <path-to-ai-security-audit-engine>
git status --short --branch
git log -5 --oneline --decorate
git diff origin/main...HEAD
git diff -- PLANS.md changelog.md docs/community-edition-production-plan-phases-1-12.md docs/provider-workload-policy.md docs/provider-policy-decision-log.md
```

Phase 3 is complete. Before starting Phase 4, rerun the deterministic release gate on the completed tracker tree:

```powershell
npm run release:check
```

Then follow the Phase 4 scanner setup, version-pinning, offline-rule, and real-tool evidence tasks above. The live commands in `docs/live-model-validation.md` remain the Phase 3 release-candidate refresh procedure; they are not part of ordinary pull-request CI.
