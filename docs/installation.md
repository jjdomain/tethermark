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
npm run scan -- doctor
npm run scan -- validate-fixtures --llm-provider mock
npm run oss
```

The web UI opens at `http://127.0.0.1:8788`.

To enable the OSS assistant:

```bash
HARNESS_ENABLE_ASSISTANT=1 npm run oss
```

Windows PowerShell:

```powershell
$env:HARNESS_ENABLE_ASSISTANT='1'; npm run oss
```

The assistant runs locally against persisted Tethermark audit data. It supports selected run and target-history Q&A, deterministic evidence-grounded fallback answers, draft outputs, and confirmed local actions. Hosted-only project/workspace/org scopes and external connector sends are not enabled in OSS. OSS does not create GitHub issues or receive GitHub webhooks; paste manual external issue or PR links into local remediation items when needed. To surface findings in GitHub code scanning from OSS, export SARIF and upload it with GitHub Actions; see [GitHub SARIF Upload](./github-sarif-upload.md).

## OSS Remediation Workflow

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
- Docker or Podman on Linux
- garak, Inspect, and PyRIT once their real adapters are enabled

Current Windows support is static-first. Full runtime validation should be run from a Linux host or Linux worker with container support.

## Readiness Check

Run:

```bash
npm run scan -- doctor
```

For automation:

```bash
npm run scan -- doctor --json
```

`doctor` reports required failures separately from optional runtime warnings. Missing Scorecard, Semgrep, or Trivy blocks production readiness for static audits. Development and diagnostic runs may still proceed in degraded mode, but release validation requires all three scanners to be available.

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

## Assistant Model Settings

By default, the assistant inherits the global LLM provider and model from Settings -> LLM. You can set an assistant-specific model override on the same settings page when chat latency, cost, or behavior should differ from audit agents.

Environment defaults:

- `ASSISTANT_LLM_PROVIDER`
- `ASSISTANT_LLM_MODEL`

If no assistant LLM is configured or the configured model cannot be reached, OSS keeps deterministic evidence-grounded fallback responses available. The fallback uses persisted run, finding, evidence, review, and export records. It should cite available evidence and state limitations instead of guessing.

## Theme

The OSS web UI defaults to dark mode. Use the sidebar theme button to switch between dark and light mode. The browser stores the preference in `localStorage` as `tethermark-theme`.

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
