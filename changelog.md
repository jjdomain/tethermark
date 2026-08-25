# Changelog

## 2026-08-24

### Added

- Added a hash-locked Python `>=3.11 <3.14` worker bootstrap, managed virtual environment, environment manifest, setup/doctor CLI commands, and six-job Windows/Linux/macOS Python 3.11/3.13 verification matrix.
- Added a machine-readable Python worker self-check that explicitly reports each Inspect, Garak, and PyRIT implementation boundary.
- Added executable Inspect AI `0.3.260` integration through the model-free `tethermark.inspect.http-baseline@1.0.0` pack, including real Inspect task/log execution, bounded HTTP observations, normalized URI evidence, explicit incomplete coverage, and adapter tests.
- Added the default `tethermark.inspect.ai-security-boundary@1.0.0` pack with bounded synthetic system-secret nondisclosure and unconfirmed sensitive-tool probes, runtime-control references, redacted result evidence, optional target-model hints, and explicit `no_finding_observed` rather than control-pass outcomes.
- Added `tethermark.inspect.ai-data-boundary@1.0.0` with bounded indirect prompt-injection/data-exfiltration and cross-session-memory isolation samples, three-request hard limits, partial-result handling, explicit session-contract limitations, and redacted synthetic records and tool arguments.
- Added the hash-locked `tethermark.garak.prompt-injection@1.0.0` profile using Garak `0.16.0`'s official PromptInject builder, Attempt/Message contract, and AttackRogueString detector, with two-request limits, redacted evidence, fail-closed partial results, managed-worker capability reporting, and Windows/Linux/macOS tests.
- Added the hash-locked `tethermark.pyrit.adversarial-boundary@1.0.0` profile using PyRIT `1.0.1`'s public safe-literal SeedPrompt and Score contracts and official ExactTextMatching implementation, with two synthetic authorization/data-boundary probes, no PyRIT memory retention, fail-closed results, and cross-platform tests.
- Added `tethermark.inspect.mcp-boundary@1.0.0` for stateless MCP `2026-07-28` Streamable HTTP discovery and bounded malformed-argument, repository-traversal, and undeclared cross-capability calls, with protocol/tool-error classification, redacted results, four-request limits, and no-finding-without-pass semantics.
- Added `tethermark.inspect.unsafe-output-boundary@1.0.0` with bounded active-markup-forwarding and synthetic command-sink probes against untrusted tool output, no payload rendering or execution, redacted results, two-request limits, and no-finding-without-pass semantics.
- Added `tethermark.inspect.excessive-agency-boundary@1.0.0` with bounded out-of-scope administrative-capability and unapproved recursive-delegation probes, inert synthetic sinks, redacted results, two-request limits, and no-finding-without-pass semantics.
- Added `tethermark.inspect.resource-limit-boundary@1.0.0` with bounded completion-output and per-turn operation-budget probes, inert synthetic batch handling, no load generation, redacted results, two-request limits, and no-finding-without-pass semantics.
- Added `tethermark.inspect.security-telemetry-boundary@1.0.0` with explicit operator-supplied telemetry verification, correlated adversarial/authorization/denial-or-tool-call/completion/cleanup event checks, timestamp and synthetic-value redaction validation, four-request limits, and fail-closed unavailable evidence.
- Preserved the existing Model Configuration and launch UI layout and controls while clarifying connection copy: local Codex/ChatGPT-session routing remains the runtime default and metered OpenAI API-key routing remains an explicit optional override.

### Changed

- Closed Community Edition Phase 8 after native Windows Docker Desktop and Linux Docker/rootless-Podman/gVisor execution passed; executable real-Mac validation is project-owner deferred and excluded from certified runtime claims.
- Increased the bounded managed-worker diagnostic subprocess timeout from 15 to 30 seconds so cold Inspect imports do not falsely block Windows worker doctor or test execution; runtime audit limits are unchanged.
- Python worker dispatch now requires the verified managed environment instead of treating an importable source tree as production worker readiness.
- Python worker readiness and preflight advertise only adapters that pass their managed executable self-check; Inspect, bounded Garak, and bounded PyRIT now satisfy that boundary.
- Removed committed Python bytecode caches and added repository ignore rules for generated Python cache files.

