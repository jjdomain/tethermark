import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildSupervisorContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, RepoContextArtifact, SandboxSession, SkepticArtifact, StandardControlDefinition, TargetDescriptor, ThreatModelArtifact } from "../contracts.js";

export async function stageSkepticReview(args: {
  runId: string;
  request: AuditRequest;
  auditPolicy: AuditPolicyArtifact;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  runPlan: any;
  findings: any[];
  controlResults: any[];
  toolExecutions: any[];
  threatModel: ThreatModelArtifact;
  scoreSummary: any;
  controlCatalog: StandardControlDefinition[];
  lanePlans?: any[];
  laneResults?: any[];
  agentRuntime: AgentRuntime;
  correctionPass?: boolean;
}): Promise<SkepticArtifact> {
  const call = await args.agentRuntime.callAgent<SkepticArtifact>({
    runId: args.runId,
    agentName: "audit_supervisor_agent",
    context: buildSupervisorContext({
      request: args.request,
      target: args.target,
      analysis: args.analysis,
      repoContext: args.repoContext,
      runPlan: args.runPlan,
      findings: args.findings,
      controlResults: args.controlResults,
      toolExecutions: args.toolExecutions,
      threatModel: args.threatModel,
      scoreSummary: args.scoreSummary,
      controlCatalog: args.controlCatalog,
      lanePlans: args.lanePlans,
      laneResults: args.laneResults,
      auditPolicy: args.auditPolicy,
      correctionPass: args.correctionPass
    }),
    inputArtifacts: ["run-plan.json", "tool-executions.json", "control-results.json", "findings-pre-skeptic.json", "score-summary.json", "audit-policy.json"],
    outputArtifact: args.correctionPass ? "skeptic-review-final.json" : "skeptic-review.json",
    stageName: args.correctionPass ? "skeptic_review_correction" : "skeptic_review"
  });
  return call.artifact;
}
