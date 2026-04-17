import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildLaneSpecialistContext } from "../agent-context-builders.js";
import type { AnalysisSummary, AuditLanePlan, AuditObservation, AuditPackageId, AuditPolicyArtifact, ControlResult, EvidenceExecutionRecord, EvidenceRecord, Finding, LaneResult, LaneSpecialistArtifact, LaneSpecialistRunArtifact, MethodologyArtifact, RepoContextArtifact, ScoreSummary, StandardControlDefinition, TargetClass, TargetDescriptor, ThreatModelArtifact } from "../contracts.js";
import { analyzeLane } from "../lane-analyzers.js";
import { evaluateStandardsAudit } from "../standards-audit.js";
import { createId } from "../utils.js";

function shouldRunLaneSpecialists(auditPackageId?: AuditPackageId): boolean {
  return auditPackageId === "deep-static" || auditPackageId === "premium-comprehensive";
}

export async function stageRunLanes(args: {
  runId: string;
  request: any;
  target: TargetDescriptor;
  analysis: AnalysisSummary;
  repoContext: RepoContextArtifact;
  targetClass: TargetClass;
  threatModel: ThreatModelArtifact;
  toolExecutions: EvidenceExecutionRecord[];
  evidenceRecords: EvidenceRecord[];
  lanePlans: AuditLanePlan[];
  controlCatalog: StandardControlDefinition[];
  applicableControlIds: string[];
  deferredControlIds: string[];
  nonApplicableControlIds: string[];
  methodology: MethodologyArtifact;
  auditPolicy: AuditPolicyArtifact;
  agentRuntime?: AgentRuntime;
  auditPackageId?: AuditPackageId;
}): Promise<{
  findings: Finding[];
  controlResults: ControlResult[];
  observations: AuditObservation[];
  scoreSummary: ScoreSummary;
  dimensionScores: any[];
  staticScore: number;
  laneResults: LaneResult[];
  laneSpecialistOutputs: LaneSpecialistRunArtifact[];
}> {
  const standardsAudit = await evaluateStandardsAudit({
      rootPath: args.target.local_path ?? args.target.snapshot.value ?? args.analysis.root_path,
      analysis: args.analysis,
      targetClass: args.targetClass,
      threatModel: args.threatModel,
      toolExecutions: args.toolExecutions,
      evidenceRecords: args.evidenceRecords,
      controlCatalog: args.controlCatalog,
      applicableControlIds: args.applicableControlIds,
      deferredControlIds: args.deferredControlIds,
    nonApplicableControlIds: args.nonApplicableControlIds,
    methodology: args.methodology
  });

  const laneObservations: AuditObservation[] = [];
  const laneResults: LaneResult[] = [];
  const laneSpecialistOutputs: LaneSpecialistRunArtifact[] = [];

  for (const plan of args.lanePlans) {
    const controls = standardsAudit.controlResults.filter((control) => plan.controls_in_scope.includes(control.control_id));
    const findings = standardsAudit.findings.filter((finding) => finding.control_ids.some((controlId) => plan.controls_in_scope.includes(controlId)));
    const laneScopedEvidence = args.evidenceRecords.filter((record) => !record.lane_name || record.lane_name === plan.lane_name || record.control_ids.some((controlId) => plan.controls_in_scope.includes(controlId)));
    const evidenceUsed = laneScopedEvidence.map((record) => record.evidence_id);

    const laneAnalysis = analyzeLane({
      auditPackageId: args.auditPackageId,
      plan,
      analysis: args.analysis,
      threatModel: args.threatModel,
      toolExecutions: args.toolExecutions,
      evidenceRecords: args.evidenceRecords,
      controlResults: controls,
      findings
    });
    laneObservations.push(...laneAnalysis.observations);

    let summary = laneAnalysis.summary;
    if (shouldRunLaneSpecialists(args.auditPackageId) && args.agentRuntime) {
      const laneTools = args.toolExecutions.filter((item) => plan.allowed_tools.includes(item.tool) || plan.allowed_tools.includes(item.provider_id) || plan.allowed_tools.includes(item.adapter?.requested_provider_id ?? ""));
      const specialist = await args.agentRuntime.callAgent<LaneSpecialistArtifact>({
        runId: args.runId,
        agentName: "lane_specialist_agent",
        context: buildLaneSpecialistContext({
          request: args.request,
          target: args.target,
          analysis: args.analysis,
          repoContext: args.repoContext,
          threatModel: args.threatModel,
          plan,
          findings,
          controlResults: controls,
          evidenceRecords: laneScopedEvidence,
          toolExecutions: laneTools,
          auditPolicy: args.auditPolicy
        }),
        inputArtifacts: ["lane-plans.json", "lane-results.json", "evidence-records.json", "tool-executions.json", "audit-policy.json"],
        outputArtifact: "lane-specialist-" + plan.lane_name + ".json",
        stageName: "lane_analysis",
        laneName: plan.lane_name
      });
      summary = [...summary, ...specialist.artifact.summary];
      laneObservations.push(...specialist.artifact.observations.map((item, index) => ({
        observation_id: createId("observation_" + plan.lane_name + "_" + index),
        title: item.title,
        summary: item.summary,
        evidence: item.evidence
      })));
      laneSpecialistOutputs.push({
        lane_name: plan.lane_name,
        agent_name: "lane_specialist_agent",
        output_artifact: "lane-specialist-" + plan.lane_name + ".json",
        summary: specialist.artifact.summary,
        observations: specialist.artifact.observations,
        evidence_ids: [...new Set(evidenceUsed)],
        tool_provider_ids: [...new Set(laneTools.map((item) => item.provider_id))]
      });
    }

    laneResults.push({
      lane_name: plan.lane_name,
      findings,
      control_results: controls,
      evidence_used: [...new Set(evidenceUsed)],
      summary
    });
  }

  return {
    findings: standardsAudit.findings,
    controlResults: standardsAudit.controlResults,
    observations: [...standardsAudit.observations, ...laneObservations],
    scoreSummary: standardsAudit.scoreSummary,
    dimensionScores: standardsAudit.dimensionScores,
    staticScore: standardsAudit.staticScore,
    laneResults,
    laneSpecialistOutputs
  };
}
