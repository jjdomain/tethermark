import { resolveAgentProviderConfig, type ProviderConfig, type ProviderWorkloadClass } from "../../llm-provider/src/index.js";
import { isRuntimeRunMode } from "../../validation-runner/src/index.js";
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
  const runtimeMode = isRuntimeRunMode(request.run_mode);
  const provider = request.llm_provider ?? (runtimeMode ? "openai_codex" : undefined);
  return {
    ...request,
    llm_provider: provider,
    llm_model: request.llm_model ?? (runtimeMode && provider === "openai_codex" ? "gpt-5.6-sol" : undefined),
    llm_credential_class: request.llm_credential_class ?? (provider === "openai_codex" ? "chatgpt_session" : provider === "openai" ? "api_key" : provider === "mock" ? "none" : undefined),
    llm_workload_class: request.llm_workload_class ?? defaultWorkload
  };
}

function hasExplicitRuntimeApiOverride(request: AuditRequest): boolean {
  const confirmation = (request.hints as Record<string, any> | undefined)?.runtime_model_api_override;
  return Boolean(
    confirmation
    && typeof confirmation === "object"
    && typeof confirmation.accepted_at === "string"
    && !Number.isNaN(Date.parse(confirmation.accepted_at))
    && typeof confirmation.accepted_by === "string"
    && confirmation.accepted_by.trim()
  );
}

function assertRuntimeModelRouting(request: AuditRequest, config: ProviderConfig): void {
  if (!isRuntimeRunMode(request.run_mode)) return;
  const apiOverrideSelected = request.llm_provider === "openai"
    || request.llm_credential_class === "api_key"
    || Boolean(request.llm_api_key)
    || Object.values(config.agentOverrides ?? {}).some((item) => item.provider === "openai" || Boolean(item.apiKey));
  if (request.llm_provider === "openai_codex" && request.llm_api_key) {
    throw new Error("runtime_codex_chatgpt_session_rejects_api_key:remove llm_api_key or explicitly select the OpenAI API provider");
  }
  if (apiOverrideSelected && !hasExplicitRuntimeApiOverride(request)) {
    throw new Error("runtime_api_key_override_confirmation_required:runtime validation defaults to openai_codex/chatgpt_session; record runtime_model_api_override.accepted_at and accepted_by to use API-key routing");
  }
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
  assertRuntimeModelRouting(normalized, config);
  resolveAgentProviderConfig("", config);
  for (const agentName of AGENT_NAMES) {
    if (config.agentOverrides?.[agentName]) resolveAgentProviderConfig(agentName, config);
  }
  return normalized;
}
