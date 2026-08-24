# PLANS.md

> The canonical Community Edition production tracker is now
> [`docs/community-edition-production-plan-phases-1-12.md`](docs/community-edition-production-plan-phases-1-12.md).
> It reconciles current implementation status into 12 release phases and makes
> local Admin/System Policies an active CE workstream. This older plan remains
> useful for detailed historical architecture notes, but status and execution
> order should be taken from the canonical tracker.

## Goal

Track the remaining work needed to turn the current TypeScript/Node core plus Python worker scaffold into a practical AI security audit engine for local static audits and isolated deeper AI-security runtime validation.

## Current State

Completed:
- TypeScript / Node core engine rewrite
- CLI, API, and MCP bridge entrypoints
- core run, artifact, trace, sandbox, agent-invocation, and handoff contracts
- LLM provider abstraction with OpenAI API, local Codex ChatGPT sign-in, and mock support
- fail-closed provider workload classes, model allowlists, per-run budgets, pacing, retries, concurrency limits, circuit breaking, and non-secret invocation audit fields
- agent runtime and prompt registry
- separate deterministic CI and explicit bounded live-model integration/E2E release harnesses with redacted evidence
- local Codex ChatGPT-session authentication as the primary live and operator-started runtime-validation model path; API-key validation is explicitly secondary
- model-backed planner-agent, threat-model-agent, eval-selection-agent, skeptic-agent, and remediation-agent in the main run flow
- standards-based audit methodology artifact and control catalog
- planner-driven framework and control selection for static runs
- actual static tool execution stage for selected tools with skip/fail reporting
- checksum-locked, user-isolated Scorecard, Semgrep, and Trivy setup with focused production readiness diagnostics
- bundled offline Semgrep rules, bounded scanner execution, and fail-closed publishability when required evidence is incomplete
- retained real-scanner evidence on Windows, Ubuntu, and macOS
- persisted tool execution artifacts, control results, observations, framework scores, and remediation outputs
- static clone provenance capture with commit SHA recording for repo targets
- static sandbox storage reporting for per-run target size and file count
- cleaner active artifact layout using `.artifacts/runs` for run artifacts and `.artifacts/sandboxes` for cloned or mirrored targets
- Windows local static sandbox backend
- Linux static sandbox backend
- Linux container-backend scaffold
- executable local runtime provider verified on Windows Docker Desktop and native Linux Docker, rootless Podman, and gVisor; real-Mac execution is explicitly deferred and not certified
- hash-locked managed Python worker environment with setup/doctor commands and cross-platform CI coverage; adapter implementations remain scaffold-only
- local static `scan path ... --mode static` verified on Windows with provider-backed agents and standards-based score artifacts
- versioned deterministic regression suite for good, mixed, risky, ordinary, runnable, agentic, and MCP targets
- four external-ground-truth vulnerable/fixed calibration pairs from reviewed `CVE-2025-53107`, `CVE-2026-27735`, `CVE-2024-51751`, and `CVE-2025-3248`, with strict known-finding FP/FN gates for command injection, MCP repository-boundary traversal, AI application file-payload path validation, and unauthenticated code validation
- per-run methodology/prompt/catalog/policy/package/tool/model version manifests, citation requirements, calibration metrics, and fail-closed benchmark comparison rules
- first bounded ChatGPT-subscription Sol/Terra variance pilot on reviewed Gradio ground truth; both models passed after deterministic scope-floor hardening, with scores 56/57 but finding counts 2/7
- matching fixed-Gradio Sol/Terra runs both avoided the reviewed finding, but failed the cross-model stability gate: scores diverged 27/68, Sol left two expected controls unassessed, and Terra failed a static-runtime-overclaim integrity check
- redacted finding-level benchmark summaries plus a second fixed-Gradio pair; the repeat aligned Sol/Terra at 68/68 but exposed historical same-model instability (Sol 27/68 and Terra findings 6/2), prompting control-level traceability and deterministic evidence-plan work
- redacted control-status and dimension-contribution summaries plus a third fixed-Gradio Sol run at 68; the score is now fully traceable, and a negated-runtime-claim false positive was fixed, but evidence-provider selection still varied between repeats
- versioned fixed static calibration evidence planning across repository analysis, Scorecard, Semgrep, and Trivy, enforced through supervisor correction and retained in reports; controlled Sol repeats passed at 68/68 with one finding each and zero score/finding-count spread
- deterministic final-finding reconciliation that replaces stale selectively rerun lane findings, rebuilds control finding references, and requires deterministic integrity approval before a model can delete heuristic findings; a reviewable fixed-plan Terra run passed at 68 with six partially supported findings and zero integrity blockers
- deterministic control-result reconciliation that keeps model-requested downgrades advisory until independently approved; guarded vulnerable-Gradio Sol/Terra calibration passed formal variance at 56/57 with identical seven-finding sets and zero advisory-scoped false negatives or false positives
- lane-owned selective correction that rejects globally recomputed off-lane findings and controls; guarded Langflow vulnerable/fixed Sol/Terra and Sol-repeat gates passed at 65/65/65 and 71/71/71 with zero score or finding-count spread and zero advisory-scoped false negatives or false positives
- fresh strict eight-case external-ground-truth refresh under control catalog v4, followed by guarded Git MCP vulnerable/fixed Sol/Terra plus Sol-repeat gates at 55/55/55 and 70/70/70, and official MCP Git vulnerable/fixed Sol/Terra plus Sol-repeat gates at 65/65/65 and 73/73/73; every score/finding-count spread is zero with zero advisory-scoped false negatives or false positives
- consolidated eight-snapshot controlled variance matrix: all cross-model and same-model score gates pass with maximum spread 1, and every repeat finding-count spread is zero; the vulnerable-Gradio v4 repeat passed at 57/56 with seven findings each, while a v3/v4 comparison was correctly rejected as non-equivalent; thresholds and weights remain unchanged pending broader reviewed advisories and independent review of unrelated findings
- AI-assisted source review packet for the five Terra-only fixed-Gradio findings, with recommended manual false-positive labels, pinned-source evidence, a separate audio-debugger command-execution triage note, and an explicit independent-human signature block
- reviewed-finding safeguards that require assessed-control support, path-local agent execution evidence, and prompt dataflow; consolidate duplicate framework claims; preserve non-agent shell sinks for appsec triage; and exclude fixture expectation metadata from audit evidence. Fresh fixed-Gradio Sol/Terra/Sol-repeat runs converged at 87 with one finding, and both formal variance gates passed with zero score and finding-count spread
- project-owner approval to use the fixed-Gradio AI-adjudicated labels and move forward without representing them as independent human ground truth
- static finding integrity distinguishes scanner advisory impact metadata from claims of executed or reproduced runtime behavior; explicit runtime assertions still fail closed

