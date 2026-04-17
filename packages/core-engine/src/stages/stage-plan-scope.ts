import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildPlannerContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, StandardControlDefinition, TargetDescriptor, TargetProfileArtifact } from "../contracts.js";
import { buildHeuristicTargetProfile } from "../planner.js";

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
    plannerArtifact: call.artifact,
    targetProfile: {
      heuristic,
      semantic_review: call.artifact.classification_review
    }
  };
}
