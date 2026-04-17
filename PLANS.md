# PLANS.md

## Goal

Track the remaining work needed to turn the current TypeScript/Node core plus Python worker scaffold into a practical AI security audit engine for local static audits and Hetzner-hosted deeper audits.

## Current State

Completed:
- TypeScript / Node core engine rewrite
- CLI, API, and MCP bridge entrypoints
- core run, artifact, trace, sandbox, agent-invocation, and handoff contracts
- LLM provider abstraction with OpenAI and mock support
- agent runtime and prompt registry
- model-backed planner-agent, threat-model-agent, eval-selection-agent, skeptic-agent, and remediation-agent in the main run flow
- standards-based audit methodology artifact and control catalog
- planner-driven framework and control selection for static runs
- actual static tool execution stage for selected tools with skip/fail reporting
- persisted tool execution artifacts, control results, observations, framework scores, and remediation outputs
- static clone provenance capture with commit SHA recording for repo targets
- static sandbox storage reporting for per-run target size and file count
- cleaner active artifact layout using `.artifacts/runs` for run artifacts and `.artifacts/sandboxes` for cloned or mirrored targets
- Windows local static sandbox backend
- Linux static sandbox backend
- Linux container-backend scaffold
- local static `scan path ... --mode static` verified on Windows with provider-backed agents and standards-based score artifacts

Not completed:
- live repo-URL verification on this machine against a real OSS target
- reliable local execution of Scorecard, Trivy, and Semgrep on this machine
- cleanup or archival policy for old historical artifact directories already present under `.artifacts`
- real Python worker execution on this machine
- real Linux container execution for build/runtime/validate
- persistent queue/storage
- hardened policy enforcement
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

## Phase 2: Linux Container Backend Execution

1. Implement real container launch in `linux-container` backend.
2. Support Docker first; Podman optional second.
3. Mount target read-only and artifact directory read-write.
4. Apply per-run CPU, memory, PID, and timeout limits.
5. Enforce container network mode based on run mode.
6. Enforce command allowlist from `command_policy`.
7. Add command execution logging and trace capture.
8. Add cleanup policy for finished sandboxes and orphaned runs.
9. Add Linux backend tests and a smoke-run harness.

## Phase 3: Python Worker Enablement

1. Fix local Python environment assumptions and document supported installs.
2. Add worker environment bootstrap commands for Linux hosts.
3. Replace garak adapter scaffold with real invocation and normalized output.
4. Replace Inspect adapter scaffold with real multi-turn eval orchestration.
5. Replace PyRIT adapter scaffold with real adversarial evaluation flow.
6. Add worker result schema normalization into Node artifacts and findings.
7. Add worker timeout, retry, and failure handling.
8. Add tests for worker dispatch and result parsing.

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

## Phase 6: Hetzner Deployment

1. Provision Hetzner Linux VPS for non-static audits.
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
4. Add per-run ephemeral credentials if future hosted endpoint testing needs auth.
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

## Recommended Next Order

1. Install or verify local Scorecard, Trivy, and Semgrep binaries.
2. Run a real static OSS audit against OpenClaw.
3. Calibrate control weights and framework scoring against repeated OSS audits.
4. Add simple cleanup/archive tooling for historical artifact directories.
5. Implement executable Linux container backend.
6. Enable real Python workers on Linux.
7. Deploy first Hetzner instance for deeper audit modes.
8. Add persistent queue and artifact storage.

## Deferred Until Hetzner Is Ready

- real container execution in `linux-container`
- build/runtime/validate mode execution on Linux
- real garak / Inspect / PyRIT worker integration
- VPS deployment automation
