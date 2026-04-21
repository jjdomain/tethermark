import fs from "node:fs/promises";
import path from "node:path";

import type { AnalysisSummary, AuditRequest, PreflightReadinessStatus, PreflightSummary } from "./contracts.js";
import { getBuiltinAuditPackage, resolveAuditPackage } from "./audit-packages.js";
import { getBuiltinAuditPolicyPack, resolvePolicyPackReference } from "./audit-policy.js";
import { getLocalBinaryExecutionCapability } from "./evidence-providers.js";
import { buildHeuristicTargetProfile, resolveRequestedOrAutoRunMode } from "./planner.js";
import { getPythonWorkerCapability } from "./python-worker.js";
import { analyzeTarget } from "./repo.js";

function emptyAnalysis(rootPath: string): AnalysisSummary {
  return {
    root_path: rootPath,
    project_name: path.basename(rootPath || "target"),
    file_count: 0,
    frameworks: [],
    languages: [],
    entry_points: [],
    mcp_indicators: [],
    agent_indicators: [],
    tool_execution_indicators: [],
    dependency_manifests: [],
    lockfiles: [],
    package_ecosystems: [],
    package_managers: [],
    ci_workflows: [],
    security_docs: [],
    release_files: [],
    container_files: []
  };
}

async function inferRepoUrlFromLocalPath(localPath: string): Promise<string | null> {
  try {
    const gitPath = path.join(path.resolve(localPath), ".git");
    const stat = await fs.stat(gitPath);
    const configPath = stat.isDirectory() ? path.join(gitPath, "config") : null;
    if (!configPath) return null;
    const config = await fs.readFile(configPath, "utf8");
    const lines = config.split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
      const section = line.match(/^\s*\[(.+)\]\s*$/);
      if (section) {
        inOrigin = /remote\s+"origin"/i.test(section[1] ?? "");
        continue;
      }
      if (!inOrigin) continue;
      const match = line.match(/^\s*url\s*=\s*(.+)\s*$/i);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    return null;
  }
  return null;
}

function buildProviderReadiness(args: {
  request: AuditRequest;
  inferredRepoUrl: string | null;
  localBinaryCapability: Awaited<ReturnType<typeof getLocalBinaryExecutionCapability>>;
  pythonWorkerCapability: Awaited<ReturnType<typeof getPythonWorkerCapability>>;
  analysisAvailable: boolean;
}): PreflightSummary["provider_readiness"] {
  const localBinaryStatus = args.localBinaryCapability.status;
  const localBinarySummary = args.localBinaryCapability.message ?? "Local binary execution available.";
  const pythonWorkerStatus = args.pythonWorkerCapability.status;
  const pythonWorkerSummary = args.pythonWorkerCapability.message ?? "Python worker adapters are available.";
  const scorecardTargetAvailable = Boolean(args.request.repo_url || args.inferredRepoUrl);
  const fileSystemAvailable = Boolean(args.request.local_path && args.analysisAvailable);
  const deferredFilesystem = Boolean(args.request.repo_url && !args.request.local_path);
  const effectiveRunMode = resolveRequestedOrAutoRunMode({ request: args.request });
  const runtimeCapable = effectiveRunMode === "build" || effectiveRunMode === "runtime" || effectiveRunMode === "validate";

  return [
    {
      provider_id: "repo_analysis",
      provider_kind: "internal_plugin",
      status: fileSystemAvailable ? "available" : deferredFilesystem ? "deferred" : "conditional",
      summary: fileSystemAvailable
        ? "Repository analysis can inspect the current target contents."
        : deferredFilesystem
          ? "Repository analysis becomes available after the remote repository is staged during run start."
          : "Repository analysis requires accessible local target contents."
    },
    {
      provider_id: "scorecard",
      provider_kind: "local_binary",
      status: !scorecardTargetAvailable
        ? "conditional"
        : localBinaryStatus === "available"
          ? "available"
          : "blocked",
      summary: !scorecardTargetAvailable
        ? "Scorecard requires a repository URL or an inferable git remote."
        : localBinaryStatus === "available"
          ? "Scorecard can run against the repository URL."
          : localBinarySummary
    },
    {
      provider_id: "scorecard_api",
      provider_kind: "public_api",
      status: scorecardTargetAvailable ? "available" : "conditional",
      summary: scorecardTargetAvailable
        ? "Scorecard API can be used as a hosted fallback."
        : "Scorecard API requires a repository URL or inferable git remote."
    },
    {
      provider_id: "semgrep",
      provider_kind: "local_binary",
      status: fileSystemAvailable
        ? localBinaryStatus === "available" ? "available" : "blocked"
        : deferredFilesystem
          ? "deferred"
          : "conditional",
      summary: fileSystemAvailable
        ? (localBinaryStatus === "available" ? "Semgrep can scan the staged target filesystem." : localBinarySummary)
        : deferredFilesystem
          ? "Semgrep becomes available after the remote repository is staged during run start."
          : "Semgrep requires local target contents."
    },
    {
      provider_id: "trivy",
      provider_kind: "local_binary",
      status: fileSystemAvailable
        ? localBinaryStatus === "available" ? "available" : "blocked"
        : deferredFilesystem
          ? "deferred"
          : "conditional",
      summary: fileSystemAvailable
        ? (localBinaryStatus === "available" ? "Trivy can scan the staged target filesystem." : localBinarySummary)
        : deferredFilesystem
          ? "Trivy becomes available after the remote repository is staged during run start."
          : "Trivy requires local target contents."
    },
    {
      provider_id: "inspect",
      provider_kind: "internal_plugin",
      status: runtimeCapable
        ? (pythonWorkerStatus === "available" ? "available" : "blocked")
        : "conditional",
      summary: runtimeCapable
        ? pythonWorkerSummary
        : "Inspect worker is used for build/runtime/validate flows."
    },
    {
      provider_id: "garak",
      provider_kind: "internal_plugin",
      status: runtimeCapable
        ? (pythonWorkerStatus === "available" ? "available" : "blocked")
        : "conditional",
      summary: runtimeCapable
        ? pythonWorkerSummary
        : "garak worker is used for runtime and validation probe planning."
    },
    {
      provider_id: "pyrit",
      provider_kind: "internal_plugin",
      status: runtimeCapable
        ? (pythonWorkerStatus === "available" ? "available" : "blocked")
        : "conditional",
      summary: runtimeCapable
        ? pythonWorkerSummary
        : "PyRIT worker is used for adversarial validation flows."
    }
  ];
}

