# Storage and Hosted Migration

The OSS repository supports one production persistence mode:

- `local`

## OSS Local Storage

- SQLite files under `.artifacts/state/local-db` by default.
- `HARNESS_LOCAL_DB_ROOT` can point the SQLite store at an operator-managed directory.
- Queryable run state is stored in normalized SQLite tables; JSON bundle exports are optional debug material.

## What OSS Does Not Implement

The OSS repository does not implement a hosted remote database adapter.

That means:

- no Supabase adapter
- no managed Postgres adapter
- no remote multi-tenant persistence service

## Hosted Storage Path

The hosted product owns Supabase/PostgREST or another Postgres-backed service for production tenant storage. Hosted should import the shared OSS engine contracts, preserve the core audit records, and add hosted-only tenancy, identity, governance, billing, and operations tables.
