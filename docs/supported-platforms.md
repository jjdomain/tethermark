# Supported Platforms And Versions

This document is the release support contract for Tethermark Community Edition. It distinguishes a release-tested configuration from a configuration that may work but has not passed the corresponding release gate.

## Support Terms

- **Supported** means the configuration is inside the declared version range and is exercised by repository CI, a retained native verification, or both.
- **Compatible** means the repository is expected to work and fails closed when a required capability is absent, but the exact combination is not part of the release evidence.
- **Not certified** means Tethermark must not advertise the configuration as having passed the relevant executable release gate.

A newer patch release within a supported major/minor line remains supported when it preserves the required capabilities. A new major version is compatible-only until the matrix and release evidence are deliberately updated.

## Language And Package Toolchain

| Component | Supported versions | Release baseline |
|---|---|---|
| Node.js | 22.x and 24.x LTS | Node 22 in GitHub Actions; Node 24.12.0 maintainer verification |
| npm | 10.x and 11.x | npm 11.6.2 maintainer verification |
| Python worker | 3.11, 3.12, and 3.13 | Python 3.11/3.13 worker matrix plus Python 3.12 static-scanner matrix |

`package.json` enforces the Node/npm major-version contract. `.nvmrc` selects Node 22 as the reproducible development and CI baseline. `workers/python/pyproject.toml` rejects Python versions below 3.11 and Python 3.14 or later.

## Operating Systems

| Operating system | Architecture | Core build, static audit, API/UI, and Python workers | Local runtime execution |
|---|---|---|---|
| Ubuntu 24.04 LTS | x64 | Supported | Supported with the backends below |
| Windows 11 | x64 | Supported | Supported with Docker Desktop's Linux engine |
| Windows Server 2025 | x64 | Supported by CI for build/static/worker paths | Not certified; GitHub-hosted Windows does not provide Docker Desktop |
| macOS 15 | Apple silicon | Supported by CI for build/static/worker paths | Not certified; the retained gate proves fail-closed backend selection only |

Other Linux distributions, Windows 10, future Windows/macOS majors, and other CPU architectures are compatible-only until they receive explicit release evidence. WSL2 may host Docker Desktop's Linux engine on a supported Windows 11 machine, but running the complete application inside an arbitrary WSL distribution is not a separately certified operating-system target.

## Container And Sandbox Backends

| Host and backend | Supported version or baseline | Status |
|---|---|---|
| Ubuntu 24.04 x64, Docker Engine | 28.0.4 through 29.x | Executable runtime gate certified |
| Ubuntu 24.04 x64, rootless Podman | 5.8.4 through 5.x | Executable runtime gate certified; rootless mode must be proven |
| Ubuntu 24.04 x64, gVisor `runsc` with Docker | Signed `runsc` package plus Docker 28.0.4 through 29.x | Executable runtime gate certified only when `runsc` is registered and explicitly selected |
| Windows 11 x64, Docker Desktop | Docker Desktop 4.66.x with Linux Engine 29.x | Executable runtime gate certified on the maintainer machine |
| macOS 15, Docker Desktop | No release-certified version | Deferred; do not infer execution support from the macOS boundary job |

The runtime doctor and native verifier remain capability gates: an executable must be discoverable, the requested backend must be selected, isolation assertions must pass, and the real fixture must launch and clean up. Merely matching a version does not constitute runtime readiness. Rootful Podman and versions outside this table are compatible-only.

See [Native Runtime Verification](./native-runtime-verification.md) for the retained evidence and exact acceptance boundary.

## Browsers

The web UI release gate uses the browser engines bundled by the exact `playwright` 1.60.0 dependency:

| Browser engine | Reproducible release version |
|---|---|
| Chromium / Chrome for Testing | 148.0.7778.96, Playwright build 1223 |
| Firefox | 150.0.2, Playwright build 1522 |
| WebKit | 26.4, Playwright build 2287 |

The manually dispatched static release workflow runs the same UI scenario in all three engines. Chromium is the default local E2E engine; set `TETHERMARK_STATIC_PI_UI_BROWSER` to `firefox` or `webkit` to select another installed Playwright browser. User-installed Chrome, Edge, Firefox, and Safari releases that use an equivalent or newer engine are compatible, but only the pinned Playwright builds are reproducible release evidence.

Install the exact browser payloads with:

```bash
npx playwright install chromium firefox webkit
```

Linux CI uses `npx playwright install --with-deps <browser>` so required system libraries are installed with the selected engine.

## Updating This Contract

A version claim changes only when all of the following are committed together:

1. package/runtime constraints and pinned workflow runner labels;
2. a passing build/static/worker/browser or native-runtime gate appropriate to the claim;
3. updated retained evidence for native execution claims; and
4. this matrix, the release checklist, and the production phase tracker.

Do not replace explicit GitHub runner labels with `*-latest`: that silently changes the operating-system support contract.
