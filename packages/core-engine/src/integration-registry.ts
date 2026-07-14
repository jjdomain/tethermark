export type IntegrationFieldKind = "api_key" | "base_url" | "url";
export type IntegrationFieldSource = "persisted" | "environment" | "missing" | "not_required" | "default";
export type IntegrationFieldLocation = "credentials" | "integrations";

export interface IntegrationCredentialFieldDefinition {
  id: string;
  label: string;
  kind: IntegrationFieldKind;
  secret: boolean;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  env_var: string | null;
  location: IntegrationFieldLocation;
}

export interface IntegrationCredentialFieldStatus {
  id: string;
  configured: boolean;
  source: IntegrationFieldSource;
  note: string;
  secret: boolean;
  env_var: string | null;
}

export interface IntegrationStatus {
  enabled: boolean;
  configured: boolean;
  source: IntegrationFieldSource;
  note: string;
  fields: IntegrationCredentialFieldStatus[];
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  description: string;
  mode: "manual" | "webhook";
  notes: string[];
  credential_fields: IntegrationCredentialFieldDefinition[];
  status?: IntegrationStatus;
}

const BUILTIN_INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "github_outbound",
    name: "GitHub Draft Export",
    description: "Draft-only GitHub issue, pull request comment, label, and check payloads for manual use.",
    mode: "manual",
    notes: [
      "Disabled by default and never posts from OSS.",
      "Token-backed verification and delivery live in the hosted product."
    ],
    credential_fields: []
  },
  {
    id: "generic_webhook",
    name: "Generic Automation Webhook",
    description: "Optional signed webhook mirror for OSS automation events like run completion and rerun requests.",
    mode: "webhook",
    notes: [
      "Only sends events explicitly selected in settings.",
      "Secret signing is optional but recommended when posting to shared receivers."
    ],
    credential_fields: [
      {
        id: "generic_webhook_url",
        label: "Webhook URL",
        kind: "url",
        secret: false,
        required: false,
        placeholder: "https://example.internal/hooks/audit",
        help_text: "Target URL for signed OSS automation event delivery.",
        env_var: null,
        location: "integrations"
      },
      {
        id: "generic_webhook_secret",
        label: "Webhook Signing Secret",
        kind: "api_key",
        secret: true,
        required: false,
        placeholder: "optional signing secret",
        help_text: "If set, events include an HMAC SHA-256 signature header.",
        env_var: "HARNESS_GENERIC_WEBHOOK_SECRET",
        location: "integrations"
      }
    ]
  }
];

function readValue(
  field: IntegrationCredentialFieldDefinition,
  credentials: Record<string, unknown> | null | undefined,
  integrations: Record<string, unknown> | null | undefined
): unknown {
  return field.location === "credentials" ? credentials?.[field.id] : integrations?.[field.id];
}

function describeFieldStatus(
  field: IntegrationCredentialFieldDefinition,
  credentials: Record<string, unknown> | null | undefined,
  integrations: Record<string, unknown> | null | undefined,
  environment: Record<string, string | undefined>
): IntegrationCredentialFieldStatus {
  const persistedValue = readValue(field, credentials, integrations);
  const persistedConfigured = typeof persistedValue === "string" ? persistedValue.trim().length > 0 : Boolean(persistedValue);
  const envConfigured = field.env_var ? Boolean(environment[field.env_var]) : false;
  let source: IntegrationFieldSource = "missing";
  let note = `${field.label} is not configured.`;
  let configured = persistedConfigured || envConfigured;
  if (persistedConfigured) {
    source = "persisted";
    note = `${field.label} is configured in persisted settings.`;
  } else if (envConfigured) {
    source = "environment";
    note = `${field.label} is provided by ${field.env_var}.`;
  } else if (!field.required) {
    source = field.kind === "base_url" ? "default" : "not_required";
    configured = field.kind === "base_url";
    note = field.kind === "base_url"
      ? `${field.label} will fall back to the default GitHub API host when not overridden.`
      : `${field.label} is optional.`;
  }
  return {
    id: field.id,
    configured,
    source,
    note,
    secret: field.secret,
    env_var: field.env_var
  };
}

function integrationEnabled(id: string, integrations: Record<string, unknown> | null | undefined): boolean {
  if (id === "github_outbound") return String(integrations?.github_mode || "disabled") !== "disabled";
  if (id === "generic_webhook") return typeof integrations?.generic_webhook_url === "string" && integrations.generic_webhook_url.trim().length > 0;
  return false;
}

function describeIntegrationStatus(
  integration: IntegrationDefinition,
  credentials: Record<string, unknown> | null | undefined,
  integrations: Record<string, unknown> | null | undefined,
  environment: Record<string, string | undefined> = process.env
): IntegrationStatus {
  const fields = integration.credential_fields.map((field) => describeFieldStatus(field, credentials, integrations, environment));
  const enabled = integrationEnabled(integration.id, integrations);
  const configured = integration.id === "github_outbound"
    ? enabled
    : integration.id === "generic_webhook"
      ? fields.some((field) => field.id === "generic_webhook_url" && field.configured)
      : fields.every((field) => field.configured);
  return {
    enabled,
    configured,
    source: configured
      ? (fields.some((field) => field.source === "persisted") ? "persisted" : fields.some((field) => field.source === "environment") ? "environment" : "default")
      : "missing",
    note: integration.id === "github_outbound"
      ? enabled
        ? "GitHub draft export is enabled. Posting and webhook sync are hosted-only."
        : "GitHub draft export is disabled."
      : enabled
        ? "Generic webhook delivery is configured."
        : "Generic webhook delivery is disabled.",
    fields
  };
}

export function listBuiltinIntegrations(): IntegrationDefinition[] {
  return BUILTIN_INTEGRATIONS.map((item) => ({
    ...item,
    notes: [...item.notes],
    credential_fields: item.credential_fields.map((field) => ({ ...field })),
    status: item.status ? {
      ...item.status,
      fields: item.status.fields.map((field) => ({ ...field }))
    } : undefined
  }));
}

export function attachIntegrationCredentialStatus(
  integrationsRegistry: IntegrationDefinition[],
  credentials: Record<string, unknown> | null | undefined,
  integrations: Record<string, unknown> | null | undefined,
  environment: Record<string, string | undefined> = process.env
): IntegrationDefinition[] {
  return integrationsRegistry.map((integration) => ({
    ...integration,
    credential_fields: integration.credential_fields.map((field) => ({ ...field })),
    status: describeIntegrationStatus(integration, credentials, integrations, environment)
  }));
}
