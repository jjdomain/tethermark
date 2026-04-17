import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildEvalSelectionContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, EvalSelectionArtifact, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, StandardControlDefinition, TargetDescriptor, TargetProfileArtifact, ThreatModelArtifact } from "../contracts.js";

export async function stageSelectEvidence(args: {
  runId: string;
  request: AuditRequest;
  auditPolicy: AuditPolicyArtifact;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  plannerArtifact: PlannerArtifact;
  threatModel: ThreatModelArtifact;
  controlCatalog: StandardControlDefinition[];
  methodology: MethodologyArtifact;
  agentRuntime: AgentRuntime;
  skepticFeedback?: unknown;
}): Promise<EvalSelectionArtifact> {
  const call = await args.agentRuntime.callAgent<EvalSelectionArtifact>({
    runId: args.runId,
    agentName: "eval_selection_agent",
    context: buildEvalSelectionContext({
      request: args.request,
      target: args.target,
      analysis: args.analysis,
      repoContext: args.repoContext,
      targetProfile: args.targetProfile,
      plannerArtifact: args.plannerArtifact,
      threatModel: args.threatModel,
      controlCatalog: args.controlCatalog,
      methodology: args.methodology,
      auditPolicy: args.auditPolicy,
      skepticFeedback: args.skepticFeedback
    }),
    inputArtifacts: ["analysis.json", "repo-context.json", "planner-artifact.json", "threat-model.json", "methodology.json", "audit-policy.json"],
    outputArtifact: args.skepticFeedback ? "eval-selection-corrected.json" : "eval-selection.json",
    stageName: "select_evidence"
  });
  return call.artifact;
}