export async function buildPreflightSummary(request: AuditRequest): Promise<PreflightSummary> {
  const targetInputs = [request.local_path, request.repo_url, request.endpoint_url].filter(Boolean);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (targetInputs.length !== 1) {
    blockers.push("Exactly one of local_path, repo_url, or endpoint_url must be provided.");
  }

  let analysisAvailable = false;
  let analysis = emptyAnalysis(request.local_path || request.repo_url || request.endpoint_url || "target");
  let inferredRepoUrl: string | null = request.repo_url ?? null;

  if (request.local_path) {
    const resolvedLocalPath = path.resolve(request.local_path);
    try {
      const stat = await fs.stat(resolvedLocalPath);
      if (!stat.isDirectory()) {
        blockers.push(`Local path '${resolvedLocalPath}' is not a directory.`);
      } else {
        analysisAvailable = true;
        analysis = await analyzeTarget({
          target_id: "preflight-target",
          target_type: "path",
          repo_url: null,
          local_path: resolvedLocalPath,
          endpoint_url: null,
          snapshot: { type: "filesystem", value: resolvedLocalPath, captured_at: new Date().toISOString(), commit_sha: null },
          hints: {}
        });
        inferredRepoUrl = await inferRepoUrlFromLocalPath(resolvedLocalPath);
      }
    } catch {
      blockers.push(`Local path '${resolvedLocalPath}' could not be accessed.`);
    }
  } else if (request.repo_url) {
    warnings.push("Remote repository preflight does not clone contents yet; file-level analysis is deferred until run start.");
    analysis = emptyAnalysis(request.repo_url);
  } else if (request.endpoint_url) {
    try {
      new URL(request.endpoint_url);
    } catch {
      blockers.push(`Endpoint URL '${request.endpoint_url}' is not valid.`);
    }
    warnings.push("Endpoint preflight is metadata-only; repo and filesystem checks are not available without attached source.");
    analysis = emptyAnalysis(request.endpoint_url);
  }

  const heuristic = buildHeuristicTargetProfile(analysis, request);
  const effectiveRunMode = resolveRequestedOrAutoRunMode({ request, analysis, targetClass: heuristic.primary_class });
  const effectiveRequest = effectiveRunMode === request.run_mode ? request : { ...request, run_mode: effectiveRunMode };
  const recommendedPackage = blockers.length
    ? getBuiltinAuditPackage((request.audit_package ?? "agentic-static") as any)
    : resolveAuditPackage({ request: effectiveRequest, analysis, initialTargetClass: heuristic.primary_class });
  const selectedPolicyPack = resolvePolicyPackReference(request.audit_policy_pack);
  const localBinaryCapability = await getLocalBinaryExecutionCapability();
  const pythonWorkerCapability = await getPythonWorkerCapability();
  const providerReadiness = buildProviderReadiness({
    request: effectiveRequest,
    inferredRepoUrl,
    localBinaryCapability,
    pythonWorkerCapability,
    analysisAvailable
  });

  if ((effectiveRunMode === "runtime" || effectiveRunMode === "validate") && request.hints?.preflight && typeof request.hints.preflight === "object") {
    const runtimeAllowed = String((request.hints.preflight as any).runtime_allowed ?? "targeted_only");
    if (runtimeAllowed === "never") {
      blockers.push("Runtime-oriented run mode was requested while preflight runtime policy is set to never.");
    }
  }

  if (localBinaryCapability.status === "blocked") {
    warnings.push("Local binary providers are blocked in this host environment; static local-binary evidence will be skipped.");
  }
  if ((effectiveRunMode === "build" || effectiveRunMode === "runtime" || effectiveRunMode === "validate") && pythonWorkerCapability.status !== "available") {
    warnings.push("Python worker adapters are unavailable in this host environment; bounded runtime-worker evidence will be skipped.");
  }
  if (!inferredRepoUrl && request.local_path) {
    warnings.push("No git remote could be inferred from the local path, so Scorecard checks will be limited.");
  }
  if (analysisAvailable && analysis.file_count === 0) {
    warnings.push("The target path was readable but contained no analyzable files.");
  }

  const status: PreflightReadinessStatus = blockers.length
    ? "blocked"
    : warnings.length
      ? "ready_with_warnings"
      : "ready";

  return {
    target: {
      kind: request.local_path ? "path" : request.repo_url ? "repo" : "endpoint",
      input: request.local_path ?? request.repo_url ?? request.endpoint_url ?? "",
      analysis_available: analysisAvailable,
      target_class: heuristic.primary_class,
      confidence: heuristic.confidence,
      evidence: heuristic.evidence,
      project_name: analysis.project_name || null,
      file_count: analysisAvailable ? analysis.file_count : null,
      frameworks: analysis.frameworks,
      languages: analysis.languages
    },
    readiness: {
      status,
      blockers,
      warnings
    },
    provider_readiness: providerReadiness,
    recommended_audit_package: {
      id: recommendedPackage?.id ?? (request.audit_package ?? "agentic-static"),
      title: recommendedPackage?.title ?? (request.audit_package ?? "Selected package"),
      rationale: request.audit_package
        ? "Requested package will be used for launch."
        : `Recommended from heuristic target class '${heuristic.primary_class}'.`
    },
    selected_policy_pack: {
      id: selectedPolicyPack?.id ?? null,
      name: selectedPolicyPack?.name ?? null,
      source: selectedPolicyPack?.source ?? null
    },
    launch_profile: {
      run_mode: effectiveRunMode,
      audit_package: request.audit_package ?? recommendedPackage?.id ?? "agentic-static",
      audit_policy_pack: request.audit_policy_pack ?? selectedPolicyPack?.id ?? "default",
      llm_provider: request.llm_provider ?? "mock",
      llm_model: request.llm_model ?? null,
      preflight_strictness: String((request.hints as any)?.preflight?.strictness ?? "standard"),
      runtime_allowed: String((request.hints as any)?.preflight?.runtime_allowed ?? "targeted_only"),
      review_severity: String((request.hints as any)?.review?.require_human_review_for_severity ?? "high"),
      review_visibility: String((request.hints as any)?.review?.default_visibility ?? "internal")
    },
    repo_signals: {
      package_ecosystems: analysis.package_ecosystems,
      package_managers: analysis.package_managers,
      ci_workflows: analysis.ci_workflows.length,
      security_docs: analysis.security_docs.length,
      entry_points: analysis.entry_points.length,
      agentic_markers: analysis.agent_indicators.length + analysis.tool_execution_indicators.length,
      mcp_markers: analysis.mcp_indicators.length
    }
  };
}
