# Tethermark OSS Release Checklist

Use this checklist before tagging or publicly announcing an OSS release.

## 1. Verification Commands

Run the full maintainer verification path:

```bash
npm run release:check
```

That command currently covers:

- TypeScript build
- regression test suite
- export golden/schema checks
- bundled fixture validation

For static audit production release candidates, also run:

```bash
npm run production:static-release
```

That command adds the deterministic Codex OAuth first-run smoke, Pi Agent static API E2E, Pi Agent browser/UI E2E, and export checks. See `docs/static-audit-production-readiness.md` for the full gate and release evidence requirements.

## 2. Local Runtime Smoke Test

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
- when `HARNESS_ENABLE_ASSISTANT=1` is set, `GET /assistant/capabilities` returns enabled OSS capabilities

## 3. End-to-End OSS Workflow Smoke Test

Verify one full OSS operator path:

1. Launch a local scan with the mock provider or a configured live provider.
2. Run preflight and confirm the launch profile.
3. Complete the run and inspect findings in the web UI.
4. Exercise review actions or runtime follow-up if the run requires review.
5. For a confirmed finding, open a remediation item, add a manual external issue/PR link, advance it to resolved with evidence, and verify the finding status updates without a separate manual status change.
6. Download at least one executive summary and one SARIF or JSON export. Verify the SARIF can be used with the documented GitHub code scanning upload workflow.
7. Confirm `GET /runs/:runId/exports` returns the documented export catalog.
8. Open the run assistant, ask a run-level remediation question, verify citations/limitations render, and confirm that hosted-only connector actions are blocked in OSS.
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
- supported persistence modes
- runtime limitations
- assistant feature flag, model routing, fallback, and OSS/hosted boundaries
- remediation workflow, manual OSS external links, and hosted connector/webhook boundary
- dark/light theme default and persistence
- release verification commands
- public API/export routes

## 5. OSS Scope Check

Before release, confirm the public docs still present these boundaries accurately:

- OSS defaults to trusted self-hosting, not enterprise identity
- `auth=none` is advisory governance only
- `auth=api_key` is the enforced OSS auth mode
- non-SQLite persistence is not yet part of the OSS release
- OSS does not create GitHub issues or receive GitHub webhooks; hosted connector automation is documented separately

## 6. Release Hygiene

Before cutting a public release:

1. Update `changelog.md`
2. Run `npm run exports:refresh` only if the export contract intentionally changed
3. Re-run `npm run release:check`
4. For static audit releases, re-run `npm run production:static-release`
5. Verify `npm run smoke:openai-codex-oauth:real` on a signed-in workstation when Codex OAuth behavior changed
6. Verify example consumers under `examples/` still work against current export shapes
7. Tag and publish only after the checklist is green
