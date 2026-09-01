import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { loadEnvironment } from "../dist/packages/core-engine/src/env.js";
import { BUNDLED_SEMGREP_RULESET_SHA256, resolveStaticToolInvocation } from "../dist/packages/core-engine/src/static-tool-policy.js";
import { buildToolPathEnv } from "../dist/packages/core-engine/src/tool-paths.js";
import {
  applyExceptions,
  buildReleaseCandidateIdentity,
  buildScorecardArguments,
  evaluateDependencyLicenses,
  evaluateNpmAudit,
  evaluateRepositoryLicense,
  evaluateScorecard,
  evaluateSemgrep,
  evaluateTrivy,
  policySha256,
  sanitizeScannerEnvironment,
  summarizeCheck,
  validateExceptions
} from "./release-security-lib.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const policyPath = path.join(repoRoot, "scripts", "release-security-policy.json");
const exceptionsPath = path.join(repoRoot, "scripts", "release-security-exceptions.json");
const reportPath = path.resolve(process.env.TETHERMARK_RELEASE_SECURITY_REPORT ?? path.join(repoRoot, ".artifacts", "release-security", "report.json"));
const maxBuffer = 128 * 1024 * 1024;

loadEnvironment();
const scorecardGithubToken = process.env.GITHUB_AUTH_TOKEN || process.env.GITHUB_TOKEN;
const scannerBaseEnvironment = sanitizeScannerEnvironment(process.env);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function validatePolicy(policy) {
  if (policy?.schema_version !== "2026-08-27.release-security.v1") throw new Error("Release security policy has an unsupported schema.");
  if (!Number.isInteger(policy.maximum_exception_days) || policy.maximum_exception_days < 1 || policy.maximum_exception_days > 90) throw new Error("Release security maximum_exception_days must be between 1 and 90.");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(policy.scorecard?.repository ?? "")) throw new Error("Release security Scorecard repository must be an explicit HTTPS github.com repository URL.");
  if (policy.scorecard?.negative_check_score_disposition !== "report_only") throw new Error("Release security Scorecard negative_check_score_disposition must be report_only.");
}

function safeErrorText(value) {
  return String(value)
    .replace(/\b(https?|ssh):\/\/([^\s/@:]+)(?::[^\s/@]*)?@/gi, "$1://[redacted]@")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-20)
    .join("\n")
    .slice(0, 2_000);
}

async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: repoRoot,
      env: { ...scannerBaseEnvironment, PATH: buildToolPathEnv(repoRoot), ...(options.env ?? {}) },
      encoding: "utf8",
      timeout: options.timeoutMs ?? 5 * 60_000,
      maxBuffer
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    const status = Number(error?.code);
    if (options.allowedExitCodes?.includes(status) && typeof error?.stdout === "string") {
      return { stdout: error.stdout, stderr: typeof error.stderr === "string" ? error.stderr : "" };
    }
    const signal = error?.signal ? ` (${error.signal})` : "";
    const detail = safeErrorText(typeof error?.stderr === "string" && error.stderr.trim() ? error.stderr : error?.message ?? error);
    throw new Error(`${path.basename(command)} execution failed${signal}: ${detail}`);
  }
}

function parseJsonOutput(label, stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${label} did not emit valid JSON.`);
  }
}

async function runNpmAudit() {
  const bundledNpmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const npmExecPath = process.env.npm_execpath || await fs.access(bundledNpmCli).then(() => bundledNpmCli).catch(() => null);
  if (process.platform === "win32" && !npmExecPath) throw new Error("npm CLI entrypoint unavailable; invoke the gate through npm run release:security.");
  const command = npmExecPath ? process.execPath : "npm";
  const args = npmExecPath ? [npmExecPath, "audit", "--json"] : ["audit", "--json"];
  const result = await run(command, args, { timeoutMs: 5 * 60_000, allowedExitCodes: [1] });
  return parseJsonOutput("npm audit", result.stdout);
}

async function runSemgrep() {
  const configPath = path.join(repoRoot, "config", "semgrep-release.yml");
  const configDigest = createHash("sha256").update(await fs.readFile(configPath)).digest("hex");
  if (configDigest !== BUNDLED_SEMGREP_RULESET_SHA256) throw new Error(`Release Semgrep rules checksum mismatch: expected ${BUNDLED_SEMGREP_RULESET_SHA256}, received ${configDigest}.`);
  const invocation = resolveStaticToolInvocation("semgrep");
  const targets = [
    { root: "apps", excludes: ["apps/web-ui/static"] },
    { root: "packages", excludes: ["packages/core-engine/src/test-runner.ts"] },
    { root: "scripts", excludes: [] },
    { root: "workers/python/src", excludes: [] }
  ];
  const merged = { results: [], errors: [] };
  for (const target of targets) {
    const excludeArgs = target.excludes.flatMap((item) => ["--exclude", item]);
    let result;
    try {
      result = await run(invocation.command, [
        ...invocation.prefix_args,
        "scan",
        "--config", configPath,
        "--json",
        "--metrics", "off",
        "--disable-version-check",
        "--jobs", "1",
        "--x-rule-validation", "none",
        "--exclude", "node_modules",
        "--exclude", "dist",
        "--exclude", ".artifacts",
        "--exclude", ".git",
        "--exclude", "fixtures",
        ...excludeArgs,
        target.root
      ], { timeoutMs: 5 * 60_000 });
    } catch (error) {
      throw new Error(`Semgrep (${target.root}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = parseJsonOutput(`Semgrep (${target.root})`, result.stdout);
    if (!Array.isArray(parsed?.results) || !Array.isArray(parsed?.errors)) throw new Error(`Semgrep (${target.root}) did not return its expected JSON result/error arrays.`);
    merged.results.push(...parsed.results);
    merged.errors.push(...parsed.errors);
  }
  return merged;
}