### Verified

- Managed worker setup and `worker-doctor` passed locally with Python 3.12.10 and the recorded lock digest.
- Native Runtime Verification, CI, and Static Audit Release Gate passed on the final Phase 8 runtime implementation tree.

## 2026-08-20

### Added

- Added Community Edition operator guidance for first run, ChatGPT/Codex sign-in, readiness, review, remediation, runtime follow-up, exports, restart recovery, backup, upgrade, and troubleshooting, with a retained Phase 6 walkthrough record and screenshots.
- Added same-major additive compatibility metadata to versioned export envelopes and backward-compatibility tests for legacy 1.x readers and rejected 2.x contracts.
- Added explicit validation-completeness summaries to executive JSON, executive Markdown, and full Markdown reports so skipped tools, mock or failed model stages, not-assessed controls, and runtime gaps cannot look like clean passes.
- Added generic webhook security guidance distinguishing signed delivery from explicitly untrusted local-only callbacks.

### Changed

- Moved web UI audit launch to the durable asynchronous job endpoint, with a disabled `Launching Audit...` state and automatic handoff to the run or Jobs view.
- Updated GitHub SARIF guidance for SARIF 2.1.0, current upload actions, permissions, manual upload, and remediation-link behavior.

### Verified

- Completed the isolated Phase 6 operator walkthrough through review, remediation ownership, pending runtime follow-up, exports, and restart recovery without launching another live-model calibration run.
- Verified SARIF 2.1.0 output with one run and ten results, executive export compatibility metadata, and prominent incomplete-validation reporting.
- `npm test --silent`
- `npm run e2e:static-pi-ui --silent`
- `npm run exports:check --silent`

## 2026-08-18

### Added

- Added checksum-locked, user-isolated setup for OpenSSF Scorecard 5.5.0, Semgrep 1.172.0, and Trivy 0.73.0 with supported-version enforcement.
- Added a focused static-scanner doctor, bundled offline Semgrep rules, adversarial real-scanner fixtures, and retained Windows/Ubuntu/macOS CI evidence.
- Added a deterministic Community Edition calibration suite spanning good, mixed, risky, ordinary, runnable, agentic, and MCP targets with versioned seed expectations and acceptance thresholds.
- Added external-ground-truth benchmark pairs for reviewed `GHSA-3q26-f695-pp76` / `CVE-2025-53107`, `GHSA-vjqx-cfc4-9h6v` / `CVE-2026-27735`, `GHSA-rhm9-gp5p-5248` / `CVE-2024-51751`, and `GHSA-rvqx-wpfh-mfx7` / `CVE-2025-3248`, pinned to vulnerable and direct fixed commits for command injection, MCP repository-boundary traversal, Gradio file-payload path-validation bypass, and Langflow unauthenticated code validation.
- Added per-run version manifests for methodology, static baseline, control catalog, policy, audit-package catalog, prompt set, tool versions/capabilities, and model identities.
- Added subscription-authenticated benchmark workload/budget flags, repeated `--case` selection, execution-configuration capture, and a cross-model `benchmark variance` gate that permits model identity changes while rejecting other audit-input mismatches.
- Added bounded, credential/path-redacted benchmark finding summaries with evidence references, control mappings, and post-supervisor integrity diagnostics.
- Added bounded, credential/path-redacted benchmark control-status and dimension-score summaries so each final score remains traceable after the temporary audit database is removed.
- Added a versioned fixed static calibration evidence plan and retained plan/attempt summaries; benchmark cases now fail if correction or execution omits a planned provider.
- Added deterministic reconciliation regressions for selective lane replacement, stale control finding references, model-requested deletion of heuristic findings, and model-requested control downgrades.
- Added a fixed-Gradio source-review packet for the five Terra-only findings, including recommended manual false-positive labels, pinned-source verification, an independent-human sign-off block, and separate triage for the audio-debugger command-execution pattern.

