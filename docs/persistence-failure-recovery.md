# Persistence failure and restart recovery

Tethermark Community Edition stores durable local state in `harness.sqlite`. Persistence failures are fail-closed: the application must surface the storage problem instead of treating damaged state as a new empty installation.

## Database open contract

- A genuinely missing `harness.sqlite` starts a new database.
- An existing database is opened and checked with SQLite `quick_check` before records are read or changed.
- An unreadable file reports `sqlite_database_unavailable`.
- A corrupt or unsupported file reports `sqlite_database_corrupt_or_unsupported`.
- Tethermark does not replace, truncate, or automatically rebuild a rejected database. Restore a verified backup or retain the file for diagnosis.

## Save contract

Local saves merge record-level changes through a per-database write queue. The merged database is written to a uniquely named temporary file before replacement. If temporary output cannot be written—for example because storage is full—or replacement fails, the temporary file is removed, the error is reported as `sqlite_save_failed`, and the prior database remains unchanged.

This protection covers failures detected by the running process. Abrupt power loss and platform filesystem guarantees still require regular verified backups, which remain a separate Phase 10 deliverable.

## Async restart reconciliation

An audit result can become durable immediately before its async job record is updated. At startup, recovery checks each queued, starting, or running job for its current persisted run:

1. If that run is already `succeeded`, `failed`, or `canceled`, recovery updates the existing attempt and job to the same terminal state and runs terminal follow-up handling once.
2. It does not start the audit again and does not add another attempt.
3. A second recovery pass ignores the now-terminal job, making reconciliation idempotent.
4. Concurrent recovery requests in one process share the same recovery pass, preventing duplicate terminal hooks.
5. If no terminal run exists, the existing queued/restart behavior remains in effect.

The remaining Phase 10 work covers per-stage crash injection, higher-concurrency API/worker stress, explicit filesystem lock/backoff behavior, automated backup/restore, and upgrade fixtures.
