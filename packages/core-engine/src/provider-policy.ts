import { resolveAgentProviderConfig, type ProviderConfig, type ProviderWorkloadClass } from "../../llm-provider/src/index.js";
import type { AuditRequest } from "./contracts.js";

const AGENT_NAMES = [
  "planner_agent",
  "threat_model_agent",
  "eval_selection_agent",
  "audit_supervisor_agent",
  "remediation_agent",
  "lane_specialist_agent",
  "learning_synthesizer_agent"
] as const;

function parseAgentOverrides(request: AuditRequest): ProviderConfig["agentOverrides"] {
  const raw = (request.hints as Record<string, unknown> | undefined)?.llm_agent_overrides;
  if (!raw || typeof raw !== "object") return {};
  const overrides: NonNullable<ProviderConfig["agentOverrides"]> = {};
  for (const [agentName, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Record<string, unknown>;
    const provider = candidate.provider === "openai" || candidate.provider === "openai_codex" || candidate.provider === "mock" ? candidate.provider : undefined;
    const model = typeof candidate.model === "string" && candidate.model.trim() ? candidate.model.trim() : undefined;
    const apiKey = typeof candidate.api_key === "string" && candidate.api_key.trim() ? candidate.api_key.trim() : undefined;
    if (provider || model || apiKey) overrides[agentName] = { provider, model, apiKey };
  }
  return overrides;
}

export function normalizeAuditRequestProviderPolicy(
  request: AuditRequest,
  defaultWorkload: ProviderWorkloadClass
): AuditRequest {
  return {
    ...request,
    llm_workload_class: request.llm_workload_class ?? defaultWorkload
  };
}

export function providerConfigFromAuditRequest(request: AuditRequest): ProviderConfig {
  return {
    provider: request.llm_provider,
    model: request.llm_model,
    apiKey: request.llm_api_key,
    workloadClass: request.llm_workload_class,
    credentialClass: request.llm_credential_class,
    maxRequests: request.llm_max_requests,
    maxTokens: request.llm_max_tokens,
    agentOverrides: parseAgentOverrides(request)
  };
}

export function assertAuditRequestProviderPolicy(
  request: AuditRequest,
  defaultWorkload: ProviderWorkloadClass = "interactive_operator"
): AuditRequest {
  const normalized = normalizeAuditRequestProviderPolicy(request, defaultWorkload);
  const config = providerConfigFromAuditRequest(normalized);
  resolveAgentProviderConfig("", config);
  for (const agentName of AGENT_NAMES) {
    if (config.agentOverrides?.[agentName]) resolveAgentProviderConfig(agentName, config);
  }
  return normalized;
}
