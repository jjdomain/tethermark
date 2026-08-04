# Community Edition And Tethermark Cloud Boundary

The Community Edition repository is the public core product. It should present an installation-first UX with optional project overrides.

## Community Edition UX

Community Edition should surface:

- agent configuration
- audit defaults
- readiness and review defaults
- policy pack details
- local documents
- project defaults where useful

## Tethermark Cloud UX

The following features are reserved for Tethermark Cloud and should not remain first-class Community Edition navigation:

- workspace registry
- workspace role bindings
- workspace API keys
- workspace-scoped admin flows
- multi-team hosted governance

## Implementation note

Some backend persistence and request-scope plumbing may continue to reference workspace identifiers for now. That does not mean workspace should remain a first-class Community Edition product concept.

The Community Edition UI should progressively simplify toward:

- installation defaults
- current project overrides

Tethermark Cloud will own the full organization/workspace/project model in the private Cloud repository.

## Backend migration candidates

These Community Edition backend areas still reflect Cloud-style workspace concepts and are the first candidates for migration or feature-flagging into Tethermark Cloud:

- `/ui/workspaces`
- `/ui/workspace-role-bindings`
- `/ui/api-keys`
- workspace-scoped `scope_level=workspace` settings flows
- `packages/core-engine/src/persistence/ui-settings.ts`
- `packages/core-engine/src/review-governance.ts`
- workspace-oriented persistence and API-key tests in `packages/core-engine/src/test-runner.ts`

The Community Edition UI no longer needs to expose these as first-class navigation, even if backend compatibility remains temporarily.

## API boundary

In Community Edition, Cloud admin routes should stay disabled by default:

- `/ui/workspaces`
- `/ui/workspace-role-bindings`
- `/ui/api-keys`
- `/ui/settings?scope_level=workspace`

They can be re-enabled only for Cloud migration/test flows with:

- `HARNESS_ENABLE_HOSTED_ADMIN=1`
- or `HARNESS_PRODUCT_MODE=hosted`

This keeps the public Community Edition product installation-first while preserving a migration path for the private Cloud layer.

## Database and storage notes

Current Community Edition persistence mode:

- `local`: local SQLite under `.artifacts/state/local-db`

Community Edition no longer exposes a `hosted` persistence mode.

Tethermark Cloud migration candidates for a remote database such as Supabase or Postgres-backed services:

- `ui_settings`
- `workspaces`
- `projects`
- `workspace_role_bindings`
- `api_keys`
- review workflow / review ownership tables
- async jobs and runtime follow-up coordination if hosted workers are introduced

If Tethermark Cloud adopts Supabase, keep the rule:

- Community Edition remains file-backed/local-first
- Tethermark Cloud owns remote tenancy, admin records, and multi-user control-plane data
