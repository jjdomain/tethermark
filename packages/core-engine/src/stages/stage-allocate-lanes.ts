import type { AuditLanePlan, EvalSelectionArtifact, PlannerArtifact, StandardControlDefinition, ThreatModelArtifact } from "../contracts.js";
import type { AuditLaneName } from "../audit-lanes.js";

function laneForControl(control: StandardControlDefinition): AuditLaneName {
  if (control.baseline_dimension === "agentic_guardrails") return "agentic_controls";
  if (control.baseline_dimension === "ai_data_exposure") return "data_exposure";
  if (control.baseline_dimension === "evidence_readiness") return "supply_chain";
  if (control.framework === "SLSA") return "supply_chain";
  return "repo_posture";
}

export async function stageAllocateLanes(args: {
  enabledLanes: AuditLaneName[];
  plannerArtifact: PlannerArtifact;
  evalSelection: EvalSelectionArtifact;
  threatModel: ThreatModelArtifact;
  controlCatalog: StandardControlDefinition[];
}): Promise<AuditLanePlan[]> {
  const applicable = new Set(args.plannerArtifact.applicable_control_ids);
  const allowedLaneSet = new Set(args.enabledLanes);
  const planMap = new Map<AuditLaneName, AuditLanePlan>();

  for (const lane of args.enabledLanes) {
    planMap.set(lane, {
      lane_name: lane,
      controls_in_scope: [],
      evidence_requirements: [],
      allowed_tools: [],
      rationale: [],
      token_budget: lane === "repo_posture" || lane === "supply_chain" ? 20000 : 30000,
      rerun_budget: 1
    });
  }

  for (const control of args.controlCatalog) {
    if (!applicable.has(control.control_id)) continue;
    const lane = laneForControl(control);
    if (!allowedLaneSet.has(lane)) continue;
    planMap.get(lane)?.controls_in_scope.push(control.control_id);
  }

  for (const lane of args.enabledLanes) {
    const plan = planMap.get(lane)!;
    const toolSet = new Set<string>();
    for (const mapping of args.evalSelection.control_tool_map) {
      if (!plan.controls_in_scope.includes(mapping.control_id)) continue;
      for (const tool of mapping.tools) toolSet.add(tool);
    }
    if (plan.controls_in_scope.length === 0) continue;
    plan.allowed_tools = [...toolSet];
    plan.evidence_requirements = [
      `Assess ${plan.controls_in_scope.length} controls for lane '${lane}'.`,
      ...(plan.allowed_tools.length ? [`Use only lane-approved tools: ${plan.allowed_tools.join(", ")}.`] : ["Primary evidence comes from deterministic repository analysis."])
    ];
    plan.rationale = [
      `Lane '${lane}' was enabled by the selected audit package.`,
      `Threat model highlighted ${args.threatModel.high_risk_components.length} high-risk components.`
    ];
  }

  return args.enabledLanes.map((lane) => planMap.get(lane)!).filter((plan) => plan.controls_in_scope.length > 0 || plan.allowed_tools.length > 0);
}
