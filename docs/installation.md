# Tethermark Installation

Tethermark should be installed with a guided workflow first, then verified with `doctor`.

## One-Line Install

macOS and Linux:

```bash
curl -fsSL https://tethermark.dev/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://tethermark.dev/install.ps1 | iex
```

Until the public install host is live, run the repo-local scripts directly:

```bash
bash scripts/install.sh --dry-run
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -DryRun
```

The installer clones or updates Tethermark, runs `npm install`, then launches onboarding. Onboarding creates/checks `.env`, runs `doctor`, explains external tool readiness, points to the safe tool setup plan, and prints the next smoke-test/UI commands.

## Guided Onboarding

From a checked-out repo:

```bash
npm install
npm run scan -- onboard
```

Onboarding will tell you whether to run:

```bash
npm run scan -- setup-tools --dry-run
npm run scan -- setup-tools --yes
npm run scan -- setup-runtime --dry-run
npm run scan -- setup-runtime --yes
npm run scan -- doctor
npm run scan -- runtime-doctor
npm run scan -- validate-runtime-fixtures
npm run scan -- validate-fixtures --llm-provider mock
npm run oss
```

The web UI opens at `http://127.0.0.1:8788`.

The Community Edition assistant is enabled by default and runs locally against persisted Tethermark audit data. It supports selected run and target-history Q&A, deterministic evidence-grounded fallback answers, draft outputs, and confirmed local actions. If no usable assistant/global LLM is configured, the assistant drawer remains available and shows fallback/limitations rather than requiring a separate enable flag. Tethermark Cloud project/workspace/org scopes and external connector sends are not enabled in Community Edition. Community Edition does not create GitHub issues or receive GitHub webhooks; paste manual external issue or PR links into local remediation items when needed. To surface findings in GitHub code scanning from Community Edition, export SARIF and upload it with GitHub Actions; see [GitHub SARIF Upload](./github-sarif-upload.md).

## Community Edition Remediation Workflow

Confirmed findings can be opened as local remediation items from the finding Remediation tab. A remediation item stores owner, priority, due date, acceptance criteria, manual external issue/PR links, fix commit, validation run, and closure notes.

Remediation actions update finding review status automatically:

- `Open Remediation` records `open_remediation`.
- `Start Fix` records `mark_fix_in_progress`.
- `Fix Ready For Validation` records `mark_fix_ready_for_validation`.
- `Verification Pending` records `mark_verification_pending`.
- `Resolve With Evidence` records `resolve_finding`.
- `Reopen` records `reopen_finding`.

Use `Resolve With Evidence` only after entering a validation run, fix commit, or closure notes. Best practice is to run a follow-up audit against the fixed commit and link that validation run before treating the finding as resolved.

## Tool Tiers

Required for normal static repo audits:

- Node.js and npm
- Git
- one configured model provider: `mock`, `openai`, or `openai_codex`

Required static scanners for production static audits:

- OpenSSF Scorecard
- Semgrep
- Trivy

Advanced runtime validation tools:

- Python 3.10+
- Local Runtime Sandbox backend: gVisor `runsc`, rootless Podman, Podman, Docker, or Docker Desktop
- garak, Inspect, and PyRIT once their real adapters are enabled

Runtime validation is a primary Community Edition feature, but it is launch-gated by Local Runtime Sandbox readiness. The launch UI shows one option, **Local Runtime Sandbox**. Admin -> Runtime Sandbox shows the resolved backend, candidate list, warnings, blockers, network policy, resource limits, and setup guidance.

Tethermark auto-resolves the strongest allowed local backend:

1. gVisor container
2. rootless Podman
3. Podman
4. Docker
5. Docker Desktop
6. Landlock-style process wrapper, for future lightweight use

Docker Desktop on Windows/macOS is allowed only as a warning backend because it relies on a shared Linux VM boundary. Use Linux with gVisor or rootless Podman when stronger local isolation claims matter.

For the full design, see [Runtime Sandbox Architecture](./runtime-sandbox-architecture.md).

## Readiness Check

Run:

```bash
npm run scan -- doctor
```

For automation:

```bash
npm run scan -- doctor --json
npm run scan -- runtime-doctor --json
```

