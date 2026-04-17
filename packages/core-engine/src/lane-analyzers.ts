import type {
  AnalysisSummary,
  AuditLanePlan,
  AuditObservation,
  AuditPackageId,
  ControlResult,
  EvidenceExecutionRecord,
  EvidenceRecord,
  Finding,
  LaneResult,
  ThreatModelArtifact
} from "./contracts.js";
import { analyzeDeepPackageSurface } from "./deep-package-analyzers.js";
import { createId } from "./utils.js";

interface LaneAnalyzerInput {
  auditPackageId?: AuditPackageId;
  plan: AuditLanePlan;
  analysis: AnalysisSummary;
  threatModel: ThreatModelArtifact;
  toolExecutions: EvidenceExecutionRecord[];
  evidenceRecords: EvidenceRecord[];
  controlResults: ControlResult[];
  findings: Finding[];
}

interface LaneAnalyzerOutput {
  summary: string[];
  observations: AuditObservation[];
}

export interface RefreshedLaneArtifacts {
  laneResults: LaneResult[];
  laneObservations: AuditObservation[];
}

function toolsForLane(args: LaneAnalyzerInput): EvidenceExecutionRecord[] {
  const allowed = new Set(args.plan.allowed_tools);
  return args.toolExecutions.filter((item) => allowed.has(item.tool) || allowed.has(item.provider_id));
}

function summarizeToolCoverage(executions: EvidenceExecutionRecord[]): string {
  if (!executions.length) return "No lane-scoped tools were selected.";
  const completed = executions.filter((item) => item.status === "completed").length;
  const skipped = executions.filter((item) => item.status === "skipped").length;
  const failed = executions.filter((item) => item.status === "failed").length;
  const normalizedIssues = executions.reduce((sum, item) => sum + (item.normalized?.issue_count ?? 0), 0);
  return `Lane tools: ${completed} completed, ${skipped} skipped, ${failed} failed, ${normalizedIssues} normalized issue signals.`;
}

function blockedToolObservation(title: string, executions: EvidenceExecutionRecord[], laneName: string): AuditObservation | null {
  const blocked = executions.filter((item) => item.capability_status === "blocked" || item.capability_status === "unavailable");
  if (!blocked.length) return null;
  return {
    observation_id: createId("observation"),
    title,
    summary: `Lane '${laneName}' lost ${blocked.length} tool providers due to environment or provider availability constraints: ${blocked.map((item) => item.provider_id).join(", ")}.`,
    evidence: blocked.map((item) => `${item.provider_id}: ${item.summary}`)
  };
}

function repoPostureAnalyzer(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  const executions = toolsForLane(args);
  const summary = [
    `Repository posture reviewed ${args.analysis.security_docs.length} security/governance files and ${args.analysis.ci_workflows.length} CI workflows.`,
    summarizeToolCoverage(executions),
    `Repository posture controls produced ${args.findings.length} findings across ${args.controlResults.length} controls.`
  ];
  const observations = [blockedToolObservation("Repository posture tool coverage gap", executions, args.plan.lane_name)].filter(Boolean) as AuditObservation[];
  return { summary, observations };
}

function supplyChainAnalyzer(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  const executions = toolsForLane(args);
  const summary = [
    `Supply-chain review covered ${args.analysis.dependency_manifests.length} dependency manifests, ${args.analysis.lockfiles.length} lockfiles, and ${args.analysis.release_files.length} release artifacts.`,
    `Detected package ecosystems [${args.analysis.package_ecosystems.join(", ") || "none"}] with managers [${args.analysis.package_managers.join(", ") || "none"}].`,
    summarizeToolCoverage(executions),
    `Supply-chain controls produced ${args.findings.length} findings across ${args.controlResults.length} controls.`
  ];
  const observations: AuditObservation[] = [];
  if (!args.analysis.lockfiles.length) {
    observations.push({
      observation_id: createId("observation"),
      title: "Supply-chain lockfile evidence is sparse",
      summary: `Lane '${args.plan.lane_name}' did not detect lockfiles, which reduces confidence in deterministic dependency posture analysis.`,
      evidence: args.analysis.dependency_manifests.slice(0, 10)
    });
  }
  if (args.auditPackageId === "deep-static" || args.auditPackageId === "premium-comprehensive") {
    const deepPackage = analyzeDeepPackageSurface({
      analysis: args.analysis,
      toolExecutions: executions,
      laneName: args.plan.lane_name
    });
    summary.push(...deepPackage.summary);
    observations.push(...deepPackage.observations);
  }
  const blocked = blockedToolObservation("Supply-chain tool coverage gap", executions, args.plan.lane_name);
  if (blocked) observations.push(blocked);
  return { summary, observations };
}

