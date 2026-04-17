import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  AuditRequest,
  EvidenceExecutionRecord,
  EvidenceProviderDescriptor,
  NormalizedEvidenceSummary
} from "./contracts.js";
import { getPythonWorkerCapability, invokePythonWorker, resolvePythonWorkerAdapter } from "./python-worker.js";

const execFileAsync = promisify(execFile);

type ProviderFailureCategory = NonNullable<EvidenceExecutionRecord["failure_category"]>;
type CapabilityStatus = NonNullable<EvidenceExecutionRecord["capability_status"]>;
type ProviderFailure = { category: ProviderFailureCategory; capability: CapabilityStatus; message: string };

let localBinaryExecutionProbe: Promise<ProviderFailure | null> | null = null;

function emptyNormalized(resultType: NormalizedEvidenceSummary["result_type"], extra?: Partial<NormalizedEvidenceSummary>): NormalizedEvidenceSummary {
  return {
    result_type: resultType,
    signal_count: 0,
    issue_count: 0,
    warning_count: 0,
    error_count: 0,
    severity_counts: { low: 0, medium: 0, high: 0, critical: 0 },
    ecosystems: [],
    coverage_paths: [],
    notes: [],
    ...(extra ?? {})
  };
}

function pushSeverity(summary: NormalizedEvidenceSummary, severity: string | null | undefined): void {
  const normalized = String(severity ?? "").toLowerCase();
  if (normalized === "low") summary.severity_counts.low += 1;
  if (normalized === "medium") summary.severity_counts.medium += 1;
  if (normalized === "high") summary.severity_counts.high += 1;
  if (normalized === "critical") summary.severity_counts.critical += 1;
}

async function runCommand(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw error;
    }
    return {
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : String(error)
    };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = safeJsonParse(trimmed);
  if (direct) return direct;

  const opens = ["{", "["];
  const closes = new Set(["}", "]"]);
  let best: unknown = null;

  for (let start = 0; start < trimmed.length; start += 1) {
    if (!opens.includes(trimmed[start] ?? "")) continue;
    for (let end = trimmed.length - 1; end > start; end -= 1) {
      if (!closes.has(trimmed[end] ?? "")) continue;
      const candidate = safeJsonParse(trimmed.slice(start, end + 1));
      if (candidate) return candidate;
      if (best === null && end - start > 20) {
        best = candidate;
      }
    }
  }

  return best;
}

function parseCommandJson(stdout: string, stderr: string): unknown {
  return extractJsonCandidate(stdout) ?? extractJsonCandidate(stderr);
}

function classifyCommandFailure(stdout: string, stderr: string): ProviderFailure | null {
  const combined = `${stdout}\n${stderr}`;
  const message = combined.trim().split(/\r?\n/).find(Boolean) ?? "Command unavailable.";
  if (/spawn EPERM|operation not permitted|access is denied/i.test(combined)) {
    return {
      category: "sandbox_blocked",
      capability: "blocked",
      message: `Local binary execution blocked by host environment (${message}).`
    };
  }
  if (/is not recognized as the name of a cmdlet|command not found|no such file or directory|ENOENT/i.test(combined)) {
    return { category: "command_unavailable", capability: "unavailable", message };
  }
  return null;
}

async function detectLocalBinaryExecutionBlocked(): Promise<ProviderFailure | null> {
  if (process.env.HARNESS_DISABLE_LOCAL_BINARIES === "1") {
    return {
      category: "sandbox_blocked",
      capability: "blocked",
      message: "Local binary execution disabled by HARNESS_DISABLE_LOCAL_BINARIES."
    };
  }
  if (!localBinaryExecutionProbe) {
    localBinaryExecutionProbe = (async () => {
      try {
        await execFileAsync(process.execPath, ["-e", ""], { maxBuffer: 1024 * 1024 });
        return null;
      } catch (error: any) {
        return classifyCommandFailure("", error?.message ?? String(error));
      }
    })();
  }
  return localBinaryExecutionProbe;
}

