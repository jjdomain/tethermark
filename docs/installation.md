# Tethermark Installation

Tethermark should be installed with a guided workflow first, then verified with `doctor`.

## Reproducible Install

The supported source distribution is the repository-local installer. Download or clone a trusted Tethermark source ref, inspect the script, and preview the exact operation before running it. The `tethermark.dev` hosted one-line URLs are not published and must not be used.

For a release, replace `<release-tag-or-commit>` with the published tag or full commit SHA. The default `main` ref is convenient for development but is intentionally rolling and is not a reproducible release identifier.

macOS and Linux:

```bash
bash scripts/install.sh --dry-run --ref=<release-tag-or-commit>
bash scripts/install.sh --ref=<release-tag-or-commit>
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -DryRun -Ref <release-tag-or-commit>
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Ref <release-tag-or-commit>
```

The installer requires Git, Node.js, and npm; clones the requested ref; checks out the resolved commit in detached mode; runs the lockfile-enforced first-run workflow; and records the requested ref and resolved commit in ignored local file `.tethermark-install.json`. A fresh install refuses to overwrite an existing destination.

## Guided Onboarding

From a checked-out repo:

```bash
npm run first-run -- --dry-run
npm run first-run
```

`first-run` accepts only Node.js 22.x or 24.x, installs the exact `package-lock.json` dependency graph with `npm ci`, builds Tethermark, creates/checks `.env`, runs `doctor`, explains external tool readiness, and prints the next setup, fixture-validation, and UI commands. Use `npm run first-run -- --no-onboard` only for automation that will run onboarding separately.

Onboarding will tell you whether to run:

```bash
npm run scan -- setup-tools --dry-run
npm run scan -- setup-tools --yes
npm run scan -- setup-runtime --dry-run
npm run scan -- setup-runtime --yes
npm run scan -- setup-workers --dry-run
npm run scan -- setup-workers --yes
npm run scan -- doctor
npm run scan -- runtime-doctor
npm run scan -- worker-doctor
npm run scan -- worker-tests
npm run scan -- worker-smoke
npm run scan -- validate-runtime-fixtures
npm run scan -- validate-fixtures --llm-provider mock
npm run oss
```

The web UI opens at `http://127.0.0.1:8788`.

## Network Binding and Authentication

The API and web UI default to `127.0.0.1` through `HARNESS_API_HOST` and `WEB_UI_HOST`. This is the supported single-user workstation configuration and requires no network-exposure acknowledgement.

The web UI proxies audit API calls, so exposing either service is security-sensitive. A non-loopback host fails closed unless `HARNESS_API_AUTH_MODE=api_key`, `HARNESS_API_KEY` is at least 32 characters, and the operator sets this exact acknowledgement after reviewing the risk:

```text
HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT=I_UNDERSTAND_TETHERMARK_WILL_BE_NETWORK_ACCESSIBLE
```

Tethermark prints a warning on every permitted external start. It does not provide TLS termination; put an external binding behind a trusted TLS reverse proxy and firewall, restrict the reachable network, and never expose the plain HTTP service directly to the Internet. `npm run api`, `npm run web`, and `npm run oss` enforce the same rule. The combined launcher validates both services before starting either one.

For the complete first-run, audit, review, remediation, export, restart, backup, and upgrade path, follow [Community Edition Operator Workflow](./operator-workflow.md). The bounded release walkthrough is recorded in [Phase 6 Operator Workflow Evidence](./phase6-operator-workflow-evidence.md).

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

