import type {
  AuditLanePlan,
  ControlResult,
  CorrectionPlanArtifact,
  CorrectionResultArtifact,
  Finding,
  MethodologyArtifact,
  SkepticAction,
  SkepticArtifact
} from "../contracts.js";
import { computeBaselineDimensionScores, computeStaticBaselineScore } from "../standards.js";

export interface CorrectionMergeSummary {
  merged_lane_names: string[];
  merged_provider_ids: string[];
  merged_control_ids: string[];
  merged_finding_ids: string[];
  reused_lane_names: string[];
  reused_provider_ids: string[];
}

export function getSkepticActionsByType(actions: SkepticAction[], type: SkepticAction["type"]): SkepticAction[] {
  return actions.filter((action) => action.type === type);
}

export function hasSkepticActions(skeptic: SkepticArtifact): boolean {
  return skeptic.actions.length > 0;
}

export function applyUnsupportedFindingDrops(findings: any[], skeptic: SkepticArtifact): any[] {
  const dropped = new Set(getSkepticActionsByType(skeptic.actions, "drop_findings").flatMap((action) => action.finding_ids ?? []));
  return findings.filter((finding) => !dropped.has(finding.finding_id));
}

export function applyControlDowngrades(controlResults: any[], skeptic: SkepticArtifact): any[] {
  const markNotAssessed = new Set(getSkepticActionsByType(skeptic.actions, "downgrade_controls").flatMap((action) => action.control_ids ?? []));
  return controlResults.map((control) => {
    if (!markNotAssessed.has(control.control_id)) return control;
    return {
      ...control,
      assessability: "not_assessed",
      status: "not_assessed",
      score_awarded: 0,
      rationale: [...control.rationale, "Skeptic correction: evidence was insufficient for a conclusive assessed status."]
    };
  });
}

export function selectEvidenceSubset(actions: SkepticAction[]): string[] {
  const subsetReruns = getSkepticActionsByType(actions, "rerun_evidence_subset").flatMap((action) => action.provider_ids ?? []);
  const toolReruns = getSkepticActionsByType(actions, "rerun_tool").flatMap((action) => action.provider_ids ?? []);
  return [...new Set([...subsetReruns, ...toolReruns])];
}

export function selectLaneSubset(actions: SkepticAction[]): string[] {
  return [...new Set(getSkepticActionsByType(actions, "rerun_lane").flatMap((action) => action.lane_names ?? []))];
}

export function selectToolSubset(actions: SkepticAction[]): string[] {
  return [...new Set(getSkepticActionsByType(actions, "rerun_tool").flatMap((action) => action.provider_ids ?? []))];
}

function mergeLaneArtifacts<T>(args: { current: T[]; reused: T[]; key: (item: T) => string }): T[] {
  const map = new Map(args.reused.map((item) => [args.key(item), item]));
  for (const item of args.current) map.set(args.key(item), item);
  return [...map.values()];
}

function dedupeBySignature<T>(items: T[], signature: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(signature(item), item);
  }
  return [...map.values()];
}

function recomputeScoreSummary(methodology: MethodologyArtifact, analysisProjectName: string, controlResults: ControlResult[], findings: Finding[]) {
  const frameworkMap = new Map<string, { score: number; max: number; assessed: number; applicable: number; controlIds: string[] }>();
  for (const control of controlResults) {
    if (!frameworkMap.has(control.framework)) {
      frameworkMap.set(control.framework, { score: 0, max: 0, assessed: 0, applicable: 0, controlIds: [] });
    }
    const record = frameworkMap.get(control.framework)!;
    record.controlIds.push(control.control_id);
    if (control.applicability === "applicable") {
      record.applicable += 1;
      record.max += control.max_score;
      record.score += control.score_awarded;
      if (control.assessability !== "not_assessed") record.assessed += 1;
    }
  }
  const frameworkScores = [...frameworkMap.entries()].map(([framework, item]) => ({
    framework,
    score: item.score,
    max_score: item.max,
    percentage: item.max > 0 ? Math.max(0, Math.min(100, Math.round((item.score / item.max) * 100))) : 0,
    assessed_controls: item.assessed,
    applicable_controls: item.applicable,
    control_ids: item.controlIds
  }));
  const numerator = frameworkScores.reduce((sum, item) => sum + item.score, 0);
  const denominator = frameworkScores.reduce((sum, item) => sum + item.max_score, 0);
  const overallScore = denominator > 0 ? Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100))) : 0;
  const rating = overallScore >= 90 ? "excellent" : overallScore >= 80 ? "strong" : overallScore >= 65 ? "good" : overallScore >= 45 ? "fair" : "poor";
  const highSeverityCount = findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").length;
  return {
    methodology_version: methodology.version,
    overall_score: overallScore,
    rating,
    framework_scores: frameworkScores,
    limitations: [
      "Static mode does not execute target code, build pipelines, or runtime validation paths.",
      "Controls that depend on hosted repository settings or build provenance remain not_assessed in this run.",
      "Evidence provider results depend on configured binaries or APIs; skipped providers reduce assessability but should not be mistaken for passing posture."
    ],
    leaderboard_summary: `${analysisProjectName} received a ${overallScore}/100 standards-based static audit score (${rating}). ${findings.length} findings were emitted, including ${highSeverityCount} high or critical issues, from assessed controls across ${frameworkScores.length} framework groups.`
  };
}

