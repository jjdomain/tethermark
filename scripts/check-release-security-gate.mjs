import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  applyExceptions,
  evaluateDependencyLicenses,
  evaluateNpmAudit,
  evaluateRepositoryLicense,
  evaluateScorecard,
  evaluateSemgrep,
  evaluateTrivy,
  sanitizeScannerEnvironment,
  summarizeCheck,
  validateExceptions
} from "./release-security-lib.mjs";

const root = process.cwd();
const policy = JSON.parse(await fs.readFile(path.join(root, "scripts", "release-security-policy.json"), "utf8"));
const packageLock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));

assert.deepEqual(sanitizeScannerEnvironment({ PATH: "safe", OPENAI_API_KEY: "secret", GITHUB_AUTH_TOKEN: "token", HARNESS_PASSWORD: "password" }), { PATH: "safe" });

assert.deepEqual(evaluateDependencyLicenses(packageLock, policy), []);
const badLicense = structuredClone(packageLock);
badLicense.packages["node_modules/example-restricted"] = { name: "example-restricted", version: "1.0.0", license: "GPL-3.0-only" };
assert.equal(evaluateDependencyLicenses(badLicense, policy)[0]?.blocking, true);
assert.equal(evaluateRepositoryLicense({ private: true }, [], policy).length, 2);
assert.deepEqual(evaluateRepositoryLicense({ license: "Apache-2.0" }, ["LICENSE"], policy), []);

const npmFindings = evaluateNpmAudit({
  auditReportVersion: 2,
  vulnerabilities: {
    lowpkg: { severity: "low", range: "<2", via: [{ source: 1001 }] },
    highpkg: { severity: "high", range: "<3", via: [{ source: 1002 }] }
  }
}, policy);
assert.equal(npmFindings.length, 2);
assert.equal(npmFindings.find((item) => item.location === "lowpkg")?.blocking, false);
assert.equal(npmFindings.find((item) => item.location === "highpkg")?.blocking, true);
assert.throws(() => evaluateNpmAudit({ message: "network unavailable" }, policy), /did not return/);

const semgrepFindings = evaluateSemgrep({
  results: [
    { check_id: "warning.rule", path: "src/a.ts", start: { line: 1 }, extra: { severity: "WARNING", message: "review this" } },
    { check_id: "error.rule", path: "src/b.ts", start: { line: 2 }, extra: { severity: "ERROR", message: "block this" } }
  ],
  errors: []
}, policy);
assert.equal(semgrepFindings.find((item) => item.finding_id.includes("warning.rule"))?.blocking, false);
assert.equal(semgrepFindings.find((item) => item.finding_id.includes("error.rule"))?.blocking, true);
assert.throws(() => evaluateSemgrep({ results: [], errors: [{ level: "error" }] }, policy), /scan error/);

const sensitiveMatch = "github_pat_must_never_be_written_to_the_report";
const trivy = evaluateTrivy({
  Results: [{
    Target: "package-lock.json",
    Vulnerabilities: [
      { VulnerabilityID: "CVE-TEST-LOW", Severity: "LOW", PkgName: "lowpkg" },
      { VulnerabilityID: "CVE-TEST-HIGH", Severity: "HIGH", PkgName: "highpkg", FixedVersion: "2.0.0" }
    ],
    Licenses: [{ Name: "AGPL-3.0-only", Severity: "CRITICAL", Category: "forbidden", PkgName: "badpkg" }],
    Secrets: [{ RuleID: "github-pat", Severity: "HIGH", Title: "GitHub token", StartLine: 8, Match: sensitiveMatch }],
    Misconfigurations: [{ ID: "CFG-HIGH", Severity: "HIGH", Title: "Unsafe workflow", CauseMetadata: { StartLine: 4 } }]
  }]
}, policy);
assert.equal(trivy.vulnerabilities.length, 2);
assert.equal(trivy.vulnerabilities.find((item) => item.finding_id.includes("CVE-TEST-LOW"))?.blocking, false);
assert.equal(trivy.secrets[0]?.blocking, true);
assert.doesNotMatch(JSON.stringify(trivy), new RegExp(sensitiveMatch));
assert.equal(trivy.licenses[0]?.blocking, true);
assert.equal(trivy.misconfigurations[0]?.blocking, true);

const scorecardFindings = evaluateScorecard({
  score: 4.9,
  checks: [
    { name: "Dangerous-Workflow", score: 10 },
    { name: "Pinned-Dependencies", score: 4 },
    { name: "Token-Permissions", score: 10 }
  ]
}, policy);
assert.equal(scorecardFindings.some((item) => item.finding_id.endsWith(":overall")), true);
assert.equal(scorecardFindings.some((item) => item.finding_id.endsWith(":Pinned-Dependencies")), true);
const inapplicableScorecard = evaluateScorecard({
  score: 6,
  checks: [
    { name: "Dangerous-Workflow", score: -1, reason: "no workflows found" },
    { name: "Pinned-Dependencies", score: -1, reason: "no dependencies found" },
    { name: "Token-Permissions", score: -1, reason: "No tokens found" }
  ]
}, policy);
assert.equal(inapplicableScorecard.length, 3);
assert.equal(inapplicableScorecard.every((item) => item.blocking === false), true);
assert.equal(evaluateScorecard({ score: 6, checks: [] }, policy).every((item) => item.blocking === true), true);

const blockingFinding = trivy.secrets[0];
const validException = {
  schema_version: "2026-08-27.release-security-exceptions.v1",
  exceptions: [{
    finding_id: blockingFinding.finding_id,
    reason: "Synthetic test credential cannot authenticate anywhere.",
    owner: "security-maintainer",
    approved_by: "release-maintainer",
    approved_on: "2026-08-27",
    expires_on: "2026-09-26"
  }]
};
const validated = validateExceptions(validException, policy, new Date("2026-08-28T00:00:00.000Z"));
assert.equal(applyExceptions([blockingFinding], validated).blocking.length, 0);
assert.throws(() => applyExceptions([], validated), /Unused release security exception/);
assert.throws(() => validateExceptions({ ...validException, exceptions: [{ ...validException.exceptions[0], finding_id: "trivy-secrets:*" }] }, policy, new Date("2026-08-28T00:00:00.000Z")), /wildcards are forbidden/);
assert.throws(() => validateExceptions(validException, policy, new Date("2026-10-01T00:00:00.000Z")), /expired/);

const summary = summarizeCheck("trivy-secrets", "Trivy", trivy.secrets);
assert.equal(summary.status, "failed");
assert.equal(summary.finding_count, 1);
assert.equal(summary.blocking_count, 1);

console.log("Release security policy and parser checks passed.");
