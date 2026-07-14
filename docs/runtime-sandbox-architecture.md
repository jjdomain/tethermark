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

Cloud provider code belongs in `D:\ai-security-audit-engine-hosted`, not the Community Edition repository. Community Edition API requests for Cloud provider IDs must return the stable `hosted_only` compatibility code with user-facing Cloud guidance.

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
  "max_duration_ms": 300000,
  "step_timeout_ms": 60000,
  "memory_limit_mb": 2048,
  "pids_limit": 512,
  "max_stdout_bytes": 2000,
  "max_stderr_bytes": 2000
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
- network policy and outbound allowlist
- max duration and step timeout
- stdout/stderr excerpt caps
- memory and PID limits
- filesystem policy

Defaults:

- network blocked
- dependency install network requires explicit configuration
- target mounted read-only where supported
- artifacts written only to the per-run artifact directory
- symlinks skipped during staging
- stdout/stderr capped

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
npm run production:harness-readiness
```

`production:runtime-readiness` fails when no launchable local runtime backend is available.
