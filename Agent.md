# Agent.md

## Project Overview

This repository contains Tethermark.

The authoritative implementation is now split across:
- TypeScript / Node core engine for planner/orchestrator, job queue, API, CLI, MCP bridge, artifact/trace contracts, and the model-backed orchestration path
- Python workers for heavy evaluation adapters such as garak, Inspect, and PyRIT

## Architecture Direction

### TypeScript / Node core
- planner and orchestrator
- run and artifact contracts
- in-memory job queue scaffold
- CLI
- HTTP API
- MCP-compatible tool bridge
- artifact and trace persistence
- sandbox-manager abstraction with platform-specific backends
- LLM provider abstraction
- agent runtime
- prompt registry
- trace and handoff recording
- standards-based static audit methodology, control catalog, score rollups, and a cleaner active artifact layout under .artifacts/runs and .artifacts/sandboxes
- actual static tool execution for scorecard, trivy, and semgrep when available

### Python workers
- adapter execution boundary for garak, Inspect, and PyRIT
- future home for heavier analysis and eval logic that is more natural in Python

## Guardrails

- planner-agent, threat-model-agent, skeptic-agent, and remediation-agent must remain model-backed in the main execution path
- deterministic extraction, tool execution, and control assessment are allowed, but planning, threat-model drafting, skeptic review, and remediation summarization must not be replaced with plain deterministic modules
- sandboxing should wrap clone, install, build, and runtime phases before production use
- static mode remains the only supported executed mode on Windows local
- Windows local uses a dedicated per-run static workspace backend
- Linux static uses a separate workspace backend
- Linux non-static modes now route to a container-backend scaffold with explicit command policy and workspace-mount contracts
- Python workers should be treated as bounded adapters behind explicit contracts, not arbitrary subprocesses
- public scoring should be standards-based; custom presentation layers must derive from control results rather than replace them
- static audit output should remain suitable for AISecurityBase leaderboard ingestion, which means findings, controls, and framework scores must be meaningful, auditable, and stable enough for repeated OSS comparisons

## Change Management

Record significant contract, runtime, and architecture changes in `changelog.md`.

Keep `PLANS.md` current whenever major remaining work changes.

Update `PLANS.md` when any of the following happen:
- a major phase is completed or replaced
- a new backend, worker path, provider path, or deployment path is added
- the recommended next implementation order changes
- previously deferred work becomes active scope
- a meaningful blocker or prerequisite is discovered

`PLANS.md` should reflect:
- current completed state
- remaining tasks by phase
- recommended next order
- explicitly deferred work