export function buildCorrectionPlanArtifact(args: {
  skeptic: SkepticArtifact;
  lanePlans: AuditLanePlan[];
}): CorrectionPlanArtifact {
  const planner = args.skeptic.actions.some((action) => action.type === "rerun_planner");
  const threat_model = args.skeptic.actions.some((action) => action.type === "rerun_threat_model");
  const eval_selection = args.skeptic.actions.some((action) => action.type === "rerun_eval_selection");
  const lane_names = selectLaneSubset(args.skeptic.actions);
  const actionLaneNames = [...new Set(args.skeptic.actions.flatMap((action) => action.lane_names ?? []))];
  const provider_ids = selectEvidenceSubset(args.skeptic.actions);
  const tool_provider_ids = selectToolSubset(args.skeptic.actions);
  const actionProviderIds = [...new Set(args.skeptic.actions.flatMap((action) => action.provider_ids ?? []))];
  const control_ids = [...new Set(args.skeptic.actions.flatMap((action) => action.control_ids ?? []))];
  const requestedAdditionalEvidence = args.skeptic.actions.some((action) => action.type === "request_additional_evidence");
  const triggered = planner || threat_model || eval_selection || lane_names.length > 0 || provider_ids.length > 0 || control_ids.length > 0 || requestedAdditionalEvidence;
  const selectiveOnly = !planner && !threat_model && !eval_selection && (lane_names.length > 0 || provider_ids.length > 0 || requestedAdditionalEvidence || control_ids.length > 0);

  return {
    triggered,
    supervisor_action_count: args.skeptic.actions.length,
    requested_actions: args.skeptic.actions,
    rerun: {
      planner,
      threat_model,
      eval_selection,
      lane_names: lane_names.length ? lane_names : actionLaneNames.length ? actionLaneNames : args.lanePlans.map((plan) => plan.lane_name),
      provider_ids: provider_ids.length ? provider_ids : actionProviderIds,
      tool_provider_ids,
      control_ids,
      requested_additional_evidence: requestedAdditionalEvidence,
      selective_only: selectiveOnly
    },
    merge_strategy: !triggered ? "no_rerun" : selectiveOnly ? "merge_selective" : "replace_cycle",
    notes: [
      selectiveOnly
        ? "Supervisor requested selective correction reruns that can be merged back into the existing cycle."
        : triggered
          ? "Supervisor requested broad correction reruns that replace the prior assessment cycle outputs."
          : "Supervisor did not request reruns or reassessment actions."
    ]
  };
}

