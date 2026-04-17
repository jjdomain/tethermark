# Tethermark: Next Architecture

## Goals

This phase evolves the harness from a mostly linear agent workflow into a scalable, cost-aware, evidence-centric audit platform.

Primary goals:
- Support recurring audits and historical analysis
- Add durable operational storage without losing artifact-based reproducibility
- Improve audit realism by introducing specialist audit lanes
- Keep baseline recurring audits cheap and deterministic
- Reserve deeper agentic decomposition for larger or higher-value audits
- Keep harness logic separate from downstream leaderboard and product logic while still exposing machine-readable reviewer workflow state

## Design Principles

1. Artifacts remain the canonical audit evidence.
2. Database storage is the operational and query layer, not the blob store.
3. Audit workflow should resemble real audit phases, but not literally mimic human staffing.
4. Deterministic evidence collection should happen before agent synthesis whenever possible.
5. Agents should operate on compact, scoped evidence bundles.
6. Expensive stages should be reused when target changes do not affect them.
7. Supervisor review should act as audit QA, not as another general-purpose synthesizer.

## Runtime Modes

The harness supports three database modes:
- embedded
- local
- hosted

### Embedded
- Backend target: SQLite
- Intended for OSS users, single-machine local use, and CI smoke runs
- Zero-config default
- Stores run metadata, scores, findings, invocations, and artifact indexes
- Heavy artifacts remain on disk

### Local
- Backend target: PostgreSQL
- Intended for internal team use, dashboards, recurring jobs, and local APIs
- Uses the same logical schema as hosted mode

### Hosted
- Backend target: PostgreSQL
- Intended for shared internal production and downstream-integrated backends
- Supports org or workspace tenancy, reviewer workflows, and history analytics

## Implementation Note

The current implementation slice establishes package-aware orchestration plus a SQLite-file-backed persistence layer for `embedded`, `local`, and `hosted` modes. The logical mode boundary is now real even though all three modes still use the same SQLite-file contract today. The next backend step is replacing `local` and `hosted` with a real PostgreSQL implementation without changing higher-level workflow contracts.

## Storage Model

### Database stores
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

### File and object artifact store
- raw tool output
- full JSON artifacts
- repo-context bundles
- prompt and response traces if enabled
- exported reports
- evidence attachments

## API Contract Boundary

The runtime now distinguishes between:

- normalized query APIs backed by persisted records for stable integrations
- raw artifact/debug APIs backed by archival run payloads for inspection

The normalized query layer is the long-term integration contract.
The raw artifact layer is best-effort and may evolve with runtime object shapes and artifact layouts.

See `docs/API_Stability_and_Artifact_Boundary.md` for the explicit compatibility rules and consumer guidance.

## Audit Packages

The harness exposes audit packages rather than one generic mode.

### baseline-static
- Cheapest recurring package
- Best for OSS leaderboard-style recurring runs
- Uses compact contexts, deterministic evidence, and minimal reruns

### agentic-static
- Static package with explicit AI, agentic, and MCP controls
- Best default for AI security leaderboard evaluations

### deep-static
- Multi-lane specialist analysis
- Stronger supervisor review and wider evidence gathering

### runtime-validated
- Includes bounded build, run, and validation stages
- Used when static evidence is insufficient

### premium-comprehensive
- Full specialist-lane audit with stricter review and optional human signoff

## Stage Model

1. prepare_target
2. build_repo_context
3. classify_and_scope
4. build_threat_model
5. allocate_audit_lanes
6. collect_evidence
7. lane_analysis
8. supervisor_review
9. selective_corrections
10. score_and_publishability
11. remediation
12. persist_and_export

## Planner Model

### Lead planner
Responsible for:
- semantic target classification
- package selection
- control-family scope
- global constraints
- lane allocation

### Lane planners
Responsible for:
- lane-specific control subset
- lane-specific evidence requirements
- allowed tools
- bounded sub-planning only

## Audit Lanes

Recommended initial lanes:
- repo_posture_lane
- supply_chain_lane
- agentic_controls_lane
- data_exposure_lane
- runtime_validation_lane

Each lane receives:
- scoped controls
- scoped repo context
- scoped threat model slice
- scoped evidence bundle
- token budget
- rerun budget

## Evidence Model

Evidence is produced first, then interpreted.

Pipeline:
1. deterministic analyzers and tools run
2. outputs are normalized into EvidenceRecord objects
3. lane agents interpret evidence into findings and control updates
4. supervisor validates evidence sufficiency and correctness

## Supervisor Model

The supervisor acts as audit QA.

Responsibilities:
- reject unsupported findings
- downgrade weak conclusions
- detect control-mapping mistakes
- request additional evidence
- trigger selective lane or tool reruns
- mark human review requirements
- enforce policy-pack publication rules

The supervisor decides whether human review is required, but the post-run reviewer workflow is a separate persisted state machine. Reviewer approval, rejection, suppression, and rerun requests should be represented as explicit workflow actions rather than supervisor artifact edits.

## Reuse and Cost Controls

The harness should minimize repeated expensive work.

Mechanisms:
- compact per-agent contexts
- stage reuse by commit diff
- lane reuse by changed surface
- bounded rerun counts
- bounded tool lists per package
- total token budgets
- prompt and trace retention options
- publication gating for weak evidence

## OSS vs Product Boundary

### Harness owns
- control catalog
- methodology and scoring
- packages
- orchestration
- lanes
- observability
- persistence schema
- policy packs

### Downstream platform owns
- leaderboard ranking logic
- repo curation
- public presentation and trend charts
- publication workflows and reviewer UX
- product-specific UX and metadata
