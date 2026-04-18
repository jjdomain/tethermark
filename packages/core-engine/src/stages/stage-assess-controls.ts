import type { AuditLanePlan, AuditObservation, AuditPolicyArtifact, AuditRequest, ControlResult, EvidenceLocation, EvidenceRecord, Finding, LaneSpecialistRunArtifact, MethodologyArtifact, RepoContextArtifact, ScoreSummary, TargetDescriptor, ThreatModelArtifact } from "../contracts.js";
import { assembleRunPlan } from "../planner.js";
import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { stageCollectEvidence } from "./stage-collect-evidence.js";
import { stageRunLanes } from "./stage-run-lanes.js";
import { createId } from "../utils.js";

function buildSandboxEvidenceRecords(args: {
  runId: string;
  sandbox: any;
  controlIds: string[];
}): EvidenceRecord[] {
  function normalizePath(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.replace(/\\/g, "/") : null;
  }
  function deriveSandboxLocations(item: any): EvidenceLocation[] {
    const details = item?.normalized_artifact?.details_json ?? {};
    const artifactContext = item?.artifact_context ?? {};
    const candidates = [
      typeof details?.entrypoint === "string" ? { path: details.entrypoint, label: "entrypoint" } : null,
      typeof details?.target_path === "string" ? { path: details.target_path, label: "target" } : null,
      typeof artifactContext?.entrypoint === "string" ? { path: artifactContext.entrypoint, label: "entrypoint" } : null
    ].filter(Boolean) as Array<{ path: string; label: string }>;
    const locations: EvidenceLocation[] = candidates.map((candidate) => ({
      source_kind: "file" as const,
      path: normalizePath(candidate.path),
      line: null,
      column: null,
      end_line: null,
      end_column: null,
      label: candidate.label
    })).filter((location) => location.path);
    const probe = details?.probe ?? {};
    const startup = details?.startup ?? {};
    const uris = [
      ...(typeof probe?.successful_target === "string" ? [probe.successful_target] : []),
      ...(Array.isArray(probe?.discovered_endpoints) ? probe.discovered_endpoints : []),
      ...(Array.isArray(probe?.attempted_targets) ? probe.attempted_targets : [])
    ];
    for (const uri of uris) {
      if (typeof uri !== "string" || !/^https?:/i.test(uri)) continue;
      locations.push({
        source_kind: "uri",
        uri,
        path: null,
        line: null,
        column: null,
        end_line: null,
        end_column: null,
        label: "runtime_endpoint"
      } as EvidenceLocation);
    }
    if (typeof startup?.failure_reason === "string" && startup.failure_reason) {
      locations.push({
        source_kind: "symbol",
        symbol: startup.failure_reason,
        path: null,
        uri: null,
        line: null,
        column: null,
        end_line: null,
        end_column: null,
        label: "startup_failure"
      } as EvidenceLocation);
    }
    return locations;
  }
  const executionResults = Array.isArray(args.sandbox?.execution_results) ? args.sandbox.execution_results : [];
  const executionArtifactPath = args.sandbox?.root_dir ? String(args.sandbox.root_dir).replace(/\\/g, "/") + "/artifacts/execution-results.json" : undefined;
  return executionResults
    .filter((item: any) => item?.normalized_artifact)
    .map((item: any) => ({
      evidence_id: createId("evidence"),
      run_id: args.runId,
      source_type: "tool",
      source_id: `sandbox:${item.step_id}`,
      control_ids: args.controlIds,
      summary: item.normalized_artifact?.summary || item.summary || String(item.step_id),
      confidence: item.status === "completed" ? 0.92 : item.status === "ready" ? 0.75 : item.status === "skipped" ? 0.5 : 0.65,
      raw_artifact_path: executionArtifactPath,
      locations: deriveSandboxLocations(item),
      metadata: {
        category: "sandbox_execution",
        step_id: item.step_id,
        phase: item.normalized_artifact?.type || null,
        status: item.status,
        adapter: item.adapter || null,
        execution_runtime: item.execution_runtime || null,
        normalized_artifact: item.normalized_artifact
      }
    }));
}

