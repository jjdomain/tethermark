import type { AuditRequest, AnalysisSummary, SandboxSession, TargetDescriptor } from "../contracts.js";
import { analyzeTarget, prepareTarget } from "../repo.js";
import { buildRepoContext } from "../repo-context.js";
import { createSandboxManager } from "../sandbox/manager.js";

export async function stagePrepareTarget(runId: string, request: AuditRequest): Promise<{
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: AnalysisSummary;
  repoContext: Awaited<ReturnType<typeof buildRepoContext>>;
}> {
  const sandboxManager = createSandboxManager();
  const sandbox = await sandboxManager.create(runId, request);
  const target = await prepareTarget(request, sandbox);
  const analysis = await analyzeTarget(target);
  const repoContext = await buildRepoContext(target, analysis);
  return { sandbox, target, analysis, repoContext };
}