- Python `>=3.11 <3.14`
- Local Runtime Sandbox backend: gVisor `runsc`, rootless Podman, Podman, Docker, or Docker Desktop
- executable Inspect packs, bounded Garak PromptInject, and bounded PyRIT adversarial-text profiles

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
npm run scan -- worker-doctor --json
```

`doctor` reports required failures separately from optional runtime warnings. Missing Scorecard, Semgrep, or Trivy blocks production readiness for static audits. Development and diagnostic runs may still proceed in degraded mode, but release validation requires all three scanners to be available.

Runtime launch readiness is separate from static readiness:

```bash
npm run scan -- runtime-doctor
npm run scan -- validate-runtime-fixtures
```

`runtime-doctor` reports Local Runtime Sandbox backend resolution. `validate-runtime-fixtures` runs a digest-pinned Alpine fixture with no network, a read-only source mount, bounded writable scratch, non-root execution, dropped capabilities, resource limits, and explicit cleanup verification. It may pull the pinned image when it is not cached, does not silently install privileged runtimes, and writes evidence under `.artifacts/runtime-readiness/`.

For release gates:

```bash
npm run production:runtime-readiness
npm run production:harness-readiness
```

`production:runtime-readiness` intentionally fails when no launchable local runtime backend is available or when isolated runtime fixtures do not execute successfully.

## Python Worker Environment

Python worker setup is separate from the container runtime. Tethermark supports Python `>=3.11 <3.14` for this environment and installs it into `.tethermark/python-worker` without modifying system packages.

Preview the exact commands:

```bash
npm run scan -- setup-workers --dry-run
```

After review, create the environment and install the hash-locked packages:

```bash
npm run scan -- setup-workers --yes
npm run scan -- worker-doctor
```

The setup consumes [`workers/python/requirements-bootstrap.lock`](../workers/python/requirements-bootstrap.lock), [`workers/python/requirements.lock`](../workers/python/requirements.lock), and the isolated [`workers/python/requirements-garak-profile.lock`](../workers/python/requirements-garak-profile.lock) and [`workers/python/requirements-pyrit-profile.lock`](../workers/python/requirements-pyrit-profile.lock) with pip hash enforcement. It installs the local worker package without dependency resolution or build isolation, records all runtime-lock digests and the base installed-package inventory, and runs an import-boundary self-check. Inspect is executable through the bounded packs in [`inspect-adapter.md`](inspect-adapter.md), Garak through [`garak-adapter.md`](garak-adapter.md), and PyRIT through [`pyrit-adapter.md`](pyrit-adapter.md).

## External Tool Setup

Preview the installer plan:

```bash
npm run scan -- setup-tools --dry-run
```

Install the production-locked tools after reviewing the plan:

```bash
npm run scan -- setup-tools --yes
```

Limit to one or more tools:

```bash
npm run scan -- setup-tools --dry-run --tool semgrep,trivy
```

The setup strategy is deterministic and user-scoped:

- OpenSSF Scorecard `5.5.0` and Trivy `0.73.0` are downloaded from their official GitHub releases into the user Tethermark tools directory. Setup verifies the platform archive against the SHA-256 value in `packages/core-engine/src/static-tool-policy.ts` before extraction and verifies the installed executable's version.
- Semgrep `1.172.0` is downloaded as a platform wheel from PyPI, verified against the official wheel SHA-256 allowlist, and installed into an isolated user Tethermark package directory. A managed runner fixes package precedence and disables Semgrep version checks. Audit commands also pass `--metrics off`.
- Scanner executables are never written into the source repository. Package-manager versions are not used when they cannot reproduce the production pin.
- Unsupported operating-system/architecture combinations stop with a manual, checksum-verification instruction instead of downloading an unreviewed artifact.

When tools are installed, `setup-tools` records discovered scanner directories in `.env` as `HARNESS_STATIC_TOOLS_PATH`. Managed Semgrep also records `HARNESS_SEMGREP_PYTHON` and `HARNESS_SEMGREP_RUNNER`, ensuring doctor, readiness, and audit execution use the same direct child-process invocation. Start or restart `npm run oss` after setup so the local API and web UI read those paths.

Semgrep uses a bundled local Tethermark ruleset by default so new installs do not depend on downloading `--config auto` from `semgrep.dev`. Set `HARNESS_SEMGREP_CONFIG` to a local file, directory, or Semgrep config URI only when your deployment intentionally uses an organization-managed ruleset.

Verify only the production static scanner contract:

```bash
npm run scan -- static-doctor --json
```

This checks the supported version ranges, exact production pins, child-process invocation, bundled Semgrep ruleset version and SHA-256, `--metrics off` functional execution, Scorecard API reachability, Trivy registry reachability, and exported GitHub authentication. Scorecard public-repository scans should export `GITHUB_AUTH_TOKEN`, `GITHUB_TOKEN`, `GH_AUTH_TOKEN`, or `GH_TOKEN`; a GitHub CLI login is not silently reused.

Minimum public evidence coverage requires completed `repo_analysis`, Semgrep, Trivy, and either local Scorecard or the eligible public-GitHub Scorecard API fallback. If any member is skipped or failed, the audit remains usable internally but its publishability is forced to `internal_only` with human review required.

Run the real adversarial scanner smoke locally with:

```bash
npm run test:static-scanners:real
```

The fixture covers symlinks where the host permits them, traversal-like and hostile filenames, large and binary files, nested repositories, secret-like content, malformed manifests, plus deterministic timeout/output-flood failure tests in the regression suite.

## Browser Bootstrap

Browsers are required for the maintainer UI release gate, not for ordinary CLI/API static audits. Preview the repository-owned bootstrap before installing the default Chromium revision:

```bash
npm run setup:browser -- --dry-run --browser chromium
npm run setup:browser -- --yes --browser chromium
```

Use `--browser firefox`, `--browser webkit`, or `--all` for the complete release matrix. `--with-deps` permits Playwright to request operating-system browser dependencies and should be used only in a reviewed CI image or by an operator who accepts those package-manager changes.

The bootstrap never invokes `npx` and therefore cannot substitute a registry package at execution time. It first verifies the exact Playwright and Playwright Core SHA-512 npm integrity values, the SHA-256 of Playwright's embedded browser-revision manifest, and every locked revision/version in [`scripts/toolchain-lock.json`](../scripts/toolchain-lock.json). After installation it launches each selected browser and requires the reported version to match the lock. Playwright's CDN browser archive is transported by the pinned Playwright implementation; because upstream does not expose archive checksums in its embedded manifest, Tethermark does not describe the browser ZIP itself as checksum-verified.

Run the complete non-downloading integrity check with:

```bash
npm run toolchain:check
```

That gate also verifies all direct scanner downloads have SHA-256 allowlists and all runtime workload images are content-addressed by SHA-256 digest.

## Local Runtime Sandbox Setup

Preview platform-specific runtime setup guidance:

```bash
npm run scan -- setup-runtime --dry-run
```

Confirm that you have reviewed the guidance and execute any auto-supported package-manager installer:

```bash
npm run scan -- setup-runtime --yes
```

`setup-runtime --yes` may run supported package-manager commands such as `winget install Docker.DockerDesktop`, `choco install docker-desktop`, `brew install --cask docker`, or Linux Podman package installs. It never runs those commands silently; `--dry-run` shows the exact plan first, and `--yes` is required for execution. Runtime engines remain externally signed operating-system/vendor packages rather than Tethermark-downloaded archives. After installation, `runtime-doctor` must prove required capabilities and the native verifier records the installed version; release certification remains limited to the ranges in [Supported Platforms And Versions](./supported-platforms.md). Images launched by Tethermark use the SHA-256 digest pins in [`scripts/toolchain-lock.json`](../scripts/toolchain-lock.json); mutable image tags are not accepted by the governed runtime plans.

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

## Update And Rollback

Stop Tethermark and create a verified backup before updating. The installer refuses a checkout with uncommitted or untracked files, fetches only the requested ref, checks out its resolved commit in detached mode, and reruns `npm ci`, the build, and onboarding.

macOS/Linux:

```bash
npm run scan -- backup create --reason before-upgrade
bash scripts/install.sh --update --prefix="$HOME/.tethermark/tethermark" --ref=<release-tag-or-commit>
```

Windows:

```powershell
npm run scan -- backup create --reason before-upgrade
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Update -InstallDir "$HOME\.tethermark\tethermark" -Ref <release-tag-or-commit>
```

For code rollback, repeat the update command with the previous release tag or commit, then restore the verified pre-upgrade database backup if the newer release changed persisted state. Review `changelog.md` before either operation.

Optional installer arguments are `--prefix=`, `--repo=`, `--ref=`, `--no-onboard`, and `--dry-run` on macOS/Linux, with equivalent `-InstallDir`, `-RepoUrl`, `-Ref`, `-NoOnboard`, and `-DryRun` PowerShell parameters.

## Guarded Uninstall

Preview uninstall first. By default, the uninstaller moves `.env`, `.env.local`, `.artifacts`, and `.tethermark` to a timestamped sibling `uninstall-backups` directory, then removes only the verified application checkout. It rejects filesystem roots, the user profile, and directories that do not identify as Tethermark.

macOS/Linux:

```bash
bash scripts/uninstall.sh --dry-run --prefix="$HOME/.tethermark/tethermark"
bash scripts/uninstall.sh --yes --prefix="$HOME/.tethermark/tethermark"
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1 -DryRun -InstallDir "$HOME\.tethermark\tethermark"
powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1 -Yes -InstallDir "$HOME\.tethermark\tethermark"
```

`--purge-data`/`-PurgeData` deletes checkout-local configuration and data instead of preserving it. User-scoped static tools installed outside the checkout are deliberately retained; their complete removal is documented separately when the credential/data-removal Phase 11 task is complete.
