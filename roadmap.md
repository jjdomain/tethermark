# Product Roadmap

## Purpose

This roadmap translates the current requirements, architecture notes, and completed refactor work into a practical product sequence.

It is intentionally product-oriented:

- what is already built
- what should ship next
- what should be deferred until the system has the right substrate

It is not a replacement for the requirements docs. It is the execution bridge between the spec and the current codebase.

## Current Baseline

The harness now has the right core shape for a real public repository and future productization:

- headless-first CLI, HTTP API, and MCP entrypoints
- staged orchestrator with planner, threat-model, eval-selection, supervisor, correction, scoring, remediation, and human review flow
- standards-based static audit path with normalized findings, control results, scores, and observations
- persistence-backed query APIs with explicit separation from raw artifact/debug APIs
- selective rerun and reuse based on persisted stage artifacts and normalized records
- backend-aware OSS `local` SQLite persistence
- observability rollups, maintenance commands, and persistence validation
- persisted human review workflow with CLI and API surfaces

This means the foundational refactor is complete enough to stop doing architecture cleanup and start doing product-shaping work.

## Product Position

The product remains:

- an open, headless AI security audit harness
- a reusable engine for OSS repo audits, local-path audits, CI scans, and future internal or hosted workflows
- an isolated runtime validation harness for AI/agent behavior, not a production endpoint pentest platform
- separate from downstream application UI and editorial flows, while still exposing machine-readable reviewer workflows

That boundary should remain strict. The engine owns orchestration, evidence, findings, scoring, review-state contracts, and export. Downstream systems own operator workflow UX, publication, and broader review experience.

## Readiness Gaps

The architecture is no longer the main blocker. The remaining gaps are mostly about usability, trust, and operations.

### Highest-priority gaps

- OSS release hygiene: license selection, contribution guide, security reporting policy, CI expectations, and fixture-usage docs
- service lifecycle: queued async runs, cancel or retry semantics, completion callbacks or webhooks, and stronger deployment assumptions
- human review operations: reviewer assignment, checkpointed review-gated flows, and stronger release gating
- result evaluation quality: explicit evidence sufficiency and false-positive adjudication records plus deterministic consistency checks
- runtime depth: stronger isolated validation-runner behavior and real Python worker integrations for AI/agent behavior-level auditing
- hosted storage boundary: OSS stays SQLite-backed with `local`; hosted production uses a separate Supabase/Postgres adapter around the shared persistence contracts

### Audience framing

For OSS users, the main missing pieces are trust and install confidence.

- clear repo hygiene
- CI-backed fixture validation
- better troubleshooting docs

For internal operators, the main missing pieces are service behavior and workflow operations.

- async run lifecycle
- reviewer assignment
- deployment guidance
- generic automation webhook usage guidance

Full project/event notification infrastructure is intentionally not an OSS priority. Slack, email, digesting, escalation routing, and notification-preference systems should be treated as hosted-platform capabilities, while OSS keeps simple generic webhooks and completion callbacks for automation hooks.

For downstream integrators, the main missing pieces are contract stability and service semantics.

- versioned integration expectations
- callback lifecycle
- auth and tenancy assumptions
- compact export schemas for findings, evidence, and review metadata

## What Is Already Done

### Platform foundation

- TypeScript/Node core rewrite
- multi-entrypoint runtime surface
- provider-backed agent runtime with mock support
- sandbox and target-preparation scaffolding

### Audit workflow

- planner, threat model, eval selection, supervisor, remediation, and review workflow stages
- lane-based assessment and selective rerun flow
- standards/control-based scoring instead of placeholder posture scoring

### Persistence and query layer

- normalized persistence contracts
- persistence-backed run and target APIs
- artifact-policy split between stable query data and archival/debug payloads
- backfill, reconstruct, validate, and bundle-compaction maintenance workflows

### Operational baseline

- observability history and rollups
- target identity canonicalization
- backend isolation by database mode
- GitHub-ready README and architecture diagram
- persisted human review workflow state and reviewer action history

