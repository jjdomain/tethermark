# Runtime evidence normalization

Tethermark converts bounded Inspect, Garak, and PyRIT worker output into first-class audit artifacts before standards evaluation. The conversion is deterministic and copies only review-safe fields; request bodies, response bodies, prompts, credentials, synthetic values, and tool arguments are not copied into normalized evidence.

## Artifact path

Each worker execution produces:

1. A tool execution record containing the adapter result.
2. One `runtime_evaluation_coverage` evidence record with the pack identity, expected/attempted/completed counts, finding and inconclusive counts, coverage status, and explicit inconclusive reasons.
3. One `runtime_evaluation_observation` evidence record per bounded probe with its title, redacted summary, mapped runtime controls, outcome, severity, reason, and sanitized evidence locations.
4. A runtime audit observation for every normalized probe and every incomplete coverage result.
5. A persisted finding for every `finding` outcome, mapped only to applicable runtime controls named by the versioned pack contract.
6. A control result for every applicable runtime control reached by the pack.

The normalized evidence records flow through the existing persistence, review, export, and comparison path. No UI route or layout change is required.

## Control decision contract

| Runtime evidence | Control status | Assessability | Score awarded |
| --- | --- | --- | --- |
| One or more mapped findings | `fail` | `assessed` or `partially_assessed` when coverage is incomplete | `0` |
| Complete bounded coverage with only assessable no-finding observations | `partial` | `partially_assessed` | `0` |
| Some assessable observations with incomplete coverage | `partial` | `partially_assessed` | `0` |
| No assessable observations, worker failure, malformed output, or a pack that did not run | `not_assessed` | `not_assessed` | `0` |

A finite no-finding sample never establishes `pass`. Runtime controls can only pass after a future policy explicitly defines sufficient independent evidence; the current Community Edition packs do not make that claim.

## Fail-closed coverage

Coverage becomes partial or not-run when any of the following occurs:

- the worker process is skipped or fails;
- the worker result is not `completed`;
- the eval pack is unknown or missing;
- the pack's expected sample count does not match its versioned contract;
- observations are missing, malformed, incomplete, or exceed the expected count;
- reported coverage counts disagree with normalized observations;
- an observation is inconclusive, errored, or uses an unsupported outcome such as `pass`.

Reasons such as `low_sample_count`, `coverage_contract_mismatch`, `worker_execution_failed`, and adapter-provided transport or response reasons remain queryable in evidence metadata and visible in audit observations and control rationales.

## Worker lifecycle policy

- Running audit cancellation propagates an `AbortSignal` through control assessment, evidence collection, provider dispatch, and the Python child process. The worker is terminated immediately instead of waiting for its normal timeout; the audit still settles as canceled at the orchestrator boundary.
- A worker gets two attempts by default, with a hard ceiling of three. Only transient process-launch or execution errors are retried, after a bounded abortable delay.
- Timeouts, output-limit violations, malformed JSON, adapter-declared failures, partial results, and operator cancellation are terminal and are never retried.
- Each result records attempts, maximum attempts, retry count, and terminal reason in `worker_invocation`. The normalized coverage evidence retains this metadata.
- Failure kinds remain distinct as `worker_canceled`, `worker_timeout`, `worker_output_limit`, `worker_malformed_output`, `worker_execution_error`, and `worker_retry_exhausted`.

The default per-attempt process timeout is 45 seconds and the child-process stdout/stderr buffer cap is 1 MiB. Callers may lower these values; hard ceilings remain 120 seconds and 4 MiB per attempt.

## Redaction and bounds

- Only allowlisted observation fields are copied.
- Evidence locations are limited to HTTP(S) URIs, file locations, or symbols. URI credentials, query strings, and fragments are removed.
- Text fields are length bounded and synthetic markers and bearer credentials are redacted.
- Observation lists and locations are capped before normalization.
- Runtime control references are restricted to the applicable `runtime.*` controls in the selected lane.

Verification is part of the core engine test suite:

```bash
npm test
```
