export type ModelProviderId = "openai" | "openai_codex" | "mock";
export type ProviderWorkloadClass = "interactive_operator" | "unattended_local" | "external_service";
export type ProviderCredentialClass = "chatgpt_session" | "api_key" | "enterprise_access_token" | "none";
export type ProviderInitiationMode = "operator" | "background" | "service";

export interface ProviderPolicyInput {
  provider: ModelProviderId;
  model: string;
  workloadClass?: ProviderWorkloadClass;
  credentialClass?: ProviderCredentialClass;
  maxRequests?: number;
  maxTokens?: number;
}

export interface ProviderPolicyDecision {
  policy_version: "provider-policy.v1";
  allowed: true;
  provider: ModelProviderId;
  model: string;
  workload_class: ProviderWorkloadClass;
  credential_class: ProviderCredentialClass;
  initiation_mode: ProviderInitiationMode;
  max_requests: number;
  max_tokens: number;
  max_concurrency: number;
  min_request_interval_ms: number;
  max_retries: number;
  backoff_base_ms: number;
  circuit_breaker_failure_threshold: number;
  circuit_breaker_cooldown_ms: number;
}

type WorkloadDefaults = Omit<ProviderPolicyDecision,
  "policy_version" | "allowed" | "provider" | "model" | "workload_class" | "credential_class" | "initiation_mode"
>;

const DEFAULT_ALLOWED_MODELS: Record<ModelProviderId, string[]> = {
  mock: ["mock-agent-runtime"],
  openai: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.2", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
  openai_codex: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]
};

const WORKLOAD_DEFAULTS: Record<ProviderWorkloadClass, WorkloadDefaults> = {
  interactive_operator: {
    max_requests: 32,
    max_tokens: 400_000,
    max_concurrency: 2,
    min_request_interval_ms: 100,
    max_retries: 3,
    backoff_base_ms: 250,
    circuit_breaker_failure_threshold: 3,
    circuit_breaker_cooldown_ms: 60_000
  },
  unattended_local: {
    max_requests: 20,
    max_tokens: 260_000,
    max_concurrency: 1,
    min_request_interval_ms: 500,
    max_retries: 3,
    backoff_base_ms: 500,
    circuit_breaker_failure_threshold: 3,
    circuit_breaker_cooldown_ms: 120_000
  },
  external_service: {
    max_requests: 28,
    max_tokens: 400_000,
    max_concurrency: 2,
    min_request_interval_ms: 250,
    max_retries: 3,
    backoff_base_ms: 500,
    circuit_breaker_failure_threshold: 3,
    circuit_breaker_cooldown_ms: 120_000
  }
};