### Changed

- Restricted Scorecard API fallback to canonical public GitHub repositories and required completed repository analysis, Semgrep, Trivy, and Scorecard evidence before output can be considered publicly publishable.
- Marked Community Edition Phase 4 complete after PR #4 passed deterministic checks, OSS smoke checks, and the three-platform real-scanner matrix.
- Added benchmark citation, traceability, false-positive/false-negative, duplicate, conflict, score-drift, and repeat-stability metrics; comparisons now reject dry runs, pending labels, or mismatched audit inputs.
- Made benchmark runs bypass cached stage reuse, corrected MCP/agentic control scoping in the deterministic planner, and detect imported or promisified `child_process.exec` shell invocation patterns.
- Added deterministic detection and control mapping for the reviewed MCP `git_add` repository-boundary vulnerability, and made finding reconciliation preserve stricter control failures and lower awarded scores.
- Added deterministic detection and control mapping for Gradio's reviewed FileData metadata-validation bypass, and refined target classification so generic `plugin` filenames no longer imply an MCP surface.
- Added an OWASP API2:2023 sensitive-operation authentication control and endpoint-specific deterministic detection for Langflow's reviewed code-validation flaw; unrelated API operations remain explicitly unassessed by that evaluator.
- Constrained planner target classes to the supported taxonomy and made deterministic static-assessable candidate controls plus deterministic agentic/MCP classification a safety floor that model output cannot suppress or downgrade.
- Made variance analysis distinguish same-model repeats from cross-model runs, apply the stricter repeat-score threshold when appropriate, and report finding-count/category drift.
- Made static-runtime-overclaim fallback detection distinguish affirmative runtime claims from explicit negations such as "runtime impact was not established."
- Made calibration evidence selection bypass model choice, map repository analysis, Scorecard, Semgrep, and Trivy to every applicable control, and prevent supervisor correction from narrowing the set.
- Made selective correction remove findings from the replaced lane even when the rerun generates different finding IDs, rebuilt control finding references from final findings, and required deterministic integrity approval before model supervision can delete heuristic findings.
- Constrained selective correction merges to findings and controls owned by the rerun lane, preventing global standards recomputation from duplicating reused-lane findings or replacing off-lane control results.
- Made supervisor control-downgrade actions advisory unless a deterministic control-quality validator explicitly approves the affected control IDs.
- Required final findings to retain support from at least one assessed mapped control, consolidated equivalent agent execution claims across framework mappings, and required path-local agent-to-execution or source-to-prompt/tool evidence for agentic failures.
- Preserved direct non-agent shell execution as application-security triage observations and excluded fixture-only `validation-expectations.json` files from audit evidence.

### Security

- Added bounded scanner time and output limits plus explicit failure records for missing, blocked, unsupported, timed-out, flooded, malformed, or unavailable scanner evidence.
- Required statically evidenced findings to retain a file/line or persisted artifact citation.
- Static finding integrity no longer treats dependency-advisory impact text such as "potential command execution" or an explicit "no runtime execution" disclaimer as proof that a static audit claimed dynamic execution. Affirmative executed, reproduced, or runtime-validated claims remain blocking without runtime evidence.

### Verified