Not completed:
- broader independently reviewed advisory coverage beyond the current four advisories and vulnerability classes, followed by multi-case/repeat model variance and weight/threshold calibration
- cleanup or archival policy for old historical artifact directories already present under `.artifacts`
- real Garak, Inspect, and PyRIT adapter execution and normalized behavioral evidence
- richer control coverage and framework depth beyond the first static control set

## Phase 1: Local Static Mode Hardening

1. Verify a live OpenAI-backed static repo run against a representative OSS repository.
2. Install and verify Scorecard, Semgrep, and Trivy locally so the static tool stage completes instead of skipping/failing.
3. Add stronger static-mode guardrails so target execution cannot happen accidentally even if future code changes regress.
4. Add deeper path traversal and symlink escape checks in sandbox copy/clone flows.
5. Add artifact redaction and safe log handling for static findings.
6. Improve repo analyzer heuristics to reduce false positives from source strings and docs.
7. Add tests for Windows static sandbox behavior.
8. Add cleanup and retention controls for accumulated local sandboxes and run artifacts.
9. Add a simple archive or prune command for old historical artifact directories.
10. Tune control weights and framework scoring against repeated OSS audits.

## Phase 2: Isolated Runtime Backend Execution

1. Implement real container launch in `linux-container` backend.
2. Support Docker first; Podman optional second; keep the design compatible with a future microVM provider.
3. Mount target read-only where possible and artifact directory read-write.
4. Apply per-run CPU, memory, PID, and timeout limits.
5. Enforce container network mode based on run mode, defaulting runtime validation to isolated or explicitly allowlisted egress.
6. Enforce command allowlist from `command_policy`.
7. Add synthetic credential injection and fake-service/tool backend support for AI-agent runtime tests.
8. Add command execution logging, transcript capture, tool-call traces, and artifact capture.
9. Add cleanup policy for finished sandboxes and orphaned runs.
10. Add Linux backend tests and a smoke-run harness.

## Hosted-Only: Metered Runtime Sandbox Rollout

This work is implemented in the separate Tethermark Cloud repository; it is tracked here to keep the Community Edition/Cloud contract and release order aligned.

