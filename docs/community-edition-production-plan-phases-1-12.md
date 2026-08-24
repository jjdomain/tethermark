# Tethermark Community Edition Production Plan — Phases 1–12

Last updated: 2026-08-18
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

Updated on 2026-08-20 during Phase 5 calibration work from merged Phase 4:

- Branch: `codex/community-edition-phase5-calibration`, created from merged `main` at `ac49c6a`.
- Phase 5 now has a versioned deterministic regression suite covering good, mixed, risky, ordinary, runnable, agentic, and MCP cases. These repo-owned fixtures test repeatability and integrity but are not treated as independent real-world validation.
- The external-ground-truth calibration now pins vulnerable and direct fixed commits for four reviewed advisories: `GHSA-3q26-f695-pp76` / `CVE-2025-53107` in `cyanheads/git-mcp-server`, `GHSA-vjqx-cfc4-9h6v` / `CVE-2026-27735` in `modelcontextprotocol/servers`, `GHSA-rhm9-gp5p-5248` / `CVE-2024-51751` in `gradio-app/gradio`, and `GHSA-rvqx-wpfh-mfx7` / `CVE-2025-3248` in `langflow-ai/langflow`. The fourth pair adds a critical code-injection/missing-authentication class and an OWASP API2:2023 control. Its vulnerable and direct-fixed strict gates both pass with zero advisory-scoped false negatives and false positives. These results cover only the four reviewed known findings, not all possible findings in those repositories.
- The bounded ChatGPT-subscription Langflow pilot passes both cross-model and repeat-run variance. Vulnerable Sol/Terra runs scored 65/65 with seven findings each, and a second Sol run repeated at 65 with seven findings. Fixed Sol/Terra runs scored 71/71 with six findings each, and a second Sol run repeated at 71 with six findings. All four variance gates have zero score and finding-count spread, the vulnerable runs retain exactly one `CVE-2025-3248` match, and the fixed runs have zero advisory-scoped false positives. The six findings shared by vulnerable and fixed snapshots remain outside the advisory ground-truth claim.
- A fresh strict model-free refresh of `external-reviewed-agentic-v1@2026.08.19-v4` passed all eight vulnerable/fixed cases under control catalog v4. Vulnerable/fixed scores and finding counts were Git MCP 55/70 and 10/6, official MCP Git 63/72 and 6/5, Gradio 56/68 and 7/6, and Langflow 64/70 and 7/6. Every vulnerable snapshot retained exactly its reviewed advisory match, every fixed snapshot had zero advisory-scoped false positives, and all integrity summaries had zero blockers.
- The ChatGPT-subscription Git MCP command-injection pilot now passes vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeat gates. Vulnerable Sol/Terra/Sol-repeat results were 55/55/55 with ten findings each; fixed results were 70/70/70 with six findings each. All four score and finding-count spreads were zero, with one `CVE-2025-53107` match on vulnerable snapshots and zero advisory-scoped false positives on fixed snapshots.
- The ChatGPT-subscription official MCP Git path-traversal pilot passes vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeat gates. Vulnerable Sol/Terra/Sol-repeat results were 65/65/65 with six findings each and one `CVE-2026-27735` match per run; fixed results were 73/73/73 with five findings each and zero advisory-scoped false positives. All four score and finding-count spreads were zero with no integrity blockers.
- The first vulnerable Sol attempt exposed a selective-correction merge defect: a one-lane rerun recomputed the global standards audit, and the merger accepted six off-lane re-emitted findings and controls, producing 13 findings, two advisory matches, and six duplicate groups. Selective merge now accepts only control and finding IDs owned by the rerun lane. A regression reproduces the off-lane global recomputation, and the guarded live rerun restored seven findings, one advisory match, and zero duplicate groups.
- Every completed audit now emits a `2026-08-18.run-versions.v1` manifest for methodology, static baseline, control catalog, policy, audit-package catalog, prompt set, tool versions/capabilities, and model identities. Static findings now carry a file/line or artifact citation.
- The benchmark evaluator measures citation coverage, control traceability, false-positive/false-negative rates where eligible ground truth exists, duplicate groups, conflict pairs, score drift, and repeat-run spread. Comparisons fail closed for dry runs, ineligible ground truth, or mismatched suites, thresholds, packages, commits, tools, models, or versioned methodology inputs.
- Two deterministic calibration runs were refreshed after control catalog `2026-08-18.control-catalog.v3`; both passed all four cases with 100% citation coverage, 100% control traceability, zero duplicate/conflict groups, and zero score spread. Scores repeated exactly at 65 (ordinary-good), 36 (runnable-mixed), 33 (agentic-risky), and 50 (MCP-risky). These are engineering diagnostics, not approved baselines, because human label review remains open; the comparison command correctly refuses to treat them as eligible external ground truth.
- The first bounded live multi-model pilot used the local Codex ChatGPT subscription on the reviewed vulnerable Gradio commit. Initial Sol/Terra runs exposed that free-form planner classes and planner-selected control lists could suppress deterministic advisory coverage, producing false negatives and scores 20/61. Prompt set `2026-08-18.agent-context.v2` now constrains target classes, preserves deterministic agentic/MCP classification as a non-downgradable floor, and keeps static-assessable candidate controls in scope. Corrected Sol/Terra runs both passed the known-finding gate with scores 56/57 (spread 1), 100% citation/control traceability, zero advisory-scoped false negatives/positives, and zero duplicate/conflict groups. Finding counts remained model-sensitive at 2/7, so this pilot does not complete multi-model calibration or justify weight tuning.
- The matching fixed-Gradio Sol/Terra pilot also produced zero advisory-scoped false positives, but it failed the cross-model variance gate: Sol passed at 27 with one finding, while Terra failed at 68 with six findings and a static-runtime-overclaim integrity issue, for a score spread of 41 against the threshold of 3. Sol also left two expected controls unassessed. This is recorded as an unresolved scoring/reconciliation and model-stability blocker; weights and integrity gates must not be tuned to hide it.
- Benchmark reports now persist bounded, credential/path-redacted finding summaries with evidence references, control mappings, and integrity diagnostics instead of deleting all finding-level review context with the temporary database. A second fixed-Gradio pair passed the advisory gate and aligned cross-model at 68/68, but repeat analysis isolated instability: Sol changed 27/68 against the repeat threshold of 1, while Terra stayed 68/68 but changed from a failed six-finding run to a passing two-finding run. The repeat outputs retained one shared partially supported build-integrity finding; Terra additionally retained a partially supported agent-guardrails finding. This evidence shifts the blocker from a simple model-score difference to repeat stability and final finding reconciliation.
- Benchmark reports now also persist bounded, credential/path-redacted control-status and dimension-contribution summaries. A third fixed-Gradio Sol run scored 68 with one partially supported build-integrity finding and zero advisory-scoped false positives. Its score is traceable to weighted dimension contributions of 22.5 repository posture, 7.2 agentic guardrails, 20 AI data exposure, 10 observability/auditability, and 8.2 evidence readiness (67.9 rounded to 68). The run also exposed and prompted a regression fix for a benchmark integrity check that interpreted an explicit "runtime impact was not established" disclaimer as an affirmative runtime overclaim.
- Static calibration now uses versioned fixed evidence-plan policy `2026-08-19.calibration-evidence-plan.v1`: `repo_analysis`, Scorecard, Semgrep, and Trivy are mapped to every applicable control, model selection is bypassed, and supervisor correction cannot narrow the set. Reports preserve the plan and attempted providers, comparisons reject plan mismatches, and a missing planned-provider attempt fails closed. The first policy run revealed that correction retained only `repo_analysis`; after enforcing the policy in reassessment too, a final fixed-Gradio Sol run attempted all four providers plus Scorecard API fallback and passed at 68 with one finding and zero advisory-scoped false positives.
- Terra's historical six-finding report predates finding summaries and its temporary database was correctly removed, so its exact six records cannot be reconstructed. The later two-finding report retained build integrity plus one agent-guardrails finding. A new fixed-plan Terra run made the difference reviewable: it passed at 68 with six deterministic heuristic findings (build integrity, three generic agent-guardrails mappings, one agent-permission-boundary finding, and one prompt-injection finding), all partially supported with zero integrity blockers. This shows model supervisor deletion—not score or provider-plan drift—was the remaining count-changing boundary. Reconciliation now protects deterministic heuristic findings unless deterministic integrity independently approves deletion, removes stale findings owned by selectively replaced lanes, and rebuilds control finding references from the final set.
- The fixed-plan vulnerable-Gradio rerun initially produced the same seven finding categories from Sol and Terra, including the reviewed `CVE-2024-51751` family, but scores diverged 20/57 because Sol alone requested ten deterministic controls be changed to `not_assessed`. Control downgrade actions are now advisory unless a deterministic control-quality validator approves the affected IDs. The guarded Sol rerun scored 56 with the same seven findings; formal Sol/Terra variance passed at 56/57 with finding spread zero, advisory-scoped false-negative and false-positive rates zero, and no integrity blockers. The six unrelated findings are not asserted as external ground truth: they also occur on the fixed commit, remain partially supported, and require separate human or advisory evidence before calibration use.
- The fixed-Gradio finding review produced five engineering safeguards: findings cannot survive solely through `not_assessed` controls, equivalent framework claims are consolidated, agent execution findings require path-local agent-to-sink evidence, prompt-injection failures require source-to-prompt/tool dataflow, and non-agent shell sinks remain application-security observations. Fixture expectation metadata is also excluded from source evidence. Fresh fixed-commit Sol/Terra/Sol-repeat runs all scored 87 with the same single `build_integrity` finding. Both formal variance gates passed with zero score and finding-count spread. The project owner approved the AI-adjudicated labels for engineering use without an independent-human-review claim.
- Phase 5 deterministic `npm run release:check` passed again on 2026-08-20 after the reviewed-finding safeguards, with the full regression suite, current export schemas/goldens, all five bundled fixtures, and the fail-closed/redaction harness. Local binaries and Python workers were explicitly disabled for this model-free gate; real-tool evidence remains the completed Phase 4 gate.
- Scorecard `5.5.0`, Semgrep `1.172.0`, and Trivy `0.73.0` are pinned with checksum-locked, user-isolated setup paths and supported-version enforcement. The final Windows `static-doctor` passed eight checks with no failures; its only warning was the absence of an exported GitHub token for avoiding unauthenticated Scorecard rate limits.
- Real Semgrep and Trivy adversarial-fixture execution passed locally on Windows and in GitHub Actions on Windows, Ubuntu, and macOS. The fixture covers symlinks, hostile filenames, large and binary files, nested repositories, secret-like values, malformed manifests, timeouts, and output flooding. Workflow run `32095194344` retained a separate scanner-evidence artifact for each operating system through 2026-09-17.
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
- `npm run production:runtime-readiness`: **passed** on 2026-08-02 in 36.1 seconds with Docker Desktop `29.3.0` on the Linux engine. A digest-pinned Alpine fixture executed with no network, read-only source/root filesystems, bounded writable scratch, non-root execution, dropped capabilities, no-new-privileges, CPU/memory/PID/output limits, exact policy inspection, structured evidence, and verified container/temp cleanup. On 2026-08-21, `localRuntimeProvider.execute()` also completed real digest-pinned Node target tests and service startup through Docker Desktop with exact argv, non-root execution, default-deny network, source immutability, cancellation cleanup, and zero leftover containers/volumes.
- `npm run production:runtime-native -- --backend docker_desktop`: **passed** on 2026-08-24 on Windows 11 x64 with Docker Desktop `4.66.0`, Docker engine `29.3.0`, and the WSL2 Linux engine. The pinned backend passed the malicious readiness fixture plus real Node test, artifact, and bounded-service execution; every step used exact argv and default-deny networking, quota accounting completed, artifact collection succeeded, and no Tethermark container, volume, or network remained.
- Native Runtime Verification [GitHub Actions run `32688251184`](https://github.com/jjdomain/tethermark/actions/runs/32688251184): **passed** on 2026-08-24. Linux x64 executable gates passed for Docker Engine `28.0.4`, rootless Podman `5.8.4`, and gVisor `runsc`; each ran the malicious readiness fixture and the real Node provider fixture with zero Tethermark resources left behind. The macOS 15 arm64 job passed the truthful blocked boundary without claiming Docker Desktop execution.
- The real Codex sign-in smoke and both bounded live inference gates now pass with a directly executable signed-in CLI.
- The Local Runtime Sandbox resolver, policy contracts, and Docker-first execution provider are implemented. Docker now enforces per-file limits plus separate hard tmpfs workspace and artifact-scratch quotas, safely collects regular artifact files, persists resource summaries, injects synthetic-only fixture credentials/services, passes the malicious readiness fixture, and routes explicitly governed dependency-install or external runtime-probe egress through an internal-network allowlisting proxy. Native Windows Docker Desktop and Linux Docker/rootless-Podman/gVisor executable fixtures pass; only real macOS Docker Desktop execution remains open.
- The governed self-learning v1 path exists for CE and is off by default. Candidate generation/promotion is human governed. Hosted products may extend it, but it is not hosted-only.
- Local ChatGPT-session credentials are blocked for unattended/background model synthesis. The approved matrix requires API-key or mock credentials for unattended and service work.

## Phase summary

| Phase | Outcome | Current status | Primary blocker or remaining gate |
|---|---|---|---|
| 1 | Recover and stabilize the current branch | **Complete** | None; PR #1 passed final review and required checks |
| 2 | Lock CE boundaries, provider policy, and safe defaults | **Complete** | None; policy matrix, enforcement, audit fields, and regression coverage are in place |
| 3 | Separate deterministic CI from real-model release validation | **Complete** | None; both Codex/ChatGPT-session gates passed with redacted evidence on implementation commit `1bcf6fd` |
| 4 | Make static scanners production dependable | **Complete** | None; PR #4 passed the three-OS real-scanner matrix and retained all evidence artifacts |
| 5 | Calibrate audit quality, evidence integrity, and scoring | **Complete** | Current four-advisory release set passes; future ground-truth expansion triggers recalibration |
| 6 | Complete review, remediation, exports, and operator workflows | **Complete** | Completed 2026-08-20; see `docs/phase6-operator-workflow-evidence.md` |
| 7 | Implement Admin/System Policies and extensive-scan controls | **Complete for the policy plane** | Executable runtime enforcement is tracked in Phase 8 |
| 8 | Execute local runtime scans in a real isolated sandbox | **In progress** | Windows Docker Desktop and native Linux Docker/rootless-Podman/gVisor passed; a real-Mac Docker Desktop pass remains |
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
- Runtime readiness and real audit-target execution now pass on Windows Docker Desktop plus native Linux Docker, rootless Podman, and gVisor with persisted plan/result/cleanup evidence and no host fallback. Real macOS Docker Desktop execution remains the Phase 8 platform gate.

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

Status: **Complete**

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
- [x] Run real-tool release smoke checks on Windows, Ubuntu, and macOS and retain evidence. Workflow run `32095194344` passed all three jobs and retained the platform artifacts through 2026-09-17.
- [x] Define minimum evidence coverage for publishable versus internal-only output.

Exit criteria:

- [x] A fresh supported machine can install or resolve every required static tool through checksum-locked/user-isolated setup paths.
- [x] Readiness matches actual child-process execution, including managed Semgrep's Python runner prefix.
- [x] Missing, timed-out, flooded, or invalid tools cannot create false passes or publishable overclaims.

## Phase 5 — Calibrate audit quality, evidence integrity, and scoring

Status: **Complete**

Objective: produce repeatable, defensible findings and leaderboard-ready scores.

Completed foundation:

- Model-backed planner, threat model, lane specialists, supervisor/skeptic, correction flow, and remediation path exist.
- Deterministic policy and post-supervisor integrity checks exist.
- Standards-based control results, framework rollups, baseline dimensions, publishability, and human-review signals exist.
- Golden export snapshots and bundled validation fixtures exist.
- A deterministic `community-fixture-calibration-v1` suite covers the required posture and target-family matrix with versioned internal expected-result records and explicit acceptance thresholds.
- Benchmark reports record quality metrics and complete run-version identity; comparison refuses dry runs, ineligible ground truth, and materially different audit inputs.
- Two complete deterministic suite runs produced identical scores and passed the current citation, traceability, duplicate, conflict, and repeat-spread thresholds; this does not close external repository coverage or multi-model calibration work.
- `external-reviewed-agentic-v1` provides independent reviewed ground truth for the vulnerable/fixed states of `CVE-2025-53107`, `CVE-2026-27735`, `CVE-2024-51751`, and `CVE-2025-3248`. A fresh strict model-free refresh passes all eight cases under control catalog v4 with zero advisory-scoped false negatives, false positives, duplicate groups, conflict pairs, or integrity blockers.
- A bounded ChatGPT-subscription Sol/Terra pilot now passes the vulnerable Gradio known-finding gate at scores 56/57 after enforcing deterministic planner classification/control floors. Its 2/7 finding-count difference remains a required broader-calibration signal, not an approved scoring baseline.
- The corresponding fixed-commit pilot produced zero advisory-scoped false positives for both models, but Sol/Terra scores diverged 27/68 and the Terra run failed the static-runtime-overclaim integrity gate. The 41-point spread fails the cross-model threshold and keeps model variance, finding reconciliation, and false-positive review open.
- A repeated fixed-commit pair produced equal Sol/Terra scores of 68 and passed the cross-model score gate, with finding-count/category drift of one (`build_integrity` versus `build_integrity` plus `agent_guardrails`). Same-model analysis still fails: Sol's 27/68 spread exceeds the repeat threshold of 1, and Terra's 68/68 repeat remains ineligible because the earlier run failed while its finding count changed 6/2. Reviewable redacted finding summaries now make these differences inspectable after each benchmark run.
- Fixed-commit Sol calibration now has two policy-versioned repeats at 68/68 with one finding each and zero score/finding-count spread. Variance analysis permits the comparison and records the expected attempted-provider drift from the pre-enforcement correction result (`repo_analysis`) to the non-downgradable result (`repo_analysis`, Scorecard, Scorecard API fallback, Semgrep, and Trivy). The historical score-27 report predates the evidence-plan and scoring-summary schemas, so it remains useful historical evidence but is not input-equivalent to these controlled repeats.
- Fixed-plan Terra calibration now has a reviewable six-finding result at score 68. The old six/two historical pair is not input-equivalent to the new report, but its retained category sets and the new finding summaries isolated the model-only deletion path. Deterministic regressions now prove that a selective lane rerun replaces four stale lane findings with one corrected finding while preserving an unrelated lane finding, and that a partially supported deterministic heuristic cannot be deleted solely by a model action.
- Fixed-plan vulnerable-Gradio calibration now passes the formal cross-model variance gate at Sol/Terra scores 56/57 with identical seven-finding category sets. Two input-equivalent suite-v4 Sol runs also pass the repeat gate at 57/56 with seven findings each, score spread 1, finding-count spread zero, one reviewed advisory match each, and zero final integrity blockers. The comparison gate correctly rejects the older suite-v3 Sol report as non-equivalent because its suite version, evidence plan, and control catalog differ. A regression proves model-only control downgrade requests cannot alter deterministic standards results without deterministic approval.
- Post-review fixed-Gradio calibration now passes at 87/87 for Sol/Terra and 87/87 for the input-equivalent Sol repeat, with one shared `build_integrity` finding and zero score or finding-count spread in both formal variance reports. The five disputed agentic findings are absent after enforcing assessed-control support, path-local execution evidence, prompt dataflow evidence, and cross-framework consolidation. This closes the fixed-Gradio engineering variance blocker without converting the pending human review into an approved label set.
- Fixed-plan Langflow calibration now passes vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeat gates. Vulnerable scores/findings are 65/65 and 7/7; fixed scores/findings are 71/71 and 6/6. Every spread is zero, with zero advisory-scoped false negatives or false positives after constraining selective correction to rerun-lane-owned artifacts.
- Fixed-plan Git MCP calibration passes vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeats. Vulnerable scores/findings are 55/55/55 and 10/10/10; fixed scores/findings are 70/70/70 and 6/6/6. Every spread is zero, the vulnerable runs retain exactly one reviewed `CVE-2025-53107` match each, and the fixed runs have zero advisory-scoped false positives.
- Fixed-plan official MCP Git calibration passes vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeats. Vulnerable scores/findings are 65/65/65 and 6/6/6; fixed scores/findings are 73/73/73 and 5/5/5. Every spread is zero, vulnerable runs retain one reviewed `CVE-2026-27735` match each, fixed runs have zero advisory-scoped false positives, and all six integrity summaries have zero blockers.
- Benchmark runs disable stage reuse so calibration always exercises the current engine and configuration.

Current controlled ChatGPT-subscription variance matrix:

| Reviewed pair and state | Sol / Terra score (findings) | Cross-model score spread | Same-model Sol repeat | Advisory error rate | Calibration status |
|---|---:|---:|---:|---:|---|
| Gradio vulnerable (`CVE-2024-51751`) | 56 (7) / 57 (7) | 1 | 57 (7) / 56 (7), spread 1 | FN 0 | Cross-model and input-equivalent repeat gates pass |
| Gradio fixed | 87 (1) / 87 (1) | 0 | 87 (1) / 87 (1), spread 0 | FP 0 | Post-review gates pass; owner approved AI-adjudicated labels without a human-review claim |
| Langflow vulnerable (`CVE-2025-3248`) | 65 (7) / 65 (7) | 0 | 65 (7) / 65 (7), spread 0 | FN 0 | Pass |
| Langflow fixed | 71 (6) / 71 (6) | 0 | 71 (6) / 71 (6), spread 0 | FP 0 | Pass |
| Git MCP vulnerable (`CVE-2025-53107`) | 55 (10) / 55 (10) | 0 | 55 (10) / 55 (10), spread 0 | FN 0 | Pass |
| Git MCP fixed | 70 (6) / 70 (6) | 0 | 70 (6) / 70 (6), spread 0 | FP 0 | Pass |
| Official MCP Git vulnerable (`CVE-2026-27735`) | 65 (6) / 65 (6) | 0 | 65 (6) / 65 (6), spread 0 | FN 0 | Pass |
| Official MCP Git fixed | 73 (5) / 73 (5) | 0 | 73 (5) / 73 (5), spread 0 | FP 0 | Pass |

Calibration decision on 2026-08-20:

- Keep the current acceptance thresholds unchanged: citation coverage and control traceability must remain 100%; advisory-scoped false-negative and false-positive rates, duplicate groups, and conflict pairs must remain zero; maximum cross-model score drift remains 3 and maximum same-model repeat spread remains 1.
- Keep the current control and dimension weights unchanged. All eight controlled cross-model comparisons pass with a maximum score spread of 1. All eight controlled same-model comparisons also pass: the maximum repeat score spread is 1 and every repeat finding-count spread is zero. The evidence therefore does not support changing weights to improve these results.
- Do not treat the matrix as complete population calibration. It covers four reviewed advisories and therefore remains too narrow for responsible weight or publishability-threshold tuning. Broader independently reviewed vulnerability classes are still required.
- An AI-assisted source review of the five historical Terra-only fixed-Gradio findings is recorded in `docs/phase5-fixed-gradio-finding-review.md`. It recommends false-positive/do-not-publish labels for all five records: three are duplicate unsupported guardrail claims, one incorrectly joins non-agent shell evidence to an agent-permission claim, and one lacks source-to-prompt evidence. The resulting safeguards are implemented and fresh Sol/Terra/Sol-repeat validation converges at 87 with one unrelated build-integrity finding. The packet separately preserves `demo/audio_debugger/run.py` for command-execution triage. On 2026-08-20, the project owner approved these AI-adjudicated labels for engineering use and approved moving forward without making an independent-human-review claim.

Completed release tasks:

- [x] Create a versioned benchmark set with intentionally good, mixed, and risky repositories for ordinary, agentic, MCP/plugin, and runnable targets.
- [x] Add the first externally reviewed vulnerable/fixed repository pair and enforce its known-finding false-positive/false-negative gate.
- [x] Add a second reviewed vulnerable/fixed pair covering a different vulnerability class and prevent finding reconciliation from softening deterministic control failures.
- [x] Add a reviewed vulnerable/fixed pair outside the MCP target family and correct generic plugin-path MCP misclassification.
- [x] Establish independent ground truth across four reviewed advisories, including MCP, agentic, file-payload, command-injection, and authentication-boundary cases; do not use repo-owned fixture labels as external validation.
- [x] Measure score drift, model variance, and repeat-run stability across the current four-pair external set.
- [x] Repeat the controlled variance matrix across the current four-advisory release set.
- [x] Record project-owner approval of the AI-adjudicated fixed-Gradio labels and proceed without claiming independent human review.
- [x] Record the calibration decision to retain current weights and thresholds because the controlled matrix passes and the evidence is too narrow to justify tuning.
- [x] Add cross-control conflict and duplicate-finding tests.
- [x] Require file/line or artifact citations for claims that can be statically evidenced.
- [x] Version methodology, prompts, control catalog, policy snapshot, tool versions, and model identity on every run.
- [x] Define leaderboard comparison rules so different packages or incomplete evidence are not compared as equivalent scans.

Exit criteria:

- Benchmark acceptance thresholds are documented and met.
- A score is traceable to applicable controls and preserved evidence.
- Material model/tool/catalog changes trigger recalibration instead of silently changing rankings.

Future expansion across additional independently reviewed advisories remains an ongoing recalibration trigger, not an open Phase 5 release task.

## Phase 6 — Complete review, remediation, exports, and operator workflows

Status: **Complete**

Objective: let a CE operator complete the full audit lifecycle without database or filesystem surgery.

Completed foundation:

- Durable run and job views, polling, cancellation, retry lineage, completion webhooks, and restart recovery exist.
- Review queue, assignments/actions, runtime follow-up, remediation state, and persisted settings/documents exist.
- JSON, Markdown, executive, SARIF, and related export surfaces exist.
- Local web UI and API/CLI paths exist.

Remaining tasks:

- [x] Run a clean-machine workflow: onboarding, Codex ChatGPT sign-in, repository preflight, scan, review, remediation, runtime follow-up, exports, and restart recovery.
- [x] Verify operator UI actions have loading, empty, permission, validation, retry, and failure states.
- [x] Verify SARIF against GitHub code scanning and document manual upload/remediation-link behavior.
- [x] Add export compatibility/version metadata and backward-compatibility tests.
- [x] Ensure incomplete tools/runtime/model stages are prominent in the report and executive summary.
- [x] Verify generic webhooks are signed or explicitly documented as untrusted/local-only.
- [x] Complete operator documentation and screenshots for first run, troubleshooting, backup, and upgrade.

Completion evidence: `docs/phase6-operator-workflow-evidence.md`. The deterministic browser E2E covers review, finding triage, capable-environment rerun handoff, remediation, comments, approval, persistence, and failure reporting. The manual isolated walkthrough additionally verified ChatGPT/Codex readiness, durable async launch, incomplete-validation warnings, export metadata, SARIF 2.1.0 generation, and restart recovery without launching another live-model calibration run.

Exit criteria:

- A new user can complete the documented workflow without maintainer assistance.
- Review and remediation history survives restart and is present in exports.
- No UI or export hides an incomplete/blocked validation stage.

## Phase 7 — Implement Admin/System Policies and extensive-scan controls

Status: **Complete for the policy plane; executable runtime enforcement continues in Phase 8**

Objective: replace the current read-only built-in policy view with a local, versioned Admin module that resolves and freezes the controls for every scan.

Completion evidence:

- Added the five policy persistence tables to SQLite and Postgres/Supabase manifests, with schema version `1.3.0`.
- Added four published safe templates, immutable checksummed versions, bindings, lifecycle history, deterministic preview/resolution, and immutable per-run snapshots.
- Added the complete local admin API and System -> Policy UI, including template creation, cloning, editing, grouped controls, validation, comparison, publication, default selection, archive, rollback, import/export, bindings, evidence-readiness warnings, and run-version usage.
- Renamed `premium-comprehensive` to the neutral `comprehensive-local` package.
- Extended the catalog from 28 to 39 controls with 11 explicit runtime-evaluation controls. Before Phase 8 executes their isolated probes, these controls remain `not_assessed`; they are never inferred as passing from static evidence.
- Added lifecycle, API-key authorization, backup/restore, deterministic template/matrix, non-weakening, immutable snapshot, ambiguity, and extensive-static coverage regressions.

### 7.1 Domain model

Keep these concepts distinct:

- **Control catalog:** immutable versioned definitions such as `openssf.token_permissions` or `harness_internal.agent_permission_boundaries`.
- **Audit package:** execution depth and resource envelope such as `baseline-static`, `agentic-static`, `deep-static`, or `runtime-validated`.
- **System policy:** administrator rules for who/what may run, required controls, providers, budgets, runtime isolation, evidence, review, retention, and learning.
- **Policy pack:** portable executable control/rule bundle referenced by a system policy.
- **Resolved scan policy:** immutable snapshot of catalog version + package + system policy version + bindings + target applicability written before execution.

The former `premium-comprehensive` package is now named `comprehensive-local`; the CE product no longer implies a hosted billing tier.

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
| API external standards | `owasp_api.sensitive_operation_authentication` |
| Internal auditability and evidence | `harness_internal.audit_traceability`, `harness_internal.security_logging`, `harness_internal.eval_harness_presence`, `harness_internal.architecture_evidence` |
| Internal agent/tool/data boundaries | `harness_internal.agent_tool_allowlist`, `harness_internal.agent_permission_boundaries`, `harness_internal.untrusted_content_prompt_injection`, `harness_internal.secret_env_isolation`, `harness_internal.mcp_plugin_permissions`, `harness_internal.browser_automation_safety`, `harness_internal.telemetry_log_redaction` |

The catalog now has 39 definitions, including explicit runtime controls for prompt injection, indirect injection, tool authorization/misuse, secret retrieval, data exfiltration, memory/cross-session leakage, MCP/plugin boundary abuse, unsafe output handling, excessive agency, denial/resource exhaustion, and security telemetry. They are mapped to applicable OWASP LLM/Agentic, OWASP API Security, MITRE ATLAS, NIST AI RMF, and internal runtime-evaluation references. Phase 8 must supply executable isolated evidence; static definitions alone do not constitute runtime coverage.

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
- `extensive-runtime-local-safe`: all extensive-static requirements plus executable runtime controls; it requires a launchable isolated local backend and blocks rather than falling back to host execution.

### 7.6 Tests and exit criteria

Tests:

- [x] Schema validation, checksums, immutable published versions, rollback, archive, and import/export round trips.
- [x] Resolution precedence and negative tests proving a run cannot weaken required controls or isolation.
- [x] API authorization and full UI create/edit/validate/publish/default/preview workflow.
- [x] SQLite migration, backup/restore, restart, and concurrent read/write tests.
- [x] Golden policy definitions and a deterministic resolved-policy matrix for every built-in template and target class.
- [x] Extensive-scan E2E proving every applicable control is assessed or explicitly not assessed with a reason.
- [x] Provider workload tests proving disallowed background/ChatGPT-session or budget combinations fail before model calls. Covered by Phase 2 provider-policy regressions.
- [x] Policy-level runtime tests prove per-run input cannot enable host fallback or loosen isolation/network policy. Container execution and escape tests remain Phase 8 exit work.

Exit criteria:

- Every new run has an immutable, exportable resolved-policy snapshot.
- Admin can safely create and activate a local policy without editing files or SQLite directly.
- “Extensive” has an exact, testable control/evidence definition rather than meaning “more model calls.”
- Policy changes cannot rewrite the meaning of completed scans or historical leaderboard entries.

## Phase 8 — Execute local runtime scans in a real isolated sandbox

Status: **In progress — Windows/Linux native execution complete; real-Mac gate remains**

Objective: turn the current readiness/policy scaffold into actual local isolated execution.

Tasks:

- [x] Provide backend discovery/resolution, readiness statuses, policy construction, and launch gating.
- [x] Define candidate backends including gVisor, rootless Podman, Podman, Docker, and Docker Desktop.
- [x] Implement `localRuntimeProvider.execute()` against the selected backend instead of returning a blocked placeholder.
- [x] Keep model-backed planning, supervision, and remediation for operator-started runtime validation on the `openai_codex`/`chatgpt_session` default; require an explicit operator override for API-key routing.
- [x] Make the Codex model subprocess inference-only for runtime-validation runs and prove it cannot launch target or host commands; do not treat its `read-only` flag as runtime-isolation evidence.
- [x] Implement Docker first for broad CE usability, then rootless Podman and gVisor hardening on Linux.
- [x] Never execute untrusted build/runtime commands directly on the host as a fallback.
- [x] Use exact argv with shell disabled; validate workdir and mounts against traversal/symlink escape.
- [x] Mount the target read-only and a separate artifacts/scratch directory read-write.
- [x] Enforce CPU, memory, PID, wall-time, stdout/stderr, file-size, and process-tree limits.
- [x] Default network to none and implement explicit Docker dependency-install egress through an internal network plus destination-validating proxy; invalid/unlisted/private destinations fail closed.
- [x] Add a separately governed runtime-probe allowlist phase; ordinary service probes remain network-none, while only probes explicitly marked as needing external network can use it.
- [x] Inject only named synthetic/fake credentials; no host or model-provider credential is inherited by target containers.
- [x] Add a deterministic fake service/tool backend on a separate internal-only network, inject only synthetic URLs/secrets, and preserve bounded request traces for the executable eval packs in Phase 9.
- [x] Capture image/template digest, backend/version, exact command, policy, timestamps, exit status, resource summary, artifacts, and cleanup result.
- [x] Prove cancellation kills descendants and cleanup removes containers, volumes, temp data, and credentials for the Docker execution path.
- [x] Add executable Windows Docker Desktop and Linux Docker/rootless-Podman/gVisor fixtures, plus a native macOS fail-closed boundary fixture.
- [ ] Run the executable `docker_desktop` fixture on a real Mac; do not treat the hosted macOS blocked-boundary job as runtime-execution evidence.

Exit criteria:

- `production:runtime-readiness` launches and validates fixtures inside a selected backend.
- Malicious fixtures cannot mutate the source checkout, read host secrets, use unapproved network, or leave processes/resources behind.
- Unsupported environments fail closed with an actionable static fallback.
- Release evidence includes a real runtime-validation audit using both the selected isolated backend and the local Codex ChatGPT-session default; API-only model evidence cannot close this gate.

Docker milestone evidence (2026-08-21):

- `run_node-smoke_65ca1de0-6b93-4bc4-a46f-be7825daf9df` completed the `comprehensive-local` audit through Docker Desktop and `openai_codex`/`chatgpt_session`.
- The digest-pinned Node image completed the fixture test and service-start steps as non-root container execution; the dependency-install step failed closed because default policy denied outbound network.
- A direct isolation probe proved outbound HTTP was blocked, source content remained unchanged, the process UID was `65532`, and cleanup left zero containers and volumes.
- A cancellation probe terminated a spawned descendant tree and settled in under one second with zero leftover containers or volumes.
- An inference-only Codex probe attempted to induce a host file write; the file was not created. Shell, code-mode host, apps, browser, computer-use, multi-agent, hooks, and plugins were disabled, the working directory was ephemeral, and API-key environment variables were not inherited.
- On 2026-08-22, the Docker readiness fixture additionally proved host-secret exclusion, exact synthetic-credential injection, kernel-enforced per-file limits, source immutability, blocked outbound networking, and verified cleanup. A direct provider run persisted Docker state/stats plus measured workspace/artifact usage and completed with zero leftovers.
- A live Docker dependency-install probe reached allowlisted `registry.npmjs.org` through the internal-network proxy. A second probe to unlisted `example.com` received the proxy's `403 Forbidden`; both attempts removed the target, proxy, network, and workspace volume.
- A live aggregate-quota fixture filled the 1 MiB tmpfs-backed workspace with individually sub-limit files, received `ENOSPC`, recorded the exact 1 MiB usage, and cleaned up successfully. A persistent constrained keeper container holds the tmpfs mount across isolated staging and execution containers; source staging copies only regular files and directories, skipping symlinks and special files.
- The same live fixture filled a separate 1 MiB artifact-scratch tmpfs and received `ENOSPC`. A successful probe wrote an artifact inside that volume; a controlled collector copied only regular directories/files to the host run directory before both volumes were removed.
- A live runtime-probe egress check reached allowlisted `registry.npmjs.org` only after both `runtime_probe_network` authorization and explicit `external_network` step metadata were present. It reused the internal proxy policy and cleaned up all resources.
- A live synthetic-tool probe used an internal-only network with no egress proxy, retrieved the fixed fake secret, invoked the deterministic fake tool, and exported redacted method/path/body-hash traces plus the client result through the capped artifact collector.

Native platform evidence (2026-08-24):

- Windows 11 x64 with Docker Desktop `4.66.0` and Docker Engine `29.3.0` passed the executable `docker_desktop` gate locally.
- [GitHub Actions run `32688251184`](https://github.com/jjdomain/tethermark/actions/runs/32688251184) passed executable Linux x64 gates for Docker Engine `28.0.4`, rootless Podman `5.8.4`, and Docker-registered gVisor `runsc` on Ubuntu 24.04.4.
- The same run passed the macOS 15 arm64 blocked-boundary gate. It proves native build and fail-closed backend resolution, not Docker Desktop execution; a real-Mac pass remains required.

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

1. Implement Phase 7 System Policies and extensive-scan controls.
2. Finish Phase 8 quotas, bounded egress, malicious isolation fixtures, and supported-platform backend verification; only then begin Phase 9 executable runtime eval packs.
3. Complete Phase 10 stress/recovery hardening and Phase 11 packaging/cross-platform security.
4. Execute Phase 12 release candidate and beta gates.

## Immediate next-task checklist

```powershell
cd <path-to-ai-security-audit-engine>
git status --short --branch
git log -5 --oneline --decorate
git diff origin/main...HEAD
git diff -- PLANS.md changelog.md docs/community-edition-production-plan-phases-1-12.md docs/provider-workload-policy.md docs/provider-policy-decision-log.md
```

Phases 1 through 6 are complete. Before the Phase 7 handoff, rerun the deterministic release gate on the completed tracker tree:

```powershell
npm run release:check
```

Then follow the Phase 7 System Policy domain-model, persistence, resolver, API/UI, migration, and test tasks above. The live commands in `docs/live-model-validation.md` remain the Phase 3 release-candidate refresh procedure; they are not part of ordinary pull-request CI.