- `npm test`
- `npm run exports:check --silent`
- `npm run test:static-scanners:real`
- GitHub Actions workflow run `32095194344` with retained Windows, Ubuntu, and macOS scanner artifacts through 2026-09-17.
- Two deterministic four-case calibration runs with 100% citation/control traceability, zero duplicate/conflict groups, and zero score spread.
- Strict external calibration passed the original six reviewed vulnerable/fixed commits across three advisories and two target classes, with zero advisory-scoped false negatives and false positives.
- The fourth Langflow vulnerable/fixed pair passed both strict gates: the vulnerable revision produced one critical advisory match with a failed authentication control and zero false negatives, while the direct fixed revision passed the control with zero advisory-scoped false positives.
- The guarded Langflow ChatGPT-subscription pilot passed vulnerable and fixed cross-model variance plus same-model Sol repeat gates. Vulnerable Sol/Terra/Sol-repeat results were 65/65/65 with seven findings each; fixed results were 71/71/71 with six findings each. Every score and finding-count spread was zero, with exactly one advisory match on vulnerable snapshots and zero advisory-scoped false positives on fixed snapshots.
- An initial vulnerable Langflow Sol run deliberately remains failed evidence: selective correction expanded seven findings to thirteen, duplicated the advisory match, and created six duplicate groups. The lane-owned merge fix and regression restored the strict gate on the guarded rerun.
- A fresh strict model-free `external-reviewed-agentic-v1@2026.08.19-v4` refresh passed all eight cases. Git MCP vulnerable/fixed scored 55/70 with 10/6 findings, official MCP Git 63/72 with 6/5, Gradio 56/68 with 7/6, and Langflow 64/70 with 7/6; all four reviewed vulnerable/fixed distinctions passed with zero integrity blockers.
- The guarded Git MCP ChatGPT-subscription pilot passed vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeats. Vulnerable Sol/Terra/Sol-repeat runs scored 55/55/55 with ten findings each and one `CVE-2025-53107` match; fixed runs scored 70/70/70 with six findings each and zero advisory-scoped false positives. All four variance reports had zero score and finding-count spread.
- The official MCP Git path-traversal ChatGPT-subscription pilot passed vulnerable and fixed Sol/Terra cross-model gates plus same-model Sol repeats. Vulnerable Sol/Terra/Sol-repeat runs scored 65/65/65 with six findings each and one `CVE-2026-27735` match; fixed runs scored 73/73/73 with five findings each and zero advisory-scoped false positives. All four variance reports had zero score and finding-count spread with no integrity blockers.
- The consolidated eight-snapshot controlled matrix passed every cross-model and same-model score gate with maximum spread 1. The final vulnerable-Gradio suite-v4 Sol repeat passed at 57/56 with seven findings per run and zero finding-count spread; comparison against the older suite-v3 report was correctly rejected for suite-version, evidence-plan, and control-catalog mismatches. Existing acceptance thresholds and scoring weights remain unchanged because four advisory families and unresolved fixed-Gradio unrelated-finding drift are insufficient evidence for responsible weight tuning.
- A scanner-enabled diagnostic Git MCP Sol run remains failed evidence because five Trivy advisory titles were misclassified as static runtime overclaims. The fixed-plan scanner-disabled rerun passed, and a deterministic regression now proves advisory impact metadata and negated runtime disclaimers are not affirmative runtime claims.
- A bounded ChatGPT-subscription cross-model pilot on the reviewed vulnerable Gradio commit passed with Sol/Terra scores of 56/57 (spread 1), zero advisory-scoped false negatives/positives, full citation/control traceability, and zero duplicate/conflict groups. Finding counts differed 2/7, so broader variance calibration remains open.
- The matching fixed-Gradio pilot produced zero advisory-scoped false positives for both models, but deliberately remains a failed calibration gate: Sol passed at 27 with one finding, Terra failed at 68 with six findings and a static-runtime-overclaim integrity issue, and the 41-point cross-model spread exceeded the threshold of 3.
- A second fixed-Gradio Sol/Terra pair passed at 68/68 with zero advisory-scoped false positives. Cross-model score variance passed, but same-model stability remains blocked: Sol repeated at 27/68, and Terra repeated at 68/68 while changing from a failed six-finding result to a passing two-finding result.
- A third fixed-Gradio Sol run scored 68 with one partially supported build-integrity finding and zero advisory-scoped false positives. Its retained dimension contributions sum to 67.9 before rounding; evidence-provider selection still differed from the preceding Sol repeat, so repeat stability remains open.
- Two fixed-Gradio Sol runs under the versioned plan passed at 68/68 with one finding each. The first exposed a correction-path downgrade to repository analysis only; after correction enforcement, the final run retained all four planned provider attempts plus Scorecard API fallback. Variance passed with zero score and finding-count spread while reporting the attempted-provider drift.
- A fixed-plan Terra run passed at 68 with six fully summarized, partially supported deterministic findings and zero integrity blockers. Comparison with the retained two-finding summary isolated model-requested heuristic deletion as the remaining count-changing boundary; the older six-finding report itself predates summaries and cannot be reconstructed finding-by-finding.
- The guarded fixed-plan vulnerable-Gradio Sol/Terra pair passed formal cross-model variance at 56/57 with identical seven-finding sets, zero advisory-scoped false negatives/positives, and no integrity blockers. Six findings outside `CVE-2024-51751` remain partially supported and are explicitly excluded from external-ground-truth calibration claims.
- Post-review fixed-Gradio Sol/Terra/Sol-repeat runs passed at 87/87/87 with one shared `build_integrity` finding. Formal cross-model and same-model variance both passed with zero score and finding-count spread; the five disputed agentic findings were absent. The project owner approved the AI-adjudicated labels for engineering use and moving forward without an independent-human-review claim.
- `npm run release:check` with local binaries and Python workers explicitly disabled for deterministic, model-free verification; all five validation fixtures passed.

