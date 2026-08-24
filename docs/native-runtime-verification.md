# Native Runtime Verification

Tethermark records native runtime evidence separately for each operating-system and backend combination. A backend passes only when the named engine actually launches both the isolation readiness fixture and the real Node target through `localRuntimeProvider.execute()`.

## Commands

Build and verify one explicitly selected local backend:

```bash
npm run production:runtime-native -- --backend docker
npm run production:runtime-native -- --backend rootless_podman
npm run production:runtime-native -- --backend gvisor_container
npm run production:runtime-native -- --backend docker_desktop
```

The verifier fails closed unless all of the following hold:

- the requested backend is pinned and launchable
- the digest-pinned isolation fixture passes its runtime and inspected-policy assertions
- a dependency-free Node target runs tests, writes a collected artifact, and starts a bounded service in containers
- exact argv, non-root execution, default-deny network, filesystem policy, resource measurements, and backend identity are retained
- no `tethermark-*` containers, volumes, or networks exist before or after the run

Evidence is written under `.artifacts/runtime-native/<platform>-<backend>/native-runtime-verification.json`. The evidence records only Tethermark-owned resource names; unrelated host container, volume, and network names are not retained.

## GitHub-hosted native matrix

`.github/workflows/native-runtime-verification.yml` is a manually dispatched release workflow for the public repository:

- Ubuntu 24.04 with Docker
- Ubuntu 24.04 with rootless Podman
- Ubuntu 24.04 with gVisor `runsc` registered in Docker
- macOS 15 host-boundary verification

The macOS job intentionally expects the Docker Desktop backend to be blocked. GitHub's macOS runner proves native installation/build behavior and the absence of a false runtime selection, but cannot prove Docker Desktop execution because the hosted runner cannot provide the required nested Linux VM. A real Mac with Docker Desktop must run the `docker_desktop` executable command before Tethermark advertises macOS runtime validation as release-certified.

Windows GitHub-hosted runners have the same product-boundary role because they do not provide Docker Desktop. The executable Windows gate runs on a maintainer Windows machine with Docker Desktop's Linux engine.

## Acceptance boundary

Passing Linux Docker, rootless Podman, or gVisor evidence applies only to the exact OS, architecture, engine, and runtime versions recorded in the evidence. A blocked-boundary job is successful evidence that Tethermark fails closed; it is not evidence that runtime execution passed on that platform.
