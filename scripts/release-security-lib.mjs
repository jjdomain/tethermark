import { createHash } from "node:crypto";

const severityOrder = new Map([["UNKNOWN", 0], ["LOW", 1], ["MEDIUM", 2], ["HIGH", 3], ["CRITICAL", 4]]);

export function buildScorecardArguments(repository) {
  return [
    "--format", "json",
    "--show-details",
    "--file-mode", "git",
    "--repo", repository
  ];
}

export function sanitizeScannerEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment ?? {}).filter(([key]) => !/(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)/i.test(key)));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSeverity(value) {
  const severity = text(value).toUpperCase();
  return severityOrder.has(severity) ? severity : "UNKNOWN";
}

function stablePart(value) {
  return text(value).replace(/\\/g, "/").replace(/\s+/g, "-").replace(/[^A-Za-z0-9._/@:+-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "unknown";
}

function finding(checkId, id, severity, summary, location = null, blocking = true) {
  return {
    finding_id: `${checkId}:${stablePart(id)}`,
    severity: normalizedSeverity(severity),
    summary: text(summary).slice(0, 300),
    location: location ? text(location).replace(/\\/g, "/").slice(0, 300) : null,
    blocking
  };
}

function spdxTokens(expression) {
  if (!text(expression) || /SEE LICENSE|UNLICENSED|UNKNOWN/i.test(expression)) return [];
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((item) => item && !["AND", "OR", "WITH"].includes(item.toUpperCase()));
}

export function evaluateDependencyLicenses(packageLock, policy) {
  const allowed = new Set(policy.dependency_licenses.allowed_spdx_ids);
  const findings = [];
  for (const [packagePath, metadata] of Object.entries(packageLock?.packages ?? {})) {
    if (!packagePath.startsWith("node_modules/") || metadata?.link) continue;
    const packageName = text(metadata?.name) || packagePath.slice("node_modules/".length);
    const license = text(metadata?.license);
    const tokens = spdxTokens(license);
    if (!tokens.length || tokens.some((item) => !allowed.has(item))) {
      findings.push(finding("dependency-licenses", `${packageName}@${metadata?.version ?? "unknown"}:${license || "missing"}`, "HIGH", `${packageName}@${metadata?.version ?? "unknown"} uses unapproved or missing license expression ${license || "(missing)"}.`, packagePath));
    }
  }
  return findings;
}

export function evaluateRepositoryLicense(packageJson, presentLicenseFiles, policy) {
  const findings = [];
  const declaration = text(packageJson?.license);
  const declaredTokens = spdxTokens(declaration);
  const allowed = new Set(policy.repository_license.allowed_spdx_ids);
  if (!declaredTokens.length || declaredTokens.some((item) => !allowed.has(item))) {
    findings.push(finding("repository-license", "package-json-license", "HIGH", "The root package.json does not declare an approved open-source SPDX license expression.", "package.json"));
  }
  const accepted = new Set(policy.repository_license.accepted_filenames);
  if (!presentLicenseFiles.some((item) => accepted.has(item))) {
    findings.push(finding("repository-license", "license-file", "HIGH", `No top-level license file is present (${[...accepted].join(", ")}).`));
  }
  return findings;
}

export function evaluateNpmAudit(audit, policy) {
  if (!audit || typeof audit !== "object" || audit.auditReportVersion !== 2 || !audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
    throw new Error(`npm audit did not return an auditReportVersion 2 vulnerability report${audit?.message ? `: ${text(audit.message).slice(0, 200)}` : "."}`);
  }
  const blocking = new Set(policy.dependency_vulnerabilities.blocking_severities.map((item) => item.toUpperCase()));
  const findings = [];
  for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities)) {
    const severity = normalizedSeverity(vulnerability?.severity);
    const advisoryIds = (Array.isArray(vulnerability?.via) ? vulnerability.via : [])
      .flatMap((item) => typeof item === "object" && item ? [item.source, item.url] : [])
      .filter(Boolean)
      .map(String);
    const advisory = advisoryIds[0] ?? vulnerability?.range ?? "advisory";
    findings.push(finding("dependency-vulnerabilities", `${packageName}:${advisory}`, severity, `${packageName} has a ${severity.toLowerCase()} dependency advisory in range ${vulnerability?.range ?? "unknown"}.`, packageName, blocking.has(severity)));
  }
  return findings;
}

