# Contributing

## Scope

This repository is the engine layer of Tethermark.

Contributions should preserve that boundary:

- engine orchestration
- evidence collection and normalization
- findings, scoring, and review-state contracts
- persistence, API, CLI, and fixture validation

Avoid expanding the repo into a downstream dashboard, publication shell, or broad product UX unless that direction is explicitly agreed first.

## Before You Change Code

1. Read [`README.md`](README.md) for the current entrypoints and runtime shape.
2. Read [`roadmap.md`](roadmap.md) for current product priorities.
3. Check [`changelog.md`](changelog.md) so new work is recorded consistently.

## Development Workflow

### Setup

```bash
npm install
cp .env.example .env
```

The default repo configuration uses the mock LLM runtime, so local build and test do not require live model credentials.

### Validate Changes

Run these before opening a change:

```bash
npm run build
npm test
npm run scan -- validate-fixtures
```

For release-sensitive or public-surface changes, also run:

```bash
npm run release:check
```

The GitHub Actions CI workflow runs the same verification steps for pushes and pull requests.

`validate-fixtures` uses an isolated temporary persistence root by default, so it should not contend with the normal local embedded database unless you explicitly pass `--persistence-root`.

If your change touches the API surface, also run:

```bash
npm run api
```

and sanity-check the affected routes.

## Contribution Expectations

- Keep normalized query APIs separate from raw artifact/debug APIs.
- Prefer persistence-backed behavior over new artifact-only compatibility paths.
- Add or update regression tests for behavior changes.
- Keep fixture targets intentionally small, deterministic, and documented.
- Document user-facing behavior changes in [`README.md`](README.md) and [`changelog.md`](changelog.md).
- If a change affects OSS support boundaries, also update [`docs/release-checklist.md`](docs/release-checklist.md).

## Pull Request Guidance

A good change should explain:

- what user or operator problem it solves
- whether it changes persisted contracts, CLI behavior, or API routes
- what tests were run
- whether any docs or fixture expectations changed

## Commit and Changelog Hygiene

- Keep commits scoped to one clear change area when practical.
- Add a changelog entry for user-visible or operator-visible changes.
- Do not leave completed work in TODO wording inside the changelog.

## Security-Sensitive Changes

Be especially careful around:

- sandbox execution policy
- tool adapters and command execution
- authentication or callback behavior
- artifact path handling
- persistence migrations and data deletion paths

If a change could weaken sandboxing, reviewer workflow integrity, or artifact isolation, call that out explicitly in the PR description.

## Questions

If the right layer for a change is unclear, prefer opening an issue or a small design note first rather than landing a broad architectural change by default.
