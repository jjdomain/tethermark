# Release Artifacts, SBOM, Checksums, And Signatures

Tethermark Community Edition source releases use a deterministic, tag-bound artifact contract. A signed release is created only by `.github/workflows/release-artifacts.yml` after the deterministic release suite and live release-security gate pass. GitHub Actions then uses its OIDC identity and `actions/attest` to create signed SLSA provenance and CycloneDX SBOM attestations. A signature proves artifact origin and integrity; it does not replace security review.

## Published artifact set

For package version `X.Y.Z`, the build produces:

| File | Purpose |
| --- | --- |
| `tethermark-ce-X.Y.Z-source.zip` | Reproducible source archive for Windows and general use. |
| `tethermark-ce-X.Y.Z-source.tar.gz` | Reproducible source archive for Unix-like systems. |
| `tethermark-ce-X.Y.Z.cdx.json` | CycloneDX 1.5 SBOM for the npm workspace graph and hash-locked Python worker environment. |
| `release-manifest.json` | Version, tag, full commit SHA, commit date, archive prefix, lock hashes, artifact sizes, and artifact hashes. |
| `SHA256SUMS` | Exact SHA-256 digest list for the four files above. |

The archives contain the tracked source tree at the tagged commit under one `tethermark-ce-X.Y.Z/` prefix. They do not embed `node_modules`, local `.env` data, build output, managed scanners, browsers, or runtime images. Those external tools remain governed by the separate checksum/digest lock and installation process.

## Reproducible local build

Use a clean checkout of a tag that exactly matches `package.json` (`vX.Y.Z`):

```bash
npm ci
npm run release:artifacts -- --tag vX.Y.Z
npm run release:verify
```

Output is written to `.artifacts/release`. The builder refuses a dirty checkout, a nonempty output directory, a tag/version mismatch, or a tag that does not resolve to `HEAD`. `--allow-dirty` exists only for the checked-in reproducibility regression and must never be used for a published release.

The archive bytes come from `git archive`. The SBOM generator removes npm's random UUID and wall-clock timestamp, replaces them with commit-derived values, canonicalizes JSON keys and dependency ordering, adds every hash-locked Python requirement and environment marker, and records both lockfile digests. `npm run test:release-artifacts` builds twice from the same commit, requires identical `SHA256SUMS`, verifies both outputs, and proves a modified archive is rejected.

## Offline checksum and manifest verification

After extracting the downloaded workflow artifact, run the cross-platform verifier from a trusted Tethermark checkout:

```bash
npm run release:verify -- /path/to/release-files
```

The verifier requires the exact artifact set, validates every SHA-256 digest and byte length, binds the JSON manifest to the checksum file, validates version/tag/revision structure, and confirms that the CycloneDX document contains both npm and Python components. On systems with GNU coreutils, `sha256sum --check SHA256SUMS` is an additional independent digest check.

## Verify GitHub signatures and provenance

Install a current GitHub CLI, then verify the checksum manifest and each source archive against the exact repository, tag, and signing workflow:

```bash
gh attestation verify SHA256SUMS \
  --repo jjdomain/tethermark \
  --source-ref refs/tags/vX.Y.Z \
  --signer-workflow jjdomain/tethermark/.github/workflows/release-artifacts.yml

gh attestation verify tethermark-ce-X.Y.Z-source.tar.gz \
  --repo jjdomain/tethermark \
  --source-ref refs/tags/vX.Y.Z \
  --signer-workflow jjdomain/tethermark/.github/workflows/release-artifacts.yml
```

Repeat the archive command for the `.zip`, SBOM JSON, and release manifest. The default predicate verifies SLSA build provenance.

Verify that the signed SBOM predicate is also bound to each source archive:

```bash
gh attestation verify tethermark-ce-X.Y.Z-source.tar.gz \
  --repo jjdomain/tethermark \
  --source-ref refs/tags/vX.Y.Z \
  --signer-workflow jjdomain/tethermark/.github/workflows/release-artifacts.yml \
  --predicate-type https://cyclonedx.org/bom
```

The workflow artifact also retains the generated Sigstore bundles. For offline verification, pass the applicable downloaded JSONL bundle with `--bundle`; the trusted-root material and offline procedure remain governed by the GitHub CLI version being used.

## Maintainer release sequence

1. Resolve every release-security blocker and remove expired/unused exceptions.
2. Update `package.json` and all release-version contracts, then run `npm run release:check` and `npm run release:security`.
3. Commit the exact release tree and create the matching annotated `vX.Y.Z` tag.
4. Push the tag, or manually dispatch **Signed Release Artifacts** for that existing tag.
5. Require the workflow's deterministic checks, live security checks, local artifact verification, provenance attestations, SBOM attestations, and upload to pass.
6. Download the retained artifact, independently run the checksum verifier and both `gh attestation verify` forms, then attach the verified files to the GitHub release.

Do not publish locally generated unsigned files as official releases, reuse attestations for rebuilt bytes, sign a branch name, or move a release tag after signing.
