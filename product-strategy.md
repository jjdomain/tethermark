# Product Strategy

## Purpose

This document defines how Tethermark should evolve as:

- a credible open-source, self-hostable audit engine
- a future hosted commercial platform for teams and companies

It is not a requirements spec. It is the product boundary and packaging strategy that sits on top of the current architecture, roadmap, and completed refactor work.

## Product Thesis

The right split is not "basic OSS" versus "useful paid."

The right split is:

- OSS: the real audit engine product, self-hostable and genuinely useful for internal teams
- Hosted: the managed collaboration, governance, and operations platform built around that engine

If the OSS version cannot run meaningful audits, review findings, and fit into an internal workflow, it will not build trust or adoption. The hosted product should differentiate on service operation, multi-user collaboration, enterprise identity, governance, analytics, and support, not by withholding the core audit capability.

## Strategic Position

The harness should remain:

- engine-first and headless-first
- consumable by CLI, API, MCP, CI, and future UI
- self-hostable for internal use
- strict about separating engine responsibilities from broader platform responsibilities
- focused on repository and local-path AI-security audits, with runtime validation performed in isolated cloned/local environments rather than against production systems

The existing architecture docs already point in this direction: the engine owns orchestration, evidence, findings, scoring, remediation, async jobs, and machine-readable review state, while broader operator UX, account systems, and business workflow should sit above a stable service contract when needed.

## Target And Runtime Scope

Tethermark should not compete as a generic cybersecurity scanner or autonomous production pentest platform. Its runtime story should stay AI-security specific and control-driven.

Primary supported targets:

- open-source AI, agent, MCP, plugin, and tool-using repositories
- private repositories or local clones that the operator is authorized to audit
- local filesystem paths used by internal teams, CI, or self-hosted review flows

Endpoint URLs can remain part of the target model for context, source attribution, and carefully bounded reduced-confidence checks. They should not be the default runtime path or a core OSS product promise.

Runtime validation should mean:

- clone or mirror the target into an isolated local, container, or microVM environment
- build and launch the target with controlled configuration
- inject fake secrets, fake users, and simulated tool/service backends
- run AI-security eval packs for prompt injection, tool misuse, MCP boundary failures, memory leakage, cross-session isolation, unsafe delegated actions, and retrieval/data exfiltration
- capture transcripts, tool calls, HTTP traces, file changes, and policy violations as evidence
- map results to established controls and Tethermark executable eval-pack controls

Runtime validation should not mean broad production exploitation, destructive endpoint probing, payment/email/OAuth mutation testing, or autonomous black-box pentesting.

## Product Line Split

### OSS / Self-Hosted Product

The open-source repo should include the full core audit system:

- CLI, HTTP API, and MCP surfaces
- staged orchestrator and audit packages
- persistence-backed queries and artifact/debug exports
- async jobs, retries, cancellation, and generic automation webhooks
- human review workflow and reviewer action history
- validation fixtures and quick validation workflows
- maintenance and persistence validation commands
- preflight or audit-planning capability
- extensibility for tools, providers, prompts, and policy packs

The OSS version should be strong enough for:

- internal security teams running audits on their own infrastructure
- CI-based validation and recurring scans
- internal review of findings and remediation
- downstream integration into local workflows via API or CLI
- public audit case studies against open-source AI/agent repositories

### Hosted / Paid Product

The commercial product should be the managed platform around the engine:

- hosted multi-tenant control plane
- multi-user collaboration
- organization, workspace, and project administration
- enterprise auth and identity management
- richer reviewer assignment and approval workflows
- historical dashboards, portfolio views, and analytics
- scheduling, project/event notification routing, escalations, and integrations
- managed infrastructure, upgrades, backups, and support

The hosted product should feel like "the operated security platform," not "the only way to use the engine."

## Recommended Feature Matrix

### Keep In OSS

These should remain in the public repo because they are part of the engine's real utility:

- audit execution and orchestration
- stable API and CLI surfaces
- async jobs and polling
- persistence and query APIs
- artifact exports
- human review state and actions
- validation fixtures
- quick validation command
- maintenance commands
- preflight or audit-planning module
- basic auth modes for self-hosting
- a mandatory self-hostable web UI

For OSS, "basic auth modes" should mean practical self-hosting, not immediate enterprise identity. A good baseline is:

- `none` for local and trusted internal use
- `api_key` for automation and simple enforced API access

In `none` mode, review roles, assignment, and approval are still useful for workflow discipline and audit history, but they should be described as trusted-environment governance rather than strong identity enforcement.

### Strong Hosted Differentiators

These are good paid-platform features because they are primarily operational, collaborative, or enterprise-focused:

- managed SaaS hosting
- multi-tenant organization and workspace administration
- SSO, SAML, OIDC, SCIM, and enterprise identity sync
- granular RBAC and audit logs across users and workspaces
- reviewer assignment, escalation, and SLA workflows
- comments, annotations, and collaborative triage
- project/event notifications, digesting, and external workflow integrations
- dashboards, trends, portfolio views, and usage analytics
- billing, quotas, support, backups, and operational SLAs
- managed secrets, credential brokering, and hosted connector setup