## 2026-08-07

### Changed

- Made the standard Phase 3 live integration and E2E commands use local Codex ChatGPT-session authentication; API-key validation now has explicitly named secondary commands and cannot satisfy the primary release gate.
- Clarified that future operator-started runtime-validation audits retain the same Codex/ChatGPT-session model default while target execution remains isolated in the runtime backend.
- Relabeled the hosted manual workflow as optional API interoperability coverage rather than the Community Edition default validation path.
- Split cached ChatGPT authentication from Codex CLI execution readiness in the API and Agent Configuration UI, added a bounded `codex login status` probe, and exposed an advanced runnable-command override.
- Migrated the active ChatGPT-session Codex model catalog from deprecated GPT-5.1 Codex models to GPT-5.6 Sol, Terra, and Luna, with Sol as the default.
- Recalibrated Phase 3 measured token ceilings for the fixed instruction/tool context emitted by current Codex CLI releases while retaining hard request, timeout, fixture, schema, and redaction bounds.
- Raised the fixed-fixture E2E per-stage timeout to its existing 180-second hard maximum after current GPT-5.6 Sol supervisor validation exceeded the former 90-second default.
- Moved the multi-minute live E2E onto the persisted asynchronous run API and recalibrated its six-stage measured-token ceiling without weakening request, duration, fixture, or execution bounds.

### Fixed

- Stopped the Codex connection UI from reporting an unusable cached auth file as fully connected and audit-ready.
- Prevented generic environment sentinels and sensitive-key matching from masking non-secret boolean assertions in redacted live-validation evidence.
- Allowed bounded Codex structured generation from Tethermark's isolated non-Git staging directories while retaining the `read-only` sandbox.

### Verified

- Completed Phase 3 with passing Codex/ChatGPT-session structured integration and fixed-fixture E2E evidence on GPT-5.6 Sol, followed by a green deterministic release check.

## 2026-08-06

### Added

- Added explicit, bounded live-model integration and fixed-fixture audit E2E commands covering structured output, all required agent stages, persistence, exports, usage accounting, evidence citations, timeouts, and redaction.
- Added a deterministic fail-closed live-validation harness to the normal release check and a dispatch-only protected GitHub workflow for API-key validation.
- Added dated redacted evidence summaries and maintainer documentation without retaining raw model output or local source content.

### Changed

- Added a request timeout to the OpenAI provider and made provider-policy budget failures bypass retry wrapping.
- Kept live-model gates outside ordinary push and pull-request CI; mock remains mandatory there.