export function evaluateSemgrep(report, policy) {
  if (!report || typeof report !== "object" || !Array.isArray(report.results) || !Array.isArray(report.errors)) {
    throw new Error("Semgrep did not return its expected JSON result/error arrays.");
  }
  const blocking = new Set(policy.semgrep.blocking_severities.map((item) => item.toUpperCase()));
  const findings = [];
  for (const result of report.results) {
    const severity = text(result?.extra?.severity).toUpperCase() || "WARNING";
    findings.push(finding("semgrep", `${result?.check_id ?? "rule"}:${result?.path ?? "unknown"}:${result?.start?.line ?? 0}`, severity === "ERROR" ? "HIGH" : severity === "WARNING" ? "MEDIUM" : "LOW", result?.extra?.message ?? result?.check_id ?? "Semgrep finding", result?.path, blocking.has(severity)));
  }
  const fatalErrors = report.errors.filter((error) => text(error?.level).toLowerCase() === "error" || !error?.level);
  if (fatalErrors.length) throw new Error(`Semgrep reported ${fatalErrors.length} scan error(s).`);
  return findings;
}

function trivyResults(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.Results)) throw new Error("Trivy did not return its expected JSON Results array.");
  return report.Results;
}

export function evaluateTrivy(report, policy) {
  const vulnerabilityBlocking = new Set(policy.dependency_vulnerabilities.blocking_severities.map((item) => item.toUpperCase()));
  const licenseBlocking = new Set(policy.dependency_licenses.blocking_trivy_severities.map((item) => item.toUpperCase()));
  const secretBlocking = new Set(policy.secrets.blocking_severities.map((item) => item.toUpperCase()));
  const misconfigurationBlocking = new Set(policy.trivy_misconfigurations.blocking_severities.map((item) => item.toUpperCase()));
  const groups = { vulnerabilities: [], licenses: [], secrets: [], misconfigurations: [] };
  for (const result of trivyResults(report)) {
    const target = text(result?.Target) || "unknown-target";
    for (const item of Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : []) {
      const severity = normalizedSeverity(item?.Severity);
      groups.vulnerabilities.push(finding("trivy-vulnerabilities", `${item?.VulnerabilityID ?? "unknown"}:${item?.PkgName ?? "package"}:${target}`, severity, `${item?.VulnerabilityID ?? "Vulnerability"} affects ${item?.PkgName ?? "a dependency"}${item?.FixedVersion ? `; fixed in ${item.FixedVersion}` : "; no fixed version was reported"}.`, target, vulnerabilityBlocking.has(severity)));
    }
    for (const item of Array.isArray(result?.Licenses) ? result.Licenses : []) {
      const severity = normalizedSeverity(item?.Severity);
      groups.licenses.push(finding("trivy-licenses", `${item?.Name ?? "unknown"}:${item?.PkgName ?? "package"}:${target}`, severity, `${item?.PkgName ?? target} includes ${item?.Name ?? "an unknown license"} (${item?.Category ?? "unclassified"}).`, target, licenseBlocking.has(severity)));
    }
    for (const item of Array.isArray(result?.Secrets) ? result.Secrets : []) {
      const severity = normalizedSeverity(item?.Severity);
      groups.secrets.push(finding("trivy-secrets", `${item?.RuleID ?? "secret"}:${target}:${item?.StartLine ?? 0}`, severity, item?.Title ?? item?.RuleID ?? "Potential secret detected", `${target}:${item?.StartLine ?? 0}`, secretBlocking.has(severity)));
    }
    for (const item of Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : []) {
      const severity = normalizedSeverity(item?.Severity);
      groups.misconfigurations.push(finding("trivy-misconfigurations", `${item?.ID ?? "misconfiguration"}:${target}:${item?.CauseMetadata?.StartLine ?? 0}`, severity, item?.Title ?? item?.Message ?? item?.ID ?? "Misconfiguration detected", `${target}:${item?.CauseMetadata?.StartLine ?? 0}`, misconfigurationBlocking.has(severity)));
    }
  }
  return groups;
}

