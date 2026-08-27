# Community Edition And Hosted Boundary

This document is the canonical product and repository boundary between Tethermark Community Edition (CE) and a future hosted Tethermark service.

## Governing Principle

The governed audit core is a Community Edition capability. Hosted Tethermark may operate, scale, and extend that core, but it must not become the only place where meaningful audits, review, policy enforcement, governed learning, local scheduling, persistence, or exports work.

Hosted extensions live outside this repository. They may impose stricter tenant or operational controls, but they must not silently weaken the shared core's evidence, provider, approval, learning, runtime-isolation, or export invariants.

## Capability Ownership

| Capability | Community Edition and shared core | Hosted extension outside this repository |
|---|---|---|
| Audit execution | Complete staged static and isolated-runtime audit engine, controls, evidence, findings, scoring, remediation, and exports | Operates the same governed engine across managed workers and service workloads |
| Operator surfaces | CLI, HTTP API, MCP bridge, and self-hosted web UI | Managed service UI/API, account administration, and service orchestration |
| Persistence | Release-supported local SQLite, normalized contracts, backups, restore, retention, and migration/export tooling | Tenant-isolated Postgres/object storage, managed backup/restore, retention policy, and regional operations |
| Identity | Trusted-local `none` mode and shared API-key authentication for self-hosting | SSO/OIDC/SAML/SCIM, organization membership, granular RBAC, service identities, and identity lifecycle |
| Policy | Local versioned system policies and project/target/run governance | Tenant policy distribution, organization defaults, delegated administration, and fleet enforcement |
| Jobs and scheduling | Durable local jobs plus in-process local maintenance and governed-learning schedules | Highly available managed scheduling, distributed queues, worker fleets, retry orchestration, and service-level concurrency controls |
| Review and learning | Human review, immutable approvals, governed candidates, dry-run experiments, additive-only overlays, rollback, and local observability | Cross-project review queues, tenant approval policy, managed scheduling, portfolio aggregation, and fleet-level analytics |
| Integrations | Generic outbound webhooks, SARIF, exports, and manual external issue/PR links | Managed GitHub/Jira/Slack/email connectors, signed inbound webhooks, delivery workers, notification preferences, and escalation |
| Runtime infrastructure | Operator-owned Docker/Podman/gVisor-compatible local sandbox execution | Metered third-party sandbox providers, managed templates, quotas, cleanup reconciliation, and infrastructure support |
| Credentials and operations | Operator-owned credentials, local diagnostics, upgrades, and recovery | Managed secret brokering, rotation, billing, quotas, audit operations, uptime monitoring, and support SLAs |

The presence of shared Postgres contracts, schema bootstrap code, or compatibility adapters in CE does not make a hosted control plane part of the CE release. The supported CE production persistence claim remains local SQLite until the release tracker explicitly changes it.

## Shared Invariants

Both editions must preserve these core rules:

- unavailable, failed, incomplete, or unsupported evidence cannot become a pass;
- runtime claims require runtime evidence from an authorized isolated backend;
- provider, credential, workload, model, and budget policy is resolved before model work;
- permissive policy changes and sensitive learning effects require immutable human approval;
- learning inputs remain allowlisted review signals and audit metadata, never a provider-output corpus;
- promoted learning effects remain explainable, content-versioned, bounded, and reversible;
- normalized records and exports retain provenance, scope, and non-secret policy decisions;
- hosted tenancy must be established before invoking the shared core and enforced again by hosted persistence and service layers.

Hosted code may add stricter tenant policy, quotas, retention, regional restrictions, or approval requirements. It may not relabel a core failure as success, manufacture missing evidence, reuse local ChatGPT-session credentials for unattended work, or bypass a human-approval boundary.

## Scheduling Clarification

CE scheduling means a single operator-managed process can run local retention, maintenance, event-driven learning, and explicitly enabled learning schedules. The operator owns uptime, credentials, resource limits, recovery, and the consequences of stopping that process.

Hosted managed scheduling means a service owns durable distributed dispatch, tenant isolation, fleet capacity, quotas, high availability, notification delivery, orphan reconciliation, and operational support. Those service concerns are not implemented or claimed by this repository.

## Repository Rule

Changes required for an audit to run correctly, produce evidence, enforce controls, support human review, or keep governed learning safe belong in the shared Community Edition core. Changes whose primary purpose is multi-tenant service operation, enterprise identity, fleet aggregation, billing, managed connectors, or SaaS reliability belong in the hosted implementation.

When a hosted feature depends on a new shared contract, the neutral contract and fail-closed core behavior may be added here. Tenant credentials, hosted infrastructure configuration, billing logic, customer data, and hosted-only operational code must not be added to this repository.
