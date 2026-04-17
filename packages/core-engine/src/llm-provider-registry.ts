export type LlmProviderMode = "local_mock" | "live_api";

export interface LlmModelDefinition {
  id: string;
  label: string;
  recommended_for: string;
}

export type LlmProviderCredentialFieldKind = "api_key" | "base_url";
export type LlmProviderCredentialSource = "not_required" | "persisted" | "environment" | "missing";

export interface LlmProviderCredentialFieldDefinition {
  id: string;
  label: string;
  kind: LlmProviderCredentialFieldKind;
  secret: boolean;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  env_var: string | null;
}

export interface LlmProviderCredentialFieldStatus {
  id: string;
  configured: boolean;
  source: LlmProviderCredentialSource;
  note: string;
  secret: boolean;
  env_var: string | null;
}

export interface LlmProviderCredentialStatus {
  configured: boolean;
  source: LlmProviderCredentialSource;
  note: string;
  fields: LlmProviderCredentialFieldStatus[];
}

export interface LlmProviderDefinition {
  id: string;
  name: string;
  mode: LlmProviderMode;
  requires_api_key: boolean;
  api_key_field: string | null;
  default_model: string | null;
  supports_custom_model: boolean;
  description: string;
  notes: string[];
  models: LlmModelDefinition[];
  credential_fields: LlmProviderCredentialFieldDefinition[];
  credential_status?: LlmProviderCredentialStatus;
}

export interface LlmProviderPreset {
  id: string;
  label: string;
  provider_id: string;
  model: string | null;
  summary: string;
}

const BUILTIN_LLM_PROVIDERS: LlmProviderDefinition[] = [
  {
    id: "mock",
    name: "Mock",
    mode: "local_mock",
    requires_api_key: false,
    api_key_field: null,
    default_model: null,
    supports_custom_model: false,
    description: "Deterministic local mock provider for fixtures, smoke tests, and offline UI validation.",
    notes: [
      "Best for local development and repeatable fixture validation.",
      "Does not require network access or external credentials."
    ],
    models: [],
    credential_fields: []
  },
  {
    id: "openai",
    name: "OpenAI",
    mode: "live_api",
    requires_api_key: true,
    api_key_field: "openai_api_key",
    default_model: "gpt-5.4-mini",
    supports_custom_model: true,
    description: "Live hosted model provider for full planning, review, and remediation generation.",
    notes: [
      "Requires an API key unless the server environment provides one separately.",
      "Use smaller models for balanced/default runs and larger models for deeper review passes."
    ],
    credential_fields: [
      {
        id: "openai_api_key",
        label: "OpenAI API Key",
        kind: "api_key",
        secret: true,
        required: true,
        placeholder: "sk-...",
        help_text: "Used for live planning, review, and remediation calls when the server environment does not already provide OPENAI_API_KEY.",
        env_var: "OPENAI_API_KEY"
      }
    ],
    models: [
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", recommended_for: "balanced default OSS usage" },
      { id: "gpt-5.4", label: "GPT-5.4", recommended_for: "deeper planning and review quality" },
      { id: "gpt-5.2", label: "GPT-5.2", recommended_for: "stable professional work and lower cost than frontier" }
    ]
  }
];

const BUILTIN_LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "local_mock",
    label: "Local Mock",
    provider_id: "mock",
    model: null,
    summary: "Deterministic local preset for fixtures, smoke tests, and fast UI checks."
  },
  {
    id: "openai_balanced",
    label: "OpenAI Balanced",
    provider_id: "openai",
    model: "gpt-5.4-mini",
    summary: "Default live preset for normal OSS runs with moderate cost."
  },
  {
    id: "openai_deep_review",
    label: "OpenAI Deep Review",
    provider_id: "openai",
    model: "gpt-5.4",
    summary: "Higher-depth preset for complex targets and reviewer-focused passes."
  }
];

export function listBuiltinLlmProviders(): LlmProviderDefinition[] {
  return BUILTIN_LLM_PROVIDERS.map((item) => ({
    ...item,
    notes: [...item.notes],
    models: item.models.map((model) => ({ ...model })),
    credential_fields: item.credential_fields.map((field) => ({ ...field })),
    credential_status: item.credential_status ? {
      ...item.credential_status,
      fields: item.credential_status.fields.map((field) => ({ ...field }))
    } : undefined
  }));
}

export function listBuiltinLlmProviderPresets(): LlmProviderPreset[] {
  return BUILTIN_LLM_PROVIDER_PRESETS.map((item) => ({ ...item }));
}

export function getBuiltinLlmProvider(id: string): LlmProviderDefinition | null {
  return listBuiltinLlmProviders().find((item) => item.id === id) ?? null;
}

export function describeLlmProviderCredentialStatus(
  provider: LlmProviderDefinition,
  persistedCredentials?: Record<string, unknown> | null,
  environment: Record<string, string | undefined> = process.env
): LlmProviderCredentialStatus {
  const fields = provider.credential_fields.map((field) => {
    const persistedValue = persistedCredentials?.[field.id];
    const persistedConfigured = typeof persistedValue === "string" ? persistedValue.trim().length > 0 : Boolean(persistedValue);
    const envConfigured = field.env_var ? Boolean(environment[field.env_var]) : false;
    const configured = !field.required || persistedConfigured || envConfigured;
    let source: LlmProviderCredentialSource = "missing";
    let note = `${field.label} is not configured.`;
    if (!field.required) {
      source = persistedConfigured ? "persisted" : envConfigured ? "environment" : "not_required";
      note = persistedConfigured
        ? `${field.label} is configured in persisted settings.`
        : envConfigured
          ? `${field.label} is provided by ${field.env_var}.`
          : `${field.label} is optional for ${provider.name}.`;
    } else if (persistedConfigured) {
      source = "persisted";
      note = `${field.label} is configured in persisted settings.`;
    } else if (envConfigured) {
      source = "environment";
      note = `${field.label} is provided by ${field.env_var}.`;
    }
    return {
      id: field.id,
      configured,
      source,
      note,
      secret: field.secret,
      env_var: field.env_var
    } satisfies LlmProviderCredentialFieldStatus;
  });
  if (!fields.length) {
    return {
      configured: true,
      source: "not_required",
      note: provider.mode === "local_mock"
        ? "No credentials are required for this local mock provider."
        : "No persisted credentials are required for this provider.",
      fields
    };
  }
  const configured = fields.every((field) => field.configured);
  const sources = new Set(fields.map((field) => field.source));
  const source: LlmProviderCredentialSource = configured
    ? (sources.has("persisted") ? "persisted" : sources.has("environment") ? "environment" : "not_required")
    : "missing";
  return {
    configured,
    source,
    note: configured
      ? `Credentials are ready for ${provider.name}.`
      : `One or more required credentials are still missing for ${provider.name}.`,
    fields
  };
}

export function attachLlmProviderCredentialStatus(
  providers: LlmProviderDefinition[],
  persistedCredentials?: Record<string, unknown> | null,
  environment: Record<string, string | undefined> = process.env
): LlmProviderDefinition[] {
  return providers.map((provider) => ({
    ...provider,
    credential_fields: provider.credential_fields.map((field) => ({ ...field })),
    credential_status: describeLlmProviderCredentialStatus(provider, persistedCredentials, environment)
  }));
}