export function mergeSelectiveAssessmentCycle(args: {
  baseCycle: any;
  patchCycle: any;
  methodology: MethodologyArtifact;
  analysisProjectName: string;
  controlCatalog: any[];
}): { cycle: any; mergeSummary: CorrectionMergeSummary } {
  const updatedLaneNames = new Set(args.patchCycle.laneResults.map((item: any) => item.lane_name));
  const updatedProviderIds = new Set(args.patchCycle.evidenceExecutions.map((item: any) => item.provider_id));
  const updatedControlIds = new Set(args.patchCycle.laneResults.flatMap((lane: any) => lane.control_results.map((control: ControlResult) => control.control_id)));
  const updatedFindingIds = new Set(args.patchCycle.laneResults.flatMap((lane: any) => lane.findings.map((finding: Finding) => finding.finding_id)));

  const reusedLaneNames = args.baseCycle.laneResults.filter((item: any) => !updatedLaneNames.has(item.lane_name)).map((item: any) => item.lane_name);
  const reusedProviderIds = args.baseCycle.evidenceExecutions.filter((item: any) => !updatedProviderIds.has(item.provider_id)).map((item: any) => item.provider_id);

  const mergedLaneResults = mergeLaneArtifacts({ current: args.patchCycle.laneResults, reused: args.baseCycle.laneResults.filter((item: any) => !updatedLaneNames.has(item.lane_name)), key: (item: any) => item.lane_name });
  const mergedEvidenceExecutions = mergeLaneArtifacts({ current: args.patchCycle.evidenceExecutions, reused: args.baseCycle.evidenceExecutions.filter((item: any) => !updatedProviderIds.has(item.provider_id)), key: (item: any) => item.provider_id });
  const mergedEvidenceRecords = dedupeBySignature([
    ...args.baseCycle.evidenceRecords.filter((item: any) => item.source_type !== "tool" || !updatedProviderIds.has(item.source_id)),
    ...args.patchCycle.evidenceRecords.filter((item: any) => item.source_type !== "analysis" && item.source_type !== "repo_context")
  ], (item: any) => item.evidence_id ?? `${item.source_type}:${item.source_id}:${item.summary}`);
  const mergedControlResults = mergeLaneArtifacts({ current: args.patchCycle.controlResults, reused: args.baseCycle.controlResults.filter((item: any) => !updatedControlIds.has(item.control_id)), key: (item: any) => item.control_id });
  const mergedFindings = mergeLaneArtifacts({ current: args.patchCycle.findings, reused: args.baseCycle.findings.filter((item: any) => !updatedFindingIds.has(item.finding_id)), key: (item: any) => item.finding_id });
  const mergedLaneSpecialistOutputs = mergeLaneArtifacts({ current: args.patchCycle.laneSpecialistOutputs ?? [], reused: (args.baseCycle.laneSpecialistOutputs ?? []).filter((item: any) => !updatedLaneNames.has(item.lane_name)), key: (item: any) => item.lane_name });
  const mergedObservations = dedupeBySignature([
    ...args.baseCycle.observations,
    ...args.patchCycle.observations
  ], (item: any) => `${String(item.title ?? "").trim()}::${String(item.summary ?? "").trim()}`);
  const dimensionScores = computeBaselineDimensionScores(mergedControlResults, args.controlCatalog);
  const staticScore = computeStaticBaselineScore(dimensionScores);
  const scoreSummary = recomputeScoreSummary(args.methodology, args.analysisProjectName, mergedControlResults, mergedFindings);

  return {
    cycle: {
      ...args.baseCycle,
      runPlan: args.patchCycle.runPlan,
      evidenceExecutions: mergedEvidenceExecutions,
      evidenceRecords: mergedEvidenceRecords,
      laneResults: mergedLaneResults,
      laneSpecialistOutputs: mergedLaneSpecialistOutputs,
      controlResults: mergedControlResults,
      findings: mergedFindings,
      observations: mergedObservations,
      dimensionScores,
      staticScore,
      scoreSummary
    },
    mergeSummary: {
      merged_lane_names: Array.from(updatedLaneNames) as string[],
      merged_provider_ids: Array.from(updatedProviderIds) as string[],
      merged_control_ids: Array.from(updatedControlIds) as string[],
      merged_finding_ids: Array.from(updatedFindingIds) as string[],
      reused_lane_names: [...reusedLaneNames],
      reused_provider_ids: [...reusedProviderIds]
    }
  };
}

export function buildCorrectionResultArtifact(args: {
  correctionPlan: CorrectionPlanArtifact;
  finalSkepticReview: SkepticArtifact;
  mergedLaneNames?: string[];
  mergedProviderIds?: string[];
  mergedToolProviderIds?: string[];
  mergedControlIds?: string[];
  mergedFindingIds?: string[];
  reusedLaneNames?: string[];
  reusedProviderIds?: string[];
  reusedToolProviderIds?: string[];
}): CorrectionResultArtifact {
  return {
    triggered: args.correctionPlan.triggered,
    correction_pass_completed: args.correctionPlan.triggered,
    merge_strategy: args.correctionPlan.merge_strategy,
    rerun: {
      planner: args.correctionPlan.rerun.planner,
      threat_model: args.correctionPlan.rerun.threat_model,
      eval_selection: args.correctionPlan.rerun.eval_selection,
      lane_names: args.mergedLaneNames ?? args.correctionPlan.rerun.lane_names,
      provider_ids: args.mergedProviderIds ?? args.correctionPlan.rerun.provider_ids,
      tool_provider_ids: args.mergedToolProviderIds ?? args.correctionPlan.rerun.tool_provider_ids
    },
    reused: {
      lane_names: args.reusedLaneNames ?? [],
      provider_ids: args.reusedProviderIds ?? [],
      tool_provider_ids: args.reusedToolProviderIds ?? []
    },
    merged: {
      lane_names: args.mergedLaneNames ?? [],
      provider_ids: args.mergedProviderIds ?? [],
      tool_provider_ids: args.mergedToolProviderIds ?? [],
      control_ids: args.mergedControlIds ?? [],
      finding_ids: args.mergedFindingIds ?? []
    },
    final_supervisor_action_count: args.finalSkepticReview.actions.length,
    notes: [
      args.correctionPlan.merge_strategy === "merge_selective"
        ? "Selective rerun outputs were merged back with reused cycle artifacts."
        : args.correctionPlan.merge_strategy === "replace_cycle"
          ? "Correction rerun replaced the prior cycle outputs."
          : "No corrective rerun was required."
    ]
  };
}