## 2026-08-03

### Added

- Added `provider-policy.v1` workload and credential classification for interactive operator, unattended local, and external-service model work.
- Added fail-closed provider/model allowlists, per-run request and token budgets, concurrency and pacing controls, bounded exponential retry, and provider circuit breaking.
- Added non-secret provider policy artifacts and persisted invocation fields for workload, credential class, initiation mode, request index, terminal reason, timestamps, and token usage.
- Added a provider workload matrix and dated decision log based on current official OpenAI authentication, CLI, and service-policy documentation.

### Changed

- Kept local Codex ChatGPT sign-in as the explicit operator default without silently switching providers when an API key is present.
- Restricted unattended and service workloads to explicit API-key or mock configurations; unsupported combinations now fail before queueing model work.
- Made `codex exec` emit JSONL usage events so live invocation budgets and local audit records can use measured token counts.
- Clarified that mock mode is an explicit deterministic development/CI mode rather than the Community Edition operator default.

### Security

- Kept ChatGPT-session credentials out of unattended/background synthesis and stopped non-mock runs whose provider does not expose auditable token usage.

## 2026-08-02

### Added

- Added a canonical 12-phase Community Edition production tracker with current branch, release-gate, static-tool, OAuth-validation, runtime-sandbox, learning, packaging, and launch status.
- Added the implementation plan for local Admin/System Policies, including versioned SQLite policy records, immutable per-run resolution snapshots, extensive-scan catalog and operational controls, API/UI scope, safe templates, and release tests.
- Added a Docker/Docker Desktop production-readiness fixture using a digest-pinned image, read-only source/root filesystems, default-deny networking, non-root execution, dropped capabilities, bounded resources and output, live policy inspection, structured evidence, and verified cleanup.

### Changed

- Promoted local policy administration from deferred hosted-only planning to active Community Edition scope and linked `PLANS.md` to the canonical production tracker.

### Fixed

- Updated the static Pi browser E2E for the Audits navigation label and staged the benchmark suite in its isolated work root so the full static production release gate can complete.
- Changed runtime fixture validation to fail closed when Docker is launchable but no isolated fixture has executed, preventing backend selection from appearing as production runtime validation.

## 2026-07-20

### Changed

- Defined `hosted_e2b` on E2B Hobby/usage billing as the initial AISecurityBase runtime benchmark and pre-revenue Tethermark Cloud private-beta provider, subject to verification of the required custom memory profile.
- Defined `hosted_daytona` Linux VM as the first capability-tested standby/overflow provider and deferred `hosted_modal` to demonstrated burst or GPU demand.
- Added fail-closed Cloud provider capability requirements for exact commands, target staging, network and resource policy, artifact and usage capture, lifecycle control, and cleanup verification.
- Added reproducible provider-failover rules: automatic failover is limited to pre-execution failures, while post-execution failures restart from the beginning as linked attempts with separate evidence and usage.
- Added pre-revenue hosted controls for runtime eligibility, concurrency, per-project launch quotas, spending limits, hard timeouts, orphan cleanup, and static fallback.
- Excluded Perplexity's current model-directed Sandbox tool from the general runtime-audit provider set while leaving room for a future evidence-computation role.

## 2026-04-18

### Added

- Added `npm run release:check` as the maintainer verification path for OSS release readiness.
- Added `docs/release-checklist.md` covering build, test, export, API/web, and end-to-end OSS smoke checks.
- Added explicit runtime, auth, persistence, and release-boundary guidance to the public README.
- Expanded `.env.example` so the documented OSS API, web, auth, persistence, and runtime toggles match the actual code paths.

### Changed

- Updated contributing guidance so release-sensitive changes run the full release verification path and keep the release checklist in sync.
- Updated the security policy to clarify the trusted-self-hosting boundary and the difference between `auth=none` and `auth=api_key`.

### Verified

- `npm run build --silent`
- `npm test --silent`

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