async function runTrivy() {
  const invocation = resolveStaticToolInvocation("trivy");
  const result = await run(invocation.command, [
    ...invocation.prefix_args,
    "fs",
    "--format", "json",
    "--quiet",
    "--scanners", "vuln,misconfig,secret,license",
    "--include-dev-deps",
    "--skip-dirs", "node_modules",
    "--skip-dirs", "dist",
    "--skip-dirs", ".artifacts",
    "--skip-dirs", ".git",
    "--skip-dirs", ".git-home",
    "--skip-dirs", ".npm-cache",
    "--skip-dirs", ".tethermark",
    "--skip-dirs", ".tmp",
    "--skip-dirs", "fixtures",
    "--skip-files", ".env",
    "--skip-files", ".env.local",
    "--skip-files", ".env.*.local",
    "--skip-files", ".codex/status.*",
    "--skip-files", "*.log",
    "--skip-files", "*.tsbuildinfo",
    "--skip-files", ".tethermark-install.json",
    "--skip-files", "Thumbs.db",
    "--skip-version-check",
    "--timeout", "10m",
    "."
  ], { timeoutMs: 11 * 60_000 });
  return parseJsonOutput("Trivy", result.stdout);
}

async function runScorecard(policy) {
  const invocation = resolveStaticToolInvocation("scorecard");
  const result = await run(invocation.command, [
    ...invocation.prefix_args,
    ...buildScorecardArguments(policy.scorecard.repository)
  ], {
    timeoutMs: 5 * 60_000,
    env: scorecardGithubToken ? { GITHUB_AUTH_TOKEN: scorecardGithubToken } : {}
  });
  return parseJsonOutput("OpenSSF Scorecard", result.stdout);
}

function reportCheck(checkId, tool, findings) {
  return summarizeCheck(checkId, tool, findings);
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await fs.chmod(reportPath, 0o600);
}

const startedAt = new Date().toISOString();
let candidate = null;
try {
  const [policy, exceptionDocument, packageLock, packageJson, rootEntries] = await Promise.all([
    readJson(policyPath),
    readJson(exceptionsPath),
    readJson(path.join(repoRoot, "package-lock.json")),
    readJson(path.join(repoRoot, "package.json")),
    fs.readdir(repoRoot)
  ]);
  validatePolicy(policy);
  const exceptions = validateExceptions(exceptionDocument, policy);
  candidate = buildReleaseCandidateIdentity({
    packageVersion: packageJson.version,
    revisionSha: (await run("git", ["rev-parse", "HEAD"])).stdout.trim(),
    checkoutStatus: (await run("git", ["status", "--porcelain", "--untracked-files=all"])).stdout
  });

  const npmAudit = await runNpmAudit();
  const semgrep = await runSemgrep();
  const trivy = await runTrivy();
  const scorecard = await runScorecard(policy);
  const trivyFindings = evaluateTrivy(trivy, policy);
  const checks = [
    reportCheck("dependency-vulnerabilities", "npm audit", evaluateNpmAudit(npmAudit, policy)),
    reportCheck("dependency-licenses", "package-lock.json", evaluateDependencyLicenses(packageLock, policy)),
    reportCheck("repository-license", "package.json and license file", evaluateRepositoryLicense(packageJson, rootEntries, policy)),
    reportCheck("semgrep", "Semgrep", evaluateSemgrep(semgrep, policy)),
    reportCheck("trivy-vulnerabilities", "Trivy", trivyFindings.vulnerabilities),
    reportCheck("trivy-licenses", "Trivy", trivyFindings.licenses),
    reportCheck("trivy-secrets", "Trivy", trivyFindings.secrets),
    reportCheck("trivy-misconfigurations", "Trivy", trivyFindings.misconfigurations),
    reportCheck("scorecard", "OpenSSF Scorecard", evaluateScorecard(scorecard, policy))
  ];
  const blockingFindings = checks.flatMap((check) => check.findings.filter((item) => item.blocking));
  const exceptionResult = applyExceptions(blockingFindings, exceptions);
  const blockingIds = new Set(exceptionResult.blocking.map((item) => item.finding_id));
  for (const check of checks) {
    check.blocking_count = check.findings.filter((item) => item.blocking && blockingIds.has(item.finding_id)).length;
    check.status = check.blocking_count ? "failed" : "passed";
  }
  const report = {
    schema_version: "2026-08-29.release-security-report.v2",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    candidate,
    policy_sha256: policySha256(policy),
    status: exceptionResult.blocking.length ? "failed" : "passed",
    scorecard_repository: policy.scorecard.repository,
    checks,
    applied_exceptions: exceptionResult.applied
  };
  await writeReport(report);
  console.log(JSON.stringify({ status: report.status, report_path: reportPath, checks: checks.map(({ check_id, status, blocking_count }) => ({ check_id, status, blocking_count })), applied_exceptions: report.applied_exceptions.length }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  const report = {
    schema_version: "2026-08-29.release-security-report.v2",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    candidate,
    status: "failed",
    execution_error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    checks: []
  };
  await writeReport(report);
  console.error(`[tethermark:release-security] ${report.execution_error}`);
  process.exitCode = 1;
}
