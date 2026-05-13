# Static Repo Smoke Tests

Use these before broader public-repo benchmarking. They verify that Tethermark can clone/stage a public repository, classify an AI-agent target, run static evidence providers, persist/export artifacts, and avoid runtime execution.

## Pi Agentic Static

Pi is the preferred quick public-repo smoke test. It is a real public AI-agent monorepo, but it is much smaller than OpenClaw and gives faster feedback on clone, detection, static tooling, persistence, and report output.

Command:

```powershell
npm run scan -- scan repo https://github.com/earendil-works/pi.git --mode static --package agentic-static --llm-provider mock --output .\.artifacts\smoke\pi-agentic-static
```

Expected behavior:

- Remote clone/stage succeeds into `.artifacts\sandboxes\<run-id>\target`.
- Target classification is `mcp_server_plugin_skill_package` or another agentic class with high confidence.
- Agentic detection includes manifest/import/content signals for AI SDKs, MCP/plugin surfaces, shell/file/network tools, and agent-specific controls.
- Static-only evidence runs. No runtime server, browser session, container runtime, or endpoint execution is attempted.
- Semgrep and Trivy execute when installed and enabled.
- OpenSSF Scorecard executes against the staged sandbox with `scorecard --local`; if the local binary is unavailable or blocked, the run must report Scorecard as skipped/failed evidence instead of treating it as clean.
- The CLI and report output list completed tools, skipped tools, fallbacks, controls not assessed, and confidence limits.
- Artifacts are copied to `.artifacts\smoke\pi-agentic-static`.

Last verified local run:

- Run ID: `run_pi-git_386286df-896b-43a9-9190-58126fefcaa9`
- Commit: `3d9e14d7482f4a99d5224926099bec0d17ff86fd`
- Result: succeeded, static score `61/100`
- Sandbox: 856 files, 20,130,863 bytes
- Tool coverage: Scorecard completed with 11 parsed checks, Trivy completed, Semgrep completed
- Control coverage: 21 of 23 applicable controls assessed; `openssf.branch_protection` and `slsa.provenance` not assessed in static mode

## OpenClaw Agentic Static

OpenClaw is a benchmark anchor, but it is too large for the default smoke path on this Windows workstation. Use it after Pi when you want a broader MCP/plugin ecosystem sample.

Command:

```powershell
npm run scan -- scan repo https://github.com/openclaw/openclaw.git --mode static --package agentic-static --llm-provider mock --output .\.artifacts\smoke\openclaw-agentic-static
```

Expected behavior:

- Remote clone/stage succeeds into `.artifacts\sandboxes\<run-id>\target`.
- Target classification is `mcp_server_plugin_skill_package`.
- Agentic detection includes manifest/import/content signals for AI SDKs, MCP, browser automation, shell/file/network tools, and extension surfaces.
- Static-only evidence runs. No runtime server, browser session, container runtime, or endpoint execution is attempted.
- Semgrep and Trivy execute when installed and enabled.
- OpenSSF Scorecard executes against the staged sandbox with `scorecard --local`; if the local binary is unavailable or blocked, the run must report Scorecard as skipped/failed evidence instead of treating it as clean.
- The CLI and report output list completed tools, skipped tools, fallbacks, controls not assessed, and confidence limits.
- Artifacts are copied to `.artifacts\smoke\openclaw-agentic-static`.

Last verified local run:

- Run ID: `run_openclaw-git_8fe4bd8e-32bf-4ace-97d5-287bbdf44348`
- Commit: `7a7b2316e17e8f004def0de46ee7abc1b18c28fd`
- Result: succeeded, static score `71/100`
- Sandbox: 17,435 files, 217,453,103 bytes
- Tool coverage: Scorecard skipped due timeout, Trivy completed, Semgrep completed
- Control coverage: 21 of 23 applicable controls assessed; `openssf.branch_protection` and `slsa.provenance` not assessed in static mode

## Choosing A Smoke Target

Use Pi for a fast public smoke test and OpenClaw for a heavier benchmark anchor. On the latest verified local Pi run, Scorecard completed in local sandbox mode along with Trivy and Semgrep. The last verified OpenClaw run predates the local Scorecard fix and should be rerun before using it as the benchmark baseline.
