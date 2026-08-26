import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildPlannerContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, HeuristicTargetProfile, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, StandardControlDefinition, TargetClass, TargetDescriptor, TargetProfileArtifact } from "../contracts.js";
import { buildHeuristicTargetProfile } from "../planner.js";
import { requireRequestHumanApproval } from "../human-approval.js";

function getPlannerControlConstraints(request: AuditRequest): {
  selection_mode: "automatic" | "constrained";
  required_frameworks: string[];
  excluded_frameworks: string[];
  required_control_ids: string[];
  excluded_control_ids: string[];
} | null {
  const value = (request.hints as any)?.planner_control_constraints;
  if (!value || typeof value !== "object") return null;
  const unique = (items: unknown) => Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === "string" && item.trim().length > 0))] : [];
  return {
    selection_mode: value.selection_mode === "constrained" ? "constrained" : "automatic",
    required_frameworks: unique(value.required_frameworks),
    excluded_frameworks: unique(value.excluded_frameworks),
    required_control_ids: unique(value.required_control_ids),
    excluded_control_ids: unique(value.excluded_control_ids)
  };
}

function applyPlannerControlConstraints(artifact: PlannerArtifact, controlCatalog: StandardControlDefinition[], request: AuditRequest): PlannerArtifact {
  const operatorConstraints = getPlannerControlConstraints(request);
  if (!operatorConstraints || operatorConstraints.selection_mode !== "constrained") return artifact;
  if (operatorConstraints.excluded_control_ids.length || operatorConstraints.excluded_frameworks.length) {
    requireRequestHumanApproval(request, "control_change");
  }

  const controlById = new Map(controlCatalog.map((control) => [control.control_id, control]));
  const knownFrameworks = new Set(controlCatalog.map((control) => control.framework));
  const requiredFrameworks = operatorConstraints.required_frameworks.filter((framework) => knownFrameworks.has(framework));
  const excludedFrameworks = new Set(operatorConstraints.excluded_frameworks.filter((framework) => knownFrameworks.has(framework)));
  const requiredControls = operatorConstraints.required_control_ids.filter((controlId) => controlById.has(controlId));
  const excludedControls = new Set(operatorConstraints.excluded_control_ids.filter((controlId) => controlById.has(controlId)));

  const applicable = new Set<string>();
  const deferred = new Set<string>();
  const nonApplicable = new Set<string>();

  const addControl = (target: Set<string>, controlId: string) => {
    if (!controlById.has(controlId)) return;
    const control = controlById.get(controlId)!;
    if (excludedControls.has(controlId) || excludedFrameworks.has(control.framework)) {
      nonApplicable.add(controlId);
      applicable.delete(controlId);
      deferred.delete(controlId);
      return;
    }
    target.add(controlId);
    if (target === applicable) {
      deferred.delete(controlId);
      nonApplicable.delete(controlId);
    } else if (target === deferred) {
      if (!applicable.has(controlId)) nonApplicable.delete(controlId);
    }
  };

  for (const controlId of artifact.applicable_control_ids || []) addControl(applicable, controlId);
  for (const controlId of artifact.deferred_control_ids || []) addControl(deferred, controlId);
  for (const controlId of artifact.non_applicable_control_ids || []) {
    if (!controlById.has(controlId)) continue;
    const control = controlById.get(controlId)!;
    if (excludedControls.has(controlId) || excludedFrameworks.has(control.framework) || (!applicable.has(controlId) && !deferred.has(controlId))) {
      nonApplicable.add(controlId);
    }
  }

  for (const controlId of requiredControls) addControl(applicable, controlId);
  for (const controlId of excludedControls) {
    applicable.delete(controlId);
    deferred.delete(controlId);
    if (controlById.has(controlId)) nonApplicable.add(controlId);
  }

  for (const framework of excludedFrameworks) {
    for (const control of controlCatalog) {
      if (control.framework !== framework) continue;
      applicable.delete(control.control_id);
      deferred.delete(control.control_id);
      nonApplicable.add(control.control_id);
    }
  }

  const frameworks = new Set((artifact.frameworks_in_scope || []).filter((framework) => !excludedFrameworks.has(framework)));
  for (const framework of requiredFrameworks) frameworks.add(framework);
  for (const controlId of applicable) frameworks.add(controlById.get(controlId)!.framework);
  for (const controlId of deferred) {
    const framework = controlById.get(controlId)?.framework;
    if (framework && !excludedFrameworks.has(framework)) frameworks.add(framework);
  }

  const notes = [];
  if (requiredFrameworks.length) notes.push(`operator required frameworks: ${requiredFrameworks.join(", ")}`);
  if (excludedFrameworks.size) notes.push(`operator excluded frameworks: ${[...excludedFrameworks].join(", ")}`);
  if (requiredControls.length) notes.push(`operator required controls: ${requiredControls.join(", ")}`);
  if (excludedControls.size) notes.push(`operator excluded controls: ${[...excludedControls].join(", ")}`);

  return {
    ...artifact,
    frameworks_in_scope: [...frameworks],
    applicable_control_ids: [...applicable],
    deferred_control_ids: [...deferred].filter((controlId) => !applicable.has(controlId) && !nonApplicable.has(controlId)),
    non_applicable_control_ids: [...nonApplicable].filter((controlId) => !applicable.has(controlId)),
    rationale: notes.length ? [...artifact.rationale, `Applied operator control constraints: ${notes.join("; ")}.`] : artifact.rationale
  };
}

