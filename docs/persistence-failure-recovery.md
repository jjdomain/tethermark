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

Writers in separate Tethermark processes coordinate through an atomically created `harness.sqlite.lock` sidecar before reading the latest database and merging their changes. Contention uses bounded exponential backoff and reports `sqlite_database_locked` after the wait budget instead of retrying forever. A lock left by a crashed process is quarantined and removed after its stale threshold; lock release verifies the owner token so one process cannot delete another process's lock.

The defaults are a 10-second acquisition budget, 20–500 ms backoff, and a two-minute stale threshold. Operators can tune these with `HARNESS_SQLITE_LOCK_TIMEOUT_MS`, `HARNESS_SQLITE_LOCK_BACKOFF_BASE_MS`, `HARNESS_SQLITE_LOCK_BACKOFF_MAX_MS`, and `HARNESS_SQLITE_LOCK_STALE_MS`. The stale threshold should remain comfortably above the longest expected database save.

This protection covers failures detected by the running process. Abrupt power loss and platform filesystem guarantees still require regular verified backups.

## Backup and restore contract

Before the first database replacement in each 24-hour period, Tethermark snapshots the last valid `harness.sqlite` while holding the same cross-process lock used by writers. It stores the snapshot under `<persistence-root>/backups`, verifies its SHA-256, size, schema compatibility, and SQLite `quick_check`, and only then permits the replacement. Backup failure fails the save closed. The default retention is the newest seven automatic snapshots; manual and `pre-restore` snapshots are not automatically pruned. `HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS=0` disables automatic snapshots, and `HARNESS_SQLITE_BACKUP_RETENTION` changes automatic retention.

`backup create`, `backup list`, and `backup verify` expose the same format to operators. A backup manifest binds the database and optional persistence metadata to their checksums and source schema version. `backup restore` refuses missing, modified, corrupt, malformed, or newer-major backups before changing live data. Restore uses an atomic database replacement, creates a verified safety backup when the current database is valid, and preserves an invalid current database as a timestamped rejected copy. Services must still be stopped during restore because a process holding an older in-memory database could later write stale state.

Run artifacts are deliberately outside the SQLite snapshot and must be copied separately when they need to survive host loss.

## Migration and release upgrade contract

The first local-migration file replacement due in the configured snapshot interval receives the same automatic pre-replacement backup. A failed migration save leaves both the prior database and its prior metadata version unchanged. Restoring that backup is the supported rollback path; SQLite files must never be merged by hand. Backups from a future persistence version or another major schema line are rejected rather than guessed compatible.

The immutable `fixtures/persistence-upgrades/sqlite-1.2.0.json` release fixture records its originating schema and commit. The regression suite seeds that legacy record set, injects a failed 1.2.0-to-1.3.0 save, verifies rollback and backup integrity, then completes the upgrade and proves run and review-history records remain readable. New persistence releases must add another fixture instead of rewriting this one.

## Async restart reconciliation

An audit result can become durable immediately before its async job record is updated. At startup, recovery checks each queued, starting, or running job for its current persisted run:

1. If that run is already `succeeded`, `failed`, or `canceled`, recovery updates the existing attempt and job to the same terminal state and runs terminal follow-up handling once.
2. It does not start the audit again and does not add another attempt.
3. A second recovery pass ignores the now-terminal job, making reconciliation idempotent.
4. Concurrent recovery requests in one process share the same recovery pass, preventing duplicate terminal hooks.
5. If no terminal run exists, the existing queued/restart behavior remains in effect.

Terminal completion follow-up uses a durable status on the async job. The terminal job/attempt are first saved with follow-up `pending`; the completion webhook and internal terminal hook then run; finally the job is saved as follow-up `completed`. Startup retries `pending` or `failed` follow-up work. A completion webhook already marked `delivered` is not sent again. If interruption occurs after an internal hook returns but before its completed marker is durable, the hook can run again and therefore must remain idempotent.

## Crash-stage matrix

The deterministic recovery suite interrupts SQLite with a real child-process exit after lock acquisition, after temporary-file write, and after replacement. The next writer reclaims the stale lock under the normal stale threshold, removes orphaned database temporary files while holding the recovered lock, and preserves either the last valid database or the fully replaced database according to the durable boundary reached.

Async lifecycle injection covers the durable boundaries after queued persistence, starting persistence, engine start, running persistence, terminal persistence, completion-webhook handling, internal terminal hook handling, and terminal-follow-up persistence. Recovery retains the same job, attempt, and run identifiers. The engine-start uncertainty window is intentionally at-least-once: after a process dies, the same run identifier can be started again, while no additional async attempt or terminal state is created.

The persistence stress suite exercises simultaneous API queue requests, concurrent worker lifecycle transitions, and independent Node processes writing the same database. First-request API concurrency also verifies that built-in system-policy initialization is coalesced and idempotent. Backup creation uses the same lock, and crash/concurrency regressions continue to run with automatic backups enabled.

## Scheduled artifact retention

The API schedules a retention cycle at startup and checks for another due cycle at a bounded interval. Defaults are 30 days for run artifacts, 7 days for sandbox/source copies, and one completed cycle per 24 hours. Queued, starting, and running run identifiers are excluded. `HARNESS_ARTIFACT_RETENTION_DAYS`, `HARNESS_SANDBOX_RETENTION_DAYS`, `HARNESS_ARTIFACT_RETENTION_MAX_GB`, `HARNESS_ARTIFACT_RETENTION_INTERVAL_MS`, and `HARNESS_ARTIFACT_RETENTION_SCHEDULER_POLL_MS` tune the policy; `HARNESS_DISABLE_ARTIFACT_RETENTION_SCHEDULER=1` delegates scheduling to an external operator.

Pruning intentionally preserves normalized SQLite history. It deletes selected raw directories, removes their local run-registry entries, and reconciles `artifact_index` rows for deleted or already-missing files under the managed run root. This avoids dangling raw-artifact API records without deleting run, finding, evidence, review, remediation, or learning rows. The latest outcome and a bounded 100-entry history are stored under `.artifacts/maintenance`; failed cycles remain due and retry on the next poll.