## Next Roadmap

## Phase 1: OSS Adoption and Validation

Goal:
Make the repository easy for third parties to install, trust, and verify quickly.

### 1. Canonical validation fixtures

Maintain and expand the repo-owned validation dataset under `fixtures/validation-targets/`.

It should continue to include:

- one minimal repo-posture target
- one agent/tool-boundary target
- one intentionally noisy target for false-positive handling

Each fixture should have:

- expected target class
- expected control coverage
- expected findings or finding families
- expected publishability or human-review expectations

Why this stays first:

- it improves install-time confidence immediately
- it gives CI a stable end-to-end harness regression target
- it creates a standard benchmark for future runtime and eval work

### 2. Quick validation UX

Keep the quick validation path polished and low-friction.

Examples:

- `npm run scan -- validate-fixtures`
- `npm run scan -- scan path fixtures/validation-targets/...`

The goal is not more architecture. It is faster user success.

### 3. Public repository polish

Add the minimum project materials needed for a serious GitHub release:

- license
- contribution guide
- security/disclosure policy
- fixture usage docs
- example outputs or screenshots

## Phase 2: Result Evaluation Layer

Goal:
Turn supervisor review from “one important stage” into a clearer evaluation subsystem for findings and evidence quality.

This is the most important architectural next step.

### 1. Define a dedicated evaluation layer around the supervisor

This does not mean replacing the supervisor.

It means formalizing a subsystem that owns:

- evidence sufficiency grading
- false-positive risk grading
- control-mapping validation
- duplicate/conflict adjudication
- validation recommendations
- publication and reviewer gating recommendations

The current supervisor already does part of this, but mostly as one stage artifact and one correction trigger. The next step is to make this a clearer product surface.

### 2. Introduce first-class evaluation records

Add normalized records for:

- per-finding evaluation verdicts
- evidence-quality scores
- duplicate or supersession relationships
- adjudication notes
- validation recommendations

This should become queryable independently of raw findings.

### 3. Add deterministic evaluation checks alongside the agent

Do not make result evaluation prompt-only.

Some evaluation logic should be code-owned, for example:

- schema completeness checks
- missing-evidence detection
- unsupported severity escalation checks
- confidence-policy floor and ceiling rules
- duplicate-key heuristics

The agent should still synthesize and judge. The code should enforce consistency.

### 4. Expose evaluation outputs in the API

Likely routes:

- `/runs/:runId/evaluation`
- `/runs/:runId/finding-evaluations`
- `/runs/:runId/validation-candidates`

This creates a stable contract for downstream review tooling without forcing raw artifact parsing.

## Phase 3: Human Review Workflow

Goal:
Extend the now-implemented review workflow into a fuller operator and release-gating system.

Current baseline:

- persisted run-level review workflow states exist
- reviewer actions are append-only persisted records
- CLI and HTTP API can list review work and submit review actions

What remains is to turn that foundation into a broader operational workflow.

### 1. Expand review state and assignment semantics

The engine already represents:

- review required
- in review
- approved
- rejected
- requires rerun

The next step is to add stronger operational semantics for:

- reviewer assignment and handoff
- SLA or due-date metadata
- review scopes for findings versus whole-run approval
- rerun-request resolution

### 2. Expand reviewer input surfaces

The engine already supports human actions such as:

- suppress finding
- confirm finding
- downgrade severity
- request validation
- mark public-safe or internal-only

What remains is richer action modeling for:

- assignment or reassignment
- finding-level adjudication summaries
- reviewer rationale categories
- explicit approval conditions

### 3. Add run checkpoints for review-gated flows

Especially for:

- premium-comprehensive audits
- sensitive findings
- non-public-safe reports
- validation before publication

This still does not require a built-in UI, but it does require stronger engine-side lifecycle rules than the current post-run review-state tracking.

## Phase 4: Runtime and Validation Depth