const TARGET_CLASSES = new Set<TargetClass>([
  "repo_posture_only",
  "runnable_local_app",
  "hosted_endpoint_black_box",
  "tool_using_multi_turn_agent",
  "mcp_server_plugin_skill_package"
]);

function isTargetClass(value: unknown): value is TargetClass {
  return typeof value === "string" && TARGET_CLASSES.has(value as TargetClass);
}

function enforceTargetClassFloor(heuristicClass: TargetClass, modelClass: unknown): TargetClass {
  if (!isTargetClass(modelClass)) return heuristicClass;
  if (heuristicClass === "hosted_endpoint_black_box" || modelClass === "hosted_endpoint_black_box") return heuristicClass;
  const rank: Record<Exclude<TargetClass, "hosted_endpoint_black_box">, number> = {
    repo_posture_only: 1,
    runnable_local_app: 2,
    tool_using_multi_turn_agent: 3,
    mcp_server_plugin_skill_package: 4
  };
  return rank[modelClass] < rank[heuristicClass] ? heuristicClass : modelClass;
}

export function applyDeterministicPlannerFloor(args: {
  artifact: PlannerArtifact;
  heuristic: HeuristicTargetProfile;
  controlCatalog: StandardControlDefinition[];
  request: AuditRequest;
}): PlannerArtifact {
  const controlById = new Map(args.controlCatalog.map((control) => [control.control_id, control]));
  const applicable = new Set(args.artifact.applicable_control_ids.filter((controlId) => controlById.has(controlId)));
  const deferred = new Set(args.artifact.deferred_control_ids.filter((controlId) => controlById.has(controlId) && !applicable.has(controlId)));
  const nonApplicable = new Set(args.artifact.non_applicable_control_ids.filter((controlId) => controlById.has(controlId) && !applicable.has(controlId) && !deferred.has(controlId)));
  let floorApplied = false;

  for (const control of args.controlCatalog) {
    if (control.static_assessable) {
      if (!applicable.has(control.control_id)) floorApplied = true;
      applicable.add(control.control_id);
      deferred.delete(control.control_id);
      nonApplicable.delete(control.control_id);
    } else if (args.request.run_mode === "static" && !applicable.has(control.control_id)) {
      if (!deferred.has(control.control_id)) floorApplied = true;
      deferred.add(control.control_id);
      nonApplicable.delete(control.control_id);
    }
  }

  const semanticClass = enforceTargetClassFloor(args.heuristic.primary_class, args.artifact.classification_review.semantic_class);
  const finalClass = enforceTargetClassFloor(args.heuristic.primary_class, args.artifact.classification_review.final_class);
  const classificationCorrected = semanticClass !== args.artifact.classification_review.semantic_class || finalClass !== args.artifact.classification_review.final_class;
  const frameworks = new Set(args.artifact.frameworks_in_scope);
  for (const controlId of [...applicable, ...deferred]) frameworks.add(controlById.get(controlId)!.framework);

  return {
    ...args.artifact,
    classification_review: {
      ...args.artifact.classification_review,
      semantic_class: semanticClass,
      final_class: finalClass,
      override_reason: classificationCorrected
        ? [args.artifact.classification_review.override_reason, "Unsupported or weaker model-generated class replaced with the deterministic classification floor."].filter(Boolean).join(" ")
        : args.artifact.classification_review.override_reason
    },
    frameworks_in_scope: [...frameworks],
    applicable_control_ids: [...applicable],
    deferred_control_ids: [...deferred].filter((controlId) => !applicable.has(controlId)),
    non_applicable_control_ids: [...nonApplicable].filter((controlId) => !applicable.has(controlId) && !deferred.has(controlId)),
    rationale: floorApplied || classificationCorrected
      ? [...args.artifact.rationale, "Applied the deterministic candidate-control and target-class safety floor before operator constraints."]
      : args.artifact.rationale
  };
}

