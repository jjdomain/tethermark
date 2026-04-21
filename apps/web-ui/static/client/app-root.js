const { Component, createElement: createReactElement, isValidElement, useEffect, useMemo, useState } = window.React;
const { createRoot } = window.ReactDOM;
const appConfig = window.HARNESS_WEB_UI_CONFIG || { apiBaseUrl: "/api" };

function sanitizeChild(child) {
  if (child == null || typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
    return child;
  }
  if (Array.isArray(child)) {
    return child.map((item) => sanitizeChild(item));
  }
  if (isValidElement(child)) {
    return child;
  }
  try {
    return JSON.stringify(child, null, 2);
  } catch {
    return String(child);
  }
}

function h(type, props, ...children) {
  return createReactElement(type, props, ...children.map((child) => sanitizeChild(child)));
}

const navItems = [
  ["dashboard", "Dashboard"],
  ["runs", "Runs"],
  ["jobs", "Async Jobs"],
  ["followups", "Runtime Follow-ups"],
  ["reviews", "Reviews"],
  ["settings", "Settings"]
];

const pageDescriptions = {
  dashboard: "Overview of active work, queue health, and next actions.",
  runs: "Launch new scans and inspect persisted run details.",
  jobs: "Track durable background work and retry or cancel jobs.",
  followups: "Manage runtime follow-up reruns and adoption decisions.",
  reviews: "Work the review inbox, assignments, and queued decisions.",
  settings: "Configure providers, governance, workspaces, and project defaults."
};

const navGroups = [
  {
    label: "General",
    items: [
      ["dashboard", "Dashboard", "grid"],
      ["runs", "Runs", "play"],
      ["reviews", "Reviews", "users"],
      ["jobs", "Jobs", "bars"],
      ["followups", "Follow-ups", "spark"],
      ["settings", "Settings", "gear"]
    ]
  }
];

const emptySettings = {
  providers_json: {},
  credentials_json: {},
  audit_defaults_json: {},
  preflight_json: {},
  review_json: {},
  integrations_json: {},
  test_mode_json: {}
};
const contextStorageKey = "harness-ui-context";
const defaultRequestContext = {
  workspaceId: "default",
  projectId: "default",
  actorId: "anonymous",
  apiKey: ""
};
const emptyEffectiveSettings = {
  effective: emptySettings,
  layers: {
    global: emptySettings,
    workspace: emptySettings,
    project: emptySettings
  }
};
const defaultAuthInfo = {
  auth_mode: "none",
  identity_enforced: false,
  trusted_mode: true,
  review_roles_security: "advisory",
  guidance: "No authentication is enforced. Workspace roles and review ownership are suitable only for trusted internal deployments and local operator use."
};
const emptyLlmRegistry = {
  providers: [],
  presets: []
};
const emptyIntegrationRegistry = [];

class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[tethermark:web-ui] view render failed", error);
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return h("div", { className: "rounded-2xl border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-800" }, [
      h("div", { key: "title", className: "font-semibold" }, "This view failed to render."),
      h("div", { key: "body", className: "mt-2" }, this.state.error?.message || "Unknown render error."),
      h("div", { key: "hint", className: "mt-2 text-red-700" }, "Try switching views or refreshing. This error is now trapped instead of blanking the whole app."),
      h("button", {
        key: "retry",
        type: "button",
        className: "mt-3 rounded-xl border border-red-300 bg-white px-3 py-2 font-medium text-red-800",
        onClick: () => this.setState({ error: null })
      }, "Retry View")
    ]);
  }
}

function inferTargetKind(targetDefaults) {
  if (targetDefaults?.target_kind) return targetDefaults.target_kind;
  if (targetDefaults?.repo_url) return "repo";
  if (targetDefaults?.endpoint_url) return "endpoint";
  return "path";
}

function normalizeRunModeSelection(value) {
  if (value === "build" || value === "validate") return "runtime";
  return value || "";
}

function deriveRunFormDefaults(project, effectiveSettings) {
  const targetDefaults = project?.target_defaults_json || {};
  const auditDefaults = effectiveSettings?.effective?.audit_defaults_json || {};
  const providerDefaults = effectiveSettings?.effective?.providers_json || {};
  const preflightDefaults = effectiveSettings?.effective?.preflight_json || {};
  const reviewDefaults = effectiveSettings?.effective?.review_json || {};
  return {
    target_kind: inferTargetKind(targetDefaults),
    local_path: targetDefaults.local_path || "fixtures/validation-targets/agent-tool-boundary-risky",
    repo_url: targetDefaults.repo_url || "",
    endpoint_url: targetDefaults.endpoint_url || "",
    run_mode: normalizeRunModeSelection(targetDefaults.run_mode),
    audit_package: targetDefaults.audit_package || auditDefaults.audit_package || "agentic-static",
    audit_policy_pack: targetDefaults.audit_policy_pack || "",
    llm_provider: targetDefaults.llm_provider || providerDefaults.default_provider || "mock",
    llm_model: targetDefaults.llm_model || providerDefaults.default_model || "",
    preflight_strictness: targetDefaults.preflight_strictness || preflightDefaults.strictness || "standard",
    runtime_allowed: targetDefaults.runtime_allowed || preflightDefaults.runtime_allowed || "targeted_only",
    review_severity: targetDefaults.review_severity || reviewDefaults.require_human_review_for_severity || "high",
    review_visibility: targetDefaults.review_visibility || reviewDefaults.default_visibility || "internal"
  };
}

function getReviewCadenceDefaults(effectiveSettings) {
  const reviewDefaults = effectiveSettings?.effective?.review_json || {};
  return {
    renewalDays: Math.max(1, Number(reviewDefaults.disposition_renewal_days || 30)),
    reviewWindowDays: Math.max(1, Number(reviewDefaults.disposition_review_window_days || 30))
  };
}

function getProviderDefinition(registry, providerId) {
  return (registry?.providers || []).find((item) => item.id === providerId) || null;
}

function getModelOptionsForProvider(registry, providerId, currentModel) {
  const provider = getProviderDefinition(registry, providerId);
  const options = provider?.models || [];
  if (currentModel && !options.some((item) => item.id === currentModel)) {
    return [...options, { id: currentModel, label: `${currentModel} (custom)`, recommended_for: "custom" }];
  }
  return options;
}

function getSelectableRunModelOptions(registry, providerId, currentModel) {
  const options = [];
  for (const provider of registry?.providers || []) {
    const providerOptions = getModelOptionsForProvider(registry, provider.id, provider.id === providerId ? currentModel : "");
    for (const model of providerOptions) {
      options.push({
        ...model,
        provider_id: provider.id,
        provider_name: provider.name,
        value: `${provider.id}:${model.id}`
      });
    }
  }
  if (providerId && currentModel && !options.some((item) => item.provider_id === providerId && item.id === currentModel)) {
    const provider = getProviderDefinition(registry, providerId);
    options.push({
      id: currentModel,
      label: `${currentModel} (custom)`,
      recommended_for: "custom",
      provider_id: providerId,
      provider_name: provider?.name || providerId,
      value: `${providerId}:${currentModel}`
    });
  }
  return options;
}

function getProviderCredentialFields(registry, providerId) {
  return getProviderDefinition(registry, providerId)?.credential_fields || [];
}

function getProviderCredentialFieldStatuses(registry, providerId) {
  return getProviderDefinition(registry, providerId)?.credential_status?.fields || [];
}

function getProviderCredentialFieldStatus(registry, providerId, fieldId) {
  return getProviderCredentialFieldStatuses(registry, providerId).find((item) => item.id === fieldId) || null;
}

function getProviderCredentialStatus(registry, providerId, effectiveSettings, overrides) {
  const provider = getProviderDefinition(registry, providerId);
  const overrideValues = overrides || {};
  if (provider?.credential_status) {
    if (!provider.credential_fields?.length || !Object.keys(overrideValues).length) {
      return provider.credential_status;
    }
    const fields = provider.credential_fields.map((field) => {
      const overrideValue = overrideValues[field.id];
      if (!(typeof overrideValue === "string" ? overrideValue.trim() : overrideValue)) {
        return provider.credential_status.fields.find((item) => item.id === field.id) || {
          id: field.id,
          configured: false,
          source: "missing",
          note: `${field.label} is not configured.`,
          secret: field.secret,
          env_var: field.env_var
        };
      }
      return {
        id: field.id,
        configured: true,
        source: "persisted",
        note: `${field.label} will be provided with this run.`,
        secret: field.secret,
        env_var: field.env_var
      };
    });
    const configured = fields.every((field) => field.configured);
    return {
      configured,
      source: configured ? "persisted" : "missing",
      note: configured
        ? `Credentials are ready for ${provider.name}.`
        : `One or more required credentials are still missing for ${provider.name}.`,
      fields
    };
  }
  if (!provider?.requires_api_key || !provider.api_key_field) {
    return {
      configured: true,
      source: "not_required",
      note: provider?.mode === "local_mock" ? "No API key required." : "No persisted API key required.",
      fields: []
    };
  }
  const credentials = {
    ...(effectiveSettings?.effective?.credentials_json || {}),
    ...overrideValues
  };
  const configured = Boolean(credentials[provider.api_key_field]);
  return {
    configured,
    source: configured ? "persisted" : "missing",
    note: configured
      ? `Persisted API key is configured for ${provider.name}.`
      : `No persisted API key is configured for ${provider.name}. Server-level env credentials may still be used.`,
    fields: [{
      id: provider.api_key_field,
      configured,
      source: configured ? "persisted" : "missing",
      note: configured
        ? `Persisted API key is configured for ${provider.name}.`
        : `No persisted API key is configured for ${provider.name}. Server-level env credentials may still be used.`,
      secret: true,
      env_var: null
    }]
  };
}

function buildSettingsCredentialsPayload(settings, registry, drafts) {
  const nextCredentials = { ...(settings?.credentials_json || {}) };
  const providerId = settings?.providers_json?.default_provider || "mock";
  for (const field of getProviderCredentialFields(registry, providerId)) {
    if (!field.secret) continue;
    if (!Object.prototype.hasOwnProperty.call(drafts || {}, field.id)) continue;
    const nextValue = drafts[field.id];
    nextCredentials[field.id] = nextValue ? nextValue : null;
  }
  return nextCredentials;
}

function getIntegrationDefinition(registry, integrationId) {
  return (registry || []).find((item) => item.id === integrationId) || null;
}

function getIntegrationCredentialFields(registry, integrationId) {
  return getIntegrationDefinition(registry, integrationId)?.credential_fields || [];
}

function getIntegrationCredentialStatus(registry, integrationId) {
  return getIntegrationDefinition(registry, integrationId)?.status || null;
}

function getIntegrationCredentialFieldStatus(registry, integrationId, fieldId) {
  return getIntegrationCredentialStatus(registry, integrationId)?.fields?.find((item) => item.id === fieldId) || null;
}

function buildSettingsIntegrationPayload(settings, registry, drafts) {
  const nextCredentials = { ...(settings?.credentials_json || {}) };
  const nextIntegrations = { ...(settings?.integrations_json || {}) };
  for (const integration of registry || []) {
    for (const field of getIntegrationCredentialFields(registry, integration.id)) {
      if (!field.secret) continue;
      if (!Object.prototype.hasOwnProperty.call(drafts || {}, field.id)) continue;
      const nextValue = drafts[field.id];
      if (field.location === "credentials") nextCredentials[field.id] = nextValue ? nextValue : null;
      else nextIntegrations[field.id] = nextValue ? nextValue : null;
    }
  }
  return { credentials: nextCredentials, integrations: nextIntegrations };
}

function buildRunRequest(form, effectiveSettings, llmRegistry) {
  const payload = {
    audit_package: form.audit_package,
    llm_provider: form.llm_provider
  };
  if (form.run_mode === "static") payload.run_mode = "static";
  if (form.audit_policy_pack) payload.audit_policy_pack = form.audit_policy_pack;
  if (form.llm_model) payload.llm_model = form.llm_model;
  const provider = getProviderDefinition(llmRegistry, form.llm_provider);
  const apiKeyField = provider?.credential_fields?.find((field) => field.kind === "api_key")?.id || provider?.api_key_field;
  const configuredApiKey = apiKeyField ? (form[apiKeyField] || effectiveSettings?.effective?.credentials_json?.[apiKeyField]) : null;
  if (configuredApiKey) payload.llm_api_key = configuredApiKey;
  if (form.target_kind === "repo" && form.repo_url) payload.repo_url = form.repo_url;
  else if (form.target_kind === "endpoint" && form.endpoint_url) payload.endpoint_url = form.endpoint_url;
  else if (form.local_path) payload.local_path = form.local_path;
  payload.hints = {
    requested_run_mode_selection: form.run_mode === "auto" ? "auto" : (form.run_mode === "runtime" ? "runtime" : "static"),
    preflight: {
      strictness: form.preflight_strictness,
      runtime_allowed: form.runtime_allowed
    },
    review: {
      require_human_review_for_severity: form.review_severity,
      default_visibility: form.review_visibility
    }
  };
  return payload;
}

function buildLaunchRunRequest(form, requestContext, launchIntentState, effectiveSettings, llmRegistry) {
  const payload = buildRunRequest(form, effectiveSettings, llmRegistry);
  payload.hints = {
    ...(payload.hints || {}),
    launch_intent: {
      source_surface: "web_ui",
      preflight_checked_at: launchIntentState.preflightCheckedAt || null,
      preflight_accepted_at: launchIntentState.preflightAcceptedAt || null,
      preflight_stale: Boolean(launchIntentState.preflightStale),
      notes: [
        "submitted from oss web ui",
        `workspace:${requestContext.workspaceId || "default"}`,
        `project:${requestContext.projectId || "default"}`
      ]
    }
  };
  return payload;
}

function addDaysIso(baseValue, days) {
  const baseTime = baseValue ? new Date(baseValue).getTime() : Date.now();
  return new Date(baseTime + (days * 24 * 36e5)).toISOString();
}

function getRunTargetValue(form) {
  if (form.target_kind === "repo") return form.repo_url || "";
  if (form.target_kind === "endpoint") return form.endpoint_url || "";
  return form.local_path || "";
}

function validateRunForm(form) {
  const issues = [];
  const targetValue = getRunTargetValue(form).trim();
  if (!targetValue) {
    issues.push("A target is required before launch.");
  } else if (form.target_kind === "repo" && !/^https?:\/\/|^git@/i.test(targetValue)) {
    issues.push("Repository targets should use an HTTPS or SSH Git URL.");
  } else if (form.target_kind === "endpoint" && !/^https?:\/\//i.test(targetValue)) {
    issues.push("Endpoint targets should use an HTTP or HTTPS URL.");
  }
  if (!form.audit_package) issues.push("Select an audit package.");
  if (!form.run_mode) issues.push("Select a run mode.");
  if (!form.llm_provider) issues.push("Select a provider.");
  return issues;
}

function deriveLaunchReadiness(form, preflightSummary, preflightAcceptedAt, preflightStale, effectiveSettings, llmRegistry) {
  const issues = validateRunForm(form);
  const providerCredential = getProviderCredentialStatus(llmRegistry, form.llm_provider, effectiveSettings, form);
  const preflightStatus = preflightSummary?.readiness?.status || "not_run";
  const blockers = preflightSummary?.readiness?.blockers || [];
  const warnings = preflightSummary?.readiness?.warnings || [];
  const recommendedProfile = preflightSummary?.launch_profile || null;
  const profileDrift = recommendedProfile
    ? [
      recommendedProfile.audit_package && recommendedProfile.audit_package !== form.audit_package ? "audit package" : null,
      (recommendedProfile.audit_policy_pack || "") !== (form.audit_policy_pack || "") ? "policy pack" : null,
      form.run_mode && form.run_mode !== "auto" && recommendedProfile.run_mode && !(
        form.run_mode === "runtime" && (recommendedProfile.run_mode === "build" || recommendedProfile.run_mode === "validate" || recommendedProfile.run_mode === "runtime")
      ) && recommendedProfile.run_mode !== form.run_mode ? "run mode" : null,
      recommendedProfile.llm_provider && recommendedProfile.llm_provider !== form.llm_provider ? "provider" : null,
      (recommendedProfile.llm_model || "") !== (form.llm_model || "") ? "model" : null
    ].filter(Boolean)
    : [];
  return {
    issues,
    blockers,
    warnings,
    providerCredential,
    preflightStatus,
    accepted: Boolean(preflightAcceptedAt) && !preflightStale,
    canLaunch: issues.length === 0 && preflightStatus !== "blocked" && (!preflightSummary || Boolean(preflightAcceptedAt) && !preflightStale),
    recommendedProfile,
    profileDrift
  };
}

function cn(...items) {
  return items.filter(Boolean).join(" ");
}

