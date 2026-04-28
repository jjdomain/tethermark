# Tethermark: Next Architecture

## Goals

This phase evolves the harness from a mostly linear agent workflow into a scalable, cost-aware, evidence-centric audit platform.

Primary goals:
- Support recurring audits and historical analysis
- Add durable operational storage without losing artifact-based reproducibility
- Improve audit realism by introducing specialist audit lanes
- Keep baseline recurring audits cheap and deterministic
- Reserve deeper agentic decomposition for larger or higher-value audits
- Keep harness logic separate from downstream product logic while still exposing machine-readable reviewer workflow state

## Design Principles

1. Artifacts remain durable audit evidence.
2. Database storage is the operational and query layer, not the blob store.
3. Audit workflow should resemble real audit phases, but not literally mimic human staffing.
4. Deterministic evidence collection should happen before agent synthesis whenever possible.
5. Agents should operate on compact, scoped evidence bundles.
6. Expensive stages should be reused when target changes do not affect them.
7. Supervisor review should act as audit QA, not as another general-purpose synthesizer.

## Storage Mode

The OSS harness supports one database mode:

- `local`

### Local
- Backend target: SQLite file storage
- Intended for OSS users, single-machine local use, self-hosted trusted teams, and CI smoke runs
- Zero-config default under `.artifacts/state/local-db`
- `HARNESS_LOCAL_DB_ROOT` can point storage at an operator-managed directory
- Stores run metadata, scores, findings, invocations, artifact indexes, review state, and UI settings
- Large/debug bundle exports remain optional files on disk

Hosted production storage is outside the OSS runtime. The hosted product imports the shared engine contracts and provides a Supabase/Postgres adapter for tenant-aware production storage.

## Storage Model

### Database Stores
- run metadata
- target identity and snapshots
- stage execution records
- agent invocations
- tool executions
- control results
- findings
- score summaries
- dimension scores
- artifact manifests
- review decisions
- review workflows and reviewer actions
- suppressions and waivers
- token and cost usage
