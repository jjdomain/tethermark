# Inspect Adapter

Status: executable baseline adapter as of 2026-08-24.

Tethermark runs Inspect AI `0.3.260` as the first executable Phase 9 Python worker. The initial versioned pack is `tethermark.inspect.http-baseline@1.0.0`. It uses a real Inspect `Task` with a custom bounded solver and `model=None`, so the baseline requires neither an API key nor a model subscription.

## Current coverage

The baseline pack accepts only an explicit HTTP(S) `endpoint_url` and runs two serialized observations against that exact URL:

1. A bounded `GET` response observation.
2. A bounded `HEAD` metadata and security-header-presence observation.

The adapter records HTTP status, content type, timing, selected security-header names, a SHA-256 digest of retained response bytes, Inspect sample/log status, coverage, and explicit limitations. It never stores the response body or security-header values.

This pack produces observations, not automatic control passes. Missing endpoints, transport failures, timeouts, partial sample execution, and malformed sample output remain inconclusive or errors. The pack does not yet test prompt injection, tool misuse, memory isolation, or sensitive-data handling.

## Execution boundaries

- Inspect dependency and transitive packages are universally version- and hash-locked in [`workers/python/requirements.lock`](../workers/python/requirements.lock).
- Environment bootstrapping uses the smaller independent [`workers/python/requirements-bootstrap.lock`](../workers/python/requirements-bootstrap.lock).
- Only HTTP and HTTPS endpoints without embedded credentials or fragments are accepted.
- Cloud metadata hostnames and link-local, multicast, or unspecified resolved addresses are blocked.
- Redirects are not followed.
- At most two serialized probes run, with network I/O capped at five seconds per probe and each full Inspect sample capped at fifteen seconds.
- At most 64 KiB of a response is retained for hashing; body contents are discarded.
- The adapter JSON result is capped at 256 KiB, while the TypeScript worker process has independent timeout and output limits.
- Inspect logs are reduced to normalized sample evidence and a log SHA-256; temporary raw logs are removed after execution.

## Verification

```bash
npm run scan -- setup-workers --yes
npm run scan -- worker-doctor
npm run scan -- worker-tests
npm run scan -- worker-smoke
```

The worker matrix executes setup, doctor, and adapter tests on Windows, Linux, and macOS using Python 3.11 and 3.13. macOS coverage here verifies Python packaging and adapter behavior only; it is not real-Mac Docker runtime certification.

Inspect's official documentation confirms that tasks combine datasets, solvers, and optional scorers, that custom solvers may set `TaskState.output`, and that `model=None` leaves model usage to the task: [Tasks](https://inspect.aisi.org.uk/tasks.html), [Solver API](https://inspect.aisi.org.uk/reference/inspect_ai.solver.html), and [Evaluation API](https://inspect.aisi.org.uk/reference/inspect_ai.html).