function badgeTone(status) {
  if (["succeeded", "approved", "completed"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["failed", "rejected", "canceled"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  if (["queued", "running", "review_required", "in_review", "requires_rerun"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-stone-200 bg-stone-100 text-stone-700";
}

function api(path, init, requestContext = defaultRequestContext) {
  const headers = {
    "content-type": "application/json",
    "x-harness-workspace": requestContext.workspaceId || "default",
    "x-harness-project": requestContext.projectId || "default",
    "x-harness-actor": requestContext.actorId || "anonymous",
    ...(requestContext.apiKey ? { "x-api-key": requestContext.apiKey } : {}),
    ...(init?.headers || {})
  };
  return fetch(appConfig.apiBaseUrl.replace(/\/$/, "") + path, {
    headers,
    ...init
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(payload.error || response.statusText);
    }
    return response.status === 204 ? null : response.json();
  });
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function formatDateInputValue(value) {
  return value ? String(value).slice(0, 16) : "";
}

function hoursSince(value) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 36e5);
}

function reviewAnchor(run) {
  return run.review_workflow?.last_action_at || run.review_workflow?.started_at || run.review_workflow?.opened_at || run.created_at;
}

function reviewAgeLabel(run) {
  const hours = hoursSince(reviewAnchor(run));
  if (hours >= 48) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${Math.floor(hours)}h`;
  return "<1h";
}

function isOverdueReview(run) {
  const status = run.review_workflow?.status || "";
  if (!["review_required", "in_review", "requires_rerun"].includes(status)) return false;
  return hoursSince(reviewAnchor(run)) >= 48;
}

function dispositionDueSoonCount(run) {
  return Number(run.review_summary_counts?.due_soon_disposition_count || 0);
}

function nextDispositionExpiryAt(run) {
  return run.review_summary_counts?.next_disposition_expiry_at || null;
}

function nextDispositionReviewDueAt(run) {
  return run.review_summary_counts?.next_disposition_review_due_at || nextDispositionExpiryAt(run);
}

function runtimeFollowupCount(run) {
  return Number(run.review_summary_counts?.runtime_followup_required_count || 0);
}

function isRuntimeFollowupAdoptionReady(followup) {
  return Boolean(
    followup
    && followup.status === "completed"
    && followup.rerun_outcome
    && followup.rerun_outcome !== "pending"
    && followup.rerun_outcome !== "none"
    && followup.resolution_action_type !== "adopt_rerun_outcome"
  );
}

function runtimeFollowupPriority(followup) {
  if (isRuntimeFollowupAdoptionReady(followup)) return 0;
  if (followup.status === "pending") return 1;
  if (followup.status === "launched") return 2;
  if (followup.status === "completed") return 3;
  if (followup.status === "resolved") return 4;
  return 5;
}

function runtimeFollowupComparisonRows(sourceFinding, sourceEvaluation, rerunFinding, rerunEvaluation, followup) {
  const rows = [
    {
      label: "Finding Title",
      source: sourceFinding?.title || "none",
      rerun: rerunFinding?.title || "none"
    },
    {
      label: "Category",
      source: sourceFinding?.category || "none",
      rerun: rerunFinding?.category || "none"
    },
    {
      label: "Severity",
      source: sourceFinding?.severity || "none",
      rerun: rerunFinding?.severity || "none"
    },
    {
      label: "Confidence",
      source: sourceFinding?.confidence != null ? String(sourceFinding.confidence) : "n/a",
      rerun: rerunFinding?.confidence != null ? String(rerunFinding.confidence) : "n/a"
    },
    {
      label: "Runtime Validation",
      source: sourceEvaluation?.runtime_validation_status || "none",
      rerun: rerunEvaluation?.runtime_validation_status || "none"
    },
    {
      label: "Runtime Follow-up Policy",
      source: sourceEvaluation?.runtime_followup_policy || "none",
      rerun: rerunEvaluation?.runtime_followup_policy || "none"
    },
    {
      label: "Runtime Impact",
      source: sourceEvaluation?.runtime_impact || "none",
      rerun: rerunEvaluation?.runtime_impact || "none"
    },
    {
      label: "Next Action",
      source: sourceEvaluation?.next_action || "none",
      rerun: rerunEvaluation?.next_action || "none"
    },
    {
      label: "Runtime Evidence Count",
      source: String(sourceEvaluation?.runtime_evidence_ids?.length || 0),
      rerun: String(rerunEvaluation?.runtime_evidence_ids?.length || 0)
    },
    {
      label: "Linked Rerun Outcome",
      source: followup?.rerun_outcome || "pending",
      rerun: rerunEvaluation?.runtime_followup_outcome || followup?.rerun_outcome || "pending"
    }
  ];
  return rows.map((row) => ({
    ...row,
    changed: row.source !== row.rerun
  }));
}

function runtimeFollowupRecommendation(followup) {
  if (!followup) return null;
  if (isRuntimeFollowupAdoptionReady(followup) && followup.rerun_outcome === "confirmed") {
    return {
      tone: "emerald",
      title: "Confirmed In Linked Rerun",
      body: "The linked rerun reproduced the runtime-sensitive issue. The next step is usually to adopt the rerun outcome and continue final review."
    };
  }
  if (isRuntimeFollowupAdoptionReady(followup) && followup.rerun_outcome === "not_reproduced") {
    return {
      tone: "amber",
      title: "Not Reproduced In Linked Rerun",
      body: "The linked rerun did not reproduce the original runtime-sensitive issue. Review the diff carefully before adopting the outcome or downgrading confidence."
    };
  }
  if (isRuntimeFollowupAdoptionReady(followup) && followup.rerun_outcome === "still_inconclusive") {
    return {
      tone: "indigo",
      title: "Still Inconclusive",
      body: "The linked rerun completed but did not close the runtime question. Manual runtime review or another rerun path is likely still needed."
    };
  }
  if (followup.status === "launched") {
    return {
      tone: "sky",
      title: "Linked Rerun In Progress",
      body: "A linked rerun job is active. Wait for it to complete before adopting or closing this follow-up."
    };
  }
  if (followup.status === "pending") {
    return {
      tone: "amber",
      title: "Pending Launch",
      body: "This follow-up has not launched its linked rerun yet. Launch it from here when the target environment is ready."
    };
  }
  return null;
}

function reviewPriority(run, actorId) {
  const status = run.review_workflow?.status || "";
  const mine = (run.review_workflow?.current_reviewer_id || "") === (actorId || "");
  if (status === "requires_rerun") return 0;
  if (isOverdueReview(run) && mine) return 1;
  if (isOverdueReview(run)) return 2;
  if (runtimeFollowupCount(run) > 0 && mine) return 3;
  if (runtimeFollowupCount(run) > 0) return 4;
  if (dispositionDueSoonCount(run) > 0 && mine) return 5;
  if (dispositionDueSoonCount(run) > 0) return 6;
  if (mine) return 7;
  if (status === "in_review") return 8;
  return 9;
}

function describeRuntimeProbe(probe) {
  if (!probe) return [];
  const items = [];
  if (probe.successful_target) items.push(`healthy endpoint ${probe.successful_target}`);
  if (probe.classification) items.push(`classification ${probe.classification}`);
  if (probe.status_code != null) items.push(`status ${probe.status_code}`);
  if (Array.isArray(probe.attempted_targets) && probe.attempted_targets.length) {
    items.push(`checked ${probe.attempted_targets.join(", ")}`);
  }
  if (probe.error) items.push(`probe error ${probe.error}`);
  return items;
}

function getEvidenceMetadata(item) {
  return item?.metadata || item?.metadata_json || {};
}

function getEvidenceLocations(item) {
  return Array.isArray(item?.locations) ? item.locations : Array.isArray(item?.locations_json) ? item.locations_json : [];
}

function formatEvidenceLocation(location) {
  if (!location) return "unknown";
  const base = location.path || location.uri || location.symbol || "unknown";
  const line = Number.isFinite(location.line) ? `:${location.line}` : "";
  const column = Number.isFinite(location.column) ? `:${location.column}` : "";
  const label = location.label ? ` (${location.label})` : "";
  return `${base}${line}${column}${label}`;
}

function runtimeArtifactDetailItems(artifact) {
  const details = artifact?.details_json || {};
  const items = [];
  if (details.stack) items.push({ label: "Stack", value: details.stack });
  if (details.framework) items.push({ label: "Framework", value: details.framework });
  if (details.package_manager) items.push({ label: "Package Manager", value: details.package_manager });
  if (details.lockfile) items.push({ label: "Lockfile", value: details.lockfile });
  if (details.script_name) items.push({ label: "Script", value: details.script_name });
  if (details.install_source) items.push({ label: "Install Source", value: details.install_source });
  if (details.test_runner) items.push({ label: "Test Runner", value: details.test_runner });
  if (details.entrypoint) items.push({ label: "Entrypoint", value: details.entrypoint });
  if (details.artifact_role) items.push({ label: "Artifact Role", value: details.artifact_role });
  if (details.startup?.signaled_ready) items.push({ label: "Startup Signal", value: details.startup.indicator || "ready" });
  if (details.startup?.failure_reason) items.push({ label: "Startup Failure", value: details.startup.failure_reason });
  const probeSummary = describeRuntimeProbe(details.probe).join(" | ");
  if (probeSummary) items.push({ label: "Probe", value: probeSummary });
  return items;
}

function Badge({ children }) {
  return h("span", { className: cn("inline-flex rounded-full border px-2.5 py-1 text-xs uppercase tracking-[0.18em]", badgeTone(String(children))) }, children || "none");
}

function SidebarIcon({ kind }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-4 w-4"
  };
  if (kind === "grid") return h("svg", common, [
    h("rect", { key: "a", x: "3", y: "3", width: "5", height: "5", rx: "1" }),
    h("rect", { key: "b", x: "12", y: "3", width: "5", height: "5", rx: "1" }),
    h("rect", { key: "c", x: "3", y: "12", width: "5", height: "5", rx: "1" }),
    h("rect", { key: "d", x: "12", y: "12", width: "5", height: "5", rx: "1" })
  ]);
  if (kind === "play") return h("svg", common, [
    h("circle", { key: "a", cx: "10", cy: "10", r: "7" }),
    h("path", { key: "b", d: "M8 7.5L13 10L8 12.5V7.5Z" })
  ]);
  if (kind === "users") return h("svg", common, [
    h("circle", { key: "a", cx: "7", cy: "7", r: "2.5" }),
    h("path", { key: "b", d: "M3.5 15C4.4 12.9 6 12 7 12C8 12 9.6 12.9 10.5 15" }),
    h("circle", { key: "c", cx: "14", cy: "8", r: "2" }),
    h("path", { key: "d", d: "M12.2 15C12.7 13.6 13.8 12.8 15 12.6C16.1 12.8 17.1 13.6 17.6 15" })
  ]);
  if (kind === "bars") return h("svg", common, [
    h("path", { key: "a", d: "M4 16V10" }),
    h("path", { key: "b", d: "M10 16V4" }),
    h("path", { key: "c", d: "M16 16V7" })
  ]);
  if (kind === "spark") return h("svg", common, [
    h("path", { key: "a", d: "M10 3L11.8 7.2L16 9L11.8 10.8L10 15L8.2 10.8L4 9L8.2 7.2L10 3Z" })
  ]);
  if (kind === "gear") return h("svg", common, [
    h("circle", { key: "a", cx: "10", cy: "10", r: "2.5" }),
    h("path", { key: "b", d: "M10 3.5V5.2M10 14.8V16.5M16.5 10H14.8M5.2 10H3.5M14.6 5.4L13.3 6.7M6.7 13.3L5.4 14.6M14.6 14.6L13.3 13.3M6.7 6.7L5.4 5.4" })
  ]);
  if (kind === "plus") return h("svg", common, [
    h("circle", { key: "a", cx: "10", cy: "10", r: "8" }),
    h("path", { key: "b", d: "M10 6V14M6 10H14" })
  ]);
  if (kind === "mail") return h("svg", common, [
    h("rect", { key: "a", x: "3", y: "4.5", width: "14", height: "11", rx: "2" }),
    h("path", { key: "b", d: "M4.5 6L10 10.2L15.5 6" })
  ]);
  return h("span", { className: "inline-block h-4 w-4" });
}

function Button({ children, variant = "default", className = "", ...props }) {
  if (window.TethermarkUI?.Button) {
    return h(window.TethermarkUI.Button, { variant, className, ...props }, children);
  }
  return h(
    "button",
    {
      className: cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "default" && "bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" && "bg-secondary text-foreground hover:bg-slate-200",
        variant === "outline" && "border border-border bg-white text-slate-700 hover:bg-slate-50",
        className
      ),
      ...props
    },
    children
  );
}

function Card({ title, description, children, className = "" }) {
  return h("section", { className: cn("rounded-[28px] border border-border bg-card p-6 shadow-soft", className) }, [
    title ? h("h3", { key: "t", className: "text-xl font-semibold tracking-tight text-slate-900" }, title) : null,
    description ? h("p", { key: "d", className: "mt-2 text-sm leading-6 text-muted" }, description) : null,
    h("div", { key: "c", className: title || description ? "mt-5" : "" }, children)
  ]);
}

function Modal({ open, title, description, children, onClose, size = "xl" }) {
  if (window.TethermarkUI?.Modal) {
    return h(window.TethermarkUI.Modal, { open, title, description, onClose, size }, children);
  }
  if (!open) return null;
  const widthClass = size === "lg" ? "max-w-4xl" : size === "full" ? "max-w-7xl" : "max-w-6xl";
  return h("div", {
    className: "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm",
    onClick: onClose
  }, h("div", {
    className: cn("w-full rounded-[32px] border border-slate-200 bg-white shadow-2xl", widthClass),
    onClick: (event) => event.stopPropagation()
  }, [
    h("div", { key: "header", className: "flex items-start justify-between gap-6 border-b border-slate-200 px-6 py-5" }, [
      h("div", { key: "copy" }, [
        h("h2", { key: "title", className: "text-2xl font-semibold tracking-tight text-slate-950" }, title),
        description ? h("p", { key: "description", className: "mt-2 max-w-3xl text-sm leading-6 text-slate-500" }, description) : null
      ]),
      h(Button, { key: "close", variant: "outline", onClick: onClose }, "Close")
    ]),
    h("div", { key: "body", className: "px-6 py-6" }, children)
  ]));
}

function SectionPanel({ title, eyebrow, description, children, tone = "default" }) {
  const toneClass = tone === "success"
    ? "border-emerald-200 bg-emerald-50/70"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50/70"
      : tone === "danger"
        ? "border-red-200 bg-red-50/70"
        : "border-slate-200 bg-slate-50";
  return h("section", { className: cn("rounded-3xl border px-5 py-5", toneClass) }, [
    h("div", { key: "head" }, [
      eyebrow ? h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, eyebrow) : null,
      h("div", { key: "title", className: cn("font-semibold text-slate-950", eyebrow ? "mt-2" : "") }, title),
      description ? h("div", { key: "description", className: "mt-2 text-sm leading-6 text-slate-500" }, description) : null
    ]),
    h("div", { key: "body", className: "mt-4" }, children)
  ]);
}

function LaunchStatusCard({ label, value }) {
  return h("div", { className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" }, [
    h("div", { key: "label", className: "font-medium text-slate-900" }, label),
    h("div", { key: "value", className: "mt-1 text-slate-500" }, value)
  ]);
}

function Field({ label, children }) {
  return h("label", { className: "block space-y-2 text-sm" }, [
    h("span", { key: "l", className: "font-medium" }, label),
    children
  ]);
}

function Input(props) {
  return h("input", { className: "w-full rounded-2xl border border-border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200", ...props });
}

function Select(props, children) {
  return h("select", { className: "w-full rounded-2xl border border-border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200", ...props }, children);
}

function Textarea(props) {
  return h("textarea", { className: "min-h-[110px] w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200", ...props });
}

function DashboardKpiCard({ label, value, hint, tone = "slate" }) {
  const toneClasses = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-white text-slate-900",
    amber: "border-amber-200 bg-white text-slate-900",
    blue: "border-sky-200 bg-white text-slate-900"
  };
  const dotClasses = {
    slate: "bg-slate-400",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    blue: "bg-sky-500"
  };
  return h("div", { className: cn("rounded-3xl border p-5 shadow-sm", toneClasses[tone] || toneClasses.slate) }, [
    h("div", { key: "head", className: "flex items-center gap-2 text-sm text-slate-500" }, [
      h("span", { key: "dot", className: cn("h-2.5 w-2.5 rounded-full", dotClasses[tone] || dotClasses.slate) }),
      h("span", { key: "label" }, label)
    ]),
    h("div", { key: "value", className: "mt-4 font-sans text-4xl font-semibold tracking-tight text-slate-950" }, value),
    h("div", { key: "hint", className: "mt-2 text-sm text-slate-500" }, hint)
  ]);
}

function buildDashboardPostureSeries(runs) {
  const now = new Date();
  const months = [];
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString(undefined, { month: "short" }),
      scores: [],
      runCount: 0
    });
  }
  const monthMap = new Map(months.map((item) => [item.key, item]));
  runs.forEach((run) => {
    const createdAt = run?.created_at ? new Date(run.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return;
    const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key);
    if (!bucket) return;
    bucket.runCount += 1;
    const numericScore = Number(run?.overall_score);
    if (Number.isFinite(numericScore)) {
      bucket.scores.push(numericScore);
    }
  });
  let lastScore = 0;
  return months.map((item) => {
    const averageScore = item.scores.length
      ? item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length
      : lastScore;
    lastScore = averageScore;
    return {
      label: item.label,
      score: Number(averageScore.toFixed(1)),
      runCount: item.runCount
    };
  });
}

function buildLinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function DashboardTrendCard({ title, subtitle, series }) {
  if (!series.length) {
    return h(Card, { title, description: subtitle, className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "No trend data yet."));
  }
  const width = 760;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 34, left: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxScore = Math.max(100, ...series.map((item) => item.score || 0));
  const points = series.map((item, index) => ({
    x: padding.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth),
    y: padding.top + (1 - ((item.score || 0) / maxScore)) * plotHeight,
    score: item.score || 0,
    label: item.label
  }));
  const linePath = buildLinePath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
  const latest = series[series.length - 1];
  const previous = series[series.length - 2] || latest;
  const delta = Number((latest.score - previous.score).toFixed(1));
  return h(Card, { title, description: subtitle, className: "border-slate-200 bg-white shadow-sm" }, [
    h("div", { key: "summary", className: "mb-4 flex flex-wrap items-end justify-between gap-4" }, [
      h("div", { key: "value" }, [
        h("div", { key: "score", className: "text-4xl font-semibold tracking-tight text-slate-950" }, `${latest.score}`),
        h("div", { key: "hint", className: cn("mt-1 text-sm", delta >= 0 ? "text-emerald-600" : "text-red-600") }, `${delta >= 0 ? "+" : ""}${delta} vs previous month`)
      ]),
      h("div", { key: "runs", className: "text-sm text-slate-500" }, `${latest.runCount} run${latest.runCount === 1 ? "" : "s"} this month`)
    ]),
    h("svg", { key: "chart", viewBox: `0 0 ${width} ${height}`, className: "h-[260px] w-full overflow-visible" }, [
      h("defs", { key: "defs" }, h("linearGradient", { id: "dashboard-posture-fill", x1: "0", x2: "0", y1: "0", y2: "1" }, [
        h("stop", { key: "start", offset: "0%", stopColor: "#22c55e", stopOpacity: "0.28" }),
        h("stop", { key: "end", offset: "100%", stopColor: "#22c55e", stopOpacity: "0.02" })
      ])),
      [0, 25, 50, 75, 100].map((tick) => {
        const y = padding.top + (1 - (tick / maxScore)) * plotHeight;
        return h("g", { key: `tick:${tick}` }, [
          h("line", { key: "line", x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: "#e2e8f0", strokeWidth: "1" }),
          h("text", { key: "label", x: width - padding.right, y: y - 6, textAnchor: "end", fontSize: "11", fill: "#94a3b8" }, String(tick))
        ]);
      }),
      h("path", { key: "area", d: areaPath, fill: "url(#dashboard-posture-fill)" }),
      h("path", { key: "line", d: linePath, fill: "none", stroke: "#16a34a", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" }),
      points.map((point) => h("circle", { key: `point:${point.label}`, cx: point.x, cy: point.y, r: "4.5", fill: "#16a34a", stroke: "#ffffff", strokeWidth: "2" })),
      points.map((point) => h("text", { key: `month:${point.label}`, x: point.x, y: height - 10, textAnchor: "middle", fontSize: "11", fill: "#64748b" }, point.label))
    ])
  ]);
}

function RunsTable({ runs, selectedRunId, onSelect }) {
  return h("div", { className: "overflow-x-auto rounded-2xl border border-slate-200" }, h("table", { className: "w-full text-sm" }, [
    h("thead", { key: "h", className: "bg-slate-50" }, h("tr", { className: "text-left text-xs uppercase tracking-[0.18em] text-slate-500" }, [
      h("th", { key: "target", className: "px-4 py-3" }, "Target"),
      h("th", { key: "status", className: "px-4 py-3" }, "Status"),
      h("th", { key: "review", className: "px-4 py-3" }, "Review"),
      h("th", { key: "score", className: "px-4 py-3" }, "Score"),
      h("th", { key: "created", className: "px-4 py-3" }, "Created")
    ])),
    h("tbody", { key: "b" }, runs.length ? runs.map((run) => h("tr", {
      key: run.id,
      className: cn("border-t border-slate-200", onSelect && "cursor-pointer hover:bg-slate-50", selectedRunId === run.id && "bg-slate-100"),
      onClick: onSelect ? () => onSelect(run.id) : undefined
    }, [
      h("td", { key: "target", className: "px-4 py-3" }, [
        h("div", { key: "name", className: "font-medium text-slate-900" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
        h("div", { key: "id", className: "text-xs text-slate-500" }, `${run.id} • ${run.audit_package || "default package"}`)
      ]),
      h("td", { key: "status", className: "px-4 py-3" }, h(Badge, null, run.status)),
      h("td", { key: "review", className: "px-4 py-3" }, h(Badge, null, run.review_workflow?.status || "none")),
      h("td", { key: "score", className: "px-4 py-3 font-medium text-slate-900" }, Number.isFinite(Number(run.overall_score)) ? Number(run.overall_score).toFixed(1) : "n/a"),
      h("td", { key: "created", className: "px-4 py-3 text-slate-500" }, formatDate(run.created_at))
    ])) : h("tr", null, h("td", { className: "px-4 py-8 text-center text-slate-500", colSpan: 5 }, "No runs available.")))
  ]));
}

function RunInboxList({ runs, selectedRunId, onSelect }) {
  if (window.TethermarkFeatures?.RunInboxList) {
    return h(window.TethermarkFeatures.RunInboxList, {
      runs,
      selectedRunId,
      onSelect,
      helpers: {
        cn,
        Badge,
        formatDate,
        runtimeFollowupCount
      }
    });
  }
  return runs.length
    ? h("div", { className: "divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white" }, runs.map((run) => {
      const targetName = run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id;
      const status = run.review_workflow?.status || run.status || "unknown";
      return h("button", {
        key: run.id,
        type: "button",
        className: cn(
          "flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50",
          selectedRunId === run.id && "bg-slate-50"
        ),
        onClick: () => onSelect?.(run.id)
      }, [
        h("div", { key: "copy", className: "min-w-0 flex-1" }, [
          h("div", { key: "title", className: "truncate font-medium text-slate-900" }, targetName),
          h("div", { key: "meta", className: "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500" }, [
            h("span", { key: "run" }, run.id),
            h("span", { key: "package" }, run.audit_package || "default package"),
            h("span", { key: "age" }, formatDate(run.created_at))
          ]),
          h("div", { key: "submeta", className: "mt-2 flex flex-wrap gap-2" }, [
            h(Badge, { key: "status" }, run.status),
            h(Badge, { key: "review" }, status),
            runtimeFollowupCount(run) > 0 ? h(Badge, { key: "followup" }, `follow-up ${runtimeFollowupCount(run)}`) : null
          ].filter(Boolean))
        ]),
        h("div", { key: "score", className: "shrink-0 text-right" }, [
          h("div", { key: "value", className: "text-lg font-semibold text-slate-950" }, Number.isFinite(Number(run.overall_score)) ? Number(run.overall_score).toFixed(1) : "n/a"),
          h("div", { key: "label", className: "mt-1 text-xs uppercase tracking-[0.18em] text-slate-400" }, "Score")
        ])
      ]);
    }))
    : h("div", { className: "rounded-3xl border border-dashed border-slate-200 px-5 py-8 text-sm text-slate-500" }, "No runs available in the current scope.");
}

function LaunchAuditModal({
  open,
  onClose,
  requestContext,
  currentProject,
  runForm,
  updateRunForm,
  auditPackages,
  policyPacks,
  llmRegistry,
  runModelOptions,
  selectedProvider,
  launchReadiness,
  preflightSummary,
  preflightStale,
  preflightCheckedAt,
  preflightAcceptedAt,
  preflightLoading,
  applyProviderPreset,
  runPreflight,
  acceptPreflight,
  applyPreflightRecommendations,
  launchRun
}) {
  if (window.TethermarkFeatures?.LaunchAuditModal) {
    return h(window.TethermarkFeatures.LaunchAuditModal, {
      open,
      onClose,
      requestContext,
      currentProject,
      runForm,
      updateRunForm,
      auditPackages,
      policyPacks,
      llmRegistry,
      runModelOptions,
      selectedProvider,
      launchReadiness,
      preflightSummary,
      preflightStale,
      preflightCheckedAt,
      preflightAcceptedAt,
      preflightLoading,
      applyProviderPreset,
      runPreflight,
      acceptPreflight,
      applyPreflightRecommendations,
      launchRun,
      helpers: {
        Modal,
        Button,
        Field,
        Input,
        Select,
        Badge,
        LaunchStatusCard,
        cn,
        formatDate
      }
    });
  }
  const preflightStatus = preflightSummary
    ? (launchReadiness.accepted ? "accepted" : (preflightSummary.readiness?.status || "ready").replace(/_/g, " "))
    : "not run";
  const targetStepComplete = Boolean(getRunTargetValue(runForm).trim()) && !launchReadiness.issues.some((issue) => issue.includes("target"));
  const configStepComplete = Boolean(runForm.run_mode && runForm.audit_package && runForm.llm_provider);
  const requiredFieldsReady = targetStepComplete && configStepComplete;
  const activeModel = runModelOptions.find((item) => item.provider_id === runForm.llm_provider && item.id === runForm.llm_model) || null;
  const providerCredentialFields = selectedProvider?.credential_fields || [];
  return h(Modal, {
    open,
    onClose,
    size: "full",
    title: "Launch Audit",
    description: "Choose a target, confirm the audit configuration, run preflight if needed, then launch."
  }, h("div", { className: "max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto pr-1" }, [
    h("div", { key: "meta-row", className: "flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 pb-3 text-xs uppercase tracking-[0.16em] text-slate-500" }, [
      h("div", { key: "scope" }, `Scope: ${requestContext.workspaceId}/${requestContext.projectId}`),
      h("div", { key: "project" }, `Project defaults: ${currentProject ? currentProject.name : "none"}`),
      h("div", { key: "model" }, `Model: ${activeModel?.label || runForm.llm_model || "none"}`)
    ]),
    h("section", { key: "setup", className: "rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4" }, [
      h("div", { key: "header" }, [
        h("div", { key: "title", className: "text-lg font-semibold text-slate-950" }, "Audit Setup"),
        h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Common launch inputs only. Less-used controls stay on defaults.")
      ]),
      h("div", { key: "setup-grid", className: "mt-4 space-y-5" }, [
        h("div", { key: "target-block", className: "space-y-4" }, [
          h("div", { key: "target-header" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Target"),
            h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Choose the system, repository, or path you want to audit.")
          ]),
          h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
            h(Field, { key: "target-kind", label: "Target kind" }, Select({
              value: runForm.target_kind,
              onChange: (event) => updateRunForm("target_kind", event.target.value)
            }, [
              h("option", { key: "path", value: "path" }, "local path"),
              h("option", { key: "repo", value: "repo" }, "repo url"),
              h("option", { key: "endpoint", value: "endpoint" }, "endpoint url")
            ])),
            runForm.target_kind === "repo"
              ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, {
                value: runForm.repo_url,
                onChange: (event) => updateRunForm("repo_url", event.target.value),
                placeholder: "https://github.com/org/repo or git@github.com:org/repo.git"
              }))
              : runForm.target_kind === "endpoint"
                ? h(Field, { key: "endpoint", label: "Endpoint URL" }, h(Input, {
                  value: runForm.endpoint_url,
                  onChange: (event) => updateRunForm("endpoint_url", event.target.value),
                  placeholder: "https://service.example.com/v1"
                }))
                : h(Field, { key: "path", label: "Local Path" }, h(Input, {
                  value: runForm.local_path,
                  onChange: (event) => updateRunForm("local_path", event.target.value),
                  placeholder: "fixtures/validation-targets/agent-tool-boundary-risky"
                }))
          ]),
          h("div", { key: "hint", className: "text-sm text-slate-500" }, runForm.target_kind === "repo"
            ? "Use a repo URL when you want canonical repository identity for history, scoring, and outbound integrations."
            : runForm.target_kind === "endpoint"
              ? "Endpoint targets fit hosted-service validation where runtime checks matter most."
              : "Local paths are best for local clones, fixtures, and self-hosted repositories.")
        ]),
        h("div", { key: "config-block", className: "border-t border-slate-200 pt-5" }, [
          h("div", { key: "config-header" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Audit configuration")
          ]),
          h("div", { key: "fields-top", className: "mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3" }, [
            h(Field, { key: "mode", label: "Run mode" }, Select({
              value: runForm.run_mode,
              onChange: (event) => updateRunForm("run_mode", event.target.value)
            }, [
              h("option", { key: "placeholder", value: "", disabled: true }, "select run mode"),
              h("option", { key: "auto", value: "auto" }, "auto"),
              h("option", { key: "static", value: "static" }, "static"),
              h("option", { key: "runtime", value: "runtime" }, "runtime")
            ])),
            h(Field, { key: "pkg", label: "Audit package" }, Select({
              value: runForm.audit_package,
              onChange: (event) => updateRunForm("audit_package", event.target.value)
            }, [
              ...auditPackages.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} (${item.id})`)),
              !auditPackages.some((item) => item.id === runForm.audit_package)
                ? h("option", { key: runForm.audit_package || "custom-package", value: runForm.audit_package }, `${runForm.audit_package || "custom"} (custom)`)
                : null
            ].filter(Boolean))),
            h(Field, { key: "model", label: "LLM model" }, Select({
              value: activeModel?.value || "",
              onChange: (event) => {
                const selectedModel = runModelOptions.find((item) => item.value === event.target.value);
                if (!selectedModel) return;
                updateRunForm("llm_provider", selectedModel.provider_id);
                updateRunForm("llm_model", selectedModel.id);
              }
            }, [
              h("option", { key: "placeholder", value: "", disabled: true }, "select a model"),
              ...(llmRegistry.providers || []).map((provider) => h("optgroup", {
                key: provider.id,
                label: provider.name
              }, runModelOptions
                .filter((item) => item.provider_id === provider.id)
                .map((item) => h("option", { key: item.value, value: item.value }, item.label))))
            ]))
          ]),
          providerCredentialFields.length
            ? h("div", { key: "provider-credentials", className: "mt-4 grid gap-3 md:grid-cols-2" }, providerCredentialFields.map((field) => h(Field, {
              key: field.id,
              label: field.kind === "api_key" ? "API key" : field.label
            }, h("div", { className: "space-y-2" }, [
              h(Input, {
                type: field.secret ? "password" : "text",
                value: runForm[field.id] || "",
                onChange: (event) => updateRunForm(field.id, event.target.value),
                placeholder: field.placeholder || (field.env_var ? `uses ${field.env_var}` : "")
              }),
              h("div", { className: "text-xs text-slate-500" }, field.env_var ? `Maps to ${field.env_var}. Leave blank to use the persisted or server environment value.` : (field.help_text || ""))
            ]))))
            : null,
          h("div", { key: "policy-row", className: "mt-4 grid gap-3 md:grid-cols-2" }, [
            h(Field, { key: "runtime-allowed", label: "Runtime validation" }, Select({
              value: runForm.runtime_allowed,
              onChange: (event) => updateRunForm("runtime_allowed", event.target.value)
            }, [
              h("option", { key: "never", value: "never" }, "never"),
              h("option", { key: "targeted_only", value: "targeted_only" }, "targeted only"),
              h("option", { key: "allowed", value: "allowed" }, "allowed")
            ])),
            h(Field, { key: "review-severity", label: "Review threshold" }, Select({
              value: runForm.review_severity,
              onChange: (event) => updateRunForm("review_severity", event.target.value)
            }, [
              h("option", { key: "critical", value: "critical" }, "critical"),
              h("option", { key: "high", value: "high" }, "high"),
              h("option", { key: "medium", value: "medium" }, "medium"),
              h("option", { key: "low", value: "low" }, "low")
            ]))
          ])
        ])
      ])
    ]),
    h("div", { key: "actions", className: "sticky bottom-0 z-10 -mx-1 border-t border-slate-200 bg-white/95 px-1 pt-4 backdrop-blur" }, [
      h("div", { key: "buttons", className: "flex flex-wrap gap-3" }, [
      h(Button, { key: "preflight", variant: "outline", onClick: runPreflight, disabled: !requiredFieldsReady }, preflightLoading ? "Running Preflight..." : "Run Preflight"),
      h(Button, {
        key: "launch",
        disabled: !requiredFieldsReady || !launchReadiness.canLaunch,
        onClick: launchRun
      }, !requiredFieldsReady ? "Complete Required Fields" : preflightSummary && !launchReadiness.accepted ? "Accept Preflight First" : "Start Run")
      ]),
      h("div", { key: "times", className: "mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" }, [
      h("div", { key: "checked" }, `Checked: ${formatDate(preflightCheckedAt)}`),
      preflightSummary ? h("div", { key: "accepted" }, `Accepted: ${formatDate(preflightAcceptedAt)}`) : null
      ].filter(Boolean))
    ]),
    launchReadiness.issues.length
      ? h("div", { key: "issues", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" }, [
        h("div", { key: "title", className: "font-medium" }, "Input issues"),
        h("ul", { key: "list", className: "mt-2 space-y-1" }, launchReadiness.issues.map((item, index) => h("li", { key: index }, `- ${item}`)))
      ])
      : null,
    preflightSummary
      ? h("section", {
        key: "preflight-results",
        className: cn(
          "rounded-[28px] border px-5 py-4",
          preflightSummary.readiness.status === "blocked" ? "border-red-200 bg-red-50/60" : (preflightSummary.readiness.status === "ready_with_warnings" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60")
        )
      }, [
        h("div", { key: "header" }, [
          h("div", { key: "title", className: "font-semibold text-slate-950" }, "Preflight Results"),
          h("div", { key: "summary", className: "mt-1 text-sm text-slate-500" }, `${preflightStatus}. ${preflightSummary.readiness.blockers?.length || 0} blockers, ${preflightSummary.readiness.warnings?.length || 0} warnings.`)
        ]),
        h("div", { key: "flags", className: "mb-4 flex flex-wrap gap-2" }, [
          preflightStale ? h(Badge, { key: "stale" }, "stale") : null,
          launchReadiness.accepted ? h(Badge, { key: "accepted" }, "accepted") : null
        ].filter(Boolean)),
        h("div", { key: "top", className: "grid gap-4 md:grid-cols-3" }, [
          h(LaunchStatusCard, {
            key: "class",
            label: "Target class",
            value: `${preflightSummary.target.target_class} (${Math.round((preflightSummary.target.confidence || 0) * 100)}%)`
          }),
          h(LaunchStatusCard, {
            key: "package",
            label: "Recommended package",
            value: preflightSummary.recommended_audit_package.id
          }),
          h(LaunchStatusCard, {
            key: "policy",
            label: "Policy pack",
            value: preflightSummary.selected_policy_pack.id || "default"
          })
        ]),
        preflightSummary.launch_profile
          ? h("div", { key: "profile", className: "mt-4 rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-500" }, [
            h("div", { key: "title", className: "font-medium text-slate-900" }, "Recommended launch profile"),
            h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-3" }, [
              h("div", { key: "pkg" }, `package: ${preflightSummary.launch_profile.audit_package || "default"}`),
              h("div", { key: "mode" }, `run mode: ${preflightSummary.launch_profile.run_mode || "default"}`),
              h("div", { key: "provider" }, `provider/model: ${(preflightSummary.launch_profile.llm_provider || "default")}${preflightSummary.launch_profile.llm_model ? `/${preflightSummary.launch_profile.llm_model}` : ""}`)
            ])
          ])
          : null,
        preflightSummary.readiness.blockers?.length
          ? h("div", { key: "blockers", className: "mt-4" }, [
            h("div", { key: "label", className: "font-medium text-red-700" }, "Blockers"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-red-700" }, preflightSummary.readiness.blockers.map((item, index) => h("li", { key: index }, `- ${item}`)))
          ])
          : null,
        preflightSummary.readiness.warnings?.length
          ? h("div", { key: "warnings", className: "mt-4" }, [
            h("div", { key: "label", className: "font-medium text-amber-700" }, "Warnings"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-800" }, preflightSummary.readiness.warnings.map((item, index) => h("li", { key: index }, `- ${item}`)))
          ])
          : null
      ])
      : null
  ]));
}

