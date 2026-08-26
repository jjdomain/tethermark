# Runtime Sandbox Architecture

Tethermark runtime validation is a primary Tethermark Community Edition harness capability. The user-facing product concept is **Local Runtime Sandbox**.

The launch UI must not ask normal users to choose between Docker, Podman, gVisor, or process wrappers. Tethermark resolves the strongest available local backend automatically, while Admin settings control backend policy, warning behavior, network defaults, and resource limits.

## Product Boundary

Community Edition implements only:

- `local_runtime`

Tethermark Cloud sandbox providers are Cloud-managed and metered:

- `hosted_modal`
- `hosted_e2b`
- `hosted_daytona`

Cloud provider code belongs in the separate Tethermark Cloud repository, not the Community Edition repository. Community Edition API requests for Cloud provider IDs must return the stable `hosted_only` compatibility code with user-facing Cloud guidance.

The Cloud provider IDs are compatibility identifiers, not a claim that all providers are equally ready or interchangeable. The initial hosted rollout uses this order:

1. `hosted_e2b` is the preferred provider for AISecurityBase runtime benchmarks and the pre-revenue Tethermark Cloud private beta. The rollout should begin on E2B's zero-base-price Hobby tier with usage billing and a configured spending limit.
2. `hosted_daytona` is the first standby/overflow adapter. It becomes eligible when its Linux VM runtime passes the same fixtures and policy-enforcement tests, or earlier if E2B Hobby cannot supply the required memory profile without a fixed subscription.
3. `hosted_modal` is deferred for specialized burst, GPU, or workload-specific use. It is not an initial automatic failover target.

Perplexity Sandbox is not a general runtime-audit provider because its current Agent API tool is model-directed rather than an exact-command sandbox control plane. It may be evaluated separately for bounded evidence computation, but it must not satisfy a runtime-validation isolation claim.

Cloud provider selection must be capability-gated. A provider adapter must prove that it can create an isolated environment, stage a pinned target, execute exact command arrays, apply the requested network policy, capture bounded output, collect artifacts and usage, report status, cancel, terminate, and verify cleanup. A requested policy that cannot be enforced must block before metered launch; recording policy intent without provider enforcement is insufficient.

Automatic cross-provider failover is allowed only before target code has executed and only after cleanup of the failed provider attempt is confirmed. A failure after target execution begins creates a new linked attempt from the beginning, preserving original/replacement provider IDs, template or image digests, policy translations, external execution IDs, failure reason, cleanup outcome, and duplicate usage. Evidence from partially executed provider attempts must not be merged as though it came from one reproducible environment.

## Local Backend Resolution

The Local Runtime Sandbox resolver evaluates backends in this order:

1. `gvisor_container`
2. `rootless_podman`
3. `podman`
4. `docker`
5. `docker_desktop`
6. `landlock_process`
7. `unavailable`

`gvisor_container` and `rootless_podman` are preferred for stronger local isolation. Docker Desktop on Windows/macOS is allowed only as a warning backend because it relies on a shared Linux VM boundary. `landlock_process` is a future lightweight option for single-process wrapping and is not the default backend for full app or agent runtime validation.

## Admin Policy

Runtime sandbox settings are stored in `preflight_json.runtime_sandbox`:

```json
{
  "enabled": true,
  "resolution_mode": "auto",
  "preferred_backend": "auto",
  "allowed_backends": [
    "gvisor_container",
    "rootless_podman",
    "podman",
    "docker",
    "docker_desktop"
  ],
  "allow_warning_backends": true,
  "require_hardened_for_untrusted_repo": false,
  "network_policy": "none",
  "dependency_install_network": "explicit_only",
  "runtime_probe_network": "never",
  "max_duration_ms": 300000,
  "step_timeout_ms": 60000,
  "memory_limit_mb": 2048,
  "pids_limit": 512,
  "max_stdout_bytes": 2000,
  "max_stderr_bytes": 2000,
  "max_file_bytes": 67108864,
  "max_workspace_bytes": 536870912,
  "max_artifact_bytes": 134217728
}
```

Resolution modes:

- `auto`: choose the strongest allowed available backend.
- `prefer`: try `preferred_backend`, then fall back through allowed backends.
- `pinned`: use only `preferred_backend`; block if unavailable.

Admin -> Runtime Sandbox shows:

- readiness status
- selected backend
- candidate probe results
- warnings and blockers
- allowed backend settings
- warning backend policy
- network and resource defaults
- setup guidance
- refresh readiness action

## Runtime Policy

Every runtime execution records a policy snapshot:

- provider id
- selected backend
- install/build/test/runtime-probe allowances
- network policy, phase, and outbound allowlist
- max duration and step timeout
- stdout/stderr excerpt caps
- memory, PID, per-file, and measured workspace/artifact limits
- filesystem policy

Defaults:

