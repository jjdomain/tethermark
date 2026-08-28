# Community Edition Data Lifecycle And Privacy

Tethermark Community Edition is locally operated software. Tethermark does not upload local audit history to a Tethermark service, but configured model providers, repository hosts, scanners, package registries, webhook receivers, and runtime dependency sources receive the requests explicitly sent to them. Review those providers' policies independently.

## Data locations

| Data | Default workstation location | Shared-service override | Sensitivity |
| --- | --- | --- | --- |
| Environment/model/API configuration | `<checkout>/.env` | `HARNESS_ENV_FILE` | Secret |
| SQLite normalized history and backups | `<artifact-root>/state/local-db` | `HARNESS_LOCAL_DB_ROOT` | Confidential; may contain source-derived evidence and reviewer content |
| Run artifacts and exports | `<artifact-root>/runs` | `HARNESS_ARTIFACT_ROOT` | Confidential; may include source excerpts, prompts, outputs, and runtime evidence |
| Sandboxes and cloned source | `<artifact-root>/sandboxes` | `HARNESS_ARTIFACT_ROOT` | Confidential untrusted source |
| Benchmarks, readiness, maintenance, diagnostics | subdirectories of `<artifact-root>` | `HARNESS_ARTIFACT_ROOT` | Review before sharing |
| Python worker environment | `<checkout>/.tethermark/python-worker` | none | Executables/packages; not a credential store |
| Managed static tools | `%LOCALAPPDATA%\Tethermark\tools` on Windows; `~/.local/share/tethermark/tools` on Unix | `HARNESS_STATIC_TOOLS_PATH` records discovery | Executables/packages; not a credential store |
| Codex ChatGPT session | Codex-owned `CODEX_HOME` | none | Secret, external to Tethermark |
| Git/SSH credentials | OS Git credential helper or SSH agent | none | Secret, external to Tethermark |

`HARNESS_ARTIFACT_ROOT` defaults to `<checkout>/.artifacts`. The shared-service layout and permissions are in [Least-Privilege Shared-Service Deployment](./shared-service-deployment.md). Backups, diagnostics, and copied exports inherit the sensitivity of their source; protect them with the same or stricter access controls.

## Backup, verify, and restore

SQLite automatically creates a verified pre-replacement snapshot at most once per 24 hours and retains the newest seven automatic snapshots. Manual and pre-restore safety backups are not automatically deleted. Configure `HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS` and `HARNESS_SQLITE_BACKUP_RETENTION` only after documenting the recovery objective.

```bash
npm run scan -- backup create --reason before-maintenance
npm run scan -- backup list
npm run scan -- backup verify --backup <backup-directory>
```

The SQLite backup does not contain raw run artifacts. Copy the artifact root separately while Tethermark is stopped, preserving permissions and checksums. Store at least one verified copy outside the application host. Test restore periodically on an isolated directory.

Stop every Tethermark process before restore:

```bash
npm run scan -- backup restore --backup <backup-directory>
npm run scan -- validate-persistence
```

Restore verifies manifest hashes, schema compatibility, and SQLite integrity before replacement and creates a safety copy of a valid current database. See [Persistence Failure Recovery](./persistence-failure-recovery.md) for the fail-closed details.

## Retention

The API retains raw run artifacts for 30 days and sandbox/source copies for 7 days by default. Active durable jobs are protected. Normalized SQLite run, finding, evidence, review, remediation, and learning records are not deleted by artifact retention.

Preview before manual pruning:

```bash
npm run scan -- artifacts prune --kind all --older-than 30d --dry-run
npm run scan -- artifacts prune --kind all --older-than 30d
```

Configure scheduling with `HARNESS_ARTIFACT_RETENTION_DAYS`, `HARNESS_SANDBOX_RETENTION_DAYS`, `HARNESS_ARTIFACT_RETENTION_MAX_GB`, and `HARNESS_ARTIFACT_RETENTION_INTERVAL_MS`. Legal, contractual, incident-response, and customer deletion duties may require a different policy. Retention is not secure erasure: SSDs, snapshots, backups, filesystem journals, and provider copies may retain data.

## Redacted diagnostics

Create a support bundle without audit content, credentials, environment values, filenames, or local paths:

```bash
npm run scan -- diagnostics create
npm run scan -- diagnostics create --output <file.json> --json
```

The JSON contains product/host versions, path-override booleans, aggregate storage counts/bytes, protected-file status, and doctor check IDs/statuses. It deliberately excludes doctor summaries/details because they may contain paths or provider errors. The file is owner-only on Unix. Always inspect it before sharing; host versions and readiness status can still be sensitive operational information.

## Credential rotation and complete removal

Tethermark-managed API/model keys live in the resolved environment file. Integration signing secrets or legacy secret fields may exist in SQLite settings. Preview, stop Tethermark, then remove both classes:

```bash
npm run scan -- credentials remove
npm run scan -- credentials remove --yes
```

For an external service configuration or nondefault database, pass `--env-file <path>` and `--root <persistence-root>`. Removal blanks secret-valued environment assignments and nulls secret/API-key/token/password fields in every persisted settings scope; it does not delete non-secret provider/model choices. Rotate/revoke credentials at the provider first because deleting a local copy does not invalidate it.

The UI no longer writes the instance API key to `localStorage`; it uses tab-session storage and removes the legacy persistent field when the app loads. Close every Tethermark browser tab and clear site data on shared browsers to remove session and historical browser copies.

Tethermark deliberately does not delete credentials owned by other systems. Complete removal therefore also requires the operator to:

1. revoke API keys/tokens at OpenAI, GitHub, webhook receivers, and any other configured provider;
2. use Codex logout/removal procedures for the separate Codex ChatGPT session when desired—never delete `CODEX_HOME` blindly;
3. remove Tethermark-specific Git Credential Manager entries, SSH keys, agent entries, and SSO grants without affecting unrelated repositories;
4. remove service-task credentials and the dedicated service account after stopping/unregistering the service;
5. purge or destroy retained environment files, SQLite/artifact backups, uninstall backups, diagnostics, exports, browser site data, host snapshots, and off-host copies under the applicable retention policy.

Use the guarded uninstall in [Installation](./installation.md) for the verified checkout. Its default is preservation, not deletion. `--purge-data` affects checkout-local data only; external service data, managed tools, backups, provider-side credentials, and third-party credential stores require the explicit steps above.