function DetailList({ items }) {
  function renderDetailValue(value) {
    if (isValidElement(value)) return value;
    if (value == null || value === "") return "n/a";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      return value.length ? value.map((item) => {
        if (item == null) return "";
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      }).filter(Boolean).join(", ") : "n/a";
    }
    try {
      return h("pre", { className: "overflow-x-auto whitespace-pre-wrap text-xs text-muted" }, JSON.stringify(value, null, 2));
    } catch {
      return String(value);
    }
  }
  return h("dl", { className: "grid gap-3 md:grid-cols-2" }, items.map((item) => h("div", {
    key: item.label,
    className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
  }, [
    h("dt", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, item.label),
    h("dd", { key: "value", className: "mt-2 text-sm font-medium text-foreground" }, renderDetailValue(item.value))
  ])));
}

function ReviewQueueList({ runs, selectedRunId, onSelect, actorId }) {
  return runs.length
    ? h("div", { className: "space-y-3" }, runs.map((run) => {
      const assignedToMe = (run.review_workflow?.current_reviewer_id || "") === (actorId || "");
      const dispositionCounts = run.review_summary_counts || {};
      const needsDispositionReview = Number(dispositionCounts.findings_needing_disposition_review_count || 0) > 0;
      const dueSoonDispositionCount = Number(dispositionCounts.due_soon_disposition_count || 0);
      return h("div", {
        key: run.id,
        className: cn("rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm", "cursor-pointer hover:bg-slate-50", selectedRunId === run.id && "border-slate-300 bg-slate-50"),
        onClick: () => onSelect?.(run.id)
      }, [
        h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium text-slate-900" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
            h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${run.id} • reviewer ${run.review_workflow?.current_reviewer_id || "unassigned"}`)
          ]),
          h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
            h(Badge, { key: "status" }, run.review_workflow?.status || "none"),
            isOverdueReview(run) ? h(Badge, { key: "overdue" }, "overdue") : null,
            assignedToMe ? h(Badge, { key: "mine" }, "mine") : null,
            dueSoonDispositionCount > 0 ? h(Badge, { key: "disposition-due-soon" }, `due soon ${dueSoonDispositionCount}`) : null,
            needsDispositionReview ? h(Badge, { key: "disposition-review" }, `disposition re-review ${dispositionCounts.findings_needing_disposition_review_count}`) : null
          ].filter(Boolean))
        ]),
        h("div", { key: "details", className: "mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-500" }, [
          h("div", { key: "opened" }, `Opened ${formatDate(run.review_workflow?.opened_at || run.created_at)}`),
          h("div", { key: "age" }, `Queue age ${reviewAgeLabel(run)}`),
          h("div", { key: "last" }, `Last action ${run.review_workflow?.last_action_type || "none"}`)
        ]),
        needsDispositionReview ? h("div", { key: "disposition-meta", className: "mt-3 grid gap-3 md:grid-cols-3 text-sm text-amber-900" }, [
          h("div", { key: "need" }, `Needs review ${dispositionCounts.findings_needing_disposition_review_count}`),
          h("div", { key: "expired" }, `Expired ${dispositionCounts.expired_disposition_count || 0}`),
          h("div", { key: "reopened" }, `Reopened ${dispositionCounts.reopened_disposition_count || 0}`)
        ]) : null,
        dueSoonDispositionCount > 0 ? h("div", { key: "due-soon-meta", className: "mt-3 grid gap-3 md:grid-cols-2 text-sm text-amber-900" }, [
          h("div", { key: "count" }, `Due soon ${dueSoonDispositionCount}`),
          h("div", { key: "next" }, `Next review due ${nextDispositionReviewDueAt(run) ? formatDate(nextDispositionReviewDueAt(run)) : "n/a"}`)
        ]) : null
      ]);
    }))
    : h("div", { className: "text-sm text-muted" }, "No runs match the current review filter.");
}

function ReviewActionTimeline({ actions }) {
  return actions?.length
    ? h("div", { className: "space-y-3" }, actions.map((action) => h("div", {
      key: action.id,
      className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
    }, [
      h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
        h("div", { key: "title", className: "font-medium" }, action.action_type.replace(/_/g, " ")),
        h(Badge, { key: "badge" }, action.action_type)
      ]),
      h("div", { key: "meta", className: "mt-2 text-sm text-muted" }, `${action.reviewer_id}${action.assigned_reviewer_id ? ` -> ${action.assigned_reviewer_id}` : ""} - ${formatDate(action.created_at)}`),
      action.finding_id ? h("div", { key: "finding", className: "mt-1 text-sm text-muted" }, `Finding: ${action.finding_id}`) : null,
      action.updated_severity ? h("div", { key: "severity", className: "mt-1 text-sm text-muted" }, `Updated severity: ${action.updated_severity}`) : null,
      action.visibility_override ? h("div", { key: "visibility", className: "mt-1 text-sm text-muted" }, `Visibility override: ${action.visibility_override}`) : null,
      action.notes ? h("div", { key: "notes", className: "mt-2 text-sm" }, action.notes) : null
    ])))
    : h("div", { className: "text-sm text-muted" }, "No persisted review actions yet.");
}

function RuntimeFollowupWorkspace({
  followups,
  filter,
  onFilterChange,
  selectedFollowupId,
  onSelectFollowup,
  selectedFollowupIds,
  onToggleFollowupSelection,
  onSelectAllFiltered,
  onClearFollowupSelection,
  sourceRunDetail,
  rerunRunDetail,
  rerunLoading,
  onOpenSourceRun,
  onLaunchRuntimeFollowup,
  onAdoptRerunOutcome,
  onExportQueue,
  onExportFollowupReport,
  onBulkAdoptConfirmed,
  onBulkManualReview,
  onBulkAcceptWithoutRuntimeValidation
}) {
  const sortedFollowups = [...(followups || [])].sort((left, right) => {
    const priorityDiff = runtimeFollowupPriority(left) - runtimeFollowupPriority(right);
    if (priorityDiff !== 0) return priorityDiff;
    return String(right.requested_at || "").localeCompare(String(left.requested_at || ""));
  });
  const filteredFollowups = sortedFollowups.filter((followup) => {
    if (filter === "all") return true;
    if (filter === "pending") return followup.status === "pending";
    if (filter === "launched") return followup.status === "launched";
    if (filter === "adoption_ready") return isRuntimeFollowupAdoptionReady(followup);
    if (filter === "confirmed") return followup.rerun_outcome === "confirmed";
    if (filter === "not_reproduced") return followup.rerun_outcome === "not_reproduced";
    if (filter === "still_inconclusive") return followup.rerun_outcome === "still_inconclusive";
    if (filter === "resolved") return followup.status === "resolved";
    return followup.status !== "resolved";
  });
  const selectedFollowup = filteredFollowups.find((item) => item.id === selectedFollowupId)
    || sortedFollowups.find((item) => item.id === selectedFollowupId)
    || filteredFollowups[0]
    || sortedFollowups[0]
    || null;
  const sourceFindings = sourceRunDetail?.findings?.findings || [];
  const sourceEvaluations = sourceRunDetail?.findingEvaluations?.finding_evaluations?.evaluations || [];
  const rerunFindings = rerunRunDetail?.findings?.findings || [];
  const rerunEvaluations = rerunRunDetail?.findingEvaluations?.finding_evaluations?.evaluations || [];
  const sourceFinding = selectedFollowup ? sourceFindings.find((item) => item.id === selectedFollowup.finding_id) || null : null;
  const sourceEvaluation = selectedFollowup ? sourceEvaluations.find((item) => item.finding_id === selectedFollowup.finding_id) || null : null;
  const rerunFinding = selectedFollowup
    ? rerunFindings.find((item) => (selectedFollowup.rerun_finding_ids_json || []).includes(item.id))
      || rerunFindings.find((item) => item.category === sourceFinding?.category)
      || null
    : null;
  const rerunEvaluation = rerunFinding ? rerunEvaluations.find((item) => item.finding_id === rerunFinding.id) || null : null;
  const comparisonRows = runtimeFollowupComparisonRows(sourceFinding, sourceEvaluation, rerunFinding, rerunEvaluation, selectedFollowup);
  const changedComparisonRows = comparisonRows.filter((item) => item.changed);
  const recommendation = runtimeFollowupRecommendation(selectedFollowup);
  const queueStats = {
    active: sortedFollowups.filter((item) => item.status !== "resolved").length,
    pending: sortedFollowups.filter((item) => item.status === "pending").length,
    launched: sortedFollowups.filter((item) => item.status === "launched").length,
    adoptionReady: sortedFollowups.filter((item) => isRuntimeFollowupAdoptionReady(item)).length,
    confirmed: sortedFollowups.filter((item) => item.rerun_outcome === "confirmed").length,
    notReproduced: sortedFollowups.filter((item) => item.rerun_outcome === "not_reproduced").length,
    inconclusive: sortedFollowups.filter((item) => item.rerun_outcome === "still_inconclusive").length,
    resolved: sortedFollowups.filter((item) => item.status === "resolved").length
  };
  const selectedBulkFollowups = filteredFollowups.filter((item) => (selectedFollowupIds || []).includes(item.id));
  const bulkConfirmedCount = selectedBulkFollowups.filter((item) => isRuntimeFollowupAdoptionReady(item) && item.rerun_outcome === "confirmed").length;
  const bulkManualReviewCount = selectedBulkFollowups.filter((item) => item.rerun_outcome === "still_inconclusive").length;
  const bulkAcceptCount = selectedBulkFollowups.filter((item) => item.rerun_outcome === "not_reproduced").length;
  const followupHistoryActions = (sourceRunDetail?.reviewActions?.review_actions || []).filter((action) => action.finding_id === selectedFollowup?.finding_id);

  return h("div", { className: "grid gap-6 xl:grid-cols-[0.88fr_1.12fr]" }, [
    h("div", { key: "queue", className: "space-y-6" }, [
      h(Card, { key: "controls", title: "Runtime Follow-up Queue", description: "Linked rerun work items for runtime-sensitive findings, separated from the generic review queue." }, [
        h(Field, { key: "filter", label: "Queue Filter" }, h(Select, {
          value: filter,
          onChange: (event) => onFilterChange?.(event.target.value)
        }, [
          h("option", { key: "open", value: "open" }, "open follow-ups"),
          h("option", { key: "pending", value: "pending launch" }, "pending launch"),
          h("option", { key: "launched", value: "launched reruns" }, "launched reruns"),
          h("option", { key: "adoption-ready", value: "adoption_ready" }, "completed reruns awaiting adoption"),
          h("option", { key: "confirmed", value: "confirmed" }, "confirmed by rerun"),
          h("option", { key: "not-reproduced", value: "not_reproduced" }, "not reproduced"),
          h("option", { key: "inconclusive", value: "still_inconclusive" }, "still inconclusive"),
          h("option", { key: "resolved", value: "resolved" }, "resolved"),
          h("option", { key: "all", value: "all" }, "all")
        ])),
        h("div", { key: "stats", className: "mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7" }, [
          h("div", { key: "active", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Active ${queueStats.active}`),
          h("div", { key: "pending", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Pending ${queueStats.pending}`),
          h("div", { key: "launched", className: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" }, `Launched ${queueStats.launched}`),
          h("div", { key: "ready", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" }, `Adopt ${queueStats.adoptionReady}`),
          h("div", { key: "confirmed", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" }, `Confirmed ${queueStats.confirmed}`),
          h("div", { key: "not-reproduced", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Not reproduced ${queueStats.notReproduced}`),
          h("div", { key: "inconclusive", className: "rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900" }, `Inconclusive ${queueStats.inconclusive}`),
          h("div", { key: "resolved", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Resolved ${queueStats.resolved}`)
        ]),
        h("div", { key: "bulk-controls", className: "mt-4 rounded-2xl border border-border bg-white/70 px-4 py-4" }, [
          h("div", { key: "bulk-head", className: "flex flex-wrap items-center justify-between gap-3" }, [
            h("div", { key: "copy", className: "text-sm text-muted" }, `${selectedBulkFollowups.length} selected in current filter`),
            h("div", { key: "selection-actions", className: "flex flex-wrap gap-3" }, [
              h(Button, { key: "export-json", variant: "outline", onClick: () => onExportQueue?.("json") }, "Export JSON"),
              h(Button, { key: "export-csv", variant: "outline", onClick: () => onExportQueue?.("csv") }, "Export CSV"),
              h(Button, { key: "select-all", variant: "outline", onClick: () => onSelectAllFiltered?.(filteredFollowups) }, "Select Filtered"),
              h(Button, { key: "clear", variant: "outline", onClick: () => onClearFollowupSelection?.() }, "Clear Selection")
            ])
          ]),
          h("div", { key: "bulk-buttons", className: "mt-4 flex flex-wrap gap-3" }, [
            h(Button, {
              key: "bulk-adopt",
              variant: "secondary",
              disabled: bulkConfirmedCount === 0,
              onClick: () => onBulkAdoptConfirmed?.(selectedBulkFollowups)
            }, `Bulk Adopt Confirmed (${bulkConfirmedCount})`),
            h(Button, {
              key: "bulk-manual",
              variant: "outline",
              disabled: bulkManualReviewCount === 0,
              onClick: () => onBulkManualReview?.(selectedBulkFollowups)
            }, `Bulk Manual Review (${bulkManualReviewCount})`),
            h(Button, {
              key: "bulk-accept",
              variant: "outline",
              disabled: bulkAcceptCount === 0,
              onClick: () => onBulkAcceptWithoutRuntimeValidation?.(selectedBulkFollowups)
            }, `Bulk Accept Without Runtime Validation (${bulkAcceptCount})`)
          ])
        ]),
        filteredFollowups.length
          ? h("div", { key: "list", className: "mt-5 space-y-3" }, filteredFollowups.map((followup) => h("div", {
            key: followup.id,
            onClick: () => onSelectFollowup?.(followup.id),
            className: cn(
              "cursor-pointer rounded-2xl border px-4 py-4 text-left transition-colors",
              selectedFollowup?.id === followup.id ? "border-primary bg-primary/10" : "border-border bg-white/70 hover:bg-stone-50"
            )
          }, [
            h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
              h("div", { key: "copy-wrap", className: "flex items-start gap-3" }, [
                h("input", {
                  key: "select",
                  type: "checkbox",
                  checked: (selectedFollowupIds || []).includes(followup.id),
                  onClick: (event) => event.stopPropagation(),
                  onChange: () => onToggleFollowupSelection?.(followup.id)
                }),
                h("div", { key: "copy" }, [
                  h("div", { key: "title", className: "font-medium" }, followup.finding_title || followup.finding_id),
                  h("div", { key: "meta", className: "mt-1 text-sm text-muted" }, `${followup.run_id} • ${followup.followup_policy} • ${formatDate(followup.requested_at)}`)
                ])
              ]),
              h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
                h(Badge, { key: "status" }, followup.status),
                isRuntimeFollowupAdoptionReady(followup) ? h(Badge, { key: "adopt" }, "adopt") : null
              ].filter(Boolean))
            ]),
            h("div", { key: "details", className: "mt-3 grid gap-2 md:grid-cols-2 text-sm text-muted" }, [
              h("div", { key: "run" }, `linked rerun ${followup.linked_run_id || "none"}`),
              h("div", { key: "outcome" }, `outcome ${followup.rerun_outcome || "pending"}`),
              h("div", { key: "resolution" }, `resolution ${followup.resolution_action_type || "none"}`),
              h("div", { key: "job" }, `job ${followup.linked_job_id || "none"}`)
            ])
          ])))
          : h("div", { key: "empty", className: "mt-5 text-sm text-muted" }, "No runtime follow-ups match the current filter.")
      ])
    ]),
    h("div", { key: "detail", className: "space-y-6" }, selectedFollowup
      ? [
        h(Card, { key: "followup-detail", title: "Runtime Follow-up Detail", description: "Compare the original finding with its linked rerun and resolve the next decision from one place." }, [
          h(DetailList, {
            key: "followup-summary",
            items: [
              { label: "Follow-up Id", value: selectedFollowup.id },
              { label: "Source Run", value: selectedFollowup.run_id },
              { label: "Source Finding", value: selectedFollowup.finding_id },
              { label: "Status", value: selectedFollowup.status },
              { label: "Policy", value: selectedFollowup.followup_policy },
              { label: "Requested By", value: selectedFollowup.requested_by },
              { label: "Linked Job", value: selectedFollowup.linked_job_id || "none" },
              { label: "Linked Rerun", value: selectedFollowup.linked_run_id || "none" },
              { label: "Rerun Outcome", value: selectedFollowup.rerun_outcome || "pending" },
              { label: "Resolution", value: selectedFollowup.resolution_action_type || "none" }
            ]
          }),
          selectedFollowup.rerun_outcome_summary
            ? h("div", { key: "outcome-summary", className: "mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, selectedFollowup.rerun_outcome_summary)
            : null,
          recommendation
            ? h("div", {
              key: "recommendation",
              className: cn(
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                recommendation.tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-950",
                recommendation.tone === "amber" && "border-amber-200 bg-amber-50 text-amber-950",
                recommendation.tone === "sky" && "border-sky-200 bg-sky-50 text-sky-950",
                recommendation.tone === "indigo" && "border-indigo-200 bg-indigo-50 text-indigo-950"
              )
            }, [
              h("div", { key: "title", className: "font-medium" }, recommendation.title),
              h("div", { key: "body", className: "mt-1" }, recommendation.body)
            ])
            : null,
          h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
            h(Button, { key: "open-source", variant: "outline", onClick: () => onOpenSourceRun?.(selectedFollowup) }, "Open Source Run"),
            h(Button, { key: "export-followup", variant: "outline", onClick: () => onExportFollowupReport?.(selectedFollowup.id) }, "Export Follow-up Bundle"),
            selectedFollowup.rerun_request_json && (selectedFollowup.status === "pending" || selectedFollowup.status === "completed")
              ? h(Button, { key: "launch", onClick: () => onLaunchRuntimeFollowup?.(selectedFollowup.id) }, "Launch Linked Rerun")
              : null,
            isRuntimeFollowupAdoptionReady(selectedFollowup) && sourceFinding
              ? h(Button, { key: "adopt", variant: "secondary", onClick: () => onAdoptRerunOutcome?.(sourceFinding) }, "Adopt Rerun Outcome")
              : null
          ].filter(Boolean))
        ]),
        h(Card, { key: "comparison", title: "Source Vs Linked Rerun", description: "Side-by-side comparison of the original runtime-sensitive finding and the linked rerun evidence." }, [
          h("div", { key: "delta-summary", className: "mb-4 grid gap-3 md:grid-cols-3" }, [
            h("div", { key: "changed", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Changed fields ${changedComparisonRows.length}`),
            h("div", { key: "matched", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Matched fields ${comparisonRows.length - changedComparisonRows.length}`),
            h("div", { key: "outcome", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" }, `Rerun outcome ${selectedFollowup.rerun_outcome || "pending"}`)
          ]),
          h("div", { key: "grid", className: "grid gap-4 xl:grid-cols-2" }, [
            h("div", { key: "source", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" }, [
              h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-400" }, "Source Finding"),
              sourceFinding
                ? [
                  h("div", { key: "name", className: "mt-3 font-medium text-slate-900" }, sourceFinding.title),
                  h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${sourceFinding.id} | ${sourceFinding.category} | ${sourceFinding.severity}`),
                  sourceEvaluation
                    ? h(DetailList, {
                      key: "source-eval",
                      items: [
                        { label: "Runtime Validation", value: sourceEvaluation.runtime_validation_status },
                        { label: "Follow-up Policy", value: sourceEvaluation.runtime_followup_policy },
                        { label: "Follow-up Resolution", value: sourceEvaluation.runtime_followup_resolution },
                        { label: "Next Action", value: sourceEvaluation.next_action }
                      ]
                    })
                    : null
                ]
                : h("div", { key: "empty", className: "mt-3 text-sm text-muted" }, "The source run is not currently loaded. Open the source run to inspect the original finding.")
            ]),
            h("div", { key: "rerun", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" }, [
              h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-400" }, "Linked Rerun"),
              rerunLoading
                ? h("div", { key: "loading", className: "mt-3 text-sm text-muted" }, "Loading linked rerun detail...")
                : rerunRunDetail?.summary?.summary
                  ? [
                    h("div", { key: "status", className: "mt-3 flex flex-wrap gap-2" }, [
                      h(Badge, { key: "run-status" }, rerunRunDetail.summary.summary.status || "unknown"),
                      h(Badge, { key: "review-status" }, rerunRunDetail.summary.summary.review_workflow_status || "none")
                    ]),
                    h("div", { key: "meta", className: "mt-2 text-sm text-slate-500" }, `${selectedFollowup.linked_run_id} | ${formatDate(rerunRunDetail.summary.summary.created_at)}`),
                    rerunFinding
                      ? [
                        h("div", { key: "finding-title", className: "mt-3 font-medium text-slate-900" }, rerunFinding.title),
                        h("div", { key: "finding-meta", className: "mt-1 text-sm text-slate-500" }, `${rerunFinding.id} | ${rerunFinding.category} | ${rerunFinding.severity}`),
                        rerunEvaluation
                          ? h(DetailList, {
                            key: "rerun-eval",
                            items: [
                              { label: "Runtime Impact", value: rerunEvaluation.runtime_impact || "none" },
                              { label: "Runtime Validation", value: rerunEvaluation.runtime_validation_status },
                              { label: "Follow-up Policy", value: rerunEvaluation.runtime_followup_policy },
                              { label: "Next Action", value: rerunEvaluation.next_action }
                            ]
                          })
                          : null
                      ]
                      : h("div", { key: "no-finding", className: "mt-3 text-sm text-muted" }, "No matching rerun finding was derived from the linked rerun yet.")
                  ]
                  : h("div", { key: "empty", className: "mt-3 text-sm text-muted" }, selectedFollowup.linked_run_id ? "No linked rerun detail is available yet." : "No rerun has been linked yet.")
            ])
          ]),
          h("div", { key: "diff-table", className: "mt-4 overflow-x-auto rounded-2xl border border-border" }, h("table", { className: "w-full text-sm" }, [
            h("thead", { key: "head" }, h("tr", { className: "border-b border-border bg-stone-100/70 text-left text-xs uppercase tracking-[0.18em] text-muted" }, [
              h("th", { key: "field", className: "px-4 py-3" }, "Field"),
              h("th", { key: "source", className: "px-4 py-3" }, "Source"),
              h("th", { key: "rerun", className: "px-4 py-3" }, "Linked Rerun"),
              h("th", { key: "delta", className: "px-4 py-3" }, "Delta")
            ])),
            h("tbody", { key: "body" }, comparisonRows.map((row) => h("tr", {
              key: row.label,
              className: cn("border-b border-border/80", row.changed ? "bg-indigo-50/60" : "bg-white/70")
            }, [
              h("td", { key: "label", className: "px-4 py-3 font-medium" }, row.label),
              h("td", { key: "source", className: "px-4 py-3 text-muted" }, row.source),
              h("td", { key: "rerun", className: "px-4 py-3 text-muted" }, row.rerun),
              h("td", { key: "delta", className: "px-4 py-3" }, row.changed ? h(Badge, null, "changed") : h(Badge, null, "same"))
            ])))
          ])),
          changedComparisonRows.length
            ? h("div", { key: "changed-list", className: "mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, [
              h("div", { key: "title", className: "font-medium" }, "Changed In The Linked Rerun"),
              h("ul", { key: "list", className: "mt-2 space-y-1" }, changedComparisonRows.map((row) => h("li", { key: row.label }, `${row.label}: ${row.source} -> ${row.rerun}`)))
            ])
            : h("div", { key: "no-diff", className: "mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, "No material source-vs-rerun differences were derived from the current follow-up linkage.")
        ]),
        h(Card, { key: "history", title: "Follow-up Audit Trail", description: "Runtime follow-up lifecycle plus related review actions for the source finding." }, [
          h("div", { key: "status-list", className: "space-y-3" }, [
            h("div", { key: "requested", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Requested ${formatDate(selectedFollowup.requested_at)} by ${selectedFollowup.requested_by || "unknown"}`),
            selectedFollowup.linked_job_id
              ? h("div", { key: "launched", className: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" }, `Linked rerun job ${selectedFollowup.linked_job_id} ${selectedFollowup.launched_at ? `launched ${formatDate(selectedFollowup.launched_at)}` : "created"}`)
              : null,
            selectedFollowup.linked_run_id
              ? h("div", { key: "linked-run", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Linked rerun run ${selectedFollowup.linked_run_id}`)
              : null,
            selectedFollowup.completed_at
              ? h("div", { key: "completed", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950" }, `Rerun reconciliation completed ${formatDate(selectedFollowup.completed_at)} with outcome ${selectedFollowup.rerun_outcome || "unknown"}`)
              : null,
            selectedFollowup.resolved_at
              ? h("div", { key: "resolved", className: "rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950" }, `Reviewer resolved follow-up ${formatDate(selectedFollowup.resolved_at)} via ${selectedFollowup.resolution_action_type || "unknown"}`)
              : null
          ].filter(Boolean)),
          followupHistoryActions.length
            ? h("div", { key: "actions", className: "mt-4 space-y-3" }, followupHistoryActions.map((action) => h("div", {
              key: action.id,
              className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
            }, [
              h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                h("div", { key: "type", className: "font-medium" }, action.action_type.replace(/_/g, " ")),
                h("div", { key: "when", className: "text-sm text-muted" }, formatDate(action.created_at))
              ]),
              h("div", { key: "reviewer", className: "mt-1 text-sm text-muted" }, `reviewer ${action.reviewer_id || "unknown"}`),
              action.notes ? h("div", { key: "notes", className: "mt-2 text-sm" }, action.notes) : null
            ])))
            : h("div", { key: "no-actions", className: "mt-4 text-sm text-muted" }, "No related review actions were recorded for this finding yet.")
        ])
      ]
      : h(Card, { key: "empty-detail", title: "Runtime Follow-up Detail", description: "Select a follow-up to compare the source finding and linked rerun." }, h("div", { className: "text-sm text-muted" }, "No runtime follow-up is selected."))
    )
  ]);
}