export async function stagePlanScope(args: {
  runId: string;
  request: AuditRequest;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  methodology: MethodologyArtifact;
  auditPolicy: AuditPolicyArtifact;
  controlCatalog: StandardControlDefinition[];
  agentRuntime: AgentRuntime;
  skepticFeedback?: unknown;
  priorPlannerArtifact?: PlannerArtifact;
  priorRunPlan?: unknown;
}): Promise<{ plannerArtifact: PlannerArtifact; targetProfile: TargetProfileArtifact }> {
  const heuristic = buildHeuristicTargetProfile(args.analysis, args.request);
  const seedTargetProfile: TargetProfileArtifact = {
    heuristic,
    semantic_review: {
      semantic_class: heuristic.primary_class,
      final_class: heuristic.primary_class,
      secondary_traits: heuristic.secondary_traits,
      confidence: heuristic.confidence,
      evidence: heuristic.evidence
    }
  };

  const call = await args.agentRuntime.callAgent<PlannerArtifact>({
    runId: args.runId,
    agentName: "planner_agent",
    context: buildPlannerContext({
      request: args.request,
      sandbox: args.sandbox,
      target: args.target,
      analysis: args.analysis,
      repoContext: args.repoContext,
      targetProfile: seedTargetProfile,
      controlCatalog: args.controlCatalog,
      methodology: args.methodology,
      auditPolicy: args.auditPolicy,
      skepticFeedback: args.skepticFeedback,
      priorPlannerArtifact: args.priorPlannerArtifact,
      priorRunPlan: args.priorRunPlan
    }),
    inputArtifacts: ["target.json", "analysis.json", "repo-context.json", "methodology.json", "audit-policy.json"],
    outputArtifact: args.skepticFeedback ? "planner-artifact-corrected.json" : "planner-artifact.json",
    stageName: "plan_scope"
  });

  const flooredArtifact = applyDeterministicPlannerFloor({
    artifact: call.artifact,
    heuristic,
    controlCatalog: args.controlCatalog,
    request: args.request
  });
  const plannerArtifact = applyPlannerControlConstraints(flooredArtifact, args.controlCatalog, args.request);

  return {
    plannerArtifact,
    targetProfile: {
      heuristic,
      semantic_review: plannerArtifact.classification_review
    }
  };
}