const ALLOWED_CREDENTIALS: Record<ProviderWorkloadClass, Record<ModelProviderId, ProviderCredentialClass[]>> = {
  interactive_operator: {
    mock: ["none"],
    openai: ["api_key"],
    openai_codex: ["chatgpt_session"]
  },
  unattended_local: {
    mock: ["none"],
    openai: ["api_key"],
    openai_codex: []
  },
  external_service: {
    mock: ["none"],
    openai: ["api_key"],
    openai_codex: []
  }
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function envPositiveInt(name: string, fallback: number): number {
  const parsed = Number(readEnv(name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const parsed = Number(readEnv(name));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function providerEnvKey(provider: ModelProviderId): string {
  return provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function allowedModels(provider: ModelProviderId): string[] {
  const configured = readEnv(`AUDIT_LLM_ALLOWED_MODELS_${providerEnvKey(provider)}`);
  if (!configured) return DEFAULT_ALLOWED_MODELS[provider];
  return [...new Set(configured.split(",").map((item) => item.trim()).filter(Boolean))];
}

function defaultCredentialClass(provider: ModelProviderId): ProviderCredentialClass {
  if (provider === "openai") return "api_key";
  if (provider === "openai_codex") return "chatgpt_session";
  return "none";
}

function initiationMode(workloadClass: ProviderWorkloadClass): ProviderInitiationMode {
  if (workloadClass === "interactive_operator") return "operator";
  if (workloadClass === "external_service") return "service";
  return "background";
}

export class ProviderPolicyError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ProviderPolicyError";
  }
}

function requestedBudget(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new ProviderPolicyError("invalid_provider_budget", `${field} must be a positive integer.`);
  }
  if (value > fallback) {
    throw new ProviderPolicyError("provider_budget_exceeds_policy", `${field}=${value} exceeds the ${fallback} limit for this workload.`);
  }
  return value;
}

export function resolveProviderPolicy(input: ProviderPolicyInput): ProviderPolicyDecision {
  const workloadClass = input.workloadClass ?? "unattended_local";
  const credentialClass = input.credentialClass ?? defaultCredentialClass(input.provider);
  const workloadDefaults = WORKLOAD_DEFAULTS[workloadClass];
  if (!workloadDefaults) {
    throw new ProviderPolicyError("unknown_provider_workload", `Unsupported workload class '${String(workloadClass)}'.`);
  }

  const credentials = ALLOWED_CREDENTIALS[workloadClass][input.provider];
  if (!credentials.includes(credentialClass)) {
    throw new ProviderPolicyError(
      "provider_workload_not_allowed",
      `${input.provider}/${credentialClass} is not allowed for ${workloadClass}. Use an API-key provider for unattended or service work.`
    );
  }

  const models = allowedModels(input.provider);
  if (!models.includes(input.model)) {
    throw new ProviderPolicyError(
      "provider_model_not_allowed",
      `Model '${input.model}' is not allowlisted for ${input.provider}. Allowed models: ${models.join(", ") || "none"}.`
    );
  }

  const providerKey = providerEnvKey(input.provider);
  const maxConcurrency = envPositiveInt(`AUDIT_LLM_MAX_CONCURRENCY_${providerKey}`, input.provider === "mock" ? 64 : workloadDefaults.max_concurrency);
  const minRequestIntervalMs = envNonNegativeInt(`AUDIT_LLM_MIN_REQUEST_INTERVAL_MS_${providerKey}`, input.provider === "mock" ? 0 : workloadDefaults.min_request_interval_ms);

  return {
    policy_version: "provider-policy.v1",
    allowed: true,
    provider: input.provider,
    model: input.model,
    workload_class: workloadClass,
    credential_class: credentialClass,
    initiation_mode: initiationMode(workloadClass),
    max_requests: requestedBudget(input.maxRequests, workloadDefaults.max_requests, "maxRequests"),
    max_tokens: requestedBudget(input.maxTokens, workloadDefaults.max_tokens, "maxTokens"),
    max_concurrency: maxConcurrency,
    min_request_interval_ms: minRequestIntervalMs,
    max_retries: envPositiveInt("AUDIT_LLM_MAX_RETRIES", workloadDefaults.max_retries),
    backoff_base_ms: envPositiveInt("AUDIT_LLM_BACKOFF_BASE_MS", workloadDefaults.backoff_base_ms),
    circuit_breaker_failure_threshold: envPositiveInt("AUDIT_LLM_CIRCUIT_FAILURE_THRESHOLD", workloadDefaults.circuit_breaker_failure_threshold),
    circuit_breaker_cooldown_ms: envPositiveInt("AUDIT_LLM_CIRCUIT_COOLDOWN_MS", workloadDefaults.circuit_breaker_cooldown_ms)
  };
}

export function computeBackoffDelayMs(attempt: number, baseMs: number, maxMs = 30_000): number {
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
}

type GovernorState = {
  active: number;
  waiters: Array<() => void>;
  next_request_at: number;
  consecutive_failures: number;
  circuit_open_until: number;
};

const GOVERNOR_STATES = new Map<string, GovernorState>();

function governorState(decision: ProviderPolicyDecision): GovernorState {
  const key = `${decision.provider}:${decision.model}`;
  const existing = GOVERNOR_STATES.get(key);
  if (existing) return existing;
  const created: GovernorState = {
    active: 0,
    waiters: [],
    next_request_at: 0,
    consecutive_failures: 0,
    circuit_open_until: 0
  };
  GOVERNOR_STATES.set(key, created);
  return created;
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function acquire(decision: ProviderPolicyDecision, state: GovernorState): Promise<void> {
  if (state.circuit_open_until > Date.now()) {
    throw new ProviderPolicyError("provider_circuit_open", `Provider circuit is open until ${new Date(state.circuit_open_until).toISOString()}.`);
  }
  if (state.active >= decision.max_concurrency) {
    await new Promise<void>((resolve) => state.waiters.push(resolve));
    return acquire(decision, state);
  }
  state.active += 1;
  const waitMs = Math.max(0, state.next_request_at - Date.now());
  await delay(waitMs);
  state.next_request_at = Date.now() + decision.min_request_interval_ms;
}

function release(state: GovernorState): void {
  state.active = Math.max(0, state.active - 1);
  state.waiters.shift()?.();
}

export async function executeWithProviderGovernor<T>(decision: ProviderPolicyDecision, task: () => Promise<T>): Promise<T> {
  const state = governorState(decision);
  await acquire(decision, state);
  try {
    const result = await task();
    state.consecutive_failures = 0;
    state.circuit_open_until = 0;
    return result;
  } catch (error) {
    if (!(error instanceof ProviderPolicyError)) {
      state.consecutive_failures += 1;
      if (state.consecutive_failures >= decision.circuit_breaker_failure_threshold) {
        state.circuit_open_until = Date.now() + decision.circuit_breaker_cooldown_ms;
      }
    }
    throw error;
  } finally {
    release(state);
  }
}

export function resetProviderGovernorForTests(): void {
  GOVERNOR_STATES.clear();
}