export function evaluateScorecard(report, policy) {
  if (!report || typeof report !== "object" || !Array.isArray(report.checks) || !Number.isFinite(Number(report.score))) {
    throw new Error("Scorecard did not return an overall score and checks array.");
  }
  const findings = [];
  const overall = Number(report.score);
  if (overall < policy.scorecard.minimum_overall_score) {
    findings.push(finding("scorecard", "overall", "HIGH", `OpenSSF Scorecard overall score ${overall.toFixed(1)} is below the ${policy.scorecard.minimum_overall_score.toFixed(1)} release floor.`));
  }
  for (const [checkName, minimum] of Object.entries(policy.scorecard.minimum_check_scores)) {
    const check = report.checks.find((item) => text(item?.name) === checkName);
    const score = Number(check?.score);
    if (!check || !Number.isFinite(score)) {
      findings.push(finding("scorecard", checkName, "HIGH", `${checkName} score ${Number.isFinite(score) ? score : "inconclusive"} is below the ${minimum} release floor.`));
    } else if (score < 0 && policy.scorecard.negative_check_score_disposition === "report_only") {
      findings.push(finding("scorecard", checkName, "LOW", `${checkName} was not applicable (${text(check.reason) || `Scorecard score ${score}`}); its numeric floor was not applied.`, null, false));
    } else if (score < minimum) {
      findings.push(finding("scorecard", checkName, "HIGH", `${checkName} score ${score} is below the ${minimum} release floor.`));
    }
  }
  return findings;
}

export function validateExceptions(document, policy, now = new Date()) {
  if (document?.schema_version !== "2026-08-27.release-security-exceptions.v1" || !Array.isArray(document.exceptions)) {
    throw new Error("Release security exceptions file has an unsupported schema.");
  }
  const seen = new Set();
  return document.exceptions.map((entry, index) => {
    const required = ["finding_id", "reason", "owner", "approved_by", "approved_on", "expires_on"];
    for (const key of required) if (!text(entry?.[key])) throw new Error(`Exception ${index + 1} is missing ${key}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.approved_on) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires_on)) throw new Error(`Exception ${entry.finding_id} dates must use YYYY-MM-DD.`);
    if (entry.finding_id.includes("*") || entry.finding_id.includes("?")) throw new Error(`Exception ${entry.finding_id} must identify one exact finding; wildcards are forbidden.`);
    if (text(entry.reason).length < 20) throw new Error(`Exception ${entry.finding_id} needs a meaningful reason of at least 20 characters.`);
    if (seen.has(entry.finding_id)) throw new Error(`Duplicate exception for ${entry.finding_id}.`);
    seen.add(entry.finding_id);
    const approved = new Date(`${entry.approved_on}T00:00:00.000Z`);
    const expires = new Date(`${entry.expires_on}T23:59:59.999Z`);
    if (!Number.isFinite(approved.getTime()) || !Number.isFinite(expires.getTime()) || expires < approved) throw new Error(`Exception ${entry.finding_id} has invalid approval/expiry dates.`);
    const maximumExpiry = new Date(approved.getTime() + (policy.maximum_exception_days + 1) * 86_400_000 - 1);
    if (expires > maximumExpiry) throw new Error(`Exception ${entry.finding_id} exceeds the ${policy.maximum_exception_days}-day maximum.`);
    if (expires < now) throw new Error(`Exception ${entry.finding_id} expired on ${entry.expires_on}.`);
    return { ...entry };
  });
}

export function applyExceptions(findings, exceptions) {
  const byId = new Map(exceptions.map((entry) => [entry.finding_id, entry]));
  const applied = [];
  const blocking = [];
  for (const item of findings) {
    const exception = byId.get(item.finding_id);
    if (exception) applied.push({ finding_id: item.finding_id, owner: exception.owner, expires_on: exception.expires_on });
    else blocking.push(item);
  }
  const matched = new Set(applied.map((item) => item.finding_id));
  const unused = exceptions.filter((entry) => !matched.has(entry.finding_id)).map((entry) => entry.finding_id);
  if (unused.length) throw new Error(`Unused release security exception(s) must be removed: ${unused.join(", ")}`);
  return { blocking, applied };
}

export function policySha256(policy) {
  return createHash("sha256").update(JSON.stringify(policy), "utf8").digest("hex");
}

export function summarizeCheck(checkId, tool, findings) {
  const blockingCount = findings.filter((item) => item.blocking).length;
  return {
    check_id: checkId,
    tool,
    status: blockingCount ? "failed" : "passed",
    finding_count: findings.length,
    blocking_count: blockingCount,
    findings: findings.sort((left, right) => (severityOrder.get(right.severity) ?? 0) - (severityOrder.get(left.severity) ?? 0) || left.finding_id.localeCompare(right.finding_id))
  };
}
