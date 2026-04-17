# Audit Engine Addendum — Repo Boundary, Headless Scope, and Downstream Service Contract

Version: v1.0  
Status: Addendum / override document for Codex ingestion  
Applies to: `AI_Security_Audit_Engine_Requirements_v1_v2_v3.md`

---

## 1. Purpose

This addendum isolates the requirements that must govern:
- repo boundary between the Audit Engine and downstream consumers
- headless product scope
- service contract expected by downstream consumers
- UI/non-UI decisions
- storage and deployment assumptions relevant to integration

This file exists to prevent Codex from accidentally implementing downstream application features inside the Audit Engine repo.

---

## 2. Precedence rule

If this addendum conflicts with the main Audit Engine requirements document, **this addendum wins** for all topics listed below:
- product boundary
- ownership split with downstream consumers
- UI scope
- API contract for downstream consumers
- storage abstraction language

---

## 3. Core architecture decision

The Audit Engine is a **separate, reusable, headless service**.

It must remain suitable for future use as:
- a standalone internal service
- a standalone commercial developer/security product
- an open-source project
- a self-hosted toolchain component

Downstream platforms are consumers of the Audit Engine, not its canonical shell.

---

## 4. The Audit Engine does not own the operator UI

This is the most important rule in this addendum.

### 4.1 Non-ownership rule

The Audit Engine does **not** own:
- downstream ops/admin UI
- user login
- profiles
- downstream application RBAC
- editorial review UI
- publication workflow UI
- jobs/careers user workflows
- public website rendering
- content management for case files or articles

These belong to downstream consumer applications.

### 4.2 Allowed minimal UI

The Audit Engine may optionally expose only minimal developer-facing surfaces such as:
- API documentation
- health/status endpoint output
- simple debug page for local development

It must **not** ship a full operator console that duplicates downstream admin workflows.

---

## 5. What the Audit Engine owns

The Audit Engine remains responsible for:
- target intake schema
- target classification
- static and runtime inspection orchestration
- threat-model generation
- scanner/eval adapter orchestration
- validation/reproduction workflows
- finding normalization
- score bundle generation
- evidence/artifact packaging
- remediation summary generation
- export surfaces such as CLI/API/MCP/GitHub Action

---

## 6. Downstream integration model

Downstream platforms consume the Audit Engine as a service.

### 6.1 Preferred interaction pattern

Preferred production pattern:
1. A downstream platform submits a run request to the Audit Engine API.
2. The Audit Engine executes asynchronously.
3. The downstream platform polls run state and/or receives webhook updates.
4. The downstream platform imports selected outputs for editorial and admin workflows.

### 6.2 Integration surfaces supported by the engine

The Audit Engine may be invoked via:
- CLI
- HTTP API
- queued worker wrapper
- MCP server
- GitHub Action

For downstream production integration, the preferred default is:
- **HTTP API + async run lifecycle**

---

## 7. Required service contract for downstream consumers

The Audit Engine must expose a stable integration contract for downstream consumers.

### 7.1 Minimum HTTP API

Required endpoints:
- `POST /runs`
- `GET /runs/:id`
- `GET /runs/:id/findings`
- `GET /runs/:id/artifacts`
- `GET /runs/:id/summary`

Optional but recommended:
- webhook callback on completion/failure
- `POST /threat-models/generate`
- `POST /validate`

### 7.2 Run lifecycle

Minimum run states:
- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`

### 7.3 Stable identifiers

The Audit Engine must provide:
- stable `engine_run_id`
- stable target identifier handling
- stable artifact references/URIs
- deterministic finding identifiers where practical

### 7.4 Minimum response payloads expected by downstream consumers

For each run, downstream consumers must be able to retrieve:
- run id
- target descriptor
- run status
- timestamps
- normalized findings
- evidence/artifact manifest
- score dimension bundle
- threat-model artifact reference
- remediation summary
- run summary metadata

---

## 8. Data ownership rule

The Audit Engine remains the canonical source of truth for:
- orchestration state
- target classification details
- threat-model generation logic
- scanner/eval execution details
- validation details
- normalized finding schema logic
- scoring logic

Downstream consumers may persist imported snapshots or references, but must not become the source of truth for engine internals.

---

## 9. Storage rule

The main engine spec should be interpreted as using an **S3-compatible artifact storage abstraction**, not a hard requirement for MinIO.

### 9.1 Accepted storage language

Use this wording:
- The Audit Engine stores artifacts through an S3-compatible abstraction layer.
- Supabase Storage is an acceptable backing store for compatible deployments.
- MinIO or another S3-compatible store may be used in other deployments.

### 9.2 Practical rule

Codex must not hard-code MinIO into the engine as the only supported artifact backend.

---

## 10. Security expectations for the engine as a service

Minimum requirements:
- authenticated service-to-service access where exposed beyond localhost
- signed or authenticated webhook callbacks if webhooks are used
- no plaintext secret exposure in API responses
- artifact references must respect internal/private handling
- run creation must validate input schema
- engine logs must avoid leaking sensitive secrets

---

## 11. Packaging guidance for Codex

Codex should organize the Audit Engine repo around headless service concerns only.

### 11.1 In-scope packages/modules

Examples:
- `api-server`
- `worker`
- `core`
- `adapters`
- `validators`
- `threat-model`
- `exporters`
- `schemas`

### 11.2 Out-of-scope packages/modules

Do not add packages for:
- full admin dashboard
- user accounts
- member profiles
- jobs UI
- editorial CMS UI
- article publishing UI

---

## 12. Explicit override statements for Codex

Codex should assume all of the following are true:
- the Audit Engine is headless-first
- the real operator/admin UI lives in a downstream platform
- downstream platforms are external consumers of the engine
- the engine must expose a stable service contract for downstream consumers
- storage should remain portable via S3-compatible abstraction
- the engine should remain portable for future standalone/open-source distribution

---

## 13. MVP clarification

For MVP, the Audit Engine may include:
- CLI
- HTTP API
- worker process
- artifact storage integration
- minimal health/docs surface

For MVP, the Audit Engine should **not** include:
- full browser-based operator console
- public website shell
- user account system
- editorial workflow UI