export async function stageAssessControls(args: {
  request: AuditRequest;
  sandbox: any;
  target: any;
  analysis: any;
  targetClass: string;
  methodology: MethodologyArtifact;
  controlCatalog: any[];
  threatModel: ThreatModelArtifact;
  plannerArtifact: any;
  evalSelectionArtifact: any;
  runId: string;
  repoContext: RepoContextArtifact;
  auditPolicy: AuditPolicyArtifact;
  agentRuntime?: AgentRuntime;
  lanePlans?: AuditLanePlan[];
  analysisSummaryForEvidence?: unknown;
  evidenceOverrideIds?: string[];
  auditPackageId?: any;
}): Promise<{ runPlan: any; evidenceExecutions: any[]; evidenceRecords: EvidenceRecord[]; laneResults: any[]; laneSpecialistOutputs: LaneSpecialistRunArtifact[]; findings: Finding[]; controlResults: ControlResult[]; observations: AuditObservation[]; scoreSummary: ScoreSummary; dimensionScores: any[]; staticScore: number; }> {
  const runPlan = assembleRunPlan({
    runId: args.runId,
    target: args.target,
    request: args.request,
    plannerArtifact: args.plannerArtifact,
    evalSelection: args.evalSelectionArtifact
  });

  const lanePlans = args.lanePlans ?? [{
    lane_name: "repo_posture",
    controls_in_scope: runPlan.applicable_control_ids,
    evidence_requirements: ["Assess all controls in a single compatibility lane."],
    allowed_tools: args.evidenceOverrideIds?.length ? args.evidenceOverrideIds : [...runPlan.baseline_tools, ...runPlan.runtime_tools],
    rationale: ["Compatibility wrapper lane around legacy assess_controls stage."],
    token_budget: 40000,
    rerun_budget: 1
  }];

  const collected = await stageCollectEvidence({
    runId: args.runId,
    request: args.request,
    target: args.target,
    analysis: args.analysis,
    repoContext: (args.analysisSummaryForEvidence as any)?.repoContext ?? { summary: [], capability_signals: [], documents: [] },
    lanePlans: lanePlans.map((plan) => ({
      ...plan,
      allowed_tools: args.evidenceOverrideIds?.length ? args.evidenceOverrideIds : plan.allowed_tools
    }))
  });
  const sandboxEvidenceRecords = buildSandboxEvidenceRecords({
    runId: args.runId,
    sandbox: args.sandbox,
    controlIds: runPlan.applicable_control_ids
  });
  const evidenceRecords = [...collected.evidenceRecords, ...sandboxEvidenceRecords];

  const laneRun = await stageRunLanes({
    runId: args.runId,
    request: args.request,
    target: args.target as TargetDescriptor,
    analysis: args.analysis,
    repoContext: args.repoContext,
    targetClass: args.targetClass as any,
    threatModel: args.threatModel,
    toolExecutions: collected.evidenceExecutions,
    evidenceRecords,
    lanePlans,
    controlCatalog: args.controlCatalog,
    applicableControlIds: runPlan.applicable_control_ids,
    deferredControlIds: runPlan.deferred_control_ids,
    nonApplicableControlIds: runPlan.non_applicable_control_ids,
    methodology: args.methodology,
    auditPolicy: args.auditPolicy,
    agentRuntime: args.agentRuntime,
    auditPackageId: args.auditPackageId
  });

  return {
    runPlan,
    evidenceExecutions: collected.evidenceExecutions,
    evidenceRecords,
    laneResults: laneRun.laneResults,
    laneSpecialistOutputs: laneRun.laneSpecialistOutputs,
    findings: laneRun.findings,
    controlResults: laneRun.controlResults,
    observations: laneRun.observations,
    scoreSummary: laneRun.scoreSummary,
    dimensionScores: laneRun.dimensionScores,
    staticScore: laneRun.staticScore
  };
}