- network blocked
- dependency-install network requires explicit configuration and a non-empty hostname allowlist
- Docker dependency-install containers attach only to an internal network; a separate pinned proxy attached to that network and the Docker bridge validates exact/wildcard hostnames, permits only HTTP/HTTPS ports, and rejects private/local resolved addresses
- runtime probes remain network-none unless the policy authorizes runtime-probe egress and the exact step carries `external_network: true`; authorized probes use the same proxy boundary
- Node and Python runtime probes are verified from inside the target container against bounded loopback port/path candidates derived from the detected framework; a running process without an HTTP response below status 500 fails closed
- health polling is capped by the step/overall budget and a 10-second readiness ceiling; attempt evidence retains only port, path, status/error class, and duration, never response bodies
- steps requesting `fake_tool_api` receive a separate internal-only network, fixed synthetic service/tool URLs, a fixed fake secret, and bounded method/path/body-hash traces in artifact scratch; synthetic-service and external-egress phases cannot be combined in one step
- target mounted read-only where supported
- artifacts written only to the per-run artifact directory
- symlinks skipped during staging
- stdout/stderr capped
- only named synthetic credentials injected into target containers

Static audit mode must never execute target code.

## API

Community Edition runtime sandbox endpoints:

- `GET /runtime-sandbox/providers`
- `GET /runtime-sandbox/readiness`
- `POST /runtime-sandbox/readiness`
- `GET /runtime-sandbox/policy/defaults`
- `GET /runs/:runId/runtime-validation`

Launch gating:

- runtime/build/validate runs require Local Runtime Sandbox readiness
- `blocked` readiness returns `runtime_sandbox_not_ready`
- `ready_with_warnings` requires explicit preflight acceptance
- Cloud provider IDs return the stable `hosted_only` compatibility code

## Persistence And Observability

Runtime validation records are persisted as normalized Community Edition records:

- `runtime_validation_runs`
- `runtime_validation_steps`
- `runtime_validation_artifacts`
- `runtime_sandbox_readiness`
- `runtime_sandbox_events`

Each runtime validation stores:

- selected backend
- full candidate resolution
- readiness snapshot
- policy snapshot
- plan steps and command arrays
- stdout/stderr excerpts
- exit code, duration, and timeout state
- bounded health-probe strategy, attempted loopback targets, status/error classification, and successful target when present
- artifact paths
- linked run and finding ids
- generated evidence ids

Admin Observability should use these records to show runtime backend resolution, step timelines, stdout/stderr excerpts, artifacts, generated evidence, linked controls/findings, and failure source.

## Onboarding Commands

Runtime readiness is part of normal setup:

```bash
npm run scan -- setup-runtime --dry-run
npm run scan -- setup-runtime --yes
npm run scan -- runtime-doctor
npm run scan -- validate-runtime-fixtures
```

`setup-runtime --dry-run` prints the exact platform-specific setup plan. `setup-runtime --yes` executes only auto-supported package-manager commands after explicit operator confirmation, for example Docker Desktop through `winget` or `choco`, Docker through Homebrew, or Podman through Linux package managers. It does not silently install privileged runtimes.

The Community Edition web UI mirrors this flow in `System -> Setup -> Runtime Sandbox`:

- readiness and blockers remain visible when no backend is installed
- static-only audits remain available while runtime setup is skipped, blocked, or failed
- `Install Runtime Backend` runs only auto-supported setup commands after confirmation
- installer stdout/stderr and exit status are displayed in the latest setup attempt panel
- readiness is refreshed after setup so launch gating reflects the current machine state

Release gates:

```bash
npm run production:runtime-readiness
npm run production:runtime-native -- --backend docker_desktop
npm run production:harness-readiness
```

`production:runtime-native` pins one named backend, runs the readiness fixture plus a real dependency-free Node target through the production provider, retains backend/host/resource evidence, and requires zero Tethermark-owned runtime resources before and after the run. The manually dispatched `Native Runtime Verification` workflow executes Docker, rootless Podman, and gVisor on native Ubuntu runners and records the expected fail-closed Docker Desktop boundary on a native macOS runner. See [`native-runtime-verification.md`](native-runtime-verification.md).

`production:runtime-readiness` fails when no launchable local runtime backend is available or when the isolated runtime fixture does not execute successfully. The Docker/Docker Desktop fixture:

- uses a digest-pinned Alpine image and exact argv with host shell execution disabled
- runs as a non-root user with `--network none`, a read-only root filesystem, all capabilities dropped, and `no-new-privileges`
- mounts only a generated read-only source directory and generated writable output directory
- uses a bounded `noexec`, `nosuid`, `nodev` tmpfs plus CPU, memory, PID, time, output, and kernel per-file limits
- verifies source mutation, host-secret access, oversized file creation, and outbound HTTP fail; only a named synthetic credential crosses the boundary
- inspects the live container policy, persists structured evidence under `.artifacts/runtime-readiness/`, and proves container/temp cleanup

This fixture proves the selected backend can enforce the readiness policy. Real audit targets use `localRuntimeProvider.execute()`, which stages only regular source files/directories into a size-capped tmpfs-backed Docker workspace, uses a separate capped tmpfs for artifact scratch, keeps both mounts alive across isolated containers with a constrained non-root keeper, launches digest-pinned Node/Python/Alpine images with exact argv and no host fallback, applies a per-file kernel limit, measures both filesystems before accepting a step, copies only regular artifact files/directories to the host through a controlled collector, persists Docker state/stats and execution/cleanup metadata, and removes containers, networks, and volumes. Quota-exhaustion fixtures prove both filesystems fail with `ENOSPC`. Docker Desktop execution, governed dependency-install/runtime-probe allowlisting, and the synthetic service/tool backend are verified. Linux Docker, Podman, and gVisor evidence is produced by the native release workflow; macOS Docker Desktop remains a separate real-Mac gate.
