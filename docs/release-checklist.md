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

## 3. End-to-End OSS Workflow Smoke Test

Verify one full OSS operator path:

1. Launch a local scan with the mock provider or a configured live provider.
2. Run preflight and confirm the launch profile.
3. Complete the run and inspect findings in the web UI.
4. Exercise review actions or runtime follow-up if the run requires review.
5. Download at least one executive summary and one SARIF or JSON export.
6. Confirm `GET /runs/:runId/exports` returns the documented export catalog.

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
- release verification commands
- public API/export routes

## 5. OSS Scope Check

Before release, confirm the public docs still present these boundaries accurately:

- OSS defaults to trusted self-hosting, not enterprise identity
- `auth=none` is advisory governance only
- `auth=api_key` is the enforced OSS auth mode
- non-SQLite persistence is not yet part of the OSS release
- outbound GitHub actions remain guarded and operator-triggered

## 6. Release Hygiene

Before cutting a public release:

1. Update `changelog.md`
2. Run `npm run exports:refresh` only if the export contract intentionally changed
3. Re-run `npm run release:check`
4. Verify example consumers under `examples/` still work against current export shapes
5. Tag and publish only after the checklist is green
