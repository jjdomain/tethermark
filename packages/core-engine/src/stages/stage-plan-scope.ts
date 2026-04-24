import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildPlannerContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, StandardControlDefinition, TargetDescriptor, TargetProfileArtifact } from "../contracts.js";
import { buildHeuristicTargetProfile } from "../planner.js";

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

  return {
    plannerArtifact: applyPlannerControlConstraints(call.artifact, args.controlCatalog, args.request),
    targetProfile: {
      heuristic,
      semantic_review: call.artifact.classification_review
    }
  };
}