export async function getLocalBinaryExecutionCapability(): Promise<{ status: "available" | "blocked"; message: string | null }> {
  const blocked = await detectLocalBinaryExecutionBlocked();
  return blocked
    ? { status: "blocked", message: blocked.message }
    : { status: "available", message: null };
}

export function resetEvidenceProviderCapabilityCacheForTests(): void {
  localBinaryExecutionProbe = null;
}

function summarizeScorecard(parsed: any): string {
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  if (!checks.length) return "Scorecard produced no parsed checks.";
  const lowChecks = checks.filter((item: any) => typeof item?.score === "number" && item.score < 5);
  return `Scorecard parsed ${checks.length} checks with ${lowChecks.length} scoring below 5.`;
}

function summarizeSemgrep(parsed: any): string {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const errors = Array.isArray(parsed?.errors) ? parsed.errors.length : 0;
  return `Semgrep parsed ${results.length} findings${errors ? ` with ${errors} parser/runtime errors` : ""}.`;
}

function summarizeTrivy(parsed: any): string {
  const results = Array.isArray(parsed?.Results) ? parsed.Results : [];
  const vulnerabilities = results.reduce((sum: number, item: any) => sum + (Array.isArray(item?.Vulnerabilities) ? item.Vulnerabilities.length : 0), 0);
  const misconfigurations = results.reduce((sum: number, item: any) => sum + (Array.isArray(item?.Misconfigurations) ? item.Misconfigurations.length : 0), 0);
  return `Trivy parsed ${vulnerabilities} vulnerabilities and ${misconfigurations} misconfigurations.`;
}

function normalizeScorecard(parsed: any): NormalizedEvidenceSummary {
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const summary = emptyNormalized("scorecard", {
    signal_count: checks.length,
    issue_count: checks.filter((item: any) => typeof item?.score === "number" && item.score < 5).length,
    warning_count: checks.filter((item: any) => typeof item?.score === "number" && item.score < 7).length,
    notes: checks.length ? [] : ["No scorecard checks parsed."]
  });
  if (checks.some((item: any) => typeof item?.score === "number" && item.score < 3)) {
    summary.notes.push("At least one scorecard check scored below 3.");
  }
  return summary;
}

function normalizeSemgrep(parsed: any): NormalizedEvidenceSummary {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
  const coverage = new Set<string>();
  const summary = emptyNormalized("semgrep", {
    signal_count: results.length,
    issue_count: results.length,
    error_count: errors.length
  });
  for (const result of results) {
    pushSeverity(summary, result?.extra?.severity);
    if (typeof result?.path === "string" && result.path) coverage.add(result.path);
  }
  summary.coverage_paths = [...coverage].sort().slice(0, 50);
  if (errors.length) {
    summary.notes.push(`Semgrep reported ${errors.length} parser/runtime errors.`);
  }
  return summary;
}

function normalizeTrivy(parsed: any): NormalizedEvidenceSummary {
  const results = Array.isArray(parsed?.Results) ? parsed.Results : [];
  const coverage = new Set<string>();
  const summary = emptyNormalized("trivy");
  for (const result of results) {
    const vulnerabilities = Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : [];
    const misconfigurations = Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : [];
    summary.signal_count += vulnerabilities.length + misconfigurations.length;
    summary.issue_count += vulnerabilities.length + misconfigurations.length;
    for (const item of vulnerabilities) {
      pushSeverity(summary, item?.Severity);
    }
    for (const item of misconfigurations) {
      pushSeverity(summary, item?.Severity);
    }
    if (typeof result?.Target === "string" && result.Target) coverage.add(result.Target);
    if (typeof result?.Type === "string" && result.Type) summary.notes.push(`coverage_type:${result.Type}`);
  }
  summary.coverage_paths = [...coverage].sort().slice(0, 50);
  summary.notes = [...new Set(summary.notes)];
  return summary;
}

