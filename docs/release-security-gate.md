# Release Security Gate And Triage Policy

Tethermark's Phase 11 release-security gate evaluates the repository itself rather than only proving that scanners can execute. It is separate from an audit result produced for a customer target. A release is blocked when the gate cannot run completely or when an unexcepted finding crosses a checked-in threshold.

## Run the gate

From a clean checkout with Node.js dependencies installed:

```bash
npm run scan -- setup-tools --yes
npm run release:security
```

The setup command installs the checksum-locked Scorecard, Semgrep, and Trivy versions. The release command writes a sanitized report to `.artifacts/release-security/report.json`. Raw secret matches are held only in a temporary scanner response and are never copied into the retained report.

Trivy scans the releasable checkout and explicitly excludes the same generated, private, dependency, fixture, and local-runtime paths ignored by the repository, including `.env`, `.tmp`, `.tethermark`, `node_modules`, and build output. Tracked examples, source, locks, workflows, scripts, and deployment configuration remain in scope. Semgrep scans the production source roots with the checksum-bound rules and single-worker execution. Its separate pre-scan rule-validation RPC is disabled because the actual scan subprocess still validates the rules and the extra RPC is unstable in the pinned Windows build.

The live gate needs the npm advisory service, Trivy databases/check bundles, GitHub, and the repository configured in `scripts/release-security-policy.json`. Scorecard uses Git checkout mode so repository policy files such as `.github/dependabot.yml` are evaluated even when GitHub's generated source archive omits them. In GitHub Actions, `GITHUB_TOKEN` is passed only to Scorecard as its read-only authentication token. Other API keys, tokens, passwords, authentication values, and credential variables loaded by the parent environment are removed from scanner child environments. A missing tool, unavailable data source, timeout, malformed scanner response, or scan error fails the gate and cannot be waived.

## Enforced checks

| Check | Release-blocking policy |
| --- | --- |
| npm dependency advisories | High and critical advisories block. Low and moderate advisories remain visible for triage. |
| Dependency licenses | Every external package in `package-lock.json` must have an allowed SPDX expression. Trivy unknown, restricted/high, and forbidden/critical license results block. |
| Repository license | The root package must declare an approved open-source SPDX expression and include `LICENSE`, `LICENSE.md`, or `LICENSE.txt`. Selecting Tethermark's license is a maintainer/legal decision, not a scanner waiver. |
| Secrets | Every Trivy secret finding blocks, regardless of severity. The retained finding contains rule, path, and line—not the matched credential. |
| Semgrep | Scanner errors fail closed. ERROR findings block; warning and informational findings remain in the sanitized report for triage. The checksum-bound bundled rules run with metrics and version checks disabled. |
| Trivy vulnerability and misconfiguration | High and critical results block. Lower severities remain visible. Development dependencies are included. |
| OpenSSF Scorecard | Overall score must be at least 5.0. Applicable Dangerous-Workflow, Pinned-Dependencies, and Token-Permissions checks must each score at least 5. A missing or malformed named check fails closed; Scorecard's negative “not applicable” scores remain visible but are not compared with a numeric floor. |

The authoritative machine policy is `scripts/release-security-policy.json`. Threshold changes are security-policy changes: explain them in review and do not lower them merely to turn a failing run green.

## Triage workflow

For every blocker:

1. Confirm the scanner completed with the pinned version and current data. Tool/data failure is not a finding and cannot be excepted; rerun after fixing the environment.
2. Reproduce the finding and identify the affected package, file, rule, and release impact.
3. Prefer remediation: update/remove the dependency, remove and rotate a secret, fix code/configuration, or improve repository controls.
4. If immediate remediation is genuinely unsafe or impossible, add one exact entry to `scripts/release-security-exceptions.json`. Copy the stable `finding_id` from the sanitized report.
5. Record a specific reason, accountable owner, approving maintainer, approval date, and expiry date. Wildcards, duplicate entries, vague reasons, expired entries, periods over 90 days, and exceptions that no longer match a finding all fail closed.
6. Remove the exception as soon as the finding is resolved. Re-run the complete gate before release.

An exception is time-bounded acceptance of one observed risk. It does not make the scanner result a pass, authorize publication of secrets, excuse a scanner failure, or change Tethermark's supported deployment boundary.

## CI evidence

Deterministic parser, threshold, redaction, and exception-lifecycle checks run automatically in the normal native CI matrix without network access. The Static Audit Release Gate exposes the live Ubuntu release-security run as the explicit `run_release_security` workflow-dispatch option with read-only repository permissions after installing the checksum-locked scanners; its sanitized report is uploaded even on failure. It is not run on every pull request while documented release blockers remain, avoiding routine failure notifications that do not represent regressions.