function ReviewNotesTimeline({ actions }) {
  const noted = (actions || []).filter((action) => action.notes);
  return noted.length
    ? h("div", { className: "space-y-3" }, noted.map((action) => h("div", {
      key: `${action.id}:note`,
      className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
    }, [
      h("div", { key: "meta", className: "flex items-center justify-between gap-3" }, [
        h("div", { key: "who", className: "font-medium" }, action.reviewer_id),
        h("div", { key: "when", className: "text-sm text-muted" }, formatDate(action.created_at))
      ]),
      h("div", { key: "type", className: "mt-1 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, action.action_type.replace(/_/g, " ")),
      action.finding_id ? h("div", { key: "finding", className: "mt-1 text-sm text-muted" }, `Finding ${action.finding_id}`) : null,
      h("div", { key: "note", className: "mt-2 text-sm" }, action.notes)
    ])))
    : h("div", { className: "text-sm text-muted" }, "No reviewer notes yet.");
}

function ReviewCommentsPanel({ comments, commentBody, commentFindingId, findings, onCommentBodyChange, onCommentFindingChange, onSubmitComment }) {
  return h("div", { className: "space-y-4" }, [
    h("div", { key: "composer", className: "grid gap-4 md:grid-cols-[0.4fr_1fr_auto]" }, [
      h(Field, { key: "finding", label: "Comment Scope" }, h(Select, {
        value: commentFindingId || "",
        onChange: (event) => onCommentFindingChange?.(event.target.value)
      }, [
        h("option", { key: "run", value: "" }, "run-level"),
        ...(findings || []).map((finding) => h("option", { key: finding.id, value: finding.id }, finding.title || finding.id))
      ])),
      h(Field, { key: "body", label: "Comment" }, h(Input, {
        value: commentBody || "",
        onChange: (event) => onCommentBodyChange?.(event.target.value),
        placeholder: "add reviewer discussion or handoff context"
      })),
      h("div", { key: "submit-wrap", className: "flex items-end" }, h(Button, {
        onClick: onSubmitComment,
        disabled: !commentBody?.trim()
      }, "Post Comment"))
    ]),
    comments?.length
      ? h("div", { key: "list", className: "space-y-3" }, comments.map((comment) => h("div", {
        key: comment.id,
        className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
          h("div", { key: "author", className: "font-medium" }, comment.author_id),
          h("div", { key: "when", className: "text-sm text-muted" }, formatDate(comment.created_at))
        ]),
        comment.finding_id ? h("div", { key: "scope", className: "mt-1 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, `Finding ${comment.finding_id}`) : null,
        h("div", { key: "body", className: "mt-2 text-sm" }, comment.body)
      ])))
      : h("div", { key: "empty", className: "text-sm text-muted" }, "No discussion comments yet.")
  ]);
}

function ComparisonSummaryText(comparison) {
  const summary = comparison?.summary || {};
  return `Changed ${summary.changed_finding_count || 0} | New ${summary.new_finding_count || 0} | Resolved ${summary.resolved_finding_count || 0} | Symbol matches ${summary.evidence_symbol_matched_count || 0}`;
}

function deriveComparisonDetailDiffs(currentFinding, currentEvaluation, previousFinding, previousEvaluation) {
  if (!currentFinding || !previousFinding) return [];
  const rows = [
    ["Title", previousFinding.title || "n/a", currentFinding.title || "n/a"],
    ["Category", previousFinding.category || "n/a", currentFinding.category || "n/a"],
    ["Severity", previousEvaluation?.current_severity || previousFinding.severity || "n/a", currentEvaluation?.current_severity || currentFinding.severity || "n/a"],
    ["Confidence", String(previousFinding.confidence ?? "n/a"), String(currentFinding.confidence ?? "n/a")],
    ["Runtime Validation", previousEvaluation?.runtime_validation_status || "not_applicable", currentEvaluation?.runtime_validation_status || "not_applicable"],
    ["Next Action", previousEvaluation?.next_action || "ready_for_review", currentEvaluation?.next_action || "ready_for_review"],
    ["Evidence Symbols", previousEvaluation?.evidence_symbols?.join(", ") || "none", currentEvaluation?.evidence_symbols?.join(", ") || "none"]
  ];
  return rows
    .filter(([, previousValue, currentValue]) => String(previousValue) !== String(currentValue))
    .map(([label, previousValue, currentValue]) => ({ label, previous: previousValue, current: currentValue }));
}

function RunDetailPanel({
  detail,
  loading,
  comparison,
  comparisonLoading,
  effectiveSettings,
  selectedFindingId,
  reviewAssignee,
  findingReviewState,
  onSelectFinding,
  onReviewAssigneeChange,
  onAssignReviewer,
  onRunReviewAction,
  onFindingReviewStateChange,
  onFindingReviewAction,
  onFindingDispositionAction,
  onEditFindingDisposition,
  onSaveFindingDispositionEdit,
  onRevokeFindingDisposition,
  reviewComments,
  commentBody,
  commentFindingId,
  onCommentBodyChange,
  onCommentFindingChange,
  onSubmitComment,
  onExportReviewAudit,
  onExportExecutiveReport,
  onExportMarkdownReport,
  onExportSarifReport,
  onDownloadIndexedRunExport,
  compareRunId,
  onCompareRunIdChange,
  onExportComparisonReport,
  onApproveOutbound,
  onPrepareOutboundSend,
  onVerifyOutbound,
  onExecuteOutboundDelivery,
  onLaunchRuntimeFollowup,
  comparisonDetail,
  comparisonDetailLoading,
  selectedComparisonFindingId,
  onSelectComparisonFinding,
  onSelectComparisonPair,
  outboundActionType,
  outboundTargetNumber,
  onOutboundActionTypeChange,
  onOutboundTargetNumberChange
}) {
  if (!window.TethermarkFeatures?.RunDetailPanel) {
    return h(Card, { title: "Run Detail", description: "Run detail module is unavailable.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "The extracted Run detail module failed to load."));
  }
  return h(window.TethermarkFeatures.RunDetailPanel, {
    detail,
    loading,
    comparison,
    comparisonLoading,
    effectiveSettings,
    selectedFindingId,
    reviewAssignee,
    findingReviewState,
    onSelectFinding,
    onReviewAssigneeChange,
    onAssignReviewer,
    onRunReviewAction,
    onFindingReviewStateChange,
    onFindingReviewAction,
    onFindingDispositionAction,
    onEditFindingDisposition,
    onSaveFindingDispositionEdit,
    onRevokeFindingDisposition,
    reviewComments,
    commentBody,
    commentFindingId,
    onCommentBodyChange,
    onCommentFindingChange,
    onSubmitComment,
    onExportReviewAudit,
    onExportExecutiveReport,
    onExportMarkdownReport,
    onExportSarifReport,
    onDownloadIndexedRunExport,
    compareRunId,
    onCompareRunIdChange,
    onExportComparisonReport,
    onApproveOutbound,
    onPrepareOutboundSend,
    onVerifyOutbound,
    onExecuteOutboundDelivery,
    onLaunchRuntimeFollowup,
    comparisonDetail,
    comparisonDetailLoading,
    selectedComparisonFindingId,
    onSelectComparisonFinding,
    onSelectComparisonPair,
    outboundActionType,
    outboundTargetNumber,
    onOutboundActionTypeChange,
    onOutboundTargetNumberChange,
    helpers: {
      Button,
      Card,
      Badge,
      Field,
      Input,
      Select,
      Textarea,
      DetailList,
      ReviewNotesTimeline,
      ReviewCommentsPanel,
      ReviewActionTimeline,
      RuntimeFollowupWorkspace,
      ComparisonSummaryText,
      deriveComparisonDetailDiffs,
      formatDate,
      formatDateInputValue,
      formatEvidenceLocation,
      getEvidenceLocations,
      getEvidenceMetadata,
      getReviewCadenceDefaults,
      runtimeArtifactDetailItems,
      runtimeFollowupCount,
      cn
    }
  });
}

function App() {
  const [view, setView] = useState("dashboard");
  const [runs, setRuns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [runtimeFollowups, setRuntimeFollowups] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [effectiveSettings, setEffectiveSettings] = useState(emptyEffectiveSettings);
  const [providerCredentialDrafts, setProviderCredentialDrafts] = useState({});
  const [integrationCredentialDrafts, setIntegrationCredentialDrafts] = useState({});
  const [documents, setDocuments] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [workspaceRoleBindings, setWorkspaceRoleBindings] = useState([]);
  const [effectiveRoles, setEffectiveRoles] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [auditPackages, setAuditPackages] = useState([]);
  const [policyPacks, setPolicyPacks] = useState([]);
  const [llmRegistry, setLlmRegistry] = useState(emptyLlmRegistry);
  const [integrationRegistry, setIntegrationRegistry] = useState(emptyIntegrationRegistry);
  const [stats, setStats] = useState({ runs: {}, targets: {} });
  const [authInfo, setAuthInfo] = useState(defaultAuthInfo);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsScopeLevel, setSettingsScopeLevel] = useState("project");
  const [requestContext, setRequestContext] = useState(() => {
    try {
      return { ...defaultRequestContext, ...(JSON.parse(window.localStorage.getItem(contextStorageKey) || "{}")) };
    } catch {
      return defaultRequestContext;
    }
  });
  const [runForm, setRunForm] = useState(deriveRunFormDefaults(null, emptyEffectiveSettings));
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", document_type: "policy", notes: "", content_text: "" });
  const [workspaceForm, setWorkspaceForm] = useState({ name: "", description: "" });
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [roleBindingForm, setRoleBindingForm] = useState({ actor_id: "", role: "reviewer" });
  const [projectEditor, setProjectEditor] = useState({
    id: "",
    name: "",
    description: "",
    target_kind: "path",
    local_path: "",
    repo_url: "",
    endpoint_url: "",
    audit_policy_pack: "",
    preflight_strictness: "standard",
    runtime_allowed: "targeted_only",
    review_severity: "high",
    review_visibility: "internal"
  });
  const [apiKeyForm, setApiKeyForm] = useState({ label: "" });
  const [latestCreatedApiKey, setLatestCreatedApiKey] = useState("");
  const [preflightSummary, setPreflightSummary] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightStale, setPreflightStale] = useState(true);
  const [preflightCheckedAt, setPreflightCheckedAt] = useState(null);
  const [preflightAcceptedAt, setPreflightAcceptedAt] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [compareRunId, setCompareRunId] = useState("");
  const [selectedRunComparison, setSelectedRunComparison] = useState(null);
  const [selectedRunComparisonLoading, setSelectedRunComparisonLoading] = useState(false);
  const [comparisonRunDetail, setComparisonRunDetail] = useState(null);
  const [comparisonRunLoading, setComparisonRunLoading] = useState(false);
  const [selectedComparisonFindingId, setSelectedComparisonFindingId] = useState("");
  const [reviewNotifications, setReviewNotifications] = useState([]);
  const [reviewAssignee, setReviewAssignee] = useState("");
  const [findingReviewState, setFindingReviewState] = useState({});
  const [reviewFilter, setReviewFilter] = useState("my_assigned");
  const [runtimeFollowupFilter, setRuntimeFollowupFilter] = useState("open");
  const [reviewCommentBody, setReviewCommentBody] = useState("");
  const [reviewCommentFindingId, setReviewCommentFindingId] = useState("");
  const [outboundActionType, setOutboundActionType] = useState("pr_comment");
  const [outboundTargetNumber, setOutboundTargetNumber] = useState("");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [selectedRuntimeFollowupId, setSelectedRuntimeFollowupId] = useState("");
  const [selectedRuntimeFollowupIds, setSelectedRuntimeFollowupIds] = useState([]);
  const [linkedRuntimeRerunDetail, setLinkedRuntimeRerunDetail] = useState(null);
  const [linkedRuntimeRerunLoading, setLinkedRuntimeRerunLoading] = useState(false);

  const pendingReviews = useMemo(
    () => runs
      .filter((run) => ["review_required", "in_review", "requires_rerun"].includes(run.review_workflow?.status || ""))
      .sort((left, right) => {
        const priorityDiff = reviewPriority(left, requestContext.actorId) - reviewPriority(right, requestContext.actorId);
        if (priorityDiff !== 0) return priorityDiff;
        const dueLeft = nextDispositionReviewDueAt(left);
        const dueRight = nextDispositionReviewDueAt(right);
        if (dueLeft && dueRight && dueLeft !== dueRight) return dueLeft.localeCompare(dueRight);
        if (dueLeft && !dueRight) return -1;
        if (!dueLeft && dueRight) return 1;
        return reviewAnchor(left).localeCompare(reviewAnchor(right));
      }),
    [runs, requestContext.actorId]
  );
  const filteredPendingReviews = useMemo(() => {
    const actorId = requestContext.actorId || "";
    if (reviewFilter === "all") return pendingReviews;
    if (reviewFilter === "my_assigned") return pendingReviews.filter((run) => (run.review_workflow?.current_reviewer_id || "") === actorId);
    if (reviewFilter === "unread_assignments") {
      const runIds = new Set(reviewNotifications.filter((item) => item.status === "unread").map((item) => item.run_id));
      return pendingReviews.filter((run) => runIds.has(run.id));
    }
    if (reviewFilter === "in_review") return pendingReviews.filter((run) => run.review_workflow?.status === "in_review");
    if (reviewFilter === "overdue") return pendingReviews.filter((run) => isOverdueReview(run));
    if (reviewFilter === "due_soon") return pendingReviews.filter((run) => dispositionDueSoonCount(run) > 0);
    if (reviewFilter === "runtime_followup") return pendingReviews.filter((run) => runtimeFollowupCount(run) > 0);
    if (reviewFilter === "needs_rerun") return pendingReviews.filter((run) => run.review_workflow?.status === "requires_rerun");
    if (reviewFilter === "needs_disposition_review") return pendingReviews.filter((run) => Number(run.review_summary_counts?.findings_needing_disposition_review_count || 0) > 0);
    return pendingReviews;
  }, [pendingReviews, reviewFilter, reviewNotifications, requestContext.actorId]);
  const recentRuns = useMemo(
    () => [...runs].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || ""))).slice(0, 8),
    [runs]
  );
  const averageScore = useMemo(() => {
    const scores = runs.map((run) => Number(run?.overall_score)).filter((value) => Number.isFinite(value));
    if (!scores.length) return "n/a";
    return String((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1));
  }, [runs]);
  const successfulRuns = useMemo(
    () => runs.filter((run) => ["succeeded", "approved", "completed"].includes(run.status)).length,
    [runs]
  );
  const openRuntimeFollowups = useMemo(
    () => runtimeFollowups.filter((item) => item.status !== "completed").length,
    [runtimeFollowups]
  );
  const overdueReviews = useMemo(
    () => pendingReviews.filter((run) => isOverdueReview(run)).length,
    [pendingReviews]
  );
  const averageReviewAgeHours = useMemo(() => {
    if (!pendingReviews.length) return "0h";
    const avgHours = pendingReviews.reduce((sum, run) => sum + hoursSince(reviewAnchor(run)), 0) / pendingReviews.length;
    return avgHours >= 24 ? `${(avgHours / 24).toFixed(1)}d` : `${Math.round(avgHours)}h`;
  }, [pendingReviews]);
  const postureSeries = useMemo(
    () => buildDashboardPostureSeries(runs),
    [runs]
  );
  const currentProject = useMemo(
    () => projects.find((project) => project.id === requestContext.projectId) || null,
    [projects, requestContext.projectId]
  );
  const launchReadiness = useMemo(
    () => deriveLaunchReadiness(runForm, preflightSummary, preflightAcceptedAt, preflightStale, effectiveSettings, llmRegistry),
    [runForm, preflightSummary, preflightAcceptedAt, preflightStale, effectiveSettings, llmRegistry]
  );
  const selectedProvider = useMemo(
    () => getProviderDefinition(llmRegistry, runForm.llm_provider),
    [llmRegistry, runForm.llm_provider]
  );
  const runModelOptions = useMemo(
    () => getSelectableRunModelOptions(llmRegistry, runForm.llm_provider, runForm.llm_model),
    [llmRegistry, runForm.llm_provider, runForm.llm_model]
  );
  const settingsProvider = useMemo(
    () => getProviderDefinition(llmRegistry, settings.providers_json.default_provider || "mock"),
    [llmRegistry, settings.providers_json.default_provider]
  );
  const settingsModelOptions = useMemo(
    () => getModelOptionsForProvider(llmRegistry, settings.providers_json.default_provider || "mock", settings.providers_json.default_model || ""),
    [llmRegistry, settings.providers_json.default_provider, settings.providers_json.default_model]
  );
  const settingsProviderCredentialFields = useMemo(
    () => getProviderCredentialFields(llmRegistry, settings.providers_json.default_provider || "mock"),
    [llmRegistry, settings.providers_json.default_provider]
  );
  const githubIntegration = useMemo(
    () => getIntegrationDefinition(integrationRegistry, "github_outbound"),
    [integrationRegistry]
  );
  const genericWebhookIntegration = useMemo(
    () => getIntegrationDefinition(integrationRegistry, "generic_webhook"),
    [integrationRegistry]
  );
  const selectedRuntimeFollowup = useMemo(
    () => runtimeFollowups.find((item) => item.id === selectedRuntimeFollowupId) || runtimeFollowups[0] || null,
    [runtimeFollowups, selectedRuntimeFollowupId]
  );

  function toggleRuntimeFollowupSelection(followupId) {
    setSelectedRuntimeFollowupIds((current) => current.includes(followupId)
      ? current.filter((id) => id !== followupId)
      : [...current, followupId]);
  }

  function selectAllRuntimeFollowups(items) {
    setSelectedRuntimeFollowupIds((items || []).map((item) => item.id));
  }

  function clearRuntimeFollowupSelection() {
    setSelectedRuntimeFollowupIds([]);
  }

  function updateRunForm(key, value) {
    setPreflightStale(true);
    setPreflightAcceptedAt(null);
    setRunForm((current) => ({ ...current, [key]: value }));
  }

  function updateSettings(section, key, value) {
    setSettings((current) => ({ ...current, [section]: { ...(current[section] || {}), [key]: value } }));
  }

  function updateProviderCredentialDraft(fieldId, value) {
    setProviderCredentialDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function updateIntegrationCredentialDraft(fieldId, value) {
    setIntegrationCredentialDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function updateRequestContext(key, value) {
    setRequestContext((current) => ({ ...current, [key]: value }));
  }

  function updateProjectEditor(key, value) {
    setProjectEditor((current) => ({ ...current, [key]: value }));
  }

  function load() {
    setError("");
    return Promise.all([
      api("/auth/info", undefined, requestContext),
      api("/runs?limit=25", undefined, requestContext),
      api("/runs/async", undefined, requestContext),
      api("/stats/runs", undefined, requestContext),
      api("/stats/targets", undefined, requestContext),
      api("/ui/settings?scope_level=effective", undefined, requestContext),
      api("/ui/settings?scope_level=" + encodeURIComponent(settingsScopeLevel), undefined, requestContext),
      api("/ui/api-keys", undefined, requestContext),
      api("/ui/workspace-role-bindings", undefined, requestContext),
      api("/ui/documents", undefined, requestContext),
      api("/ui/workspaces", undefined, requestContext),
      api("/ui/projects?workspace_id=" + encodeURIComponent(requestContext.workspaceId), undefined, requestContext),
      api("/audit-packages", undefined, requestContext),
      api("/policy-packs", undefined, requestContext),
      api("/llm-providers", undefined, requestContext),
      api("/integrations", undefined, requestContext),
      api("/review-notifications?reviewer_id=" + encodeURIComponent(requestContext.actorId || "anonymous"), undefined, requestContext),
      api("/runtime-followups", undefined, requestContext)
    ]).then(([authInfoPayload, runsPayload, jobsPayload, runStatsPayload, targetStatsPayload, effectiveSettingsPayload, settingsPayload, apiKeysPayload, roleBindingsPayload, documentsPayload, workspacesPayload, projectsPayload, auditPackagesPayload, policyPacksPayload, llmProvidersPayload, integrationsPayload, notificationsPayload, runtimeFollowupsPayload]) => {
      setAuthInfo(authInfoPayload || defaultAuthInfo);
      setRuns(runsPayload.runs || []);
      setJobs(jobsPayload.jobs || []);
      setStats({ runs: runStatsPayload.stats || {}, targets: targetStatsPayload.stats || {} });
      setEffectiveSettings({
        effective: effectiveSettingsPayload.settings || emptySettings,
        layers: effectiveSettingsPayload.layers || emptyEffectiveSettings.layers
      });
      setSettings(settingsPayload.settings || emptySettings);
      setProviderCredentialDrafts({});
      setIntegrationCredentialDrafts({});
      setApiKeys(apiKeysPayload.api_keys || []);
      setWorkspaceRoleBindings(roleBindingsPayload.workspace_role_bindings || []);
      setEffectiveRoles(roleBindingsPayload.effective_roles || []);
      setDocuments(documentsPayload.documents || []);
      setWorkspaces(workspacesPayload.workspaces || []);
      setProjects(projectsPayload.projects || []);
      setAuditPackages(auditPackagesPayload.audit_packages || []);
      setPolicyPacks(policyPacksPayload.policy_packs || []);
      setLlmRegistry({
        providers: llmProvidersPayload.providers || [],
        presets: llmProvidersPayload.presets || []
      });
      setIntegrationRegistry(integrationsPayload.integrations || []);
      setReviewNotifications(notificationsPayload.review_notifications || []);
      setRuntimeFollowups(runtimeFollowupsPayload.runtime_followups || []);
    }).catch((loadError) => setError(loadError.message || String(loadError)));
  }

  function loadRunDetail(runId) {
    if (!runId) {
      setSelectedRunDetail(null);
      return Promise.resolve();
    }
    setSelectedRunLoading(true);
    return Promise.all([
      api("/runs/" + encodeURIComponent(runId), undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/summary", undefined, requestContext),
      api(`/runs/${encodeURIComponent(runId)}/exports${compareRunId ? `?compare_to=${encodeURIComponent(compareRunId)}` : ""}`, undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/resolved-config", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/preflight", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/launch-intent", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/sandbox-execution", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/findings", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/evidence-records", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/control-results", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/observations", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/supervisor-review", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/remediation", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/finding-evaluations", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/webhook-deliveries", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/review-actions", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/review-summary", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/review-comments", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/runtime-followups", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/finding-dispositions", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/outbound-preview", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/outbound-approval", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/outbound-send", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/outbound-verification", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/outbound-delivery", undefined, requestContext)
    ]).then(([runPayload, summaryPayload, exportsIndexPayload, resolvedPayload, preflightPayload, launchIntentPayload, sandboxExecutionPayload, findingsPayload, evidenceRecordsPayload, controlResultsPayload, observationsPayload, supervisorReviewPayload, remediationPayload, findingEvaluationsPayload, webhookDeliveriesPayload, reviewActionsPayload, reviewSummaryPayload, reviewCommentsPayload, runtimeFollowupsPayload, findingDispositionsPayload, outboundPreviewPayload, outboundApprovalPayload, outboundSendPayload, outboundVerificationPayload, outboundDeliveryPayload]) => {
      setSelectedRunDetail({
        run: runPayload,
        summary: summaryPayload,
        exportsIndex: exportsIndexPayload,
        resolvedConfig: resolvedPayload,
        preflight: preflightPayload,
        launchIntent: launchIntentPayload,
        sandboxExecution: sandboxExecutionPayload,
        findings: findingsPayload,
        evidenceRecords: evidenceRecordsPayload,
        controlResults: controlResultsPayload,
        observations: observationsPayload,
        supervisorReview: supervisorReviewPayload,
        remediation: remediationPayload,
        findingEvaluations: findingEvaluationsPayload,
        webhookDeliveries: webhookDeliveriesPayload,
        reviewActions: reviewActionsPayload,
        reviewSummary: reviewSummaryPayload,
        reviewComments: reviewCommentsPayload,
        runtimeFollowups: runtimeFollowupsPayload,
        findingDispositions: findingDispositionsPayload,
        outboundPreview: outboundPreviewPayload,
        outboundApproval: outboundApprovalPayload,
        outboundSend: outboundSendPayload,
        outboundVerification: outboundVerificationPayload,
        outboundDelivery: outboundDeliveryPayload
      });
      const reviewFindingSummaries = reviewSummaryPayload.review_summary?.finding_summaries || [];
      setFindingReviewState((current) => {
        const next = {};
        for (const finding of findingsPayload.findings || []) {
          const existingSummary = reviewFindingSummaries.find((item) => item.finding_id === finding.id) || null;
          const existingResolvedDisposition = (findingDispositionsPayload.resolved_finding_dispositions || []).find((item) => item.finding_id === finding.id) || null;
          const activeDispositionIds = new Set((existingResolvedDisposition?.active_dispositions || []).map((item) => item.id));
          const currentState = current[finding.id] || {};
          next[finding.id] = {
            updated_severity: currentState.updated_severity || "medium",
            visibility_override: currentState.visibility_override || "internal",
            notes: currentState.notes || "",
            disposition_reason: currentState.disposition_reason || "",
            disposition_expires_at: currentState.disposition_expires_at || "",
            disposition_owner_id: currentState.disposition_owner_id || existingSummary?.active_disposition_owner_id || requestContext.actorId || "",
            disposition_reviewed_at: currentState.disposition_reviewed_at || existingSummary?.active_disposition_reviewed_at || new Date().toISOString(),
            disposition_review_due_by: currentState.disposition_review_due_by || existingSummary?.active_disposition_review_due_by || "",
            editing_disposition_id: activeDispositionIds.has(currentState.editing_disposition_id) ? currentState.editing_disposition_id : ""
          };
        }
        return next;
      });
      setReviewAssignee(summaryPayload.summary?.current_reviewer_id || runPayload.run?.review_workflow?.current_reviewer_id || requestContext.actorId || "");
      setReviewCommentBody("");
      setReviewCommentFindingId("");
      setSelectedFindingId((current) => current && (findingsPayload.findings || []).some((finding) => finding.id === current) ? current : (findingsPayload.findings || [])[0]?.id || "");
      setCompareRunId((current) => current || "");
      setOutboundActionType((outboundPreviewPayload.outbound_preview?.proposed_actions || [])[0]?.action_type || "pr_comment");
      setOutboundTargetNumber("");
    }).catch((loadError) => {
      setSelectedRunDetail(null);
      setError(loadError.message || String(loadError));
    }).finally(() => setSelectedRunLoading(false));
  }

  function loadRunComparison(runId, compareToRunId) {
    if (!runId || !compareToRunId) {
      setSelectedRunComparison(null);
      setSelectedRunComparisonLoading(false);
      return Promise.resolve();
    }
    setSelectedRunComparisonLoading(true);
    return api(`/runs/${encodeURIComponent(runId)}/report-compare?compare_to=${encodeURIComponent(compareToRunId)}&format=json`, undefined, requestContext)
      .then((payload) => setSelectedRunComparison(payload))
      .catch((loadError) => {
        setSelectedRunComparison(null);
        setError(loadError.message || String(loadError));
      })
      .finally(() => setSelectedRunComparisonLoading(false));
  }

  function loadComparisonRunDetail(runId) {
    if (!runId) {
      setComparisonRunDetail(null);
      setComparisonRunLoading(false);
      return Promise.resolve();
    }
    setComparisonRunLoading(true);
    return Promise.all([
      api("/runs/" + encodeURIComponent(runId) + "/summary", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/findings", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/finding-evaluations", undefined, requestContext)
    ]).then(([summaryPayload, findingsPayload, evaluationsPayload]) => {
      setComparisonRunDetail({
        summary: summaryPayload,
        findings: findingsPayload,
        findingEvaluations: evaluationsPayload
      });
      setSelectedComparisonFindingId((current) => current && (findingsPayload.findings || []).some((finding) => finding.id === current)
        ? current
        : "");
    }).catch((loadError) => {
      setComparisonRunDetail(null);
      setError(loadError.message || String(loadError));
    }).finally(() => setComparisonRunLoading(false));
  }

  function selectComparisonPair(currentFindingId, previousFindingId) {
    if (currentFindingId) setSelectedFindingId(currentFindingId);
    if (previousFindingId) setSelectedComparisonFindingId(previousFindingId);
  }

  function loadLinkedRuntimeRerunDetail(runId) {
    if (!runId) {
      setLinkedRuntimeRerunDetail(null);
      return Promise.resolve();
    }
    setLinkedRuntimeRerunLoading(true);
    return Promise.all([
      api("/runs/" + encodeURIComponent(runId) + "/summary", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/findings", undefined, requestContext),
      api("/runs/" + encodeURIComponent(runId) + "/finding-evaluations", undefined, requestContext)
    ]).then(([summaryPayload, findingsPayload, evaluationsPayload]) => {
      setLinkedRuntimeRerunDetail({
        summary: summaryPayload,
        findings: findingsPayload,
        findingEvaluations: evaluationsPayload
      });
    }).catch((loadError) => {
      setLinkedRuntimeRerunDetail(null);
      setError(loadError.message || String(loadError));
    }).finally(() => setLinkedRuntimeRerunLoading(false));
  }

  useEffect(() => {
    load();
  }, [requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey, settingsScopeLevel]);

  useEffect(() => {
    if (!runs.length) {
      setSelectedRunId("");
      setSelectedRunDetail(null);
      return;
    }
    if (!runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    loadRunDetail(selectedRunId);
  }, [selectedRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    loadRunComparison(selectedRunId, compareRunId);
  }, [selectedRunId, compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    loadComparisonRunDetail(compareRunId);
  }, [compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if (!selectedRunId) return;
    api(`/runs/${encodeURIComponent(selectedRunId)}/exports${compareRunId ? `?compare_to=${encodeURIComponent(compareRunId)}` : ""}`, undefined, requestContext)
      .then((payload) => {
        setSelectedRunDetail((current) => current ? { ...current, exportsIndex: payload } : current);
      })
      .catch((loadError) => setError(loadError.message || String(loadError)));
  }, [selectedRunId, compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if (!runtimeFollowups.length) {
      setSelectedRuntimeFollowupId("");
      setSelectedRuntimeFollowupIds([]);
      setLinkedRuntimeRerunDetail(null);
      return;
    }
    if (!runtimeFollowups.some((item) => item.id === selectedRuntimeFollowupId)) {
      setSelectedRuntimeFollowupId(runtimeFollowups[0].id);
    }
    setSelectedRuntimeFollowupIds((current) => current.filter((id) => runtimeFollowups.some((item) => item.id === id)));
  }, [runtimeFollowups, selectedRuntimeFollowupId]);

  useEffect(() => {
    if (!selectedRuntimeFollowup) {
      setLinkedRuntimeRerunDetail(null);
      return;
    }
    if (selectedRunId !== selectedRuntimeFollowup.run_id) {
      setSelectedRunId(selectedRuntimeFollowup.run_id);
    }
    loadLinkedRuntimeRerunDetail(selectedRuntimeFollowup.linked_run_id || "");
  }, [selectedRuntimeFollowup?.id, selectedRuntimeFollowup?.run_id, selectedRuntimeFollowup?.linked_run_id, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if (!projects.length) return;
    const matchingProject = projects.find((item) => item.id === requestContext.projectId);
    if (!matchingProject) {
      updateRequestContext("projectId", projects[0]?.id || "default");
    }
  }, [projects, requestContext.projectId]);

  useEffect(() => {
    const defaults = deriveRunFormDefaults(currentProject, effectiveSettings);
    setRunForm(defaults);
    setPreflightSummary(null);
    setPreflightStale(true);
    setPreflightCheckedAt(null);
    setPreflightAcceptedAt(null);
    setProjectEditor({
      id: currentProject?.id || "",
      name: currentProject?.name || "",
      description: currentProject?.description || "",
      target_kind: inferTargetKind(currentProject?.target_defaults_json || {}),
      local_path: currentProject?.target_defaults_json?.local_path || "",
      repo_url: currentProject?.target_defaults_json?.repo_url || "",
      endpoint_url: currentProject?.target_defaults_json?.endpoint_url || "",
      audit_policy_pack: currentProject?.target_defaults_json?.audit_policy_pack || "",
      preflight_strictness: currentProject?.target_defaults_json?.preflight_strictness || effectiveSettings.effective.preflight_json?.strictness || "standard",
      runtime_allowed: currentProject?.target_defaults_json?.runtime_allowed || effectiveSettings.effective.preflight_json?.runtime_allowed || "targeted_only",
      review_severity: currentProject?.target_defaults_json?.review_severity || effectiveSettings.effective.review_json?.require_human_review_for_severity || "high",
      review_visibility: currentProject?.target_defaults_json?.review_visibility || effectiveSettings.effective.review_json?.default_visibility || "internal"
    });
  }, [currentProject?.id, effectiveSettings.effective.audit_defaults_json, effectiveSettings.effective.providers_json, effectiveSettings.effective.preflight_json, effectiveSettings.effective.review_json]);

  useEffect(() => {
    window.localStorage.setItem(contextStorageKey, JSON.stringify(requestContext));
  }, [requestContext]);

  function act(task, message) {
    setError("");
    setNotice("");
    task().then(() => {
      setNotice(message);
      return load();
    }).catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function runPreflight() {
    setError("");
    setNotice("");
    setPreflightLoading(true);
    api("/preflight", { method: "POST", body: JSON.stringify(buildRunRequest(runForm, effectiveSettings, llmRegistry)) }, requestContext)
      .then((payload) => {
        setPreflightSummary(payload.preflight || null);
        setPreflightStale(false);
        setPreflightCheckedAt(new Date().toISOString());
        setPreflightAcceptedAt(null);
      })
      .catch((taskError) => setError(taskError.message || String(taskError)))
      .finally(() => setPreflightLoading(false));
  }

  function acceptPreflight() {
    if (!preflightSummary || preflightStale) return;
    setPreflightAcceptedAt(new Date().toISOString());
    setNotice("Preflight accepted for launch.");
    setError("");
  }

  function applyPreflightRecommendations() {
    if (!preflightSummary?.launch_profile) return;
    const recommended = preflightSummary.launch_profile;
    setRunForm((current) => ({
      ...current,
      audit_package: recommended.audit_package || current.audit_package,
      audit_policy_pack: recommended.audit_policy_pack || "",
      run_mode: recommended.run_mode || current.run_mode,
      llm_provider: recommended.llm_provider || current.llm_provider,
      llm_model: recommended.llm_model || "",
      preflight_strictness: recommended.preflight_strictness || current.preflight_strictness,
      runtime_allowed: recommended.runtime_allowed || current.runtime_allowed,
      review_severity: recommended.review_severity || current.review_severity,
      review_visibility: recommended.review_visibility || current.review_visibility
    }));
    setPreflightAcceptedAt(null);
    setPreflightStale(true);
    setNotice("Applied the recommended preflight profile. Re-run preflight to confirm the updated launch plan.");
    setError("");
  }

  function applyProviderPreset(presetId, target = "run") {
    const preset = (llmRegistry.presets || []).find((item) => item.id === presetId);
    if (!preset) return;
    if (target === "settings") {
      setSettings((current) => ({
        ...current,
        providers_json: {
          ...(current.providers_json || {}),
          default_provider: preset.provider_id,
          default_model: preset.model || ""
        }
      }));
      setNotice(`Applied provider preset: ${preset.label}.`);
      setError("");
      return;
    }
    setRunForm((current) => ({
      ...current,
      llm_provider: preset.provider_id,
      llm_model: preset.model || ""
    }));
    setPreflightAcceptedAt(null);
    setPreflightStale(true);
    setNotice(`Applied launch preset: ${preset.label}. Re-run preflight before launch.`);
    setError("");
  }

  function launchRun() {
    if (!launchReadiness.canLaunch) return;
    act(
      () => api("/runs", {
        method: "POST",
        body: JSON.stringify(buildLaunchRunRequest(runForm, requestContext, {
          preflightCheckedAt,
          preflightAcceptedAt,
          preflightStale
        }, effectiveSettings, llmRegistry))
      }, requestContext).then((payload) => {
        setLaunchModalOpen(false);
        if (payload?.run?.id) {
          setSelectedRunId(payload.run.id);
          setView("runs");
        }
      }),
      "Run launched."
    );
  }

  function assignReviewer() {
    if (!selectedRunId || !reviewAssignee) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/review-actions", {
        method: "POST",
        body: JSON.stringify({
          action_type: "assign_reviewer",
          assigned_reviewer_id: reviewAssignee,
          notes: `assigned from web ui by ${requestContext.actorId || "anonymous"}`
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Reviewer assigned."
    );
  }

  function acknowledgeNotification(notificationId) {
    act(
      () => api("/review-notifications/" + encodeURIComponent(notificationId) + "/ack", {
        method: "POST",
        body: "{}"
      }, requestContext),
      "Notification acknowledged."
    );
  }

  function updateFindingReviewState(findingId, field, value) {
    setFindingReviewState((current) => ({
      ...current,
      [findingId]: {
        ...(current[findingId] || {}),
        [field]: value
      }
    }));
  }

  function beginDispositionEdit(finding, disposition) {
    setFindingReviewState((current) => ({
      ...current,
      [finding.id]: {
        ...(current[finding.id] || {}),
        disposition_reason: disposition.reason || "",
        disposition_expires_at: disposition.expires_at || "",
        disposition_owner_id: disposition.metadata_json?.owner_id || requestContext.actorId || "",
        disposition_reviewed_at: disposition.metadata_json?.reviewed_at || new Date().toISOString(),
        disposition_review_due_by: disposition.metadata_json?.review_due_by || "",
        editing_disposition_id: disposition.id
      }
    }));
    setNotice(`Loaded ${disposition.disposition_type} for editing.`);
    setError("");
  }

  function submitReviewAction(payload, successMessage) {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/review-actions", {
        method: "POST",
        body: JSON.stringify(payload)
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      successMessage
    );
  }

  function submitReviewActionForRun(runId, payload) {
    return api("/runs/" + encodeURIComponent(runId) + "/review-actions", {
      method: "POST",
      body: JSON.stringify(payload)
    }, requestContext);
  }

  function runReviewAction(actionType) {
    submitReviewAction({
      action_type: actionType,
      notes: `submitted from web ui by ${requestContext.actorId || "anonymous"}`
    }, `Review action recorded: ${actionType}.`);
  }

  function findingReviewAction(finding, actionType) {
    const state = findingReviewState[finding.id] || {};
    const evaluation = (findingEvaluations?.evaluations || []).find((item) => item.finding_id === finding.id) || null;
    submitReviewAction({
      action_type: actionType,
      finding_id: finding.id,
      updated_severity: actionType === "downgrade_severity" ? (state.updated_severity || null) : null,
      visibility_override: state.visibility_override || null,
      notes: state.notes || `submitted from web ui by ${requestContext.actorId || "anonymous"}`,
      metadata: actionType === "adopt_rerun_outcome"
        ? {
            adopted_outcome: evaluation?.runtime_followup_outcome || "none",
            linked_run_id: evaluation?.runtime_followup_linked_run_id || null
          }
        : null
    }, `Finding action recorded: ${actionType}.`);
  }

  function findingDispositionAction(finding, dispositionType, scopeLevel) {
    if (!selectedRunId) return;
    const state = findingReviewState[finding.id] || {};
    const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
    if (!(state.disposition_reason || "").trim()) {
      setError("A suppression or waiver reason is required.");
      return;
    }
    if (dispositionType === "waiver" && scopeLevel === "project") {
      if (!(state.disposition_owner_id || "").trim()) {
        setError("A project waiver owner is required.");
        return;
      }
      if (!(state.disposition_reviewed_at || "").trim()) {
        setError("A project waiver review timestamp is required.");
        return;
      }
    }
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions", {
        method: "POST",
        body: JSON.stringify({
          finding_id: finding.id,
          disposition_type: dispositionType,
          scope_level: scopeLevel,
          reason: state.disposition_reason,
          notes: state.notes || null,
          expires_at: state.disposition_expires_at || null,
          owner_id: dispositionType === "waiver" && scopeLevel === "project" ? state.disposition_owner_id || null : null,
          reviewed_at: dispositionType === "waiver" && scopeLevel === "project" ? state.disposition_reviewed_at || null : null,
          review_due_by: dispositionType === "waiver" && scopeLevel === "project"
            ? (state.disposition_review_due_by || addDaysIso(state.disposition_reviewed_at || new Date().toISOString(), reviewCadence.reviewWindowDays))
            : null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      `${dispositionType} recorded for ${finding.title}.`
    );
  }

  function saveDispositionEdit(finding) {
    if (!selectedRunId) return;
    const state = findingReviewState[finding.id] || {};
    const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
    if (!(state.editing_disposition_id || "").trim()) {
      setError("Choose an active suppression or waiver to edit first.");
      return;
    }
    if (!(state.disposition_reason || "").trim()) {
      setError("A suppression or waiver reason is required.");
      return;
    }
    const selectedFindingDisposition = selectedRunDetail?.findingDispositions?.resolved_finding_dispositions?.find((item) => item.finding_id === finding.id) || null;
    const existing = (selectedFindingDisposition?.active_dispositions || []).find((item) => item.id === state.editing_disposition_id) || null;
    if (existing?.disposition_type === "waiver" && existing.scope_level === "project") {
      if (!(state.disposition_owner_id || "").trim()) {
        setError("A project waiver owner is required.");
        return;
      }
      if (!(state.disposition_reviewed_at || "").trim()) {
        setError("A project waiver review timestamp is required.");
        return;
      }
    }
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions/" + encodeURIComponent(state.editing_disposition_id), {
        method: "PATCH",
        body: JSON.stringify({
          reason: state.disposition_reason,
          notes: state.notes || null,
          expires_at: state.disposition_expires_at || null,
          owner_id: existing?.disposition_type === "waiver" && existing.scope_level === "project" ? state.disposition_owner_id || null : null,
          reviewed_at: existing?.disposition_type === "waiver" && existing.scope_level === "project" ? state.disposition_reviewed_at || null : null,
          review_due_by: existing?.disposition_type === "waiver" && existing.scope_level === "project"
            ? (state.disposition_review_due_by || addDaysIso(state.disposition_reviewed_at || new Date().toISOString(), reviewCadence.reviewWindowDays))
            : null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Disposition updated."
    );
  }

  function revokeDisposition(finding, disposition) {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions/" + encodeURIComponent(disposition.id) + "/revoke", {
        method: "POST",
        body: JSON.stringify({
          notes: `revoked from web ui by ${requestContext.actorId || "anonymous"}`
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      `${disposition.disposition_type} revoked.`
    );
  }

  function bulkUpdateDispositionSet(dispositions, action) {
    if (!selectedRunId || !dispositions.length) return;
    const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
    act(
      () => Promise.all(dispositions.map((disposition) => {
        if (action === "renew") {
          const currentExpiry = disposition.expires_at ? new Date(disposition.expires_at).getTime() : Date.now();
          const nextExpiry = new Date(Math.max(currentExpiry, Date.now()) + (reviewCadence.renewalDays * 24 * 36e5)).toISOString();
          const metadata = disposition.metadata_json || {};
          const nextReviewedAt = disposition.disposition_type === "waiver" && disposition.scope_level === "project"
            ? new Date().toISOString()
            : null;
          const nextReviewDueBy = disposition.disposition_type === "waiver" && disposition.scope_level === "project"
            ? addDaysIso(nextReviewedAt, reviewCadence.reviewWindowDays)
            : null;
          return api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions/" + encodeURIComponent(disposition.id), {
            method: "PATCH",
            body: JSON.stringify({
              reason: disposition.reason,
              notes: disposition.notes || null,
              expires_at: nextExpiry,
              owner_id: disposition.disposition_type === "waiver" && disposition.scope_level === "project" ? metadata.owner_id || requestContext.actorId || null : null,
              reviewed_at: nextReviewedAt,
              review_due_by: nextReviewDueBy
            })
          }, requestContext);
        }
        return api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions/" + encodeURIComponent(disposition.id) + "/revoke", {
          method: "POST",
          body: JSON.stringify({
            notes: `bulk revoked from web ui by ${requestContext.actorId || "anonymous"}`
          })
        }, requestContext);
      })).then(() => loadRunDetail(selectedRunId)),
      action === "renew" ? "Due-soon dispositions renewed." : "Due-soon dispositions revoked."
    );
  }

  function submitReviewComment() {
    if (!selectedRunId || !reviewCommentBody.trim()) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/review-comments", {
        method: "POST",
        body: JSON.stringify({
          body: reviewCommentBody,
          finding_id: reviewCommentFindingId || null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Review comment posted."
    );
  }

  function exportReviewAudit() {
    if (!selectedRunId) return;
    setError("");
    setNotice("");
    api("/runs/" + encodeURIComponent(selectedRunId) + "/review-audit", undefined, requestContext)
      .then((payload) => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${selectedRunId}-review-audit.json`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice("Review audit exported.");
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportExecutiveReport(format) {
    if (!selectedRunId) return;
    setError("");
    setNotice("");
    api(`/runs/${encodeURIComponent(selectedRunId)}/report-executive?format=${encodeURIComponent(format || "json")}`, undefined, requestContext)
      .then((payload) => {
        const isMarkdown = payload.format === "markdown";
        const content = isMarkdown
          ? (payload.report_executive_markdown || "")
          : JSON.stringify(payload.report_executive || payload, null, 2);
        const blob = new Blob([content], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `${selectedRunId}-executive-summary.${isMarkdown ? "md" : "json"}`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice(`Executive summary exported as ${isMarkdown ? "Markdown" : "JSON"}.`);
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportMarkdownReport() {
    if (!selectedRunId) return;
    setError("");
    setNotice("");
    api("/runs/" + encodeURIComponent(selectedRunId) + "/report-markdown", undefined, requestContext)
      .then((payload) => {
        const blob = new Blob([payload.report_markdown || ""], { type: "text/markdown;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `${selectedRunId}-report.md`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice("Markdown report exported.");
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportSarifReport() {
    if (!selectedRunId) return;
    setError("");
    setNotice("");
    api("/runs/" + encodeURIComponent(selectedRunId) + "/report-sarif", undefined, requestContext)
      .then((payload) => {
        const blob = new Blob([JSON.stringify(payload.report_sarif || {}, null, 2)], { type: "application/sarif+json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `${selectedRunId}-report.sarif.json`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice("SARIF report exported.");
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportComparisonReport(format) {
    if (!selectedRunId || !compareRunId) return;
    setError("");
    setNotice("");
    api(`/runs/${encodeURIComponent(selectedRunId)}/report-compare?compare_to=${encodeURIComponent(compareRunId)}&format=${encodeURIComponent(format || "json")}`, undefined, requestContext)
      .then((payload) => {
        const isMarkdown = payload.format === "markdown";
        const content = isMarkdown
          ? (payload.report_compare_markdown || "")
          : JSON.stringify(payload.report_compare || payload, null, 2);
        const blob = new Blob([content], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `${selectedRunId}-vs-${compareRunId}-comparison.${isMarkdown ? "md" : "json"}`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice(`Run comparison exported as ${isMarkdown ? "Markdown" : "JSON"}.`);
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function downloadIndexedRunExport(exportItem) {
    if (!selectedRunId || !exportItem?.route) return;
    setError("");
    setNotice("");
    api(exportItem.route, undefined, requestContext)
      .then((payload) => {
        let content = "";
        let contentType = "application/json;charset=utf-8";
        if (exportItem.format === "markdown") {
          content = payload.report_executive_markdown || payload.report_markdown || payload.report_compare_markdown || "";
          contentType = "text/markdown;charset=utf-8";
        } else if (exportItem.format === "sarif") {
          content = JSON.stringify(payload.report_sarif || {}, null, 2);
          contentType = "application/sarif+json;charset=utf-8";
        } else {
          content = JSON.stringify(payload, null, 2);
        }
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exportItem.filename || `${selectedRunId}-${exportItem.export_type}.${exportItem.format === "markdown" ? "md" : "json"}`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice(`${exportItem.export_type.replace(/_/g, " ")} exported as ${exportItem.format.toUpperCase()}.`);
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportRuntimeFollowupQueue(format) {
    setError("");
    setNotice("");
    api(`/runtime-followups/export?format=${encodeURIComponent(format || "json")}`, undefined, requestContext)
      .then((payload) => {
        const isCsv = payload.format === "csv";
        const content = isCsv
          ? (payload.csv || "")
          : JSON.stringify({
              runtime_followup_summary: payload.runtime_followup_summary || {},
              runtime_followups: payload.runtime_followups || []
            }, null, 2);
        const blob = new Blob([content], { type: isCsv ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `runtime-followups.${isCsv ? "csv" : "json"}`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice(`Runtime follow-up queue exported as ${isCsv ? "CSV" : "JSON"}.`);
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function exportRuntimeFollowupBundle(followupId) {
    if (!followupId) return;
    setError("");
    setNotice("");
    api("/runtime-followups/" + encodeURIComponent(followupId) + "/report", undefined, requestContext)
      .then((payload) => {
        const blob = new Blob([JSON.stringify(payload.runtime_followup_report || payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.filename || `${followupId}-runtime-followup-report.json`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        setNotice("Runtime follow-up bundle exported.");
      })
      .catch((taskError) => setError(taskError.message || String(taskError)));
  }

  function approveOutboundSharing() {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/outbound-approval", {
        method: "POST",
        body: JSON.stringify({
          notes: [`approved from web ui by ${requestContext.actorId || "anonymous"}`]
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Outbound sharing approved for this run."
    );
  }

  function prepareOutboundSend() {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/outbound-send", {
        method: "POST",
        body: JSON.stringify({ action_type: outboundActionType })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Manual outbound send payload prepared."
    );
  }

  function verifyOutboundAccess() {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/outbound-verification", {
        method: "POST",
        body: "{}"
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "GitHub repository access verified."
    );
  }

  function executeOutboundDelivery() {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/outbound-delivery", {
        method: "POST",
        body: JSON.stringify({
          action_type: outboundActionType,
          target_number: outboundTargetNumber ? Number(outboundTargetNumber) : null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Outbound delivery sent to GitHub."
    );
  }

  function launchRuntimeFollowup(followupId) {
    if (!followupId) return;
    act(
      () => api("/runtime-followups/" + encodeURIComponent(followupId) + "/launch", {
        method: "POST",
        body: "{}"
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Runtime follow-up rerun launched."
    );
  }

  function selectRuntimeFollowup(followupId) {
    setSelectedRuntimeFollowupId(followupId);
    const followup = runtimeFollowups.find((item) => item.id === followupId);
    setCompareRunId(followup?.linked_run_id || "");
    if (followup?.run_id) {
      setSelectedRunId(followup.run_id);
    }
  }

  function openRuntimeFollowupSource(followup) {
    if (!followup?.run_id) return;
    setView("runs");
    setSelectedRunId(followup.run_id);
    setSelectedRuntimeFollowupId(followup.id);
    if (followup.finding_id) {
      setSelectedFindingId(followup.finding_id);
    }
  }

  function adoptRuntimeFollowupOutcome(finding) {
    if (!finding) return;
    findingReviewAction(finding, "adopt_rerun_outcome");
  }

  function bulkRuntimeFollowupAction(followups, actionType) {
    const applicable = (followups || []).filter((item) => {
      if (!item?.run_id || !item?.finding_id) return false;
      if (actionType === "adopt_rerun_outcome") return isRuntimeFollowupAdoptionReady(item) && item.rerun_outcome === "confirmed";
      if (actionType === "mark_manual_runtime_review_complete") return item.rerun_outcome === "still_inconclusive";
      if (actionType === "accept_without_runtime_validation") return item.rerun_outcome === "not_reproduced";
      return false;
    });
    if (!applicable.length) return;
    act(
      () => Promise.all(applicable.map((followup) => submitReviewActionForRun(followup.run_id, {
        action_type: actionType,
        finding_id: followup.finding_id,
        notes: `bulk ${actionType} from web ui by ${requestContext.actorId || "anonymous"}`,
        metadata: actionType === "adopt_rerun_outcome"
          ? {
              adopted_outcome: followup.rerun_outcome || "none",
              linked_run_id: followup.linked_run_id || null
            }
          : null
      }))).then(() => Promise.all([load(), selectedRunId ? loadRunDetail(selectedRunId) : Promise.resolve()])),
      actionType === "adopt_rerun_outcome"
        ? "Confirmed rerun outcomes adopted."
        : actionType === "mark_manual_runtime_review_complete"
          ? "Manual runtime review recorded."
          : "Accepted without runtime validation."
    );
    setSelectedRuntimeFollowupIds([]);
  }

  const launchWorkbench = h(Card, { key: "launch", title: "Launch Run", description: "Trigger the normal engine path with persisted outputs and review workflow attached." }, [
        h("div", { key: "intake", className: "mb-5 grid gap-3 md:grid-cols-3" }, [
          h("div", { key: "scope", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, [
            h("div", { key: "label", className: "font-medium" }, "Current Scope"),
            h("div", { key: "value", className: "mt-1 text-muted" }, `${requestContext.workspaceId}/${requestContext.projectId}`)
          ]),
          h("div", { key: "project", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, [
            h("div", { key: "label", className: "font-medium" }, "Project Defaults"),
            h("div", { key: "value", className: "mt-1 text-muted" }, currentProject ? `${currentProject.name} (${currentProject.id})` : "No project selected")
          ]),
          h("div", { key: "launch-state", className: cn("rounded-2xl border px-4 py-3 text-sm", launchReadiness.canLaunch ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-amber-200 bg-amber-50/80 text-amber-900") }, [
            h("div", { key: "label", className: "font-medium" }, "Launch Readiness"),
            h("div", { key: "value", className: "mt-1" }, launchReadiness.canLaunch ? "Ready to launch." : preflightSummary && !launchReadiness.accepted && preflightSummary.readiness?.status !== "blocked" ? "Accept a fresh preflight before launch." : "Needs attention before launch.")
          ])
        ]),
        h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
          h(Field, { key: "target-kind", label: "Target Kind" }, Select({ value: runForm.target_kind, onChange: (event) => updateRunForm("target_kind", event.target.value) }, [
            h("option", { key: "path", value: "path" }, "local path"),
            h("option", { key: "repo", value: "repo" }, "repo url"),
            h("option", { key: "endpoint", value: "endpoint" }, "endpoint url")
          ])),
          runForm.target_kind === "repo"
            ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, { value: runForm.repo_url, onChange: (event) => updateRunForm("repo_url", event.target.value), placeholder: "https://github.com/org/repo or git@github.com:org/repo.git" }))
            : runForm.target_kind === "endpoint"
              ? h(Field, { key: "endpoint", label: "Endpoint URL" }, h(Input, { value: runForm.endpoint_url, onChange: (event) => updateRunForm("endpoint_url", event.target.value), placeholder: "https://service.example.com/v1" }))
              : h(Field, { key: "path", label: "Local Path" }, h(Input, { value: runForm.local_path, onChange: (event) => updateRunForm("local_path", event.target.value), placeholder: "fixtures/validation-targets/agent-tool-boundary-risky" })),
          h(Field, { key: "mode", label: "Run Mode" }, Select({ value: runForm.run_mode, onChange: (event) => updateRunForm("run_mode", event.target.value) }, [
            h("option", { key: "placeholder", value: "", disabled: true }, "select run mode"),
            h("option", { key: "auto", value: "auto" }, "auto"),
            h("option", { key: "static", value: "static" }, "static"),
            h("option", { key: "runtime", value: "runtime" }, "runtime")
          ])),
          h(Field, { key: "pkg", label: "Audit Package" }, Select({ value: runForm.audit_package, onChange: (event) => updateRunForm("audit_package", event.target.value) }, [
            ...auditPackages.map((item) => h("option", { key: item.id, value: item.id }, item.title + " (" + item.id + ")")),
            !auditPackages.some((item) => item.id === runForm.audit_package) ? h("option", { key: runForm.audit_package || "custom-package", value: runForm.audit_package }, (runForm.audit_package || "custom") + " (custom)") : null
          ].filter(Boolean))),
          h(Field, { key: "policy-pack", label: "Policy Pack" }, Select({ value: runForm.audit_policy_pack || "", onChange: (event) => updateRunForm("audit_policy_pack", event.target.value) }, [
            h("option", { key: "default-empty", value: "" }, "default builtin policy"),
            ...policyPacks.map((item) => h("option", { key: item.id, value: item.id }, item.name + " (" + item.id + ")")),
            runForm.audit_policy_pack && !policyPacks.some((item) => item.id === runForm.audit_policy_pack) ? h("option", { key: runForm.audit_policy_pack, value: runForm.audit_policy_pack }, runForm.audit_policy_pack + " (custom)") : null
          ].filter(Boolean))),
          h(Field, { key: "provider", label: "Provider" }, Select({
            value: runForm.llm_provider,
            onChange: (event) => {
              const nextProvider = event.target.value;
              const nextDefinition = getProviderDefinition(llmRegistry, nextProvider);
              updateRunForm("llm_provider", nextProvider);
              updateRunForm("llm_model", nextDefinition?.default_model || "");
            }
          }, (llmRegistry.providers || []).map((item) => h("option", { key: item.id, value: item.id }, `${item.name} (${item.mode === "local_mock" ? "local mock" : "live api"})`)))),
          h(Field, { key: "model", label: "Model Preset" }, Select({
            value: runForm.llm_model || "",
            onChange: (event) => updateRunForm("llm_model", event.target.value)
          }, [
            h("option", { key: "provider-default", value: "" }, "provider default"),
            ...runModelOptions.map((item) => h("option", { key: item.id, value: item.id }, `${item.label} (${item.id})`))
          ])),
          selectedProvider?.supports_custom_model
            ? h(Field, { key: "model-custom", label: "Custom Model Override" }, h(Input, {
              value: runForm.llm_model || "",
              onChange: (event) => updateRunForm("llm_model", event.target.value),
              placeholder: "leave preset selected or enter a custom model id"
            }))
            : null,
          h(Field, { key: "preflight-strictness", label: "Preflight Strictness" }, Select({ value: runForm.preflight_strictness, onChange: (event) => updateRunForm("preflight_strictness", event.target.value) }, [
            h("option", { key: "standard", value: "standard" }, "standard"),
            h("option", { key: "strict", value: "strict" }, "strict"),
            h("option", { key: "lenient", value: "lenient" }, "lenient")
          ])),
          h(Field, { key: "runtime-allowed", label: "Runtime Validation" }, Select({ value: runForm.runtime_allowed, onChange: (event) => updateRunForm("runtime_allowed", event.target.value) }, [
            h("option", { key: "never", value: "never" }, "never"),
            h("option", { key: "targeted_only", value: "targeted_only" }, "targeted only"),
            h("option", { key: "allowed", value: "allowed" }, "allowed")
          ])),
          h(Field, { key: "review-severity", label: "Human Review Threshold" }, Select({ value: runForm.review_severity, onChange: (event) => updateRunForm("review_severity", event.target.value) }, [
            h("option", { key: "critical", value: "critical" }, "critical"),
            h("option", { key: "high", value: "high" }, "high"),
            h("option", { key: "medium", value: "medium" }, "medium"),
            h("option", { key: "low", value: "low" }, "low")
          ])),
          h(Field, { key: "review-visibility", label: "Default Visibility" }, Select({ value: runForm.review_visibility, onChange: (event) => updateRunForm("review_visibility", event.target.value) }, [
            h("option", { key: "public", value: "public" }, "public"),
            h("option", { key: "internal", value: "internal" }, "internal"),
            h("option", { key: "internal-only", value: "internal-only" }, "internal-only")
          ]))
        ]),
        h("div", { key: "provider-presets", className: "mt-4 flex flex-wrap gap-3" }, (llmRegistry.presets || []).map((preset) => h(Button, {
          key: preset.id,
          variant: preset.provider_id === runForm.llm_provider && (preset.model || "") === (runForm.llm_model || "") ? "secondary" : "outline",
          onClick: () => applyProviderPreset(preset.id, "run")
        }, preset.label))),
        selectedProvider ? h("div", { key: "provider-mode", className: cn("mt-4 rounded-2xl border px-4 py-3 text-sm", selectedProvider.mode === "local_mock" ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-sky-200 bg-sky-50/80 text-sky-900") }, [
          h("div", { key: "title", className: "font-medium" }, `${selectedProvider.name} (${selectedProvider.mode === "local_mock" ? "local mock" : "live api"})`),
          h("div", { key: "copy", className: "mt-1" }, selectedProvider.description),
          h("div", { key: "credential", className: "mt-2" }, launchReadiness.providerCredential.note),
          selectedProvider.notes?.length ? h("ul", { key: "notes", className: "mt-2 space-y-1 text-xs" }, selectedProvider.notes.map((item, index) => h("li", { key: `${index}:${item}` }, "- " + item))) : null
        ]) : null,
        h("div", { key: "target-hint", className: "mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, runForm.target_kind === "repo"
          ? "Use a repo URL when you want canonical GitHub/repository identity for scoring, outbound integrations, and repo-linked history."
          : runForm.target_kind === "endpoint"
            ? "Endpoint targets are best for black-box or hosted-service validation. Runtime checks matter more than repository evidence here."
            : "Local paths are ideal for self-hosted repos, local clones, and fixture-based regression checks."),
        launchReadiness.issues.length
          ? h("div", { key: "validation", className: "mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800" }, [
            h("div", { key: "title", className: "font-medium" }, "Launch Input Issues"),
            h("ul", { key: "list", className: "mt-2 space-y-1" }, launchReadiness.issues.map((item, index) => h("li", { key: index }, "- " + item)))
          ])
          : null,
        h("div", { key: "hint", className: "mt-4 text-sm text-muted" }, "Launch defaults inherit from effective settings and the current project's target defaults."),
        h("div", { key: "resolved-profile", className: "mt-4 rounded-2xl border border-border bg-stone-100/80 p-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium" }, "Resolved Launch Profile"),
          h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-2 text-muted" }, [
            h("div", { key: "target" }, "target: " + (runForm.target_kind === "repo" ? (runForm.repo_url || "unset") : runForm.target_kind === "endpoint" ? (runForm.endpoint_url || "unset") : (runForm.local_path || "unset"))),
            h("div", { key: "audit" }, "package: " + (runForm.audit_package || "unset")),
            h("div", { key: "policy" }, "policy pack: " + (runForm.audit_policy_pack || "default")),
            h("div", { key: "provider" }, "provider/model: " + runForm.llm_provider + (runForm.llm_model ? "/" + runForm.llm_model : "") + (selectedProvider ? ` (${selectedProvider.mode === "local_mock" ? "local mock" : "live api"})` : "")),
            h("div", { key: "preflight" }, "preflight: " + runForm.preflight_strictness + ", runtime " + runForm.runtime_allowed),
            h("div", { key: "review" }, "review: " + runForm.review_severity + " and above, " + runForm.review_visibility),
            h("div", { key: "cred" }, "provider credentials: " + (launchReadiness.providerCredential.configured ? "configured" : "not in persisted settings"))
          ])
        ]),
        h("div", { key: "readiness", className: "mt-4 rounded-2xl border border-border bg-white/70 p-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium" }, "Preflight And Launch Checklist"),
          h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-2 text-muted" }, [
            h("div", { key: "target-ok" }, "input validation: " + (launchReadiness.issues.length ? "needs fixes" : "ok")),
            h("div", { key: "preflight-status" }, "preflight: " + launchReadiness.preflightStatus.replace(/_/g, " ")),
            h("div", { key: "accepted" }, "accepted: " + (launchReadiness.accepted ? "yes" : "no")),
            h("div", { key: "warnings" }, "warnings: " + launchReadiness.warnings.length),
            h("div", { key: "blockers" }, "blockers: " + launchReadiness.blockers.length),
            h("div", { key: "drift" }, "recommended profile drift: " + (launchReadiness.profileDrift.length ? launchReadiness.profileDrift.join(", ") : "none"))
          ])
        ]),
        h("div", { key: "preflight-actions", className: "mt-5 flex flex-wrap gap-3" }, [
          h(Button, { key: "preflight", variant: "outline", onClick: runPreflight }, preflightLoading ? "Running Preflight..." : "Run Preflight"),
          h(Button, {
            key: "accept-preflight",
            variant: "secondary",
            onClick: acceptPreflight,
            disabled: !preflightSummary || preflightStale
          }, "Accept Preflight"),
          h(Button, {
            key: "apply-preflight",
            variant: "outline",
            onClick: applyPreflightRecommendations,
            disabled: !preflightSummary?.launch_profile || !launchReadiness.profileDrift.length
          }, "Apply Recommended Profile"),
          h(Button, {
            key: "button",
            disabled: !launchReadiness.canLaunch,
            onClick: () => act(
              () => api("/runs", {
                method: "POST",
                body: JSON.stringify(buildLaunchRunRequest(runForm, requestContext, {
                  preflightCheckedAt,
                  preflightAcceptedAt,
                  preflightStale
                }, effectiveSettings, llmRegistry))
              }, requestContext),
              "Run launched."
            )
          }, preflightSummary && !launchReadiness.accepted ? "Accept Preflight First" : "Start Run")
        ]),
        h("div", { key: "preflight-state", className: "mt-3 grid gap-2 md:grid-cols-2 text-sm text-muted" }, [
          h("div", { key: "checked" }, "checked: " + formatDate(preflightCheckedAt)),
          h("div", { key: "accepted" }, "accepted: " + formatDate(preflightAcceptedAt))
        ]),
        preflightSummary ? h("div", {
          key: "preflight-summary",
          className: cn(
            "mt-5 rounded-2xl border p-4 text-sm",
            preflightSummary.readiness.status === "blocked"
              ? "border-red-200 bg-red-50/70"
              : preflightSummary.readiness.status === "ready_with_warnings"
                ? "border-amber-200 bg-amber-50/70"
                : "border-emerald-200 bg-emerald-50/70"
          )
        }, [
          h("div", { key: "title", className: "flex items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "heading", className: "font-medium" }, "Preflight Summary"),
              h("div", { key: "sub", className: "text-xs uppercase tracking-[0.18em] text-muted" }, preflightSummary.readiness.status.replace(/_/g, " "))
            ]),
            h("div", { key: "badges", className: "flex flex-wrap gap-2" }, [
              preflightStale ? h(Badge, { key: "stale" }, "stale") : null,
              launchReadiness.accepted ? h(Badge, { key: "accepted" }, "accepted") : null
            ].filter(Boolean))
          ]),
          h("div", { key: "target-meta", className: "mt-3 grid gap-2 md:grid-cols-2 text-muted" }, [
            h("div", { key: "class" }, "target class: " + preflightSummary.target.target_class + " (" + Math.round((preflightSummary.target.confidence || 0) * 100) + "%)"),
            h("div", { key: "package" }, "recommended package: " + preflightSummary.recommended_audit_package.id),
            h("div", { key: "policy" }, "policy pack: " + (preflightSummary.selected_policy_pack.id || "default")),
            h("div", { key: "signals" }, "signals: " + preflightSummary.repo_signals.entry_points + " entrypoints, " + preflightSummary.repo_signals.agentic_markers + " agentic markers")
          ]),
          preflightSummary.launch_profile ? h("div", { key: "recommended-profile", className: "mt-3 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, [
            h("div", { key: "title", className: "font-medium text-foreground" }, "Recommended Launch Profile"),
            h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-2" }, [
              h("div", { key: "pkg" }, "package: " + (preflightSummary.launch_profile.audit_package || "default")),
              h("div", { key: "policy-pack" }, "policy pack: " + (preflightSummary.launch_profile.audit_policy_pack || "default")),
              h("div", { key: "mode" }, "run mode: " + (preflightSummary.launch_profile.run_mode || "default")),
              h("div", { key: "provider" }, "provider/model: " + (preflightSummary.launch_profile.llm_provider || "default") + (preflightSummary.launch_profile.llm_model ? "/" + preflightSummary.launch_profile.llm_model : "")),
              h("div", { key: "preflight-strictness" }, "preflight: " + (preflightSummary.launch_profile.preflight_strictness || "default")),
              h("div", { key: "runtime-allowed" }, "runtime: " + (preflightSummary.launch_profile.runtime_allowed || "default"))
            ])
          ]) : null,
          preflightSummary.readiness.blockers?.length ? h("div", { key: "blockers", className: "mt-3" }, [
            h("div", { key: "label", className: "font-medium text-red-700" }, "Blockers"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-red-700" }, preflightSummary.readiness.blockers.map((item, index) => h("li", { key: index }, "- " + item)))
          ]) : null,
          preflightSummary.readiness.warnings?.length ? h("div", { key: "warnings", className: "mt-3" }, [
            h("div", { key: "label", className: "font-medium text-amber-700" }, "Warnings"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-amber-800" }, preflightSummary.readiness.warnings.map((item, index) => h("li", { key: index }, "- " + item)))
          ]) : null,
          h("div", { key: "providers", className: "mt-3" }, [
            h("div", { key: "label", className: "font-medium" }, "Provider Readiness"),
            h("div", { key: "grid", className: "mt-2 grid gap-2 md:grid-cols-2" }, preflightSummary.provider_readiness.map((item) => h("div", {
              key: item.provider_id,
              className: "rounded-xl border border-border bg-white/70 px-3 py-2"
            }, [
              h("div", { key: "head", className: "flex items-center justify-between gap-2" }, [
                h("div", { key: "name", className: "font-medium" }, item.provider_id),
                h(Badge, { key: "status" }, item.status)
              ]),
              h("div", { key: "summary", className: "mt-1 text-muted" }, item.summary)
            ])))
          ]),
          h("div", { key: "evidence", className: "mt-3 text-muted" }, [
            h("div", { key: "label", className: "font-medium text-foreground" }, "Classification Evidence"),
            h("ul", { key: "list", className: "mt-2 space-y-1" }, (preflightSummary.target.evidence || []).map((item, index) => h("li", { key: index }, "- " + item)))
          ])
        ]) : h("div", { key: "preflight-empty", className: "mt-5 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted" }, "Run preflight to verify target readiness, provider availability, and the planned audit profile before launch.")
      ]);
  const dashboard = h("div", { className: "space-y-6" }, [
    h("div", { key: "kpis", className: "grid gap-4 lg:grid-cols-4" }, [
      h(DashboardKpiCard, { key: "runs", label: "Total Runs", value: String(stats.runs.total_runs || runs.length), hint: "Persisted audit history", tone: "blue" }),
      h(DashboardKpiCard, { key: "reviews", label: "Pending Reviews", value: String(pendingReviews.length), hint: `${overdueReviews} overdue`, tone: "amber" }),
      h(DashboardKpiCard, { key: "score", label: "Avg Security Score", value: averageScore, hint: "Average overall score across scored runs", tone: "emerald" }),
      h(DashboardKpiCard, { key: "followups", label: "Open Follow-ups", value: String(openRuntimeFollowups), hint: `${successfulRuns} successful runs`, tone: "slate" })
    ]),
    h("div", { key: "middle", className: "grid gap-6 xl:grid-cols-[1.6fr_0.75fr]" }, [
      h(DashboardTrendCard, {
        key: "trend",
        title: "Security Posture",
        subtitle: "Average run score over the last six months for the current workspace and project.",
        series: postureSeries
      }),
      h(Card, { key: "review-health", title: "Review Health", description: "Second-row companion card: queue quality and operator workload." , className: "border-slate-200 bg-white shadow-sm" }, [
        h("div", { key: "summary", className: "text-4xl font-semibold tracking-tight text-slate-950" }, String(pendingReviews.length)),
        h("div", { key: "copy", className: "mt-2 text-sm text-slate-500" }, pendingReviews.length ? "Open review items currently require attention." : "Review queue is currently clear."),
        h("div", { key: "bars", className: "mt-6 space-y-5" }, [
          h("div", { key: "overdue" }, [
            h("div", { key: "row", className: "flex items-center justify-between text-sm" }, [
              h("span", { key: "label", className: "text-slate-600" }, "Overdue reviews"),
              h("span", { key: "value", className: "font-medium text-slate-900" }, String(overdueReviews))
            ]),
            h("div", { key: "track", className: "mt-2 h-2 rounded-full bg-slate-100" }, h("div", {
              className: "h-2 rounded-full bg-amber-500",
              style: { width: `${pendingReviews.length ? Math.min(100, (overdueReviews / pendingReviews.length) * 100) : 0}%` }
            }))
          ]),
          h("div", { key: "age" }, [
            h("div", { key: "row", className: "flex items-center justify-between text-sm" }, [
              h("span", { key: "label", className: "text-slate-600" }, "Average review age"),
              h("span", { key: "value", className: "font-medium text-slate-900" }, averageReviewAgeHours)
            ]),
            h("div", { key: "track", className: "mt-2 h-2 rounded-full bg-slate-100" }, h("div", {
              className: "h-2 rounded-full bg-sky-500",
              style: { width: `${Math.min(100, pendingReviews.length ? (overdueReviews / Math.max(1, pendingReviews.length)) * 100 + 20 : 10)}%` }
            }))
          ]),
          h("div", { key: "actions", className: "grid gap-3 pt-2" }, [
            h(Button, { key: "reviews", onClick: () => setView("reviews") }, "Open Review Inbox"),
            h(Button, { key: "runs", variant: "outline", onClick: () => setView("runs") }, "Open Runs Workspace")
          ])
        ])
      ])
    ]),
    h(Card, { key: "recent-runs", title: "Recent Runs", description: "Latest persisted runs for the current workspace and project.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "toolbar", className: "mb-4 flex items-center justify-between gap-3" }, [
        h("div", { key: "meta", className: "text-sm text-slate-500" }, `${recentRuns.length} recent run${recentRuns.length === 1 ? "" : "s"} shown`),
        h(Button, { key: "open-all", variant: "outline", onClick: () => setView("runs") }, "View All Runs")
      ]),
      recentRuns.length
        ? h("div", { key: "table", className: "overflow-x-auto rounded-2xl border border-slate-200" }, h("table", { className: "w-full text-sm" }, [
            h("thead", { key: "head", className: "bg-slate-50" }, h("tr", { className: "text-left text-xs uppercase tracking-[0.18em] text-slate-500" }, [
              h("th", { key: "target", className: "px-4 py-3" }, "Target"),
              h("th", { key: "status", className: "px-4 py-3" }, "Status"),
              h("th", { key: "review", className: "px-4 py-3" }, "Review"),
              h("th", { key: "score", className: "px-4 py-3" }, "Score"),
              h("th", { key: "created", className: "px-4 py-3" }, "Created")
            ])),
            h("tbody", { key: "body" }, recentRuns.map((run) => h("tr", {
              key: run.id,
              className: "cursor-pointer border-t border-slate-200 hover:bg-slate-50",
              onClick: () => {
                setView("runs");
                setSelectedRunId(run.id);
              }
            }, [
              h("td", { key: "target", className: "px-4 py-4" }, [
                h("div", { key: "name", className: "font-medium text-slate-900" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
                h("div", { key: "id", className: "mt-1 text-xs text-slate-500" }, run.audit_package || "default package")
              ]),
              h("td", { key: "status", className: "px-4 py-4" }, h(Badge, null, run.status)),
              h("td", { key: "review", className: "px-4 py-4" }, h(Badge, null, run.review_workflow?.status || "none")),
              h("td", { key: "score", className: "px-4 py-4 font-medium text-slate-900" }, Number.isFinite(Number(run.overall_score)) ? String(Number(run.overall_score).toFixed(1)) : "n/a"),
              h("td", { key: "created", className: "px-4 py-4 text-slate-500" }, formatDate(run.created_at))
            ])))
          ]))
        : h("div", { key: "empty", className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No runs available for the current scope.")
    ])
  ]);

  const jobsView = h(Card, { title: "Async Jobs", description: "Durable queued work with retry and cancel controls." }, jobs.length ? jobs.map((job) => h("div", {
    key: job.job_id,
    className: "mb-3 flex flex-col gap-4 rounded-2xl border border-border bg-white/70 p-4 lg:flex-row lg:items-center lg:justify-between"
  }, [
    h("div", { key: "copy" }, [
      h("div", { key: "id", className: "font-medium" }, job.job_id),
      h("div", { key: "detail", className: "text-sm text-muted" }, "Attempt " + job.latest_attempt_number + " - webhook " + (job.completion_webhook_status || "none"))
    ]),
    h("div", { key: "actions", className: "flex items-center gap-3" }, [
      h(Badge, { key: "status" }, job.status),
      h(Button, { key: "cancel", variant: "outline", onClick: () => act(() => api("/runs/async/" + encodeURIComponent(job.job_id) + "/cancel", { method: "POST", body: "{}" }, requestContext), "Job cancel submitted.") }, "Cancel"),
      h(Button, { key: "retry", onClick: () => act(() => api("/runs/async/" + encodeURIComponent(job.job_id) + "/retry", { method: "POST", body: "{}" }, requestContext), "Job retry submitted.") }, "Retry")
    ])
  ])) : h("div", { className: "text-sm text-muted" }, "No async jobs recorded."));

  const runsDetailPane = h(RunDetailPanel, {
    key: "detail",
    detail: selectedRunDetail,
    loading: selectedRunLoading,
    comparison: selectedRunComparison,
    comparisonLoading: selectedRunComparisonLoading,
    effectiveSettings,
    comparisonDetail: comparisonRunDetail,
    comparisonDetailLoading: comparisonRunLoading,
    selectedFindingId,
    selectedComparisonFindingId,
    reviewAssignee,
    findingReviewState,
    onSelectFinding: setSelectedFindingId,
    onSelectComparisonFinding: setSelectedComparisonFindingId,
    onSelectComparisonPair: selectComparisonPair,
    onReviewAssigneeChange: setReviewAssignee,
    onAssignReviewer: assignReviewer,
    onRunReviewAction: runReviewAction,
    onFindingReviewStateChange: updateFindingReviewState,
    onFindingReviewAction: findingReviewAction,
    onFindingDispositionAction: findingDispositionAction,
    onEditFindingDisposition: beginDispositionEdit,
    onSaveFindingDispositionEdit: saveDispositionEdit,
    onRevokeFindingDisposition: revokeDisposition,
    reviewComments: selectedRunDetail?.reviewComments?.review_comments || [],
    commentBody: reviewCommentBody,
    commentFindingId: reviewCommentFindingId,
    onCommentBodyChange: setReviewCommentBody,
    onCommentFindingChange: setReviewCommentFindingId,
    onSubmitComment: submitReviewComment,
    onExportReviewAudit: exportReviewAudit,
    onExportExecutiveReport: exportExecutiveReport,
    onExportMarkdownReport: exportMarkdownReport,
    onExportSarifReport: exportSarifReport,
    onDownloadIndexedRunExport: downloadIndexedRunExport,
    compareRunId,
    onCompareRunIdChange: setCompareRunId,
    onExportComparisonReport: exportComparisonReport,
    onApproveOutbound: approveOutboundSharing,
    onPrepareOutboundSend: prepareOutboundSend,
    onVerifyOutbound: verifyOutboundAccess,
    onExecuteOutboundDelivery: executeOutboundDelivery,
    onLaunchRuntimeFollowup: launchRuntimeFollowup,
    outboundActionType,
    outboundTargetNumber,
    onOutboundActionTypeChange: setOutboundActionType,
    onOutboundTargetNumberChange: setOutboundTargetNumber
  });

  const runsLaunchModal = h(LaunchAuditModal, {
    key: "launch-modal",
    open: launchModalOpen,
    onClose: () => setLaunchModalOpen(false),
    requestContext,
    currentProject,
    runForm,
    updateRunForm,
    auditPackages,
    policyPacks,
    llmRegistry,
    runModelOptions,
    selectedProvider,
    launchReadiness,
    preflightSummary,
    preflightStale,
    preflightCheckedAt,
    preflightAcceptedAt,
    preflightLoading,
    applyProviderPreset,
    runPreflight,
    acceptPreflight,
    applyPreflightRecommendations,
    launchRun
  });

  const runsView = window.TethermarkFeatures?.RunsWorkspace
    ? h(window.TethermarkFeatures.RunsWorkspace, {
      runs,
      selectedRunId,
      onSelectRun: setSelectedRunId,
      onOpenLaunch: () => setLaunchModalOpen(true),
      onOpenReviews: () => setView("reviews"),
      detailPane: runsDetailPane,
      launchModal: runsLaunchModal,
      helpers: {
        Button,
        formatDate,
        cn,
        Badge,
        runtimeFollowupCount
      }
    })
    : h("div", { className: "h-screen overflow-hidden" }, [
      h("div", { key: "workspace", className: "grid h-full overflow-hidden border border-slate-200 bg-white xl:grid-cols-[420px_1fr]" }, [
        h("section", { key: "queue", className: "flex min-h-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r" }, [
          h("div", { key: "queue-header", className: "border-b border-slate-200 px-5 py-5" }, [
            h("div", { key: "top", className: "flex items-start justify-between gap-4" }, [
              h("div", { key: "copy" }, [
                h("h2", { key: "title", className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Runs Inbox"),
                h("p", { key: "desc", className: "mt-2 text-sm leading-6 text-slate-500" }, "Select a run from the queue, inspect the selected run on the right, and launch new audits from a dedicated modal.")
              ]),
              h("div", { key: "actions", className: "flex shrink-0 flex-wrap gap-3" }, [
                h(Button, { key: "launch", onClick: () => setLaunchModalOpen(true) }, "Launch Audit"),
                h(Button, { key: "reviews", variant: "outline", onClick: () => setView("reviews") }, "Open Reviews")
              ])
            ]),
            h("div", { key: "queue-meta", className: "mt-4 flex items-center justify-between gap-3 text-sm text-slate-500" }, [
              h("div", { key: "count" }, `${runs.length} run${runs.length === 1 ? "" : "s"} in current scope`),
              h("div", { key: "latest" }, runs[0]?.created_at ? `Latest ${formatDate(runs[0].created_at)}` : "No recent activity")
            ])
          ]),
          h("div", { key: "queue-list", className: "min-h-0 flex-1 overflow-y-auto" }, h(RunInboxList, {
            runs,
            selectedRunId,
            onSelect: setSelectedRunId
          }))
        ]),
        h("section", { key: "detail-pane", className: "min-w-0 overflow-y-auto bg-slate-50 px-5 py-5" }, runsDetailPane)
      ]),
      runsLaunchModal
    ]);

  const reviewsView = h("div", { className: "grid gap-6 xl:grid-cols-[0.9fr_1.1fr]" }, [
    h("div", { key: "left", className: "space-y-6" }, [
      h("div", { key: "review-summary", className: "grid gap-4 md:grid-cols-4" }, [
        h("div", { key: "open", className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" }, [
          h("div", { key: "label", className: "text-xs uppercase tracking-[0.18em] text-slate-400" }, "Open Queue"),
          h("div", { key: "value", className: "mt-3 text-3xl font-semibold tracking-tight text-slate-950" }, String(pendingReviews.length))
        ]),
        h("div", { key: "overdue", className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" }, [
          h("div", { key: "label", className: "text-xs uppercase tracking-[0.18em] text-slate-400" }, "Overdue"),
          h("div", { key: "value", className: "mt-3 text-3xl font-semibold tracking-tight text-slate-950" }, String(overdueReviews))
        ]),
        h("div", { key: "mine", className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" }, [
          h("div", { key: "label", className: "text-xs uppercase tracking-[0.18em] text-slate-400" }, "Assigned To Me"),
          h("div", { key: "value", className: "mt-3 text-3xl font-semibold tracking-tight text-slate-950" }, String(pendingReviews.filter((run) => (run.review_workflow?.current_reviewer_id || "") === (requestContext.actorId || "")).length))
        ]),
        h("div", { key: "followup", className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" }, [
          h("div", { key: "label", className: "text-xs uppercase tracking-[0.18em] text-slate-400" }, "Runtime Follow-up"),
          h("div", { key: "value", className: "mt-3 text-3xl font-semibold tracking-tight text-slate-950" }, String(pendingReviews.filter((run) => runtimeFollowupCount(run) > 0).length))
        ])
      ]),
      h(Card, { key: "queue-controls", title: "Review Inbox", description: "Filter the queue by ownership, urgency, and rerun pressure.", className: "border-slate-200 bg-white shadow-sm" }, [
        h("div", { key: "controls", className: "grid gap-4 md:grid-cols-[220px_1fr]" }, [
          h(Field, { key: "filter", label: "Queue Filter" }, h(Select, {
            value: reviewFilter,
            onChange: (event) => setReviewFilter(event.target.value)
          }, [
            h("option", { key: "mine", value: "my_assigned" }, "my assigned"),
            h("option", { key: "unread", value: "unread_assignments" }, "unread assignments"),
            h("option", { key: "reviewing", value: "in_review" }, "in review"),
            h("option", { key: "overdue", value: "overdue" }, "overdue"),
            h("option", { key: "due-soon", value: "due_soon" }, "due soon"),
            h("option", { key: "runtime-followup", value: "runtime_followup" }, "runtime follow-up"),
            h("option", { key: "disposition", value: "needs_disposition_review" }, "needs disposition re-review"),
            h("option", { key: "rerun", value: "needs_rerun" }, "needs rerun"),
            h("option", { key: "all", value: "all" }, "all open reviews")
          ])),
          h("div", { key: "chips", className: "grid gap-3 md:grid-cols-4" }, [
            h("div", { key: "age", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, `Average age: ${averageReviewAgeHours}`),
            h("div", { key: "unread", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, `Unread: ${reviewNotifications.filter((item) => item.status === "unread").length}`),
            h("div", { key: "due", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, `Due soon: ${pendingReviews.filter((run) => dispositionDueSoonCount(run) > 0).length}`),
            h("div", { key: "disposition", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, `Re-review: ${pendingReviews.filter((run) => Number(run.review_summary_counts?.findings_needing_disposition_review_count || 0) > 0).length}`)
          ])
        ]),
        h("div", { key: "queue", className: "mt-5" }, h(ReviewQueueList, {
          runs: filteredPendingReviews,
          selectedRunId,
          onSelect: setSelectedRunId,
          actorId: requestContext.actorId
        }))
      ]),
      h(Card, { key: "notifications", title: "My Review Notifications", description: "Unread and acknowledged review assignments for the current actor.", className: "border-slate-200 bg-white shadow-sm" }, reviewNotifications.length
        ? h("div", { className: "space-y-3" }, reviewNotifications.map((item) => h("div", {
          key: item.id,
          className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        }, [
          h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "message", className: "font-medium text-slate-900" }, item.message),
              h("div", { key: "meta", className: "text-sm text-slate-500" }, `${item.notification_type} • ${item.run_id} • ${formatDate(item.created_at)}`)
            ]),
            h(Badge, { key: "status" }, item.status)
          ]),
          item.status === "unread" ? h(Button, {
            key: "ack",
            variant: "outline",
            className: "mt-3",
            onClick: () => acknowledgeNotification(item.id)
          }, "Acknowledge") : null
        ])))
        : h("div", { className: "text-sm text-muted" }, "No review notifications for the current actor.")),
        h(Card, { key: "runtime-followup-queue", title: "Runtime Follow-up Queue", description: "Pending and linked rerun work items derived from runtime-sensitive findings.", className: "border-slate-200 bg-white shadow-sm" }, runtimeFollowups.length
          ? h("div", { className: "space-y-3" }, runtimeFollowups.map((item) => h("div", {
            key: item.id,
            className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          }, [
            h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "title", className: "font-medium text-slate-900" }, item.finding_title || item.finding_id),
                h("div", { key: "meta", className: "text-sm text-slate-500" }, `${item.run_id} • ${item.followup_policy} • ${formatDate(item.requested_at)}`)
              ]),
              h(Badge, { key: "status" }, item.status)
            ]),
            h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-3" }, [
              h(Button, { key: "open", variant: "outline", onClick: () => setSelectedRunId(item.run_id) }, "Open Run"),
              item.rerun_request_json && (item.status === "pending" || item.status === "completed")
                ? h(Button, { key: "launch", onClick: () => launchRuntimeFollowup(item.id) }, "Launch Rerun")
                : null
            ].filter(Boolean))
          ])))
          : h("div", { className: "text-sm text-muted" }, "No runtime follow-up work items in the current scope.")),
    ]),
    h(RunDetailPanel, {
      key: "detail",
      detail: selectedRunDetail,
      loading: selectedRunLoading,
      comparison: selectedRunComparison,
      comparisonLoading: selectedRunComparisonLoading,
      effectiveSettings,
      comparisonDetail: comparisonRunDetail,
      comparisonDetailLoading: comparisonRunLoading,
      selectedFindingId,
      selectedComparisonFindingId,
      reviewAssignee,
      findingReviewState,
      onSelectFinding: setSelectedFindingId,
      onSelectComparisonFinding: setSelectedComparisonFindingId,
      onSelectComparisonPair: selectComparisonPair,
      onReviewAssigneeChange: setReviewAssignee,
      onAssignReviewer: assignReviewer,
      onRunReviewAction: runReviewAction,
      onFindingReviewStateChange: updateFindingReviewState,
      onFindingReviewAction: findingReviewAction,
      onFindingDispositionAction: findingDispositionAction,
      onEditFindingDisposition: beginDispositionEdit,
      onSaveFindingDispositionEdit: saveDispositionEdit,
      onRevokeFindingDisposition: revokeDisposition,
      reviewComments: selectedRunDetail?.reviewComments?.review_comments || [],
      commentBody: reviewCommentBody,
      commentFindingId: reviewCommentFindingId,
      onCommentBodyChange: setReviewCommentBody,
      onCommentFindingChange: setReviewCommentFindingId,
      onSubmitComment: submitReviewComment,
      onExportReviewAudit: exportReviewAudit,
      onExportExecutiveReport: exportExecutiveReport,
      onExportMarkdownReport: exportMarkdownReport,
      onExportSarifReport: exportSarifReport,
      onDownloadIndexedRunExport: downloadIndexedRunExport,
      compareRunId,
      onCompareRunIdChange: setCompareRunId,
      onExportComparisonReport: exportComparisonReport,
      onApproveOutbound: approveOutboundSharing,
        onPrepareOutboundSend: prepareOutboundSend,
        onVerifyOutbound: verifyOutboundAccess,
        onExecuteOutboundDelivery: executeOutboundDelivery,
        onLaunchRuntimeFollowup: launchRuntimeFollowup,
        outboundActionType,
      outboundTargetNumber,
      onOutboundActionTypeChange: setOutboundActionType,
      onOutboundTargetNumberChange: setOutboundTargetNumber
    })
  ]);

  const runtimeFollowupsView = h(RuntimeFollowupWorkspace, {
    followups: runtimeFollowups,
    filter: runtimeFollowupFilter,
    onFilterChange: setRuntimeFollowupFilter,
    selectedFollowupId: selectedRuntimeFollowupId,
    onSelectFollowup: selectRuntimeFollowup,
    selectedFollowupIds: selectedRuntimeFollowupIds,
    onToggleFollowupSelection: toggleRuntimeFollowupSelection,
    onSelectAllFiltered: selectAllRuntimeFollowups,
    onClearFollowupSelection: clearRuntimeFollowupSelection,
    sourceRunDetail: selectedRunDetail,
    rerunRunDetail: linkedRuntimeRerunDetail,
    rerunLoading: linkedRuntimeRerunLoading,
    onOpenSourceRun: openRuntimeFollowupSource,
    onLaunchRuntimeFollowup: launchRuntimeFollowup,
    onAdoptRerunOutcome: adoptRuntimeFollowupOutcome,
    onExportQueue: exportRuntimeFollowupQueue,
    onExportFollowupReport: exportRuntimeFollowupBundle,
    onBulkAdoptConfirmed: (items) => bulkRuntimeFollowupAction(items, "adopt_rerun_outcome"),
    onBulkManualReview: (items) => bulkRuntimeFollowupAction(items, "mark_manual_runtime_review_complete"),
    onBulkAcceptWithoutRuntimeValidation: (items) => bulkRuntimeFollowupAction(items, "accept_without_runtime_validation")
  });

  const settingsView = h("div", { className: "grid gap-6 xl:grid-cols-[1.05fr_0.95fr]" }, [
    h(Card, { key: "settings", title: "Engine Settings", description: "Persisted provider, audit, preflight, review, and integration defaults." }, [
      h("div", { key: "scopeLevel", className: "mb-4 grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "edit-scope", label: "Edit Scope" }, Select({ value: settingsScopeLevel, onChange: (event) => setSettingsScopeLevel(event.target.value) }, [
          h("option", { key: "global", value: "global" }, "global defaults"),
          h("option", { key: "workspace", value: "workspace" }, "workspace defaults"),
          h("option", { key: "project", value: "project" }, "project overrides")
        ])),
        h(Field, { key: "effective-package", label: "Effective Package" }, h(Input, { value: effectiveSettings.effective.audit_defaults_json.audit_package || "", readOnly: true }))
      ]),
      h("div", { key: "provider-presets", className: "mb-4 flex flex-wrap gap-3" }, (llmRegistry.presets || []).map((preset) => h(Button, {
        key: preset.id,
        variant: preset.provider_id === (settings.providers_json.default_provider || "mock") && (preset.model || "") === (settings.providers_json.default_model || "") ? "secondary" : "outline",
        onClick: () => applyProviderPreset(preset.id, "settings")
      }, preset.label))),
      settingsProvider ? h("div", { key: "provider-summary", className: cn("mb-4 rounded-2xl border px-4 py-3 text-sm", settingsProvider.mode === "local_mock" ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-sky-200 bg-sky-50/80 text-sky-900") }, [
        h("div", { key: "title", className: "font-medium" }, `${settingsProvider.name} default (${settingsProvider.mode === "local_mock" ? "local mock" : "live api"})`),
        h("div", { key: "copy", className: "mt-1" }, settingsProvider.description),
        h("div", { key: "cred", className: "mt-2" }, getProviderCredentialStatus(llmRegistry, settings.providers_json.default_provider || "mock", effectiveSettings).note),
        settingsProviderCredentialFields.length
          ? h("div", { key: "cred-fields", className: "mt-3 grid gap-3 md:grid-cols-2" }, settingsProviderCredentialFields.map((field) => {
            const status = getProviderCredentialFieldStatus(llmRegistry, settings.providers_json.default_provider || "mock", field.id);
            const persistedOverride = settings.credentials_json?.[field.id];
            const persistedHere = typeof persistedOverride === "string" ? persistedOverride.trim().length > 0 : Boolean(persistedOverride);
            const draftValue = providerCredentialDrafts[field.id] || "";
            return h("div", {
              key: field.id,
              className: "rounded-2xl border border-current/20 bg-white/70 px-4 py-3"
            }, [
              h("div", { key: "label", className: "font-medium text-foreground" }, field.label),
              field.help_text ? h("div", { key: "help", className: "mt-1 text-xs text-muted" }, field.help_text) : null,
              h("div", { key: "status", className: "mt-2 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, status?.note || "No credential metadata available."),
              h(Input, {
                key: "input",
                type: field.secret ? "password" : "text",
                value: field.secret ? draftValue : (settings.credentials_json?.[field.id] || ""),
                onChange: (event) => field.secret
                  ? updateProviderCredentialDraft(field.id, event.target.value)
                  : updateSettings("credentials_json", field.id, event.target.value || null),
                placeholder: field.secret
                  ? (persistedHere ? `stored value present${status?.source === "environment" ? " and env fallback available" : ""}; enter a new value to replace` : field.placeholder || "")
                  : (field.placeholder || "")
              }),
              h("div", { key: "controls", className: "mt-3 flex flex-wrap gap-2" }, [
                field.secret && draftValue
                  ? h("div", { key: "pending", className: "text-xs text-emerald-700" }, "Pending replacement will be saved.")
                  : null,
                field.secret
                  ? h(Button, {
                    key: "clear-draft",
                    variant: "outline",
                    onClick: () => updateProviderCredentialDraft(field.id, "")
                  }, "Clear Draft")
                  : null,
                h(Button, {
                  key: "remove",
                  variant: "outline",
                  onClick: () => {
                    updateSettings("credentials_json", field.id, null);
                    updateProviderCredentialDraft(field.id, "");
                  },
                  disabled: !persistedHere && status?.source !== "persisted"
                }, status?.source === "persisted" || persistedHere ? "Clear Persisted Override" : "No Persisted Override")
              ].filter(Boolean)),
              field.env_var ? h("div", { key: "env", className: "mt-2 text-xs text-muted" }, `Env fallback: ${field.env_var}`) : null
            ]);
          }))
          : null
      ]) : null,
      h("div", { key: "integration-cards", className: "mb-4 grid gap-4 lg:grid-cols-2" }, [githubIntegration, genericWebhookIntegration].filter(Boolean).map((integration) => {
        const integrationStatus = getIntegrationCredentialStatus(integrationRegistry, integration.id);
        return h("div", {
          key: integration.id,
          className: cn(
            "rounded-2xl border px-4 py-4 text-sm",
            integrationStatus?.enabled
              ? integrationStatus?.configured
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                : "border-amber-200 bg-amber-50/80 text-amber-900"
              : "border-border bg-white/70 text-foreground"
          )
        }, [
          h("div", { key: "title", className: "font-medium" }, integration.name),
          h("div", { key: "copy", className: "mt-1" }, integration.description),
          h("div", { key: "status", className: "mt-2 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, integrationStatus?.note || "No integration status available."),
          h("div", { key: "fields", className: "mt-3 grid gap-3" }, getIntegrationCredentialFields(integrationRegistry, integration.id).map((field) => {
            const status = getIntegrationCredentialFieldStatus(integrationRegistry, integration.id, field.id);
            const persistedSection = field.location === "credentials" ? settings.credentials_json : settings.integrations_json;
            const persistedOverride = persistedSection?.[field.id];
            const persistedHere = typeof persistedOverride === "string" ? persistedOverride.trim().length > 0 : Boolean(persistedOverride);
            const draftValue = integrationCredentialDrafts[field.id] || "";
            return h("div", {
              key: field.id,
              className: "rounded-2xl border border-current/20 bg-white/70 px-4 py-3"
            }, [
              h("div", { key: "label", className: "font-medium text-foreground" }, field.label),
              field.help_text ? h("div", { key: "help", className: "mt-1 text-xs text-muted" }, field.help_text) : null,
              h("div", { key: "field-status", className: "mt-2 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, status?.note || "No field status available."),
              h(Input, {
                key: "input",
                type: field.secret ? "password" : "text",
                value: field.secret ? draftValue : (persistedSection?.[field.id] || ""),
                onChange: (event) => field.secret
                  ? updateIntegrationCredentialDraft(field.id, event.target.value)
                  : updateSettings(field.location === "credentials" ? "credentials_json" : "integrations_json", field.id, event.target.value || null),
                placeholder: field.secret
                  ? (persistedHere ? `stored value present${status?.source === "environment" ? " and env fallback available" : ""}; enter a new value to replace` : field.placeholder || "")
                  : (field.placeholder || "")
              }),
              h("div", { key: "controls", className: "mt-3 flex flex-wrap gap-2" }, [
                field.secret && draftValue
                  ? h("div", { key: "pending", className: "text-xs text-emerald-700" }, "Pending replacement will be saved.")
                  : null,
                field.secret
                  ? h(Button, {
                    key: "clear-draft",
                    variant: "outline",
                    onClick: () => updateIntegrationCredentialDraft(field.id, "")
                  }, "Clear Draft")
                  : null,
                h(Button, {
                  key: "remove",
                  variant: "outline",
                  onClick: () => {
                    updateSettings(field.location === "credentials" ? "credentials_json" : "integrations_json", field.id, null);
                    updateIntegrationCredentialDraft(field.id, "");
                  },
                  disabled: !persistedHere && status?.source !== "persisted"
                }, status?.source === "persisted" || persistedHere ? "Clear Persisted Override" : "No Persisted Override")
              ].filter(Boolean)),
              field.env_var ? h("div", { key: "env", className: "mt-2 text-xs text-muted" }, `Env fallback: ${field.env_var}`) : null
            ]);
          }))
        ]);
      })),
      h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "provider", label: "Default Provider" }, Select({
          value: settings.providers_json.default_provider || "mock",
          onChange: (event) => {
            const nextProvider = event.target.value;
            const nextDefinition = getProviderDefinition(llmRegistry, nextProvider);
            updateSettings("providers_json", "default_provider", nextProvider);
            updateSettings("providers_json", "default_model", nextDefinition?.default_model || "");
          }
        }, (llmRegistry.providers || []).map((item) => h("option", { key: item.id, value: item.id }, `${item.name} (${item.mode === "local_mock" ? "local mock" : "live api"})`)))),
        h(Field, { key: "model", label: "Default Model Preset" }, Select({
          value: settings.providers_json.default_model || "",
          onChange: (event) => updateSettings("providers_json", "default_model", event.target.value)
        }, [
          h("option", { key: "provider-default", value: "" }, "provider default"),
          ...settingsModelOptions.map((item) => h("option", { key: item.id, value: item.id }, `${item.label} (${item.id})`))
        ])),
        settingsProvider?.supports_custom_model
          ? h(Field, { key: "model-custom", label: "Custom Default Model" }, h(Input, {
            value: settings.providers_json.default_model || "",
            onChange: (event) => updateSettings("providers_json", "default_model", event.target.value),
            placeholder: "optional custom model id"
          }))
          : null,
        h(Field, { key: "package", label: "Audit Package" }, Select({
          value: settings.audit_defaults_json.audit_package || "",
          onChange: (event) => updateSettings("audit_defaults_json", "audit_package", event.target.value)
        }, [
          ...auditPackages.map((item) => h("option", { key: item.id, value: item.id }, item.title + " (" + item.id + ")")),
          settings.audit_defaults_json.audit_package && !auditPackages.some((item) => item.id === settings.audit_defaults_json.audit_package)
            ? h("option", { key: settings.audit_defaults_json.audit_package, value: settings.audit_defaults_json.audit_package }, settings.audit_defaults_json.audit_package + " (custom)")
            : null
        ].filter(Boolean))),
        h(Field, { key: "mode", label: "Run Mode" }, Select({ value: normalizeRunModeSelection(settings.audit_defaults_json.run_mode) || "static", onChange: (event) => updateSettings("audit_defaults_json", "run_mode", event.target.value) }, [
          h("option", { key: "auto", value: "auto" }, "auto"),
          h("option", { key: "static", value: "static" }, "static"),
          h("option", { key: "runtime", value: "runtime" }, "runtime")
        ])),
        h(Field, { key: "review-renewal", label: "Disposition Renewal Days" }, h(Input, {
          type: "number",
          min: 1,
          value: settings.review_json.disposition_renewal_days || 30,
          onChange: (event) => updateSettings("review_json", "disposition_renewal_days", Math.max(1, Number(event.target.value || 30)))
        })),
        h(Field, { key: "review-window", label: "Waiver Review Window Days" }, h(Input, {
          type: "number",
          min: 1,
          value: settings.review_json.disposition_review_window_days || 30,
          onChange: (event) => updateSettings("review_json", "disposition_review_window_days", Math.max(1, Number(event.target.value || 30)))
        })),
        h(Field, { key: "completion-webhook", label: "Async Completion Webhook" }, h(Input, { value: settings.integrations_json.completion_webhook_url || "", onChange: (event) => updateSettings("integrations_json", "completion_webhook_url", event.target.value || null) })),
        h(Field, { key: "generic-webhook-events", label: "Generic Webhook Events" }, h(Textarea, {
          value: (settings.integrations_json.generic_webhook_events || []).join("\n"),
          onChange: (event) => updateSettings("integrations_json", "generic_webhook_events", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))
        })),
        h(Field, { key: "github-mode", label: "GitHub Outbound Mode" }, Select({ value: settings.integrations_json.github_mode || "disabled", onChange: (event) => updateSettings("integrations_json", "github_mode", event.target.value) }, [
          h("option", { key: "disabled", value: "disabled" }, "disabled"),
          h("option", { key: "manual", value: "manual" }, "manual"),
          h("option", { key: "project_opt_in", value: "project_opt_in" }, "project_opt_in"),
          h("option", { key: "workspace_default", value: "workspace_default" }, "workspace_default")
        ])),
        h(Field, { key: "github-actions", label: "GitHub Allowed Actions" }, h(Textarea, {
          value: (settings.integrations_json.github_allowed_actions || []).join("\n"),
          onChange: (event) => updateSettings("integrations_json", "github_allowed_actions", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))
        })),
        h(Field, { key: "github-owned-prefixes", label: "Owned Repo Prefixes" }, h(Textarea, {
          value: (settings.integrations_json.github_owned_repo_prefixes || []).join("\n"),
          onChange: (event) => updateSettings("integrations_json", "github_owned_repo_prefixes", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))
        })),
        h(Field, { key: "github-owned-only", label: "Owned Repositories Only" }, Select({ value: String(settings.integrations_json.github_owned_repo_only !== false), onChange: (event) => updateSettings("integrations_json", "github_owned_repo_only", event.target.value === "true") }, [
          h("option", { key: "true", value: "true" }, "true"),
          h("option", { key: "false", value: "false" }, "false")
        ])),
        h(Field, { key: "github-approval", label: "Per-Run Approval Required" }, Select({ value: String(settings.integrations_json.github_require_per_run_approval !== false), onChange: (event) => updateSettings("integrations_json", "github_require_per_run_approval", event.target.value === "true") }, [
          h("option", { key: "true", value: "true" }, "true"),
          h("option", { key: "false", value: "false" }, "false")
        ])),
        h(Field, { key: "endpoints", label: "Configured Endpoints" }, h(Textarea, { value: (settings.credentials_json.configured_endpoints || []).join("\n"), onChange: (event) => updateSettings("credentials_json", "configured_endpoints", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)) }))
      ]),
      h(Button, {
        key: "save",
        className: "mt-5",
        onClick: () => act(
          () => api("/ui/settings?scope_level=" + encodeURIComponent(settingsScopeLevel), {
            method: "PUT",
            body: JSON.stringify((() => {
              const integrationPayload = buildSettingsIntegrationPayload(settings, integrationRegistry, integrationCredentialDrafts);
              return {
                providers: settings.providers_json,
                credentials: {
                  ...integrationPayload.credentials,
                  ...buildSettingsCredentialsPayload(settings, llmRegistry, providerCredentialDrafts)
                },
                audit_defaults: settings.audit_defaults_json,
                preflight: settings.preflight_json,
                review: settings.review_json,
                integrations: {
                  ...settings.integrations_json,
                  ...integrationPayload.integrations
                },
                test_mode: settings.test_mode_json
              };
            })())
          }, requestContext).then((payload) => {
            setSettings(payload.settings || emptySettings);
            setProviderCredentialDrafts({});
            setIntegrationCredentialDrafts({});
            return api("/ui/settings?scope_level=effective", undefined, requestContext).then((effectivePayload) => setEffectiveSettings({ effective: effectivePayload.settings || emptySettings, layers: effectivePayload.layers || emptyEffectiveSettings.layers }));
          }),
          "Settings saved."
        )
      }, "Save Settings")
    ]),
    h("div", { key: "right", className: "space-y-6" }, [
      h(Card, { key: "workspace-admin", title: "Workspace Registry", description: "Create and manage workspace and project selectors for the OSS console." }, [
        h("div", { key: "workspace-fields", className: "grid gap-4" }, [
          h(Field, { key: "workspace-name", label: "New Workspace" }, h(Input, { value: workspaceForm.name, onChange: (event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value })) })),
          h(Field, { key: "workspace-desc", label: "Description" }, h(Input, { value: workspaceForm.description, onChange: (event) => setWorkspaceForm((current) => ({ ...current, description: event.target.value })) })),
          h(Button, {
            key: "workspace-create",
            variant: "outline",
            onClick: () => act(
              () => api("/ui/workspaces", { method: "POST", body: JSON.stringify(workspaceForm) }, requestContext).then(() => setWorkspaceForm({ name: "", description: "" })),
              "Workspace created."
            )
          }, "Create Workspace"),
          h(Field, { key: "project-name", label: "New Project In Current Workspace" }, h(Input, { value: projectForm.name, onChange: (event) => setProjectForm((current) => ({ ...current, name: event.target.value })) })),
          h(Field, { key: "project-desc", label: "Project Description" }, h(Input, { value: projectForm.description, onChange: (event) => setProjectForm((current) => ({ ...current, description: event.target.value })) })),
          h(Button, {
            key: "project-create",
            variant: "outline",
            onClick: () => act(
              () => api("/ui/projects", { method: "POST", body: JSON.stringify(projectForm) }, requestContext).then(() => setProjectForm({ name: "", description: "" })),
              "Project created."
            )
          }, "Create Project")
        ])
      ]),
      h(Card, { key: "workspace-roles", title: "Workspace Review Roles", description: "Explicit reviewer governance for assignment, approval, comments, and audit export." }, [
        h("div", { key: "role-form", className: "grid gap-4" }, [
          h(Field, { key: "role-actor", label: "Actor Id" }, h(Input, {
            value: roleBindingForm.actor_id,
            onChange: (event) => setRoleBindingForm((current) => ({ ...current, actor_id: event.target.value }))
          })),
          h(Field, { key: "role-select", label: "Role" }, Select({
            value: roleBindingForm.role,
            onChange: (event) => setRoleBindingForm((current) => ({ ...current, role: event.target.value }))
          }, [
            h("option", { key: "admin", value: "admin" }, "admin"),
            h("option", { key: "triage", value: "triage_lead" }, "triage lead"),
            h("option", { key: "reviewer", value: "reviewer" }, "reviewer"),
            h("option", { key: "viewer", value: "viewer" }, "viewer")
          ])),
          h(Button, {
            key: "role-save",
            variant: "outline",
            onClick: () => act(
              () => api("/ui/workspace-role-bindings", { method: "POST", body: JSON.stringify(roleBindingForm) }, requestContext).then(() => setRoleBindingForm({ actor_id: "", role: "reviewer" })),
              "Workspace role saved."
            )
          }, "Save Role Binding")
        ]),
        h("div", { key: "role-list", className: "mt-5 space-y-3" }, workspaceRoleBindings.length ? workspaceRoleBindings.map((binding) => h("div", {
          key: binding.id,
          className: "flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3"
        }, [
          h("div", { key: "copy" }, [
            h("div", { key: "actor", className: "font-medium" }, binding.actor_id),
            h("div", { key: "meta", className: "text-sm text-muted" }, `${binding.role} - updated ${formatDate(binding.updated_at)}`)
          ]),
          h(Button, {
            key: "revoke",
            variant: "outline",
            onClick: () => act(() => api("/ui/workspace-role-bindings/" + encodeURIComponent(binding.actor_id), { method: "DELETE" }, requestContext), "Workspace role revoked.")
          }, "Revoke")
        ])) : h("div", { className: "text-sm text-muted" }, "No explicit bindings yet. Legacy-open mode treats actors as admin until a binding is created."))
      ]),
      h(Card, { key: "project-defaults", title: "Current Project", description: "Edit project metadata and target defaults used by the run launcher for this scope." }, currentProject ? [
        h("div", { key: "project-fields", className: "grid gap-4" }, [
          h(Field, { key: "project-name-edit", label: "Project Name" }, h(Input, { value: projectEditor.name, onChange: (event) => updateProjectEditor("name", event.target.value) })),
          h(Field, { key: "project-description-edit", label: "Description" }, h(Input, { value: projectEditor.description, onChange: (event) => updateProjectEditor("description", event.target.value) })),
          h(Field, { key: "project-target-kind", label: "Default Target Kind" }, Select({ value: projectEditor.target_kind, onChange: (event) => updateProjectEditor("target_kind", event.target.value) }, [
            h("option", { key: "path", value: "path" }, "local path"),
            h("option", { key: "repo", value: "repo" }, "repo url"),
            h("option", { key: "endpoint", value: "endpoint" }, "endpoint url")
          ])),
          projectEditor.target_kind === "repo"
            ? h(Field, { key: "project-repo", label: "Default Repository URL" }, h(Input, { value: projectEditor.repo_url, onChange: (event) => updateProjectEditor("repo_url", event.target.value) }))
            : projectEditor.target_kind === "endpoint"
              ? h(Field, { key: "project-endpoint", label: "Default Endpoint URL" }, h(Input, { value: projectEditor.endpoint_url, onChange: (event) => updateProjectEditor("endpoint_url", event.target.value) }))
              : h(Field, { key: "project-local-path", label: "Default Local Path" }, h(Input, { value: projectEditor.local_path, onChange: (event) => updateProjectEditor("local_path", event.target.value) })),
          h(Field, { key: "project-policy-pack", label: "Default Policy Pack" }, Select({ value: projectEditor.audit_policy_pack, onChange: (event) => updateProjectEditor("audit_policy_pack", event.target.value) }, [
            h("option", { key: "default-empty", value: "" }, "default builtin policy"),
            ...policyPacks.map((item) => h("option", { key: item.id, value: item.id }, item.name + " (" + item.id + ")")),
            projectEditor.audit_policy_pack && !policyPacks.some((item) => item.id === projectEditor.audit_policy_pack) ? h("option", { key: projectEditor.audit_policy_pack, value: projectEditor.audit_policy_pack }, projectEditor.audit_policy_pack + " (custom)") : null
          ].filter(Boolean))),
          h(Field, { key: "project-preflight", label: "Preflight Strictness" }, Select({ value: projectEditor.preflight_strictness, onChange: (event) => updateProjectEditor("preflight_strictness", event.target.value) }, [
            h("option", { key: "standard", value: "standard" }, "standard"),
            h("option", { key: "strict", value: "strict" }, "strict"),
            h("option", { key: "lenient", value: "lenient" }, "lenient")
          ])),
          h(Field, { key: "project-runtime-allowed", label: "Runtime Validation" }, Select({ value: projectEditor.runtime_allowed, onChange: (event) => updateProjectEditor("runtime_allowed", event.target.value) }, [
            h("option", { key: "never", value: "never" }, "never"),
            h("option", { key: "targeted_only", value: "targeted_only" }, "targeted only"),
            h("option", { key: "allowed", value: "allowed" }, "allowed")
          ])),
          h(Field, { key: "project-review-severity", label: "Human Review Threshold" }, Select({ value: projectEditor.review_severity, onChange: (event) => updateProjectEditor("review_severity", event.target.value) }, [
            h("option", { key: "critical", value: "critical" }, "critical"),
            h("option", { key: "high", value: "high" }, "high"),
            h("option", { key: "medium", value: "medium" }, "medium"),
            h("option", { key: "low", value: "low" }, "low")
          ])),
          h(Field, { key: "project-review-visibility", label: "Default Visibility" }, Select({ value: projectEditor.review_visibility, onChange: (event) => updateProjectEditor("review_visibility", event.target.value) }, [
            h("option", { key: "public", value: "public" }, "public"),
            h("option", { key: "internal", value: "internal" }, "internal"),
            h("option", { key: "internal-only", value: "internal-only" }, "internal-only")
          ]))
        ]),
        h(Button, {
          key: "project-save",
          className: "mt-5",
          onClick: () => act(
            () => api("/ui/projects/" + encodeURIComponent(currentProject.id), {
              method: "PUT",
              body: JSON.stringify({
                name: projectEditor.name,
                description: projectEditor.description,
                target_defaults: {
                  target_kind: projectEditor.target_kind,
                  local_path: projectEditor.target_kind === "path" ? projectEditor.local_path : "",
                  repo_url: projectEditor.target_kind === "repo" ? projectEditor.repo_url : "",
                  endpoint_url: projectEditor.target_kind === "endpoint" ? projectEditor.endpoint_url : "",
                  audit_policy_pack: projectEditor.audit_policy_pack,
                  preflight_strictness: projectEditor.preflight_strictness,
                  runtime_allowed: projectEditor.runtime_allowed,
                  review_severity: projectEditor.review_severity,
                  review_visibility: projectEditor.review_visibility
                }
              })
            }, requestContext),
            "Project defaults saved."
          )
        }, "Save Project Defaults")
      ] : h("div", { className: "text-sm text-muted" }, "Create a project in the current workspace to manage target defaults.")),
      h(Card, { key: "api-keys", title: "Workspace API Keys", description: "Create and revoke persisted API keys for this workspace when auth mode is api_key." }, [
        h("div", { key: "api-key-fields", className: "grid gap-4" }, [
          h(Field, { key: "api-key-label", label: "New API Key Label" }, h(Input, { value: apiKeyForm.label, onChange: (event) => setApiKeyForm({ label: event.target.value }) })),
          h(Button, {
            key: "api-key-create",
            variant: "outline",
            onClick: () => act(
              () => api("/ui/api-keys", { method: "POST", body: JSON.stringify(apiKeyForm) }, requestContext).then((payload) => {
                setApiKeyForm({ label: "" });
                setLatestCreatedApiKey(payload.api_key || "");
              }),
              "API key created."
            )
          }, "Create API Key"),
          latestCreatedApiKey ? h("div", { key: "api-key-secret", className: "rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, "Copy this key now: " + latestCreatedApiKey) : null
        ]),
        h("div", { key: "api-key-list", className: "mt-5 space-y-3" }, apiKeys.length ? apiKeys.map((item) => h("div", {
          key: item.id,
          className: "flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3"
        }, [
          h("div", { key: "copy" }, [
            h("div", { key: "label", className: "font-medium" }, item.label),
            h("div", { key: "meta", className: "text-sm text-muted" }, item.key_prefix + " - created " + formatDate(item.created_at) + " - last used " + formatDate(item.last_used_at))
          ]),
          h(Button, { key: "revoke", variant: "outline", onClick: () => act(() => api("/ui/api-keys/" + encodeURIComponent(item.id), { method: "DELETE" }, requestContext), "API key revoked.") }, "Revoke")
        ])) : h("div", { className: "text-sm text-muted" }, "No persisted workspace API keys yet."))
      ]),
      h(Card, { key: "attach", title: "Attach Document", description: "Persisted policy or reference documents for planning and review context." }, [
        h("div", { key: "fields", className: "grid gap-4" }, [
          h(Field, { key: "title", label: "Title" }, h(Input, { value: docForm.title, onChange: (event) => setDocForm((current) => ({ ...current, title: event.target.value })) })),
          h(Field, { key: "type", label: "Type" }, Select({ value: docForm.document_type, onChange: (event) => setDocForm((current) => ({ ...current, document_type: event.target.value })) }, [
            h("option", { key: "policy", value: "policy" }, "policy"),
            h("option", { key: "reference", value: "reference" }, "reference"),
            h("option", { key: "runbook", value: "runbook" }, "runbook"),
            h("option", { key: "checklist", value: "checklist" }, "checklist")
          ])),
          h(Field, { key: "notes", label: "Notes" }, h(Input, { value: docForm.notes, onChange: (event) => setDocForm((current) => ({ ...current, notes: event.target.value })) })),
          h(Field, { key: "content", label: "Content" }, h(Textarea, { value: docForm.content_text, onChange: (event) => setDocForm((current) => ({ ...current, content_text: event.target.value })) }))
        ]),
        h(Button, { key: "button", className: "mt-5 bg-accent", onClick: () => act(() => api("/ui/documents", { method: "POST", body: JSON.stringify(docForm) }, requestContext).then(() => setDocForm({ title: "", document_type: "policy", notes: "", content_text: "" })), "Document attached.") }, "Attach Document")
      ]),
      h(Card, { key: "list", title: "Attached Documents" }, documents.length ? documents.map((document) => h("div", {
        key: document.id,
        className: "mb-3 rounded-2xl border border-border bg-white/70 p-4"
      }, [
        h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium" }, document.title),
            h("div", { key: "meta", className: "text-sm text-muted" }, document.document_type + " - " + formatDate(document.updated_at)),
            document.notes ? h("div", { key: "notes", className: "mt-2 text-sm text-muted" }, document.notes) : null
          ]),
          h(Button, { key: "delete", variant: "outline", onClick: () => act(() => api("/ui/documents/" + encodeURIComponent(document.id), { method: "DELETE" }, requestContext), "Document deleted.") }, "Delete")
        ])
      ])) : h("div", { className: "text-sm text-muted" }, "No persisted documents yet."))
    ])
  ]);

  return h("div", { className: "grid min-h-screen bg-background lg:grid-cols-[280px_1fr]" }, [
    h("aside", { key: "aside", className: "border-b border-border bg-white px-4 py-5 lg:border-b-0 lg:border-r" }, [
      h("div", { key: "brand", className: "flex items-center gap-3 px-2" }, [
        h("div", { key: "logo", className: "flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700" }, h(SidebarIcon, { kind: "spark" })),
        h("div", { key: "name", className: "text-lg font-semibold text-slate-900" }, "AI Security Harness")
      ]),
      h("div", { key: "quick-row", className: "mt-6 flex items-center gap-2" }, [
        h("button", {
          key: "quick-create",
          type: "button",
          onClick: () => {
            setView("runs");
            setLaunchModalOpen(true);
          },
          className: "flex flex-1 items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-700"
        }, [
          h(SidebarIcon, { key: "icon", kind: "plus" }),
          h("span", { key: "label" }, "Quick Create")
        ]),
        h("button", {
          key: "mail",
          type: "button",
          onClick: () => setView("reviews"),
          className: "flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-slate-700 hover:bg-slate-50"
        }, h(SidebarIcon, { kind: "mail" }))
      ]),
      h("div", { key: "groups", className: "mt-6 space-y-6" }, navGroups.map((group) => h("div", { key: group.label }, [
        h("div", { key: "label", className: "px-2 text-xs font-medium text-slate-400" }, group.label),
        h("nav", { key: "items", className: "mt-3 grid gap-1.5" }, group.items.map(([itemView, label, icon]) =>
          h("button", {
            key: itemView,
            type: "button",
            onClick: () => setView(itemView),
            className: cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
              view === itemView ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-700 hover:bg-slate-50"
            )
          }, [
            h("span", { key: "icon", className: cn("text-slate-500", view === itemView && "text-slate-900") }, h(SidebarIcon, { kind: icon })),
            h("span", { key: "text" }, label)
          ])
        ))
      ]))),
      h("div", { key: "footer", className: "mt-8 px-2 text-sm text-slate-500" }, [
        h("div", { key: "scope", className: "font-medium text-slate-700" }, `${requestContext.workspaceId}/${requestContext.projectId}`),
        h("div", { key: "desc", className: "mt-1" }, pageDescriptions[view] || "Focused workspace for operating the harness.")
      ])
    ]),
    h("main", { key: "main", className: view === "runs" ? "min-w-0 h-screen overflow-hidden" : "px-5 py-6 lg:px-8" }, [
      view !== "runs" ? h("header", { key: "header", className: "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" }, [
        h("div", { key: "heading" }, [
          h("h2", { key: "title", className: "text-3xl font-semibold tracking-tight text-slate-950" }, navItems.find(([item]) => item === view)?.[1] || "Dashboard"),
          h("p", { key: "desc", className: "mt-1 text-sm text-slate-500" }, pageDescriptions[view] || "Focused workspace for operating the harness.")
        ]),
        h("div", { key: "actions", className: "flex items-center gap-3" }, [
          h("div", { key: "status", className: "hidden flex-wrap gap-2 md:flex" }, [
            h(Badge, { key: "auth" }, authInfo.trusted_mode ? "trusted_local" : authInfo.auth_mode || "authenticated"),
            h(Badge, { key: "roles" }, effectiveRoles.join(",") || "viewer")
          ]),
          h(Button, { key: "refresh", variant: "outline", onClick: load }, "Refresh")
        ])
      ]) : null,
      error ? h("div", { key: "error", className: cn(view === "runs" ? "m-4" : "mt-6", "rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700") }, error) : null,
      notice ? h("div", { key: "notice", className: cn(view === "runs" ? "m-4" : "mt-6", "rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700") }, notice) : null,
      h(ViewErrorBoundary, {
        key: `view:${view}`,
        resetKey: `${view}:${selectedRunId || ""}:${selectedRuntimeFollowupId || ""}`
      }, h("div", { key: "view", className: view === "runs" ? "" : "mt-6" }, view === "dashboard"
        ? dashboard
        : view === "runs"
          ? runsView
          : view === "jobs"
            ? jobsView
            : view === "followups"
              ? runtimeFollowupsView
              : view === "reviews"
                ? reviewsView
                : settingsView))
    ])
  ]);
}

createRoot(document.getElementById("root")).render(h(App));