function agenticControlsAnalyzer(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  const executions = toolsForLane(args);
  const summary = [
    `Agentic controls review considered ${args.analysis.mcp_indicators.length} MCP/plugin indicators, ${args.analysis.agent_indicators.length} agent markers, and ${args.threatModel.attack_surfaces.length} modeled attack surfaces.`,
    summarizeToolCoverage(executions),
    `Agentic controls produced ${args.findings.length} findings across ${args.controlResults.length} controls.`
  ];
  const observations: AuditObservation[] = [];
  if (!args.analysis.mcp_indicators.length && !args.analysis.agent_indicators.length) {
    observations.push({
      observation_id: createId("observation"),
      title: "Agentic surface evidence is limited",
      summary: `Lane '${args.plan.lane_name}' remained in scope, but repository-visible MCP or agent markers were sparse. Results rely more heavily on generic heuristics and planner classification than on direct code markers.`,
      evidence: args.threatModel.attack_surfaces.slice(0, 10)
    });
  }
  const blocked = blockedToolObservation("Agentic controls tool coverage gap", executions, args.plan.lane_name);
  if (blocked) observations.push(blocked);
  return { summary, observations };
}

function dataExposureAnalyzer(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  const executions = toolsForLane(args);
  const exposureSignals = args.analysis.security_docs.length + args.analysis.container_files.length + args.analysis.dependency_manifests.length;
  const summary = [
    `Data-exposure review considered ${exposureSignals} repository-visible data-handling signals and ${args.threatModel.high_risk_components.length} high-risk components.`,
    summarizeToolCoverage(executions),
    `Data-exposure controls produced ${args.findings.length} findings across ${args.controlResults.length} controls.`
  ];
  const observations: AuditObservation[] = [];
  if (executions.every((item) => item.status !== "completed")) {
    observations.push({
      observation_id: createId("observation"),
      title: "Data-exposure scanner coverage is weak",
      summary: `Lane '${args.plan.lane_name}' did not receive any completed scanner outputs, so data exposure conclusions are based primarily on deterministic repo analysis and threat-model context.`,
      evidence: executions.map((item) => `${item.provider_id}: ${item.summary}`)
    });
  }
  const blocked = blockedToolObservation("Data-exposure tool coverage gap", executions, args.plan.lane_name);
  if (blocked) observations.push(blocked);
  return { summary, observations };
}

function defaultAnalyzer(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  const executions = toolsForLane(args);
  return {
    summary: [
      `Lane '${args.plan.lane_name}' assessed ${args.controlResults.length} controls.`,
      `Lane '${args.plan.lane_name}' produced ${args.findings.length} findings.`,
      summarizeToolCoverage(executions)
    ],
    observations: [blockedToolObservation(`Lane '${args.plan.lane_name}' tool coverage gap`, executions, args.plan.lane_name)].filter(Boolean) as AuditObservation[]
  };
}

export function analyzeLane(args: LaneAnalyzerInput): LaneAnalyzerOutput {
  switch (args.plan.lane_name) {
    case "repo_posture":
      return repoPostureAnalyzer(args);
    case "supply_chain":
      return supplyChainAnalyzer(args);
    case "agentic_controls":
      return agenticControlsAnalyzer(args);
    case "data_exposure":
      return dataExposureAnalyzer(args);
    default:
      return defaultAnalyzer(args);
  }
}

export function refreshLaneArtifacts(args: {
  auditPackageId?: AuditPackageId;
  lanePlans: AuditLanePlan[];
  laneResults: LaneResult[];
  analysis: AnalysisSummary;
  threatModel: ThreatModelArtifact;
  toolExecutions: EvidenceExecutionRecord[];
  evidenceRecords: EvidenceRecord[];
}): RefreshedLaneArtifacts {
  const laneObservations: AuditObservation[] = [];
  const laneResults = args.laneResults.map((laneResult) => {
    const plan = args.lanePlans.find((item) => item.lane_name === laneResult.lane_name);
    if (!plan) return laneResult;
    const analysis = analyzeLane({
      auditPackageId: args.auditPackageId,
      plan,
      analysis: args.analysis,
      threatModel: args.threatModel,
      toolExecutions: args.toolExecutions,
      evidenceRecords: args.evidenceRecords,
      controlResults: laneResult.control_results,
      findings: laneResult.findings
    });
    laneObservations.push(...analysis.observations);
    return {
      ...laneResult,
      summary: analysis.summary
    };
  });
  return { laneResults, laneObservations };
}
