# Changelog

## 2026-04-15

### Added

- Added a first-class human review workflow model with explicit run-level review states and append-only reviewer action records.
- Added persistence-backed review workflow readers, review queue listing, and action submission helpers for CLI/API consumers.
- Added `GET /runs/:runId/review-workflow`, `GET /runs/:runId/review-actions`, and `POST /runs/:runId/review-actions` to the HTTP API.
- Added CLI review workflows for `review queue`, `review status <run-id>`, and `review action <run-id> ...`.
- Added regression coverage for default review workflow persistence, reviewer action state transitions, and the new review API endpoints.
- Added public `CONTRIBUTING.md` and `SECURITY.md` docs to support OSS collaboration and private security disclosure.
- Added a readiness-gaps section to the roadmap so remaining productization work is framed as OSS, operator, and integrator needs instead of architecture cleanup.
- Added a GitHub Actions CI workflow that runs build, regression tests, and bundled fixture validation on pushes and pull requests.
- Added isolated temporary persistence roots for `validate-fixtures` by default, plus an explicit `--persistence-root` override for callers that intentionally want shared fixture-validation state.
- Added a first async run lifecycle for the HTTP API with queued execution, polling, cancel/retry support, and optional completion webhooks.
- Added regression coverage for queued async API execution, terminal polling, cancellation, retry lineage, and webhook delivery.
- Added persistence-backed async job and async job-attempt records so queued work, retries, and webhook state survive API restarts.
- Added cooperative cancellation for running async audits so cancel requests are recorded immediately and honored at orchestrator stage boundaries.
- Added a self-hostable OSS web UI app for dashboard, runs, run detail, review queue, async jobs, artifact visibility, and persisted settings management.
- Added persistence-backed UI settings and attached policy/reference document records plus HTTP API routes for reading, updating, creating, and deleting them.
- Added regression coverage for the web UI proxy surface and persisted UI settings/document API flow.

### Changed

- New persisted runs now derive their initial human review workflow from publishability and remediation signals instead of exposing only boolean review-required flags.
- Run summaries now report the current review workflow status and assigned reviewer alongside publishability state.
- Updated public docs and the README architecture diagram so the human review workflow is represented as part of the runtime instead of future-only roadmap work.
- Updated the README docs section to surface contribution and security-reporting guidance directly from the repo root.
- Updated README and contribution guidance so the expected CI verification path is explicit to contributors.
- Updated fixture-validation docs to clarify that bundled fixture runs no longer contend on the shared embedded persistence root by default.
- Updated the README architecture diagram and route documentation to show the async queue, completion webhook, and `/runs/async/*` lifecycle surface.
- Refactored the engine run queue so synchronous and queued execution share the same orchestrator path, failed runs are marked terminal in-memory, and retries create new runs linked by `retry_of_run_id`.
- Refactored the async API from in-memory run envelopes to durable job resources with per-attempt run history, restart recovery, and webhook delivery recorded in persistence.
- Updated async cancellation semantics so queued jobs cancel immediately while running jobs transition to terminal `canceled` state once the current stage reaches a safe boundary.
- Updated the README architecture and quick-start docs to include the OSS web UI, its proxy model, and the persisted `/ui/settings` plus `/ui/documents` backend surface.

### Verified

- `npm run build --silent`
- `npm test --silent`

## 2026-04-14

### Added

- Added normalized persistence records for lane-specialist outputs, commit-diff state, correction-plan artifacts, correction-result artifacts, lane-reuse decisions, and persistence summaries.
- Added normalized persisted stage-artifact records for reusable orchestration inputs such as planner output, target profile, threat model, eval selection, run plan, pre-skeptic findings, score summary, and observations.
- Added persisted observability readers for events, metrics, full observability payloads, and maintenance-filtered history.
- Added persisted readers for resolved configuration, commit-diff, correction-plan, correction-result, lane-reuse decisions, and persistence summary.
- Added a persisted stage-artifact reader plus regression coverage for reading reusable orchestration artifacts from embedded persistence.
- Added embedded persistence validation that checks required normalized records and count mismatches against per-run bundle exports.
- Added regression coverage for SQLite-backed lane-specialist reads, legacy lane-specialist backfill, and persisted observability reads.
- Added persistence integration coverage for fresh embedded runs and API route assertions so tests verify normalized records are written and `/runs/:runId/*` responses come from persisted state.
- Added shared target-identity canonicalization helpers plus regression coverage for grouping repo URLs, local clones with inferred upstream repos, and normalized endpoint variants.
- Added an explicit artifact policy catalog that classifies run artifacts as normalized query-backed surfaces versus archival/debug-only outputs.
- Added normalized persisted supervisor-review and remediation-memo records, while final observations continue to use persisted stage artifacts and lane/stage summaries remain queryable through existing normalized lane records.
- Removed the obsolete raw `run-artifacts` compatibility module after moving maintenance and observability consumers fully onto persisted readers and the explicit artifact API boundary.
- Added a post-persist persistence-summary upsert so new runs immediately populate the `persistence_summaries` table.
- Added explicit API-boundary documentation that defines normalized query routes as the stable integration surface and raw artifact routes as best-effort archival/debug access.
- Added a mode-aware persistence backend registry with concrete `embedded`, `local`, and `hosted` SQLite-file store implementations plus regression coverage for backend isolation.
- Added normalized observability summary and history readers with stage, lane, and provider rollups plus explicit retention-policy defaults for raw events, raw metrics, rollups, and bundle exports.
- Added an explicit bundle-export policy that treats per-run bundle JSON as optional debug/maintenance exports instead of canonical persistence, plus a `compact-bundle-exports` maintenance workflow.

