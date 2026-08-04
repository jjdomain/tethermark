# Storage And Tethermark Cloud Migration

The Community Edition repository defaults to one zero-config runtime persistence mode:

- `local`

It also supports remote logical-record persistence through Postgres-compatible databases:

- `postgres`
- `supabase`

## Community Edition Local Storage

- SQLite files under `.artifacts/state/local-db` by default.
- `HARNESS_LOCAL_DB_ROOT` can point the SQLite store at an operator-managed directory.
- Queryable run state is stored in the SQLite `records` table, keyed by logical table name and record key. JSON bundle exports are optional debug material.
- The SQLite database also stores `record_schemas` metadata for self-learning logical tables and settings fields. Current self-learning logical tables are `learning_events`, `learning_candidates`, `learning_experiments`, `learning_promotions`, `learning_jobs`, and `ui_settings.learning_json`.

## Postgres/Supabase Runtime And Bootstrap

Use the migration command to generate or apply the remote schema:

```powershell
npm run scan -- migrate postgres --dry-run --output .artifacts/postgres-bootstrap.sql
npm run scan -- migrate postgres --database-url "<postgres-url>"
npm run scan -- migrate supabase --database-url "<supabase-postgres-url>"
```

The command reads a database URL from the first configured value:

- `HARNESS_POSTGRES_URL`
- `SUPABASE_DB_URL`
- `DATABASE_URL`
- `--database-url`

The apply path shells out to `psql`; install PostgreSQL client tools or set `HARNESS_PSQL_COMMAND` to a compatible executable. Runtime `postgres` and `supabase` modes also use this configured command for logical-record reads and writes.

The bootstrap creates:

- generic `records` and `record_schemas` tables compatible with the Community Edition logical-record model
- relational self-learning tables from the shared manifest
- `ui_settings` with `learning_json`

To run against a remote database, configure a URL and select the remote mode:

```powershell
$env:HARNESS_POSTGRES_URL = "<postgres-url>"
$env:HARNESS_DB_MODE = "postgres"
npm run scan -- scan path . --mode static --db-mode postgres
```

Supabase uses the same Postgres wire path:

```powershell
$env:SUPABASE_DB_URL = "<supabase-postgres-url>"
npm run scan -- scan path . --mode static --db-mode supabase
```

The remote runtime adapter stores the same logical records as local SQLite in `records.payload_json` and keeps the `record_schemas` manifest synchronized. If a remote mode is selected without a configured database URL, the app fails fast with `postgres_database_url_required`.

## Tethermark Cloud Storage Path

Tethermark Cloud owns Supabase/PostgREST or another Postgres-backed service for production tenant storage. Tethermark Cloud should import the shared Community Edition engine contracts, preserve the core audit records, run the shared bootstrap migration, and add Cloud-only tenancy, identity, governance, billing, and operations tables.

The shared core exports `SELF_LEARNING_TABLE_DEFINITIONS` and `SELF_LEARNING_POSTGRES_DDL` from `packages/core-engine/src/persistence/schema-manifest.ts`. Tethermark Cloud Postgres migrations should use those definitions for:

- `learning_events`
- `learning_candidates`
- `learning_experiments`
- `learning_promotions`
- `learning_jobs`
- `ui_settings.learning_json`

The Admin Observability module reads self-learning data from those persisted learning records. It does not require a separate observability-only table for learning metrics; the rollup is derived from the learning event, candidate, promotion, and job records.
