# Self-Learning Governed Improvement Loop

This document records the implementation plan and product boundary for Tethermark's self-learning module.

## V1 Goal

V1 implements self-learning as a governed improvement loop:

- extract immutable learning signals from review actions, finding dispositions, finding quality, runtime follow-ups, remediation state, duplicate/conflict detection, and assistant-confirmed actions
- generate typed learning candidates from those signals
- run dry-run experiments that measure expected impact and regression risk
- require explicit reviewer promotion before any candidate is treated as approved configuration
- keep every event, candidate, experiment, promotion, rejection, and rollback queryable and exportable

Candidate generation and dry-run experiments are advisory. A promoted overlay can affect future audits only through the bounded consumption contract below; it never mutates the audit that produced its source signals.

The module is disabled by default. Enabling it records an explicit, versioned operator consent. Candidate generation and LLM synthesis are separate controls; synthesis and source excerpts are both off by default.

## V1 Non-Goals

V1 must not:

- mutate prompt-registry prompt definitions automatically
- inject hidden assistant memory into future audit prompts
- add suppressions or waivers without approval
- downgrade severity, confidence, or visibility automatically
- close findings based on external issue state or remediation metadata
- remove runtime probes or reduce evidence collection
- mutate policy packs, control mappings, or evidence thresholds during a live run
- run scheduled background tuning jobs that deploy changes without review

## Approved Overlay Consumption

Each future run resolves active promotions for its workspace, project, target, and run scope. The resolver accepts only unexpired promotions with an explicit human approval record and a corresponding reviewed candidate. It writes the exact `learning-overlay-resolution.v1` content version into the run-version manifest and persists the full resolution as a normalized stage artifact. A resolution-version change invalidates planner, threat-model, and evidence-selection reuse.

Consumption is additive-only:

- evidence-requirement adjustments add validation requirements
- eval-fixture and runtime-follow-up candidates add validation candidates
- prompt-improvement and duplicate-grouping candidates are bounded advisory context
- suppression and severity-calibration promotions remain recorded but have no direct runtime effect; an executable permissive change must use the existing governed system-policy or finding-disposition records

Overlay titles, summaries, and signatures are passed to model contexts as untrusted reviewed data with an explicit instruction boundary. They cannot remove controls or evidence, suppress findings, lower severity, remove runtime probes, or weaken publication/review gates.

The overlay-aware prompt/context contract is versioned as `2026-08-26.agent-context.v3`; the run manifest records that version alongside the resolved overlay version.

Promotion artifacts use a content-derived `learning-overlay.v1.<hash>` version and retain an explicit rollback pointer. Rollback deactivates the promotion; the next run resolves a different version and no longer applies its additive effect. Completed runs retain their immutable resolution snapshot for replay and audit.

## V2 Boundary

A future v2 may add bounded autopromotion only for low-risk, reversible behavior, such as:

- candidate prioritization
- duplicate grouping hints
- ranking and queue ordering
- requesting extra evidence
- suggesting additional validation or fixture coverage

V2 autopromotion must still include scope limits, confidence thresholds, dry-run replay, expiry, rollback, and audit logs.

The harness may automatically become more careful. It must not automatically become more permissive.

## Forever Human-Approved

These categories should always require explicit approval:

- suppressions and waivers
- accepted-risk records
- severity downgrades
- policy/control changes
- publishing/export visibility changes
- runtime probe removal
- prompt changes that reduce scrutiny
- anything that can reduce evidence collection, hide findings, or weaken reviewer gates

This boundary is executable, not advisory. Approval records use the versioned `2026-08-26.human-approval.v1` contract and a content checksum. Policy-pack suppression and waiver rules are rejected without a matching approval; persisted dispositions retain the current approval plus prior approval history; severity downgrades and runtime-validation acceptance are written to the append-only review-action log; and policy publish, rollback, default, and binding events retain their approval evidence. Interactive UI/API launches record the authenticated operator, and interactive local CLI launches record the local operator identity, when they request control, package, evidence-lane, or runtime-probe reduction. Unattended, learning, model, automation, anonymous, and arbitrary `system` actors cannot create those approvals. The only system exception is bootstrap of an exact built-in safe policy.

## V1 Data Model

V1 persists six record families/settings surfaces:

- `learning_events`: immutable signals from existing persisted workflow records
- `learning_candidates`: proposed improvements with scope, rationale, source events, expected effect, risk, and approval requirement
- `learning_experiments`: dry-run replay records with baseline/candidate metrics and regression notes
- `learning_promotions`: approved overlays with reviewer, scope, content-derived version, expiry, rollback pointer, effect mode, and status
- `learning_jobs`: self-learning pipeline runs, including trigger, status, synced event count, generated candidate count, synthesis count, skipped synthesis count, settings snapshot, metadata, and error state
- `ui_settings.learning_json`: self-learning trigger, frequency, threshold, LLM synthesis, budget, and promotion guardrail configuration

Community Edition supports local SQLite persistence and `run`, `target`, and `project` scopes. SQLite stores these as logical tables in `records` and stores the field manifest in `record_schemas`. Community Edition also ships a Postgres/Supabase bootstrap migration command that uses the exported `SELF_LEARNING_POSTGRES_DDL` manifest from the core engine. Tethermark Cloud can later add organization scope, scheduled workers, RBAC workflows, portfolio analytics, and tenant-level controls.

## Public API

V1 exposes:

- `GET /learning/events`
- `POST /learning/run` (explicit operator action; optional `run_id`)
- `GET /learning/candidates`
- `GET /learning/candidates/:id`
- `POST /learning/candidates/:id/experiment`
- `POST /learning/candidates/:id/promote`
- `POST /learning/candidates/:id/reject`
- `GET /learning/promotions`
- `POST /learning/promotions/:id/rollback`
- `GET /learning/jobs`
- `GET /runs/:runId/learning`

Promotion, rejection, and rollback require reviewer-level governance permission. Experiments are dry-run records and do not mutate audit behavior.

All `GET` routes are read-only. UI load, refresh, and run-detail navigation never sync events, generate candidates, or call a model. `POST /learning/run` creates a checksum-verified `learning_model_synthesis` operator record bound to the exact workspace, project, and optional run; merely passing the internal `api` trigger is not proof of operator intent. Scheduled and event-driven execution must be explicitly enabled and is classified as `unattended_local`: it cannot use the local Codex/ChatGPT-session credential, and can synthesize only when `provider-policy.v1` approves an actually configured API-key provider (or deterministic mock). The non-secret authorization and provider-policy decision is retained in learning-job and synthesis metadata. The daily synthesis budget reserves attempts before provider execution and serializes same-scope work in the Community Edition process.

## Historical Implementation Plan

The original v1 plan was:

- add a core learning subsystem for events, candidates, experiments, and promotions
- generate candidates from repeated false positives/out-of-scope outcomes, evidence gaps, runtime rerun outcomes, duplicate/conflict signals, and cited assistant-confirmed actions
- promote only by explicit human approval
- expose query APIs and export schemas
- add a Learning UI and run-detail links
- document v1/v2 boundaries and the invariant that automatic behavior may become more careful but not more permissive