### Changed

- Refactored evidence execution persistence to carry tool adapter metadata, requested-provider lineage, and fallback execution details.
- Promoted lane-specialist outputs to first-class run artifacts and persisted records instead of relying on artifact discovery alone.
- Extended run, target, and historical query rollups to include lane-specialist counts and tool-adapter history.
- Refactored the API server entrypoint to expose an in-process server constructor while preserving direct CLI startup, so integration tests can exercise the real HTTP routes without child-process-only assumptions.
- Tightened canonical target grouping so repo URL scans and local clone scans converge on the same canonical target when an upstream repo is known, while endpoint variants now normalize default ports, host casing, and trailing slashes consistently.
- Artifact manifest responses now annotate each artifact with whether it mirrors normalized persisted data or remains artifact-only archival/debug output.
- Run detail APIs now expose normalized supervisor-review and remediation-memo records instead of requiring raw artifact reads for those debug surfaces.
- Switched run API subresources for `lane-specialists`, `events`, `metrics`, `observability`, `maintenance`, `commit-diff`, `publishability`, `policy-application`, `resolved-config`, `correction-plan`, `correction-result`, `lane-reuse-decisions`, and `persistence` to use persistence-backed readers.
- Split raw artifact/debug API access from normalized query routes by adding explicit `/artifacts/runs/:runId` and `/artifacts/runs/:runId/:artifactType` endpoints.
- Switched selective rerun and reuse orchestration to rebuild prior-run inputs from persisted stage artifacts and normalized records instead of reading prior-run JSON artifacts directly.
- Updated maintenance reconstruction/backfill to normalize legacy run artifacts into embedded persistence for lane-specialists, commit-diff, correction artifacts, lane-reuse decisions, and persistence summaries.
- Updated maintenance reconstruction/backfill to normalize reusable stage artifacts into embedded persistence for historical runs.
- Added a `validate-persistence` CLI workflow alongside backfill and reconstruction so embedded-state integrity can be checked explicitly.
- Threaded `lane_reuse_decisions` through the orchestrator result contract so new runs persist lane reuse state without depending on artifact-only recovery.
- Removed temporary lane-specialist query fallback logic after normalizing the embedded state with backfill.
- Removed obsolete generic artifact-reader exports and the unused prior-run artifact helper after moving selective rerun onto persisted readers.
- Fixed CLI parsing so `--llm-provider`, `--llm-model`, and `--llm-api-key` propagate into the actual audit request.
- Clarified the long-term compatibility rules between normalized query APIs and raw artifact/debug APIs in the architecture docs so downstream consumers have an explicit stability contract.
- Switched persistence reads and writes to resolve database roots by `db_mode`, so `local` and `hosted` no longer collapse onto the embedded store path and metadata now records the logical database mode.
- Added `/runs/:runId/observability-summary` and `/stats/observability` so cost/token history and observability rollups no longer require raw event-stream parsing by callers.
- Switched bundle exports to a `debug_optional` policy with embedded-mode defaults enabled and local/hosted defaults disabled, while persistence metadata now records the active bundle-export policy for each store.

### Verified

- `npm run build --silent`
- `npm test --silent`
- Embedded persistence backfill completed successfully over the current local state.
- API smoke checks validated persistence-backed responses for lane-specialists, observability, commit-diff, correction artifacts, lane-reuse decisions, and persistence summary endpoints.
- Selective-rerun persisted readers now rebuild reusable orchestration inputs without direct prior-run artifact reads.
- Persistence validation reports both missing required records and normalized-table count mismatches for selected runs.

### Notes

- The embedded SQLite store is now the primary query surface for the main run-debug and run-summary APIs; artifact JSON remains available mainly for archival/debug inspection and selective rerun support.
- Reusable selective-rerun inputs are now normalized into embedded persistence as stage artifacts, reducing the remaining orchestration dependence on raw prior-run artifact files.
- Existing local embedded state was backfilled so historical runs expose normalized lane-specialist, commit-diff, correction, lane-reuse, and persistence-summary data without requiring reruns.

## 2026-04-11

### Changed

- Removed the obsolete `.legacy-js-archive` directory after the TypeScript/Node rewrite had fully replaced the old JavaScript implementation.
- Cleaned the workspace state so only the active TypeScript and Python paths remain in the repository.
- Switched the active artifact layout to use `.artifacts/runs` for run artifacts and `.artifacts/sandboxes` for cloned or mirrored targets.
- Made CLI `--output` runs write artifacts directly into the requested directory instead of always writing under the engine-default run root.
- Updated the self-scan script to use the new active artifact layout.

