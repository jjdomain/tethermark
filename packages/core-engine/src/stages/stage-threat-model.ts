import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildThreatModelContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, TargetDescriptor, TargetProfileArtifact, ThreatModelArtifact } from "../contracts.js";

export async function stageThreatModel(args: {
  runId: string;
  request: AuditRequest;
  auditPolicy: AuditPolicyArtifact;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  plannerArtifact: PlannerArtifact;
  methodology: MethodologyArtifact;
  agentRuntime: AgentRuntime;
}): Promise<ThreatModelArtifact> {
  const call = await args.agentRuntime.callAgent<ThreatModelArtifact>({
    runId: args.runId,
    agentName: "threat_model_agent",
    context: buildThreatModelContext({
      request: args.request,
      sandbox: args.sandbox,
      target: args.target,
      analysis: args.analysis,
      repoContext: args.repoContext,
      targetProfile: args.targetProfile,
      plannerArtifact: args.plannerArtifact,
      methodology: args.methodology,
      auditPolicy: args.auditPolicy
    }),
    inputArtifacts: ["target.json", "analysis.json", "repo-context.json", "planner-artifact.json", "methodology.json", "audit-policy.json"],
    outputArtifact: "threat-model.json",
    stageName: "threat_model"
  });
  return call.artifact;
}
