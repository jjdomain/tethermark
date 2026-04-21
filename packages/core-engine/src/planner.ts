import type {
  AnalysisSummary,
  AuditRequest,
  EvalSelectionArtifact,
  HeuristicTargetProfile,
  PlannerArtifact,
  RunPlan,
  TargetClass,
  TargetDescriptor
} from "./contracts.js";

export function classifyTarget(analysis: AnalysisSummary, request: AuditRequest): TargetClass {
  return buildHeuristicTargetProfile(analysis, request).primary_class;
}

export function getRequestedRunModeSelection(request: AuditRequest): "static" | "runtime" | "auto" | "default" {
  const selection = String((request.hints as any)?.requested_run_mode_selection ?? "");
  if (selection === "static" || selection === "runtime" || selection === "auto") {
    return selection;
  }
  return "default";
}

export function isAutoRunModeRequest(request: AuditRequest): boolean {
  return !request.run_mode && getRequestedRunModeSelection(request) === "auto";
}

export function resolveRequestedOrAutoRunMode(args: {
  request: AuditRequest;
  analysis?: AnalysisSummary | null;
  targetClass?: TargetClass | null;
}): NonNullable<AuditRequest["run_mode"]> {
  if (args.request.run_mode) {
    return args.request.run_mode;
  }
  const requestedSelection = getRequestedRunModeSelection(args.request);
  if (requestedSelection === "default") {
    return "static";
  }

  const targetClass = args.targetClass
    ?? (args.analysis ? buildHeuristicTargetProfile(args.analysis, args.request).primary_class : args.request.endpoint_url ? "hosted_endpoint_black_box" : null);

  if (targetClass === "repo_posture_only") {
    return requestedSelection === "auto" ? "static" : "build";
  }

  if (targetClass === "runnable_local_app") {
    return "build";
  }

  return "validate";
}

export function buildHeuristicTargetProfile(analysis: AnalysisSummary, request: AuditRequest): HeuristicTargetProfile {
  const evidence: string[] = [];
  const secondaryTraits = new Set<string>();

  if (request.endpoint_url && !request.local_path && !request.repo_url) {
    evidence.push("Endpoint target requested directly.");
    return {
      primary_class: "hosted_endpoint_black_box",
      secondary_traits: ["endpoint_target"],
      confidence: 0.95,
      evidence
    };
  }

  if (analysis.mcp_indicators.length > 0) {
    evidence.push(`Detected MCP/plugin/skill indicators in ${analysis.mcp_indicators.length} paths.`);
    secondaryTraits.add("mcp_surface_present");
  }
  if (analysis.agent_indicators.length > 0 || analysis.tool_execution_indicators.length > 0) {
    evidence.push(`Detected agent/tool execution indicators in ${analysis.agent_indicators.length + analysis.tool_execution_indicators.length} paths.`);
    secondaryTraits.add("agentic_surface_present");
  }
  if (analysis.ci_workflows.length > 0) secondaryTraits.add("ci_present");
  if (analysis.dependency_manifests.length > 0 || analysis.lockfiles.length > 0) secondaryTraits.add("dependency_surface_present");
  if (analysis.container_files.length > 0) secondaryTraits.add("container_surface_present");

  if (analysis.mcp_indicators.length > 0) {
    return {
      primary_class: "mcp_server_plugin_skill_package",
      secondary_traits: [...secondaryTraits],
      confidence: 0.82,
      evidence
    };
  }
  if (analysis.agent_indicators.length > 0 || analysis.tool_execution_indicators.length > 0) {
    return {
      primary_class: "tool_using_multi_turn_agent",
      secondary_traits: [...secondaryTraits],
      confidence: 0.74,
      evidence
    };
  }
  if (analysis.entry_points.length > 0) {
    evidence.push(`Detected runnable entry points in ${analysis.entry_points.length} files.`);
    secondaryTraits.add("runnable_entrypoints_present");
    return {
      primary_class: "runnable_local_app",
      secondary_traits: [...secondaryTraits],
      confidence: 0.71,
      evidence
    };
  }
  evidence.push("No agentic, MCP, or runnable entrypoint markers exceeded repo-posture thresholds.");
  return {
    primary_class: "repo_posture_only",
    secondary_traits: [...secondaryTraits],
    confidence: 0.66,
    evidence
  };
}

function sanitizeTools(request: AuditRequest, tools: string[]): string[] {
  const allowed = request.run_mode === "static"
    ? new Set(["repo_analysis", "scorecard", "scorecard_api", "semgrep", "trivy"])
    : new Set(["repo_analysis", "scorecard", "scorecard_api", "trivy", "semgrep", "inspect", "garak", "pyrit", "internal_python_worker"]);
  return [...new Set(tools.filter((tool) => allowed.has(tool)))];
}

function sanitizePacks(packs: string[]): string[] {
  return [...new Set(packs.filter(Boolean).map((pack) => pack.toLowerCase()))];
}

function uniqueControlIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function assembleRunPlan(args: { runId: string; target: TargetDescriptor; request: AuditRequest; plannerArtifact: PlannerArtifact; evalSelection: EvalSelectionArtifact }): RunPlan {
  const runMode = args.request.run_mode ?? "static";
  return {
    run_id: args.runId,
    target_id: args.target.target_id,
    selected_profile: args.plannerArtifact.selected_profile,
    target_class: args.plannerArtifact.classification_review.final_class,
    run_mode: runMode,
    frameworks_in_scope: [...new Set(args.plannerArtifact.frameworks_in_scope)],
    applicable_control_ids: uniqueControlIds(args.plannerArtifact.applicable_control_ids),
    deferred_control_ids: uniqueControlIds(args.plannerArtifact.deferred_control_ids),
    non_applicable_control_ids: uniqueControlIds(args.plannerArtifact.non_applicable_control_ids),
    baseline_tools: sanitizeTools(args.request, args.evalSelection.baseline_tools.length ? args.evalSelection.baseline_tools : ["repo_analysis", "scorecard", "trivy", "semgrep"]),
    runtime_tools: sanitizeTools(args.request, args.evalSelection.runtime_tools),
    custom_eval_packs: sanitizePacks(args.evalSelection.custom_eval_packs),
    validation_candidates: [...new Set(args.evalSelection.validation_candidates)],
    control_tool_map: args.evalSelection.control_tool_map.map((item) => ({
      control_id: item.control_id,
      tools: sanitizeTools(args.request, item.tools),
      rationale: item.rationale
    })).filter((item) => item.tools.length > 0 || runMode !== "static"),
    rationale: [...new Set([...args.plannerArtifact.rationale, ...args.evalSelection.rationale])],
    constraints: args.plannerArtifact.constraints
  };
}