## 2026-04-10

### Added

- Added a standards-based static audit methodology artifact and control catalog spanning OpenSSF Scorecard, SLSA, NIST SSDF, OWASP LLM Applications, OWASP Agentic Applications, and MITRE ATLAS mappings where applicable.
- Added planner support for framework selection, applicable controls, deferred controls, and non-applicable controls.
- Added eval-selection support for control-to-tool mappings.
- Added `packages/core-engine/src/tool-runner.ts` to execute selected static tools and persist normalized tool execution records.
- Added `packages/core-engine/src/standards-audit.ts` to assess controls, emit standards-linked findings, generate observations, and compute framework scores.
- Added persisted `tool-executions.json`, `control-results.json`, `final-control-results.json`, `observations.json`, `methodology.json`, and standards-based score summaries.
- Added static clone provenance capture with commit SHA recording in sandbox metadata and target snapshots.
- Added per-run sandbox storage usage reporting for cloned or mirrored targets.

### Changed

- Replaced the placeholder posture-only scoring path with a standards/control-based static audit path.
- Updated planner-agent, threat-model-agent, eval-selection-agent, skeptic-agent, and remediation-agent prompts to operate within a standards-based audit workflow.
- Updated the CLI to print methodology version, in-scope control count, tool execution status, and framework scores.
- Updated project instructions and plans to treat static audit output as standards-based audit data suitable for downstream publishing or leaderboard ingestion.

### Verified

- `npm run build`
- `npm run scan:self`

### Notes

- The static audit now runs end to end, including tool-selection, tool-execution attempts, control assessment, framework scoring, skeptic review, and remediation output.
- On this machine, Scorecard was skipped for path scans and Trivy/Semgrep returned failed execution states, so local tool installation still needs follow-up before full static tool coverage is available.
- Local static repo runs currently retain cloned sandboxes and artifacts until manually cleaned up.

## 2026-04-09

### Added

- Added `packages/llm-provider`, `packages/agent-runtime`, `packages/prompt-registry`, `packages/trace-recorder`, and `packages/handoff-contracts`.
- Added a provider abstraction with OpenAI and mock runtimes for structured JSON agent outputs.
- Added detailed system prompts and JSON schemas for planner-agent, threat-model-agent, eval-selection-agent, skeptic-agent, and remediation-agent.
- Added agent invocation records and handoff records as first-class persisted artifacts.
- Added LLM-backed planner, threat-model, eval-selection, skeptic, and remediation calls to the main audit execution path.

### Changed

- Replaced deterministic planning and reasoning in the core execution path with provider-backed agent runtime calls.
- Expanded the audit result contract to include threat-model, skeptic review, remediation, agent invocation logs, and handoff logs.
- Updated CLI output to report provider-backed agent activity and selected tools.
- Updated project instructions to require that model-backed agent participation remain part of the main architecture.

### Verified

- `npm run build`
- `npm run scan -- scan path . --mode static`

### Notes

- The current verified path uses the mock provider, which satisfies the test-double requirement from the addendum.
- Live provider-backed execution requires `AUDIT_LLM_API_KEY` or per-agent `AUDIT_LLM_*_API_KEY`, plus `AUDIT_LLM_PROVIDER` / `AUDIT_LLM_MODEL` as needed. Legacy `OPENAI_API_KEY` fallback is still supported.
- Linux container execution and real Python worker execution are still pending.

## 2026-04-08

### Added

- Rewrote the core engine onto a TypeScript/Node path with a new `packages/core-engine` package.
- Added TypeScript entrypoints for the CLI, HTTP API, and MCP bridge.
- Added core contracts for audit requests, run plans, artifacts, traces, findings, and run envelopes.
- Added a new in-memory job queue scaffold and orchestrator entrypoint in the TypeScript core.
- Added Python worker scaffolding under `workers/python` for garak, Inspect, and PyRIT adapters.
- Added a Python worker invocation bridge from the Node orchestrator.
- Added root `tsconfig.json` and TypeScript-oriented workspace scripts.
- Added sandbox-manager support with a Windows local static backend, a Linux static backend, and a Linux container-backend scaffold.
- Added explicit sandbox command-policy and container workspace contracts.

### Changed

- Shifted the repository direction from a JavaScript prototype into an explicit TypeScript core plus Python worker architecture.
- Updated project documentation to describe the split runtime model.
- Removed legacy `.js` entrypoints and JS-only packages from the active `apps/` and `packages/` tree.
- Static scans now run inside a dedicated per-run sandbox workspace with explicit read-only-analysis-only constraints in the run plan.
- Linux non-static modes now route to a container-oriented sandbox contract instead of the static backend.

### Notes

- The Linux container backend is currently a scaffold that prepares per-run workspaces and policy metadata; actual container launch and enforcement still need implementation.
