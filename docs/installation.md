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

## Tool Tiers

Required for normal static repo audits:

- Node.js and npm
- Git
- one configured model provider: `mock`, `openai`, or `openai_codex`

Recommended static scanners:

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

`doctor` reports required failures separately from optional scanner/runtime warnings. Missing Scorecard, Semgrep, or Trivy means static audits still run, but scanner-backed evidence will be skipped.

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