`doctor` reports required failures separately from optional runtime warnings. Missing Scorecard, Semgrep, or Trivy blocks production readiness for static audits. Development and diagnostic runs may still proceed in degraded mode, but release validation requires all three scanners to be available.

Runtime launch readiness is separate from static readiness:

```bash
npm run scan -- runtime-doctor
npm run scan -- validate-runtime-fixtures
```

`runtime-doctor` reports Local Runtime Sandbox backend resolution. `validate-runtime-fixtures` checks whether runtime validation is launchable in the current environment. It does not silently install privileged runtimes.

For release gates:

```bash
npm run production:runtime-readiness
npm run production:harness-readiness
```

`production:runtime-readiness` intentionally fails when no launchable local runtime backend is available.

## External Tool Setup

Preview the installer plan:

```bash
npm run scan -- setup-tools --dry-run
```

Execute auto-supported package-manager installs:

```bash
npm run scan -- setup-tools --yes
```

Limit to one or more tools:

```bash
npm run scan -- setup-tools --dry-run --tool semgrep,trivy
```

The setup command avoids downloading scanner executables into the repository. It prefers package managers such as `winget`, `brew`, `pipx`, `python -m pip --user`, or `choco`, depending on platform availability. Manual steps are printed when a safe automatic install path is not detected.

When tools are installed, `setup-tools` records discovered scanner directories in `.env` as `HARNESS_STATIC_TOOLS_PATH`. Start or restart `npm run oss` after setup so the local API and web UI read those paths.

Semgrep uses a bundled local Tethermark ruleset by default so new installs do not depend on downloading `--config auto` from `semgrep.dev`. Set `HARNESS_SEMGREP_CONFIG` to a local file, directory, or Semgrep config URI only when your deployment intentionally uses an organization-managed ruleset.

## Local Runtime Sandbox Setup

Preview platform-specific runtime setup guidance:

```bash
npm run scan -- setup-runtime --dry-run
```

Confirm that you have reviewed the guidance and execute any auto-supported package-manager installer:

```bash
npm run scan -- setup-runtime --yes
```

`setup-runtime --yes` may run supported package-manager commands such as `winget install Docker.DockerDesktop`, `choco install docker-desktop`, `brew install --cask docker`, or Linux Podman package installs. It never runs those commands silently; `--dry-run` shows the exact plan first, and `--yes` is required for execution.

The web UI exposes the same flow in `System -> Setup -> Runtime Sandbox`. When a supported installer is detected, use **Install Runtime Backend** to run the auto-supported command after confirmation. If the operator skips setup, the install fails, or no supported package manager is available, Tethermark keeps static audits available and blocks only runtime-validated launches until readiness passes.

Some runtimes still require an operator step after installation, such as starting Docker Desktop. After installing or starting the selected runtime, restart `npm run oss` if needed and run:

```bash
npm run scan -- runtime-doctor
```

Default runtime policy:

- network blocked by default
- dependency-install network requires explicit configuration
- target mounted read-only where the backend supports it
- artifacts written only to the per-run artifact directory
- symlinks skipped during staging
- stdout/stderr excerpts capped
- step and run timeouts enforced from settings

## Assistant Model Settings

By default, the assistant inherits the global LLM provider and model from Settings -> LLM. You can set an assistant-specific model override on the same settings page when chat latency, cost, or behavior should differ from audit agents.

Environment defaults:

- `ASSISTANT_LLM_PROVIDER`
- `ASSISTANT_LLM_MODEL`

If no assistant LLM is configured or the configured model cannot be reached, Community Edition keeps deterministic evidence-grounded fallback responses available. The fallback uses persisted run, finding, evidence, review, and export records. It should cite available evidence and state limitations instead of guessing.

## Theme

The Community Edition web UI defaults to dark mode. Use the sidebar theme button to switch between dark and light mode. The browser stores the preference in `localStorage` as `tethermark-theme`.

## Safe Installer Options

macOS/Linux:

```bash
curl -fsSL https://tethermark.dev/install.sh | bash -s -- --dry-run
curl -fsSL https://tethermark.dev/install.sh | bash -s -- --no-onboard
curl -fsSL https://tethermark.dev/install.sh | bash -s -- --prefix="$HOME/tools/tethermark"
```

Windows:

```powershell
irm https://tethermark.dev/install.ps1 | iex
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -NoOnboard
```
