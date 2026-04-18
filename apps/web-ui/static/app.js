const { createElement: h, useEffect, useMemo, useState } = window.React;
const { createRoot } = window.ReactDOM;
const appConfig = window.HARNESS_WEB_UI_CONFIG || { apiBaseUrl: "/api" };

const navItems = [
  ["dashboard", "Dashboard"],
  ["runs", "Runs"],
  ["jobs", "Async Jobs"],
  ["followups", "Runtime Follow-ups"],
  ["reviews", "Reviews"],
  ["settings", "Settings"]
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

function inferTargetKind(targetDefaults) {
  if (targetDefaults?.target_kind) return targetDefaults.target_kind;
  if (targetDefaults?.repo_url) return "repo";
  if (targetDefaults?.endpoint_url) return "endpoint";
  return "path";
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
    run_mode: targetDefaults.run_mode || auditDefaults.run_mode || "static",
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

function getProviderCredentialFields(registry, providerId) {
  return getProviderDefinition(registry, providerId)?.credential_fields || [];
}

function getProviderCredentialFieldStatuses(registry, providerId) {
  return getProviderDefinition(registry, providerId)?.credential_status?.fields || [];
}

function getProviderCredentialFieldStatus(registry, providerId, fieldId) {
  return getProviderCredentialFieldStatuses(registry, providerId).find((item) => item.id === fieldId) || null;
}

function getProviderCredentialStatus(registry, providerId, effectiveSettings) {
  const provider = getProviderDefinition(registry, providerId);
  if (provider?.credential_status) {
    return provider.credential_status;
  }
  if (!provider?.requires_api_key || !provider.api_key_field) {
    return {
      configured: true,
      source: "not_required",
      note: provider?.mode === "local_mock" ? "No API key required." : "No persisted API key required.",
      fields: []
    };
  }
  const credentials = effectiveSettings?.effective?.credentials_json || {};
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
    run_mode: form.run_mode,
    audit_package: form.audit_package,
    llm_provider: form.llm_provider
  };
  if (form.audit_policy_pack) payload.audit_policy_pack = form.audit_policy_pack;
  if (form.llm_model) payload.llm_model = form.llm_model;
  const provider = getProviderDefinition(llmRegistry, form.llm_provider);
  const apiKeyField = provider?.api_key_field;
  const configuredApiKey = apiKeyField ? effectiveSettings?.effective?.credentials_json?.[apiKeyField] : null;
  if (configuredApiKey) payload.llm_api_key = configuredApiKey;
  if (form.target_kind === "repo" && form.repo_url) payload.repo_url = form.repo_url;
  else if (form.target_kind === "endpoint" && form.endpoint_url) payload.endpoint_url = form.endpoint_url;
  else if (form.local_path) payload.local_path = form.local_path;
  payload.hints = {
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
  const providerCredential = getProviderCredentialStatus(llmRegistry, form.llm_provider, effectiveSettings);
  const targetReady = issues.length === 0;
  const preflightStatus = preflightSummary?.readiness?.status || "not_run";
  const blockers = preflightSummary?.readiness?.blockers || [];
  const warnings = preflightSummary?.readiness?.warnings || [];
  const recommendedProfile = preflightSummary?.launch_profile || null;
  const profileDrift = recommendedProfile
    ? [
      recommendedProfile.audit_package && recommendedProfile.audit_package !== form.audit_package ? "audit package" : null,
      (recommendedProfile.audit_policy_pack || "") !== (form.audit_policy_pack || "") ? "policy pack" : null,
      recommendedProfile.run_mode && recommendedProfile.run_mode !== form.run_mode ? "run mode" : null,
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

function Button({ children, variant = "default", className = "", ...props }) {
  return h(
    "button",
    {
      className: cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors",
        variant === "default" && "bg-primary text-white hover:opacity-90",
        variant === "secondary" && "bg-secondary text-foreground hover:bg-stone-200",
        variant === "outline" && "border border-border bg-white hover:bg-secondary",
        className
      ),
      ...props
    },
    children
  );
}

function Card({ title, description, children, className = "" }) {
  return h("section", { className: cn("rounded-3xl border border-border bg-card p-6 shadow-soft", className) }, [
    title ? h("h3", { key: "t", className: "font-serif text-2xl" }, title) : null,
    description ? h("p", { key: "d", className: "mt-2 text-sm text-muted" }, description) : null,
    h("div", { key: "c", className: title || description ? "mt-5" : "" }, children)
  ]);
}

function Field({ label, children }) {
  return h("label", { className: "block space-y-2 text-sm" }, [
    h("span", { key: "l", className: "font-medium" }, label),
    children
  ]);
}

function Input(props) {
  return h("input", { className: "w-full rounded-xl border border-border bg-white px-3 py-2", ...props });
}

function Select(props, children) {
  return h("select", { className: "w-full rounded-xl border border-border bg-white px-3 py-2", ...props }, children);
}

function Textarea(props) {
  return h("textarea", { className: "min-h-[110px] w-full rounded-xl border border-border bg-white px-3 py-2", ...props });
}

function MetricCard({ label, value, hint }) {
  return h(Card, {
    title: null,
    description: null,
    className: "p-0"
  }, h("div", { className: "p-6" }, [
    h("div", { key: "l", className: "text-xs font-mono uppercase tracking-[0.28em] text-muted" }, label),
    h("div", { key: "v", className: "mt-2 font-serif text-4xl" }, value),
    h("div", { key: "h", className: "mt-2 text-sm text-muted" }, hint)
  ]));
}

function RunsTable({ runs, selectedRunId, onSelect }) {
  return h("div", { className: "overflow-x-auto rounded-2xl border border-border" }, h("table", { className: "w-full text-sm" }, [
    h("thead", { key: "h" }, h("tr", { className: "border-b border-border text-left text-xs uppercase tracking-[0.18em] text-muted" }, [
      h("th", { key: "target", className: "px-4 py-3" }, "Target"),
      h("th", { key: "status", className: "px-4 py-3" }, "Status"),
      h("th", { key: "review", className: "px-4 py-3" }, "Review"),
      h("th", { key: "package", className: "px-4 py-3" }, "Package"),
      h("th", { key: "created", className: "px-4 py-3" }, "Created")
    ])),
    h("tbody", { key: "b" }, runs.length ? runs.map((run) => h("tr", {
      key: run.id,
      className: cn("border-b border-border/80", onSelect && "cursor-pointer hover:bg-stone-50", selectedRunId === run.id && "bg-stone-100/70"),
      onClick: onSelect ? () => onSelect(run.id) : undefined
    }, [
      h("td", { key: "target", className: "px-4 py-3" }, [
        h("div", { key: "name", className: "font-medium" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
        h("div", { key: "id", className: "text-xs text-muted" }, run.id)
      ]),
      h("td", { key: "status", className: "px-4 py-3" }, h(Badge, null, run.status)),
      h("td", { key: "review", className: "px-4 py-3" }, h(Badge, null, run.review_workflow?.status || "none")),
      h("td", { key: "package", className: "px-4 py-3" }, run.audit_package),
      h("td", { key: "created", className: "px-4 py-3" }, formatDate(run.created_at))
    ])) : h("tr", null, h("td", { className: "px-4 py-8 text-center text-muted", colSpan: 5 }, "No runs available.")))
  ]));
}

function DetailList({ items }) {
  return h("dl", { className: "grid gap-3 md:grid-cols-2" }, items.map((item) => h("div", {
    key: item.label,
    className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
  }, [
    h("dt", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, item.label),
    h("dd", { key: "value", className: "mt-2 text-sm font-medium text-foreground" }, item.value || "n/a")
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
        className: cn("rounded-2xl border border-border bg-white/70 px-4 py-4", "cursor-pointer hover:bg-stone-50", selectedRunId === run.id && "bg-stone-100/70"),
        onClick: () => onSelect?.(run.id)
      }, [
        h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
            h("div", { key: "meta", className: "mt-1 text-sm text-muted" }, `${run.id} - reviewer ${run.review_workflow?.current_reviewer_id || "unassigned"}`)
          ]),
          h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
            h(Badge, { key: "status" }, run.review_workflow?.status || "none"),
            isOverdueReview(run) ? h(Badge, { key: "overdue" }, "overdue") : null,
            assignedToMe ? h(Badge, { key: "mine" }, "mine") : null,
            dueSoonDispositionCount > 0 ? h(Badge, { key: "disposition-due-soon" }, `due soon ${dueSoonDispositionCount}`) : null,
            needsDispositionReview ? h(Badge, { key: "disposition-review" }, `disposition re-review ${dispositionCounts.findings_needing_disposition_review_count}`) : null
          ].filter(Boolean))
        ]),
        h("div", { key: "details", className: "mt-3 grid gap-3 md:grid-cols-3 text-sm text-muted" }, [
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
              ]),
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
            h("div", { key: "source", className: "rounded-2xl border border-border bg-white/70 px-4 py-4" }, [
              h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Source Finding"),
              sourceFinding
                ? [
                  h("div", { key: "name", className: "mt-3 font-medium" }, sourceFinding.title),
                  h("div", { key: "meta", className: "mt-1 text-sm text-muted" }, `${sourceFinding.id} • ${sourceFinding.category} • ${sourceFinding.severity}`),
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
            h("div", { key: "rerun", className: "rounded-2xl border border-border bg-white/70 px-4 py-4" }, [
              h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Linked Rerun"),
              rerunLoading
                ? h("div", { key: "loading", className: "mt-3 text-sm text-muted" }, "Loading linked rerun detail...")
                : rerunRunDetail?.summary?.summary
                  ? [
                    h("div", { key: "status", className: "mt-3 flex flex-wrap gap-2" }, [
                      h(Badge, { key: "run-status" }, rerunRunDetail.summary.summary.status || "unknown"),
                      h(Badge, { key: "review-status" }, rerunRunDetail.summary.summary.review_workflow_status || "none")
                    ]),
                    h("div", { key: "meta", className: "mt-2 text-sm text-muted" }, `${selectedFollowup.linked_run_id} • ${formatDate(rerunRunDetail.summary.summary.created_at)}`),
                    rerunFinding
                      ? [
                        h("div", { key: "finding-title", className: "mt-3 font-medium" }, rerunFinding.title),
                        h("div", { key: "finding-meta", className: "mt-1 text-sm text-muted" }, `${rerunFinding.id} • ${rerunFinding.category} • ${rerunFinding.severity}`),
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
  return `Changed ${summary.changed_finding_count || 0} · New ${summary.new_finding_count || 0} · Resolved ${summary.resolved_finding_count || 0} · Symbol matches ${summary.evidence_symbol_matched_count || 0}`;
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
  if (loading) {
    return h(Card, { title: "Run Detail", description: "Loading persisted run detail and planned profile." }, h("div", { className: "text-sm text-muted" }, "Loading run detail..."));
  }
  if (!detail) {
    return h(Card, { title: "Run Detail", description: "Select a run to compare planned launch posture with the executed configuration." }, h("div", { className: "text-sm text-muted" }, "No run selected."));
  }
  const run = detail.run?.run || detail.run || {};
  const summary = detail.summary?.summary || {};
  const resolved = detail.resolvedConfig?.resolved_configuration || {};
  const preflight = detail.preflight?.preflight || null;
  const launchIntent = detail.launchIntent?.launch_intent || null;
  const sandboxExecution = detail.sandboxExecution?.sandbox_execution || null;
  const findings = detail.findings?.findings || [];
  const evidenceRecords = detail.evidenceRecords?.evidence_records || [];
  const controlResults = detail.controlResults?.control_results || [];
  const observations = detail.observations?.observations || [];
  const supervisorReview = detail.supervisorReview?.supervisor_review || null;
  const remediation = detail.remediation?.remediation_memo || null;
  const reviewActions = detail.reviewActions?.review_actions || [];
  const reviewSummary = detail.reviewSummary?.review_summary || null;
  const runtimeFollowups = detail.runtimeFollowups?.runtime_followups || [];
  const indexedExports = detail.exportsIndex?.export_index?.exports || [];
  const findingDispositions = detail.findingDispositions?.finding_dispositions || [];
  const resolvedFindingDispositions = detail.findingDispositions?.resolved_finding_dispositions || [];
  const findingEvaluations = detail.findingEvaluations?.finding_evaluations || null;
  const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
  const webhookDeliveries = detail.webhookDeliveries?.webhook_deliveries || [];
  const outboundPreview = detail.outboundPreview?.outbound_preview || null;
  const outboundApproval = detail.outboundApproval?.outbound_approval || null;
  const outboundSend = detail.outboundSend?.outbound_send || null;
  const outboundVerification = detail.outboundVerification?.outbound_verification || null;
  const outboundDelivery = detail.outboundDelivery?.outbound_delivery || null;
  const comparisonPayload = comparison?.report_compare || null;
  const changedComparisonItems = comparisonPayload?.changed_findings || [];
  const comparisonFindings = comparisonDetail?.findings?.findings || [];
  const comparisonEvaluations = comparisonDetail?.findingEvaluations?.finding_evaluations?.evaluations || [];
  const selectedComparisonFinding = comparisonFindings.find((finding) => finding.id === selectedComparisonFindingId) || null;
  const selectedComparisonEvaluation = selectedComparisonFinding
    ? comparisonEvaluations.find((item) => item.finding_id === selectedComparisonFinding.id) || null
    : null;
  const findingSummaries = reviewSummary?.finding_summaries || [];
  const evaluationRecords = findingEvaluations?.evaluations || [];
  const suppressedFindingSummaries = findingSummaries.filter((item) => item.disposition === "suppressed");
  const waivedFindingSummaries = findingSummaries.filter((item) => item.disposition === "waived");
  const expiredDispositionFindingSummaries = findingSummaries.filter((item) => item.disposition_status === "expired");
  const dueSoonDispositionFindingSummaries = findingSummaries.filter((item) => item.active_disposition_due_soon);
  const dueSoonDispositionByOwner = reviewSummary?.handoff?.due_soon_by_owner || [];
  const findingsNeedingDispositionReview = findingSummaries.filter((item) => item.needs_disposition_review);
  const plannedProfile = preflight?.launch_profile || null;
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) || findings[0] || null;
  const selectedFindingSummary = selectedFinding ? findingSummaries.find((item) => item.finding_id === selectedFinding.id) || null : null;
  const selectedFindingEvaluation = selectedFinding ? evaluationRecords.find((item) => item.finding_id === selectedFinding.id) || null : null;
  const selectedFindingDisposition = selectedFinding ? resolvedFindingDispositions.find((item) => item.finding_id === selectedFinding.id) || null : null;
  const selectedFindingDispositionHistory = selectedFinding
    ? findingDispositions.filter((item) => item.finding_id === selectedFinding.id || (item.scope_level === "project" && item.finding_signature === selectedFindingDisposition?.finding_signature))
    : [];
  const selectedFindingState = selectedFinding ? (findingReviewState?.[selectedFinding.id] || {}) : {};
  const selectedChangedComparisonIndex = changedComparisonItems.findIndex((item) => (
    (selectedFindingId && item.current_finding_id === selectedFindingId)
    || (selectedComparisonFindingId && item.previous_finding_id === selectedComparisonFindingId)
  ));
  const comparisonDetailDiffs = deriveComparisonDetailDiffs(
    selectedFinding,
    selectedFindingEvaluation,
    selectedComparisonFinding,
    selectedComparisonEvaluation
  );
  function selectChangedComparisonItem(item) {
    if (!item) return;
    if (item.current_finding_id && item.previous_finding_id) {
      onSelectComparisonPair?.(item.current_finding_id, item.previous_finding_id);
      return;
    }
    if (item.current_finding_id) {
      onSelectFinding?.(item.current_finding_id);
      return;
    }
    if (item.previous_finding_id) {
      onSelectComparisonFinding?.(item.previous_finding_id);
    }
  }
  function selectChangedComparisonByOffset(offset) {
    if (!changedComparisonItems.length) return;
    const baseIndex = selectedChangedComparisonIndex >= 0 ? selectedChangedComparisonIndex : 0;
    const nextIndex = (baseIndex + offset + changedComparisonItems.length) % changedComparisonItems.length;
    selectChangedComparisonItem(changedComparisonItems[nextIndex]);
  }
  const relatedControls = selectedFinding
    ? controlResults.filter((control) => (control.finding_ids_json || []).includes(selectedFinding.id) || (selectedFinding.control_ids_json || []).includes(control.control_id))
    : [];
  const relatedRuntimeEvidence = selectedFinding
    ? evidenceRecords.filter((item) => {
      const metadata = getEvidenceMetadata(item);
      if (metadata?.category !== "sandbox_execution") return false;
      const evidenceId = item.id || item.evidence_id;
      if (selectedFindingEvaluation?.runtime_evidence_ids?.includes(evidenceId)) return true;
      return ((item.control_ids_json || item.control_ids || []).some((controlId) => (selectedFinding.control_ids_json || []).includes(controlId)) || !selectedFinding.control_ids_json?.length);
    })
    : [];
  const relatedSupervisorGrade = selectedFinding
    ? (supervisorReview?.grader_outputs_json || []).find((item) => item.finding_id === selectedFinding.id) || null
    : null;
  const relatedObservations = observations.filter((item) => {
    if (!selectedFinding) return false;
    const title = String(item?.title || "").toLowerCase();
    const summaryText = String(item?.summary || "").toLowerCase();
    const evidenceText = Array.isArray(item?.evidence) ? item.evidence.join(" ").toLowerCase() : "";
    return title.includes(selectedFinding.category?.toLowerCase?.() || "")
      || summaryText.includes(selectedFinding.category?.toLowerCase?.() || "")
      || summaryText.includes(selectedFinding.title.toLowerCase())
      || evidenceText.includes(selectedFinding.title.toLowerCase());
  });
  return h("div", { className: "space-y-6" }, [
    h(Card, { key: "overview", title: "Run Detail", description: "Persisted summary and review state for the selected run." }, [
      h(DetailList, {
        key: "summary",
        items: [
          { label: "Run Id", value: summary.run_id || run.id },
          { label: "Status", value: summary.status || run.status },
          { label: "Review", value: summary.review_workflow_status || run.review_workflow?.status || "none" },
          { label: "Rating", value: summary.rating || run.rating },
          { label: "Overall Score", value: String(summary.overall_score ?? run.overall_score ?? "n/a") },
          { label: "Sandbox Readiness", value: summary.sandbox_execution?.readiness_status || "n/a" },
          { label: "Sandbox Attention", value: summary.sandbox_execution_attention_required ? "yes" : "no" },
          { label: "Created", value: formatDate(summary.created_at || run.created_at) }
        ]
      })
    ]),
    h(Card, { key: "runtime-followups", title: "Runtime Follow-up Queue", description: "Linked rerun work items created from runtime-sensitive review decisions." }, runtimeFollowups.length
      ? h("div", { className: "space-y-3" }, runtimeFollowups.map((followup) => h("div", {
        key: followup.id,
        className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium" }, followup.finding_title || followup.finding_id),
            h("div", { key: "meta", className: "mt-1 text-sm text-muted" }, `${followup.followup_policy} - requested ${formatDate(followup.requested_at)} by ${followup.requested_by}`)
          ]),
          h("div", { key: "badges", className: "flex flex-wrap gap-2" }, [
            h(Badge, { key: "status" }, followup.status),
            followup.completed_status ? h(Badge, { key: "job" }, `job ${followup.completed_status}`) : null
          ].filter(Boolean))
        ]),
        h(DetailList, {
          key: "details",
          items: [
            { label: "Linked Job", value: followup.linked_job_id || "none" },
            { label: "Linked Run", value: followup.linked_run_id || "none" },
            { label: "Resolution", value: followup.resolution_action_type || "none" },
            { label: "Rerun Outcome", value: followup.rerun_outcome || "pending" }
          ]
        }),
        followup.rerun_outcome_summary
          ? h("div", { key: "outcome", className: "mt-2 text-sm text-muted" }, followup.rerun_outcome_summary)
          : null,
        followup.resolution_notes
          ? h("div", { key: "notes", className: "mt-2 text-sm text-muted" }, followup.resolution_notes)
          : null,
        h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-3" }, [
          followup.rerun_request_json && (followup.status === "pending" || followup.status === "completed")
            ? h(Button, { key: "launch", onClick: () => onLaunchRuntimeFollowup?.(followup.id) }, "Launch Linked Rerun")
            : null
        ].filter(Boolean))
      ])))
      : h("div", { className: "text-sm text-muted" }, "No runtime follow-up items are linked to this run yet.")),
    h(Card, { key: "compare", title: "Planned Vs Executed", description: "Preflight launch profile is compared against the resolved configuration stored for the completed run." }, [
      plannedProfile
        ? h("div", { key: "planned", className: "space-y-4" }, [
          h("div", { key: "planned-title", className: "text-xs font-mono uppercase tracking-[0.28em] text-muted" }, "Planned Launch Profile"),
          h(DetailList, {
            key: "planned-list",
            items: [
              { label: "Target Kind", value: preflight.target.kind },
              { label: "Target Class", value: preflight.target.target_class },
              { label: "Readiness", value: preflight.readiness.status },
              { label: "Audit Package", value: plannedProfile.audit_package },
              { label: "Policy Pack", value: plannedProfile.audit_policy_pack },
              { label: "Run Mode", value: plannedProfile.run_mode },
              { label: "LLM Provider", value: plannedProfile.llm_provider },
              { label: "Model", value: plannedProfile.llm_model || "default" },
              { label: "Preflight Strictness", value: plannedProfile.preflight_strictness },
              { label: "Runtime Allowed", value: plannedProfile.runtime_allowed },
              { label: "Review Severity", value: plannedProfile.review_severity },
              { label: "Review Visibility", value: plannedProfile.review_visibility }
            ]
          }),
          preflight.readiness.blockers?.length || preflight.readiness.warnings?.length
            ? h("div", { key: "messages", className: "grid gap-3 md:grid-cols-2" }, [
              preflight.readiness.blockers?.length
                ? h("div", { key: "blockers", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" }, [
                  h("div", { key: "title", className: "font-semibold" }, "Blockers"),
                  h("ul", { key: "list", className: "mt-2 space-y-1" }, preflight.readiness.blockers.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                ])
                : null,
              preflight.readiness.warnings?.length
                ? h("div", { key: "warnings", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, [
                  h("div", { key: "title", className: "font-semibold" }, "Warnings"),
                  h("ul", { key: "list", className: "mt-2 space-y-1" }, preflight.readiness.warnings.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                ])
                : null
            ].filter(Boolean))
            : null
        ])
        : h("div", { key: "missing", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, "No persisted preflight summary is available for this run."),
      h("div", { key: "executed", className: "mt-5 space-y-4" }, [
        h("div", { key: "executed-title", className: "text-xs font-mono uppercase tracking-[0.28em] text-muted" }, "Executed Configuration"),
        h(DetailList, {
          key: "executed-list",
          items: [
            { label: "Target Kind", value: resolved.target_kind },
            { label: "Target Class", value: resolved.initial_target_class },
            { label: "Audit Package", value: resolved.selected_audit_package || run.audit_package },
            { label: "Policy Pack", value: resolved.policy_pack_id || resolved.requested_policy_pack || "default" },
            { label: "Run Mode", value: resolved.run_mode || run.run_mode },
            { label: "DB Mode", value: resolved.db_mode },
            { label: "Selection Mode", value: resolved.audit_package_selection_mode },
            { label: "Output Dir", value: resolved.output_dir || "default" }
          ]
        })
      ])
    ]),
    h(Card, { key: "sandbox-execution", title: "Sandbox Execution", description: "Bounded install/build/test/runtime-probe readiness derived for runtime-capable runs." }, sandboxExecution
      ? h("div", { className: "space-y-4" }, [
        h(DetailList, {
          key: "sandbox-summary",
          items: [
            { label: "Readiness", value: sandboxExecution.readiness_status },
            { label: "Runtime", value: sandboxExecution.runtime || "unconfigured" },
            { label: "Detected Stack", value: (sandboxExecution.plan?.detected_stack || []).join(", ") || "none" },
            { label: "Entry Signals", value: (sandboxExecution.plan?.entry_signals || []).join(", ") || "none" }
          ]
        }),
        sandboxExecution.plan?.warnings?.length
          ? h("div", { className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, [
            h("div", { key: "title", className: "font-semibold" }, "Execution Warnings"),
            h("ul", { key: "list", className: "mt-2 space-y-1" }, sandboxExecution.plan.warnings.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
          ])
          : null,
        h("div", { className: "space-y-3" }, (sandboxExecution.results || []).map((item) => {
          const planStep = (sandboxExecution.plan?.steps || []).find((step) => step.step_id === item.step_id) || null;
          const artifactDetails = runtimeArtifactDetailItems(item.normalized_artifact);
          return h("div", {
            key: item.step_id,
            className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
          }, [
            h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "phase", className: "font-medium" }, `${planStep?.phase || "step"}: ${item.step_id}`),
                h("div", { key: "command", className: "text-sm text-muted" }, (planStep?.command || []).join(" ")),
                h("div", { key: "summary", className: "text-sm text-muted" }, item.summary),
                h("div", { key: "adapter", className: "text-xs text-muted" }, `adapter ${item.adapter || planStep?.adapter || "unknown"}${item.normalized_artifact?.title ? ` - ${item.normalized_artifact.title}` : ""}`)
              ]),
              h(Badge, { key: "status" }, item.status)
            ]),
            h("div", { key: "meta", className: "mt-2 space-y-1 text-xs text-muted" }, [
              h("div", { key: "checked" }, `checked ${formatDate(item.checked_at)} via ${item.execution_runtime}`),
              item.duration_ms != null ? h("div", { key: "duration" }, `duration ${item.duration_ms} ms`) : null,
              item.exit_code != null ? h("div", { key: "exit" }, `exit code ${item.exit_code}`) : null,
              artifactDetails.length ? h(DetailList, { key: "artifact-details", items: artifactDetails }) : null,
              item.stdout_excerpt ? h("pre", { key: "stdout", className: "overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-[11px] text-emerald-200" }, item.stdout_excerpt) : null,
              item.stderr_excerpt ? h("pre", { key: "stderr", className: "overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-[11px] text-rose-200" }, item.stderr_excerpt) : null
            ])
          ]);
        }))
      ])
      : h("div", { className: "text-sm text-muted" }, "No sandbox execution planning data is available for this run.")),
    h(Card, { key: "intent", title: "Launch Intent", description: "What the operator submitted and whether the most recent preflight was explicitly accepted." }, launchIntent
      ? h("div", { className: "space-y-4" }, [
        h(DetailList, {
          key: "intent-list",
          items: [
            { label: "Source Surface", value: launchIntent.source_surface },
            { label: "Submitted By", value: launchIntent.requested_by || "anonymous" },
            { label: "Workspace", value: launchIntent.workspace_id || "default" },
            { label: "Project", value: launchIntent.project_id || "default" },
            { label: "Submitted At", value: formatDate(launchIntent.submitted_at) },
            { label: "Preflight Status", value: launchIntent.preflight.summary_status },
            { label: "Preflight Checked", value: formatDate(launchIntent.preflight.checked_at) },
            { label: "Preflight Accepted", value: formatDate(launchIntent.preflight.accepted_at) },
            { label: "Accepted", value: launchIntent.preflight.accepted ? "yes" : "no" },
            { label: "Stale At Launch", value: launchIntent.preflight.stale ? "yes" : "no" }
          ]
        }),
        h(DetailList, {
          key: "intent-profile",
          items: [
            { label: "Requested Package", value: launchIntent.requested_profile.audit_package },
            { label: "Requested Policy Pack", value: launchIntent.requested_profile.audit_policy_pack },
            { label: "Requested Run Mode", value: launchIntent.requested_profile.run_mode },
            { label: "Requested Provider", value: launchIntent.requested_profile.llm_provider },
            { label: "Requested Model", value: launchIntent.requested_profile.llm_model || "default" },
            { label: "Requested Preflight Strictness", value: launchIntent.requested_profile.preflight_strictness },
            { label: "Requested Runtime Allowed", value: launchIntent.requested_profile.runtime_allowed },
            { label: "Requested Review Threshold", value: launchIntent.requested_profile.review_severity },
            { label: "Requested Review Visibility", value: launchIntent.requested_profile.review_visibility }
          ]
        }),
        launchIntent.notes?.length
          ? h("div", { className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, launchIntent.notes.join(" | "))
          : null
      ])
      : h("div", { className: "text-sm text-muted" }, "No persisted launch intent is available for this run.")),
    h(Card, { key: "outbound", title: "Outbound Preview", description: "Prepared GitHub-facing payloads only. This does not post anything externally." }, outboundPreview
      ? h("div", { className: "space-y-4" }, [
        h("div", { key: "status-row", className: "flex flex-wrap gap-3" }, [
          h(Badge, { key: "mode" }, outboundPreview.policy?.mode || "disabled"),
          h(Badge, { key: "status" }, outboundPreview.readiness?.status || "unknown"),
          h(Badge, { key: "approval" }, outboundPreview.readiness?.approved ? "approved" : "approval_pending"),
          h(Badge, { key: "verification" }, outboundPreview.readiness?.verified ? "verified" : "verification_pending")
        ]),
        h("div", { key: "copy", className: "text-sm text-muted" }, (outboundPreview.readiness?.reasons || []).length ? outboundPreview.readiness.reasons.join(" ") : "Preview is available. External posting remains manual."),
        outboundApproval
          ? h("div", { key: "approved-meta", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, `Approved by ${outboundApproval.approved_by} at ${formatDate(outboundApproval.approved_at)}`)
          : null,
        outboundVerification
          ? h("div", { key: "verification-meta", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, `${outboundVerification.status} by ${outboundVerification.verified_by} at ${formatDate(outboundVerification.verified_at)}: ${outboundVerification.reason}`)
          : null,
        h("div", { key: "body", className: "rounded-2xl border border-border bg-white/70 p-4 text-sm whitespace-pre-wrap" }, outboundPreview.preview_summary?.body || "No outbound body prepared."),
        h("div", { key: "actions", className: "space-y-3" }, (outboundPreview.proposed_actions || []).map((item, index) => h("div", {
          key: item.action_type + ":" + index,
          className: "rounded-2xl border border-border bg-stone-50 p-4"
        }, [
          h("div", { key: "title", className: "font-medium" }, item.action_type),
          h("pre", { key: "payload", className: "mt-2 overflow-x-auto text-xs text-muted" }, JSON.stringify(item.payload_preview, null, 2))
        ]))),
        h("div", { key: "delivery-fields", className: "grid gap-4 md:grid-cols-2" }, [
          h(Field, { key: "action-type", label: "Outbound Action" }, Select({
            value: outboundActionType || ((outboundPreview.proposed_actions || [])[0]?.action_type || "pr_comment"),
            onChange: (event) => onOutboundActionTypeChange?.(event.target.value)
          }, (outboundPreview.proposed_actions || []).map((item) => h("option", { key: item.action_type, value: item.action_type }, item.action_type)))),
          h(Field, { key: "target-number", label: "Issue / PR Number" }, h(Input, {
            value: outboundTargetNumber,
            onChange: (event) => onOutboundTargetNumberChange?.(event.target.value),
            placeholder: "required for comments and labels"
          }))
        ]),
        h("div", { key: "controls", className: "flex flex-wrap gap-3" }, [
          h(Button, { key: "approve", variant: "outline", onClick: () => onApproveOutbound?.(), disabled: !detail }, outboundApproval ? "Refresh Approval" : "Approve Outbound Sharing"),
          h(Button, { key: "verify", variant: "outline", onClick: () => onVerifyOutbound?.(), disabled: !detail || !outboundPreview.execution?.configured }, outboundVerification ? "Re-verify Repo Access" : "Verify GitHub Access"),
          h(Button, { key: "send", variant: "secondary", onClick: () => onPrepareOutboundSend?.(), disabled: !outboundPreview.readiness?.send_allowed }, "Prepare Manual Send"),
          h(Button, { key: "deliver", onClick: () => onExecuteOutboundDelivery?.(), disabled: !outboundPreview.readiness?.execute_allowed }, "Send To GitHub")
        ]),
        outboundSend
          ? h("div", { key: "send-meta", className: "rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm text-muted" }, `${outboundSend.status} by ${outboundSend.attempted_by} at ${formatDate(outboundSend.attempted_at)}: ${outboundSend.reason}`)
          : null,
        outboundDelivery
          ? h("div", { key: "delivery-meta", className: "rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm text-muted" }, `${outboundDelivery.status} by ${outboundDelivery.attempted_by} at ${formatDate(outboundDelivery.attempted_at)}: ${outboundDelivery.reason}${outboundDelivery.external_url ? ` (${outboundDelivery.external_url})` : ""}`)
          : null
      ])
      : h("div", { className: "text-sm text-muted" }, "No outbound preview is available for this run.")),
    h(Card, { key: "webhook-deliveries", title: "Automation Webhooks", description: "Generic OSS automation hook deliveries for this run." }, webhookDeliveries.length
      ? h("div", { className: "space-y-3" }, webhookDeliveries.map((item) => h("div", {
        key: item.id,
        className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "event", className: "font-medium" }, item.event_type),
            h("div", { key: "meta", className: "text-sm text-muted" }, `${item.status} - ${formatDate(item.attempted_at)} - ${item.target_url}`)
          ]),
          h(Badge, { key: "status" }, item.status)
        ]),
        item.response_summary
          ? h("div", { key: "summary", className: "mt-2 text-sm text-muted" }, item.response_summary)
          : null
      ])))
      : h("div", { className: "text-sm text-muted" }, "No generic webhook deliveries were recorded for this run.")),
    h(Card, { key: "assignment", title: "Reviewer Assignment", description: "Assign ownership before review starts so the queue is explicitly owned." }, [
      h("div", { key: "assignment-fields", className: "grid gap-4 md:grid-cols-[1fr_auto]" }, [
        h(Field, { key: "reviewer", label: "Assigned Reviewer" }, h(Input, {
          value: reviewAssignee || "",
          onChange: (event) => onReviewAssigneeChange?.(event.target.value),
          placeholder: "reviewer id"
        })),
        h("div", { key: "button-wrap", className: "flex items-end" }, h(Button, {
          variant: "outline",
          onClick: onAssignReviewer,
          disabled: !detail || !reviewAssignee
        }, "Assign Reviewer"))
      ]),
      h("div", { key: "assignment-meta", className: "mt-3 text-sm text-muted" }, "Current reviewer: " + (summary.current_reviewer_id || run.review_workflow?.current_reviewer_id || "none"))
    ]),
    h(Card, { key: "review-decisions", title: "Review Decisions", description: "Run-level reviewer actions and rerun gates." }, [
      h("div", { key: "buttons", className: "flex flex-wrap gap-3" }, [
        h(Button, { key: "start", variant: "secondary", onClick: () => onRunReviewAction?.("start_review"), disabled: !detail }, "Start Review"),
        h(Button, { key: "approve", onClick: () => onRunReviewAction?.("approve_run"), disabled: !detail }, "Approve Run"),
        h(Button, { key: "reject", variant: "outline", onClick: () => onRunReviewAction?.("reject_run"), disabled: !detail }, "Reject Run"),
        h(Button, { key: "rerun", variant: "outline", onClick: () => onRunReviewAction?.("require_rerun"), disabled: !detail }, "Require Rerun")
      ]),
      h("div", { key: "hint", className: "mt-3 text-sm text-muted" }, "Use the run-level controls after finding adjudication is complete, or force a rerun when validation is still required.")
    ]),
    h(Card, { key: "handoff", title: "Reviewer Handoff", description: "Compact reviewer context for reassignment, triage, and unresolved findings." }, reviewSummary
      ? h("div", { className: "space-y-4" }, [
        h(DetailList, {
          key: "handoff-list",
          items: [
            { label: "Workflow Status", value: reviewSummary.handoff.status },
            { label: "Current Reviewer", value: reviewSummary.handoff.current_reviewer_id || "unassigned" },
            { label: "Unresolved Findings", value: String(reviewSummary.handoff.unresolved_finding_count) },
            { label: "Disposition Re-Review", value: String(reviewSummary.handoff.findings_needing_disposition_review_count || 0) },
            { label: "Expired Dispositions", value: String(reviewSummary.handoff.expired_disposition_count || 0) },
            { label: "Reopened Dispositions", value: String(reviewSummary.handoff.reopened_disposition_count || 0) },
            { label: "Review Age (hours)", value: String(reviewSummary.handoff.age_hours) },
            { label: "Last Action", value: reviewSummary.handoff.last_action_type || "none" },
            { label: "Last Updated", value: formatDate(reviewSummary.handoff.last_action_at) }
          ]
        }),
        reviewSummary.handoff.unresolved_finding_ids?.length
          ? h("div", { key: "unresolved", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Unresolved: ${reviewSummary.handoff.unresolved_finding_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.findings_needing_disposition_review_ids?.length
          ? h("div", { key: "disposition-rereview", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Disposition re-review: ${reviewSummary.handoff.findings_needing_disposition_review_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.latest_notes?.length
          ? h("div", { key: "latest-notes", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Latest Notes"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, reviewSummary.handoff.latest_notes.map((note, index) => h("li", { key: `${index}:${note}` }, note)))
          ])
          : null
      ])
      : h("div", { className: "text-sm text-muted" }, "No review summary is available for this run yet.")),
    h(Card, { key: "findings", title: "Findings And Results", description: "Drill into persisted evidence, control impact, remediation, and adjudication for a selected finding." }, findings.length
      ? h("div", { className: "grid gap-6 xl:grid-cols-[0.95fr_1.05fr]" }, [
        h("div", { key: "finding-list", className: "space-y-4" }, findings.map((finding) => {
        const state = findingReviewState?.[finding.id] || {};
        const summaryState = findingSummaries.find((item) => item.finding_id === finding.id) || null;
        const evaluationState = findingEvaluations?.evaluations?.find((item) => item.finding_id === finding.id) || null;
        return h("div", {
          key: finding.id,
          className: cn("rounded-2xl border px-4 py-4", selectedFinding?.id === finding.id ? "border-primary bg-primary/5" : "border-border bg-white/70")
        }, [
          h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "title", className: "font-medium" }, finding.title || finding.id),
              h("div", { key: "meta", className: "mt-1 text-sm text-muted" }, `${finding.id} - ${finding.severity || "unknown"} severity`)
            ]),
            h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
              h(Badge, { key: "severity" }, (summaryState?.current_severity || finding.severity || "unknown")),
              summaryState ? h(Badge, { key: "status" }, summaryState.disposition) : null
            ].filter(Boolean))
          ]),
          finding.summary ? h("div", { key: "summary", className: "mt-3 text-sm text-foreground" }, finding.summary) : null,
          summaryState ? h("div", { key: "status-row", className: "mt-3 grid gap-3 md:grid-cols-3 text-sm text-muted" }, [
            h("div", { key: "visibility" }, `Visibility ${summaryState.current_visibility || "unknown"}`),
            h("div", { key: "reviewer" }, `Last reviewer ${summaryState.last_reviewer_id || "none"}`),
            h("div", { key: "when" }, `Last action ${formatDate(summaryState.last_action_at)}`)
          ]) : null,
          summaryState?.notes?.length
            ? h("div", { key: "notes", className: "mt-3 rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm" }, summaryState.notes.join(" | "))
            : null,
          h("div", { key: "inspect", className: "mt-4" }, h(Button, {
            variant: selectedFinding?.id === finding.id ? "secondary" : "outline",
            onClick: () => onSelectFinding?.(finding.id)
          }, selectedFinding?.id === finding.id ? "Viewing Detail" : "View Detail")),
          h("div", { key: "controls", className: "mt-4 grid gap-4 md:grid-cols-3" }, [
            h(Field, { key: "visibility", label: "Visibility" }, h(Select, {
              value: state.visibility_override || summaryState?.current_visibility || "internal",
              onChange: (event) => onFindingReviewStateChange?.(finding.id, "visibility_override", event.target.value)
            }, [
              h("option", { key: "internal", value: "internal" }, "internal"),
              h("option", { key: "public", value: "public" }, "public")
            ])),
            h(Field, { key: "severity-select", label: "Downgrade Severity" }, h(Select, {
              value: state.updated_severity || summaryState?.current_severity || "medium",
              onChange: (event) => onFindingReviewStateChange?.(finding.id, "updated_severity", event.target.value)
            }, ["critical", "high", "medium", "low", "info"].map((level) => h("option", { key: level, value: level }, level)))),
            h(Field, { key: "notes", label: "Reviewer Notes" }, h(Input, {
              value: state.notes || "",
              onChange: (event) => onFindingReviewStateChange?.(finding.id, "notes", event.target.value),
              placeholder: "optional reviewer notes"
            }))
          ]),
          h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
            h(Button, { key: "confirm", variant: "secondary", onClick: () => onFindingReviewAction?.(finding, "confirm_finding") }, "Confirm"),
            h(Button, { key: "suppress", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "suppress_finding") }, "Suppress"),
            h(Button, { key: "downgrade", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "downgrade_severity") }, "Apply Downgrade"),
            h(Button, { key: "validate", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "request_validation") }, "Request Validation"),
            evaluationState?.runtime_followup_policy === "rerun_in_capable_env"
              ? h(Button, { key: "rerun-capable", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "rerun_in_capable_env") }, "Rerun In Capable Env")
              : null,
            evaluationState?.runtime_followup_policy === "manual_runtime_review"
              ? h(Button, { key: "manual-runtime-review", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "mark_manual_runtime_review_complete") }, "Manual Runtime Review Complete")
              : null,
            evaluationState?.runtime_followup_policy !== "none" && evaluationState?.runtime_followup_policy !== "not_applicable"
              ? h(Button, { key: "accept-runtime-gap", variant: "outline", onClick: () => onFindingReviewAction?.(finding, "accept_without_runtime_validation") }, "Accept Without Runtime Validation")
              : null
          ].filter(Boolean))
        ]);
      })),
        selectedFinding
          ? h("div", { key: "finding-detail", className: "space-y-4" }, [
            h("div", { key: "header", className: "rounded-2xl border border-border bg-white/70 px-4 py-4" }, [
              h("div", { key: "title-row", className: "flex items-start justify-between gap-3" }, [
                h("div", { key: "copy" }, [
                  h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, selectedFinding.category || "finding"),
                  h("h4", { key: "title", className: "mt-2 font-serif text-2xl" }, selectedFinding.title),
                  h("div", { key: "meta", className: "mt-2 text-sm text-muted" }, `${selectedFinding.id} - confidence ${selectedFinding.confidence} - source ${selectedFinding.source}`)
                ]),
                h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
                  h(Badge, { key: "severity" }, selectedFindingSummary?.current_severity || selectedFinding.severity),
                  selectedFindingSummary ? h(Badge, { key: "disposition" }, selectedFindingSummary.disposition) : null,
                  selectedFindingDisposition?.effective_disposition ? h(Badge, { key: "active-disposition" }, `${selectedFindingDisposition.effective_disposition.disposition_type} (${selectedFindingDisposition.effective_disposition.scope_level})`) : null
                ].filter(Boolean))
              ]),
              h("div", { key: "description", className: "mt-4 text-sm leading-6 text-foreground" }, selectedFinding.description)
            ]),
            selectedComparisonFinding
              ? h("div", { key: "comparison-context", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Compared against prior finding ${selectedComparisonFinding.id} from run ${compareRunId || "n/a"}.`)
              : null,
            h(Card, { key: "evidence", title: "Evidence And Impact", description: "Persisted evidence, linked standards, and direct control impact." }, [
              h(DetailList, {
                key: "evidence-summary",
                items: [
                  { label: "Publication State", value: selectedFinding.publication_state },
                  { label: "Needs Human Review", value: selectedFinding.needs_human_review ? "yes" : "no" },
                  { label: "Score Impact", value: String(selectedFinding.score_impact ?? 0) },
                  { label: "Standards", value: (selectedFinding.standards_refs_json || []).join(", ") || "n/a" },
                  { label: "Active Disposition", value: selectedFindingSummary?.active_disposition_type ? `${selectedFindingSummary.active_disposition_type} (${selectedFindingSummary.active_disposition_scope})` : "none" }
                ]
              }),
              h("div", { key: "evidence-list", className: "mt-4 rounded-2xl border border-border bg-stone-50 px-4 py-3" }, [
                h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Evidence"),
                Array.isArray(selectedFinding.evidence_json) && selectedFinding.evidence_json.length
                  ? h("ul", { key: "list", className: "mt-3 space-y-2 text-sm" }, selectedFinding.evidence_json.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  : h("div", { key: "empty", className: "mt-3 text-sm text-muted" }, "No persisted evidence strings are available for this finding."),
                selectedFindingEvaluation?.runtime_evidence_locations?.length
                  ? h("div", { key: "locations", className: "mt-4" }, [
                      h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Normalized Evidence Locations"),
                      h("ul", { key: "list", className: "mt-3 space-y-2 text-sm" }, selectedFindingEvaluation.runtime_evidence_locations.map((location, index) => h("li", { key: `${index}:${formatEvidenceLocation(location)}` }, formatEvidenceLocation(location))))
                    ])
                  : null
              ])
            ]),
            h(Card, { key: "controls", title: "Affected Controls", description: "Normalized control results linked to the selected finding." }, relatedControls.length
              ? h("div", { className: "space-y-3" }, relatedControls.map((control) => h("div", {
                key: control.control_id,
                className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, `${control.control_id} - ${control.title}`),
                    h("div", { key: "meta", className: "text-sm text-muted" }, `${control.framework} / ${control.standard_ref}`)
                  ]),
                  h(Badge, { key: "status" }, control.status)
                ]),
                Array.isArray(control.rationale_json) && control.rationale_json.length
                  ? h("div", { key: "rationale", className: "mt-2 text-sm text-muted" }, control.rationale_json.join(" "))
                  : null
              ])))
              : h("div", { className: "text-sm text-muted" }, "No normalized control results are linked to this finding.")),
            h(Card, { key: "runtime-evidence", title: "Runtime Validation Evidence", description: "Normalized build, test, and runtime-probe records captured from bounded sandbox execution." }, relatedRuntimeEvidence.length
              ? h("div", { className: "space-y-3" }, relatedRuntimeEvidence.map((item) => h("div", {
                key: item.id || item.evidence_id,
                className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, getEvidenceMetadata(item)?.normalized_artifact?.title || item.source_id || "sandbox evidence"),
                    h("div", { key: "meta", className: "text-sm text-muted" }, `${getEvidenceMetadata(item)?.phase || "unknown"} / ${getEvidenceMetadata(item)?.adapter || "unknown"} / ${getEvidenceMetadata(item)?.status || "unknown"}`)
                  ]),
                  h(Badge, { key: "status" }, getEvidenceMetadata(item)?.status || "unknown")
                ]),
                h("div", { key: "summary", className: "mt-2 text-sm" }, item.summary),
                getEvidenceLocations(item).length
                  ? h("ul", { key: "locations", className: "mt-2 space-y-1 text-sm text-muted" }, getEvidenceLocations(item).map((location, index) => h("li", { key: `${index}:${formatEvidenceLocation(location)}` }, formatEvidenceLocation(location))))
                  : null,
                runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact).length
                  ? h(DetailList, { key: "runtime-artifact-details", items: runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact) })
                  : null
              ])))
              : h("div", { className: "text-sm text-muted" }, "No normalized runtime validation evidence is linked to this finding.")),
            h(Card, { key: "review-grade", title: "Finding Evaluation", description: "Normalized evidence quality, duplicate/conflict analysis, and validation guidance derived from supervisor outputs." }, selectedFindingEvaluation
              ? h("div", { className: "space-y-4" }, [
                h("div", { key: "badge-row", className: "flex flex-wrap gap-2" }, [
                  h(Badge, { key: "sufficiency" }, `evidence ${selectedFindingEvaluation.evidence_sufficiency}`),
                  h(Badge, { key: "false-positive" }, `fp risk ${selectedFindingEvaluation.false_positive_risk}`),
                  h(Badge, { key: "runtime-validation-status" }, `runtime validation ${selectedFindingEvaluation.runtime_validation_status}`),
                  h(Badge, { key: "runtime-impact" }, `runtime ${selectedFindingEvaluation.runtime_impact}`),
                  selectedFindingEvaluation.runtime_followup_policy !== "none" && selectedFindingEvaluation.runtime_followup_policy !== "not_applicable"
                    ? h(Badge, { key: "runtime-followup" }, `follow-up ${selectedFindingEvaluation.runtime_followup_policy}`)
                    : null,
                  h(Badge, { key: "validation" }, selectedFindingEvaluation.validation_recommendation === "yes" ? "validation recommended" : "validation not required"),
                  h(Badge, { key: "next-action" }, `next ${selectedFindingEvaluation.next_action}`),
                  selectedFindingEvaluation.needs_disposition_review ? h(Badge, { key: "disposition-review" }, "disposition re-review") : null
                ]),
                h(DetailList, {
                  items: [
                    { label: "Evidence Sufficiency", value: selectedFindingEvaluation.evidence_sufficiency },
                    { label: "False Positive Risk", value: selectedFindingEvaluation.false_positive_risk },
                    { label: "Runtime Validation Status", value: selectedFindingEvaluation.runtime_validation_status },
                    { label: "Runtime Follow-up Policy", value: selectedFindingEvaluation.runtime_followup_policy },
                    { label: "Runtime Follow-up Resolution", value: selectedFindingEvaluation.runtime_followup_resolution },
                    { label: "Runtime Follow-up Outcome", value: selectedFindingEvaluation.runtime_followup_outcome },
                    { label: "Linked Rerun Run", value: selectedFindingEvaluation.runtime_followup_linked_run_id || "none" },
                    { label: "Runtime Impact", value: selectedFindingEvaluation.runtime_impact },
                    { label: "Runtime Evidence Count", value: String(selectedFindingEvaluation.runtime_evidence_ids?.length || 0) },
                    { label: "Validation Recommended", value: selectedFindingEvaluation.validation_recommendation },
                    { label: "Current Severity", value: selectedFindingEvaluation.current_severity },
                    { label: "Current Visibility", value: selectedFindingEvaluation.current_visibility },
                    { label: "Review Disposition", value: selectedFindingEvaluation.review_disposition },
                    { label: "Disposition Status", value: selectedFindingEvaluation.disposition_status },
                    { label: "Evidence Symbols", value: selectedFindingEvaluation.evidence_symbols?.join(", ") || "none" },
                    { label: "Waiver Owner", value: selectedFindingEvaluation.active_disposition_owner_id || "n/a" },
                    { label: "Waiver Reviewed", value: selectedFindingEvaluation.active_disposition_reviewed_at ? formatDate(selectedFindingEvaluation.active_disposition_reviewed_at) : "n/a" },
                    { label: "Review Due By", value: selectedFindingEvaluation.active_disposition_review_due_by ? formatDate(selectedFindingEvaluation.active_disposition_review_due_by) : "n/a" }
                  ]
                }),
                h("div", { key: "reasoning", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, selectedFindingEvaluation.evidence_quality_summary || selectedFindingEvaluation.reasoning_summary),
                selectedFindingEvaluation.active_disposition_reason
                  ? h("div", { key: "disposition-reason", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Disposition reason: ${selectedFindingEvaluation.active_disposition_reason}`)
                  : null,
                selectedFindingEvaluation.disposition_review_reason
                  ? h("div", { key: "disposition-review-reason", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, selectedFindingEvaluation.disposition_review_reason)
                  : null,
                selectedFindingEvaluation.runtime_followup_outcome_summary
                  ? h("div", { key: "runtime-followup-outcome", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, selectedFindingEvaluation.runtime_followup_outcome_summary)
                  : null,
                selectedFindingEvaluation.runtime_impact_reasons?.length
                  ? h("div", { key: "runtime-impact-reasons", className: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-sky-700" }, "Runtime Impact"),
                    h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-sky-900" }, selectedFindingEvaluation.runtime_impact_reasons.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  ])
                  : null,
                selectedFindingEvaluation.runtime_followup_policy !== "none" && selectedFindingEvaluation.runtime_followup_policy !== "not_applicable"
                  ? h("div", { key: "runtime-followup-panel", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-indigo-700" }, "Runtime Follow-up"),
                    h("div", { key: "body", className: "mt-2 text-sm text-indigo-950" }, `${selectedFindingEvaluation.runtime_validation_status} / ${selectedFindingEvaluation.runtime_followup_policy}`),
                    selectedFindingEvaluation.runtime_followup_resolution !== "none"
                      ? h("div", { key: "resolution", className: "mt-2 text-sm text-indigo-950" }, `resolved as ${selectedFindingEvaluation.runtime_followup_resolution}${selectedFindingEvaluation.runtime_followup_resolution_by ? ` by ${selectedFindingEvaluation.runtime_followup_resolution_by}` : ""}${selectedFindingEvaluation.runtime_followup_resolution_at ? ` on ${formatDate(selectedFindingEvaluation.runtime_followup_resolution_at)}` : ""}`)
                      : null,
                    selectedFindingEvaluation.runtime_followup_resolution_notes
                      ? h("div", { key: "resolution-notes", className: "mt-2 text-sm text-indigo-900" }, selectedFindingEvaluation.runtime_followup_resolution_notes)
                      : null,
                    h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-3" }, [
                      selectedFindingEvaluation.runtime_followup_outcome !== "none"
                        && selectedFindingEvaluation.runtime_followup_outcome !== "pending"
                        && selectedFindingEvaluation.runtime_followup_resolution !== "rerun_outcome_adopted"
                        ? h(Button, { key: "adopt-rerun", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "adopt_rerun_outcome") }, "Adopt Rerun Outcome")
                        : null,
                      selectedFindingEvaluation.runtime_followup_policy === "rerun_in_capable_env"
                        ? h(Button, { key: "rerun-capable", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "rerun_in_capable_env") }, "Rerun In Capable Env")
                        : null,
                      selectedFindingEvaluation.runtime_followup_policy === "manual_runtime_review"
                        ? h(Button, { key: "manual-review", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "mark_manual_runtime_review_complete") }, "Manual Runtime Review Complete")
                        : null,
                      h(Button, { key: "accept-runtime-gap", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "accept_without_runtime_validation") }, "Accept Without Runtime Validation")
                    ].filter(Boolean))
                  ])
                  : null,
                selectedFindingEvaluation.validation_reasons?.length
                  ? h("div", { key: "validation-reasons", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-amber-700" }, "Validation Reasons"),
                    h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-900" }, selectedFindingEvaluation.validation_reasons.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  ])
                  : null,
                selectedFindingEvaluation.runtime_evidence_summaries?.length
                  ? h("div", { key: "runtime-link-summaries", className: "rounded-2xl border border-sky-200 bg-white/80 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-sky-700" }, "Linked Runtime Evidence"),
                    h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-foreground" }, selectedFindingEvaluation.runtime_evidence_summaries.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  ])
                  : null,
                selectedFindingEvaluation.evidence_symbols?.length
                  ? h("div", { key: "evidence-identity", className: "rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-cyan-700" }, "Evidence Identity"),
                    h("div", { key: "body", className: "mt-2 text-sm text-cyan-950" }, selectedFindingEvaluation.evidence_symbols.join(", "))
                  ])
                  : null,
                selectedFindingEvaluation.duplicate_with_finding_ids?.length || selectedFindingEvaluation.conflict_with_finding_ids?.length
                  ? h("div", { key: "relationships", className: "grid gap-3 md:grid-cols-2" }, [
                    selectedFindingEvaluation.duplicate_with_finding_ids?.length
                      ? h("div", { key: "duplicates", className: "rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm" }, [
                        h("div", { key: "title", className: "font-semibold" }, "Possible Duplicates"),
                        h("div", { key: "body", className: "mt-2 text-muted" }, selectedFindingEvaluation.duplicate_with_finding_ids.join(", ")),
                        selectedFindingEvaluation.evidence_symbols?.length
                          ? h("div", { key: "reason", className: "mt-2 text-xs text-cyan-900" }, `Shared evidence identity: ${selectedFindingEvaluation.evidence_symbols.join(", ")}`)
                          : null
                      ])
                      : null,
                    selectedFindingEvaluation.conflict_with_finding_ids?.length
                      ? h("div", { key: "conflicts", className: "rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm" }, [
                        h("div", { key: "title", className: "font-semibold" }, "Conflicting Outcomes"),
                        h("div", { key: "body", className: "mt-2 text-muted" }, selectedFindingEvaluation.conflict_with_finding_ids.join(", ")),
                        selectedFindingEvaluation.evidence_symbols?.length
                          ? h("div", { key: "reason", className: "mt-2 text-xs text-amber-900" }, `Conflict linked by evidence identity: ${selectedFindingEvaluation.evidence_symbols.join(", ")}`)
                          : null
                      ])
                      : null
                  ].filter(Boolean))
                  : null,
                !selectedFindingEvaluation.evidence_quality_summary && relatedSupervisorGrade
                  ? h("div", { key: "fallback", className: "text-sm text-muted" }, relatedSupervisorGrade.reasoning_summary)
                  : null
              ])
              : relatedSupervisorGrade
                ? h(DetailList, {
                  items: [
                    { label: "Evidence Sufficiency", value: relatedSupervisorGrade.evidence_sufficiency },
                    { label: "False Positive Risk", value: relatedSupervisorGrade.false_positive_risk },
                    { label: "Validation Recommended", value: relatedSupervisorGrade.validation_recommendation },
                    { label: "Reasoning", value: relatedSupervisorGrade.reasoning_summary }
                  ]
                })
                : h("div", { className: "text-sm text-muted" }, "No normalized evaluation is available for this finding.")),
            h(Card, { key: "finding-dispositions", title: "Suppressions And Waivers", description: "Create explicit run suppressions or project waivers with reason and optional expiry." }, [
              h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
                h(Field, { key: "reason", label: "Reason" }, h(Textarea, {
                  value: selectedFindingState.disposition_reason || "",
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_reason", event.target.value),
                  placeholder: "Explain why this finding should be suppressed for this run or waived across the project."
                })),
                h(Field, { key: "expires", label: "Expiry (optional)" }, h(Input, {
                  type: "datetime-local",
                  value: formatDateInputValue(selectedFindingState.disposition_expires_at || ""),
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_expires_at", event.target.value ? new Date(event.target.value).toISOString() : "")
                }))
                ,
                h(Field, { key: "owner", label: "Project Waiver Owner" }, h(Input, {
                  value: selectedFindingState.disposition_owner_id || "",
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_owner_id", event.target.value),
                  placeholder: "security-owner"
                })),
                h(Field, { key: "reviewed-at", label: "Project Waiver Reviewed At" }, h(Input, {
                  type: "datetime-local",
                  value: formatDateInputValue(selectedFindingState.disposition_reviewed_at || ""),
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_reviewed_at", event.target.value ? new Date(event.target.value).toISOString() : "")
                })),
                h(Field, { key: "review-due-by", label: "Project Waiver Review Due By" }, h(Input, {
                  type: "datetime-local",
                  value: formatDateInputValue(selectedFindingState.disposition_review_due_by || ""),
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_review_due_by", event.target.value ? new Date(event.target.value).toISOString() : "")
                }))
              ]),
              h("div", { key: "controls", className: "mt-4 flex flex-wrap gap-3" }, [
                h(Button, { key: "run-suppress", variant: "outline", onClick: () => onFindingDispositionAction?.(selectedFinding, "suppression", "run") }, "Create Run Suppression"),
                h(Button, { key: "project-waive", variant: "outline", onClick: () => onFindingDispositionAction?.(selectedFinding, "waiver", "project") }, "Create Project Waiver"),
                selectedFindingState.editing_disposition_id
                  ? h(Button, { key: "save-edit", variant: "secondary", onClick: () => onSaveFindingDispositionEdit?.(selectedFinding) }, "Save Disposition Changes")
                  : null
              ]),
              selectedFindingSummary?.needs_disposition_review
                ? h("div", { key: "expired-note", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, "An earlier suppression or waiver expired for this finding. Re-review and create a new disposition only if it still applies.")
                : null,
              selectedFindingSummary?.disposition_review_reason
                ? h("div", { key: "review-reason", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, selectedFindingSummary.disposition_review_reason)
                : null,
              selectedFindingDisposition?.active_dispositions?.length
                ? h("div", { key: "active", className: "mt-4 space-y-3" }, selectedFindingDisposition.active_dispositions.map((item) => h("div", {
                  key: item.id,
                  className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm"
                }, [
                  h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                    h("div", { key: "kind", className: "font-medium" }, `${item.disposition_type} (${item.scope_level})`),
                    h(Badge, { key: "status" }, item.status)
                  ]),
                  h("div", { key: "meta", className: "mt-1 text-muted" }, `${item.created_by} - ${formatDate(item.created_at)}${item.expires_at ? ` - expires ${formatDate(item.expires_at)}` : ""}`),
                  item.metadata_json?.owner_id || item.metadata_json?.reviewed_at || item.metadata_json?.review_due_by
                    ? h("div", { key: "governance", className: "mt-1 text-muted" }, `owner ${item.metadata_json?.owner_id || "n/a"} - reviewed ${item.metadata_json?.reviewed_at ? formatDate(item.metadata_json.reviewed_at) : "n/a"} - review due ${item.metadata_json?.review_due_by ? formatDate(item.metadata_json.review_due_by) : "n/a"}`)
                    : null,
                  h("div", { key: "reason", className: "mt-2" }, item.reason),
                  h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-2" }, [
                    h(Button, { key: "edit", variant: "outline", onClick: () => onEditFindingDisposition?.(selectedFinding, item) }, "Load For Edit"),
                    h(Button, { key: "revoke", variant: "outline", onClick: () => onRevokeFindingDisposition?.(selectedFinding, item) }, "Revoke")
                  ])
                ])))
                : h("div", { key: "empty", className: "mt-4 text-sm text-muted" }, "No active suppression or waiver applies to this finding.")
              ,
              selectedFindingDispositionHistory.length
                ? h("div", { key: "history", className: "mt-4 space-y-3" }, selectedFindingDispositionHistory.map((item) => h("div", {
                  key: item.id,
                  className: "rounded-2xl border border-border bg-stone-50 px-4 py-3 text-sm"
                }, [
                  h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                    h("div", { key: "kind", className: "font-medium" }, `${item.disposition_type} (${item.scope_level})`),
                    h(Badge, { key: "status" }, item.status)
                  ]),
                  h("div", { key: "meta", className: "mt-1 text-muted" }, `${item.created_by} - ${formatDate(item.created_at)}${item.expires_at ? ` - expires ${formatDate(item.expires_at)}` : ""}${item.revoked_at ? ` - revoked ${formatDate(item.revoked_at)}` : ""}`),
                  h("div", { key: "reason", className: "mt-2" }, item.reason)
                ])))
                : null
            ]),
            h(Card, { key: "remediation", title: "Remediation And Observations", description: "Run-level remediation memo and nearby audit observations relevant to the selected finding." }, [
              remediation
                ? h("div", { key: "remediation-copy", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
                  h("div", { key: "summary", className: "text-sm" }, remediation.summary),
                  Array.isArray(remediation.checklist_json) && remediation.checklist_json.length
                    ? h("ul", { key: "checklist", className: "mt-3 space-y-2 text-sm text-muted" }, remediation.checklist_json.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                    : null
                ])
                : h("div", { key: "remediation-empty", className: "text-sm text-muted" }, "No remediation memo is available for this run."),
              h("div", { key: "observations", className: "mt-4 space-y-3" }, relatedObservations.length
                ? relatedObservations.map((item, index) => h("div", {
                  key: `${index}:${item.title || item.summary || "observation"}`,
                  className: "rounded-2xl border border-border bg-stone-50 px-4 py-3"
                }, [
                  h("div", { key: "title", className: "font-medium" }, item.title || "Observation"),
                  h("div", { key: "summary", className: "mt-2 text-sm text-muted" }, item.summary || "n/a"),
                  Array.isArray(item.evidence) && item.evidence.length
                    ? h("div", { key: "evidence", className: "mt-2 text-xs text-muted" }, item.evidence.join(" | "))
                    : null
                ]))
                : h("div", { className: "text-sm text-muted" }, "No related observations were matched for this finding."))
            ])
          ])
          : null
      ])
      : h("div", { className: "text-sm text-muted" }, "No persisted findings are available for this run.")),
    h(Card, { key: "notes-timeline", title: "Review Notes", description: "Reviewer notes separated from raw action history for faster handoff and audit context." }, h(ReviewNotesTimeline, { actions: reviewActions })),
    h(Card, { key: "evaluation-overview", title: "Evaluation Overview", description: "Run-level result evaluation derived from findings, supervisor review, and review workflow." }, findingEvaluations
      ? h("div", { className: "space-y-4" }, [
        h(DetailList, {
          key: "evaluation-summary",
          items: [
            { label: "Overall Evidence Sufficiency", value: findingEvaluations.overall_evidence_sufficiency },
            { label: "Overall False Positive Risk", value: findingEvaluations.overall_false_positive_risk },
            { label: "Needs Validation", value: String(findingEvaluations.findings_needing_validation_count) },
            { label: "Suppressed Findings", value: String(findingEvaluations.suppressed_finding_count || 0) },
            { label: "Waived Findings", value: String(findingEvaluations.waived_finding_count || 0) },
            { label: "Expired Dispositions", value: String(findingEvaluations.expired_disposition_count || 0) },
            { label: "Reopened Dispositions", value: String(findingEvaluations.reopened_disposition_count || 0) },
            { label: "Needs Disposition Re-Review", value: String(findingEvaluations.findings_needing_disposition_review_count || 0) },
            { label: "Duplicate Groups", value: String((findingEvaluations.duplicate_groups || []).length) },
            { label: "Conflict Pairs", value: String((findingEvaluations.conflict_pairs || []).length) },
            { label: "Runtime Validation Validated", value: String(findingEvaluations.runtime_validation_validated_count || 0) },
            { label: "Runtime Validation Blocked", value: String(findingEvaluations.runtime_validation_blocked_count || 0) },
            { label: "Runtime Validation Failed", value: String(findingEvaluations.runtime_validation_failed_count || 0) },
            { label: "Runtime Validation Recommended", value: String(findingEvaluations.runtime_validation_recommended_count || 0) },
            { label: "Runtime Follow-up Required", value: String(findingEvaluations.runtime_followup_required_count || 0) },
            { label: "Runtime Follow-up Resolved", value: String(findingEvaluations.runtime_followup_resolved_count || 0) },
            { label: "Runtime Reruns Requested", value: String(findingEvaluations.runtime_followup_rerun_requested_count || 0) },
            { label: "Runtime Follow-up Completed", value: String(findingEvaluations.runtime_followup_completed_count || 0) },
            { label: "Runtime Validated Findings", value: String(findingEvaluations.runtime_validated_finding_count || 0) },
            { label: "Runtime Strengthened", value: String(findingEvaluations.runtime_strengthened_finding_count || 0) },
            { label: "Runtime Weakened", value: String(findingEvaluations.runtime_weakened_finding_count || 0) },
            { label: "Runtime Generated", value: String(findingEvaluations.runtime_generated_finding_count || 0) },
            { label: "Sandbox Readiness", value: findingEvaluations.sandbox_execution?.readiness_status || "n/a" },
            { label: "Sandbox Runtime", value: findingEvaluations.sandbox_execution?.execution_runtime || "n/a" },
            { label: "Sandbox Failed Steps", value: String(findingEvaluations.sandbox_execution?.failed_step_count || 0) },
            { label: "Sandbox Blocked Steps", value: String(findingEvaluations.sandbox_execution?.blocked_step_count || 0) }
          ]
        }),
        findingEvaluations.runtime_strengthened_finding_count || findingEvaluations.runtime_weakened_finding_count || findingEvaluations.runtime_generated_finding_count || findingEvaluations.runtime_followup_required_count
          ? h("div", { key: "runtime-impact-summary", className: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-sky-700" }, "Runtime Impact Summary"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-sky-900" }, [
              h("li", { key: "validated" }, `${findingEvaluations.runtime_validation_validated_count || 0} finding(s) were runtime validated.`),
              h("li", { key: "blocked" }, `${findingEvaluations.runtime_validation_blocked_count || 0} finding(s) were blocked by host/runtime constraints and need a capable rerun environment.`),
                h("li", { key: "failed" }, `${findingEvaluations.runtime_validation_failed_count || 0} finding(s) have materially failed runtime validation and need manual runtime review.`),
                h("li", { key: "recommended" }, `${findingEvaluations.runtime_validation_recommended_count || 0} finding(s) still need runtime validation follow-up.`),
                h("li", { key: "resolved" }, `${findingEvaluations.runtime_followup_resolved_count || 0} runtime follow-up decision(s) were explicitly resolved in review.`),
                h("li", { key: "completed" }, `${findingEvaluations.runtime_followup_completed_count || 0} linked rerun follow-up(s) completed and are ready for reviewer adoption.`),
                h("li", { key: "rerun-requested" }, `${findingEvaluations.runtime_followup_rerun_requested_count || 0} finding(s) were explicitly marked for rerun in a capable environment.`),
                h("li", { key: "strengthened" }, `${findingEvaluations.runtime_strengthened_finding_count || 0} finding(s) were strengthened by runtime evidence.`),
              h("li", { key: "generated" }, `${findingEvaluations.runtime_generated_finding_count || 0} runtime-generated finding(s) were created from bounded validation outcomes.`),
              h("li", { key: "weakened" }, `${findingEvaluations.runtime_weakened_finding_count || 0} finding(s) still lack direct runtime evidence and remain validation-sensitive.`)
            ])
          ])
          : null,
        findingEvaluations.sandbox_execution?.attention_reasons?.length
          ? h("div", { key: "sandbox-attention", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-amber-700" }, "Sandbox Execution Attention"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-900" }, findingEvaluations.sandbox_execution.attention_reasons.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
          ])
          : null,
        findingEvaluations.conflict_pairs?.length
          ? h("div", { key: "conflict-list", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-red-700" }, "Conflicts"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-red-900" }, findingEvaluations.conflict_pairs.map((item, index) => h("li", { key: `${index}:${item.left_finding_id}:${item.right_finding_id}` }, `${item.left_finding_id} vs ${item.right_finding_id}: ${item.reason}`)))
          ])
          : null
      ])
      : h("div", { className: "text-sm text-muted" }, "No evaluation summary is available for this run.")),
    h(Card, { key: "disposition-lifecycle", title: "Disposition Lifecycle", description: "Track active suppressions/waivers, upcoming expiries, and findings that need explicit re-review." }, [
      h("div", { key: "grid", className: "grid gap-4 lg:grid-cols-4" }, [
        h("div", { key: "suppressed", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Suppressed"),
          suppressedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, suppressedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-muted" }, "No active suppressions.")
        ]),
        h("div", { key: "waived", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Waived"),
          waivedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, waivedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-muted" }, "No active waivers.")
        ]),
        h("div", { key: "expired", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-amber-700" }, "Expired / Re-Review"),
          expiredDispositionFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-900" }, expiredDispositionFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-amber-900/80" }, "No expired suppressions or waivers.")
        ]),
        h("div", { key: "due-soon", className: "rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-orange-700" }, "Due Soon"),
          dueSoonDispositionFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-orange-900" }, dueSoonDispositionFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}${item.active_disposition_hours_until_expiry !== null ? ` (${Math.max(0, Math.round(item.active_disposition_hours_until_expiry))}h)` : ""}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-orange-900/80" }, "No suppressions or waivers due soon.")
        ])
      ]),
      dueSoonDispositionByOwner.length ? h("div", { key: "due-soon-owners", className: "mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3" }, [
        h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-orange-700" }, "Due Soon By Owner"),
        h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-orange-900" }, dueSoonDispositionByOwner.map((item) => h("li", { key: item.owner_id }, `${item.owner_id}: ${item.count}${item.next_review_due_at ? ` (next ${formatDate(item.next_review_due_at)})` : ""}`)))
      ]) : null,
      dueSoonDispositionFindingSummaries.length ? h("div", { key: "due-soon-actions", className: "mt-4 flex flex-wrap gap-3" }, [
        h(Button, {
          key: "renew-due-soon",
          variant: "outline",
          onClick: () => bulkUpdateDispositionSet(
            dueSoonDispositionFindingSummaries
              .map((item) => resolvedFindingDispositions.find((candidate) => candidate.finding_id === item.finding_id)?.effective_disposition || null)
              .filter(Boolean),
            "renew"
          )
        }, `Extend Due-Soon By ${reviewCadence.renewalDays}d`),
        h(Button, {
          key: "revoke-due-soon",
          variant: "outline",
          onClick: () => bulkUpdateDispositionSet(
            dueSoonDispositionFindingSummaries
              .map((item) => resolvedFindingDispositions.find((candidate) => candidate.finding_id === item.finding_id)?.effective_disposition || null)
              .filter(Boolean),
            "revoke"
          )
        }, "Revoke Due-Soon")
      ]) : null,
      findingsNeedingDispositionReview.length
        ? h("div", { key: "rereview", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Re-review queue: ${findingsNeedingDispositionReview.map((item) => item.finding_id).join(", ")}`)
        : null
    ]),
    h(Card, { key: "discussion", title: "Review Discussion", description: "Comments are persisted separately from state-changing review actions." }, h(ReviewCommentsPanel, {
      comments: reviewComments,
      commentBody,
      commentFindingId,
      findings,
      onCommentBodyChange,
      onCommentFindingChange,
      onSubmitComment
    })),
    h(Card, { key: "audit-export", title: "Review Audit Export", description: "Export workflow, actions, comments, and derived summary as a single JSON bundle." }, h(Button, {
      variant: "outline",
      onClick: onExportReviewAudit,
      disabled: !detail
    }, "Download Review Audit")),
    h(Card, { key: "report-exports", title: "Report Exports", description: "Generate portable report formats from persisted findings and evaluation state." }, h("div", { className: "flex flex-wrap gap-3" }, [
      h(Button, {
        key: "executive",
        variant: "outline",
        onClick: () => onExportExecutiveReport?.("markdown"),
        disabled: !detail
      }, "Download Executive Summary"),
      h(Button, {
        key: "markdown",
        variant: "outline",
        onClick: onExportMarkdownReport,
        disabled: !detail
      }, "Download Markdown Report"),
      h(Button, {
        key: "sarif",
        variant: "outline",
        onClick: onExportSarifReport,
        disabled: !detail
      }, "Download SARIF Report")
    ])),
    h(Card, { key: "comparison-preview", title: "Run Comparison Preview", description: compareRunId ? "Live diff against the selected comparison run, including evidence-identity matches." : "Set a comparison run ID to preview changed, new, and resolved findings inline." }, comparisonLoading
      ? h("div", { className: "text-sm text-muted" }, "Loading comparison preview...")
      : !compareRunId
        ? h("div", { className: "text-sm text-muted" }, "No comparison run selected.")
        : !comparisonPayload
          ? h("div", { className: "text-sm text-muted" }, "Comparison preview unavailable for the selected run pair.")
          : h("div", { className: "space-y-4" }, [
            h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
              h("div", { key: "overview", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, ComparisonSummaryText(comparisonPayload)),
              h("div", { key: "score", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Score ${comparisonPayload.summary?.compare_to_overall_score ?? "n/a"} -> ${comparisonPayload.summary?.current_overall_score ?? "n/a"}`),
              h("div", { key: "runtime-followup", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Runtime follow-up ${comparisonPayload.summary?.compare_to_runtime_followup_required_count ?? 0} -> ${comparisonPayload.summary?.current_runtime_followup_required_count ?? 0}`),
              h("div", { key: "runtime-blocked", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Runtime blocked ${comparisonPayload.summary?.compare_to_runtime_validation_blocked_count ?? 0} -> ${comparisonPayload.summary?.current_runtime_validation_blocked_count ?? 0}`)
            ]),
            changedComparisonItems.length ? h("div", { key: "changed", className: "space-y-3" }, [
              h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Changed Findings"),
              h("div", { key: "navigation", className: "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, [
                h("div", { key: "position", className: "text-muted" }, selectedChangedComparisonIndex >= 0
                  ? `Viewing changed finding ${selectedChangedComparisonIndex + 1} of ${changedComparisonItems.length}.`
                  : `Select a changed finding to inspect both sides. ${changedComparisonItems.length} changed findings are available.`),
                h("div", { key: "actions", className: "flex flex-wrap gap-2" }, [
                  h(Button, {
                    key: "previous",
                    variant: "outline",
                    onClick: () => selectChangedComparisonByOffset(-1),
                    disabled: !changedComparisonItems.length
                  }, "Previous Changed"),
                  h(Button, {
                    key: "next",
                    variant: "outline",
                    onClick: () => selectChangedComparisonByOffset(1),
                    disabled: !changedComparisonItems.length
                  }, "Next Changed")
                ])
              ]),
              ...changedComparisonItems.slice(0, 6).map((item) => h("div", {
                key: `changed:${item.current_finding_id || item.signature}`,
                className: `rounded-2xl border px-4 py-3 ${selectedFindingId === item.current_finding_id || selectedComparisonFindingId === item.previous_finding_id ? "border-indigo-300 bg-indigo-50/70" : "border-border bg-white/70"}`
              }, [
                h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
                  h("div", { key: "title", className: "font-medium" }, `${item.title} (${item.category})`),
                  h("div", { key: "badge-wrap", className: "flex flex-wrap gap-2" }, [
                    h(Badge, { key: "match" }, item.match_strategy === "evidence_symbols" ? "matched by evidence identity" : "matched by finding signature"),
                    item.shared_evidence_symbols?.length ? h(Badge, { key: "symbols", tone: "success" }, item.shared_evidence_symbols.join(", ")) : null
                  ].filter(Boolean))
                ]),
                h("div", { key: "meta", className: "mt-1 text-xs text-muted" }, `${item.previous_finding_id} -> ${item.current_finding_id}`),
                item.changes?.length ? h("ul", { key: "changes", className: "mt-3 space-y-1 text-sm" }, item.changes.map((change) => h("li", { key: change.field }, `${change.field}: ${change.previous} -> ${change.current}`))) : null
              ].concat(item.current_finding_id ? [
                h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-3" }, [
                  h(Button, {
                    key: "current",
                    variant: "outline",
                    onClick: () => onSelectFinding?.(item.current_finding_id)
                  }, "Inspect Current Finding"),
                  item.previous_finding_id ? h(Button, {
                    key: "both",
                    variant: "outline",
                    onClick: () => onSelectComparisonPair?.(item.current_finding_id, item.previous_finding_id)
                  }, "Inspect Both Sides") : null,
                  item.previous_finding_id ? h(Button, {
                    key: "previous",
                    variant: "outline",
                    onClick: () => onSelectComparisonFinding?.(item.previous_finding_id)
                  }, "Inspect Prior Finding") : null
                ].filter(Boolean))
              ] : [])))
            ]) : h("div", { key: "no-changes", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, "No changed findings in this comparison."),
            h("div", { key: "other-groups", className: "grid gap-4 md:grid-cols-2" }, [
              h("div", { key: "new", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
                h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "New Findings"),
                comparisonPayload.new_findings?.length
                  ? h("div", { key: "list", className: "mt-2 space-y-2 text-sm" }, comparisonPayload.new_findings.slice(0, 6).map((item) => h("div", {
                    key: item.finding_id || item.signature,
                    className: "rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                  }, [
                    h("div", { key: "text" }, `${item.title} (${item.category})${item.evidence_symbols?.length ? ` [${item.evidence_symbols.join(", ")}]` : ""}`),
                    item.finding_id ? h("div", { key: "actions", className: "mt-2" }, h(Button, {
                      variant: "outline",
                      onClick: () => onSelectFinding?.(item.finding_id)
                    }, "Inspect Finding")) : null
                  ])))
                  : h("div", { key: "empty", className: "mt-2 text-sm text-muted" }, "No new findings.")
              ]),
              h("div", { key: "resolved", className: "rounded-2xl border border-border bg-white/70 px-4 py-3" }, [
                h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-muted" }, "Resolved Findings"),
                comparisonPayload.resolved_findings?.length
                  ? h("div", { key: "list", className: "mt-2 space-y-2 text-sm" }, comparisonPayload.resolved_findings.slice(0, 6).map((item) => h("div", {
                    key: item.finding_id || item.signature,
                    className: "rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                  }, [
                    h("div", { key: "text" }, `${item.title} (${item.category})${item.evidence_symbols?.length ? ` [${item.evidence_symbols.join(", ")}]` : ""}`),
                    item.finding_id ? h("div", { key: "actions", className: "mt-2" }, h(Button, {
                      variant: "outline",
                      onClick: () => onSelectComparisonFinding?.(item.finding_id)
                    }, "Inspect Prior Finding")) : null
                  ])))
                  : h("div", { key: "empty", className: "mt-2 text-sm text-muted" }, "No resolved findings.")
              ])
            ]),
            compareRunId ? h(Card, {
              key: "comparison-detail",
              title: "Prior Run Finding Detail",
              description: selectedComparisonFindingId ? "Inspect the matched finding from the comparison run." : "Choose a resolved finding to inspect prior-run context."
            }, comparisonDetailLoading
              ? h("div", { className: "text-sm text-muted" }, "Loading prior-run detail...")
              : !selectedComparisonFinding
                ? h("div", { className: "text-sm text-muted" }, "No prior-run finding selected.")
                : h("div", { className: "space-y-3" }, [
                  h(DetailList, {
                    key: "comparison-finding",
                    items: [
                      { label: "Finding", value: selectedComparisonFinding.title || selectedComparisonFinding.id },
                      { label: "Category", value: selectedComparisonFinding.category || "n/a" },
                      { label: "Severity", value: selectedComparisonEvaluation?.current_severity || selectedComparisonFinding.severity || "n/a" },
                      { label: "Confidence", value: selectedComparisonFinding.confidence ?? "n/a" },
                      { label: "Runtime Validation", value: selectedComparisonEvaluation?.runtime_validation_status || "not_applicable" },
                      { label: "Next Action", value: selectedComparisonEvaluation?.next_action || "ready_for_review" },
                      { label: "Evidence Symbols", value: selectedComparisonEvaluation?.evidence_symbols?.length ? selectedComparisonEvaluation.evidence_symbols.join(", ") : "none" }
                    ]
                  }),
                  comparisonDetailDiffs.length
                    ? h("div", { key: "diffs", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3" }, [
                        h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-indigo-700" }, "Changed Fields"),
                        h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-indigo-950" }, comparisonDetailDiffs.map((item) => h("li", { key: item.label }, `${item.label}: ${item.previous} -> ${item.current}`)))
                      ])
                    : h("div", { key: "no-diffs", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, "No field-level differences between the selected current and prior findings."),
                  selectedComparisonFinding.description ? h("div", { key: "description", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, selectedComparisonFinding.description) : null
                ]))
              : null
          ])),
    h(Card, { key: "indexed-exports", title: "Machine-readable Exports", description: "Per-run export catalog for versioned JSON contracts and portable report artifacts." }, indexedExports.length
      ? h("div", { className: "space-y-3" }, indexedExports.map((item) => h("div", {
        key: `${item.export_type}:${item.format}:${item.route}`,
        className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between" }, [
          h("div", { key: "meta", className: "space-y-1" }, [
            h("div", { key: "title", className: "font-medium text-foreground" }, `${item.export_type.replace(/_/g, " ")} (${item.format})`),
            h("div", { key: "filename", className: "text-sm text-muted" }, item.filename),
            h("div", { key: "route", className: "break-all text-xs font-mono text-muted" }, item.route),
            item.schema_name ? h("div", { key: "schema", className: "text-xs font-mono uppercase tracking-[0.18em] text-emerald-700" }, `Schema ${item.schema_name}`) : null
          ]),
          h("div", { key: "actions", className: "flex items-center gap-2" }, [
            item.schema_name ? h(Badge, { key: "kind", tone: "success" }, "Versioned JSON") : h(Badge, { key: "kind" }, "Portable"),
            h(Button, {
              key: "download",
              variant: "outline",
              onClick: () => onDownloadIndexedRunExport?.(item),
              disabled: !detail
            }, "Download")
          ])
        ])
      ])))
      : h("div", { className: "text-sm text-muted" }, "No export catalog is available for this run.")),
    h(Card, { key: "comparison-export", title: "Run Comparison", description: "Compare this run against a prior run or linked rerun and export the diff." }, [
      h("div", { key: "compare-controls", className: "grid gap-4 md:grid-cols-[1fr_auto_auto]" }, [
        h(Field, { key: "compare-to", label: "Compare To Run ID" }, h(Input, {
          value: compareRunId || "",
          onChange: (event) => onCompareRunIdChange?.(event.target.value),
          placeholder: "run id"
        })),
        h("div", { key: "json-wrap", className: "flex items-end" }, h(Button, {
          variant: "outline",
          onClick: () => onExportComparisonReport?.("json"),
          disabled: !detail || !compareRunId
        }, "Download Comparison JSON")),
        h("div", { key: "markdown-wrap", className: "flex items-end" }, h(Button, {
          variant: "outline",
          onClick: () => onExportComparisonReport?.("markdown"),
          disabled: !detail || !compareRunId
        }, "Download Comparison Markdown"))
      ]),
      h("div", { key: "hint", className: "mt-3 text-sm text-muted" }, "Use a previous run id or a linked rerun run id to export a direct run-to-run diff.")
    ]),
    h(Card, { key: "timeline", title: "Review Timeline", description: "Persisted reviewer actions, assignment history, and adjudication trail." }, h(ReviewActionTimeline, { actions: reviewActions })),
    h(Card, { key: "providers", title: "Provider Readiness", description: "Persisted preflight provider readiness at launch time." }, preflight?.provider_readiness?.length
      ? h("div", { className: "space-y-3" }, preflight.provider_readiness.map((item) => h("div", {
        key: item.provider_id,
        className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
          h("div", { key: "label", className: "font-medium" }, `${item.provider_id} (${item.provider_kind})`),
          h(Badge, { key: "status" }, item.status)
        ]),
        h("div", { key: "summary", className: "mt-2 text-sm text-muted" }, item.summary)
      ])))
      : h("div", { className: "text-sm text-muted" }, "No provider readiness data is available for this run."))
  ]);
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
    () => getModelOptionsForProvider(llmRegistry, runForm.llm_provider, runForm.llm_model),
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

  const dashboard = h("div", { className: "space-y-6" }, [
    h("div", { key: "metrics", className: "grid gap-4 xl:grid-cols-4" }, [
      h(MetricCard, { key: "runs", label: "Runs", value: String(stats.runs.total_runs || runs.length), hint: "Persisted audit history" }),
    h(MetricCard, { key: "reviews", label: "Pending Reviews", value: String(pendingReviews.length), hint: "Human workflow queue" }),
    h(MetricCard, { key: "targets", label: "Targets", value: String(stats.targets.total_targets || 0), hint: "Canonical target records" }),
    h(MetricCard, { key: "jobs", label: "Async Jobs", value: String(jobs.length), hint: "Durable background jobs" })
    ]),
    h(Card, { key: "scope", title: "Workspace Context", description: "All runs, jobs, reviews, settings, and attached documents are scoped to this selection." }, [
      h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4" }, [
        h(Field, { key: "workspace", label: "Workspace" }, Select({
          value: requestContext.workspaceId,
          onChange: (event) => {
            const workspaceId = event.target.value;
            const workspaceProjects = projects.filter((item) => item.workspace_id === workspaceId);
            updateRequestContext("workspaceId", workspaceId);
            updateRequestContext("projectId", workspaceProjects[0]?.id || "default");
          }
        }, workspaces.length ? workspaces.map((workspace) => h("option", { key: workspace.id, value: workspace.id }, workspace.name + " (" + workspace.id + ")")) : [h("option", { key: "default", value: "default" }, "default")])),
        h(Field, { key: "project", label: "Project" }, Select({
          value: requestContext.projectId,
          onChange: (event) => updateRequestContext("projectId", event.target.value)
        }, projects.length ? projects.map((project) => h("option", { key: project.id, value: project.id }, project.name + " (" + project.id + ")")) : [h("option", { key: "default", value: "default" }, "default")])),
        h(Field, { key: "actor", label: "Actor" }, h(Input, { value: requestContext.actorId, onChange: (event) => updateRequestContext("actorId", event.target.value) })),
        h(Field, { key: "api", label: "API Key" }, h(Input, { type: "password", value: requestContext.apiKey, onChange: (event) => updateRequestContext("apiKey", event.target.value), placeholder: "Optional in auth=none mode" })),
        h(Field, { key: "roles", label: "Effective Roles" }, h(Input, { value: effectiveRoles.join(", ") || "viewer", readOnly: true }))
      ]),
      h("div", { key: "trust-model", className: cn("mt-4 rounded-2xl border px-4 py-3 text-sm", authInfo.trusted_mode ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800") }, [
        h("div", { key: "title", className: "font-semibold" }, authInfo.trusted_mode ? "Trusted Local Mode" : "Authenticated Mode"),
        h("div", { key: "copy", className: "mt-1" }, authInfo.guidance),
        h("div", { key: "meta", className: "mt-2 font-mono text-xs uppercase tracking-[0.18em]" }, `auth=${authInfo.auth_mode} • review_roles=${authInfo.review_roles_security}`)
      ])
    ]),
    h("div", { key: "grid", className: "grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" }, [
      h(Card, { key: "launch", title: "Launch Run", description: "Trigger the normal engine path with persisted outputs and review workflow attached." }, [
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
            h("option", { key: "static", value: "static" }, "static"),
            h("option", { key: "build", value: "build" }, "build"),
            h("option", { key: "runtime", value: "runtime" }, "runtime"),
            h("option", { key: "validate", value: "validate" }, "validate")
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
      ]),
      h(Card, { key: "recent", title: "Recent Runs" }, runs.slice(0, 5).length ? runs.slice(0, 5).map((run) => h("div", {
        key: run.id,
        className: "mb-3 flex items-center justify-between rounded-2xl border border-border bg-white/70 px-4 py-3"
      }, [
        h("div", { key: "left" }, [
          h("div", { key: "name", className: "font-medium" }, run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id),
          h("div", { key: "date", className: "text-sm text-muted" }, formatDate(run.created_at))
        ]),
        h(Badge, { key: "status" }, run.status)
      ])) : h("div", { className: "text-sm text-muted" }, "No runs yet."))
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

  const runsView = h("div", { className: "grid gap-6 xl:grid-cols-[0.95fr_1.05fr]" }, [
    h(Card, { key: "table", title: "Persisted Runs", description: "Select a run to inspect stored summary, preflight planning, and executed configuration." }, h(RunsTable, {
      runs,
      selectedRunId,
      onSelect: setSelectedRunId
    })),
    h(RunDetailPanel, {
      key: "detail",
      detail: selectedRunDetail,
      loading: selectedRunLoading,
      comparison: selectedRunComparison,
      comparisonLoading: selectedRunComparisonLoading,
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

  const reviewsView = h("div", { className: "grid gap-6 xl:grid-cols-[0.9fr_1.1fr]" }, [
    h("div", { key: "left", className: "space-y-6" }, [
      h(Card, { key: "notifications", title: "My Review Notifications", description: "Unread and acknowledged review assignments for the current actor." }, reviewNotifications.length
        ? h("div", { className: "space-y-3" }, reviewNotifications.map((item) => h("div", {
          key: item.id,
          className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
        }, [
          h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "message", className: "font-medium" }, item.message),
              h("div", { key: "meta", className: "text-sm text-muted" }, `${item.notification_type} - ${item.run_id} - ${formatDate(item.created_at)}`)
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
      h(Card, { key: "queue-controls", title: "Queue Controls", description: "Filter the review queue by ownership, unread assignments, overdue work, and rerun follow-up." }, [
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
        h("div", { key: "stats", className: "mt-4 grid gap-3 md:grid-cols-6" }, [
          h("div", { key: "open", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Open queue: ${pendingReviews.length}`),
          h("div", { key: "overdue", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Overdue: ${pendingReviews.filter((run) => isOverdueReview(run)).length}`),
          h("div", { key: "mine", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, `Assigned to me: ${pendingReviews.filter((run) => (run.review_workflow?.current_reviewer_id || "") === (requestContext.actorId || "")).length}`),
          h("div", { key: "runtime-followup", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900" }, `Runtime follow-up: ${pendingReviews.filter((run) => runtimeFollowupCount(run) > 0).length}`),
          h("div", { key: "due-soon", className: "rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900" }, `Due soon: ${pendingReviews.filter((run) => dispositionDueSoonCount(run) > 0).length}`),
          h("div", { key: "disposition", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Disposition re-review: ${pendingReviews.filter((run) => Number(run.review_summary_counts?.findings_needing_disposition_review_count || 0) > 0).length}`)
        ])
        ]),
        h(Card, { key: "runtime-followup-queue", title: "Runtime Follow-up Queue", description: "Pending and linked rerun work items derived from runtime-sensitive findings." }, runtimeFollowups.length
          ? h("div", { className: "space-y-3" }, runtimeFollowups.map((item) => h("div", {
            key: item.id,
            className: "rounded-2xl border border-border bg-white/70 px-4 py-3"
          }, [
            h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "title", className: "font-medium" }, item.finding_title || item.finding_id),
                h("div", { key: "meta", className: "text-sm text-muted" }, `${item.run_id} - ${item.followup_policy} - ${formatDate(item.requested_at)}`)
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
        h(Card, { key: "queue", title: "Review Queue", description: "Runs waiting on human review, ordered by urgency and ownership." }, h(ReviewQueueList, {
        runs: filteredPendingReviews,
        selectedRunId,
        onSelect: setSelectedRunId,
        actorId: requestContext.actorId
      }))
    ]),
    h(RunDetailPanel, {
      key: "detail",
      detail: selectedRunDetail,
      loading: selectedRunLoading,
      comparison: selectedRunComparison,
      comparisonLoading: selectedRunComparisonLoading,
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
        h(Field, { key: "mode", label: "Run Mode" }, Select({ value: settings.audit_defaults_json.run_mode || "static", onChange: (event) => updateSettings("audit_defaults_json", "run_mode", event.target.value) }, [
          h("option", { key: "static", value: "static" }, "static"),
          h("option", { key: "build", value: "build" }, "build"),
          h("option", { key: "runtime", value: "runtime" }, "runtime"),
          h("option", { key: "validate", value: "validate" }, "validate")
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

  return h("div", { className: "grid min-h-screen lg:grid-cols-[280px_1fr]" }, [
    h("aside", { key: "aside", className: "border-b border-border bg-card/80 px-6 py-8 lg:border-b-0 lg:border-r" }, [
      h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.28em] text-muted" }, "OSS Console"),
      h("h1", { key: "title", className: "mt-4 font-serif text-4xl" }, "AI Security Harness"),
      h("p", { key: "copy", className: "mt-3 text-sm text-muted" }, "Self-hosted runs, review workflow, async jobs, and persisted audit settings in one surface."),
      h("nav", { key: "nav", className: "mt-8 grid gap-2" }, navItems.map(([itemView, label]) =>
        h("button", {
          key: itemView,
          onClick: () => setView(itemView),
          className: cn("rounded-2xl border px-4 py-3 text-left font-medium", view === itemView ? "border-primary bg-primary/10 text-primary" : "border-border bg-white/70")
        }, label)
      )),
      h("div", { key: "surface", className: "mt-8 rounded-3xl border border-border bg-stone-100/80 p-4 text-sm text-muted" }, "Query routes stay normalized. Artifact routes stay archival. Settings and attached documents are persisted through the same API.")
    ]),
    h("main", { key: "main", className: "px-5 py-6 lg:px-10" }, [
      h("header", { key: "header", className: "flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between" }, [
        h("div", { key: "heading" }, [
          h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.28em] text-muted" }, "Web UI"),
          h("h2", { key: "title", className: "mt-2 font-serif text-4xl" }, navItems.find(([item]) => item === view)?.[1] || "Dashboard")
        ]),
        h(Button, { key: "refresh", variant: "outline", onClick: load }, "Refresh")
      ]),
      h("div", { key: "auth-banner", className: cn("mt-6 rounded-2xl border px-4 py-3 text-sm", authInfo.trusted_mode ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800") }, [
        h("div", { key: "title", className: "font-semibold" }, authInfo.trusted_mode ? "Trusted Local Mode" : "Authenticated Mode"),
        h("div", { key: "body", className: "mt-1" }, authInfo.guidance),
        h("div", { key: "meta", className: "mt-2 font-mono text-xs uppercase tracking-[0.18em]" }, `auth=${authInfo.auth_mode} • review_roles=${authInfo.review_roles_security}`)
      ]),
      error ? h("div", { key: "error", className: "mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" }, error) : null,
      notice ? h("div", { key: "notice", className: "mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" }, notice) : null,
      h("div", { key: "view", className: "mt-6" }, view === "dashboard"
        ? dashboard
        : view === "runs"
          ? runsView
          : view === "jobs"
            ? jobsView
            : view === "followups"
              ? runtimeFollowupsView
              : view === "reviews"
                ? reviewsView
                : settingsView)
    ])
  ]);
}

createRoot(document.getElementById("root")).render(h(App));
