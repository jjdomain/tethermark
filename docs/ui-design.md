# Web UI Design Direction

## Goal

Make the web UI feel like an operator console instead of a long settings document. The landing page should answer:

- What needs attention now?
- What should I do next?
- Where do I go to do focused work?

The current UI exposes too many same-weight cards and too much inline detail on the dashboard. That makes the product feel cluttered even when the underlying workflows are strong.

## Reference Patterns

The redesign direction borrows from current security and workflow products:

- Semgrep dashboard: overview first, drill-down second.
- GitHub security overview: separate overview from detailed work surfaces.
- Linear triage: inbox-style queue handling with a focused detail area.
- Sentry issue detail: strong hierarchy with primary context first.
- Snyk/Grafana navigation: clear page responsibilities and cleaner information architecture.

## Proposed Page Model

- Dashboard
  - Purpose: health, workload, next actions.
  - Keep: top metrics, queue pressure, recent runs, current scope.
  - Remove: full launch form, deep run detail, large admin forms.

- Runs
  - Purpose: queue-based run triage plus grouped run inspection.
  - Layout: persisted runs queue on the left, selected run detail on the right, launch flow in a modal.
  - The detail area should not be one long artifact dump. Group it by operator task:
    - Overview
    - Findings
    - Review
    - Runtime Validation
    - History / Comparison
    - Exports / Integrations
  - This should be the operational workspace for starting audits, triaging results, and exporting outcomes.

- Reviews
  - Purpose: inbox and decisions.
  - Layout: notifications and queue controls on left, active review detail on right.
  - Treat this like triage, not analytics.

- Settings
  - Purpose: configuration and governance.
  - Keep admin and configuration-heavy content here instead of dashboard.

## Layout Rules

- One page, one job.
- The dashboard must not contain the full launch workflow.
- Use the first screen for overview, pressure, and clear calls to action.
- Keep trust/auth/scope status visible, but compact.
- Use list-detail layouts for run and review work.
- Avoid stacking many cards with equal visual weight.

## Dashboard Content Rules

The dashboard should contain only:

- A hero summary explaining current scope and next actions.
- Four to six top metrics.
- One attention block for queue pressure.
- A recent runs list.
- A compact scope/context panel.

The dashboard should not contain:

- Full run launch configuration.
- Project administration forms.
- Long settings forms.
- Detailed findings or run internals.

## Visual Direction

- Keep the warm stone palette, but add more hierarchy through spacing and grouped surfaces.
- Use a stronger hero/header block to anchor the screen.
- Use compact stat cards instead of large repeated card sections.
- Increase contrast between overview content and workspace content.
- Use buttons to move users into focused pages rather than embedding everything inline.

## Implemented Changes

- The dashboard is now overview-focused instead of form-heavy.
- The full launch workbench has moved to the Runs page.
- The shell navigation now includes page-level descriptions.
- Header status is compressed into compact badges instead of a large repeated banner.
- Recent runs are directly actionable from the dashboard.
- The large generic hero was removed in favor of a compact context/action strip.

## Dashboard Data Rules

Dashboard content should be unique and non-redundant.

- Do not dedicate a full dashboard row to scope/context. Scope belongs in the shell/header unless it is the primary analytical dimension of the page.
- The first row should be compact KPI cards only.
- The second row should contain one chart and one operational companion card.
- Recent runs should be the third row and act as the main drill-in section.

Avoid:

- Repeating the same totals in multiple blocks.
- Large marketing-style hero copy on operator pages.
- Explanatory cards that restate the page structure instead of helping the user act.

## Follow-Up Work

- Refactor Reviews into a stronger inbox/detail composition.
- Add saved filters and quick search for Runs and Reviews.
- Introduce denser status tables for jobs and notifications.
- Revisit typography and color tokens if the team wants a more distinct visual system later.

## Runs Detail Rules

The run detail page should prioritize decision-making over artifact exhaustiveness.

- Promote findings and review workflow over backend/integration metadata.
- Keep run provenance and configuration drift in `Overview`.
- Keep sandbox execution and runtime rerun work in `Runtime Validation`.
- Keep comparison and prior-run context in `History / Comparison`.
- Keep exports, outbound previews, and webhook delivery metadata in `Exports / Integrations`.
- Do not present every run subsection in one uninterrupted scroll by default.

Sections that should be merged or demoted:

- `Reviewer Assignment` and `Review Decisions` belong together in `Review`.
- `Review Notes`, `Review Discussion`, and `Review Timeline` should behave like one activity stream.
- `Launch Intent` and `Planned vs Executed` belong in `Overview`.
- `Provider Readiness` should be supporting overview metadata, not a primary destination.
- `Automation Webhooks` should be treated as integration/debug metadata, not analyst-first content.
