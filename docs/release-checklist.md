# Tethermark Community Edition Release Checklist

Use this checklist before tagging or publicly announcing a Tethermark Community Edition release.

## 1. Verification Commands

Confirm the release candidate still matches [`docs/supported-platforms.md`](./supported-platforms.md): package engines, Python constraints, explicit GitHub runner labels, exact Playwright dependency, and native-runtime evidence must agree.

Run the full maintainer verification path:

```bash
npm run release:check
```

That command currently covers:

- TypeScript build
- regression test suite
- native install/update/first-run/guarded-uninstall lifecycle checks
- Playwright package/manifest, static-tool archive, and runtime-image integrity-lock checks
- fail-closed API/web UI network-exposure policy and direct/combined startup checks
- credential, webhook SSRF, repository-clone, archive-extraction, and log-redaction boundary checks
- dependency/license policy parsing, scanner-result thresholds, secret-safe reporting, and time-bounded release-security exception validation
- export golden/schema checks
- bundled fixture validation
- deterministic live-validation opt-in, budget, usage, and redaction harness checks

`release:check` never contacts a live model. For a release candidate, separately follow `docs/live-model-validation.md` and retain current passing `openai_codex`/`chatgpt_session` evidence from both bounded primary gates. Optional API-key evidence does not replace it.

Run the network-backed repository release-security gate separately with checksum-locked scanners and authenticated GitHub access:

```bash
npm run release:security
```

Review the sanitized report using [`docs/release-security-gate.md`](./release-security-gate.md). Do not tag or publish while the gate is failed.

Build the exact artifact set twice, verify its checksum manifest and SBOM coverage, and follow the tag-bound signing procedure in [`docs/release-artifact-verification.md`](./release-artifact-verification.md):

```bash
npm run test:release-artifacts
npm run release:artifacts -- --tag vX.Y.Z
npm run release:verify
```

Only the **Signed Release Artifacts** workflow may produce official release files. Verify its SLSA provenance and CycloneDX attestations with `gh attestation verify` before attaching files to a GitHub release.

Verify the least-privilege shared-service path and platform-template contract:

```bash
npm run test:service-deployment
```

Review any local unit/task modifications against [`docs/shared-service-deployment.md`](./shared-service-deployment.md). A release checkout used by a service must remain read-only to the dedicated process identity.

Dispatch **Install And Upgrade Verification** for the release candidate and require retained Windows, Ubuntu, and macOS evidence to pass the acceptance contract in [`docs/install-upgrade-verification.md`](./install-upgrade-verification.md). The Ubuntu job must also pass the server-profile regression; the macOS result does not certify container execution.

For static audit production release candidates, also run:

```bash
npm run production:static-release
```

That command adds the deterministic Codex OAuth first-run smoke, Pi Agent static API E2E, Pi Agent browser/UI E2E, and export checks. See `docs/static-audit-production-readiness.md` for the full gate and release evidence requirements.

## 2. Local Runtime Smoke Test

Before the runtime smoke, verify a fresh ref-pinned install and an update preview on the release operating system using [`docs/installation.md`](./installation.md). Run the guarded uninstall dry run against the test installation and confirm that it identifies the exact checkout and preservation directory without changing either.

In a fresh shell with `.env` based on `.env.example`:

```bash
npm run api
npm run web
```

Confirm:

- API health responds on `http://127.0.0.1:8787/health`
- auth info responds on `http://127.0.0.1:8787/auth/info`
- web UI loads on `http://127.0.0.1:8788`
- the web UI can fetch runs, settings, and auth metadata
- `GET /assistant/capabilities` returns enabled Community Edition capabilities by default, unless an explicit disable override is set
- `HARNESS_API_HOST=0.0.0.0 npm run api` (or the shell-equivalent environment assignment) refuses to start without API-key auth and the exact exposure acknowledgement

## 3. End-To-End Community Edition Workflow Smoke Test

Verify one full Community Edition operator path:

1. Launch a local scan with the mock provider or a configured live provider.
2. Run preflight and confirm the launch profile.
3. Complete the run and inspect findings in the web UI.
4. Exercise review actions or runtime follow-up if the run requires review.
5. For a confirmed finding, open a remediation item, add a manual external issue/PR link, advance it to resolved with evidence, and verify the finding status updates without a separate manual status change.
6. Download at least one executive summary and one SARIF or JSON export. Verify the SARIF can be used with the documented GitHub code scanning upload workflow.
7. Confirm `GET /runs/:runId/exports` returns the documented export catalog.
8. Open the run assistant, ask a run-level remediation question, verify citations/limitations render, and confirm that automatic Cloud connector actions are unavailable in Community Edition.
9. Toggle dark/light mode once and verify the selected theme is persisted after reload.

## 4. Documentation Review

Confirm these docs still match the released behavior:

- `README.md`
- `docs/export-schemas.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `changelog.md`

Specifically re-check:

- auth mode/trust model wording
- the threat-model register and every credential/outbound/archive/clone/runtime-mount boundary
- the live release-security report and every active exception using `docs/release-security-gate.md`
- supported persistence modes
- runtime limitations
- assistant default-on behavior, explicit disable override, model routing, fallback, and Community Edition/Cloud boundaries
- remediation workflow, manual Community Edition external links, and Cloud connector/webhook boundary
- dark/light theme default and persistence
- release verification commands
- public API/export routes

## 5. Community Edition Scope Check

Before release, confirm the public docs still present these boundaries accurately:

- Community Edition defaults to trusted self-hosting, not enterprise identity
- `auth=none` is advisory governance only
- `auth=api_key` is the enforced Community Edition auth mode
- non-SQLite persistence is not yet part of the Community Edition release
- Community Edition does not create GitHub issues or receive GitHub webhooks; Tethermark Cloud connector automation is documented separately
- the governed core and hosted extension claims still match `docs/community-edition-hosted-boundary.md`
- local CE scheduling is not described as highly available managed scheduling, and hosted features are not implied to ship from the CE repository

## 6. Release Hygiene

Before cutting a public release:

1. Update `changelog.md`
2. Run `npm run exports:refresh` only if the export contract intentionally changed
3. Re-run `npm run release:check`
4. For static audit releases, re-run `npm run production:static-release`
5. Run `npm run phase3:codex:live` as a signed-in local operator; verify both dated summaries are passing, redacted, identify `openai_codex`/`chatgpt_session`, and come from the release candidate commit
6. Verify `npm run smoke:openai-codex-oauth:real` on a signed-in workstation when Codex ChatGPT-session behavior changed
7. Verify example consumers under `examples/` still work against current export shapes
8. Tag and publish only after the checklist is green

For the browser release gate, manually dispatch `Static Audit Release Gate` with `run_ui_e2e=true` and require passing Chromium, Firefox, and WebKit matrix jobs. A default local Chromium pass alone does not certify all three browser engines.

The browser matrix must use `npm run setup:browser -- --yes --with-deps --browser <browser>`. Do not replace it with `npx playwright install`: the repository-owned command verifies the locked npm package integrity and browser revision manifest before download, then launches and version-checks the selected browser.
