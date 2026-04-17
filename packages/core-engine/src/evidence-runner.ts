import type { EvidenceExecutionRecord } from "./contracts.js";
import { executeEvidenceProvider } from "./evidence-providers.js";

const AUTO_FALLBACKS: Record<string, string[]> = {
  scorecard: ["scorecard_api"]
};

function shouldAutoFallback(requestedProviderId: string, result: EvidenceExecutionRecord, uniqueProviders: string[]): string[] {
  const candidates = AUTO_FALLBACKS[requestedProviderId] ?? [];
  if (result.status !== "skipped") return [];
  if (!(result.failure_category === "command_unavailable" || result.failure_category === "sandbox_blocked")) return [];
  return candidates.filter((candidate) => !uniqueProviders.includes(candidate));
}

function withAdapterMetadata(args: {
  record: EvidenceExecutionRecord;
  requestedProviderId: string;
  requestedTool: string;
  adapterAction: "direct" | "fallback";
  fallbackReason?: string | null;
  fallbackCandidates?: string[];
  attemptOrder: number;
}): EvidenceExecutionRecord {
  return {
    ...args.record,
    adapter: {
      requested_provider_id: args.requestedProviderId,
      requested_tool: args.requestedTool,
      adapter_action: args.adapterAction,
      fallback_reason: args.fallbackReason ?? null,
      fallback_candidates: args.fallbackCandidates ?? [],
      attempt_order: args.attemptOrder
    }
  };
}

export async function runEvidenceProviders(args: {
  providerIds: string[];
  rootPath: string;
  repoUrl: string | null;
  request: any;
  analysisSummary?: unknown;
}): Promise<EvidenceExecutionRecord[]> {
  const uniqueProviders = [...new Set(args.providerIds)];
  const results: EvidenceExecutionRecord[] = [];
  let attemptOrder = 0;

  for (const providerId of uniqueProviders) {
    const result = await executeEvidenceProvider({
      providerId,
      request: args.request,
      rootPath: args.rootPath,
      repoUrl: args.repoUrl,
      analysisSummary: args.analysisSummary
    });
    const fallbackCandidates = shouldAutoFallback(providerId, result, uniqueProviders);
    results.push(withAdapterMetadata({
      record: result,
      requestedProviderId: providerId,
      requestedTool: result.tool,
      adapterAction: "direct",
      fallbackCandidates,
      attemptOrder: ++attemptOrder
    }));

    for (const fallbackProviderId of fallbackCandidates) {
      const fallbackResult = await executeEvidenceProvider({
        providerId: fallbackProviderId,
        request: args.request,
        rootPath: args.rootPath,
        repoUrl: args.repoUrl,
        analysisSummary: args.analysisSummary,
        fallbackFrom: providerId
      });
      results.push(withAdapterMetadata({
        record: fallbackResult,
        requestedProviderId: providerId,
        requestedTool: result.tool,
        adapterAction: "fallback",
        fallbackReason: result.failure_category ?? result.status,
        fallbackCandidates,
        attemptOrder: ++attemptOrder
      }));
    }
  }

  return results;
}
