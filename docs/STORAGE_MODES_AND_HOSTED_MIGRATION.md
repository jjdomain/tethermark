# Storage Modes and Hosted Migration

This repository currently supports three persistence modes:

- `embedded`
- `local`

## What each mode means today

### `embedded`

- Default OSS mode
- Local SQLite files under `.artifacts/state/embedded-db`
- Best fit for local installs, fixtures, and single-operator use

### `local`

- Local SQLite files under `.artifacts/state/local-db`
- Separate local persistence root when operators want to isolate data from the embedded default

## What is not implemented yet

The OSS repository does not implement a hosted remote database adapter.

That means:

- no Supabase adapter
- no managed Postgres adapter
- no remote multi-tenant persistence service

## Data categories

### OSS-local data

These remain good fits for local/file-backed OSS storage:

- persisted runs
- run artifacts
- target summaries
- UI documents
- installation defaults
- current-project overrides

### Hosted control-plane data

These should migrate to the private hosted product when remote storage is introduced:

- workspaces
- workspace-scoped settings layers
- workspace role bindings
- workspace API keys
- hosted auth/session mappings
- hosted tenancy metadata
- billing and usage records

## Recommended hosted DB path

The hosted product adopts Supabase/PostgREST or another Postgres-backed service for these first migration targets:

1. workspace registry
2. role bindings
3. hosted API keys
4. workspace/project settings layers
5. hosted auth and tenancy tables

The shared audit engine and run artifacts can stay on the OSS side until there is a stronger reason to centralize them.