### Features That Can Exist In Both

Some features should exist in both products, with broader capability in hosted:

- web UI
- preflight or audit planning
- scheduling
- policy packs
- review workflows
- exports and reporting
- integrations

The OSS version should provide a capable baseline. The hosted version should add scale, collaboration, governance, and convenience.

Notification boundary:

- OSS keeps simple generic webhooks for automation hooks and completion callbacks.
- Hosted owns project/event notification infrastructure such as Slack, email, digests, notification preferences, escalation routing, and delivery workers.

## External Integration Policy

External collaboration and source-control integrations should be treated as optional adapters, not as the system of record for review workflow state.

That matters especially for GitHub because the harness is meant to audit:

- self-owned OSS repositories
- third-party OSS repositories
- local clones without upstream write access
- non-GitHub local applications and repository mirrors

The core review model should therefore remain engine-native:

- reviewer assignment
- reviewer comments
- review actions
- adjudication state
- audit trail and export history

GitHub should sit on top of that as an optional projection layer for users who want it.

### Recommended GitHub Boundary

GitHub integration should be able to:

- attach repository, commit, branch, or PR metadata to runs when available
- post audit summaries to pull requests or issues
- create or update issues for selected confirmed findings
- mirror assignment metadata to GitHub usernames when users choose to configure that mapping
- expose review status through labels, checks, or comments when users opt in

GitHub integration should not:

- be required for using the human review workflow
- become the canonical store for reviewer assignment or comments
- assume every audited target has a writable GitHub destination
- automatically post to third-party repositories by default

### Default Behavior

The safe default for OSS and hosted should be:

- all external posting disabled by default
- all outbound integrations explicitly configured
- all posting actions opt-in at the workspace, project, or per-run level
- dry-run or preview mode available before any outbound write

This is important because many users will audit repositories they do not control, or may want to review findings privately before publishing anything externally.

### Configuration Guidance

GitHub and similar integrations should be configurable with explicit scopes such as:

- `disabled`
- `manual`
- `project_opt_in`
- `workspace_default`

Recommended controls:

- whether external posting is enabled at all
- which events can be posted externally
- whether posting is allowed only for owned repositories
- whether reviewer assignment may be mirrored outward
- whether issue creation is allowed
- whether PR comments, issue comments, labels, or checks are used
- whether a per-run approval is required before external posting

The product should prefer "prepare outbound payloads and wait for approval" over "post automatically" unless the operator has deliberately configured automation for that project.

## Web UI Strategy

A web UI should be treated as mandatory for the OSS product, not optional and not paid-only.

The OSS repo should include a self-hostable interface for:

- launching runs
- viewing status
- browsing findings
- browsing artifacts
- using the review workflow
- viewing preflight and audit-path metadata
- configuring providers, policies, test modes, and audit defaults

The hosted UI should expand beyond that with:

- multi-user presence and collaboration
- organization and project administration
- reviewer assignment and escalation
- portfolio dashboards
- policy and identity administration
- integration management
- notification routing and delivery visibility

This preserves the engine's credibility while still leaving strong commercial differentiation.

## Configuration Strategy

Both self-hosted and hosted products should expose a real configuration surface. Without that, the UI is only a run launcher and not an operating interface.

The underlying settings model should be shared even if hosted adds more governance around it.

Recommended configuration scopes:

- global settings
- workspace settings
- project settings
- per-run overrides

### OSS Configuration Surface

The OSS web UI should include settings pages for:

- `Providers`: provider selection, default models, agent-specific overrides, mock versus live mode, and local API endpoint wiring
- `Credentials`: API key entry or secret-reference configuration appropriate for self-hosted deployments
- `Audit Defaults`: package, depth, runtime policy, timeout, budget, retry, and webhook defaults
- `Governance`: a peer settings page with tabs for launch/readiness gates, executable policy packs, and reference documents
- `Test Mode`: deterministic validation presets, fixture-validation presets, mock-planner modes, and safe local testing toggles
- `Integrations`: local webhook endpoints, optional OIDC settings, manual outbound connector controls, and local connector configuration where supported

These settings should map to structured engine configuration objects, not ad hoc UI-only form state.

In OSS mode, the Governance tabs are intentionally engine-local: `Gates` covers launch-readiness policy, human-review thresholds, publishability defaults, internal-only defaults, severity gates, and disposition renewal rules; `Policy Packs` covers executable audit/control policy packs, local defaults, custom pack attachments, and lightweight control mappings; `Reference Documents` covers attached policy documents, internal standards, runbooks, exception references, and reviewer context. In hosted or integrated deployments, the same page should expose effective values and provenance when policies, gates, or reference materials are inherited from an organization, workspace, project, or assurance control plane.

### Hosted Configuration Extensions

The hosted product should extend the same model with platform controls such as:

