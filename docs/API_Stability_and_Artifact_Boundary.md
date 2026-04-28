# API Stability and Artifact Boundary

## Purpose

This document defines the intended long-term contract between the normalized persistence-backed query APIs and the raw artifact/debug APIs.

The split exists so downstream automation, dashboards, and integrations can depend on stable query surfaces without inheriting the churn of internal run artifacts.

## Stable Query APIs

The normalized query APIs are the supported integration surface.

These routes are intended to stay stable in semantics even if runtime implementation details, artifact file names, or artifact payload shapes change:

- `/runs`
- `/runs/:runId/*` persisted run subresources
- `/targets`
- `/targets/:targetId/*`
- `/stats`

Contract expectations:

- Responses are backed by normalized persisted records.
- Field names and resource semantics should evolve conservatively.
- New fields may be added, but existing meanings should not drift without an explicit migration note.
- Consumers should use these routes for filtering, dashboards, history analysis, and machine-to-machine integrations.
- If raw artifact layouts change, these routes should continue to present the same logical records after backfill or reconstruction when feasible.

## Raw Artifact APIs

The raw artifact APIs are archival and debug surfaces, not the primary integration contract.

These routes currently include:

- `/artifacts/runs/:runId`
- `/artifacts/runs/:runId/:artifactType`

Contract expectations:

- These routes expose best-effort access to recorded run artifacts.
- Artifact payload shape may track internal runtime objects more closely than the normalized query layer.
- Artifact file names, internal JSON structure, and exact archival coverage may change as orchestration evolves.
- Consumers should use these routes for audit debugging, trace inspection, forensic review, and manual investigation.
- New artifact types may appear without any guarantee that they become first-class persisted tables.

## Artifact Policy

Every artifact type is classified by policy:

- `queryable_persisted`: the artifact mirrors data that also has a normalized persisted reader or query surface
- `artifact_only`: the artifact is retained primarily for archival, trace, or debug inspection

The artifact manifest should be treated as the source of truth for whether a given artifact is integration-grade query data or best-effort archival output.

## Consumer Guidance

Use normalized query APIs when you need:

- stable automation inputs
- historical comparisons
- filtering and aggregation
- contract-oriented programmatic access

Use raw artifact APIs when you need:

- the original recorded debug payload
- stage-local traces or handoff context
- forensic inspection of a specific run
- best-effort access to archival-only outputs

Consumers should not parse raw artifact payloads when an equivalent normalized route exists.

## Compatibility Rules

The intended compatibility model is:

1. Prefer preserving normalized query-route semantics across refactors.
2. Allow artifact payloads to evolve when they are debug-oriented and not part of the normalized contract.
3. Promote an artifact to normalized persistence only when it becomes operationally important for reruns, querying, or stable integrations.
4. Use changelog entries to call out any material query-contract changes or any artifact-policy reclassification.

## Current Interpretation

In the current refactor state:

- the local SQLite persistence layer is the primary query source for run and target APIs
- selective rerun inputs that matter operationally are persisted as structured stage artifacts or normalized records
- supervisor review and remediation are no longer artifact-only
- trace-style payloads, handoffs, and similar debug objects remain archival unless promoted later