1. Replace configuration-only provider readiness with live probes and a normalized capability contract covering create, target upload, exact command execution, network-policy enforcement, bounded output, artifact collection, status, usage, cancel, terminate, and cleanup verification.
2. Fail launch when the selected provider cannot enforce any required isolation, network, duration, memory, process, output, or artifact policy.
3. Complete `hosted_e2b` as the first native provider path and use E2B Hobby/usage billing for the pinned AISecurityBase AgentDojo runtime benchmark and the pre-revenue private beta.
4. Verify in the E2B account or with E2B support whether Hobby permits a 2 vCPU/4 GiB custom template. If it does not, keep a smaller eligibility profile and route heavy targets only after a second provider is release-gated.
5. Build and version a Tethermark runtime template, record its digest on every execution, and validate network phase changes, artifact export, timeout, cancellation, and cleanup against malicious fixtures.
6. Enforce pre-revenue controls: 10-minute default, 30-minute metered ceiling, provider hard cutoff below one hour, three global concurrent runs, one active run per workspace, three launches per project per day, and an initial USD 25 monthly provider budget.
7. Add termination in every terminal path plus an orphan-sandbox reconciler; expose provider usage, remaining budget, external IDs, and cleanup state in hosted observability.
8. Run the private beta only for eligible small/medium Linux repositories. Return an explicit inconclusive/unsupported runtime outcome with static fallback for resource exhaustion, Docker-in-Docker, GPU, Windows, oversized targets, or provider limits.
9. Add `hosted_daytona` Linux VM as the first standby/overflow provider only after it passes the same fixtures and policy checks. Automatic failover is allowed before target execution; failures after execution begins restart as a new linked attempt.
10. Defer `hosted_modal` to demonstrated burst/GPU demand and exclude Perplexity Sandbox from general runtime execution until it exposes exact-command and policy-controlled lifecycle APIs.
11. Upgrade from zero-base-price usage billing only when paying demand, measured resource pressure, required concurrency/session length, or a customer-facing uptime commitment justifies the fixed subscription.

## Phase 3: Python Worker Enablement

1. Fix local Python environment assumptions and document supported installs.
2. Add worker environment bootstrap commands for Linux hosts.
3. Replace garak adapter scaffold with real invocation and normalized output.
4. Replace Inspect adapter scaffold with real multi-turn eval orchestration.
5. Replace PyRIT adapter scaffold with real adversarial evaluation flow.
6. Add AI-security eval packs for prompt injection, tool misuse, MCP boundary failures, memory leakage, cross-session isolation, unsafe delegated actions, and retrieval/data exfiltration.
7. Map runtime eval results to OWASP LLM, MITRE ATLAS, NIST AI RMF, and Tethermark executable control IDs.
8. Add worker result schema normalization into Node artifacts and findings.
9. Add worker timeout, retry, and failure handling.
10. Add tests for worker dispatch and result parsing.

## Phase 4: Audit Quality and Core Logic

1. Expand the standards control catalog and improve exact control mappings.
2. Add validator-agent as a model-supervised component for validation-path selection.
3. Add public-safety filtering metadata back into the TS core path.
4. Add JSON, Markdown, and SARIF export parity in the TS implementation.
5. Add AISecurityBase ingest export parity in the TS implementation.
6. Add canonical finding deduplication and score calibration.
7. Make skeptic/grader outputs affect control status and score more directly.
8. Add richer remediation-agent outputs tied to failed or partial controls.
9. Add repository leaderboard export fields designed for time-series score comparison across repeated audits.

## Phase 5: Queue, Persistence, and Services

1. Replace in-memory queue with persistent job storage.
2. Decide on Postgres, Redis, or Postgres-plus-queue design.
3. Add run status persistence and restart-safe recovery.
4. Add artifact storage abstraction for local disk vs S3-compatible backends.
5. Add API authentication and authorization.
6. Add per-user or per-workspace quotas and concurrency limits.
7. Add service configuration management for local vs Hetzner environments.
8. Add health checks and readiness checks for API and workers.

## Phase 6: Isolated Worker Deployment

1. Provision Hetzner Linux VPS or another worker host for isolated non-static audits.
2. Install Node.js, Python, git, Docker, and scanner binaries.
3. Set up Python worker environment and dependency installation.
4. Configure persistent data directories for artifacts, queue state, and logs.
5. Configure reverse proxy and TLS if API is externally reachable.
6. Configure firewall rules and private-only service exposure where possible.
7. Add systemd units or container compose deployment for API and workers.
8. Add backup/retention policy for artifacts and traces.
9. Add monitoring for CPU, memory, disk, queue depth, and failed runs.

## Phase 7: Security Hardening