- org-wide provider management and secret brokering
- workspace and project policy inheritance
- approval workflows for changing models, policies, or runtime allowances
- managed governance gates with inheritance, lock state, source attribution, and audit history
- managed policy-pack catalogs with versioning, approval, usage references, and exportable execution snapshots
- reference-document governance for approved audit context, exception references, and runbook provenance
- role-based configuration permissions
- usage quotas, budgets, and cost controls
- shared templates and organization defaults
- configuration history and audit logs
- managed external integrations and connector health
- project/event notification routing, Slack/email destinations, digest policies, and escalation rules

### Test Mode Guidance

Test mode should exist in both OSS and hosted, but it should be exposed as controlled presets rather than arbitrary prompt surgery.

Good examples:

- mock provider mode
- deterministic planning mode
- static-only validation preset
- fixture-validation preset
- reduced-cost planning preset

That keeps the system testable without turning the settings page into an unsafe free-form prompt editor for core audit behavior.

## Preflight / Audit Planning Strategy

Preflight should be part of the OSS engine, not a paid-only feature.

It materially improves:

- audit quality
- runtime safety for isolated validation environments
- cost predictability
- explainability
- public credibility for partial-depth audits

The preflight addendum is directionally right: preflight should decide how the audit runs, what scope is included, what risks or blockers exist, and whether the path should be skip, defer, static-only, targeted runtime, or full audit.

For runtime, preflight should prefer static-only or isolated runtime validation unless the operator has explicitly supplied a non-production endpoint and an allowlist for safe behavioral probes. Production endpoint testing should remain outside the default OSS flow.

Recommended OSS scope for preflight:

- repository fingerprinting
- complexity classification
- execution-surface detection
- scope planning
- isolation recommendation
- synthetic credential and fake-service requirements for runtime validation
- tool and audit-path recommendation
- blocker and readiness detection
- machine-readable preflight outputs

Recommended hosted extensions:

- collaborative intake and planning UX
- saved planning templates
- policy-driven defaults by org or workspace
- approval gates before expensive runs
- richer cost estimates and scheduling controls

## Auth And Tenancy Strategy

The repo should be designed now for a shared identity and scope model, even if OSS defaults to a simple local deployment shape.

Recommended shared concepts:

- organization
- workspace
- project
- user
- role binding
- run
- async job
- review workflow
- review action

### OSS Auth Model

The OSS repo should support practical self-hosting modes such as:

- `none` for local-only usage
- API keys for simple internal service access
- optional OIDC for teams that want internal SSO

The OSS default can be effectively single-tenant, but the internal data model should not assume that forever.

### Hosted Auth Model

The hosted product should implement full tenant-aware identity and governance:

- organizations and workspaces
- per-project scoping
- user and group management
- tenant-scoped filtering and mutation authorization
- strong action attribution
- enterprise SSO and role management

### Boundary Decision

Auth, profiles, and broader admin UI do not need to be built deeply into the engine repo just because the hosted platform will need them.

The admin/auth addendum is useful here: it reinforces that a broader app or platform can own user accounts, private operator UX, and business workflow while consuming the engine over a stable API and async job contract. The harness should support that model without collapsing into a monolithic app.

## What The Engine Should Own

The harness should continue to own:

- target preparation
- preflight and audit planning
- orchestration and phase execution
- threat modeling
- tool and lane selection
- evidence collection
- finding normalization
- scoring and remediation
- async job lifecycle
- review-state contracts
- persistence and query APIs
- artifact packaging and debug access

These are engine responsibilities and belong in the OSS repo.

## What The Broader Platform Should Own

A broader hosted platform or companion app should own:

- user accounts and profile management
- org and workspace admin
- rich reviewer assignment UX
- project/event notifications and collaboration workflows
- editorial, publication, or external publishing workflows
- billing and subscription management
- broader product analytics
- customer success and support surfaces

Those concerns can consume the engine without redefining it.

## Suggested Near-Term Build Order

If the goal is to support both OSS and future hosted productization cleanly, the next strategic order is:

1. add tenant-aware auth abstractions to the API layer without overfitting to one hosted deployment
2. add the mandatory self-hostable web UI for runs, findings, preflight, jobs, review state, and settings
3. expand preflight into a first-class persisted and queryable planning phase
4. deepen review operations with assignment and approvals
5. add richer hosted-only layers for SSO, collaboration, org admin, analytics, and configuration governance

## Product Anti-Patterns To Avoid

- Do not cripple the OSS engine to force hosted adoption.
- Do not put all auth, admin, and business workflow inside the engine repo.
- Do not make preflight a premium-only feature if audit quality depends on it.
- Do not reserve the only usable UI for paid users if OSS adoption is a goal.
- Do not let hosted-only concerns distort the engine's stable service boundary.

## Decision Summary

The recommended strategy is:

- keep one strong open-source engine repo
- make it self-hostable and useful for internal teams
- require a self-hostable UI and practical auth modes in OSS
- treat preflight as a core engine capability
- include real settings and configuration surfaces in both OSS and hosted products
- keep generic automation webhooks in OSS while reserving full notification infrastructure for hosted
- build hosted differentiation around collaboration, governance, enterprise identity, analytics, and managed operations

That creates a healthier product line than "open core by deprivation," and it aligns with the current architecture direction of the harness.
