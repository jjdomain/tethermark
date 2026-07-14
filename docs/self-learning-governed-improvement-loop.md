# Self-Learning Governed Improvement Loop

This document records the implementation plan and product boundary for Tethermark's self-learning module.

## V1 Goal

V1 implements self-learning as a governed improvement loop:

- extract immutable learning signals from review actions, finding dispositions, finding quality, runtime follow-ups, remediation state, duplicate/conflict detection, and assistant-confirmed actions
- generate typed learning candidates from those signals
- run dry-run experiments that measure expected impact and regression risk
- require explicit reviewer promotion before any candidate is treated as approved configuration
- keep every event, candidate, experiment, promotion, rejection, and rollback queryable and exportable

V1 is intentionally advisory. It helps reviewers notice recurring patterns and approve improvements, but it does not silently change audit execution.

## V1 Non-Goals

V1 must not:

- change prompt-registry prompts automatically
- inject hidden assistant memory into future audit prompts
- add suppressions or waivers without approval
- downgrade severity, confidence, or visibility automatically
- close findings based on external issue state or remediation metadata
- remove runtime probes or reduce evidence collection
- mutate policy packs, control mappings, or evidence thresholds during a live run
- run scheduled background tuning jobs that deploy changes without review

The implementation stores promoted candidates as auditable learning overlays. Core audit execution does not consume those overlays until a later, explicit implementation chooses to do so.

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

## V1 Data Model

V1 persists six record families/settings surfaces:

- `learning_events`: immutable signals from existing persisted workflow records
- `learning_candidates`: proposed improvements with scope, rationale, source events, expected effect, risk, and approval requirement
- `learning_experiments`: dry-run replay records with baseline/candidate metrics and regression notes
- `learning_promotions`: approved overlays with reviewer, scope, version, expiry, rollback pointer, and status
- `learning_jobs`: self-learning pipeline runs, including trigger, status, synced event count, generated candidate count, synthesis count, skipped synthesis count, settings snapshot, metadata, and error state
- `ui_settings.learning_json`: self-learning trigger, frequency, threshold, LLM synthesis, budget, and promotion guardrail configuration

OSS supports local SQLite persistence and `run`, `target`, and `project` scopes. SQLite stores these as logical tables in `records` and stores the field manifest in `record_schemas`. OSS also ships a Postgres/Supabase bootstrap migration command that uses the exported `SELF_LEARNING_POSTGRES_DDL` manifest from the core engine. Hosted can later add organization scope, scheduled workers, RBAC workflows, portfolio analytics, and tenant-level controls.

## Public API

V1 exposes:

- `GET /learning/events`
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

## Historical Implementation Plan

The original v1 plan was:

- add a core learning subsystem for events, candidates, experiments, and promotions
- generate candidates from repeated false positives/out-of-scope outcomes, evidence gaps, runtime rerun outcomes, duplicate/conflict signals, and cited assistant-confirmed actions
- promote only by explicit human approval
- expose query APIs and export schemas
- add a Learning UI and run-detail links
- document v1/v2 boundaries and the invariant that automatic behavior may become more careful but not more permissive
