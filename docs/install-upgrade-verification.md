# Clean Install And Upgrade Verification

Tethermark validates the source installer and updater as executable release behavior, not only as printed command previews. The **Install And Upgrade Verification** workflow runs the same harness on the explicit support runners:

| Runner | Claim |
| --- | --- |
| Ubuntu 24.04 x64 | Clean source install, update, state preservation, post-update API/UI launch, and checked-in least-privilege server-profile contract. |
| Windows Server 2025 x64 | Clean source install, update, state preservation, and post-update API/UI launch. This covers the supported build/static/server-compatible path, not Windows 11 Docker Desktop runtime execution. |
| macOS 15 Apple silicon | Clean source install, update, state preservation, and post-update API/UI launch. Real Docker Desktop/runtime execution remains deferred and uncertified. |

The workflow is manually dispatchable and also runs for pull requests that change installers, first-run behavior, dependency locks, lifecycle validation, or deployment examples. Each native job retains a path- and credential-free JSON evidence file for 30 days.

## Executed lifecycle

`npm run test:install-upgrade` creates an isolated local bare Git remote and two distinct release refs with identical candidate content. Using the actual platform installer, it then:

1. performs a clean clone into a path containing spaces;
2. fetches and checks out the base ref detached;
3. runs the real `npm ci` lockfile installation and TypeScript build through `first-run --no-onboard`;
4. verifies the install marker, dependency tree, and compiled API entrypoint;
5. writes ignored local configuration and a state sentinel;
6. runs the real updater against the second ref;
7. proves the marker changed while configuration and state survived;
8. requires a clean release checkout after the update; and
9. launches the installed combined API/UI smoke test with the deterministic mock provider.

The two refs deliberately use the same tree. This isolates installer/update semantics from application schema migration, which has its own immutable old-schema fixture, failure injection, verified backup, rollback, and restored-history regression. It also avoids making this test depend on whatever unrelated commit happens to precede a release candidate.

## Local commands

The lightweight syntax, refusal, marker-redaction, and guarded-uninstall check remains:

```bash
npm run test:install-lifecycle
```

The real lifecycle is slower because it installs dependencies and builds twice:

```bash
npm run test:install-upgrade
npm run test:install-upgrade -- --output .artifacts/install-upgrade/local.json
```

Run the second command on a clean release commit. The evidence contains only platform/tool versions, commit hashes, timestamps, and boolean assertions; it excludes local paths and credentials.

## Acceptance and release evidence

A platform passes only when every assertion in its retained JSON is true and the workflow job succeeds. A dry run, successful `npm ci` in the source checkout, or a build-only matrix is not install/upgrade evidence.

Before closing the Phase 11 task for a release candidate:

1. dispatch **Install And Upgrade Verification** for the exact candidate commit;
2. require all three native jobs to pass;
3. download and inspect all three retained evidence files;
4. confirm the Ubuntu job also passed `test:service-deployment`;
5. link the workflow run in release records; and
6. keep the macOS runtime limitation explicit.

Container-runtime execution evidence remains governed by [Native Runtime Verification](./native-runtime-verification.md). The install workflow must not be used to infer Docker, Podman, gVisor, or real-Mac runtime support.

## Validated candidate

Community Edition commit `24286d9cd726e98de2877f709a0efd58fdb768e6` passed [Install And Upgrade Verification run 33156202491](https://github.com/jjdomain/tethermark/actions/runs/33156202491) on Ubuntu 24.04 x64, Windows Server 2025 x64, and macOS 15 arm64 on 2026-08-28. The three retained evidence records report `status: passed`, all nine lifecycle assertions true, and no local paths or credentials. The Ubuntu job also passed the server-profile contract.
