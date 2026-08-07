# Static Audit Production Readiness

This checklist is the release gate for the static audit run path. It covers the deterministic local checks, the public Pi Agent E2E path, browser workflow coverage, tool readiness, and OpenAI Codex OAuth behavior on both new and already-authenticated machines.

## Release Gate Commands

Run this before tagging a release candidate:

```bash
npm run production:static-release
```

That command covers:

- TypeScript build
- core regression tests
- export schema and golden snapshot checks
- deterministic OpenAI Codex OAuth smoke with an isolated first-run `CODEX_HOME`
- Pi Agent static API E2E at commit `3d9e14d7482f4a99d5224926099bec0d17ff86fd`
- Pi Agent browser/UI E2E with review, triage, disposition, remediation, and approval workflow coverage

The automated release gate is necessary but not sufficient for final Community Edition static-audit release approval. Before promoting a production release, run the manual Pi Agent validation plan in [Manual Pi Static Audit Test Plan](./manual-pi-static-audit-test-plan.md). The manual plan checks agent judgment quality, evidence grounding, control mapping, remediation closure, follow-up behavior, exports, and assistant answers.

Finding integrity and supervisor QA are documented in [Finding Integrity And Supervisor QA Workflow](./finding-qa-validator.md). That document explains the pre-supervisor evidence packet, supervisor authority, deterministic policy enforcement, post-supervisor integrity gate, duplicate/conflict handling, and benchmark regression role.

The product benchmark suite is documented in [Tethermark Product Benchmark Suite](./product-benchmark-suite.md). It is not required for normal user repo audits; it is a maintainer/release validation suite for pinned public AI-agent and LLM-app targets.

Run this separately on a workstation that has completed Codex ChatGPT sign-in:

```bash
npm run smoke:openai-codex-oauth:real
```

The real OAuth smoke intentionally verifies only local auth readiness. It does not run a live model call, so release validation does not consume subscription quota.

## New-Machine Validation

The deterministic OAuth smoke must pass on a clean machine or clean CI runner:

```bash
npm run smoke:openai-codex-oauth
```

The smoke creates an empty temporary `CODEX_HOME` and requires `/llm-providers/openai_codex/status` to return a clean `not_connected` response. This proves a new user sees an actionable disconnected state instead of a timeout, token leak, or accidental reuse of the maintainer's local auth.

After the user signs in with Codex CLI or the web UI connection action, rerun:

```bash
npm run smoke:openai-codex-oauth:real
```

Expected result: the status endpoint reports `authenticated: true`, `executable_ready: true`, and `ready: true` without returning token material or raw CLI output. `authenticated: true` with `ready: false` means the cached ChatGPT session exists but the API server cannot complete the configured CLI's bounded `login status` check.

## Static Tool Readiness

Production environments require the local static scanner trio:

- OpenSSF Scorecard must run locally with `scorecard --local`.
- Semgrep must run locally. Tethermark uses a bundled local ruleset by default.
- Trivy must run locally.

Tool absence, blocked execution, TLS failure, or timeout must be represented as skipped/warning/failure evidence. It must not be reported as a clean pass.

Set `HARNESS_SEMGREP_CONFIG` only when the deployment intentionally uses a custom organization ruleset. Prefer a local file or directory for release checks. Remote Semgrep configs are allowed for operator-managed environments, but TLS or network failures against `semgrep.dev` are not acceptable for final production readiness.

## Pull Request And Manual Release Workflow

The GitHub workflow `Static Audit Release Gate` runs deterministic release checks on every pull request and can also be started manually:

- Deterministic checks always run with the mock provider, live keys absent, local binaries disabled, and the learning scheduler disabled.
- Pi public-repo API E2E is available only on a manual run with `run_network_e2e=true`.
- Browser UI E2E is available only on a manual run with `run_ui_e2e=true`.

Keep the network-heavy jobs manual because they clone public repositories and can take longer than default CI.

## Browser Workflow Coverage

The UI E2E must cover:

- create a Pi static audit run
- open persisted findings
- open the assistant drawer and verify scoped conversation history
- assign reviewer
- start review
- perform severity triage
- request capable-environment follow-up when validation is useful
- create and update finding disposition
- open a local remediation item for a finding
- record manual external issue or PR links without sending to GitHub from Community Edition
- advance remediation to fix-in-progress and resolved-with-evidence, verifying that review status updates automatically
- add review comment
- inspect remediation memo
- approve the run
- confirm the web UI theme supports both dark and light mode without unreadable audit panels

Failures should identify the broken workflow stage and include the API response payload or browser state needed for diagnosis.

## Release Evidence

Record the following before promotion:

- `npm run production:static-release` result
- manual Pi static audit test record and final verdict
- `npm run smoke:openai-codex-oauth:real` result from a signed-in workstation
- Pi API E2E run ID
- Pi UI E2E run ID
- static tool readiness summary
- export schema/snapshot status
- assistant route/capability status with default-on Community Edition assistant behavior
- remediation item lifecycle status, including automatic review action updates
- theme smoke result for dark and light mode
- any explicit skipped tool state and its reason

Do not promote a release if static mode attempts install, build, runtime server, container, or browser execution during the static audit run.