Goal:
Deepen non-static AI-security coverage without compromising the bounded harness model.

### 1. Complete runtime validation path

Build out the currently partial runtime path into a stronger subsystem with:

- validation-runner behavior for cloned or local targets
- isolated container or microVM launch paths
- synthetic credentials and simulated external tool/service backends
- bounded AI-security scenarios rather than broad exploitation
- richer transcript and artifact capture
- better runtime-specific evidence normalization
- control mapping to OWASP LLM, MITRE ATLAS, NIST AI RMF, and Tethermark eval-pack controls

### 2. Complete Python worker integrations

The repo already has scaffolding for tools such as garak, Inspect, and PyRIT. The next product milestone is to make those integrations operational and documented.

### 3. Strengthen target-class-specific depth

Prioritize:

- tool-using multi-turn agents
- MCP servers and plugin/skill packages
- runnable local/repo applications in isolated validation mode
- hosted endpoints only in explicit, non-destructive, reduced-confidence mode

Those are the strongest product differentiators versus generic code scanning.

## Phase 5: Real Multi-Backend Service Operation

Goal:
Prepare the engine for shared internal use and future hosted deployment.

### 1. Keep OSS storage local and wire hosted storage outside OSS

The OSS runtime should expose only SQLite-backed `local` mode. Hosted production should import the shared engine contracts and provide its own Supabase/Postgres persistence adapter, migration story, and tenant-aware storage extensions.

### 2. Add async service lifecycle

The addendum points toward API-driven engine operation for downstream platforms and similar consumers.

That means adding or hardening:

- queued async run lifecycle
- webhook or callback support
- cancel or retry semantics
- stronger service authentication and tenancy assumptions

### 3. Add retention and cost controls for long-running service usage

This should cover:

- event and metric retention tuning
- artifact retention policy
- bundle export retention
- cost and token budget alerts

## Phase 6: Downstream Product Integration

Goal:
Make the engine easy to consume by downstream publishing and assurance workflows without collapsing product boundaries.

### 1. Downstream integration hardening

Focus on:

- stable summary routes
- stable finding and evidence contracts
- stable run-state semantics
- imported snapshot compatibility

### 2. Assurance workflow ingestion

Support downstream consumers that need:

- findings
- evidence references
- control mappings
- review metadata
- remediation references

without requiring them to understand harness internals.

## Explicit Non-Goals for Near-Term Roadmap

These should not be prioritized before the above phases:

- full operator dashboard inside this repo
- editorial CMS or publication UX
- jobs, community, or user accounts
- unconstrained autonomous patching
- leaderboard UI
- broad GRC workflow

## Recommended Build Order

1. Validation fixtures and quick-validation workflow
2. Result evaluation layer around supervisor outputs
3. Human review workflow expansion: assignment, checkpointing, and richer adjudication
4. Runtime validation depth and worker integrations
5. Hosted Supabase/Postgres adapter outside the OSS runtime
6. Async service lifecycle for external consumers

## Decision Notes

### On eval/tool selection

Do not split eval/tool selection into a separate major module yet.

Right now it is still appropriately a stage in orchestration. It becomes a real subsystem only if it starts owning substantial policy, eligibility enforcement, versioned pack management, and independent runtime behavior.

### On result evaluation

This is the better candidate for expansion.

The supervisor already acts as a review/evaluation stage. The roadmap should evolve that into a clearer evaluation layer rather than creating another thin module around tool selection.

### On human-in-the-loop

The codebase now has a real workflow state machine and reviewer action log. The next product question is not whether human review exists, but how far the engine should go into assignment, checkpointing, and release gating before a downstream UI takes over.

## Exit Criteria for the Next Milestone

The next milestone should be considered successful if:

- a new user can run one command against a bundled fixture and see expected results
- the harness can explain not only what findings it produced, but how strongly it trusts them
- review-required runs have explicit machine-readable review states
- downstream consumers can use normalized routes without reading raw artifacts