function normalizeRepoAnalysis(analysisSummary: any): NormalizedEvidenceSummary {
  const analysis = analysisSummary?.analysis ?? null;
  const repoContext = analysisSummary?.repoContext ?? null;
  const categorySignals = [...new Set([
    ...(analysis?.mcp_indicators?.length ? ["mcp_surface_detected"] : []),
    ...(analysis?.agent_indicators?.length ? ["agentic_surface_detected"] : []),
    ...(analysis?.tool_execution_indicators?.length ? ["tool_execution_surface_detected"] : []),
    ...(Array.isArray(repoContext?.capability_signals) ? repoContext.capability_signals : [])
  ])];
  const entryPoints = Array.isArray(analysis?.entry_points) ? analysis.entry_points.slice(0, 25) : [];
  const ecosystems = Array.isArray(analysis?.package_ecosystems) ? analysis.package_ecosystems : [];
  return emptyNormalized("repo_analysis", {
    signal_count: categorySignals.length + ecosystems.length + Math.min(entryPoints.length, 10),
    ecosystems,
    coverage_paths: entryPoints,
    notes: categorySignals.slice(0, 10)
  });
}

function normalizePythonWorker(output: any, status: string): NormalizedEvidenceSummary {
  const scenarios = Array.isArray(output?.scenarios) ? output.scenarios : [];
  const summary = emptyNormalized("python_worker", {
    signal_count: scenarios.length || (output && typeof output === "object" ? Object.keys(output).length : 0),
    issue_count: scenarios.filter((item: any) => item?.status === "review").length,
    warning_count: scenarios.filter((item: any) => item?.status && item.status !== "pass").length,
    notes: [
      ...(typeof output?.summary === "string" && output.summary ? [output.summary] : []),
      ...(typeof output?.scenario_family === "string" ? [`scenario_family:${output.scenario_family}`] : []),
      ...(status === "completed" ? [] : ["Python worker returned non-completed status."])
    ]
  });
  for (const item of scenarios) {
    pushSeverity(summary, item?.severity);
  }
  if (typeof output?.target === "string" && output.target) {
    summary.coverage_paths = [output.target];
  }
  return summary;
}

async function readGitDir(rootPath: string): Promise<string | null> {
  try {
    const gitPath = path.join(path.resolve(rootPath), ".git");
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) return gitPath;
    const pointer = await fs.readFile(gitPath, "utf8");
    const match = pointer.match(/gitdir:\s*(.+)/i);
    return match?.[1] ? path.resolve(path.dirname(gitPath), match[1].trim()) : null;
  } catch {
    return null;
  }
}

function normalizeRepoUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.git$/i, "");
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/i);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, "")}`;
  }
  return null;
}

async function inferRepoUrl(explicitRepoUrl: string | null, rootPath: string): Promise<string | null> {
  if (explicitRepoUrl) return explicitRepoUrl;
  const gitDir = await readGitDir(rootPath);
  if (!gitDir) return null;
  try {
    const config = await fs.readFile(path.join(gitDir, "config"), "utf8");
    const lines = config.split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
      const section = line.match(/^\s*\[(.+)\]\s*$/);
      if (section) {
        inOrigin = /remote\s+"origin"/i.test(section[1] ?? "");
        continue;
      }
      if (!inOrigin) continue;
      const urlMatch = line.match(/^\s*url\s*=\s*(.+)\s*$/i);
      if (urlMatch?.[1]) return normalizeRepoUrl(urlMatch[1]);
    }
  } catch {
    return null;
  }
  return null;
}

export const EVIDENCE_PROVIDERS: EvidenceProviderDescriptor[] = [
  {
    id: "repo_analysis",
    kind: "internal_plugin",
    title: "Repo analysis",
    summary: "Deterministic repository and configuration analysis bundled with the harness.",
    supports_modes: ["static", "build", "runtime", "validate"]
  },
  {
    id: "scorecard",
    kind: "local_binary",
    title: "OpenSSF Scorecard (local)",
    summary: "Runs the local scorecard binary against a hosted repository URL.",
    supports_modes: ["static"]
  },
  {
    id: "scorecard_api",
    kind: "public_api",
    title: "Scorecard API fallback",
    summary: "Fetches hosted Scorecard JSON where available.",
    supports_modes: ["static"]
  },
  {
    id: "semgrep",
    kind: "local_binary",
    title: "Semgrep (local)",
    summary: "Runs semgrep scan over the target sandbox.",
    supports_modes: ["static"]
  },
  {
    id: "trivy",
    kind: "local_binary",
    title: "Trivy (local)",
    summary: "Runs trivy filesystem scanning over the target sandbox.",
    supports_modes: ["static"]
  },
  {
    id: "inspect",
    kind: "internal_plugin",
    title: "Inspect worker",
    summary: "Runs the Python inspect adapter for bounded runtime inspection scenarios.",
    supports_modes: ["build", "runtime", "validate"]
  },
  {
    id: "garak",
    kind: "internal_plugin",
    title: "garak worker",
    summary: "Runs the Python garak adapter for prompt-stress and misuse scenarios.",
    supports_modes: ["build", "runtime", "validate"]
  },
  {
    id: "pyrit",
    kind: "internal_plugin",
    title: "PyRIT worker",
    summary: "Runs the Python PyRIT adapter for adversarial validation scenarios.",
    supports_modes: ["build", "runtime", "validate"]
  },
  {
    id: "internal_python_worker",
    kind: "internal_plugin",
    title: "Internal Python worker",
    summary: "Compatibility alias that resolves to a concrete Python worker adapter when runtime-style evidence is needed.",
    supports_modes: ["build", "runtime", "validate"]
  }
];

export function getEvidenceProviders(): EvidenceProviderDescriptor[] {
  return EVIDENCE_PROVIDERS;
}

function completedRecord(args: Partial<EvidenceExecutionRecord> & Pick<EvidenceExecutionRecord, "provider_id" | "provider_kind" | "tool" | "summary" | "artifact_type">): EvidenceExecutionRecord {
  return {
    provider_id: args.provider_id,
    provider_kind: args.provider_kind,
    tool: args.tool,
    status: args.status ?? "completed",
    command: args.command ?? [args.provider_id],
    exit_code: args.exit_code ?? 0,
    summary: args.summary,
    artifact_type: args.artifact_type,
    parsed: args.parsed ?? null,
    stderr: args.stderr,
    failure_category: args.failure_category ?? null,
    capability_status: args.capability_status ?? "unknown",
    fallback_from: args.fallback_from ?? null,
    normalized: args.normalized ?? null
  };
}

function skippedUnavailableRecord(args: { provider_id: string; provider_kind: EvidenceExecutionRecord["provider_kind"]; tool: string; command: string[]; artifact_type: string; failure: { category: ProviderFailureCategory; capability: CapabilityStatus; message: string }; stderr?: string; fallback_from?: string | null; normalized?: NormalizedEvidenceSummary | null; }): EvidenceExecutionRecord {
  return completedRecord({
    provider_id: args.provider_id,
    provider_kind: args.provider_kind,
    tool: args.tool,
    status: "skipped",
    command: args.command,
    exit_code: null,
    summary: `${args.tool} unavailable: ${args.failure.message}`,
    artifact_type: args.artifact_type,
    parsed: null,
    stderr: args.stderr,
    failure_category: args.failure.category,
    capability_status: args.failure.capability,
    fallback_from: args.fallback_from ?? null,
    normalized: args.normalized ?? emptyNormalized("unknown", { notes: [args.failure.message] })
  });
}

export async function executeEvidenceProvider(args: {
  providerId: string;
  request: AuditRequest;
  rootPath: string;
  repoUrl: string | null;
  analysisSummary?: unknown;
  fallbackFrom?: string | null;
}): Promise<EvidenceExecutionRecord> {
  const effectiveRepoUrl = await inferRepoUrl(args.repoUrl, args.request.local_path ?? args.rootPath);
  const localBinaryBlocked = args.providerId === "scorecard" || args.providerId === "semgrep" || args.providerId === "trivy"
    ? await detectLocalBinaryExecutionBlocked()
    : null;

  switch (args.providerId) {
    case "repo_analysis":
      return completedRecord({
        provider_id: "repo_analysis",
        provider_kind: "internal_plugin",
        tool: "repo_analysis",
        summary: "Deterministic repository analysis evidence is available from analysis.json and repo-context.json.",
        artifact_type: "repo-analysis-output",
        parsed: args.analysisSummary ?? null,
        capability_status: "available",
        normalized: normalizeRepoAnalysis(args.analysisSummary)
      });
    case "scorecard": {
      if (!effectiveRepoUrl) {
        return completedRecord({
          provider_id: "scorecard",
          provider_kind: "local_binary",
          tool: "scorecard",
          status: "skipped",
          command: ["scorecard"],
          exit_code: null,
          summary: "Scorecard requires a GitHub repository URL and no repository remote could be inferred.",
          artifact_type: "scorecard-output",
          parsed: null,
          failure_category: "runtime_error",
          capability_status: "unknown",
          normalized: emptyNormalized("scorecard", { notes: ["Repository URL could not be inferred."] })
        });
      }
      const command = ["--format", "json", "--repo", effectiveRepoUrl];
      if (localBinaryBlocked) {
        return skippedUnavailableRecord({
          provider_id: "scorecard",
          provider_kind: "local_binary",
          tool: "scorecard",
          command: ["scorecard", ...command],
          artifact_type: "scorecard-output",
          failure: localBinaryBlocked,
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("scorecard", { notes: [localBinaryBlocked.message] })
        });
      }
      try {
        const { exitCode, stdout, stderr } = await runCommand("scorecard", command);
        const parsed = parseCommandJson(stdout, stderr);
        const failure = classifyCommandFailure(stdout, stderr);
        if (failure) {
          return skippedUnavailableRecord({ provider_id: "scorecard", provider_kind: "local_binary", tool: "scorecard", command: ["scorecard", ...command], artifact_type: "scorecard-output", failure, stderr, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("scorecard", { notes: [failure.message] }) });
        }
        const normalized = parsed ? normalizeScorecard(parsed) : emptyNormalized("scorecard", { error_count: 1, notes: ["Scorecard did not return parseable JSON."] });
        return completedRecord({
          provider_id: "scorecard",
          provider_kind: "local_binary",
          tool: "scorecard",
          status: parsed ? "completed" : "failed",
          command: ["scorecard", ...command],
          exit_code: exitCode,
          summary: parsed ? summarizeScorecard(parsed) : "Scorecard did not return parseable JSON.",
          artifact_type: "scorecard-output",
          parsed,
          stderr: stderr || undefined,
          failure_category: parsed ? null : "parse_error",
          capability_status: "available",
          fallback_from: args.fallbackFrom ?? null,
          normalized
        });
      } catch (error: any) {
        const failure = classifyCommandFailure("", error?.message ?? String(error)) ?? { category: "command_unavailable", capability: "unavailable", message: error?.message ?? String(error) };
        return skippedUnavailableRecord({ provider_id: "scorecard", provider_kind: "local_binary", tool: "scorecard", command: ["scorecard", ...command], artifact_type: "scorecard-output", failure, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("scorecard", { notes: [failure.message] }) });
      }
    }
    case "scorecard_api": {
      if (!effectiveRepoUrl) {
        return completedRecord({
          provider_id: "scorecard_api",
          provider_kind: "public_api",
          tool: "scorecard_api",
          status: "skipped",
          summary: "Scorecard API requires a GitHub repository URL and no repository remote could be inferred.",
          artifact_type: "scorecard-api-output",
          parsed: null,
          failure_category: "runtime_error",
          capability_status: "unknown",
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("scorecard", { notes: ["Repository URL could not be inferred."] })
        });
      }
      try {
        const encoded = encodeURIComponent(effectiveRepoUrl);
        const response = await fetch(`https://api.securityscorecards.dev/projects?project=${encoded}`);
        if (!response.ok) {
          const failureCategory = response.status === 404 ? "api_unavailable" : "runtime_error";
          return completedRecord({
            provider_id: "scorecard_api",
            provider_kind: "public_api",
            tool: "scorecard_api",
            status: "skipped",
            summary: `Scorecard API unavailable: HTTP ${response.status}`,
            artifact_type: "scorecard-api-output",
            parsed: null,
            failure_category: failureCategory,
            capability_status: response.status === 404 ? "unavailable" : "unknown",
            fallback_from: args.fallbackFrom ?? null,
            normalized: emptyNormalized("scorecard", { notes: [`HTTP ${response.status}`] })
          });
        }
        const parsed = await response.json();
        return completedRecord({
          provider_id: "scorecard_api",
          provider_kind: "public_api",
          tool: "scorecard_api",
          summary: "Fetched hosted Scorecard API response.",
          artifact_type: "scorecard-api-output",
          parsed,
          capability_status: "available",
          fallback_from: args.fallbackFrom ?? null,
          normalized: normalizeScorecard(parsed)
        });
      } catch (error: any) {
        return completedRecord({
          provider_id: "scorecard_api",
          provider_kind: "public_api",
          tool: "scorecard_api",
          status: "skipped",
          summary: `Scorecard API unavailable: ${error?.message ?? String(error)}`,
          artifact_type: "scorecard-api-output",
          parsed: null,
          failure_category: "api_unavailable",
          capability_status: "unavailable",
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("scorecard", { notes: [error?.message ?? String(error)] })
        });
      }
    }
    case "semgrep": {
      const command = ["scan", "--config", "auto", "--json", "--quiet", args.rootPath];
      if (localBinaryBlocked) {
        return skippedUnavailableRecord({
          provider_id: "semgrep",
          provider_kind: "local_binary",
          tool: "semgrep",
          command: ["semgrep", ...command],
          artifact_type: "semgrep-output",
          failure: localBinaryBlocked,
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("semgrep", { notes: [localBinaryBlocked.message] })
        });
      }
      try {
        const { exitCode, stdout, stderr } = await runCommand("semgrep", command);
        const parsed = parseCommandJson(stdout, stderr);
        const failure = classifyCommandFailure(stdout, stderr);
        if (failure) {
          return skippedUnavailableRecord({ provider_id: "semgrep", provider_kind: "local_binary", tool: "semgrep", command: ["semgrep", ...command], artifact_type: "semgrep-output", failure, stderr, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("semgrep", { notes: [failure.message] }) });
        }
        const normalized = parsed ? normalizeSemgrep(parsed) : emptyNormalized("semgrep", { error_count: 1, notes: ["Semgrep did not return parseable JSON."] });
        return completedRecord({
          provider_id: "semgrep",
          provider_kind: "local_binary",
          tool: "semgrep",
          status: parsed ? "completed" : "failed",
          command: ["semgrep", ...command],
          exit_code: exitCode,
          summary: parsed ? summarizeSemgrep(parsed) : "Semgrep did not return parseable JSON.",
          artifact_type: "semgrep-output",
          parsed,
          stderr: stderr || undefined,
          failure_category: parsed ? null : "parse_error",
          capability_status: "available",
          fallback_from: args.fallbackFrom ?? null,
          normalized
        });
      } catch (error: any) {
        const failure = classifyCommandFailure("", error?.message ?? String(error)) ?? { category: "command_unavailable", capability: "unavailable", message: error?.message ?? String(error) };
        return skippedUnavailableRecord({ provider_id: "semgrep", provider_kind: "local_binary", tool: "semgrep", command: ["semgrep", ...command], artifact_type: "semgrep-output", failure, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("semgrep", { notes: [failure.message] }) });
      }
    }
    case "trivy": {
      const command = ["fs", "--format", "json", "--quiet", args.rootPath];
      if (localBinaryBlocked) {
        return skippedUnavailableRecord({
          provider_id: "trivy",
          provider_kind: "local_binary",
          tool: "trivy",
          command: ["trivy", ...command],
          artifact_type: "trivy-output",
          failure: localBinaryBlocked,
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("trivy", { notes: [localBinaryBlocked.message] })
        });
      }
      try {
        const { exitCode, stdout, stderr } = await runCommand("trivy", command);
        const parsed = parseCommandJson(stdout, stderr);
        const failure = classifyCommandFailure(stdout, stderr);
        if (failure) {
          return skippedUnavailableRecord({ provider_id: "trivy", provider_kind: "local_binary", tool: "trivy", command: ["trivy", ...command], artifact_type: "trivy-output", failure, stderr, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("trivy", { notes: [failure.message] }) });
        }
        const normalized = parsed ? normalizeTrivy(parsed) : emptyNormalized("trivy", { error_count: 1, notes: ["Trivy did not return parseable JSON."] });
        return completedRecord({
          provider_id: "trivy",
          provider_kind: "local_binary",
          tool: "trivy",
          status: parsed ? "completed" : "failed",
          command: ["trivy", ...command],
          exit_code: exitCode,
          summary: parsed ? summarizeTrivy(parsed) : "Trivy did not return parseable JSON.",
          artifact_type: "trivy-output",
          parsed,
          stderr: stderr || undefined,
          failure_category: parsed ? null : "parse_error",
          capability_status: "available",
          fallback_from: args.fallbackFrom ?? null,
          normalized
        });
      } catch (error: any) {
        const failure = classifyCommandFailure("", error?.message ?? String(error)) ?? { category: "command_unavailable", capability: "unavailable", message: error?.message ?? String(error) };
        return skippedUnavailableRecord({ provider_id: "trivy", provider_kind: "local_binary", tool: "trivy", command: ["trivy", ...command], artifact_type: "trivy-output", failure, fallback_from: args.fallbackFrom ?? null, normalized: emptyNormalized("trivy", { notes: [failure.message] }) });
      }
    }
    case "inspect":
    case "garak":
    case "pyrit":
    case "internal_python_worker": {
      const worker = resolvePythonWorkerAdapter(args.providerId, args.request);
      const capability = await getPythonWorkerCapability();
      if (capability.status !== "available") {
        return skippedUnavailableRecord({
          provider_id: args.providerId,
          provider_kind: "internal_plugin",
          tool: worker,
          command: ["python-worker", worker],
          artifact_type: "internal-python-worker-output",
          failure: {
            category: capability.status === "blocked" ? "sandbox_blocked" : "command_unavailable",
            capability: capability.status === "blocked" ? "blocked" : "unavailable",
            message: capability.message ?? "Python workers are unavailable."
          },
          fallback_from: args.fallbackFrom ?? null,
          normalized: emptyNormalized("python_worker", { notes: [capability.message ?? "Python workers are unavailable."] })
        });
      }
      const result = await invokePythonWorker(worker, args.request, args.rootPath);
      return completedRecord({
        provider_id: args.providerId,
        provider_kind: "internal_plugin",
        tool: worker,
        status: result.status === "completed" ? "completed" : "failed",
        summary: result.status === "completed"
          ? (typeof (result.output as any)?.summary === "string" ? String((result.output as any).summary) : `Python worker '${worker}' returned adapter output.`)
          : `Python worker '${worker}' execution failed.`,
        artifact_type: "internal-python-worker-output",
        parsed: result.output,
        failure_category: result.status === "completed" ? null : "runtime_error",
        capability_status: result.status === "completed" ? "available" : "unknown",
        fallback_from: args.fallbackFrom ?? null,
        normalized: normalizePythonWorker(result.output, result.status)
      });
    }
    default:
      return completedRecord({
        provider_id: args.providerId,
        provider_kind: "internal_plugin",
        tool: args.providerId,
        status: "skipped",
        summary: `Evidence provider ${args.providerId} is not implemented.`,
        artifact_type: `${args.providerId}-output`,
        parsed: null,
        failure_category: "runtime_error",
        capability_status: "unknown",
        normalized: emptyNormalized("unknown", { notes: [`Evidence provider ${args.providerId} is not implemented.`] })
      });
  }
}
