import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildRemediationContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, RemediationArtifact, RepoContextArtifact, SandboxSession, SkepticArtifact, TargetDescriptor } from "../contracts.js";

export async function stageRemediation(args: {
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
  observations: any[];
  skepticReview: SkepticArtifact;
  scoreSummary: any;
  agentRuntime: AgentRuntime;
  skepticArtifactName?: string;
}): Promise<RemediationArtifact> {
  const call = await args.agentRuntime.callAgent<RemediationArtifact>({
    runId: args.runId,
    agentName: "remediation_agent",
    context: buildRemediationContext({
      request: args.request,
      target: args.target,
      analysis: args.analysis,
      runPlan: args.runPlan,
      findings: args.findings,
      controlResults: args.controlResults,
      observations: args.observations,
      skepticReview: args.skepticReview,
      scoreSummary: args.scoreSummary,
      auditPolicy: args.auditPolicy
    }),
    inputArtifacts: ["findings.json", "control-results.json", args.skepticArtifactName ?? "skeptic-review.json", "final-score-summary.json", "audit-policy.json"],
    outputArtifact: "remediation.json",
    stageName: "remediation"
  });
  return call.artifact;
}
