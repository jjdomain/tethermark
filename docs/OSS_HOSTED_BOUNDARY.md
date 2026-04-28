# OSS and Hosted Boundary

The OSS repository is the public core product. It should present an installation-first UX with optional project overrides.

## OSS-first UX

OSS should surface:

- agent configuration
- audit defaults
- readiness and review defaults
- policy pack details
- local documents
- project defaults where useful

## Hosted-only UX

The following features are reserved for the hosted product layer and should not remain first-class OSS navigation:

- workspace registry
- workspace role bindings
- workspace API keys
- workspace-scoped admin flows
- multi-team hosted governance

## Implementation note

Some backend persistence and request-scope plumbing may continue to reference workspace identifiers for now. That does not mean workspace should remain a first-class OSS product concept.

The OSS UI should progressively simplify toward:

- installation defaults
- current project overrides

Hosted will own the full organization/workspace/project model in the private hosted repository.

## Backend migration candidates

These OSS backend areas still reflect hosted-style workspace concepts and are the first candidates for migration or feature-flagging into hosted:

- `/ui/workspaces`
- `/ui/workspace-role-bindings`
- `/ui/api-keys`
- workspace-scoped `scope_level=workspace` settings flows
- `packages/core-engine/src/persistence/ui-settings.ts`
- `packages/core-engine/src/review-governance.ts`
- workspace-oriented persistence and API-key tests in `packages/core-engine/src/test-runner.ts`

The OSS UI no longer needs to expose these as first-class navigation, even if backend compatibility remains temporarily.

## API boundary

In OSS, the hosted-only admin routes should stay disabled by default:

- `/ui/workspaces`
- `/ui/workspace-role-bindings`
- `/ui/api-keys`
- `/ui/settings?scope_level=workspace`

They can be re-enabled only for hosted migration/test flows with:

- `HARNESS_ENABLE_HOSTED_ADMIN=1`
- or `HARNESS_PRODUCT_MODE=hosted`

This keeps the public OSS product installation-first while preserving a migration path for the private hosted layer.

## Database and storage notes

Current OSS persistence mode:

- `local`: local SQLite under `.artifacts/state/local-db`

OSS no longer exposes a `hosted` persistence mode.

Hosted migration candidates for a remote database such as Supabase or Postgres-backed services:

- `ui_settings`
- `workspaces`
- `projects`
- `workspace_role_bindings`
- `api_keys`
- review workflow / review ownership tables
- async jobs and runtime follow-up coordination if hosted workers are introduced

If hosted adopts Supabase, keep the rule:

- OSS remains file-backed/local-first
- hosted owns remote tenancy, admin records, and multi-user control-plane data