1. Prevent host secret leakage into workers and containers.
2. Add explicit denylist for dangerous commands and shell constructs.
3. Add network egress restrictions for runtime/validate modes.
4. Add per-run synthetic credentials and fake external service fixtures for runtime validation.
5. Add artifact redaction before publication/export.
6. Add disclosure-sensitive finding handling rules.
7. Add audit logs for who triggered runs and what modes were used.
8. Add secure cleanup for sandboxes and temporary files.

## Phase 8: UX and Developer Experience

1. Add clearer CLI output and machine-readable summaries.
2. Add API docs for run modes, artifacts, traces, sandbox behavior, provider configuration, and standards methodology.
3. Add MCP tool descriptions and response shaping.
4. Add example configs for local Windows and Hetzner Linux.
5. Add troubleshooting docs for Python, Docker, scanner installation, and OpenAI credentials.
6. Add sample end-to-end audit runs for representative OSS repos.

## Hosted-Only: Policy Pack Management

This is a hosted-platform governance feature, not an OSS launch-surface requirement.

OSS scope:
- keep policy-pack selection in the run modal `Launch Profile`
- keep built-in packs plus scope defaults from settings
- allow the launch-profile dropdown to consume packs exposed by the engine API
- do not add a full policy-pack CRUD/admin page to the OSS navigation

Hosted scope:
- add a dedicated `Policy Packs` page in the main navigation
- support create, edit, archive, duplicate, and version actions for policy packs
- support org, workspace, and project visibility plus inheritance/default assignment
- support usage visibility showing which runs, projects, or defaults reference a pack
- support change history and actor attribution for governance review

Hosted policy-pack data model:
- policy pack id
- display name
- description
- status: draft, active, archived
- scope owner: org, workspace, or project
- version identifier and supersedes link
- rules payload for publishability, review gating, runtime allowances, and control overrides
- metadata for created_by, updated_by, approved_by, created_at, updated_at

Hosted UI behavior:
- `Governance` is a peer settings page with tabs for `Gates`, `Policy Packs`, and `Reference Documents` so launch/readiness rules, executable policy packs, and audit context are adjacent but not collapsed into one form
- `Gates` tab shows inherited/effective launch-readiness policy, human-review thresholds, publishability defaults, visibility defaults, disposition renewal, lock state, and change history
- `Policy Packs` list page shows status, scope, current default bindings, and last modified time
- detail page shows metadata, rule summary, version history, and usage references
- editor flow validates policy-pack structure before activation
- `Reference Documents` tab shows approved policy, standard, runbook, and exception references with source, version/hash, scope, and last review metadata
- launch-profile `Policy pack` dropdown reads from the same managed catalog and only allows packs visible to the current scope
- audit readiness compares selected policy pack against any recommended policy pack and highlights drift

Hosted API/persistence expectations:
- add persistence-backed policy-pack records instead of relying only on built-in/static definitions
- add governance-gate records with scope inheritance and explicit source attribution
- add reference-document metadata/version records separate from run-level document snapshots
- expose list/get/create/update/archive endpoints for hosted deployments
- expose scope-filtered query endpoints used by the launch modal dropdown
- persist default bindings separately from pack definitions so defaults can change without mutating pack content
- keep per-run launch intent storing the resolved policy-pack id/version used at launch time
- keep per-run launch intent storing resolved gate values and reference-document ids/versions/hashes used at launch time

Hosted rollout order:
1. Define the policy-pack persistence schema and versioning model.
2. Add hosted API endpoints plus scope-filtered list/read queries.
3. Add hosted settings support for governance gates and default policy-pack bindings by org, workspace, and project.
4. Add the hosted `Governance` settings page with `Gates`, `Policy Packs`, and `Reference Documents` tabs.
5. Update launch-profile and audit-readiness UI to consume managed policy-pack metadata, gate provenance, and document version labels.
6. Add audit-log and usage views so operators can understand where a gate, pack, or reference is active before changing defaults.

## Recommended Next Order

Community Edition Phases 1–8 are complete within the documented platform scope. Phase 9 runtime eval operationalization is next.

1. Replace the Inspect scaffold with one bounded, version-pinned executable adapter and normalized result contract.
2. Add the first versioned runtime eval pack and failure/partial-result tests.
3. Operationalize Garak and PyRIT behind the same resource, timeout, output, cancellation, and evidence boundaries.
4. Continue Phase 10 recovery hardening and Phase 11 packaging after the first end-to-end runtime eval is retained.

## Deferred Hosted Worker Deployment

- worker host deployment automation
- hosted fleet scheduling and remote worker provisioning
