const { Component, createElement: createReactElement, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } = window.React;
const { createRoot } = window.ReactDOM;
const appConfig = window.HARNESS_WEB_UI_CONFIG || { apiBaseUrl: "/api" };
const publisherModeEnabled = Boolean(appConfig.publisher?.enabled || appConfig.publisherMode);
const publisherModeLabel = appConfig.publisher?.label || "Publisher";

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
  ["projects", "Projects"],
  ["runs", "Audits"],
  ["findings", "Findings"],
  ["remediation", "Remediation"],
  ["learning", "Learning"],
  ["system", "System"],
  ["reviews", "Findings"],
  ["followups", "Remediation"],
  ["jobs", "Jobs"],
  ["admin", "System"],
  ["settings", "System"]
];

const pageDescriptions = {
  dashboard: "Overview of active work, queue health, and next actions.",
  projects: "Manage project containers, targets, audit types, and scoped activity.",
  runs: "Launch audits and inspect detailed audit run records.",
  findings: "Work the cross-audit finding triage and review queue.",
  remediation: "Track confirmed finding remediation, validation, reruns, and closure evidence.",
  learning: "Review governed self-learning candidates, dry-run experiments, promotions, and rollback history.",
  system: "Configure Tethermark, inspect readiness, run benchmarks, and monitor operational traces.",
  jobs: "Track durable background work and retry or cancel jobs.",
  followups: "Manage runtime follow-up reruns and adoption decisions.",
  reviews: "Work the review inbox, assignments, and queued decisions.",
  admin: "Operator controls for local app state, smoke tests, benchmarks, tooling, and observability.",
  settings: "Configure agent models, Audit Type, governance, and integrations."
};

const navGroups = [
  {
    label: "General",
    items: [
      ["dashboard", "Dashboard", "grid"],
      ["projects", "Projects", "folder"],
      ["runs", "Audits", "play"],
      ["findings", "Findings", "users"],
      ["remediation", "Remediation", "bars"],
      ["learning", "Learning", "spark"],
      ["system", "System", "gear"]
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
  test_mode_json: {},
  learning_json: {}
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
    project: emptySettings
  }
};
const defaultAuthInfo = {
  auth_mode: "none",
  identity_enforced: false,
  trusted_mode: true,
  review_roles_security: "advisory",
  guidance: "No authentication is enforced. Review ownership is suitable only for trusted internal deployments and local operator use."
};
const emptyLlmRegistry = {
  providers: [],
  presets: [],
  environment_defaults: {}
};
const emptyIntegrationRegistry = [];
const emptyStaticToolsReadiness = {
  status: "ready_with_warnings",
  gate_policy: "warn",
  selected_tool_ids: [],
  tool_path: { managed_dirs: [], env_var: "HARNESS_STATIC_TOOLS_PATH" },
  tools: [],
  warnings: [],
  blockers: []
};
const runtimeSandboxBackendIds = [
  "gvisor_container",
  "rootless_podman",
  "podman",
  "docker",
  "docker_desktop",
  "landlock_process"
];
const defaultRuntimeSandboxSettings = {
  enabled: true,
  resolution_mode: "auto",
  preferred_backend: "auto",
  allowed_backends: ["gvisor_container", "rootless_podman", "podman", "docker", "docker_desktop"],
  allow_warning_backends: true,
  require_hardened_for_untrusted_repo: false,
  network_policy: "none",
  dependency_install_network: "explicit_only",
  max_duration_ms: 300000,
  step_timeout_ms: 60000,
  memory_limit_mb: 2048,
  pids_limit: 512,
  max_stdout_bytes: 2000,
  max_stderr_bytes: 2000
};
const emptyRuntimeSandboxReadiness = {
  provider_id: "local_runtime",
  status: "blocked",
  resolution: {
    selected_backend: "unavailable",
    candidates: [],
    readiness_status: "blocked",
    warnings: [],
    blockers: ["Runtime sandbox readiness has not been checked."]
  },
  policy_summary: {
    network_policy: "none",
    max_duration_ms: 300000,
    step_timeout_ms: 60000,
    memory_limit_mb: 2048,
    pids_limit: 512
  },
  setup_commands: [],
  checked_at: ""
};
const emptyMethodology = {
  methodology: null,
  static_baseline: null,
  audit_packages: [],
  control_catalog: [],
  management: {}
};
const defaultExternalAuditToolIds = ["scorecard", "semgrep", "trivy", "inspect", "garak", "pyrit"];
const mandatoryExternalAuditToolIds = ["scorecard", "semgrep", "trivy"];
const diagnosticsPiRepoUrl = "https://github.com/earendil-works/pi.git";
const diagnosticsPiCommit = "3d9e14d7482f4a99d5224926099bec0d17ff86fd";
const diagnosticsOpenClawRepoUrl = "https://github.com/openclaw/openclaw.git";
function normalizeExternalAuditToolIds(value) {
  const raw = Array.isArray(value) ? value : defaultExternalAuditToolIds;
  return [...new Set([...mandatoryExternalAuditToolIds, ...raw.filter((item) => defaultExternalAuditToolIds.includes(item))])];
}
const auditLaneCatalog = [
  { id: "repo_posture", title: "Repository posture", summary: "Repository hygiene, maintainer practices, security docs, release process, and governance signals." },
  { id: "supply_chain", title: "Supply chain", summary: "Dependency, CI/CD, provenance, build trust, and workflow integrity analysis." },
  { id: "agentic_controls", title: "Agentic controls", summary: "Tool-use safety, MCP exposure, autonomy boundaries, and agent-specific control review." },
  { id: "data_exposure", title: "Data exposure", summary: "Secrets, logging leakage, model I/O handling, and sensitive data exposure review." },
  { id: "runtime_validation", title: "Runtime validation", summary: "Bounded build, runtime, and validation-oriented checks." }
];
const agentConfigCatalog = [
  { id: "planner_agent", title: "Planner Agent", env_prefix: "AUDIT_LLM_PLANNER" },
  { id: "threat_model_agent", title: "Threat Model Agent", env_prefix: "AUDIT_LLM_THREAT_MODEL" },
  { id: "eval_selection_agent", title: "Evidence Selection Agent", env_prefix: "AUDIT_LLM_EVIDENCE_SELECTION" },
  { id: "lane_specialist_agent", title: "Audit Area Review Agent", env_prefix: "AUDIT_LLM_AREA_REVIEW" },
  { id: "audit_supervisor_agent", title: "Supervisor Agent", env_prefix: "AUDIT_LLM_SUPERVISOR" },
  { id: "remediation_agent", title: "Remediation Agent", env_prefix: "AUDIT_LLM_REMEDIATION" },
  { id: "learning_synthesizer_agent", title: "Learning Synthesizer Agent", env_prefix: "AUDIT_LLM_LEARNING_SYNTHESIZER", learning_synthesis: true }
];
const builtinPackageConfig = {
  "baseline-static": {
    run_mode: "static",
    enabled_lanes: ["repo_posture", "supply_chain"],
    max_agent_calls: 8,
    max_total_tokens: 80000,
    max_rerun_rounds: 1,
    publishability_threshold: "medium"
  },
  "agentic-static": {
    run_mode: "static",
    enabled_lanes: ["repo_posture", "supply_chain", "agentic_controls", "data_exposure"],
    max_agent_calls: 12,
    max_total_tokens: 140000,
    max_rerun_rounds: 1,
    publishability_threshold: "high"
  },
  "deep-static": {
    run_mode: "static",
    enabled_lanes: ["repo_posture", "supply_chain", "agentic_controls", "data_exposure"],
    max_agent_calls: 18,
    max_total_tokens: 240000,
    max_rerun_rounds: 2,
    publishability_threshold: "high"
  },
  "runtime-validated": {
    run_mode: "runtime",
    enabled_lanes: ["repo_posture", "supply_chain", "agentic_controls", "data_exposure", "runtime_validation"],
    max_agent_calls: 20,
    max_total_tokens: 260000,
    max_rerun_rounds: 2,
    publishability_threshold: "high"
  },
  "premium-comprehensive": {
    run_mode: "runtime",
    enabled_lanes: ["repo_posture", "supply_chain", "agentic_controls", "data_exposure", "runtime_validation"],
    max_agent_calls: 28,
    max_total_tokens: 400000,
    max_rerun_rounds: 3,
    publishability_threshold: "high"
  }
};
const auditPackageDisplayOrder = ["baseline-static", "agentic-static", "deep-static", "runtime-validated"];
const hiddenOssAuditPackages = new Set(["premium-comprehensive"]);
const builtinAuditPackages = auditPackageDisplayOrder.map((id) => ({
  id,
  title: {
    "baseline-static": "Baseline Static",
    "agentic-static": "Agentic Static",
    "deep-static": "Deep Static",
    "runtime-validated": "Runtime Validated"
  }[id] || id,
  description: {
    "baseline-static": "Fast repository posture and supply-chain baseline.",
    "agentic-static": "Standard evidence-grounded static review for AI and agent repositories.",
    "deep-static": "Deeper static audit with expanded agent and evidence review budget.",
    "runtime-validated": "Runtime-oriented validation using the Local Runtime Sandbox when ready."
  }[id] || "Audit package preset.",
  run_mode: builtinPackageConfig[id]?.run_mode || "static",
  enabled_lanes: builtinPackageConfig[id]?.enabled_lanes || [],
  max_agent_calls: builtinPackageConfig[id]?.max_agent_calls || 0,
  max_total_tokens: builtinPackageConfig[id]?.max_total_tokens || 0,
  max_rerun_rounds: builtinPackageConfig[id]?.max_rerun_rounds || 0,
  publishability_threshold: builtinPackageConfig[id]?.publishability_threshold || "high"
}));

const learningCandidateTypeLabels = {
  scoped_suppression_suggestion: "Disposition review",
  severity_calibration_suggestion: "Severity calibration",
  evidence_requirement_adjustment: "Evidence requirements",
  prompt_improvement_candidate: "Prompt improvement",
  eval_fixture_candidate: "Eval fixture",
  runtime_followup_heuristic: "Runtime follow-up",
  duplicate_grouping_signature: "Duplicate grouping"
};

const learningEventLabels = {
  review_false_positive: "false-positive review",
  review_out_of_scope: "out-of-scope review",
  review_accepted_risk: "accepted-risk review",
  review_needs_validation: "validation request",
  finding_disposition: "active disposition",
  finding_quality_gap: "finding quality gap",
  runtime_followup_outcome: "runtime follow-up outcome",
  remediation_state: "remediation status change",
  duplicate_or_conflict: "duplicate or conflict signal",
  assistant_confirmed_action: "assistant-confirmed action"
};

const defaultLearningSettings = {
  operator_consent_version: 1,
  enabled: false,
  trigger_mode: "manual",
  event_driven_enabled: false,
  scheduled_enabled: false,
  scheduled_interval_minutes: 60,
  sync_limit: 100,
  llm_synthesis_enabled: false,
  llm_min_source_signals: 3,
  llm_min_distinct_runs: 2,
  llm_always_high_risk: true,
  llm_always_governance_impacting: true,
  llm_nightly_consolidation: false,
  llm_manual_synthesis_enabled: false,
  llm_max_calls_per_day: 10,
  llm_send_source_excerpts: false,
  require_dry_run_before_promotion: true,
  auto_expire_days: 90
};

function getLearningSettings(settingsLike) {
  return {
    ...defaultLearningSettings,
    ...((settingsLike?.learning_json && typeof settingsLike.learning_json === "object") ? settingsLike.learning_json : {})
  };
}

function getCandidateSynthesisStatus(candidate) {
  const synthesis = candidate?.metadata_json?.llm_synthesis || null;
  if (!synthesis) return { label: "Synthesis pending", detail: "LLM synthesis has not run for this candidate yet." };
  if (synthesis.status === "completed") {
    return {
      label: "LLM synthesized",
      detail: `${synthesis.provider || "provider"}${synthesis.model ? ` / ${synthesis.model}` : ""}${synthesis.reason ? ` / ${humanizeLearningIdentifier(synthesis.reason)}` : ""}`
    };
  }
  if (synthesis.status === "inactive") {
    return { label: "Synthesis inactive", detail: humanizeLearningIdentifier(synthesis.reason || "provider not configured") };
  }
  return { label: humanizeLearningIdentifier(synthesis.status || "Synthesis status"), detail: humanizeLearningIdentifier(synthesis.reason || "") };
}

function getVisibleAuditPackages(auditPackages) {
  const visible = (auditPackages || []).filter((item) => item?.id && !hiddenOssAuditPackages.has(item.id));
  return [...visible].sort((a, b) => {
    const aIndex = auditPackageDisplayOrder.indexOf(a.id);
    const bIndex = auditPackageDisplayOrder.indexOf(b.id);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return String(a.title || a.id).localeCompare(String(b.title || b.id));
  });
}

function sentenceCase(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1) : "";
}

function humanizeLearningIdentifier(value) {
  return sentenceCase(String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
}

function asLearningArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function getLearningSignatureLabel(candidate) {
  const raw = asLearningArray(candidate?.affected_finding_signatures_json)[0]
    || String(candidate?.proposed_change_json?.finding_signature || "");
  const normalized = raw.trim();
  if (!normalized || normalized === "run-level-signal") return "Run-level review activity";
  const parts = normalized.includes("::") ? normalized.split("::") : ["", normalized];
  return humanizeLearningIdentifier(parts[1] || parts[0] || normalized);
}

function getLearningScopeLabel(candidate) {
  if (candidate?.scope_type === "run") return "this run";
  if (candidate?.scope_type === "target") return "this target";
  return candidate?.scope_id && candidate.scope_id !== "default" ? `project ${candidate.scope_id}` : "project-wide scope";
}

function getLearningSentenceScopeLabel(candidate) {
  if (candidate?.scope_type === "run") return "this run";
  if (candidate?.scope_type === "target") return "this target";
  return candidate?.scope_id && candidate.scope_id !== "default" ? `project ${candidate.scope_id}` : "the project";
}

function getLearningSourceCount(candidate) {
  const expected = Number(candidate?.expected_effect_json?.source_event_count);
  if (Number.isFinite(expected) && expected > 0) return expected;
  const ids = asLearningArray(candidate?.source_event_ids_json);
  if (ids.length) return ids.length;
  const match = String(candidate?.summary || "").match(/\b(\d+)\s+learning signal/i);
  return match ? Number(match[1]) : 1;
}

function getLearningEventTypeLabels(candidate) {
  const types = asLearningArray(candidate?.metadata_json?.event_types);
  return types.map((type) => learningEventLabels[type] || humanizeLearningIdentifier(type)).filter(Boolean);
}

function getLearningSourceEvents(candidate, events) {
  const sourceIds = new Set(asLearningArray(candidate?.source_event_ids_json));
  return (events || []).filter((event) => sourceIds.has(event.id));
}

function getLearningSourceRunCount(candidate, sourceEvents = []) {
  const sourceRunIds = asLearningArray(candidate?.expected_effect_json?.source_run_ids);
  if (sourceRunIds.length) return sourceRunIds.length;
  return new Set(sourceEvents.map((event) => event.run_id).filter(Boolean)).size;
}

function getLearningDispositionTypes(sourceEvents = []) {
  return [...new Set(sourceEvents
    .filter((event) => event.event_type === "finding_disposition")
    .map((event) => String(event.payload_json?.disposition_type || "").trim())
    .filter(Boolean))];
}

function getLearningSourceLabels(candidate, sourceEvents = []) {
  if (sourceEvents.length) {
    const labels = sourceEvents.map((event) => {
      if (event.event_type === "finding_disposition") {
        const dispositionType = String(event.payload_json?.disposition_type || "").trim();
        if (dispositionType === "waiver") return "accepted-risk waiver";
        if (dispositionType === "suppression") return "suppression";
      }
      return learningEventLabels[event.event_type] || humanizeLearningIdentifier(event.event_type);
    });
    return [...new Set(labels)].filter(Boolean);
  }
  return getLearningEventTypeLabels(candidate);
}

function getLearningCandidateDecisionLabel(candidate, sourceEvents = []) {
  const kind = String(candidate?.candidate_type || "");
  const dispositionTypes = getLearningDispositionTypes(sourceEvents);
  if (kind === "severity_calibration_suggestion" && dispositionTypes.includes("waiver")) return "Accepted-risk pattern";
  if (kind === "severity_calibration_suggestion") return "Severity calibration pattern";
  if (kind === "scoped_suppression_suggestion" && dispositionTypes.includes("suppression")) return "Suppression pattern";
  if (kind === "scoped_suppression_suggestion") return "Disposition pattern";
  if (kind === "evidence_requirement_adjustment") return "Evidence requirement pattern";
  if (kind === "runtime_followup_heuristic") return "Runtime follow-up pattern";
  if (kind === "duplicate_grouping_signature") return "Duplicate grouping pattern";
  if (kind === "prompt_improvement_candidate") return "Prompt guidance pattern";
  return learningCandidateTypeLabels[kind] || humanizeLearningIdentifier(kind || "learning candidate");
}

function getLearningRiskExplanation(candidate) {
  const kind = String(candidate?.candidate_type || "");
  if (kind === "scoped_suppression_suggestion") return "High: promotion can make future suppression decisions easier to approve.";
  if (kind === "severity_calibration_suggestion") return "High: promotion can influence accepted-risk or severity review guidance.";
  if (kind === "evidence_requirement_adjustment") return "Medium: promotion changes review guidance, not finding suppression.";
  return `${humanizeLearningIdentifier(candidate?.risk_level || "medium")}: promotion remains approval-gated.`;
}

function getLearningPromotionImpact(candidate, sourceEvents = []) {
  const kind = String(candidate?.candidate_type || "");
  const scope = getLearningSentenceScopeLabel(candidate);
  const dispositionTypes = getLearningDispositionTypes(sourceEvents);
  if (kind === "severity_calibration_suggestion" && dispositionTypes.includes("waiver")) {
    return `Would record an approval-gated accepted-risk learning pattern for ${scope}; it does not automatically waive findings.`;
  }
  if (kind === "severity_calibration_suggestion") {
    return `Would record severity calibration guidance for ${scope}; it does not automatically lower severity.`;
  }
  if (kind === "scoped_suppression_suggestion") {
    return `Would record suppression guidance for ${scope}; it does not automatically suppress findings.`;
  }
  if (kind === "evidence_requirement_adjustment") {
    return `Would record evidence guidance for ${scope}; reviewers still decide whether a finding is valid.`;
  }
  return String(candidate?.expected_effect_json?.expected_operator_value || "Would record an approval-gated learning artifact.");
}

function getLearningEventActionLabel(event) {
  const payload = event?.payload_json || {};
  if (event?.event_type === "finding_disposition") {
    const dispositionType = String(payload.disposition_type || "").trim();
    const typeLabel = dispositionType === "waiver" ? "Accepted-risk waiver" : dispositionType === "suppression" ? "Suppression" : "Disposition";
    const scope = payload.scope_level ? `${humanizeLearningIdentifier(payload.scope_level)} scope` : "";
    const reason = String(payload.reason || "").trim();
    return `${typeLabel}${scope ? ` (${scope})` : ""}${reason ? `: ${reason}` : ""}`;
  }
  if (event?.event_type === "review_needs_validation") {
    const intent = String(payload.validation_intent || "").trim();
    if (intent === "rerun_required") return "Reviewer requested a capable-environment rerun.";
    if (intent === "runtime_validation") return "Reviewer asked for runtime validation before publication.";
    if (intent === "manual_review") return "Reviewer requested manual validation.";
    return "Reviewer requested more validation.";
  }
  if (event?.event_type === "review_accepted_risk") {
    const previousSeverity = String(payload.previous_severity || "").trim();
    const updatedSeverity = String(payload.updated_severity || "").trim();
    if (previousSeverity && updatedSeverity) return `Reviewer changed severity from ${previousSeverity} to ${updatedSeverity}.`;
    return "Reviewer accepted risk or calibrated severity.";
  }
  return event?.signal_summary || humanizeLearningIdentifier(event?.event_type || "learning signal");
}

function compactLearningEventActions(sourceEvents = [], fallback = "") {
  const seen = new Set();
  const items = [];
  for (const event of sourceEvents) {
    const label = getLearningEventActionLabel(event).replace(/\s+/g, " ").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    items.push(label.endsWith(".") ? label : `${label}.`);
    if (items.length >= 3) break;
  }
  if (items.length) return items;
  const compact = compactLearningRationale(fallback);
  return compact ? [compact] : [];
}

function compactLearningRationale(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const seen = new Set();
  const compact = [];
  for (const sentence of sentences) {
    const cleaned = sentenceCase(sentence.trim());
    const normalized = cleaned.toLowerCase();
    if (!cleaned || seen.has(normalized)) continue;
    seen.add(normalized);
    compact.push(/[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`);
    if (compact.length >= 3) break;
  }
  return compact.join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLearningCandidateRationale(value, sourcePhrase) {
  let rationale = compactLearningRationale(value);
  if (!rationale) return `${sourcePhrase} support this candidate.`;
  const sourceLead = `${sourcePhrase} support this candidate:`;
  const duplicateLead = new RegExp(`^(${escapeRegExp(sourceLead)}\\s*){2,}`, "i");
  rationale = rationale.replace(duplicateLead, `${sourceLead} `).replace(/\s+/g, " ").trim();
  if (rationale.toLowerCase().startsWith(sourceLead.toLowerCase())) return rationale;
  return `${sourceLead} ${rationale}`;
}

function getLearningCandidateDisplay(candidate, sourceEvents = []) {
  const subject = getLearningSignatureLabel(candidate);
  const scope = getLearningScopeLabel(candidate);
  const sentenceScope = getLearningSentenceScopeLabel(candidate);
  const count = getLearningSourceCount(candidate);
  const runCount = getLearningSourceRunCount(candidate, sourceEvents);
  const signalPhrase = `${count} ${count === 1 ? "signal" : "signals"}`;
  const typeLabels = getLearningSourceLabels(candidate, sourceEvents);
  const sourcePhrase = typeLabels.length ? `${signalPhrase} from ${typeLabels.join(", ")}` : signalPhrase;
  const kind = String(candidate?.candidate_type || "");
  const decisionLabel = getLearningCandidateDecisionLabel(candidate, sourceEvents);
  const recurrence = runCount > 1 ? `across ${runCount} runs` : "in this run";
  const evidenceItems = compactLearningEventActions(sourceEvents, candidate?.rationale);
  const rationale = evidenceItems.length ? evidenceItems.join(" ") : normalizeLearningCandidateRationale(candidate?.rationale, sourcePhrase);
  const promotionImpact = getLearningPromotionImpact(candidate, sourceEvents);
  const riskExplanation = getLearningRiskExplanation(candidate);

  if (kind === "scoped_suppression_suggestion") {
    return {
      typeLabel: decisionLabel,
      title: `${decisionLabel}: ${subject}`,
      summary: `${sourcePhrase} ${recurrence} indicate reviewers may be suppressing this pattern for ${sentenceScope}.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  if (kind === "evidence_requirement_adjustment") {
    return {
      typeLabel: decisionLabel,
      title: `${decisionLabel}: ${subject}`,
      summary: `${sourcePhrase} ${recurrence} indicate this pattern needs stronger evidence before review.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  if (kind === "runtime_followup_heuristic") {
    return {
      typeLabel: learningCandidateTypeLabels[kind],
      title: `Tune runtime follow-up handling: ${subject}`,
      summary: `${sourcePhrase} can guide future runtime validation decisions for similar findings.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  if (kind === "duplicate_grouping_signature") {
    return {
      typeLabel: learningCandidateTypeLabels[kind],
      title: `Improve duplicate grouping: ${subject}`,
      summary: `${sourcePhrase} show similar findings may need stronger duplicate or conflict grouping.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  if (kind === "severity_calibration_suggestion") {
    const hasWaiver = getLearningDispositionTypes(sourceEvents).includes("waiver");
    return {
      typeLabel: decisionLabel,
      title: `${decisionLabel}: ${subject}`,
      summary: hasWaiver
        ? `${sourcePhrase} ${recurrence} indicate reviewers accepted this pattern as risk for ${sentenceScope}.`
        : `${sourcePhrase} ${recurrence} indicate reviewers may be lowering severity for this pattern in ${sentenceScope}.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  if (kind === "prompt_improvement_candidate") {
    return {
      typeLabel: learningCandidateTypeLabels[kind],
      title: `Review prompt improvement: ${subject}`,
      summary: `${sourcePhrase} suggest audit guidance may need clarification for this pattern.`,
      rationale,
      scopeLabel: scope,
      evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
      promotionImpact,
      riskExplanation
    };
  }
  return {
    typeLabel: learningCandidateTypeLabels[kind] || humanizeLearningIdentifier(kind || "learning candidate"),
    title: `Add eval fixture: ${subject}`,
    summary: `${sourcePhrase} are suitable for a governed regression fixture.`,
    rationale,
    scopeLabel: scope,
    evidenceLabel: `${count} source ${count === 1 ? "signal" : "signals"} in ${runCount || 1} ${runCount === 1 ? "run" : "runs"}`,
    promotionImpact,
    riskExplanation
  };
}

function isGenericLearningCandidate(candidate) {
  const signature = asLearningArray(candidate?.affected_finding_signatures_json)[0]
    || String(candidate?.proposed_change_json?.finding_signature || "");
  const eventTypes = getLearningEventTypeLabels(candidate);
  return candidate?.candidate_type === "scoped_suppression_suggestion"
    && (!signature || signature === "run-level-signal")
    && (eventTypes.length === 0 || eventTypes.every((label) => label === "active disposition"));
}

function isUnderSupportedLearningCandidate(candidate) {
  const sourceRunIds = asLearningArray(candidate?.expected_effect_json?.source_run_ids);
  const sourceEventCount = Number(candidate?.expected_effect_json?.source_event_count || asLearningArray(candidate?.source_event_ids_json).length);
  const highRiskBehaviorChange = ["scoped_suppression_suggestion", "severity_calibration_suggestion"].includes(String(candidate?.candidate_type || ""));
  if (highRiskBehaviorChange) return sourceRunIds.length < 2;
  return !Number.isFinite(sourceEventCount) || sourceEventCount < 2;
}

function isMismatchedDispositionLearningCandidate(candidate, sourceEvents = []) {
  const dispositionTypes = getLearningDispositionTypes(sourceEvents);
  if (!dispositionTypes.length) return false;
  const kind = String(candidate?.candidate_type || "");
  if (kind === "scoped_suppression_suggestion") return dispositionTypes.includes("waiver");
  if (kind === "severity_calibration_suggestion") return dispositionTypes.includes("suppression");
  return false;
}

function isMixedKindLearningCandidate(candidate, sourceEvents = []) {
  if (isMismatchedDispositionLearningCandidate(candidate, sourceEvents)) return true;
  const rawEventTypes = asLearningArray(candidate?.metadata_json?.event_types);
  if (!rawEventTypes.length) return false;
  const allowedByKind = {
    scoped_suppression_suggestion: ["review_false_positive", "review_out_of_scope", "finding_disposition"],
    severity_calibration_suggestion: ["review_accepted_risk", "finding_disposition"],
    evidence_requirement_adjustment: ["finding_quality_gap", "review_needs_validation"],
    prompt_improvement_candidate: ["assistant_confirmed_action"],
    eval_fixture_candidate: ["remediation_state", "assistant_confirmed_action"],
    runtime_followup_heuristic: ["runtime_followup_outcome"],
    duplicate_grouping_signature: ["duplicate_or_conflict"]
  };
  const allowed = new Set(allowedByKind[String(candidate?.candidate_type || "")] || []);
  return rawEventTypes.some((eventType) => !allowed.has(eventType));
}

function isInvalidLearningCandidate(candidate, sourceEvents = []) {
  return isGenericLearningCandidate(candidate) || isUnderSupportedLearningCandidate(candidate) || isMixedKindLearningCandidate(candidate, sourceEvents);
}

function defaultLanesForRunMode(value) {
  if (value === "runtime" || value === "auto") {
    return ["repo_posture", "supply_chain", "agentic_controls", "data_exposure", "runtime_validation"];
  }
  return ["repo_posture", "supply_chain", "agentic_controls", "data_exposure"];
}

function resolvePackageFormConfig(auditPackages, packageId) {
  const packageDefinition = getAuditPackageDefinition(auditPackages, packageId);
  if (packageDefinition) {
    return {
      run_mode: normalizeRunModeSelection(packageDefinition.run_mode),
      enabled_lanes: [...(packageDefinition.enabled_lanes || [])],
      max_agent_calls: Number(packageDefinition.max_agent_calls || 0),
      max_total_tokens: Number(packageDefinition.max_total_tokens || 0),
      max_rerun_rounds: Number(packageDefinition.max_rerun_rounds || 0),
      publishability_threshold: packageDefinition.publishability_threshold || "high"
    };
  }
  return builtinPackageConfig[packageId] || {
    run_mode: "static",
    enabled_lanes: defaultLanesForRunMode("static"),
    max_agent_calls: 12,
    max_total_tokens: 140000,
    max_rerun_rounds: 1,
    publishability_threshold: "high"
  };
}

function buildEmptyAgentConfigs() {
  return Object.fromEntries(agentConfigCatalog.map((item) => [item.id, { provider: "", model: "", api_key: "" }]));
}

function buildAgentConfigsFromOverrides(agentOverrides) {
  const configs = buildEmptyAgentConfigs();
  for (const agent of agentConfigCatalog) {
    const override = agentOverrides?.[agent.id] || {};
    configs[agent.id] = {
      provider: typeof override.provider === "string" ? override.provider : "",
      model: typeof override.model === "string" ? override.model : "",
      api_key: typeof override.api_key === "string" ? override.api_key : ""
    };
  }
  return configs;
}

function parseDelimitedText(value) {
  if (typeof value !== "string") return [];
  return [...new Set(value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function sanitizeEnabledLanes(values, fallbackRunMode = "static") {
  const allowed = new Set(auditLaneCatalog.map((item) => item.id));
  const normalized = Array.isArray(values)
    ? values.filter((item) => typeof item === "string" && allowed.has(item))
    : [];
  return normalized.length ? [...new Set(normalized)] : defaultLanesForRunMode(fallbackRunMode);
}

function runtimeAllowedForPackageConfig(packageConfig) {
  return packageConfig.run_mode === "runtime" ? "targeted_only" : "never";
}

function reviewSeverityForPackageConfig(packageConfig) {
  if (packageConfig.publishability_threshold === "low") return "low";
  if (packageConfig.publishability_threshold === "medium") return "medium";
  return "high";
}

function applyPresetDerivedFormState(form, auditPackages) {
  const packageConfig = resolvePackageFormConfig(auditPackages, form.audit_package);
  const laneRunMode = packageConfig.run_mode || "static";
  return {
    ...form,
    run_mode: laneRunMode,
    runtime_allowed: runtimeAllowedForPackageConfig(packageConfig),
    review_severity: reviewSeverityForPackageConfig(packageConfig),
    enabled_lanes: defaultLanesForRunMode(laneRunMode),
    max_agent_calls: packageConfig.max_agent_calls,
    max_total_tokens: packageConfig.max_total_tokens,
    max_rerun_rounds: packageConfig.max_rerun_rounds,
    publishability_threshold: packageConfig.publishability_threshold
  };
}

function deriveAuditDefaultsForPackage(auditPackageId, auditPackages, currentDefaults = {}) {
  const packageConfig = resolvePackageFormConfig(auditPackages, auditPackageId);
  const runMode = packageConfig.run_mode || "static";
  return {
    ...currentDefaults,
    audit_package: auditPackageId,
    run_mode: runMode,
    runtime_allowed: runtimeAllowedForPackageConfig(packageConfig),
    review_severity: reviewSeverityForPackageConfig(packageConfig),
    enabled_lanes: [...(packageConfig.enabled_lanes || defaultLanesForRunMode(runMode))],
    max_agent_calls: packageConfig.max_agent_calls,
    max_total_tokens: packageConfig.max_total_tokens,
    max_rerun_rounds: packageConfig.max_rerun_rounds,
    publishability_threshold: packageConfig.publishability_threshold
  };
}

function stripAuditDefaultMetadata(defaults = {}) {
  const { package_overrides, ...rest } = defaults || {};
  return rest;
}

function buildAuditDefaultPackageOverrides(currentDefaults = {}) {
  const packageId = currentDefaults.audit_package;
  const currentOverrides = currentDefaults.package_overrides && typeof currentDefaults.package_overrides === "object"
    ? currentDefaults.package_overrides
    : {};
  if (!packageId) return { ...currentOverrides };
  return {
    ...currentOverrides,
    [packageId]: stripAuditDefaultMetadata(currentDefaults)
  };
}

function normalizeRunFormUpdate(current, key, value, auditPackages, auditDefaults = {}) {
  let next = { ...current, [key]: key === "target_kind" ? (value === "repo" ? "repo" : "path") : value };
  if (key === "run_mode") {
    next.enabled_lanes = defaultLanesForRunMode(value || "static");
  }
  if (key === "audit_package" && current.use_audit_presets) {
    next = applyPresetDerivedFormState(next, auditPackages);
    if (auditDefaults.audit_package === value) {
      next = applyAuditDefaultsToRunForm(next, auditDefaults);
    }
  }
  if (key === "use_audit_presets") {
    if (!value) next.config_source = "custom";
    next = value ? applyPresetDerivedFormState(next, auditPackages) : { ...next };
    if (value && auditDefaults.audit_package === next.audit_package) {
      next = applyAuditDefaultsToRunForm(next, auditDefaults);
    }
  }
  return next;
}

function applyAuditDefaultsToRunForm(form, auditDefaults) {
  const next = { ...form };
  if (auditDefaults.audit_package) next.audit_package = auditDefaults.audit_package;
  if (auditDefaults.run_mode) next.run_mode = normalizeRunModeSelection(auditDefaults.run_mode) || next.run_mode;
  if (auditDefaults.runtime_allowed) next.runtime_allowed = auditDefaults.runtime_allowed;
  if (auditDefaults.review_severity) next.review_severity = auditDefaults.review_severity;
  if (Array.isArray(auditDefaults.enabled_lanes) && auditDefaults.enabled_lanes.length) {
    next.enabled_lanes = sanitizeEnabledLanes(auditDefaults.enabled_lanes, next.run_mode || "static");
  }
  if (auditDefaults.max_agent_calls) next.max_agent_calls = auditDefaults.max_agent_calls;
  if (auditDefaults.max_total_tokens) next.max_total_tokens = auditDefaults.max_total_tokens;
  if (auditDefaults.max_rerun_rounds) next.max_rerun_rounds = auditDefaults.max_rerun_rounds;
  if (auditDefaults.publishability_threshold) next.publishability_threshold = auditDefaults.publishability_threshold;
  return next;
}

function runDefaultsDependencyKey(currentProject, effectiveSettings, auditPackages) {
  return JSON.stringify({
    project_id: currentProject?.id || "",
    target_defaults: currentProject?.target_defaults_json || {},
    audit_defaults: effectiveSettings?.effective?.audit_defaults_json || {},
    providers: effectiveSettings?.effective?.providers_json || {},
    preflight: effectiveSettings?.effective?.preflight_json || {},
    review: effectiveSettings?.effective?.review_json || {},
    packages: (auditPackages || []).map((item) => ({
      id: item.id,
      run_mode: item.run_mode,
      enabled_lanes: item.enabled_lanes,
      max_agent_calls: item.max_agent_calls,
      max_total_tokens: item.max_total_tokens,
      max_rerun_rounds: item.max_rerun_rounds,
      publishability_threshold: item.publishability_threshold
    }))
  });
}

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
  if (targetDefaults?.target_kind === "repo") return "repo";
  if (targetDefaults?.repo_url) return "repo";
  return "path";
}

function normalizeRunModeSelection(value) {
  if (value === "build" || value === "validate") return "runtime";
  return value || "";
}

function getAuditPackageDefinition(auditPackages, packageId) {
  return (auditPackages || []).find((item) => item.id === packageId) || null;
}

function detectProviderForModel(registry, modelId) {
  for (const provider of registry?.providers || []) {
    if ((provider.models || []).some((model) => model.id === modelId)) return provider.id;
  }
  return "";
}

function normalizeRealAuditModelSelection(providerId, modelId) {
  if (providerId === "mock" || modelId === "mock-agent-runtime") {
    return { providerId: "", modelId: "" };
  }
  return {
    providerId: providerId || "",
    modelId: modelId || ""
  };
}

function deriveRunFormDefaults(project, effectiveSettings, auditPackages) {
  const targetDefaults = project?.target_defaults_json || {};
  const auditDefaults = effectiveSettings?.effective?.audit_defaults_json || {};
  const providerDefaults = effectiveSettings?.effective?.providers_json || {};
  const preflightDefaults = effectiveSettings?.effective?.preflight_json || {};
  const reviewDefaults = effectiveSettings?.effective?.review_json || {};
  const projectAuditType = project ? (targetDefaults.audit_package || targetDefaults.audit_type || auditDefaults.audit_package || "baseline-static") : "";
  const selectedAuditDefaults = projectAuditType
    ? deriveAuditDefaultsForPackage(projectAuditType, auditPackages, auditDefaults)
    : auditDefaults;
  const auditPackage = selectedAuditDefaults.audit_package || "agentic-static";
  const runMode = normalizeRunModeSelection(selectedAuditDefaults.run_mode);
  const normalizedModelSelection = normalizeRealAuditModelSelection(
    providerDefaults.default_provider || "",
    providerDefaults.default_model || ""
  );
  const defaults = {
    target_kind: inferTargetKind(targetDefaults),
    local_path: targetDefaults.local_path || "fixtures/validation-targets/agent-tool-boundary-risky",
    repo_url: targetDefaults.repo_url || "",
    endpoint_url: targetDefaults.endpoint_url || "",
    run_mode: runMode,
    audit_package: auditPackage,
    audit_policy_pack: "default",
    llm_provider: normalizedModelSelection.providerId,
    llm_model: normalizedModelSelection.modelId,
    preflight_strictness: preflightDefaults.strictness || "standard",
    runtime_allowed: selectedAuditDefaults.runtime_allowed || preflightDefaults.runtime_allowed || "targeted_only",
    review_severity: selectedAuditDefaults.review_severity || reviewDefaults.require_human_review_for_severity || "high",
    review_visibility: reviewDefaults.default_visibility || "internal",
    use_audit_presets: true,
    config_source: project ? "project" : "audit",
    enabled_lanes: [],
    max_agent_calls: 0,
    max_total_tokens: 0,
    max_rerun_rounds: 0,
    publishability_threshold: "high",
    use_global_llm_config: true,
    agent_configs: buildEmptyAgentConfigs(),
    control_selection_mode: "automatic",
    required_frameworks: [],
    excluded_frameworks: [],
    required_control_ids_text: "",
    excluded_control_ids_text: ""
  };
  return applyAuditDefaultsToRunForm(applyPresetDerivedFormState(defaults, auditPackages), selectedAuditDefaults);
}

function deriveRunFormForConfigSource(source, currentForm, project, effectiveSettings, auditPackages) {
  if (source === "project" && project) {
    return deriveRunFormDefaults(project, effectiveSettings, auditPackages);
  }
  return {
    ...currentForm,
    config_source: "custom",
    use_audit_presets: false
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
      note: provider.mode === "agent_oauth"
        ? "Tethermark does not store a ChatGPT credential. The local Codex session status is checked below."
        : configured
        ? `Credentials are ready for ${provider.name}.`
        : `One or more required credentials are still missing for ${provider.name}.`,
      fields
    };
  }
  if (!provider?.requires_api_key || !provider.api_key_field) {
    return {
      configured: true,
      source: "not_required",
      note: provider?.mode === "local_mock"
        ? "No API key required."
        : provider?.mode === "agent_oauth"
          ? "Tethermark does not store a ChatGPT credential. The local Codex session status is checked below."
          : "No persisted API key required.",
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

function getProviderCredentialFieldValue(field, effectiveSettings, drafts) {
  if (!field?.id) return "";
  if (Object.prototype.hasOwnProperty.call(drafts || {}, field.id)) return drafts[field.id] || "";
  const persisted = effectiveSettings?.effective?.credentials_json?.[field.id];
  return typeof persisted === "string" ? persisted : "";
}

function getProviderCredentialFieldPlaceholder(field, fieldStatus, environmentDefaults) {
  if (!field) return "";
  if (field.kind === "api_key") {
    if (environmentDefaults?.default_api_key_configured) return `configured via ${environmentDefaults.default_api_key_env_var}`;
    return fieldStatus?.env_var || field.env_var || field.placeholder || "optional";
  }
  if (field.kind === "local_command") {
    return fieldStatus?.source === "environment" && fieldStatus?.env_var
      ? `configured via ${fieldStatus.env_var}`
      : field.placeholder || field.env_var || "codex";
  }
  return field.placeholder || field.env_var || "";
}

function buildSettingsCredentialsPayload(settings, registry, drafts) {
  const nextCredentials = { ...(settings?.credentials_json || {}) };
  delete nextCredentials.openai_api_key;
  const providerId = settings?.providers_json?.default_provider || "";
  for (const field of getProviderCredentialFields(registry, providerId)) {
    if (!Object.prototype.hasOwnProperty.call(drafts || {}, field.id)) continue;
    const nextValue = drafts[field.id];
    nextCredentials[field.id] = nextValue ? nextValue : null;
  }
  return nextCredentials;
}

function buildSettingsProvidersPayload(settings, agentCredentialDrafts) {
  const nextProviders = { ...(settings?.providers_json || {}) };
  const nextOverrides = { ...(nextProviders.agent_overrides || {}) };
  for (const [agentId, override] of Object.entries(nextOverrides)) {
    if (!override || typeof override !== "object") continue;
    const { api_key: _apiKey, ...rest } = override;
    nextOverrides[agentId] = rest;
  }
  for (const [agentId, draftValue] of Object.entries(agentCredentialDrafts || {})) {
    nextOverrides[agentId] = {
      ...(nextOverrides[agentId] || {}),
      api_key: draftValue || ""
    };
  }
  return {
    ...nextProviders,
    agent_overrides: nextOverrides
  };
}

function getProviderApiFieldId(registry, providerId) {
  const provider = getProviderDefinition(registry, providerId);
  return provider?.credential_fields?.find((field) => field.kind === "api_key")?.id || provider?.api_key_field || "";
}

function getProviderApiKeyEnvHint(providerId, fieldStatus) {
  if (providerId === "openai") return "AUDIT_LLM_API_KEY, LLM_API_KEY, or OPENAI_API_KEY";
  return fieldStatus?.env_var || "";
}

function applyEnvironmentDefaultsToSettings(settings, environmentDefaults) {
  const providers = settings?.providers_json || {};
  const envAgents = environmentDefaults?.agent_overrides || {};
  const nextOverrides = { ...(providers.agent_overrides || {}) };
  for (const agent of agentConfigCatalog) {
    const envOverride = envAgents[agent.id] || {};
    const current = nextOverrides[agent.id] || {};
    if (envOverride.provider || envOverride.model) {
      nextOverrides[agent.id] = {
        ...current,
        provider: current.provider || envOverride.provider || "",
        model: current.model || envOverride.model || ""
      };
    }
  }
  const defaultProviderCanUseEnv = !providers.default_provider || providers.default_provider === "mock";
  const defaultModelCanUseEnv = !providers.default_model || providers.default_model === "mock-agent-runtime";
  const assistantCanUseEnv = providers.assistant_inherit_default !== false && !providers.assistant_provider && !providers.assistant_model;
  const hasAssistantEnv = Boolean(environmentDefaults?.assistant_provider || environmentDefaults?.assistant_model);
  return {
    ...settings,
    providers_json: {
      ...providers,
      default_provider: defaultProviderCanUseEnv ? (environmentDefaults?.default_provider || providers.default_provider || "") : providers.default_provider,
      default_model: defaultModelCanUseEnv ? (environmentDefaults?.default_model || providers.default_model || "") : providers.default_model,
      assistant_inherit_default: assistantCanUseEnv && hasAssistantEnv ? false : providers.assistant_inherit_default !== false,
      assistant_provider: assistantCanUseEnv && hasAssistantEnv ? (environmentDefaults?.assistant_provider || "") : (providers.assistant_provider || ""),
      assistant_model: assistantCanUseEnv && hasAssistantEnv ? (environmentDefaults?.assistant_model || "") : (providers.assistant_model || ""),
      agent_overrides: nextOverrides
    }
  };
}

function applyEnvironmentDefaultsToEffectiveSettings(effectiveSettings, environmentDefaults) {
  return {
    ...effectiveSettings,
    effective: applyEnvironmentDefaultsToSettings(effectiveSettings?.effective || emptySettings, environmentDefaults)
  };
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

function buildRunRequest(form, effectiveSettings, llmRegistry, auditPackages) {
  const targetKind = form.target_kind === "repo" ? "repo" : "path";
  const payload = {
    llm_provider: form.llm_provider
  };
  if (form.use_audit_presets && form.audit_package) payload.audit_package = form.audit_package;
  if (form.run_mode === "static") payload.run_mode = "static";
  if (form.audit_policy_pack) payload.audit_policy_pack = form.audit_policy_pack;
  if (form.llm_model) payload.llm_model = form.llm_model;
  const provider = getProviderDefinition(llmRegistry, form.llm_provider);
  const apiKeyField = provider?.credential_fields?.find((field) => field.kind === "api_key")?.id || provider?.api_key_field;
  const configuredApiKey = apiKeyField ? (form[apiKeyField] || effectiveSettings?.effective?.credentials_json?.[apiKeyField]) : null;
  if (configuredApiKey) payload.llm_api_key = configuredApiKey;
  if (targetKind === "repo" && form.repo_url) payload.repo_url = form.repo_url;
  else if (form.local_path) payload.local_path = form.local_path;
  payload.hints = {
    requested_run_mode_selection: form.run_mode === "auto" ? "auto" : (form.run_mode === "runtime" ? "runtime" : "static"),
    preflight: {
      strictness: form.preflight_strictness,
      runtime_allowed: form.runtime_allowed,
      static_tool_gate_policy: "warn"
    },
    external_audit_tools: {
      included_tool_ids: normalizeExternalAuditToolIds(effectiveSettings?.effective?.preflight_json?.external_audit_tool_ids)
    },
    review: {
      require_human_review_for_severity: form.review_severity,
      default_visibility: form.review_visibility
    }
  };
  if (!form.use_audit_presets) {
    payload.hints.audit_package_overrides = {
      enabled_lanes: sanitizeEnabledLanes(form.enabled_lanes, form.run_mode || "static"),
      max_agent_calls: Math.max(1, Number(form.max_agent_calls || 0)),
      max_total_tokens: Math.max(1, Number(form.max_total_tokens || 0)),
      max_rerun_rounds: Math.max(1, Number(form.max_rerun_rounds || 0)),
      publishability_threshold: ["low", "medium", "high"].includes(form.publishability_threshold) ? form.publishability_threshold : "high"
    };
  }
  if (form.control_selection_mode === "constrained") {
    const requiredControlIds = parseDelimitedText(form.required_control_ids_text);
    const excludedControlIds = parseDelimitedText(form.excluded_control_ids_text);
    payload.hints.planner_control_constraints = {
      selection_mode: "constrained",
      required_frameworks: Array.isArray(form.required_frameworks) ? [...new Set(form.required_frameworks.filter(Boolean))] : [],
      excluded_frameworks: Array.isArray(form.excluded_frameworks) ? [...new Set(form.excluded_frameworks.filter(Boolean))] : [],
      required_control_ids: requiredControlIds,
      excluded_control_ids: excludedControlIds
    };
  }
  const agentConfigs = form.use_global_llm_config === false ? (form.agent_configs || {}) : {};
  const agentOverrides = {};
  const usingGlobalLlmConfig = form.use_global_llm_config !== false && Boolean(form.llm_model);
  if (!usingGlobalLlmConfig) {
    for (const agent of agentConfigCatalog) {
      const config = agentConfigs[agent.id] || {};
      const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : "";
      const apiKey = typeof config.api_key === "string" && config.api_key.trim() ? config.api_key.trim() : "";
      const provider = config.provider || (model ? detectProviderForModel(llmRegistry, model) : "");
      if (!model && !apiKey && !provider) continue;
      agentOverrides[agent.id] = {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        ...(apiKey ? { api_key: apiKey } : {})
      };
    }
  }
  if (Object.keys(agentOverrides).length) payload.hints.llm_agent_overrides = agentOverrides;
  return payload;
}

function buildDiagnosticsRunRequest({ kind, effectiveSettings, auditPackages, target = "pi" }) {
  const providerDefaults = effectiveSettings?.effective?.providers_json || {};
  const packageId = kind === "plumbing" ? "agentic-static" : "agentic-static";
  const packageConfig = resolvePackageFormConfig(auditPackages, packageId);
  const repoUrl = target === "openclaw" ? diagnosticsOpenClawRepoUrl : diagnosticsPiRepoUrl;
  const provider = kind === "plumbing" ? "mock" : (providerDefaults.default_provider || "");
  const model = kind === "plumbing" ? "" : (providerDefaults.default_model || "");
  return {
    repo_url: repoUrl,
    run_mode: "static",
    llm_workload_class: "interactive_operator",
    audit_package: packageId,
    llm_provider: provider,
    ...(model ? { llm_model: model } : {}),
    hints: {
      requested_run_mode_selection: "static",
      diagnostic_run: {
        kind,
        label: kind === "plumbing" ? "Plumbing smoke" : kind === "static_audit" ? "Static audit smoke" : "Benchmark run",
        target,
        pinned_reference: target === "pi" ? diagnosticsPiCommit : null,
        audit_quality_claim: kind === "plumbing" ? "none" : "static_audit"
      },
      preflight: {
        strictness: "standard",
        runtime_allowed: "never",
        static_tool_gate_policy: "warn"
      },
      external_audit_tools: {
        included_tool_ids: normalizeExternalAuditToolIds(effectiveSettings?.effective?.preflight_json?.external_audit_tool_ids)
      },
      audit_package_overrides: {
        enabled_lanes: packageConfig.enabled_lanes,
        max_agent_calls: packageConfig.max_agent_calls,
        max_total_tokens: packageConfig.max_total_tokens,
        max_rerun_rounds: packageConfig.max_rerun_rounds,
        publishability_threshold: packageConfig.publishability_threshold
      },
      review: {
        require_human_review_for_severity: "medium",
        default_visibility: "internal"
      }
    }
  };
}

function buildLaunchRunRequest(form, requestContext, launchIntentState, effectiveSettings, llmRegistry, auditPackages) {
  const payload = buildRunRequest(form, effectiveSettings, llmRegistry, auditPackages);
  payload.llm_workload_class = "interactive_operator";
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

function normalizeDateInputIso(value) {
  if (!String(value || "").trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function validateFutureDateInput(value, label) {
  if (!String(value || "").trim()) return { value: null, error: "" };
  const normalized = normalizeDateInputIso(value);
  if (!normalized) return { value: null, error: `Enter a valid ${label}.` };
  if (new Date(normalized).getTime() <= Date.now()) return { value: normalized, error: `Choose a future ${label}.` };
  return { value: normalized, error: "" };
}

function validateDateInput(value, label) {
  if (!String(value || "").trim()) return { value: null, error: "" };
  const normalized = normalizeDateInputIso(value);
  if (!normalized) return { value: null, error: `Enter a valid ${label}.` };
  return { value: normalized, error: "" };
}

function normalizePolicyPackId(policyPackId) {
  return policyPackId || "default";
}

function getPolicyPackDisplayLabel(policyPacks, policyPackId) {
  const effectiveId = normalizePolicyPackId(policyPackId);
  const match = (policyPacks || []).find((item) => item.id === effectiveId);
  return match ? match.name : (effectiveId === "default" ? "Default built-in policy" : `${effectiveId} (custom)`);
}

function getRunTargetValue(form) {
  if (form.target_kind === "repo") return form.repo_url || "";
  return form.local_path || "";
}

function validateRunForm(form) {
  const issues = [];
  const targetValue = getRunTargetValue(form).trim();
  if (!targetValue) {
    issues.push("A target is required before launch.");
  } else if (form.target_kind === "repo" && !/^(https?:\/\/|git@|ssh:\/\/git@)/i.test(targetValue)) {
    issues.push("Repository targets should use an HTTPS or SSH Git URL.");
  }
  if (form.use_audit_presets && !form.audit_package) issues.push("Select an audit package.");
  if (!form.run_mode) issues.push("Select a run mode.");
  if (!form.llm_provider || !form.llm_model) issues.push("Select a default model in Model Configuration before launching a real audit.");
  return issues;
}

function deriveLaunchReadiness(form, preflightSummary, preflightAcceptedAt, preflightStale, effectiveSettings, llmRegistry) {
  const issues = validateRunForm(form);
  const providerCredential = getProviderCredentialStatus(llmRegistry, form.llm_provider, effectiveSettings, form);
  const selectedProvider = getProviderDefinition(llmRegistry, form.llm_provider);
  const usingMockProvider = selectedProvider?.mode === "local_mock";
  if (usingMockProvider) {
    issues.push("Mock Agent Runtime is for dev/test only. Select a live default model in Model Configuration to enable real audits.");
  } else if (form.llm_provider && form.llm_model && !providerCredential.configured) {
    issues.push("Configure the API key for the selected default model in Model Configuration before launching a real audit.");
  }
  const preflightStatus = preflightSummary?.readiness?.status || "not_run";
  const blockers = preflightSummary?.readiness?.blockers || [];
  const warnings = preflightSummary?.readiness?.warnings || [];
  const readinessGatePolicy = String(effectiveSettings?.effective?.preflight_json?.readiness_gate_policy || "risk_or_drift");
  const recommendedProfile = preflightSummary?.launch_profile || null;
  const currentPolicyPackId = normalizePolicyPackId(form.audit_policy_pack || "");
  const recommendedPolicyPackId = normalizePolicyPackId(recommendedProfile?.audit_policy_pack || "");
  const profileDrift = recommendedProfile
    ? [
      form.use_audit_presets && recommendedProfile.audit_package && recommendedProfile.audit_package !== form.audit_package ? "audit package" : null,
      recommendedPolicyPackId !== currentPolicyPackId ? "policy pack" : null,
      form.run_mode && form.run_mode !== "auto" && recommendedProfile.run_mode && !(
        form.run_mode === "runtime" && (recommendedProfile.run_mode === "build" || recommendedProfile.run_mode === "validate" || recommendedProfile.run_mode === "runtime")
      ) && recommendedProfile.run_mode !== form.run_mode ? "run mode" : null,
      recommendedProfile.llm_provider && recommendedProfile.llm_provider !== form.llm_provider ? "provider" : null,
      (recommendedProfile.llm_model || "") !== (form.llm_model || "") ? "model" : null
    ].filter(Boolean)
    : [];
  const requestedRuntimeFamily = form.run_mode === "auto" || form.run_mode === "runtime";
  const readinessSignals = blockers.length > 0 || warnings.length > 0 || profileDrift.length > 0;
  const requiresReadinessReview = readinessGatePolicy === "always"
    ? true
    : readinessGatePolicy === "never"
      ? false
      : requestedRuntimeFamily || readinessSignals;
  const accepted = Boolean(preflightAcceptedAt) && !preflightStale;
  const hasFreshReadinessSummary = Boolean(preflightSummary) && !preflightStale;
  return {
    issues,
    blockers,
    warnings,
    providerCredential,
    preflightStatus,
    accepted,
    requiresReadinessReview,
    readinessGatePolicy,
    canLaunch: issues.length === 0
      && preflightStatus !== "blocked"
      && (!requiresReadinessReview || (hasFreshReadinessSummary && accepted)),
    recommendedProfile,
    profileDrift
  };
}

function cn(...items) {
  return window.TethermarkUI?.cn ? window.TethermarkUI.cn(...items) : items.filter(Boolean).join(" ");
}

function badgeTone(status) {
  if (["succeeded", "approved", "completed"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["failed", "rejected", "canceled"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  if (["queued", "running", "review_required", "in_review", "requires_rerun"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-stone-200 bg-stone-100 text-stone-700";
}

function isActiveAsyncJob(job) {
  return ["queued", "starting", "running"].includes(job?.status);
}

function isTerminalAsyncJob(job) {
  return ["succeeded", "failed", "canceled"].includes(job?.status);
}

function getAsyncJobType(job) {
  const diagnosticKind = job?.request_json?.hints?.diagnostic_run?.kind;
  if (diagnosticKind === "plumbing") return "system_check";
  if (diagnosticKind === "static_audit") return "static_smoke";
  if (diagnosticKind === "benchmark") return "benchmark";
  if (job?.request_json?.hints?.runtime_followup) return "runtime_followup";
  return "audit";
}

function getAsyncJobTargetName(job) {
  const repoParts = job?.request_json?.repo_url ? job.request_json.repo_url.split("/").filter(Boolean) : [];
  if (repoParts.length) return (repoParts[repoParts.length - 1] || "repo").replace(/\.git$/i, "");
  return job?.request_json?.local_path || job?.request_json?.endpoint_url || "target";
}

function formatAsyncJobDuration(job) {
  const startValue = job?.started_at || job?.created_at;
  const endValue = job?.completed_at || (isActiveAsyncJob(job) ? new Date().toISOString() : job?.updated_at);
  if (!startValue || !endValue) return "n/a";
  const durationMs = new Date(endValue).getTime() - new Date(startValue).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "n/a";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

function asyncJobTypeLabel(type) {
  return {
    system_check: "System check",
    static_smoke: "Static smoke",
    benchmark: "Benchmark",
    runtime_followup: "Runtime follow-up",
    audit: "Audit"
  }[type] || type;
}

function getAsyncJobDiagnosticTarget(job) {
  const target = job?.request_json?.hints?.diagnostic_run?.target;
  if (typeof target === "string" && target) return target;
  const repoUrl = job?.request_json?.repo_url || "";
  if (/openclaw/i.test(repoUrl)) return "openclaw";
  if (/earendil-works\/pi/i.test(repoUrl)) return "pi";
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isNetworkFetchFailure(error) {
  const message = error?.message || String(error || "");
  return message === "fetch failed" || /failed to fetch|networkerror|load failed/i.test(message);
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
  const requestUrl = appConfig.apiBaseUrl.replace(/\/$/, "") + path;
  const method = String(init?.method || "GET").toUpperCase();
  const canRetry = method === "GET";
  const fetchOnce = () => fetch(requestUrl, {
      headers,
      ...init
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: response.statusText }));
        const rawError = payload.error || response.statusText;
        if (rawError === "not_found") {
          throw new Error(`API route not found: ${path}. Restart the Tethermark API server so it picks up the latest backend routes.`);
        }
        throw new Error(`API request failed for ${path}: ${rawError}`);
      }
      return response.status === 204 ? null : response.json();
    });
  return fetchOnce().catch((requestError) => {
      if (canRetry && isNetworkFetchFailure(requestError)) {
        return sleep(350).then(fetchOnce);
      }
      throw requestError;
    }).catch((requestError) => {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      if (message.startsWith("API request failed for ") || message.startsWith("API route not found: ")) {
        throw requestError;
      }
      throw new Error(`API request failed for ${path}: ${message}`);
    });
}

function formatUiError(error) {
  const message = error?.message || String(error || "Unknown error");
  if (/^API route not found: \/assistant\//i.test(message)) {
    return "Assistant API routes are not available from the running backend. Rebuild and restart the Tethermark API server so it picks up the current assistant routes.";
  }
  if (isNetworkFetchFailure({ message })) {
    return "API request failed. Check that the Tethermark API is running and reachable, then retry.";
  }
  const requestFailure = message.match(/^API request failed for ([^:]+):\s*(.+)$/i);
  if (requestFailure) {
    const endpoint = requestFailure[1] || "unknown endpoint";
    const reason = requestFailure[2] || "request failed";
    if (endpoint.startsWith("/assistant/") && reason === "assistant_disabled") {
      return "Assistant is disabled by an API environment override. Remove HARNESS_DISABLE_ASSISTANT or set HARNESS_ENABLE_ASSISTANT=true, then restart the API.";
    }
    if (isNetworkFetchFailure({ message: reason })) {
      return `API request failed for ${endpoint}. Check that the Tethermark API and web UI proxy are reachable, then retry.`;
    }
  }
  return message;
}

function withUiTimeout(promise, timeoutMs, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function formatShortReference(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "n/a";
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 8) : text;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && current >= 1024; index += 1) {
    current /= 1024;
    unit = units[index];
  }
  return `${current.toFixed(current >= 10 ? 1 : 2)} ${unit}`;
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
  if (window.TethermarkUI?.Badge) {
    return h(window.TethermarkUI.Badge, null, children || "none");
  }
  return h("span", { className: cn("inline-flex rounded-full border px-2.5 py-1 text-xs uppercase tracking-[0.18em]", badgeTone(String(children))) }, children || "none");
}

function CompactTag({ children }) {
  return h("span", {
    className: "inline-flex shrink-0 self-start whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium uppercase leading-none tracking-[0.12em] text-slate-600"
  }, children || "none");
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
  if (kind === "folder") return h("svg", common, [
    h("path", { key: "a", d: "M3.5 6.5C3.5 5.4 4.4 4.5 5.5 4.5H8L9.5 6.5H14.5C15.6 6.5 16.5 7.4 16.5 8.5V14C16.5 15.1 15.6 16 14.5 16H5.5C4.4 16 3.5 15.1 3.5 14V6.5Z" }),
    h("path", { key: "b", d: "M4 8.5H16" })
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
  if (kind === "moon") return h("svg", common, [
    h("path", { key: "a", d: "M14.5 15.8A7 7 0 0 1 8.2 3.5 7 7 0 1 0 16.5 11.8 5.5 5.5 0 0 1 14.5 15.8Z" })
  ]);
  if (kind === "sun") return h("svg", common, [
    h("circle", { key: "a", cx: "10", cy: "10", r: "3" }),
    h("path", { key: "b", d: "M10 2.5V4M10 16V17.5M17.5 10H16M4 10H2.5M15.3 4.7L14.2 5.8M5.8 14.2L4.7 15.3M15.3 15.3L14.2 14.2M5.8 5.8L4.7 4.7" })
  ]);
  return h("span", { className: "inline-block h-4 w-4" });
}

function EyeIcon({ hidden = false }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-4 w-4"
  };
  return h("svg", common, [
    h("path", { key: "a", d: "M2.5 10S5.2 5.5 10 5.5S17.5 10 17.5 10S14.8 14.5 10 14.5S2.5 10 2.5 10Z" }),
    h("circle", { key: "b", cx: "10", cy: "10", r: "2.2" }),
    hidden ? h("path", { key: "c", d: "M4 16L16 4" }) : null
  ]);
}

function Button({ children, variant = "default", className = "", ...props }) {
  if (window.TethermarkUI?.Button) {
    return h(window.TethermarkUI.Button, { variant, className, ...props }, children);
  }
  return h(
    "button",
    {
      className: cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "default" && "bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" && "bg-secondary text-foreground hover:bg-slate-200",
        variant === "outline" && "border border-border bg-white text-slate-700 hover:bg-slate-50",
        className
      ),
      type: "button",
      ...props
    },
    children
  );
}

function Card({ title, description, children, className = "" }) {
  if (window.TethermarkUI?.Card) {
    return h(window.TethermarkUI.Card, { title, description, className }, children);
  }
  return h("section", { className: cn("rounded-xl border border-border bg-card p-6 shadow-soft", className) }, [
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

function HoverCard({ trigger, children, side = "top", align = "start", openDelay = 120, closeDelay = 120 }) {
  if (window.TethermarkUI?.HoverCard) {
    return h(window.TethermarkUI.HoverCard, { trigger, side, align, openDelay, closeDelay }, children);
  }
  return trigger;
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

function LaunchStatusCard({ label, value, note = "" }) {
  return h("div", { className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" }, [
    h("div", { key: "label", className: "font-medium text-slate-900" }, label),
    h("div", { key: "value", className: "mt-1 text-slate-500" }, value),
    note ? h("div", { key: "note", className: "mt-2 text-xs leading-5 text-slate-400" }, note) : null
  ]);
}

function Field({ label, children }) {
  if (window.TethermarkUI?.Field) {
    return h(window.TethermarkUI.Field, { label }, children);
  }
  return h("div", { className: "block space-y-2 text-sm" }, [
    h("span", { key: "l", className: "font-medium" }, label),
    children
  ]);
}

function Input({ className = "", ...props }) {
  if (window.TethermarkUI?.Input) {
    return h(window.TethermarkUI.Input, { className, ...props });
  }
  return h("input", { className: cn("flex h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 aria-invalid:border-red-500 aria-invalid:ring-red-100", className), ...props });
}

function PasswordInput({ shown = false, onToggleShown, className = "", ...props }) {
  return h("div", { className: "relative" }, [
    h(Input, {
      key: "input",
      ...props,
      type: shown ? "text" : "password",
      className: cn("pr-10", className)
    }),
    h("button", {
      key: "toggle",
      type: "button",
      className: "absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-slate-500 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200",
      onMouseDown: (event) => event.preventDefault(),
      onClick: onToggleShown,
      "aria-label": shown ? "Hide API key" : "Show API key",
      title: shown ? "Hide API key" : "Show API key"
    }, h(EyeIcon, { hidden: shown }))
  ]);
}

function Select({ className = "", children: propChildren, ...props }, children) {
  const selectChildren = propChildren !== undefined ? propChildren : children;
  if (window.TethermarkUI?.Select) {
    return h(window.TethermarkUI.Select, { className, ...props }, selectChildren);
  }
  return h("select", { className: cn("flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100", className), ...props }, selectChildren);
}

function ReadOnlySetting({ value, note = "Package controlled" }) {
  return h("div", { className: "min-h-10 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm" }, [
    h("div", { key: "value", className: "font-medium text-foreground" }, value || "not set"),
    note ? h("div", { key: "note", className: "mt-1 text-xs leading-4 text-muted" }, note) : null
  ]);
}

function Textarea({ className = "", ...props }) {
  if (window.TethermarkUI?.Textarea) {
    return h(window.TethermarkUI.Textarea, { className, ...props });
  }
  return h("textarea", { className: cn("min-h-[110px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100", className), ...props });
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
  projects,
  onProjectChange,
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
      projects,
      onProjectChange,
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
        HoverCard,
        Field,
        Input,
        Textarea,
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
  const configStepComplete = Boolean(runForm.run_mode && runForm.llm_provider && (!runForm.use_audit_presets || runForm.audit_package));
  const requiredFieldsReady = targetStepComplete && configStepComplete;
  const activeModel = runModelOptions.find((item) => item.provider_id === runForm.llm_provider && item.id === runForm.llm_model) || null;
  const visibleAuditPackages = getVisibleAuditPackages(auditPackages);
  return h(Modal, {
    open,
    onClose,
    size: "full",
    title: "Launch Audit",
    description: "Choose a target, confirm the audit configuration, run preflight if needed, then launch."
  }, h("div", { className: "max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto pr-1" }, [
    h("div", { key: "meta-row", className: "flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 pb-3 text-xs uppercase tracking-[0.16em] text-slate-500" }, [
      h("div", { key: "scope" }, `Project: ${requestContext.projectId}`),
      h("div", { key: "project" }, `Project: ${currentProject ? currentProject.name : "none"}`),
      h("div", { key: "model" }, `Model: ${activeModel?.label || runForm.llm_model || "none"}`)
    ]),
    h("section", { key: "setup", className: "rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4" }, [
      h("div", { key: "header" }, [
        h("div", { key: "title", className: "text-lg font-semibold text-slate-950" }, "Audit Setup"),
        h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Common launch inputs only. LLM defaults come from settings, and less-used controls stay on defaults.")
      ]),
      h("div", { key: "setup-grid", className: "mt-4 space-y-5" }, [
        h("div", { key: "target-block", className: "space-y-4" }, [
          h("div", { key: "target-header" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Target"),
            h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Choose the system, repository, or path you want to audit.")
          ]),
          h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
            h(Field, { key: "target-kind", label: "Target kind" }, Select({
              value: runForm.target_kind === "repo" ? "repo" : "path",
              onChange: (event) => updateRunForm("target_kind", event.target.value)
            }, [
              h("option", { key: "path", value: "path" }, "local path"),
              h("option", { key: "repo", value: "repo" }, "repo url")
            ])),
            runForm.target_kind === "repo"
              ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, {
                value: runForm.repo_url,
                onChange: (event) => updateRunForm("repo_url", event.target.value),
                placeholder: "https://github.com/org/repo or git@github.com:org/repo.git"
              }))
              : h(Field, { key: "path", label: "Local Path" }, h(Input, {
                  value: runForm.local_path,
                  onChange: (event) => updateRunForm("local_path", event.target.value),
                  placeholder: "fixtures/validation-targets/agent-tool-boundary-risky"
                }))
          ]),
          h("div", { key: "hint", className: "text-sm text-slate-500" }, runForm.target_kind === "repo"
            ? "Use a repo URL when you want canonical repository identity for history, scoring, and outbound integrations."
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
              h("option", { key: "static", value: "static" }, "static"),
              h("option", { key: "runtime", value: "runtime" }, "runtime")
            ])),
            h(Field, { key: "pkg", label: "Audit package" }, Select({
              value: runForm.audit_package,
              onChange: (event) => updateRunForm("audit_package", event.target.value)
            }, [
              ...visibleAuditPackages.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} (${item.id})`)),
              !visibleAuditPackages.some((item) => item.id === runForm.audit_package)
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
  function renderHelp(label, help) {
    if (!help) return null;
    return h(HoverCard, {
      trigger: h("button", {
        type: "button",
        className: "inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold leading-none text-slate-500 hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200",
        "aria-label": `${label} help`,
        title: `${label} help`
      }, "?")
    }, h("div", { className: "text-sm leading-6 text-slate-600" }, help));
  }
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
    className: "min-w-0 rounded-2xl border border-border bg-white/70 px-4 py-3"
  }, [
    h("dt", { key: "label", className: "flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, [
      h("span", { key: "text" }, item.label),
      renderHelp(item.label, item.help)
    ]),
    h("dd", { key: "value", className: "mt-2 min-w-0 break-words text-sm font-medium text-foreground" }, renderDetailValue(item.value))
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
            needsDispositionReview ? h(Badge, { key: "disposition-review" }, `exception re-review ${dispositionCounts.findings_needing_disposition_review_count}`) : null
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
        h("div", { key: "count" }, `Exceptions due soon ${dueSoonDispositionCount}`),
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
      publisherModeEnabled && action.visibility_override ? h("div", { key: "visibility", className: "mt-1 text-sm text-muted" }, `Publication safety override: ${action.visibility_override}`) : null,
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
            h(Button, { key: "open-source", variant: "outline", onClick: () => onOpenSourceRun?.(selectedFollowup) }, "Open Original Run"),
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
        "data-testid": "review-comment-finding-select",
        value: commentFindingId || "",
        onChange: (event) => onCommentFindingChange?.(event.target.value)
      }, [
        h("option", { key: "run", value: "" }, "run-level"),
        ...(findings || []).map((finding) => h("option", { key: finding.id, value: finding.id }, finding.title || finding.id))
      ])),
      h(Field, { key: "body", label: "Comment" }, h(Input, {
        "data-testid": "review-comment-input",
        value: commentBody || "",
        onChange: (event) => onCommentBodyChange?.(event.target.value),
        placeholder: "add reviewer discussion or handoff context"
      })),
      h("div", { key: "submit-wrap", className: "flex items-end" }, h(Button, {
        "data-testid": "post-review-comment-button",
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
  onSaveRemediationItem,
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
  publisherMode,
  assistantState,
  assistantSessions,
  assistantSessionsLoading,
  assistantSessionsError,
  assistantInput,
  assistantScopeType,
  onAssistantInputChange,
  onAssistantSend,
  onAssistantPrompt,
  onAssistantScopeChange,
  onAssistantConfirmAction,
  onAssistantRejectAction,
  onAssistantNewSession,
  onAssistantOpenSession,
  onAssistantRenameSession,
  onAssistantArchiveSession,
  onAssistantDeleteSession,
  notice
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
    onSaveRemediationItem,
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
    publisherMode,
    assistantState,
    assistantSessions,
    assistantSessionsLoading,
    assistantSessionsError,
    assistantInput,
    assistantScopeType,
    onAssistantInputChange,
    onAssistantSend,
    onAssistantPrompt,
    onAssistantScopeChange,
    onAssistantConfirmAction,
    onAssistantRejectAction,
    onAssistantNewSession,
    onAssistantOpenSession,
    onAssistantRenameSession,
    onAssistantArchiveSession,
    onAssistantDeleteSession,
    notice,
    helpers: {
      Button,
      Card,
      Badge,
      Field,
      HoverCard,
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
  const [theme, setTheme] = useState(() => {
    try {
      const stored = window.localStorage.getItem("tethermark-theme");
      return stored === "light" || stored === "dark" ? stored : "dark";
    } catch {
      return "dark";
    }
  });
  const [view, setView] = useState("dashboard");
  const [runs, setRuns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [jobSearch, setJobSearch] = useState("");
  const [runtimeFollowups, setRuntimeFollowups] = useState([]);
  const [learningEvents, setLearningEvents] = useState([]);
  const [learningCandidates, setLearningCandidates] = useState([]);
  const [learningPromotions, setLearningPromotions] = useState([]);
  const [learningJobs, setLearningJobs] = useState([]);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningFilter, setLearningFilter] = useState("open");
  const [settings, setSettings] = useState(emptySettings);
  const [effectiveSettings, setEffectiveSettings] = useState(emptyEffectiveSettings);
  const [providerCredentialDrafts, setProviderCredentialDrafts] = useState({});
  const [agentCredentialDrafts, setAgentCredentialDrafts] = useState({});
  const [visibleApiKeys, setVisibleApiKeys] = useState({});
  const [integrationCredentialDrafts, setIntegrationCredentialDrafts] = useState({});
  const [documents, setDocuments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("default");
  const [projectDetailRuns, setProjectDetailRuns] = useState([]);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [auditPackages, setAuditPackages] = useState(builtinAuditPackages);
  const [methodologyCatalog, setMethodologyCatalog] = useState(emptyMethodology);
  const [policyPacks, setPolicyPacks] = useState([]);
  const [llmRegistry, setLlmRegistry] = useState(emptyLlmRegistry);
  const [oauthConnectionState, setOauthConnectionState] = useState(null);
  const oauthStatusRequestId = useRef(0);
  const oauthStatusPollTimer = useRef(null);
  const runDetailRequestId = useRef(0);
  const systemPanelScrollRef = useRef(null);
  const systemScrollPositionsRef = useRef({});
  const systemScrollKeyRef = useRef("");
  const systemScrollSaveSuspendedRef = useRef(false);
  const runtimeSandboxReadinessLoadKeyRef = useRef("");
  const runtimeSandboxReadinessInFlightKeyRef = useRef("");
  const [integrationRegistry, setIntegrationRegistry] = useState(emptyIntegrationRegistry);
  const [integrationRegistryLoading, setIntegrationRegistryLoading] = useState(true);
  const [staticToolsReadiness, setStaticToolsReadiness] = useState(emptyStaticToolsReadiness);
  const [staticToolsLoading, setStaticToolsLoading] = useState(false);
  const [staticToolsPathDraft, setStaticToolsPathDraft] = useState("");
  const [staticToolsPathMeta, setStaticToolsPathMeta] = useState(null);
  const [staticToolsPathSaving, setStaticToolsPathSaving] = useState(false);
  const [runtimeSandboxReadiness, setRuntimeSandboxReadiness] = useState(emptyRuntimeSandboxReadiness);
  const [runtimeSandboxReadinessLoading, setRuntimeSandboxReadinessLoading] = useState(false);
  const [runtimeSandboxReadinessChecked, setRuntimeSandboxReadinessChecked] = useState(false);
  const [runtimeSandboxSetupPlan, setRuntimeSandboxSetupPlan] = useState(null);
  const [runtimeSandboxSetupResult, setRuntimeSandboxSetupResult] = useState(null);
  const [runtimeSandboxSetupRunning, setRuntimeSandboxSetupRunning] = useState(false);
  const [runtimeSandboxAdvancedOpen, setRuntimeSandboxAdvancedOpen] = useState(false);
  const [stats, setStats] = useState({ runs: {}, targets: {} });
  const [observabilityHistory, setObservabilityHistory] = useState(null);
  const [observabilityTraceRunId, setObservabilityTraceRunId] = useState("");
  const [observabilityTrace, setObservabilityTrace] = useState(null);
  const [observabilityTraceLoading, setObservabilityTraceLoading] = useState(false);
  const [observabilityTraceError, setObservabilityTraceError] = useState("");
  const [authInfo, setAuthInfo] = useState(defaultAuthInfo);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runNotice, setRunNotice] = useState("");
  const [lastGlobalSyncAt, setLastGlobalSyncAt] = useState("");
  const [globalSyncLoading, setGlobalSyncLoading] = useState(false);
  const [adminSubpage, setAdminSubpage] = useState("system");
  const [systemSubpage, setSystemSubpage] = useState("runtime-sandbox");
  const [validationScenarioIds, setValidationScenarioIds] = useState(["system_check"]);
  const [validationLaunching, setValidationLaunching] = useState(false);
  const [benchmarkSuites, setBenchmarkSuites] = useState([]);
  const [benchmarkSuiteDetail, setBenchmarkSuiteDetail] = useState(null);
  const [benchmarkReports, setBenchmarkReports] = useState([]);
  const [benchmarkCaseIds, setBenchmarkCaseIds] = useState([]);
  const [benchmarkIncludeExtended, setBenchmarkIncludeExtended] = useState(false);
  const [benchmarkIncludeRuntimePending, setBenchmarkIncludeRuntimePending] = useState(false);
  const [benchmarkExecute, setBenchmarkExecute] = useState(false);
  const [benchmarkStrict, setBenchmarkStrict] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkLastSummary, setBenchmarkLastSummary] = useState(null);
  const [benchmarkCompareBaseline, setBenchmarkCompareBaseline] = useState("");
  const [benchmarkCompareCurrent, setBenchmarkCompareCurrent] = useState("");
  const [benchmarkComparison, setBenchmarkComparison] = useState(null);
  const [settingsSubpage, setSettingsSubpage] = useState("audit");
  const [governanceTab, setGovernanceTab] = useState("gates");
  const [artifactRetentionForm, setArtifactRetentionForm] = useState({
    kind: "runs",
    older_than_days: 30,
    max_gb: ""
  });
  const [artifactRetentionSummary, setArtifactRetentionSummary] = useState(null);
  const [artifactRetentionPreview, setArtifactRetentionPreview] = useState(null);
  const [artifactRetentionLoading, setArtifactRetentionLoading] = useState(false);
  const [requestContext, setRequestContext] = useState(() => {
    try {
      const persisted = JSON.parse(window.localStorage.getItem(contextStorageKey) || "{}");
      return { ...defaultRequestContext, ...persisted, workspaceId: "default" };
    } catch {
      return defaultRequestContext;
    }
  });
  const [runForm, setRunForm] = useState(deriveRunFormDefaults(null, emptyEffectiveSettings, null));
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", document_type: "policy", notes: "", content_text: "" });
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    target_kind: "path",
    local_path: "",
    repo_url: "",
    endpoint_url: "",
    audit_package: ""
  });
  const [projectEditor, setProjectEditor] = useState({
    id: "",
    name: "",
    description: "",
    config_source: "audit",
    target_kind: "path",
    local_path: "",
    repo_url: "",
    endpoint_url: "",
    audit_policy_pack: "default",
    audit_package: "",
    run_mode: "static",
    enabled_lanes: ["repo_posture", "supply_chain"],
    max_agent_calls: 8,
    max_total_tokens: 80000,
    max_rerun_rounds: 1,
    publishability_threshold: "medium",
    preflight_strictness: "standard",
    runtime_allowed: "never",
    review_severity: "medium",
    review_visibility: "internal",
    control_selection_mode: "automatic",
    required_frameworks_text: "",
    excluded_frameworks_text: "",
    required_control_ids_text: "",
    excluded_control_ids_text: "",
    llm_provider: "",
    llm_model: "",
    use_global_llm_config: true
  });
  const [preflightSummary, setPreflightSummary] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightStale, setPreflightStale] = useState(true);
  const [preflightCheckedAt, setPreflightCheckedAt] = useState(null);
  const [preflightAcceptedAt, setPreflightAcceptedAt] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [assistantState, setAssistantState] = useState({ enabled: null, loading: false, session: null, contextKey: null, messages: [], error: "", lastActions: [] });
  const [assistantSessions, setAssistantSessions] = useState([]);
  const [assistantSessionsLoading, setAssistantSessionsLoading] = useState(false);
  const [assistantSessionsError, setAssistantSessionsError] = useState("");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantScopeType, setAssistantScopeType] = useState("run");
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
  const systemScrollKey = useMemo(() => {
    if (view !== "system") return "";
    return systemSubpage === "policy" ? `page:${systemSubpage}:policy:${governanceTab}` : `page:${systemSubpage}`;
  }, [view, systemSubpage, governanceTab]);

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
  const defaultProject = useMemo(() => ({
    id: "default",
    workspace_id: requestContext.workspaceId || "default",
    name: "Default Project",
    description: "Default Community Edition project container.",
    target_defaults_json: {
      target_kind: "path",
      local_path: "fixtures/validation-targets/agent-tool-boundary-risky",
      audit_package: effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static"
    }
  }), [requestContext.workspaceId, effectiveSettings.effective.audit_defaults_json?.audit_package]);
  const projectOptions = useMemo(
    () => projects.some((project) => project.id === "default") ? projects : [defaultProject, ...projects],
    [projects, defaultProject]
  );
  const projectRunStats = useMemo(() => {
    const statsByProject = {};
    runs.forEach((run) => {
      const projectId = run.project_id || run.projectId || run.request_json?.project_id || run.hints?.project_id || "default";
      const item = statsByProject[projectId] || {
        runs: 0,
        openReviews: 0,
        scoreTotal: 0,
        scoreCount: 0,
        lastRunAt: ""
      };
      item.runs += 1;
      if (String(run.created_at || "") > String(item.lastRunAt || "")) item.lastRunAt = run.created_at || "";
      if (["review_required", "in_review", "requires_rerun"].includes(run.review_workflow?.status || "")) item.openReviews += 1;
      const score = Number(run.overall_score);
      if (Number.isFinite(score)) {
        item.scoreTotal += score;
        item.scoreCount += 1;
      }
      statsByProject[projectId] = item;
    });
    return statsByProject;
  }, [runs]);
  const currentProject = useMemo(
    () => projectOptions.find((project) => project.id === requestContext.projectId) || defaultProject,
    [projectOptions, requestContext.projectId, defaultProject]
  );
  const selectedProject = useMemo(
    () => projectOptions.find((project) => project.id === selectedProjectId) || projectOptions[0] || defaultProject,
    [projectOptions, selectedProjectId, defaultProject]
  );
  const selectedProjectRuns = useMemo(
    () => [...projectDetailRuns].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || ""))),
    [projectDetailRuns]
  );
  const selectedProjectReviews = useMemo(
    () => selectedProjectRuns.filter((run) => ["review_required", "in_review", "requires_rerun"].includes(run.review_workflow?.status || "")),
    [selectedProjectRuns]
  );
  const runDefaultsKey = useMemo(
    () => runDefaultsDependencyKey(currentProject, effectiveSettings, auditPackages),
    [currentProject, effectiveSettings, auditPackages]
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
  const visibleAuditPackages = useMemo(
    () => getVisibleAuditPackages(auditPackages),
    [auditPackages]
  );
  const settingsProvider = useMemo(
    () => getProviderDefinition(llmRegistry, settings.providers_json.default_provider || ""),
    [llmRegistry, settings.providers_json.default_provider]
  );
  const settingsModelCatalog = useMemo(
    () => getSelectableRunModelOptions(llmRegistry, settings.providers_json.default_provider || "", settings.providers_json.default_model || ""),
    [llmRegistry, settings.providers_json.default_provider, settings.providers_json.default_model]
  );
  const settingsDefaultModelValue = useMemo(() => {
    const providerId = settings.providers_json.default_provider || "";
    const modelId = settings.providers_json.default_model || "";
    if (!modelId || providerId === "mock") return "";
    return `${providerId}:${modelId}`;
  }, [settings.providers_json.default_provider, settings.providers_json.default_model]);
  const settingsAssistantInheritsDefault = settings.providers_json.assistant_inherit_default !== false;
  const settingsAssistantModelValue = useMemo(() => {
    const providerId = settings.providers_json.assistant_provider || "";
    const modelId = settings.providers_json.assistant_model || "";
    if (!modelId || providerId === "mock") return "";
    return `${providerId}:${modelId}`;
  }, [settings.providers_json.assistant_provider, settings.providers_json.assistant_model]);
  const settingsDefaultApiFieldId = useMemo(
    () => getProviderApiFieldId(llmRegistry, settings.providers_json.default_provider || ""),
    [llmRegistry, settings.providers_json.default_provider]
  );
  const settingsDefaultApiFieldStatus = useMemo(
    () => getProviderCredentialFieldStatus(llmRegistry, settings.providers_json.default_provider || "", settingsDefaultApiFieldId),
    [llmRegistry, settings.providers_json.default_provider, settingsDefaultApiFieldId]
  );
  const settingsDefaultApiEnvHint = useMemo(
    () => getProviderApiKeyEnvHint(settings.providers_json.default_provider || "", settingsDefaultApiFieldStatus),
    [settings.providers_json.default_provider, settingsDefaultApiFieldStatus]
  );
  const settingsDefaultEnvCredentials = llmRegistry.environment_defaults || {};
  const maskedApiKeyValue = "************";
  const settingsDefaultApiDraftPresent = settingsDefaultApiFieldId
    ? Object.prototype.hasOwnProperty.call(providerCredentialDrafts, settingsDefaultApiFieldId)
    : false;
  const settingsDefaultApiConfigured = Boolean(settingsDefaultApiFieldId)
    && !settingsDefaultApiDraftPresent
    && (settingsDefaultEnvCredentials.default_api_key_configured || settingsDefaultApiFieldStatus?.configured);
  const settingsDefaultApiDisplayValue = settingsDefaultApiFieldId
    ? (settingsDefaultApiDraftPresent
      ? (providerCredentialDrafts[settingsDefaultApiFieldId] || "")
      : (settingsDefaultEnvCredentials.default_api_key_value || (settingsDefaultApiConfigured ? maskedApiKeyValue : "")))
    : "";
  const settingsProviderCredentialStatus = useMemo(
    () => getProviderCredentialStatus(llmRegistry, settings.providers_json.default_provider || "", effectiveSettings, providerCredentialDrafts),
    [llmRegistry, settings.providers_json.default_provider, effectiveSettings, providerCredentialDrafts]
  );
  const settingsProviderCredentialFields = useMemo(
    () => getProviderCredentialFields(llmRegistry, settings.providers_json.default_provider || ""),
    [llmRegistry, settings.providers_json.default_provider]
  );
  const settingsCodexCommandField = settingsProviderCredentialFields.find((field) => field.id === "codex_command") || null;
  const settingsCodexCommandFieldStatus = settingsCodexCommandField
    ? getProviderCredentialFieldStatus(llmRegistry, settings.providers_json.default_provider || "", settingsCodexCommandField.id)
    : null;
  const settingsCodexCommandValue = settingsCodexCommandField
    ? getProviderCredentialFieldValue(settingsCodexCommandField, effectiveSettings, providerCredentialDrafts)
    : "";
  const settingsCodexCommandPlaceholder = settingsCodexCommandField
    ? getProviderCredentialFieldPlaceholder(settingsCodexCommandField, settingsCodexCommandFieldStatus, settingsDefaultEnvCredentials)
    : "codex";
  const settingsAgentOverrides = useMemo(
    () => settings.providers_json?.agent_overrides || {},
    [settings.providers_json]
  );
  const settingsAgentRoutingModelCatalog = useMemo(
    () => getSelectableRunModelOptions(llmRegistry, "", "").filter((item) => item.provider_id !== "mock"),
    [llmRegistry]
  );
  const realAuditModelReady = useMemo(() => {
    if (!settings.providers_json.default_provider || !settings.providers_json.default_model) return false;
    const provider = getProviderDefinition(llmRegistry, settings.providers_json.default_provider);
    if (!provider || provider.mode === "local_mock") return false;
    return getProviderCredentialStatus(llmRegistry, settings.providers_json.default_provider, effectiveSettings).configured;
  }, [settings.providers_json.default_provider, settings.providers_json.default_model, llmRegistry, effectiveSettings]);
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
    setRunForm((current) => key === "config_source"
      ? deriveRunFormForConfigSource(value, current, currentProject, effectiveSettings, auditPackages)
      : normalizeRunFormUpdate(
        current,
        key,
        value,
        auditPackages,
        effectiveSettings.effective.audit_defaults_json || {}
      ));
  }

  function updateSettings(section, key, value) {
    setSettings((current) => ({ ...current, [section]: { ...(current[section] || {}), [key]: value } }));
  }

  function updateRuntimeSandboxSetting(key, value) {
    setSettings((current) => {
      const currentRuntime = {
        ...defaultRuntimeSandboxSettings,
        ...((current.preflight_json || {}).runtime_sandbox || {})
      };
      return {
        ...current,
        preflight_json: {
          ...(current.preflight_json || {}),
          runtime_sandbox: {
            ...currentRuntime,
            [key]: value
          }
        }
      };
    });
  }

  function toggleRuntimeSandboxAllowedBackend(backendId, enabled) {
    setSettings((current) => {
      const currentRuntime = {
        ...defaultRuntimeSandboxSettings,
        ...((current.preflight_json || {}).runtime_sandbox || {})
      };
      const currentBackends = Array.isArray(currentRuntime.allowed_backends)
        ? currentRuntime.allowed_backends
        : defaultRuntimeSandboxSettings.allowed_backends;
      const nextBackends = enabled
        ? [...new Set([...currentBackends, backendId])]
        : currentBackends.filter((item) => item !== backendId);
      return {
        ...current,
        preflight_json: {
          ...(current.preflight_json || {}),
          runtime_sandbox: {
            ...currentRuntime,
            allowed_backends: nextBackends.length ? nextBackends : currentBackends
          }
        }
      };
    });
  }

  function updateAuditDefaultsForPackage(packageId) {
    setSettings((current) => ({
      ...(() => {
        const packageOverrides = buildAuditDefaultPackageOverrides(current.audit_defaults_json || {});
        const restoredDefaults = packageOverrides[packageId] && typeof packageOverrides[packageId] === "object"
          ? packageOverrides[packageId]
          : null;
        const derived = {
          ...(restoredDefaults || deriveAuditDefaultsForPackage(packageId, auditPackages, current.audit_defaults_json || {})),
          audit_package: packageId,
          package_overrides: packageOverrides
        };
        return {
          ...current,
          audit_defaults_json: derived,
          preflight_json: {
            ...(current.preflight_json || {}),
            runtime_allowed: derived.runtime_allowed
          },
          review_json: {
            ...(current.review_json || {}),
            require_human_review_for_severity: derived.review_severity,
            publishability_threshold: derived.publishability_threshold
          }
        };
      })()
    }));
  }

  function updateSettingsAgentOverride(agentId, nextPatch) {
    setSettings((current) => ({
      ...current,
      providers_json: {
        ...(current.providers_json || {}),
        agent_overrides: {
          ...((current.providers_json || {}).agent_overrides || {}),
          [agentId]: {
            ...(((current.providers_json || {}).agent_overrides || {})[agentId] || {}),
            ...nextPatch
          }
        }
      }
    }));
  }

  function updateProviderCredentialDraft(fieldId, value) {
    setProviderCredentialDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function updateAgentCredentialDraft(agentId, value) {
    setAgentCredentialDrafts((current) => ({ ...current, [agentId]: value }));
  }

  function toggleVisibleApiKey(key) {
    setVisibleApiKeys((current) => ({ ...current, [key]: !current[key] }));
  }

  function updateIntegrationCredentialDraft(fieldId, value) {
    setIntegrationCredentialDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function updateRequestContext(key, value) {
    setRequestContext((current) => ({ ...current, [key]: key === "workspaceId" ? "default" : value }));
  }

  function updateProjectEditor(key, value) {
    setProjectEditor((current) => ({ ...current, [key]: key === "target_kind" ? (value === "repo" ? "repo" : "path") : value }));
  }

  function updateProjectForm(key, value) {
    setProjectForm((current) => ({ ...current, [key]: key === "target_kind" ? (value === "repo" ? "repo" : "path") : value }));
  }

  function openProjectEditor(project) {
    const targetDefaults = project.target_defaults_json || {};
    const auditDefaults = targetDefaults.audit_package
      ? deriveAuditDefaultsForPackage(targetDefaults.audit_package, auditPackages, effectiveSettings.effective.audit_defaults_json || {})
      : (effectiveSettings.effective.audit_defaults_json || {});
    const projectRunMode = normalizeRunModeSelection(auditDefaults.run_mode) || "static";
    const packageConfig = resolvePackageFormConfig(auditPackages, auditDefaults.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static");
    setProjectEditor({
      id: project.id || "",
      name: project.name || "",
      description: project.description || "",
      config_source: "project",
      target_kind: inferTargetKind(targetDefaults),
      local_path: targetDefaults.local_path || "",
      repo_url: targetDefaults.repo_url || "",
      endpoint_url: targetDefaults.endpoint_url || "",
      audit_policy_pack: "default",
      audit_package: auditDefaults.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static",
      run_mode: projectRunMode,
      enabled_lanes: sanitizeEnabledLanes(auditDefaults.enabled_lanes || packageConfig.enabled_lanes, projectRunMode),
      max_agent_calls: Number(auditDefaults.max_agent_calls || packageConfig.max_agent_calls || 8),
      max_total_tokens: Number(auditDefaults.max_total_tokens || packageConfig.max_total_tokens || 80000),
      max_rerun_rounds: Number(auditDefaults.max_rerun_rounds || packageConfig.max_rerun_rounds || 1),
      publishability_threshold: auditDefaults.publishability_threshold || packageConfig.publishability_threshold || "medium",
      preflight_strictness: targetDefaults.preflight_strictness || effectiveSettings.effective.preflight_json?.strictness || "standard",
      runtime_allowed: auditDefaults.runtime_allowed || effectiveSettings.effective.preflight_json?.runtime_allowed || "never",
      review_severity: auditDefaults.review_severity || effectiveSettings.effective.review_json?.require_human_review_for_severity || "medium",
      review_visibility: targetDefaults.review_visibility || effectiveSettings.effective.review_json?.default_visibility || "internal",
      control_selection_mode: targetDefaults.control_selection_mode || "automatic",
      required_frameworks_text: Array.isArray(targetDefaults.required_frameworks) ? targetDefaults.required_frameworks.join("\n") : "",
      excluded_frameworks_text: Array.isArray(targetDefaults.excluded_frameworks) ? targetDefaults.excluded_frameworks.join("\n") : "",
      required_control_ids_text: Array.isArray(targetDefaults.required_control_ids) ? targetDefaults.required_control_ids.join("\n") : "",
      excluded_control_ids_text: Array.isArray(targetDefaults.excluded_control_ids) ? targetDefaults.excluded_control_ids.join("\n") : "",
      llm_provider: targetDefaults.llm_provider || effectiveSettings.effective.providers_json?.default_provider || "",
      llm_model: targetDefaults.llm_model || effectiveSettings.effective.providers_json?.default_model || "",
      use_global_llm_config: targetDefaults.use_global_llm_config !== false
    });
    setProjectEditOpen(true);
  }

  function buildProjectTargetDefaultsFromEditor(editor) {
    return {
      config_source: "project",
      target_kind: editor.target_kind === "repo" ? "repo" : "path",
      local_path: editor.target_kind === "repo" ? "" : editor.local_path,
      repo_url: editor.target_kind === "repo" ? editor.repo_url : "",
      endpoint_url: "",
      audit_policy_pack: "default",
      audit_package: editor.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static"
  };
}

function triageDecisionFromReviewSummary(summary) {
  const disposition = String(summary?.disposition || "").toLowerCase();
  if (summary?.triage_decision) return summary.triage_decision;
  if (disposition === "confirmed" || disposition === "downgraded") return "confirmed";
  if (disposition === "needs_validation") return "needs_validation";
  if (disposition === "waived" || summary?.active_disposition_type === "waiver") return "accepted_risk";
  if (disposition === "suppressed" && summary?.active_disposition_type === "suppression") return "out_of_scope";
  if (disposition === "suppressed") return "false_positive";
  return "";
}

  function buildProjectTargetDefaultsFromCreateForm(form) {
    return {
      config_source: "project",
      target_kind: form.target_kind === "repo" ? "repo" : "path",
      local_path: form.target_kind === "repo" ? "" : form.local_path,
      repo_url: form.target_kind === "repo" ? form.repo_url : "",
      endpoint_url: "",
      audit_policy_pack: "default",
      audit_package: form.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static"
    };
  }

  function createProject() {
    const payload = {
      name: projectForm.name,
      description: projectForm.description,
      target_defaults: buildProjectTargetDefaultsFromCreateForm(projectForm)
    };
    act(
      () => api("/ui/projects", { method: "POST", body: JSON.stringify(payload) }, requestContext).then((result) => {
        setProjectForm({ name: "", description: "", target_kind: "path", local_path: "", repo_url: "", endpoint_url: "", audit_package: "" });
        setProjectCreateOpen(false);
        if (result?.project?.id) setSelectedProjectId(result.project.id);
        return load();
      }),
      "Project created."
    );
  }

  function saveProjectEditor() {
    const projectId = projectEditor.id || currentProject?.id || "default";
    const payload = {
      id: projectId,
      name: projectEditor.name,
      description: projectEditor.description,
      target_defaults: buildProjectTargetDefaultsFromEditor(projectEditor)
    };
    const defaultProjectExists = projects.some((project) => project.id === "default");
    act(
      () => api(projectId === "default" && !defaultProjectExists ? "/ui/projects" : "/ui/projects/" + encodeURIComponent(projectId), {
        method: projectId === "default" && !defaultProjectExists ? "POST" : "PUT",
        body: JSON.stringify(payload)
      }, requestContext).then(() => {
        setProjectEditOpen(false);
        return Promise.all([load(), loadProjectRuns(projectId)]);
      }),
      "Project saved."
    );
  }

  const currentSettingsScopeLevel = "global";

  function load(options = {}) {
    setError("");
    const criticalLoad = Promise.all([
      api("/auth/info", undefined, requestContext),
      api("/runs?limit=25", undefined, requestContext),
      api("/runs/async", undefined, requestContext),
      api("/ui/settings?scope_level=effective", undefined, requestContext),
      api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), undefined, requestContext),
      api("/ui/documents", undefined, requestContext),
      api("/ui/projects?workspace_id=" + encodeURIComponent(requestContext.workspaceId), undefined, requestContext),
      api("/audit-packages", undefined, requestContext),
      api("/methodology", undefined, requestContext),
      api("/policy-packs", undefined, requestContext),
      api("/llm-providers", undefined, requestContext),
      api("/review-notifications?reviewer_id=" + encodeURIComponent(requestContext.actorId || "anonymous"), undefined, requestContext),
      api("/runtime-followups", undefined, requestContext),
      api("/learning/events?limit=50", undefined, requestContext),
      api("/learning/candidates?limit=50", undefined, requestContext),
      api("/learning/promotions?limit=50", undefined, requestContext),
      api("/learning/jobs?limit=25", undefined, requestContext),
      api("/benchmarks/suites", undefined, requestContext),
      api("/benchmarks/suites/ai-agent-static-v1", undefined, requestContext),
      api("/benchmarks/reports", undefined, requestContext)
    ]).then(([authInfoPayload, runsPayload, jobsPayload, effectiveSettingsPayload, settingsPayload, documentsPayload, projectsPayload, auditPackagesPayload, methodologyPayload, policyPacksPayload, llmProvidersPayload, notificationsPayload, runtimeFollowupsPayload, learningEventsPayload, learningCandidatesPayload, learningPromotionsPayload, learningJobsPayload, benchmarkSuitesPayload, benchmarkSuitePayload, benchmarkReportsPayload]) => {
      setAuthInfo(authInfoPayload || defaultAuthInfo);
      setRuns(runsPayload.runs || []);
      setJobs(jobsPayload.jobs || []);
      setEffectiveSettings(applyEnvironmentDefaultsToEffectiveSettings({
        effective: effectiveSettingsPayload.settings || emptySettings,
        layers: effectiveSettingsPayload.layers || emptyEffectiveSettings.layers
      }, llmProvidersPayload.environment_defaults || {}));
      setSettings(applyEnvironmentDefaultsToSettings(settingsPayload.settings || emptySettings, llmProvidersPayload.environment_defaults || {}));
      setProviderCredentialDrafts({});
      setAgentCredentialDrafts({});
      setIntegrationCredentialDrafts({});
      setDocuments(documentsPayload.documents || []);
      setProjects(projectsPayload.projects || []);
      setAuditPackages(auditPackagesPayload.audit_packages?.length ? auditPackagesPayload.audit_packages : builtinAuditPackages);
      setMethodologyCatalog(methodologyPayload || emptyMethodology);
      setPolicyPacks((policyPacksPayload.policy_packs || []).filter((item) => item.id === "default"));
      setLlmRegistry({
        providers: llmProvidersPayload.providers || [],
        presets: llmProvidersPayload.presets || [],
        environment_defaults: llmProvidersPayload.environment_defaults || {}
      });
      setReviewNotifications(notificationsPayload.review_notifications || []);
      setRuntimeFollowups(runtimeFollowupsPayload.runtime_followups || []);
      setLearningEvents(learningEventsPayload.learning_events || []);
      setLearningCandidates(learningCandidatesPayload.learning_candidates || []);
      setLearningPromotions(learningPromotionsPayload.learning_promotions || []);
      setLearningJobs(learningJobsPayload.learning_jobs || []);
      setBenchmarkSuites(benchmarkSuitesPayload.suites || []);
      setBenchmarkSuiteDetail(benchmarkSuitePayload || null);
      setBenchmarkReports(benchmarkReportsPayload.reports || benchmarkSuitePayload.reports || []);
      const defaultCases = benchmarkSuitePayload.selected_default_cases || [];
      setBenchmarkCaseIds((current) => current.length ? current : defaultCases);
      setLastGlobalSyncAt(new Date().toISOString());
      setIntegrationRegistryLoading(true);
      const deferredLoad = Promise.allSettled([
        api("/stats/runs", undefined, requestContext),
        api("/stats/targets", undefined, requestContext),
        api("/integrations", undefined, requestContext),
        api("/stats/observability?limit=25", undefined, requestContext)
      ]).then(([runStatsResult, targetStatsResult, integrationsResult, observabilityResult]) => {
        if (runStatsResult.status === "fulfilled" || targetStatsResult.status === "fulfilled") {
          setStats((current) => ({
            runs: runStatsResult.status === "fulfilled" ? runStatsResult.value.stats || {} : current.runs || {},
            targets: targetStatsResult.status === "fulfilled" ? targetStatsResult.value.stats || {} : current.targets || {}
          }));
        }
        if (integrationsResult.status === "fulfilled") {
          setIntegrationRegistry(integrationsResult.value.integrations || []);
        }
        setIntegrationRegistryLoading(false);
        if (observabilityResult.status === "fulfilled") {
          setObservabilityHistory(observabilityResult.value || null);
        }
        const firstFailure = [runStatsResult, targetStatsResult, integrationsResult, observabilityResult].find((result) => result.status === "rejected");
        if (firstFailure && options.throwOnError) throw firstFailure.reason;
        return null;
      });
      return options.includeDeferred ? deferredLoad : null;
    }).catch((loadError) => {
      setError(formatUiError(loadError));
      if (options.throwOnError) throw loadError;
      return null;
    });
    return criticalLoad;
  }

  function loadProjectRuns(projectId) {
    if (!projectId) {
      setProjectDetailRuns([]);
      return Promise.resolve();
    }
    setProjectDetailLoading(true);
    const projectScopedContext = { ...requestContext, projectId };
    return api("/runs?limit=12", undefined, projectScopedContext)
      .then((payload) => setProjectDetailRuns(payload.runs || []))
      .catch((loadError) => {
        const message = loadError.message || String(loadError);
        if (["not_found", "run_not_found", "project_not_found"].includes(message)) {
          setProjectDetailRuns([]);
          return;
        }
        setError(formatUiError(message));
      })
      .finally(() => setProjectDetailLoading(false));
  }

  function loadLearningData(message = "") {
    setLearningLoading(true);
    return Promise.all([
      api("/learning/events?limit=100", undefined, requestContext),
      api("/learning/candidates?limit=100", undefined, requestContext),
      api("/learning/promotions?limit=100", undefined, requestContext),
      api("/learning/jobs?limit=25", undefined, requestContext)
    ]).then(([eventsPayload, candidatesPayload, promotionsPayload, jobsPayload]) => {
      setLearningEvents(eventsPayload.learning_events || []);
      setLearningCandidates(candidatesPayload.learning_candidates || []);
      setLearningPromotions(promotionsPayload.learning_promotions || []);
      setLearningJobs(jobsPayload.learning_jobs || []);
      if (message) setNotice(message);
    }).catch((loadError) => {
      setError(formatUiError(loadError));
    }).finally(() => setLearningLoading(false));
  }

  function runLearningNow() {
    setLearningLoading(true);
    return act(
      () => api("/learning/run", {
        method: "POST",
        body: JSON.stringify({})
      }, requestContext).then(() => loadLearningData("Operator-started learning run completed.")),
      ""
    ).finally(() => setLearningLoading(false));
  }

  function runLearningCandidateAction(candidate, action) {
    if (!candidate?.id) return Promise.resolve();
    const path = `/learning/candidates/${encodeURIComponent(candidate.id)}/${action}`;
    const body = action === "reject" ? { reason: "Rejected from Learning workspace." } : {};
    setLearningLoading(true);
    return act(
      () => api(path, {
        method: "POST",
        body: JSON.stringify(body)
      }, requestContext).then(() => loadLearningData(action === "experiment" ? "Learning experiment recorded." : action === "promote" ? "Learning candidate promoted." : "Learning candidate rejected.")),
      ""
    ).finally(() => setLearningLoading(false));
  }

  function rollbackLearningPromotionUi(promotion) {
    if (!promotion?.id) return Promise.resolve();
    setLearningLoading(true);
    return act(
      () => api(`/learning/promotions/${encodeURIComponent(promotion.id)}/rollback`, {
        method: "POST",
        body: JSON.stringify({ reason: "Rolled back from Learning workspace." })
      }, requestContext).then(() => loadLearningData("Learning promotion rolled back.")),
      ""
    ).finally(() => setLearningLoading(false));
  }

  function loadObservabilityTrace(runId) {
    if (!runId) {
      setObservabilityTraceRunId("");
      setObservabilityTrace(null);
      setObservabilityTraceError("");
      return Promise.resolve(null);
    }
    setObservabilityTraceRunId(runId);
    setObservabilityTraceLoading(true);
    setObservabilityTraceError("");
    return api(`/runs/${encodeURIComponent(runId)}/agent-trace`, undefined, requestContext)
      .then((payload) => {
        setObservabilityTrace(payload || null);
        return payload;
      })
      .catch((traceError) => {
        setObservabilityTrace(null);
        setObservabilityTraceError(formatUiError(traceError));
        return null;
      })
      .finally(() => setObservabilityTraceLoading(false));
  }

  function refreshJobsQueue(message = "Queue refreshed.") {
    setError("");
    return api("/runs/async", undefined, requestContext)
      .then((payload) => {
        setJobs(payload.jobs || []);
        if (message) setNotice(message);
      })
      .catch((loadError) => {
        if (message) setError(formatUiError(loadError));
      });
  }

  function syncAllAppData() {
    if (globalSyncLoading) return Promise.resolve();
    setError("");
    setNotice("");
    setGlobalSyncLoading(true);
    return load({ throwOnError: true, includeDeferred: true })
      .then(() => {
        setError("");
        setNotice("All app data synced.");
      })
      .catch((loadError) => {
        setNotice("");
        setError(formatUiError(loadError));
      })
      .finally(() => setGlobalSyncLoading(false));
  }

  function artifactRetentionPayload() {
    return {
      kind: artifactRetentionForm.kind || "runs",
      older_than_days: Math.max(1, Number(artifactRetentionForm.older_than_days || 30)),
      max_gb: artifactRetentionForm.max_gb === "" ? null : Math.max(0.001, Number(artifactRetentionForm.max_gb || 0))
    };
  }

  function loadArtifactRetentionSummary(includeSize = false) {
    setArtifactRetentionLoading(true);
    const kind = encodeURIComponent(artifactRetentionForm.kind || "runs");
    return api(`/artifacts/retention/summary?kind=${kind}&include_size=${includeSize ? "true" : "false"}`, undefined, requestContext)
      .then((payload) => setArtifactRetentionSummary(payload.artifact_retention_summary || null))
      .catch((loadError) => setError(formatUiError(loadError)))
      .finally(() => setArtifactRetentionLoading(false));
  }

  function previewArtifactRetention() {
    setArtifactRetentionLoading(true);
    return api("/artifacts/retention/preview", {
      method: "POST",
      body: JSON.stringify(artifactRetentionPayload())
    }, requestContext)
      .then((payload) => {
        setArtifactRetentionPreview(payload.artifact_retention || null);
        setNotice("Artifact retention preview updated.");
      })
      .catch((loadError) => setError(formatUiError(loadError)))
      .finally(() => setArtifactRetentionLoading(false));
  }

  function pruneArtifactRetention() {
    if (!artifactRetentionPreview || artifactRetentionPreview.removed_count <= 0) {
      setNotice("Preview first; no artifacts are currently selected for pruning.");
      return Promise.resolve();
    }
    const confirmed = window.confirm(`Prune ${artifactRetentionPreview.removed_count} artifact director${artifactRetentionPreview.removed_count === 1 ? "y" : "ies"} and remove ${formatBytes(artifactRetentionPreview.removed_bytes)} of debug artifacts? Persisted SQLite records remain.`);
    if (!confirmed) return Promise.resolve();
    setArtifactRetentionLoading(true);
    return api("/artifacts/retention/prune", {
      method: "POST",
      body: JSON.stringify(artifactRetentionPayload())
    }, requestContext)
      .then((payload) => {
        setArtifactRetentionPreview(payload.artifact_retention || null);
        setNotice("Artifact pruning completed.");
        return loadArtifactRetentionSummary(false);
      })
      .catch((loadError) => setError(formatUiError(loadError)))
      .finally(() => setArtifactRetentionLoading(false));
  }

  function loadRunDetail(runId) {
    if (!runId) {
      setSelectedRunDetail(null);
      setAssistantState({ enabled: null, loading: false, session: null, contextKey: null, messages: [], error: "", lastActions: [] });
      setAssistantScopeType("run");
      return Promise.resolve();
    }
    setAssistantState({ enabled: null, loading: false, session: null, contextKey: null, messages: [], error: "", lastActions: [] });
    setAssistantInput("");
    setAssistantScopeType("run");
    const requestId = runDetailRequestId.current + 1;
    runDetailRequestId.current = requestId;
    setSelectedRunLoading(true);
    const encodedRunId = encodeURIComponent(runId);
    const loadResourceGroup = async (resources, batchSize = 4) => {
      const results = [];
      for (let index = 0; index < resources.length; index += batchSize) {
        const batch = resources.slice(index, index + batchSize);
        const batchResults = await Promise.allSettled(batch.map((resource) => api(resource.path, undefined, requestContext)));
        results.push(...batchResults);
      }
        const payloads = {};
        const failures = [];
        results.forEach((result, index) => {
          const resource = resources[index];
          if (!resource) return;
          if (result.status === "fulfilled") {
            payloads[resource.key] = result.value;
          } else {
            failures.push({ key: resource.key, path: resource.path, reason: result.reason });
            payloads[resource.key] = resource.fallback || null;
          }
        });
        return { payloads, failures };
    };
    const criticalResources = [
      { key: "run", path: "/runs/" + encodedRunId, fallback: {} },
      { key: "summary", path: "/runs/" + encodedRunId + "/summary", fallback: { summary: {} } },
      { key: "exportsIndex", path: `/runs/${encodedRunId}/exports${compareRunId ? `?compare_to=${encodeURIComponent(compareRunId)}` : ""}`, fallback: { export_index: { exports: [] } } },
      { key: "resolvedConfig", path: "/runs/" + encodedRunId + "/resolved-config", fallback: { resolved_configuration: {} } },
      { key: "preflight", path: "/runs/" + encodedRunId + "/preflight", fallback: { preflight: null } },
      { key: "launchIntent", path: "/runs/" + encodedRunId + "/launch-intent", fallback: { launch_intent: null } },
      { key: "sandboxExecution", path: "/runs/" + encodedRunId + "/sandbox-execution", fallback: { sandbox_execution: null } },
      { key: "findings", path: "/runs/" + encodedRunId + "/findings", fallback: { findings: [] } },
      { key: "evidenceRecords", path: "/runs/" + encodedRunId + "/evidence-records", fallback: { evidence_records: [] } },
      { key: "controlResults", path: "/runs/" + encodedRunId + "/control-results", fallback: { control_results: [] } },
      { key: "reviewSummary", path: "/runs/" + encodedRunId + "/review-summary", fallback: { review_summary: { finding_summaries: [] } } },
      { key: "findingDispositions", path: "/runs/" + encodedRunId + "/finding-dispositions", fallback: { finding_dispositions: [], resolved_finding_dispositions: [] } }
    ];
    const optionalResources = [
      { key: "observations", path: "/runs/" + encodedRunId + "/observations", fallback: { observations: [] } },
      { key: "supervisorReview", path: "/runs/" + encodedRunId + "/supervisor-review", fallback: { supervisor_review: null } },
      { key: "remediation", path: "/runs/" + encodedRunId + "/remediation", fallback: { remediation_memo: null } },
      { key: "remediationItems", path: "/runs/" + encodedRunId + "/remediation-items", fallback: { remediation_items: [] } },
      { key: "findingEvaluations", path: "/runs/" + encodedRunId + "/finding-evaluations", fallback: { finding_evaluations: { evaluations: [] } } },
      { key: "findingQuality", path: "/runs/" + encodedRunId + "/finding-quality", fallback: { finding_quality: { findings: [] } } },
      { key: "webhookDeliveries", path: "/runs/" + encodedRunId + "/webhook-deliveries", fallback: { webhook_deliveries: [] } },
      { key: "reviewActions", path: "/runs/" + encodedRunId + "/review-actions", fallback: { review_actions: [] } },
      { key: "reviewComments", path: "/runs/" + encodedRunId + "/review-comments", fallback: { review_comments: [] } },
      { key: "runtimeFollowups", path: "/runs/" + encodedRunId + "/runtime-followups", fallback: { runtime_followups: [] } },
      { key: "learning", path: "/runs/" + encodedRunId + "/learning", fallback: { learning_events: [], learning_candidates: [] } },
      { key: "agentInvocations", path: "/runs/" + encodedRunId + "/agent-invocations", fallback: { agent_invocations: [] } },
      { key: "metrics", path: "/runs/" + encodedRunId + "/metrics", fallback: { metrics: [] } },
      { key: "observabilitySummary", path: "/runs/" + encodedRunId + "/observability-summary", fallback: null },
      { key: "toolAdapters", path: "/runs/" + encodedRunId + "/tool-adapters", fallback: { buckets: [] } },
      { key: "outboundPreview", path: "/runs/" + encodedRunId + "/outbound-preview", fallback: { outbound_preview: { proposed_actions: [] } } },
      { key: "outboundApproval", path: "/runs/" + encodedRunId + "/outbound-approval", fallback: { outbound_approval: null } },
      { key: "outboundSend", path: "/runs/" + encodedRunId + "/outbound-send", fallback: { outbound_send: null } },
      { key: "outboundVerification", path: "/runs/" + encodedRunId + "/outbound-verification", fallback: { outbound_verification: null } },
      { key: "outboundDelivery", path: "/runs/" + encodedRunId + "/outbound-delivery", fallback: { outbound_delivery: null } }
    ];
    return loadResourceGroup(criticalResources).then(({ payloads: criticalPayloads, failures: criticalFailures }) => {
      if (runDetailRequestId.current !== requestId) return null;
      const detail = {
        ...Object.fromEntries([...criticalResources, ...optionalResources].map((resource) => [resource.key, resource.fallback || null])),
        ...criticalPayloads
      };
      setSelectedRunDetail(detail);
      setFindingReviewState((current) => {
        const next = {};
        const findingsPayload = detail.findings || { findings: [] };
        const reviewSummaryPayload = detail.reviewSummary || { review_summary: { finding_summaries: [] } };
        const findingDispositionsPayload = detail.findingDispositions || { resolved_finding_dispositions: [] };
        const reviewFindingSummaries = reviewSummaryPayload.review_summary?.finding_summaries || [];
        for (const finding of findingsPayload.findings || []) {
          const existingSummary = reviewFindingSummaries.find((item) => item.finding_id === finding.id) || null;
          const existingResolvedDisposition = (findingDispositionsPayload.resolved_finding_dispositions || []).find((item) => item.finding_id === finding.id) || null;
          const activeDispositionIds = new Set((existingResolvedDisposition?.active_dispositions || []).map((item) => item.id));
          const currentState = current[finding.id] || {};
          const persistedTriageDecision = triageDecisionFromReviewSummary(existingSummary);
          const persistedSeverityOverride = existingSummary?.current_severity && existingSummary.current_severity !== finding.severity ? existingSummary.current_severity : "";
          const persistedNotes = Array.isArray(existingSummary?.notes) && existingSummary.notes.length ? existingSummary.notes[existingSummary.notes.length - 1] : "";
          const hasActiveDisposition = existingSummary?.disposition_status === "active";
          next[finding.id] = {
            triage_decision: currentState.triage_decision || persistedTriageDecision || "",
            updated_severity: currentState.updated_severity || persistedSeverityOverride || "",
            visibility_override: currentState.visibility_override || "",
            review_priority: currentState.review_priority || existingSummary?.review_priority || "",
            validation_intent: currentState.validation_intent || existingSummary?.validation_intent || (persistedTriageDecision === "needs_validation" ? "manual_review" : "not_required"),
            notes: currentState.notes || persistedNotes || "",
            disposition_reason: currentState.disposition_reason || (hasActiveDisposition ? existingSummary?.active_disposition_reason : "") || "",
            disposition_expires_at: currentState.disposition_expires_at || (hasActiveDisposition ? existingSummary?.active_disposition_expires_at : "") || "",
            disposition_owner_id: currentState.disposition_owner_id || (hasActiveDisposition ? existingSummary?.active_disposition_owner_id : "") || requestContext.actorId || "",
            disposition_reviewed_at: currentState.disposition_reviewed_at || (hasActiveDisposition ? existingSummary?.active_disposition_reviewed_at : "") || new Date().toISOString(),
            disposition_review_due_by: currentState.disposition_review_due_by || (hasActiveDisposition ? existingSummary?.active_disposition_review_due_by : "") || "",
            exception_scope: currentState.exception_scope || (hasActiveDisposition && existingSummary?.active_disposition_scope === "project" ? "future_repo" : "") || "",
            editing_disposition_id: activeDispositionIds.has(currentState.editing_disposition_id) ? currentState.editing_disposition_id : ""
          };
        }
        return next;
      });
      setReviewAssignee(detail.summary?.summary?.current_reviewer_id || detail.run?.run?.review_workflow?.current_reviewer_id || requestContext.actorId || "");
      setReviewCommentBody("");
      setReviewCommentFindingId("");
      setSelectedFindingId((current) => current && (detail.findings?.findings || []).some((finding) => finding.id === current) ? current : (detail.findings?.findings || [])[0]?.id || "");
      setCompareRunId((current) => current || "");
      setOutboundActionType((detail.outboundPreview?.outbound_preview?.proposed_actions || [])[0]?.action_type || "pr_comment");
      setOutboundTargetNumber("");
      setSelectedRunLoading(false);
      if (criticalFailures.length) {
        setError(`Run detail loaded with ${criticalFailures.length} missing section${criticalFailures.length === 1 ? "" : "s"}. ${formatUiError(criticalFailures[0].reason)}`);
      }
      return loadResourceGroup(optionalResources).then(({ payloads: optionalPayloads }) => {
        if (runDetailRequestId.current !== requestId) return null;
        setSelectedRunDetail((current) => current ? { ...current, ...optionalPayloads } : current);
        return optionalPayloads;
      });
    }).catch((loadError) => {
      if (runDetailRequestId.current !== requestId) return null;
      setSelectedRunDetail(null);
      setError(formatUiError(loadError));
      setSelectedRunLoading(false);
      return null;
      });
  }

  function getAssistantScopeContext() {
    const runRecord = selectedRunDetail?.run?.run || selectedRunDetail?.summary?.summary || null;
    const targetId = runRecord?.canonical_target_id || runRecord?.target_id || selectedRunDetail?.run?.run?.target?.id || "";
    const scopeType = assistantScopeType === "target" ? "target" : "run";
    const scopeId = scopeType === "target" ? targetId : selectedRunId;
    const contextKey = `${requestContext.workspaceId || "default"}:${requestContext.projectId || "default"}:${scopeType}:${scopeId}:${scopeType === "run" ? (selectedFindingId || "run") : "target"}`;
    return { scopeType, scopeId, contextKey };
  }

  function loadAssistantSessions() {
    const { scopeType, scopeId, contextKey } = getAssistantScopeContext();
    if (!scopeId) {
      setAssistantSessions([]);
      setAssistantSessionsError("");
      return Promise.resolve([]);
    }
    setAssistantSessionsLoading(true);
    setAssistantSessionsError("");
    const query = new URLSearchParams({ scope_type: scopeType, scope_id: scopeId, context_key: contextKey });
    return api(`/assistant/sessions?${query.toString()}`, undefined, requestContext)
      .then((payload) => {
        const sessions = payload.assistant_sessions || [];
        setAssistantSessions(sessions);
        setAssistantSessionsError("");
        return sessions;
      })
      .catch((assistantError) => {
        setAssistantSessions([]);
        setAssistantSessionsError(formatUiError(assistantError));
        return [];
      })
      .finally(() => setAssistantSessionsLoading(false));
  }

  function ensureAssistantSession() {
    const { scopeType, scopeId, contextKey } = getAssistantScopeContext();
    if (!scopeId) return Promise.reject(new Error(scopeType === "target" ? "Target history is not available for this run yet." : "Select a run before asking the assistant."));
    if (assistantState.session?.scope_type === scopeType && assistantState.session?.scope_id === scopeId && assistantState.contextKey === contextKey) return Promise.resolve(assistantState.session);
    setAssistantState((current) => ({ ...current, loading: true, error: "" }));
    return api("/assistant/capabilities", undefined, requestContext)
      .then((capabilities) => {
        if (!capabilities.enabled) throw new Error("Assistant is disabled by an API environment override.");
        return api("/assistant/sessions", {
          method: "POST",
          body: JSON.stringify({ scope_type: scopeType, scope_id: scopeId, context_key: contextKey })
        }, requestContext);
      })
      .then((payload) => {
        const session = payload.assistant_session || null;
        setAssistantState((current) => ({ ...current, enabled: true, loading: false, session, contextKey, messages: [], error: "", lastActions: [] }));
        loadAssistantSessions();
        return session;
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, enabled: false, loading: false, error: formatUiError(assistantError) }));
        throw assistantError;
      });
  }

  function sendAssistantMessage(message) {
    const prompt = String(message ?? assistantInput).trim();
    if (!prompt) return;
    setAssistantInput("");
    setAssistantState((current) => ({ ...current, loading: true, error: "" }));
    ensureAssistantSession()
      .then((session) => api(`/assistant/sessions/${encodeURIComponent(session.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: prompt })
      }, requestContext))
      .then((payload) => {
        setAssistantState((current) => ({
          ...current,
          enabled: true,
          loading: false,
          session: payload.assistant_session || current.session,
          contextKey: current.contextKey,
          messages: [...current.messages, payload.user_message, payload.assistant_message].filter(Boolean),
          lastActions: payload.proposed_actions || [],
          error: ""
        }));
        loadAssistantSessions();
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, loading: false, error: formatUiError(assistantError) }));
      });
  }

  function changeAssistantScope(nextScope) {
    const normalized = nextScope === "target" ? "target" : "run";
    setAssistantScopeType(normalized);
    setAssistantState((current) => current.session?.scope_type === normalized
      ? current
      : { ...current, session: null, contextKey: null, messages: [], lastActions: [], error: "" });
  }

  function startNewAssistantSession() {
    setAssistantState((current) => ({ ...current, session: null, contextKey: null, messages: [], lastActions: [], error: "" }));
    setAssistantInput("");
  }

  function openAssistantSession(session) {
    if (!session?.id) return;
    setAssistantState((current) => ({ ...current, loading: true, error: "" }));
    api(`/assistant/sessions/${encodeURIComponent(session.id)}/messages`, undefined, requestContext)
      .then((payload) => {
        setAssistantState((current) => ({
          ...current,
          enabled: true,
          loading: false,
          session: payload.assistant_session || session,
          contextKey: session.metadata_json?.context_key || getAssistantScopeContext().contextKey,
          messages: payload.messages || [],
          lastActions: [],
          error: ""
        }));
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, loading: false, error: formatUiError(assistantError) }));
      });
  }

  function renameAssistantSession(session) {
    if (!session?.id) return;
    const currentTitle = session.title || session.metadata_json?.title || "";
    const nextTitle = window.prompt("Rename chat", currentTitle);
    if (nextTitle === null) return;
    api(`/assistant/sessions/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ title: nextTitle })
    }, requestContext)
      .then((payload) => {
        const updated = payload.assistant_session || session;
        setAssistantSessions((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated, title: updated.metadata_json?.title || item.title } : item));
        setAssistantState((current) => current.session?.id === updated.id
          ? { ...current, session: updated }
          : current);
        loadAssistantSessions();
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, error: formatUiError(assistantError) }));
      });
  }

  function archiveAssistantSession(session) {
    if (!session?.id) return;
    const confirmed = window.confirm("Archive this chat? It will be hidden from Recent chats but kept in local assistant records.");
    if (!confirmed) return;
    api(`/assistant/sessions/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" })
    }, requestContext)
      .then(() => {
        setAssistantSessions((current) => current.filter((item) => item.id !== session.id));
        setAssistantState((current) => current.session?.id === session.id
          ? { ...current, session: null, contextKey: null, messages: [], lastActions: [], error: "" }
          : current);
        setNotice("Assistant chat archived.");
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, error: formatUiError(assistantError) }));
      });
  }

  function deleteAssistantSession(session) {
    if (!session?.id) return;
    const confirmed = window.confirm("Delete this chat from active history? The local audit records remain soft-deleted for traceability.");
    if (!confirmed) return;
    api(`/assistant/sessions/${encodeURIComponent(session.id)}`, {
      method: "DELETE"
    }, requestContext)
      .then(() => {
        setAssistantSessions((current) => current.filter((item) => item.id !== session.id));
        setAssistantState((current) => current.session?.id === session.id
          ? { ...current, session: null, contextKey: null, messages: [], lastActions: [], error: "" }
          : current);
        setNotice("Assistant chat deleted from active history.");
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, error: formatUiError(assistantError) }));
      });
  }

  useEffect(() => {
    loadAssistantSessions();
  }, [selectedRunId, selectedFindingId, assistantScopeType, requestContext.workspaceId, requestContext.projectId]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("tethermark-theme", theme);
    } catch {
      // Theme persistence is best-effort; the UI still updates for this session.
    }
  }, [theme]);

  function resolveAssistantAction(action, decision) {
    const session = assistantState.session;
    if (!session || !action?.id) return;
    setAssistantState((current) => ({ ...current, loading: true, error: "" }));
    api(`/assistant/sessions/${encodeURIComponent(session.id)}/actions/${encodeURIComponent(action.id)}/${decision}`, {
      method: "POST",
      body: JSON.stringify({})
    }, requestContext)
      .then(() => {
        setAssistantState((current) => ({
          ...current,
          loading: false,
          lastActions: (current.lastActions || []).map((item) => item.id === action.id ? { ...item, status: decision === "confirm" ? "confirmed" : "rejected" } : item)
        }));
        if (decision === "confirm") {
          setNotice("Assistant action confirmed.");
          return loadRunDetail(selectedRunId);
        }
        setNotice("Assistant action rejected.");
        return null;
      })
      .catch((assistantError) => {
        setAssistantState((current) => ({ ...current, loading: false, error: formatUiError(assistantError) }));
      });
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
        setError(formatUiError(loadError));
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
      setError(formatUiError(loadError));
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
      setError(formatUiError(loadError));
    }).finally(() => setLinkedRuntimeRerunLoading(false));
  }

  function clearOAuthStatusPoll() {
    if (!oauthStatusPollTimer.current) return;
    clearTimeout(oauthStatusPollTimer.current);
    oauthStatusPollTimer.current = null;
  }

  function scheduleOAuthStatusPoll(requestId, remainingChecks = 30) {
    clearOAuthStatusPoll();
    oauthStatusPollTimer.current = setTimeout(() => {
      api("/llm-providers/openai_codex/status", undefined, requestContext)
        .then((payload) => {
          if (oauthStatusRequestId.current !== requestId) return;
          if (payload.connected) {
            clearOAuthStatusPoll();
            setOauthConnectionState(payload);
            return;
          }
          if (remainingChecks <= 1) {
            setOauthConnectionState({
              ...payload,
              connected: false,
              status: "not_connected",
              note: "ChatGPT sign-in was not detected. Use Connect ChatGPT account again if the browser prompt was closed or did not finish."
            });
            return;
          }
          setOauthConnectionState((current) => ({
            ...(current || {}),
            connected: false,
            status: "started",
            command: payload.command || current?.command || "codex",
            checked_at: payload.checked_at || new Date().toISOString(),
            note: "Waiting for ChatGPT sign-in to finish. This status updates automatically."
          }));
          scheduleOAuthStatusPoll(requestId, remainingChecks - 1);
        })
        .catch(() => {
          if (oauthStatusRequestId.current === requestId && remainingChecks > 1) {
            scheduleOAuthStatusPoll(requestId, remainingChecks - 1);
          }
        });
    }, 2500);
  }

  useEffect(() => {
    load();
  }, [requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey, currentSettingsScopeLevel]);

  useLayoutEffect(() => {
    const container = systemPanelScrollRef.current;
    const previousKey = systemScrollKeyRef.current;
    if (container && previousKey && previousKey !== systemScrollKey) {
      systemScrollPositionsRef.current[previousKey] = container.scrollTop;
    }
    systemScrollKeyRef.current = systemScrollKey;
    if (!container || !systemScrollKey) return undefined;
    const nextTop = Number(systemScrollPositionsRef.current[systemScrollKey] || 0);
    const restoreScroll = () => {
      if (systemPanelScrollRef.current) {
        systemPanelScrollRef.current.scrollTop = nextTop;
      }
    };
    let nestedFrame = 0;
    let timeout = 0;
    const frame = window.requestAnimationFrame(() => {
      restoreScroll();
      nestedFrame = window.requestAnimationFrame(restoreScroll);
      timeout = window.setTimeout(restoreScroll, 50);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [systemScrollKey]);

  useEffect(() => {
    const container = systemPanelScrollRef.current;
    if (view !== "system" || !container || !systemScrollKey) return undefined;
    let frame = 0;
    const saveScroll = () => {
      if (systemScrollSaveSuspendedRef.current) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (systemScrollSaveSuspendedRef.current) return;
        systemScrollPositionsRef.current[systemScrollKey] = container.scrollTop;
      });
    };
    container.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (systemScrollKeyRef.current === systemScrollKey) {
        systemScrollPositionsRef.current[systemScrollKey] = container.scrollTop;
      }
      container.removeEventListener("scroll", saveScroll);
    };
  }, [view, systemScrollKey]);

  useEffect(() => {
    if (!((view === "system" && systemSubpage === "jobs") || view === "jobs") || !jobs.some(isActiveAsyncJob)) return undefined;
    const timer = window.setInterval(() => {
      refreshJobsQueue("");
    }, 2500);
    return () => window.clearInterval(timer);
  }, [view, systemSubpage, jobs.map((job) => `${job.job_id}:${job.status}`).join("|"), requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if (!((view === "system" && (systemSubpage === "artifacts" || systemSubpage === "data")) || (view === "settings" && settingsSubpage === "artifacts"))) return;
    loadArtifactRetentionSummary(false);
  }, [view, systemSubpage, settingsSubpage, artifactRetentionForm.kind, requestContext.workspaceId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    const needsToolReadiness = (view === "system" && systemSubpage === "tools") || (view === "admin" && adminSubpage === "tooling") || (view === "settings" && settingsSubpage === "static-tools");
    if (!needsToolReadiness) return;
    setStaticToolsLoading(true);
    withUiTimeout(
      Promise.all([
        api("/static-tools", undefined, requestContext),
        api("/static-tools/path", undefined, requestContext)
      ]),
      15000,
      "Static tool readiness timed out. Check the API process and retry Tool Selection -> Refresh Tools."
    )
      .then(([toolsPayload, pathPayload]) => {
        setStaticToolsReadiness(toolsPayload.static_tools || emptyStaticToolsReadiness);
        setStaticToolsPathMeta(pathPayload.static_tools_path || null);
        setStaticToolsPathDraft(pathPayload.static_tools_path?.file_value || "");
      })
      .catch((loadError) => setError(formatUiError(loadError)))
      .finally(() => setStaticToolsLoading(false));
  }, [view, systemSubpage, adminSubpage, settingsSubpage, requestContext.workspaceId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    const loadKey = runtimeSandboxReadinessKey();
    if (runtimeSandboxReadinessLoadKeyRef.current === loadKey) return;
    setRuntimeSandboxReadinessChecked(false);
    loadRuntimeSandboxReadiness({ force: true })
      .catch((loadError) => setError(formatUiError(loadError)));
  }, [requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if (settings.providers_json.default_provider !== "openai_codex") {
      oauthStatusRequestId.current += 1;
      clearOAuthStatusPoll();
      setOauthConnectionState(null);
      return;
    }
    const requestId = oauthStatusRequestId.current + 1;
    oauthStatusRequestId.current = requestId;
    api("/llm-providers/openai_codex/status", undefined, requestContext)
      .then((payload) => {
        if (oauthStatusRequestId.current === requestId) setOauthConnectionState(payload);
      })
      .catch(() => {
        if (oauthStatusRequestId.current === requestId) setOauthConnectionState(null);
      });
  }, [settings.providers_json.default_provider, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => () => clearOAuthStatusPoll(), []);

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
    if (view !== "runs" && view !== "reviews") return;
    loadRunDetail(selectedRunId);
  }, [view, selectedRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    setRunNotice("");
  }, [selectedRunId]);

  useEffect(() => {
    loadRunComparison(selectedRunId, compareRunId);
  }, [selectedRunId, compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    loadComparisonRunDetail(compareRunId);
  }, [compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    if ((view !== "runs" && view !== "reviews") || !selectedRunId || !compareRunId) return;
    api(`/runs/${encodeURIComponent(selectedRunId)}/exports${compareRunId ? `?compare_to=${encodeURIComponent(compareRunId)}` : ""}`, undefined, requestContext)
      .then((payload) => {
        setSelectedRunDetail((current) => current ? { ...current, exportsIndex: payload } : current);
      })
      .catch(() => {});
  }, [view, selectedRunId, compareRunId, requestContext.workspaceId, requestContext.projectId, requestContext.actorId, requestContext.apiKey]);

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
    const matchingProject = projectOptions.find((item) => item.id === requestContext.projectId);
    if (requestContext.projectId && !matchingProject) {
      updateRequestContext("projectId", "default");
    }
    if (!requestContext.projectId) {
      updateRequestContext("projectId", "default");
    }
  }, [projectOptions, requestContext.projectId]);

  useEffect(() => {
    if (!projectOptions.length) return;
    if (!projectOptions.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectOptions[0]?.id || "default");
    }
  }, [projectOptions, selectedProjectId]);

  useEffect(() => {
    if (view !== "projects") return;
    loadProjectRuns(selectedProject?.id || "default");
  }, [view, selectedProject?.id, requestContext.workspaceId, requestContext.actorId, requestContext.apiKey]);

  useEffect(() => {
    const defaults = deriveRunFormDefaults(currentProject, effectiveSettings, auditPackages);
    const targetDefaults = currentProject?.target_defaults_json || {};
    const projectAuditDefaults = targetDefaults.audit_package
      ? deriveAuditDefaultsForPackage(targetDefaults.audit_package, auditPackages, effectiveSettings.effective.audit_defaults_json || {})
      : (effectiveSettings.effective.audit_defaults_json || {});
    const projectRunMode = normalizeRunModeSelection(projectAuditDefaults.run_mode) || "static";
    const projectPackageConfig = resolvePackageFormConfig(auditPackages, projectAuditDefaults.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static");
    setRunForm(defaults);
    setPreflightSummary(null);
    setPreflightStale(true);
    setPreflightCheckedAt(null);
    setPreflightAcceptedAt(null);
    setProjectEditor({
      id: currentProject?.id || "",
      name: currentProject?.name || "",
      description: currentProject?.description || "",
      config_source: "project",
      target_kind: inferTargetKind(targetDefaults),
      local_path: targetDefaults.local_path || "",
      repo_url: targetDefaults.repo_url || "",
      endpoint_url: targetDefaults.endpoint_url || "",
      audit_policy_pack: "default",
      audit_package: projectAuditDefaults.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static",
      run_mode: projectRunMode,
      enabled_lanes: sanitizeEnabledLanes(projectAuditDefaults.enabled_lanes || projectPackageConfig.enabled_lanes, projectRunMode),
      max_agent_calls: Number(projectAuditDefaults.max_agent_calls || projectPackageConfig.max_agent_calls || 8),
      max_total_tokens: Number(projectAuditDefaults.max_total_tokens || projectPackageConfig.max_total_tokens || 80000),
      max_rerun_rounds: Number(projectAuditDefaults.max_rerun_rounds || projectPackageConfig.max_rerun_rounds || 1),
      publishability_threshold: projectAuditDefaults.publishability_threshold || projectPackageConfig.publishability_threshold || "medium",
      preflight_strictness: targetDefaults.preflight_strictness || effectiveSettings.effective.preflight_json?.strictness || "standard",
      runtime_allowed: projectAuditDefaults.runtime_allowed || effectiveSettings.effective.preflight_json?.runtime_allowed || "never",
      review_severity: projectAuditDefaults.review_severity || effectiveSettings.effective.review_json?.require_human_review_for_severity || "medium",
      review_visibility: targetDefaults.review_visibility || effectiveSettings.effective.review_json?.default_visibility || "internal",
      control_selection_mode: targetDefaults.control_selection_mode || "automatic",
      required_frameworks_text: Array.isArray(targetDefaults.required_frameworks) ? targetDefaults.required_frameworks.join("\n") : "",
      excluded_frameworks_text: Array.isArray(targetDefaults.excluded_frameworks) ? targetDefaults.excluded_frameworks.join("\n") : "",
      required_control_ids_text: Array.isArray(targetDefaults.required_control_ids) ? targetDefaults.required_control_ids.join("\n") : "",
      excluded_control_ids_text: Array.isArray(targetDefaults.excluded_control_ids) ? targetDefaults.excluded_control_ids.join("\n") : "",
      llm_provider: targetDefaults.llm_provider || effectiveSettings.effective.providers_json?.default_provider || "",
      llm_model: targetDefaults.llm_model || effectiveSettings.effective.providers_json?.default_model || "",
      use_global_llm_config: targetDefaults.use_global_llm_config !== false
    });
  }, [runDefaultsKey]);

  useEffect(() => {
    window.localStorage.setItem(contextStorageKey, JSON.stringify(requestContext));
  }, [requestContext]);

  function act(task, message, options = {}) {
    setError("");
    if (options.scope === "run") {
      setRunNotice("");
      setNotice("");
    } else {
      setNotice("");
    }
    task().then(() => {
      if (message) {
        if (options.scope === "run") {
          setRunNotice(message);
          setNotice("");
        } else {
          setNotice(message);
        }
      }
      return load();
    }).catch((taskError) => setError(formatUiError(taskError)));
  }

  function runPreflight() {
    setError("");
    setNotice("");
    setPreflightLoading(true);
    api("/preflight", { method: "POST", body: JSON.stringify(buildRunRequest(runForm, effectiveSettings, llmRegistry, auditPackages)) }, requestContext)
      .then((payload) => {
        setPreflightSummary(payload.preflight || null);
        setPreflightStale(false);
        setPreflightCheckedAt(new Date().toISOString());
        setPreflightAcceptedAt(null);
      })
      .catch((taskError) => setError(formatUiError(taskError)))
      .finally(() => setPreflightLoading(false));
  }

  function acceptPreflight() {
    if (!preflightSummary || preflightStale) return;
    setPreflightAcceptedAt(new Date().toISOString());
    setNotice("Audit readiness accepted for launch.");
    setError("");
  }

  function applyPreflightRecommendations() {
    if (!preflightSummary?.launch_profile) return;
    const recommended = preflightSummary.launch_profile;
    setRunForm((current) => {
      const next = {
        ...current,
        audit_package: recommended.audit_package || current.audit_package,
        audit_policy_pack: recommended.audit_policy_pack || "",
        run_mode: normalizeRunModeSelection(recommended.run_mode) || current.run_mode,
        llm_provider: recommended.llm_provider || current.llm_provider,
        llm_model: recommended.llm_model || "",
        preflight_strictness: recommended.preflight_strictness || current.preflight_strictness,
        runtime_allowed: recommended.runtime_allowed || current.runtime_allowed,
        review_severity: recommended.review_severity || current.review_severity,
        review_visibility: recommended.review_visibility || current.review_visibility
      };
      return current.use_audit_presets
        ? applyPresetDerivedFormState(next, auditPackages)
        : { ...next, enabled_lanes: defaultLanesForRunMode(next.run_mode || "static") };
    });
    setPreflightAcceptedAt(null);
    setPreflightStale(true);
    setNotice("Applied the recommended audit readiness profile. Re-run the readiness check to confirm the updated launch plan.");
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
    setNotice(`Applied launch preset: ${preset.label}. Re-run the readiness check before launch.`);
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
        }, effectiveSettings, llmRegistry, auditPackages))
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

  function launchDiagnosticRun(kind, target = "pi") {
    const request = buildDiagnosticsRunRequest({ kind, target, effectiveSettings, auditPackages });
    if (kind !== "plumbing" && !request.llm_provider) {
      setError("Configure a real LLM provider in System -> Agents & Models before launching static audit smoke or benchmark diagnostics.");
      return;
    }
    act(
      () => api("/runs/async", {
        method: "POST",
        body: JSON.stringify({
          request,
          start_immediately: true
        })
      }, requestContext).then((payload) => {
        if (payload?.job?.current_run_id) {
          setSelectedRunId(payload.job.current_run_id);
        }
        setView("system");
        setSystemSubpage("jobs");
        return payload;
      }),
      kind === "plumbing"
        ? "Plumbing smoke job queued."
        : kind === "static_audit"
          ? "Static audit smoke job queued."
        : "Benchmark job queued."
    );
  }

  function toggleValidationScenario(scenarioId, checked) {
    setValidationScenarioIds((current) => {
      const next = checked
        ? [...new Set([...current, scenarioId])]
        : current.filter((item) => item !== scenarioId);
      return next.length ? next : current;
    });
  }

  function launchValidationScenarios(scenarios) {
    if (validationLaunching) return;
    const selectedScenarios = scenarios.filter((scenario) => validationScenarioIds.includes(scenario.id));
    if (!selectedScenarios.length) {
      setError("Select at least one validation scenario.");
      return;
    }
    const activeMatches = selectedScenarios
      .map((scenario) => ({
        scenario,
        job: jobs.find((job) => isActiveAsyncJob(job) && getAsyncJobType(job) === (scenario.id === "system_check" ? "system_check" : scenario.id === "static_smoke" ? "static_smoke" : "benchmark") && getAsyncJobDiagnosticTarget(job) === scenario.target)
      }))
      .filter((item) => item.job);
    if (activeMatches.length) {
      setError(`${activeMatches.map((item) => item.scenario.title).join(", ")} already has an active validation job. Open Jobs to monitor it.`);
      return;
    }
    const providerRequired = selectedScenarios.some((scenario) => scenario.kind !== "plumbing");
    if (providerRequired && !diagnosticDefaultProvider) {
      setError("Configure a real LLM provider in System -> Agents & Models before launching static audit smoke or benchmark validations.");
      return;
    }
    setValidationLaunching(true);
    act(
      () => Promise.all(selectedScenarios.map((scenario) => api("/runs/async", {
        method: "POST",
        body: JSON.stringify({
          request: buildDiagnosticsRunRequest({
            kind: scenario.kind,
            target: scenario.target,
            effectiveSettings,
            auditPackages
          }),
          start_immediately: true
        })
      }, requestContext))).then((payloads) => {
        const queuedRunIds = payloads.map((payload) => payload?.job?.current_run_id).filter(Boolean);
        const lastRunId = queuedRunIds[queuedRunIds.length - 1];
        if (lastRunId) setSelectedRunId(lastRunId);
        setView("system");
        setSystemSubpage("jobs");
        return payloads;
      }).finally(() => setValidationLaunching(false)),
      `${selectedScenarios.length} validation job${selectedScenarios.length === 1 ? "" : "s"} queued.`
    );
  }

  function refreshBenchmarkData() {
    act(
      () => Promise.all([
        api("/benchmarks/suites", undefined, requestContext),
        api("/benchmarks/suites/ai-agent-static-v1", undefined, requestContext),
        api("/benchmarks/reports", undefined, requestContext)
      ]).then(([suitesPayload, suitePayload, reportsPayload]) => {
        setBenchmarkSuites(suitesPayload.suites || []);
        setBenchmarkSuiteDetail(suitePayload || null);
        setBenchmarkReports(reportsPayload.reports || suitePayload.reports || []);
        if (!benchmarkCaseIds.length) setBenchmarkCaseIds(suitePayload.selected_default_cases || []);
      }),
      "Benchmark suite refreshed."
    );
  }

  function toggleBenchmarkCase(caseId, checked) {
    setBenchmarkCaseIds((current) => checked
      ? [...new Set([...current, caseId])]
      : current.filter((item) => item !== caseId));
  }

  function selectBenchmarkDefaults() {
    setBenchmarkCaseIds(benchmarkSuiteDetail?.selected_default_cases || []);
    setBenchmarkIncludeExtended(false);
    setBenchmarkIncludeRuntimePending(false);
  }

  function selectBenchmarkAllStatic() {
    const cases = benchmarkSuiteDetail?.suite?.cases || [];
    setBenchmarkCaseIds(cases.filter((item) => item.tier !== "runtime_pending").map((item) => item.id));
    setBenchmarkIncludeExtended(true);
    setBenchmarkIncludeRuntimePending(false);
  }

  function runBenchmarkCases() {
    if (benchmarkRunning) return;
    if (!benchmarkCaseIds.length) {
      setError("Select at least one benchmark case.");
      return;
    }
    setBenchmarkRunning(true);
    setBenchmarkLastSummary(null);
    const suiteId = benchmarkSuiteDetail?.suite?.suite_id || "ai-agent-static-v1";
    const selectedCases = [...benchmarkCaseIds];
    act(
      () => api(`/benchmarks/suites/${encodeURIComponent(suiteId)}/run`, {
        method: "POST",
        body: JSON.stringify({
          case_ids: selectedCases,
          include_extended: benchmarkIncludeExtended,
          include_runtime_pending: benchmarkIncludeRuntimePending,
          execute: benchmarkExecute,
          strict: benchmarkStrict,
          use_settings_provider: true
        })
      }, requestContext).then((payload) => {
        const combinedReports = payload.reports || [];
        const latestSummary = payload.benchmark_summary || null;
        setBenchmarkLastSummary(latestSummary);
        if (combinedReports.length) {
          const byName = new Map([...combinedReports, ...benchmarkReports].map((item) => [item.file_name, item]));
          setBenchmarkReports([...byName.values()].sort((left, right) => String(right.generated_at || right.modified_at || "").localeCompare(String(left.generated_at || left.modified_at || ""))));
        }
        return payload;
      }).finally(() => setBenchmarkRunning(false)),
      benchmarkExecute
        ? `${selectedCases.length} benchmark case${selectedCases.length === 1 ? "" : "s"} executed.`
        : `${selectedCases.length} benchmark case${selectedCases.length === 1 ? "" : "s"} dry-run complete.`
    );
  }

  function compareBenchmarkReportsUi() {
    if (!benchmarkCompareBaseline || !benchmarkCompareCurrent) {
      setError("Select both baseline and current benchmark reports.");
      return;
    }
    act(
      () => api("/benchmarks/compare", {
        method: "POST",
        body: JSON.stringify({
          baseline: benchmarkCompareBaseline,
          current: benchmarkCompareCurrent
        })
      }, requestContext).then((payload) => {
        setBenchmarkComparison(payload.comparison || null);
        return payload;
      }),
      "Benchmark reports compared."
    );
  }

  function openAsyncJobRun(job) {
    if (!job?.current_run_id) return;
    setError("");
    setNotice("");
    setRunNotice("");
    setSelectedRunId(job.current_run_id);
    setView("runs");
  }

  function runtimeSandboxReadinessKey() {
    return [
      requestContext.workspaceId || "",
      requestContext.projectId || "",
      requestContext.actorId || "",
      requestContext.apiKey || ""
    ].join("|");
  }

  function loadRuntimeSandboxReadiness(options = {}) {
    const { force = false } = options;
    const loadKey = runtimeSandboxReadinessKey();
    if (!force && runtimeSandboxReadinessLoadKeyRef.current === loadKey && runtimeSandboxReadinessChecked) {
      return Promise.resolve(runtimeSandboxReadiness);
    }
    if (!force && runtimeSandboxReadinessInFlightKeyRef.current === loadKey) {
      return Promise.resolve(runtimeSandboxReadiness);
    }
    runtimeSandboxReadinessInFlightKeyRef.current = loadKey;
    setRuntimeSandboxReadinessLoading(true);
    return withUiTimeout(
      Promise.all([
        api("/runtime-sandbox/readiness", undefined, requestContext),
        api("/runtime-sandbox/setup-plan", undefined, requestContext)
      ]),
      15000,
      "Runtime sandbox readiness timed out. Check the API process and retry Refresh Readiness."
    ).then(([readinessPayload, setupPayload]) => {
      const nextReadiness = readinessPayload.runtime_sandbox || emptyRuntimeSandboxReadiness;
      setRuntimeSandboxReadiness(nextReadiness);
      setRuntimeSandboxSetupPlan(setupPayload.runtime_sandbox_setup || null);
      runtimeSandboxReadinessLoadKeyRef.current = loadKey;
      return nextReadiness;
    }).finally(() => {
      if (runtimeSandboxReadinessInFlightKeyRef.current === loadKey) {
        runtimeSandboxReadinessInFlightKeyRef.current = "";
      }
      setRuntimeSandboxReadinessLoading(false);
      setRuntimeSandboxReadinessChecked(true);
    });
  }

  function refreshRuntimeSandboxReadiness() {
    setRuntimeSandboxReadinessChecked(false);
    act(
      () => loadRuntimeSandboxReadiness({ force: true }),
      "Runtime sandbox readiness refreshed."
    );
  }

  function installRuntimeSandboxBackend() {
    const confirmed = window.confirm("Install the recommended local runtime now? Tethermark will run the system package-manager command. Your operating system may show installer prompts, and you may need to start Docker Desktop or the selected runtime afterward.");
    if (!confirmed) return;
    setRuntimeSandboxSetupRunning(true);
    setRuntimeSandboxReadinessChecked(false);
    setRuntimeSandboxReadinessLoading(true);
    act(
      () => api("/runtime-sandbox/setup", {
        method: "POST",
        body: JSON.stringify({ confirm: true })
      }, requestContext).then((payload) => {
        setRuntimeSandboxSetupResult(payload.runtime_sandbox_setup || null);
        if (payload.runtime_sandbox_setup?.readiness_after) {
          setRuntimeSandboxReadiness(payload.runtime_sandbox_setup.readiness_after);
        }
        return loadRuntimeSandboxReadiness({ force: true }).then(() => {
          return payload;
        });
      }).finally(() => {
        setRuntimeSandboxSetupRunning(false);
        setRuntimeSandboxReadinessLoading(false);
        setRuntimeSandboxReadinessChecked(true);
      }),
      "Runtime sandbox setup finished."
    );
  }

  function saveRuntimeSandboxSettings() {
    act(
      () => api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), {
        method: "PUT",
        body: JSON.stringify((() => {
          const integrationPayload = buildSettingsIntegrationPayload(settings, integrationRegistry, integrationCredentialDrafts);
          return {
            providers: buildSettingsProvidersPayload(settings, agentCredentialDrafts),
            credentials: {
              ...integrationPayload.credentials,
              ...buildSettingsCredentialsPayload(settings, llmRegistry, providerCredentialDrafts)
            },
            audit_defaults: settings.audit_defaults_json,
            preflight: {
              ...(settings.preflight_json || {}),
              runtime_sandbox: runtimeSandboxSettings
            },
            review: settings.review_json,
            integrations: {
              ...settings.integrations_json,
              ...integrationPayload.integrations
            },
            test_mode: settings.test_mode_json,
            learning: getLearningSettings(settings)
          };
        })())
      }, requestContext).then((payload) => Promise.all([
        api("/ui/settings?scope_level=effective", undefined, requestContext),
        loadRuntimeSandboxReadiness({ force: true })
      ]).then(([effectivePayload]) => {
        setSettings(payload.settings || settings);
        setEffectiveSettings({
          effective: effectivePayload.settings || emptySettings,
          layers: effectivePayload.layers || emptyEffectiveSettings.layers
        });
        setPreflightSummary(null);
        setPreflightStale(true);
        setPreflightCheckedAt(null);
        setPreflightAcceptedAt(null);
      })),
      "Runtime sandbox settings saved."
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
        [field]: value,
        ...(field === "triage_decision" && (value === "accepted_risk" || value === "out_of_scope" || value === "false_positive")
          ? { exception_scope: value === "out_of_scope" ? "this_run" : "future_repo" }
          : {})
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
        exception_scope: disposition.scope_level === "project" ? "future_repo" : "this_run",
        editing_disposition_id: disposition.id
      }
    }));
    setRunNotice("Loaded exception for editing.");
    setNotice("");
    setError("");
  }

  function submitReviewAction(payload, successMessage) {
    if (!selectedRunId) return;
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/review-actions", {
        method: "POST",
        body: JSON.stringify(payload)
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      successMessage,
      { scope: "run" }
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
    const evaluationRecords = selectedRunDetail?.findingEvaluations?.finding_evaluations?.evaluations || [];
    const evaluation = evaluationRecords.find((item) => item.finding_id === finding.id) || null;
    const triageDecision = state.triage_decision || (actionType === "request_validation" ? "needs_validation" : actionType === "suppress_finding" ? "false_positive" : actionType === "confirm_finding" ? "confirmed" : null);
    submitReviewAction({
      action_type: actionType,
      finding_id: finding.id,
      updated_severity: state.updated_severity || null,
      visibility_override: publisherModeEnabled ? state.visibility_override || null : null,
      triage_decision: triageDecision,
      review_priority: state.review_priority || null,
      validation_intent: state.validation_intent || null,
      notes: state.notes || `submitted from web ui by ${requestContext.actorId || "anonymous"}`,
      metadata: {
        triage_decision: triageDecision,
        review_priority: state.review_priority || null,
        validation_intent: state.validation_intent || null,
        adopted_outcome: actionType === "adopt_rerun_outcome" ? evaluation?.runtime_followup_outcome || "none" : null,
        linked_run_id: actionType === "adopt_rerun_outcome" ? evaluation?.runtime_followup_linked_run_id || null : null
      }
    }, triageDecision === "needs_validation"
      ? "Finding marked for validation."
      : triageDecision === "false_positive"
        ? "False positive decision saved."
        : "Finding decision saved.");
  }

  function findingDispositionAction(finding, dispositionType, scopeLevel) {
    if (!selectedRunId) return;
    const state = findingReviewState[finding.id] || {};
    const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
    const expiry = validateFutureDateInput(state.disposition_expires_at, "expiration time");
    const reviewedAt = validateDateInput(state.disposition_reviewed_at, "review timestamp");
    const reviewDueBy = validateFutureDateInput(state.disposition_review_due_by, "review due time");
    if (!(state.disposition_reason || "").trim()) {
      setError("A reason is required.");
      return;
    }
    if (expiry.error) {
      setError(expiry.error);
      return;
    }
    if (reviewedAt.error) {
      setError(reviewedAt.error);
      return;
    }
    if (reviewDueBy.error) {
      setError(reviewDueBy.error);
      return;
    }
    if (dispositionType === "waiver") {
      if (!(state.disposition_owner_id || "").trim()) {
        setError("A risk owner is required.");
        return;
      }
      if (!reviewedAt.value) {
        setError("A review timestamp is required.");
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
          expires_at: expiry.value,
          owner_id: dispositionType === "waiver" ? state.disposition_owner_id || null : null,
          reviewed_at: dispositionType === "waiver" ? reviewedAt.value : null,
          review_due_by: dispositionType === "waiver"
            ? (reviewDueBy.value || addDaysIso(reviewedAt.value || new Date().toISOString(), reviewCadence.reviewWindowDays))
            : null,
          triage_decision: state.triage_decision || (dispositionType === "waiver" ? "accepted_risk" : "out_of_scope"),
          review_priority: state.review_priority || null,
          validation_intent: state.validation_intent || null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      `${dispositionType === "waiver" ? "Risk acceptance" : state.triage_decision === "false_positive" ? "False positive exception" : "Exception"} recorded for ${finding.title}.`,
      { scope: "run" }
    );
  }

  function saveDispositionEdit(finding) {
    if (!selectedRunId) return;
    const state = findingReviewState[finding.id] || {};
    const reviewCadence = getReviewCadenceDefaults(effectiveSettings);
    const expiry = validateFutureDateInput(state.disposition_expires_at, "expiration time");
    const reviewedAt = validateDateInput(state.disposition_reviewed_at, "review timestamp");
    const reviewDueBy = validateFutureDateInput(state.disposition_review_due_by, "review due time");
    if (!(state.editing_disposition_id || "").trim()) {
      setError("Choose an active exception to edit first.");
      return;
    }
    if (!(state.disposition_reason || "").trim()) {
      setError("A reason is required.");
      return;
    }
    if (expiry.error) {
      setError(expiry.error);
      return;
    }
    if (reviewedAt.error) {
      setError(reviewedAt.error);
      return;
    }
    if (reviewDueBy.error) {
      setError(reviewDueBy.error);
      return;
    }
    const selectedFindingDisposition = selectedRunDetail?.findingDispositions?.resolved_finding_dispositions?.find((item) => item.finding_id === finding.id) || null;
    const existing = (selectedFindingDisposition?.active_dispositions || []).find((item) => item.id === state.editing_disposition_id) || null;
    if (existing?.disposition_type === "waiver") {
      if (!(state.disposition_owner_id || "").trim()) {
        setError("A risk owner is required.");
        return;
      }
      if (!reviewedAt.value) {
        setError("A review timestamp is required.");
        return;
      }
    }
    act(
      () => api("/runs/" + encodeURIComponent(selectedRunId) + "/finding-dispositions/" + encodeURIComponent(state.editing_disposition_id), {
        method: "PATCH",
        body: JSON.stringify({
          reason: state.disposition_reason,
          notes: state.notes || null,
          expires_at: expiry.value,
          owner_id: existing?.disposition_type === "waiver" ? state.disposition_owner_id || null : null,
          reviewed_at: existing?.disposition_type === "waiver" ? reviewedAt.value : null,
          review_due_by: existing?.disposition_type === "waiver"
            ? (reviewDueBy.value || addDaysIso(reviewedAt.value || new Date().toISOString(), reviewCadence.reviewWindowDays))
            : null,
          triage_decision: state.triage_decision || (existing?.disposition_type === "waiver" ? "accepted_risk" : "out_of_scope"),
          review_priority: state.review_priority || null,
          validation_intent: state.validation_intent || null
        })
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      "Exception updated.",
      { scope: "run" }
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
      "Exception revoked.",
      { scope: "run" }
    );
  }

  function saveRemediationItem(finding, payload = {}) {
    if (!selectedRunId || !finding?.id) return;
    const existing = selectedRunDetail?.remediationItems?.remediation_items?.find((item) => item.finding_id === finding.id) || null;
    const method = existing ? "PATCH" : "POST";
    const path = existing
      ? "/runs/" + encodeURIComponent(selectedRunId) + "/remediation-items/" + encodeURIComponent(existing.id)
      : "/runs/" + encodeURIComponent(selectedRunId) + "/remediation-items";
    const body = {
      ...payload,
      finding_id: finding.id
    };
    act(
      () => api(path, {
        method,
        body: JSON.stringify(body)
      }, requestContext).then(() => loadRunDetail(selectedRunId)),
      existing ? "Remediation item updated." : "Remediation item opened.",
      { scope: "run" }
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
      action === "renew" ? "Due-soon exceptions renewed." : "Due-soon exceptions revoked."
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      .catch((taskError) => setError(formatUiError(taskError)));
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
      "Automatic GitHub access verification is available in Tethermark Cloud."
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
      "Automatic GitHub delivery is available in Tethermark Cloud."
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
            h("div", { key: "label", className: "font-medium" }, "Current Project"),
            h("div", { key: "value", className: "mt-1 text-muted" }, requestContext.projectId)
          ]),
          h("div", { key: "project", className: "rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm" }, [
            h("div", { key: "label", className: "font-medium" }, "Project"),
            h("div", { key: "value", className: "mt-1 text-muted" }, currentProject ? `${currentProject.name} (${currentProject.id})` : "No project selected")
          ]),
          h("div", { key: "launch-state", className: cn("rounded-2xl border px-4 py-3 text-sm", launchReadiness.canLaunch ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-amber-200 bg-amber-50/80 text-amber-900") }, [
            h("div", { key: "label", className: "font-medium" }, "Launch Readiness"),
            h("div", { key: "value", className: "mt-1" }, launchReadiness.canLaunch
              ? "Ready to launch."
              : launchReadiness.requiresReadinessReview && !preflightSummary
                ? "Run audit readiness before launch."
                : launchReadiness.requiresReadinessReview && preflightSummary && !launchReadiness.accepted && preflightSummary.readiness?.status !== "blocked"
                  ? "Accept a fresh audit readiness review before launch."
                  : "Needs attention before launch.")
          ])
        ]),
        h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
          h(Field, { key: "target-kind", label: "Target Kind" }, Select({ value: runForm.target_kind === "repo" ? "repo" : "path", onChange: (event) => updateRunForm("target_kind", event.target.value) }, [
            h("option", { key: "path", value: "path" }, "local path"),
            h("option", { key: "repo", value: "repo" }, "repo url")
          ])),
          runForm.target_kind === "repo"
            ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, { value: runForm.repo_url, onChange: (event) => updateRunForm("repo_url", event.target.value), placeholder: "https://github.com/org/repo or git@github.com:org/repo.git" }))
            : h(Field, { key: "path", label: "Local Path" }, h(Input, { value: runForm.local_path, onChange: (event) => updateRunForm("local_path", event.target.value), placeholder: "fixtures/validation-targets/agent-tool-boundary-risky" })),
          h(Field, { key: "mode", label: "Run Mode" }, Select({ value: runForm.run_mode, onChange: (event) => updateRunForm("run_mode", event.target.value) }, [
            h("option", { key: "placeholder", value: "", disabled: true }, "select run mode"),
            h("option", { key: "static", value: "static" }, "static"),
            h("option", { key: "runtime", value: "runtime" }, "runtime")
          ])),
          h(Field, { key: "pkg", label: "Audit Package" }, Select({ value: runForm.audit_package, onChange: (event) => updateRunForm("audit_package", event.target.value) }, [
            ...visibleAuditPackages.map((item) => h("option", { key: item.id, value: item.id }, item.title + " (" + item.id + ")")),
            !visibleAuditPackages.some((item) => item.id === runForm.audit_package) ? h("option", { key: runForm.audit_package || "custom-package", value: runForm.audit_package }, (runForm.audit_package || "custom") + " (custom)") : null
          ].filter(Boolean))),
          h(Field, { key: "policy-pack", label: "Policy Pack" }, h("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, [
            h("div", { key: "value", className: "font-medium text-slate-900" }, getPolicyPackDisplayLabel(policyPacks, "default")),
            h("div", { key: "note", className: "mt-1" }, "Community Edition uses the built-in default policy pack only.")
          ])),
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
          publisherModeEnabled
            ? h(Field, { key: "review-visibility", label: "Publication Safety Default" }, Select({ value: runForm.review_visibility, onChange: (event) => updateRunForm("review_visibility", event.target.value) }, [
                h("option", { key: "public", value: "public" }, "public"),
                h("option", { key: "internal", value: "internal" }, "internal"),
                h("option", { key: "internal-only", value: "internal-only" }, "internal-only")
              ]))
            : null
        ].filter(Boolean)),
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
          : "Local paths are ideal for self-hosted repos, local clones, and fixture-based regression checks."),
        launchReadiness.issues.length
          ? h("div", { key: "validation", className: "mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800" }, [
            h("div", { key: "title", className: "font-medium" }, "Launch Input Issues"),
            h("ul", { key: "list", className: "mt-2 space-y-1" }, launchReadiness.issues.map((item, index) => h("li", { key: index }, "- " + item)))
          ])
          : null,
        h("div", { key: "hint", className: "mt-4 text-sm text-muted" }, "Launch config resolves from the selected project and its Audit Type unless this run is customized."),
        h("div", { key: "resolved-profile", className: "mt-4 rounded-2xl border border-border bg-stone-100/80 p-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium" }, "Resolved Launch Profile"),
          h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-2 text-muted" }, [
            h("div", { key: "target" }, "target: " + (runForm.target_kind === "repo" ? (runForm.repo_url || "unset") : (runForm.local_path || "unset"))),
            h("div", { key: "audit" }, "package: " + (runForm.audit_package || "unset")),
            h("div", { key: "policy" }, "policy pack: " + (runForm.audit_policy_pack || "default")),
            h("div", { key: "provider" }, "provider/model: " + runForm.llm_provider + (runForm.llm_model ? "/" + runForm.llm_model : "") + (selectedProvider ? ` (${selectedProvider.mode === "local_mock" ? "local mock" : "live api"})` : "")),
            h("div", { key: "preflight" }, "preflight: " + runForm.preflight_strictness + ", runtime " + runForm.runtime_allowed),
            h("div", { key: "review" }, "review: " + runForm.review_severity + " and above" + (publisherModeEnabled ? ", publication " + runForm.review_visibility : "")),
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
                }, effectiveSettings, llmRegistry, auditPackages))
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
            h("div", { key: "class" }, "detected target class: " + preflightSummary.target.target_class + " (" + Math.round((preflightSummary.target.confidence || 0) * 100) + "%)"),
            h("div", { key: "package" }, "recommended package: " + preflightSummary.recommended_audit_package.id),
            h("div", { key: "policy" }, "effective policy pack: " + getPolicyPackDisplayLabel(policyPacks, preflightSummary.selected_policy_pack.id || "")),
            h("div", { key: "signals" }, "signals: " + preflightSummary.repo_signals.entry_points + " entrypoints, " + preflightSummary.repo_signals.agentic_markers + " agentic markers")
          ]),
          preflightSummary.launch_profile ? h("div", { key: "recommended-profile", className: "mt-3 rounded-2xl border border-border bg-white/70 px-4 py-3 text-sm text-muted" }, [
            h("div", { key: "title", className: "font-medium text-foreground" }, "Recommended Launch Profile"),
            h("div", { key: "body", className: "mt-2 grid gap-2 md:grid-cols-2" }, [
              h("div", { key: "pkg" }, "package: " + (preflightSummary.launch_profile.audit_package || "default")),
              h("div", { key: "policy-pack" }, "policy pack: " + getPolicyPackDisplayLabel(policyPacks, preflightSummary.launch_profile.audit_policy_pack || "")),
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
      h(DashboardKpiCard, { key: "runs", label: "Total Audits", value: String(stats.runs.total_runs || runs.length), hint: "Persisted audit history", tone: "blue" }),
      h(DashboardKpiCard, { key: "reviews", label: "Pending Reviews", value: String(pendingReviews.length), hint: `${overdueReviews} overdue`, tone: "amber" }),
      h(DashboardKpiCard, { key: "score", label: "Avg Security Score", value: averageScore, hint: "Average overall score across scored runs", tone: "emerald" }),
      h(DashboardKpiCard, { key: "followups", label: "Open Follow-ups", value: String(openRuntimeFollowups), hint: `${successfulRuns} successful runs`, tone: "slate" })
    ]),
    h("div", { key: "middle", className: "grid gap-6 xl:grid-cols-[1.6fr_0.75fr]" }, [
      h(DashboardTrendCard, {
        key: "trend",
        title: "Security Posture",
        subtitle: "Average run score over the last six months for the current project.",
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
            h(Button, { key: "findings", onClick: () => setView("findings") }, "Open Findings"),
            h(Button, { key: "runs", variant: "outline", onClick: () => setView("runs") }, "Open Audits")
          ])
        ])
      ])
    ]),
    h(Card, { key: "recent-runs", title: "Recent Audits", description: "Latest persisted audit runs for the current project.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "toolbar", className: "mb-4 flex items-center justify-between gap-3" }, [
        h("div", { key: "meta", className: "text-sm text-slate-500" }, `${recentRuns.length} recent run${recentRuns.length === 1 ? "" : "s"} shown`),
        h(Button, { key: "open-all", variant: "outline", onClick: () => setView("runs") }, "View All Audits")
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

  const jobSearchTerm = jobSearch.trim().toLowerCase();
  const sortedJobs = [...jobs].sort((left, right) => {
    const activeDelta = Number(isActiveAsyncJob(right)) - Number(isActiveAsyncJob(left));
    if (activeDelta) return activeDelta;
    const leftUpdated = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightUpdated = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightUpdated - leftUpdated;
  });
  const filteredJobs = sortedJobs.filter((job) => {
    const type = getAsyncJobType(job);
    const statusMatches = jobStatusFilter === "all"
      || (jobStatusFilter === "active" && isActiveAsyncJob(job))
      || (jobStatusFilter === "completed" && job.status === "succeeded")
      || (jobStatusFilter === "failed" && job.status === "failed")
      || (jobStatusFilter === "canceled" && job.status === "canceled");
    const typeMatches = jobTypeFilter === "all" || type === jobTypeFilter;
    const searchText = [
      job.job_id,
      job.current_run_id,
      job.status,
      type,
      asyncJobTypeLabel(type),
      getAsyncJobTargetName(job),
      job.request_json?.repo_url,
      job.request_json?.local_path,
      job.request_json?.audit_package,
      job.request_json?.run_mode
    ].filter(Boolean).join(" ").toLowerCase();
    const searchMatches = !jobSearchTerm || searchText.includes(jobSearchTerm);
    return statusMatches && typeMatches && searchMatches;
  });
  const jobCounts = {
    all: jobs.length,
    active: jobs.filter(isActiveAsyncJob).length,
    completed: jobs.filter((job) => job.status === "succeeded").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    canceled: jobs.filter((job) => job.status === "canceled").length
  };
  const jobStatusFilters = [
    { id: "all", label: "All", count: jobCounts.all },
    { id: "active", label: "Active", count: jobCounts.active },
    { id: "failed", label: "Failed", count: jobCounts.failed },
    { id: "completed", label: "Completed", count: jobCounts.completed },
    { id: "canceled", label: "Canceled", count: jobCounts.canceled }
  ];
  const jobTypeFilters = [
    { id: "all", label: "All types" },
    { id: "system_check", label: "System checks" },
    { id: "static_smoke", label: "Static smoke" },
    { id: "benchmark", label: "Benchmarks" },
    { id: "audit", label: "Audits" },
    { id: "runtime_followup", label: "Runtime follow-ups" }
  ];
  const jobsView = h(Card, { title: "Async Jobs", description: "Execution queue for diagnostics, audits, retries, and follow-up work." }, [
    h("div", { key: "summary", className: "mb-4 grid gap-3 md:grid-cols-5" }, [
      h("div", { key: "all", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "All Jobs"),
        h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(jobCounts.all))
      ]),
      h("div", { key: "active", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-amber-700" }, "Active"),
        h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-amber-950" }, String(jobCounts.active))
      ]),
      h("div", { key: "failed", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-red-700" }, "Failed"),
        h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-red-950" }, String(jobCounts.failed))
      ]),
      h("div", { key: "completed", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-emerald-700" }, "Succeeded"),
        h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-emerald-950" }, String(jobCounts.completed))
      ]),
      h("div", { key: "shown", className: "rounded-2xl border border-slate-200 bg-white px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Shown"),
        h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(filteredJobs.length))
      ])
    ]),
    h("div", { key: "toolbar", className: "mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto]" }, [
      h(Input, {
        key: "search",
        value: jobSearch,
        onChange: (event) => setJobSearch(event.target.value),
        placeholder: "Search job id, run id, target, repo, status"
      }),
      Select({
        key: "type",
        value: jobTypeFilter,
        onChange: (event) => setJobTypeFilter(event.target.value)
      }, jobTypeFilters.map((item) => h("option", { key: item.id, value: item.id }, item.label))),
      h(Button, { key: "refresh", variant: "outline", onClick: () => refreshJobsQueue() }, "Refresh Queue")
    ]),
    h("div", { key: "filters", className: "mb-5 flex flex-wrap gap-2" }, jobStatusFilters.map((item) => h("button", {
      key: item.id,
      type: "button",
      onClick: () => setJobStatusFilter(item.id),
      className: cn(
        "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
        jobStatusFilter === item.id
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )
    }, `${item.label} ${item.count}`))),
    h("div", { key: "refresh-note", className: "mb-4 text-sm text-muted" }, jobs.some(isActiveAsyncJob)
      ? "Active jobs refresh automatically and remain sorted above terminal jobs."
      : "Completed jobs link back to their produced run."),
    filteredJobs.length ? filteredJobs.map((job) => {
      const canCancelJob = isActiveAsyncJob(job);
      const canRetryJob = job.status === "failed" || job.status === "canceled";
      const canViewRun = isTerminalAsyncJob(job) && Boolean(job.current_run_id);
      const type = getAsyncJobType(job);
      const targetName = getAsyncJobTargetName(job);
      const repoUrl = job.request_json?.repo_url || "";
      return h("div", {
        key: job.job_id,
        className: cn(
          "mb-3 rounded-2xl border bg-white/80 p-4",
          isActiveAsyncJob(job) ? "border-amber-200" : job.status === "failed" ? "border-red-200" : "border-border"
        )
      }, [
        h("div", { key: "row", className: "flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between" }, [
          h("div", { key: "copy", className: "min-w-0" }, [
            h("div", { key: "title-row", className: "flex flex-wrap items-center gap-2" }, [
              h("div", { key: "target", className: "text-base font-semibold text-slate-950" }, targetName),
              h(Badge, { key: "type" }, asyncJobTypeLabel(type)),
              h(Badge, { key: "status" }, job.status)
            ]),
            h("div", { key: "ids", className: "mt-2 grid gap-1 text-sm text-muted" }, [
              h("div", { key: "job", className: "break-all" }, `job: ${job.job_id}`),
              job.current_run_id ? h("div", { key: "run", className: "break-all" }, `run: ${job.current_run_id}`) : null,
              repoUrl ? h("div", { key: "repo", className: "break-all" }, `repo: ${repoUrl}`) : null
            ].filter(Boolean))
          ]),
          h("div", { key: "actions", className: "flex flex-wrap items-center gap-3" }, [
            h(Button, { key: "view", disabled: !canViewRun, onClick: () => openAsyncJobRun(job) }, "View Run"),
            h(Button, { key: "retry", variant: "outline", disabled: !canRetryJob, onClick: () => act(() => api("/runs/async/" + encodeURIComponent(job.job_id) + "/retry", { method: "POST", body: "{}" }, requestContext), "Job retry submitted.") }, "Retry"),
            h(Button, { key: "cancel", variant: "outline", disabled: !canCancelJob, onClick: () => act(() => api("/runs/async/" + encodeURIComponent(job.job_id) + "/cancel", { method: "POST", body: "{}" }, requestContext), "Job cancel submitted.") }, "Cancel")
          ])
        ]),
        h("div", { key: "meta", className: "mt-4 grid gap-3 md:grid-cols-4" }, [
          h("div", { key: "attempt", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Attempt"),
            h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, String(job.latest_attempt_number || 1))
          ]),
          h("div", { key: "duration", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Duration"),
            h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, formatAsyncJobDuration(job))
          ]),
          h("div", { key: "started", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Started"),
            h("div", { key: "value", className: "mt-1 text-sm font-semibold text-slate-950" }, formatDate(job.started_at))
          ]),
          h("div", { key: "updated", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Updated"),
            h("div", { key: "value", className: "mt-1 text-sm font-semibold text-slate-950" }, formatDate(job.updated_at))
          ])
        ]),
        job.error ? h("div", { key: "error", className: "mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" }, job.error) : null
      ]);
    }) : h("div", { key: "empty", className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-muted" }, jobs.length
      ? "No jobs match the current filters."
      : "No async jobs recorded.")
  ]);

  const diagnosticDefaultProvider = effectiveSettings.effective.providers_json?.default_provider || "";
  const diagnosticDefaultModel = effectiveSettings.effective.providers_json?.default_model || "";
  const diagnosticTools = staticToolsReadiness.tools || [];
  const diagnosticDefaultTools = diagnosticTools.filter((tool) => tool.default_enabled);
  const diagnosticStaticTools = diagnosticDefaultTools.filter((tool) => (tool.run_modes || []).includes("static"));
  const diagnosticRuntimeTools = diagnosticDefaultTools.filter((tool) => (tool.run_modes || []).includes("runtime") && !(tool.run_modes || []).includes("static"));
  const diagnosticStaticMissing = diagnosticStaticTools.filter((tool) => !tool.installed);
  const diagnosticRuntimeMissing = diagnosticRuntimeTools.filter((tool) => !tool.installed);
  const diagnosticStaticStatus = diagnosticStaticTools.length
    ? diagnosticStaticMissing.some((tool) => tool.mandatory)
      ? "blocked"
      : diagnosticStaticMissing.length
        ? "ready_with_warnings"
        : "ready"
    : "unknown";
  const diagnosticRuntimeStatus = diagnosticRuntimeTools.length
    ? diagnosticRuntimeMissing.length
      ? "deferred"
      : "ready"
    : "unknown";
  const observabilityTotals = observabilityHistory?.totals || {};
  const rawObservabilityLearning = observabilityHistory?.learning || {};
  const latestUiLearningJob = learningJobs[0] || null;
  const observabilityLearning = {
    ...rawObservabilityLearning,
    event_count: Math.max(Number(rawObservabilityLearning.event_count || 0), learningEvents.length),
    candidate_count: Math.max(Number(rawObservabilityLearning.candidate_count || 0), learningCandidates.length),
    open_candidate_count: Math.max(Number(rawObservabilityLearning.open_candidate_count || 0), learningCandidates.filter((item) => ["proposed", "experimented"].includes(item.status)).length),
    promotion_count: Math.max(Number(rawObservabilityLearning.promotion_count || 0), learningPromotions.length),
    rollback_count: Math.max(Number(rawObservabilityLearning.rollback_count || 0), learningPromotions.filter((item) => item.status === "rolled_back").length),
    job_count: Math.max(Number(rawObservabilityLearning.job_count || 0), learningJobs.length),
    synthesized_candidate_count: Math.max(Number(rawObservabilityLearning.synthesized_candidate_count || 0), learningCandidates.filter((item) => item.metadata_json?.llm_synthesis?.status === "completed").length),
    latest_job: rawObservabilityLearning.latest_job || (latestUiLearningJob ? {
      id: latestUiLearningJob.id,
      trigger: latestUiLearningJob.trigger,
      status: latestUiLearningJob.status,
      candidates_generated: latestUiLearningJob.candidates_generated,
      candidates_synthesized: latestUiLearningJob.candidates_synthesized,
      synthesis_skipped: latestUiLearningJob.synthesis_skipped,
      completed_at: latestUiLearningJob.completed_at
    } : null)
  };
  const observabilityRetention = observabilityHistory?.retention_policy || {};
  const observabilityRuns = observabilityHistory?.runs || [];
  const formatCount = (value) => Number(value || 0).toLocaleString();
  const formatCost = (value) => `$${Number(value || 0).toFixed(6)}`;
  function observabilityScopeCard(scope) {
    return h("div", { key: scope.id, className: cn("rounded-2xl border px-4 py-4", scope.enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50") }, [
      h("div", { key: "head", className: "flex flex-wrap items-start justify-between gap-3" }, [
        h("div", { key: "copy" }, [
          h("h4", { key: "title", className: "text-base font-semibold text-slate-950" }, scope.title),
          h("p", { key: "desc", className: "mt-1 text-sm leading-6 text-slate-500" }, scope.description)
        ]),
        h(Badge, { key: "status" }, scope.badge)
      ]),
      h("div", { key: "items", className: "mt-4 grid gap-2" }, scope.items.map((item) => h("div", { key: item, className: "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" }, item))),
      scope.note ? h("div", { key: "note", className: "mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" }, scope.note) : null
    ]);
  }
  function traceJsonDetails(label, value, defaultOpen = false) {
    const empty = value == null || (Array.isArray(value) && value.length === 0);
    return h("details", { key: label, open: defaultOpen, className: "rounded-2xl border border-slate-200 bg-white px-4 py-3" }, [
      h("summary", { key: "summary", className: "cursor-pointer text-sm font-semibold text-slate-900" }, `${label}${empty ? " (empty)" : ""}`),
      h("pre", { key: "json", className: "mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100" }, JSON.stringify(value ?? null, null, 2))
    ]);
  }
  function renderTracePanel() {
    if (!observabilityTraceRunId) {
      return h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "Select Trace on a recent run to inspect agent handoffs, structured outputs, QA decisions, and persisted troubleshooting artifacts.");
    }
    if (observabilityTraceLoading) {
      return h("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500" }, `Loading trace for ${observabilityTraceRunId}...`);
    }
    if (observabilityTraceError) {
      return h("div", { className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" }, observabilityTraceError);
    }
    if (!observabilityTrace) {
      return h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "Trace data is not loaded.");
    }
    const traceSummary = observabilityTrace.summary || {};
    const timeline = observabilityTrace.timeline || [];
    const qaBlockers = observabilityTrace.finding_quality?.findings?.filter((item) => item.qa_blocking) || [];
    return h("div", { className: "space-y-4" }, [
      h("div", { key: "policy", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, observabilityTrace.trace_policy?.note || "Structured trace only. Hidden model chain-of-thought is not stored."),
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-5" }, [
        { label: "Stages", value: traceSummary.stage_execution_count },
        { label: "Agents", value: traceSummary.agent_invocation_count },
        { label: "Handoffs", value: traceSummary.handoff_count },
        { label: "Integrity Verdict", value: traceSummary.finding_quality_verdict || "n/a" },
        { label: "Integrity Blockers", value: traceSummary.finding_quality_blocking_count }
      ].map((item) => h("div", { key: item.label, className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, item.label),
        h("div", { key: "value", className: "mt-2 text-lg font-semibold text-slate-950" }, String(item.value ?? "n/a"))
      ]))),
      qaBlockers.length
        ? h("div", { key: "qa-blockers", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-sm font-semibold text-red-950" }, "Post-Supervisor Integrity Blockers"),
          h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-red-900" }, qaBlockers.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: evidence ${item.evidence_support_verdict}, controls ${item.control_mapping_verdict}`)))
        ])
        : null,
      h("div", { key: "timeline", className: "rounded-2xl border border-slate-200 bg-white" }, [
        h("div", { key: "header", className: "border-b border-slate-200 px-4 py-3" }, [
          h("div", { key: "title", className: "font-semibold text-slate-950" }, "Agent And Stage Timeline"),
          h("div", { key: "desc", className: "mt-1 text-sm text-slate-500" }, "Ordered persisted stages, agent invocations, and handoff records.")
        ]),
        timeline.length
          ? h("div", { key: "list", className: "max-h-96 overflow-y-auto" }, timeline.map((item, index) => h("details", { key: `${item.kind}:${item.id}:${index}`, className: "border-b border-slate-100 px-4 py-3 last:border-b-0" }, [
            h("summary", { key: "summary", className: "cursor-pointer text-sm" }, [
              h("span", { key: "kind", className: "mr-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500" }, item.kind),
              h("span", { key: "text", className: "font-medium text-slate-900" }, item.summary || item.stage_name || item.id),
              h("span", { key: "time", className: "ml-3 text-xs text-slate-500" }, formatDate(item.at))
            ]),
            h("pre", { key: "details", className: "mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100" }, JSON.stringify(item.details ?? item, null, 2))
          ])))
          : h("div", { key: "empty", className: "px-4 py-6 text-sm text-slate-500" }, "No timeline records are available.")
      ]),
      h("div", { key: "details", className: "grid gap-3 xl:grid-cols-2" }, [
        traceJsonDetails("Supervisor Review", observabilityTrace.supervisor_review),
        traceJsonDetails("Correction Plan", observabilityTrace.correction_plan),
        traceJsonDetails("Correction Result", observabilityTrace.correction_result),
        traceJsonDetails("Post-Supervisor Integrity", observabilityTrace.finding_quality),
        traceJsonDetails("Agent Invocations", observabilityTrace.agent_invocations),
        traceJsonDetails("Handoffs", observabilityTrace.handoffs),
        traceJsonDetails("Intermediate Outputs", observabilityTrace.intermediate_outputs),
        traceJsonDetails("Tool Executions", observabilityTrace.tool_executions)
      ])
    ]);
  }
  const adminNavItems = [
    { id: "system", label: "System" },
    { id: "methodology", label: "Methodology" },
    { id: "validation", label: "Validation" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "runtime-sandbox", label: "Runtime Sandbox" },
    { id: "tooling", label: "Tooling" },
    { id: "observability", label: "Observability" }
  ];
  const apiHealthLabel = authInfo.trusted_mode ? "API reachable" : authInfo.auth_mode === "none" ? "Local API reachable" : "Authenticated API reachable";
  const apiHealthNote = authInfo.trusted_mode
    ? "The local API is responding in trusted local mode. If page data looks stale, refresh local data."
    : authInfo.auth_mode === "none"
      ? "The API is responding without authentication. Use only in trusted local environments."
      : "The API is responding with authentication enabled.";
  const adminSystemPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "app-state", title: "Local Data Refresh", description: "Manual recovery control for local UI state after external changes.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "top", className: "space-y-3" }, [
          h("div", { key: "status", className: "flex flex-wrap gap-2" }, [
            h(Badge, { key: "api" }, apiHealthLabel),
            h(Badge, { key: "sync" }, globalSyncLoading ? "refreshing" : `last refresh: ${lastGlobalSyncAt ? formatDate(lastGlobalSyncAt) : "not refreshed"}`)
          ]),
          h("div", { key: "api-note", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, apiHealthNote),
          h("div", { key: "sync-note", className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" }, "Use Refresh Local Data after another tab, CLI command, server restart, or environment change may have made the local UI stale. Normal pages use scoped refreshes where possible.")
      ]),
      h("div", { key: "actions", className: "mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4" }, [
        h(Button, { key: "sync", onClick: syncAllAppData, disabled: globalSyncLoading, "aria-busy": globalSyncLoading ? "true" : "false" }, globalSyncLoading ? "Refreshing..." : "Refresh Local Data")
      ])
    ])
  ]);
  const methodology = methodologyCatalog.methodology || {};
  const staticBaseline = methodologyCatalog.static_baseline || {};
  const methodologyControls = methodologyCatalog.control_catalog || [];
  const methodologyPackages = methodologyCatalog.audit_packages?.length ? methodologyCatalog.audit_packages : auditPackages;
  const methodologyFrameworkGroups = Object.entries(methodologyControls.reduce((groups, control) => {
    const key = control.framework || "Unmapped";
    groups[key] = groups[key] || [];
    groups[key].push(control);
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  const methodologyProviderGroups = Object.entries(methodologyControls.reduce((groups, control) => {
    const providers = control.crosswalk?.evidence_providers?.length ? control.crosswalk.evidence_providers : ["repo_analysis"];
    for (const provider of providers) {
      groups[provider] = groups[provider] || [];
      groups[provider].push(control);
    }
    return groups;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  const methodologyBasisCounts = methodologyControls.reduce((counts, control) => {
    const basis = control.crosswalk?.mapping_basis || "unknown";
    counts[basis] = Number(counts[basis] || 0) + 1;
    return counts;
  }, {});
  const methodologyBasisLabel = (basis) => String(basis || "unknown").replace(/_/g, " ");
  const methodologyAdminPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "overview", title: "Audit Methodology", description: "Built-in standards crosswalk and evidence mapping used by audit planning and control assessment.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "version", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Methodology"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, methodology.version || "not loaded")
        ]),
        h("div", { key: "controls", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Controls"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(methodologyControls.length))
        ]),
        h("div", { key: "frameworks", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Frameworks"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(methodologyFrameworkGroups.length))
        ]),
        h("div", { key: "packages", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Audit Types"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(methodologyPackages.length))
        ])
      ]),
      h("div", { key: "copy", className: "mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600" }, methodology.summary || "Methodology metadata has not loaded yet."),
      h("div", { key: "rules", className: "mt-4 grid gap-4 lg:grid-cols-2" }, [
        h("div", { key: "assessment", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, "Control Assessment Model"),
          h("ul", { key: "list", className: "mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600" }, [
            h("li", { key: "determination" }, "Controls are evidence determinations, separate from finding severity."),
            h("li", { key: "scope" }, "Applicability and assessability are tracked separately from pass/fail outcomes."),
            h("li", { key: "ui" }, "Finding-level affected controls hide not-applicable states unless there is a scope mismatch.")
          ])
        ]),
        h("div", { key: "risk", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, "Finding Risk Model"),
          h("ul", { key: "list", className: "mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600" }, [
            h("li", { key: "levels" }, "Findings use normalized low, medium, high, and critical severity."),
            h("li", { key: "exports" }, "NIST-style reporting can render medium as moderate while preserving normalized severity."),
            h("li", { key: "tools" }, "Tool-native severities are normalized before they affect run review and reporting.")
          ])
        ])
      ])
    ]),
    h(Card, { key: "packages", title: "Audit Types And Lanes", description: "Preset run shapes that constrain planning, budget, runtime allowance, and audit area coverage.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-3 lg:grid-cols-2" }, methodologyPackages.map((item) => h("div", {
        key: item.id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-2" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, item.title || item.id),
          h(Badge, { key: "mode" }, item.run_mode || "unknown")
        ]),
        h("div", { key: "id", className: "mt-1 font-mono text-xs text-slate-500" }, item.id),
        h("div", { key: "lanes", className: "mt-3 flex flex-wrap gap-1.5" }, (item.enabled_lanes || []).map((lane) => h(CompactTag, { key: lane }, lane))),
        h("div", { key: "meta", className: "mt-3 text-xs text-slate-500" }, `agent calls ${item.max_agent_calls || "n/a"} / tokens ${item.max_total_tokens || "n/a"} / publishability ${item.publishability_threshold || "n/a"}`)
      ])))
    ]),
    h(Card, { key: "dimensions", title: "Baseline Dimensions", description: "Posture dimensions used for the static score rollup.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-3 lg:grid-cols-2" }, (staticBaseline.dimensions || []).map((dimension) => h("div", {
        key: dimension.dimension,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-2" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, dimension.title || dimension.dimension),
          h(Badge, { key: "weight" }, `${Math.round(Number(dimension.weight || 0) * 100)}%`)
        ]),
        h("div", { key: "summary", className: "mt-2 text-sm leading-6 text-slate-600" }, dimension.summary),
        h("div", { key: "frameworks", className: "mt-3 flex flex-wrap gap-1.5" }, (dimension.frameworks || []).map((framework) => h(CompactTag, { key: framework }, framework)))
      ])))
    ]),
    h(Card, { key: "crosswalk", title: "Standards Crosswalk", description: "Built-in controls grouped by source framework, including tool providers and mapping basis.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "counts", className: "mb-4 flex flex-wrap gap-2" }, Object.entries(methodologyBasisCounts).map(([basis, count]) => h(Badge, { key: basis }, `${methodologyBasisLabel(basis)}: ${count}`))),
      h("div", { key: "frameworks", className: "space-y-4" }, methodologyFrameworkGroups.map(([framework, controls]) => h("details", {
        key: framework,
        className: "rounded-2xl border border-slate-200 bg-white"
      }, [
        h("summary", { key: "summary", className: "cursor-pointer px-4 py-3 font-medium text-slate-950" }, `${framework} (${controls.length})`),
        h("div", { key: "controls", className: "border-t border-slate-200" }, controls.map((control) => h("div", {
          key: control.control_id,
          className: "border-b border-slate-200 px-4 py-3 last:border-b-0"
        }, [
          h("div", { key: "top", className: "flex flex-wrap items-start justify-between gap-3" }, [
            h("div", { key: "copy", className: "min-w-0" }, [
              h("div", { key: "title", className: "font-medium text-slate-950" }, control.title || control.control_id),
              h("div", { key: "id", className: "mt-1 font-mono text-xs text-slate-500" }, `${control.control_id} / ${control.standard_ref || "no standard ref"}`)
            ]),
            h(Badge, { key: "basis" }, methodologyBasisLabel(control.crosswalk?.mapping_basis))
          ]),
          h("div", { key: "desc", className: "mt-2 text-sm leading-6 text-slate-600" }, control.description),
          h("div", { key: "chips", className: "mt-3 flex flex-wrap gap-1.5" }, [
            h(CompactTag, { key: "dimension" }, control.baseline_dimension || "no dimension"),
            h(CompactTag, { key: "catalog" }, control.catalog || "catalog"),
            h(CompactTag, { key: "weight" }, `weight ${control.weight}`),
            h(CompactTag, { key: "assessable" }, control.static_assessable ? "static assessable" : "deferred in static")
          ]),
          h("div", { key: "providers", className: "mt-3 text-xs text-slate-500" }, `providers: ${(control.crosswalk?.evidence_providers || []).join(", ") || "repo_analysis"}`),
          control.crosswalk?.mapped_frameworks?.length
            ? h("div", { key: "mapped", className: "mt-1 text-xs text-slate-500" }, `mapped frameworks: ${control.crosswalk.mapped_frameworks.join(", ")}`)
            : null,
          h("div", { key: "note", className: "mt-1 text-xs text-slate-500" }, control.crosswalk?.methodology_note || "")
        ])))
      ])))
    ]),
    h(Card, { key: "providers", title: "Tool-To-Control Mapping", description: "Evidence providers are tool-native sources; Tethermark maps their output into the standards crosswalk.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-3 lg:grid-cols-2" }, methodologyProviderGroups.map(([provider, controls]) => h("div", {
        key: provider,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-2" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, provider),
          h(Badge, { key: "count" }, `${controls.length} controls`)
        ]),
        h("div", { key: "list", className: "mt-3 max-h-44 overflow-y-auto text-sm leading-6 text-slate-600" }, controls.map((control) => h("div", { key: control.control_id }, `${control.control_id} - ${control.title}`)))
      ])))
    ]),
    h(Card, { key: "management", title: "Methodology Management", description: "Governance controls for custom methodology overlays.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "state", className: "grid gap-3 md:grid-cols-3" }, [
        h("div", { key: "builtin", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Built-in Catalog"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, methodologyCatalog.management?.builtin_catalog_editable ? "editable" : "read-only")
        ]),
        h("div", { key: "overlays", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Custom Overlays"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, methodologyCatalog.management?.custom_overlays_supported ? "enabled" : "not enabled")
        ]),
        h("div", { key: "scope", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Current Scope"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, currentSettingsScopeLevel)
        ])
      ]),
      h("div", { key: "note", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" }, methodologyCatalog.management?.note || "Built-in methodology is read-only. Custom overlays require validation, versioning, and audit history before edits are enabled."),
      h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
        h(Button, { key: "export", variant: "outline", disabled: true }, "Export Methodology JSON"),
        h(Button, { key: "new", variant: "outline", disabled: true }, "Create Custom Overlay"),
        h(Button, { key: "validate", variant: "outline", disabled: true }, "Validate Overlay")
      ])
    ])
  ]);
  const validationScenarios = [
    {
      id: "system_check",
      title: "System Check",
      kind: "plumbing",
      target: "pi",
      category: "plumbing only",
      provider: "mock",
      targetLabel: "Pi public repo",
      summary: "Clone, external tools, persistence, report export, and UI handoff. This is not an audit-quality result.",
      reference: diagnosticsPiCommit,
      referenceLabel: "Pi pinned commit",
      recommended: true,
      requiresProvider: false
    },
    {
      id: "static_smoke",
      title: "Static Audit Smoke",
      kind: "static_audit",
      target: "pi",
      category: "audit-quality",
      provider: diagnosticDefaultProvider || "not configured",
      targetLabel: "Pi public repo",
      summary: "Real-provider static audit check for agent, lane, token, and model orchestration.",
      reference: diagnosticsPiCommit,
      referenceLabel: "Pi pinned commit",
      recommended: true,
      requiresProvider: true
    },
    {
      id: "benchmark_pi",
      title: "Benchmark Pi Case",
      kind: "benchmark",
      target: "pi",
      category: "benchmark",
      provider: diagnosticDefaultProvider || "not configured",
      targetLabel: "Pi public repo",
      summary: "Repeatable lightweight case from the product benchmark suite, anchored to the pinned Pi commit.",
      reference: diagnosticsPiCommit,
      referenceLabel: "Pi pinned commit",
      recommended: false,
      requiresProvider: true
    },
    {
      id: "benchmark_openclaw",
      title: "Benchmark OpenClaw",
      kind: "benchmark",
      target: "openclaw",
      category: "benchmark",
      provider: diagnosticDefaultProvider || "not configured",
      targetLabel: "OpenClaw public repo",
      summary: "Legacy heavier benchmark scenario. The canonical product benchmark suite is managed through the CLI manifest.",
      reference: "latest remote checkout",
      referenceLabel: "moving reference",
      recommended: false,
      requiresProvider: true
    }
  ];
  const selectedValidationScenarios = validationScenarios.filter((scenario) => validationScenarioIds.includes(scenario.id));
  const selectedValidationRequiresProvider = selectedValidationScenarios.some((scenario) => scenario.requiresProvider);
  const scenarioActiveJobs = Object.fromEntries(validationScenarios.map((scenario) => {
    const expectedType = scenario.id === "system_check" ? "system_check" : scenario.id === "static_smoke" ? "static_smoke" : "benchmark";
    return [
      scenario.id,
      jobs.find((job) => isActiveAsyncJob(job) && getAsyncJobType(job) === expectedType && getAsyncJobDiagnosticTarget(job) === scenario.target) || null
    ];
  }));
  const selectedValidationActiveJobs = selectedValidationScenarios.map((scenario) => scenarioActiveJobs[scenario.id]).filter(Boolean);
  const validationCanRun = !validationLaunching && selectedValidationScenarios.length > 0 && selectedValidationActiveJobs.length === 0 && (!selectedValidationRequiresProvider || Boolean(diagnosticDefaultProvider));
  const adminValidationPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "plan", title: "Validation Suite", description: "Choose one or more installation, static audit, or benchmark scenarios and launch them as tracked async jobs.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "selected", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Selected"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(selectedValidationScenarios.length))
        ]),
        h("div", { key: "provider", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Provider"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, diagnosticDefaultProvider || "not configured")
        ]),
        h("div", { key: "model", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Model"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, diagnosticDefaultModel || "provider default")
        ]),
        h("div", { key: "target", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Pinned Pi"),
          h("div", { key: "value", className: "mt-1 font-mono text-sm font-semibold text-slate-950" }, formatShortReference(diagnosticsPiCommit))
        ])
      ]),
      h("div", { key: "actions", className: "mt-5 flex flex-wrap items-center gap-3" }, [
        h(Button, { key: "run", onClick: () => launchValidationScenarios(validationScenarios), disabled: !validationCanRun }, validationLaunching ? "Starting..." : "Run Selected"),
        h(Button, { key: "jobs", variant: "outline", onClick: () => { setView("system"); setSystemSubpage("jobs"); } }, "Open Jobs"),
        selectedValidationRequiresProvider && !diagnosticDefaultProvider ? h(Button, { key: "settings", variant: "outline", onClick: () => { setView("system"); setSystemSubpage("agents"); setSettingsSubpage("llm"); } }, "Configure Provider") : null
      ].filter(Boolean)),
      !validationCanRun ? h("div", { key: "blocker", className: "mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, selectedValidationRequiresProvider && !diagnosticDefaultProvider
        ? "Selected audit-quality or benchmark scenarios require a configured real LLM provider."
        : selectedValidationActiveJobs.length
          ? "One or more selected validation scenarios already has an active job. Open Jobs to monitor progress before launching again."
        : "Select at least one validation scenario.") : null
    ]),
    h("div", { key: "scenarios", className: "grid gap-4" }, validationScenarios.map((scenario) => {
      const selected = validationScenarioIds.includes(scenario.id);
      const blocked = scenario.requiresProvider && !diagnosticDefaultProvider;
      const activeJob = scenarioActiveJobs[scenario.id];
      const referenceDisplay = scenario.reference === diagnosticsPiCommit
        ? `${scenario.referenceLabel} (${formatShortReference(scenario.reference)})`
        : scenario.reference;
      return h("label", {
        key: scenario.id,
        className: cn(
          "block min-w-0 rounded-2xl border bg-white p-4 transition-colors",
          selected ? "border-slate-900" : "border-slate-200",
          blocked ? "opacity-70" : ""
        )
      }, [
        h("div", { key: "head", className: "space-y-3" }, [
          h("div", { key: "choice", className: "flex min-w-0 items-start gap-3" }, [
            h("input", {
              key: "check",
              type: "checkbox",
              className: "mt-1",
              checked: selected,
              onChange: (event) => toggleValidationScenario(scenario.id, event.target.checked)
            }),
            h("div", { key: "copy", className: "min-w-0" }, [
              h("div", { key: "title", className: "font-semibold text-slate-950" }, scenario.title),
              h("div", { key: "summary", className: "mt-1 text-sm leading-6 text-slate-600" }, scenario.summary)
            ])
          ]),
          h("div", { key: "badges", className: "ml-7 flex flex-wrap items-start gap-2" }, [
            h(CompactTag, { key: "category" }, scenario.category),
            scenario.recommended ? h(CompactTag, { key: "recommended" }, "recommended") : null,
            activeJob ? h(CompactTag, { key: "active" }, "active job") : null,
            blocked ? h(CompactTag, { key: "blocked" }, "provider required") : null
          ].filter(Boolean))
        ]),
        activeJob ? h("div", { key: "active-note", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, [
          h("div", { key: "copy" }, `Active job ${activeJob.job_id} is already running for this scenario.`),
          h(Button, { key: "open", variant: "outline", className: "mt-3", onClick: (event) => { event.preventDefault(); setView("system"); setSystemSubpage("jobs"); } }, "Open Jobs")
        ]) : null,
        h("div", { key: "details", className: "mt-4" }, h(DetailList, { items: [
          { label: "Provider", value: scenario.provider },
          { label: "Target", value: scenario.targetLabel },
          { label: "Reference", value: referenceDisplay },
          { label: "Result", value: scenario.kind === "plumbing" ? "job/run handoff only" : scenario.category }
        ] }))
      ]);
    })),
    h(Card, { key: "pinning", title: "Product Benchmark Suite", description: "Pinned public AI-agent benchmark targets are managed by the product benchmark manifest.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "copy", className: "space-y-3 text-sm leading-6 text-slate-600" }, [
        h("p", { key: "p1" }, `Tethermark uses Pi Agent as the lightweight smoke-test target because it is small enough for quick validation while still exercising agent-style repository detection and static controls.`),
        h("p", { key: "p2" }, `The smoke scenarios clone Pi from its public repository and check out pinned commit ${diagnosticsPiCommit}. This keeps expected behavior repeatable without bundling third-party source code in Tethermark.`),
        h("p", { key: "p3" }, "The canonical product benchmark suite lives at benchmarks/suites/ai-agent-static-v1.json and includes Pi, mini-swe-agent, Aider, MCP servers, CrewAI, LangGraph, Flowise, and a runtime-pending AgentDojo case. Use npm run benchmark:product or npm run benchmark:product:execute from the CLI.")
      ])
    ])
  ]);
  const benchmarkSuite = benchmarkSuiteDetail?.suite || null;
  const benchmarkCases = benchmarkSuite?.cases || [];
  const benchmarkSuitePending = !benchmarkSuiteDetail && !benchmarkSuites.length && !benchmarkReports.length;
  const selectedBenchmarkCases = benchmarkCases.filter((item) => benchmarkCaseIds.includes(item.id));
  const benchmarkReportOptions = benchmarkReports.filter((item) => item.file_name);
  const benchmarkSelectedReport = benchmarkLastSummary || null;
  const adminBenchmarkPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "summary", title: "Product Benchmark Suite", description: "Pinned public AI-agent targets for Tethermark release and regression validation. This is separate from user repo baseline history.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "top", className: "flex flex-wrap items-start justify-between gap-3" }, [
        h("div", { key: "copy", className: "min-w-0" }, [
          h("div", { key: "title", className: "font-semibold text-slate-950" }, benchmarkSuite ? `${benchmarkSuite.title} (${benchmarkSuite.suite_id}@${benchmarkSuite.suite_version})` : "Benchmark suite not loaded"),
          h("p", { key: "summary", className: "mt-1 max-w-3xl text-sm leading-6 text-slate-600" }, benchmarkSuite?.summary || "Refresh benchmark metadata to load available suites and cases.")
        ]),
        h(Button, { key: "refresh", variant: "outline", onClick: refreshBenchmarkData }, "Refresh")
      ]),
      h("div", { key: "stats", className: "mt-5 grid gap-3 md:grid-cols-5" }, [
        h("div", { key: "cases", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Cases"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(benchmarkCases.length))
        ]),
        h("div", { key: "selected", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Selected"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(selectedBenchmarkCases.length))
        ]),
        h("div", { key: "default", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Default"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String((benchmarkSuiteDetail?.selected_default_cases || []).length))
        ]),
        h("div", { key: "reports", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Reports"),
          h("div", { key: "value", className: "mt-1 text-2xl font-semibold text-slate-950" }, String(benchmarkReports.length))
        ]),
        h("div", { key: "mode", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Mode"),
          h("div", { key: "value", className: "mt-1 font-semibold text-slate-950" }, benchmarkExecute ? "execute" : "dry run")
        ])
      ])
    ]),
    h(Card, { key: "cases", title: "Benchmark Cases", description: "Choose one or more manifest cases. Dry-run writes benchmark reports without cloning public repos; execute launches normal Tethermark audit runs.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "actions", className: "mb-4 flex flex-wrap items-center gap-3" }, [
        h(Button, { key: "defaults", variant: "outline", onClick: selectBenchmarkDefaults, disabled: !benchmarkSuite }, "Default Cases"),
        h(Button, { key: "all-static", variant: "outline", onClick: selectBenchmarkAllStatic, disabled: !benchmarkSuite }, "All Static Cases"),
        h(Button, { key: "clear", variant: "outline", onClick: () => setBenchmarkCaseIds([]), disabled: benchmarkRunning }, "Clear"),
        h(Button, { key: "run", onClick: runBenchmarkCases, disabled: benchmarkRunning || !benchmarkCaseIds.length }, benchmarkRunning ? "Running..." : benchmarkExecute ? "Execute Selected" : "Dry-Run Selected")
      ]),
      h("div", { key: "options", className: "mb-5 grid gap-3 md:grid-cols-4" }, [
        h(Field, { key: "execute", label: "Execution" }, Select({ value: benchmarkExecute ? "execute" : "dry_run", onChange: (event) => setBenchmarkExecute(event.target.value === "execute") }, [
          h("option", { key: "dry", value: "dry_run" }, "Dry run"),
          h("option", { key: "execute", value: "execute" }, "Execute audits")
        ])),
        h(Field, { key: "strict", label: "Finding families" }, Select({ value: benchmarkStrict ? "strict" : "drift", onChange: (event) => setBenchmarkStrict(event.target.value === "strict") }, [
          h("option", { key: "drift", value: "drift" }, "Track as drift"),
          h("option", { key: "strict", value: "strict" }, "Fail if missing")
        ])),
        h(Field, { key: "extended", label: "Extended cases" }, Select({ value: benchmarkIncludeExtended ? "include" : "default", onChange: (event) => setBenchmarkIncludeExtended(event.target.value === "include") }, [
          h("option", { key: "default", value: "default" }, "Default only"),
          h("option", { key: "include", value: "include" }, "Include extended")
        ])),
        h(Field, { key: "runtime", label: "Runtime pending" }, Select({ value: benchmarkIncludeRuntimePending ? "include" : "exclude", onChange: (event) => setBenchmarkIncludeRuntimePending(event.target.value === "include") }, [
          h("option", { key: "exclude", value: "exclude" }, "Exclude"),
          h("option", { key: "include", value: "include" }, "Include")
        ]))
      ]),
      benchmarkExecute ? h("div", { key: "execute-warning", className: "mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" }, "Executing benchmark cases clones pinned public repositories and runs normal Tethermark audit runs. Static cases should not execute target application code. Runtime-pending cases require Local Runtime Sandbox readiness and should remain excluded until runtime benchmark adapters are release-gated.") : null,
      h("div", { key: "case-list", className: "grid gap-3" }, benchmarkSuitePending ? [
        h("div", { key: "placeholder-a", className: "rounded-2xl border border-slate-200 bg-slate-50 p-4" }, [
          h("div", { key: "line1", className: "h-4 w-56 rounded bg-slate-200" }),
          h("div", { key: "line2", className: "mt-3 h-3 w-4/5 rounded bg-slate-200" }),
          h("div", { key: "line3", className: "mt-4 h-8 rounded-xl bg-slate-200/80" })
        ]),
        h("div", { key: "placeholder-b", className: "rounded-2xl border border-slate-200 bg-slate-50 p-4" }, [
          h("div", { key: "line1", className: "h-4 w-48 rounded bg-slate-200" }),
          h("div", { key: "line2", className: "mt-3 h-3 w-2/3 rounded bg-slate-200" })
        ])
      ] : benchmarkCases.length ? benchmarkCases.map((item) => {
        const selected = benchmarkCaseIds.includes(item.id);
        const runtimePending = item.tier === "runtime_pending";
        return h("label", {
          key: item.id,
          className: cn("block rounded-2xl border bg-white p-4 transition-colors", selected ? "border-slate-900" : "border-slate-200", runtimePending && !benchmarkIncludeRuntimePending ? "opacity-75" : "")
        }, [
          h("div", { key: "row", className: "flex min-w-0 items-start gap-3" }, [
            h("input", {
              key: "check",
              type: "checkbox",
              className: "mt-1",
              checked: selected,
              disabled: runtimePending && !benchmarkIncludeRuntimePending,
              onChange: (event) => toggleBenchmarkCase(item.id, event.target.checked)
            }),
            h("div", { key: "copy", className: "min-w-0 flex-1" }, [
              h("div", { key: "title", className: "font-semibold text-slate-950" }, item.id),
              h("div", { key: "summary", className: "mt-1 text-sm leading-6 text-slate-600" }, `${item.target_name} at ${String(item.pinned_commit || "").slice(0, 12)}. ${item.notes?.[0] || ""}`),
              h("div", { key: "badges", className: "mt-3 flex flex-wrap gap-2" }, [
                h(CompactTag, { key: "tier" }, item.tier),
                h(CompactTag, { key: "mode" }, item.run_mode || benchmarkSuite?.default_run_mode || "static"),
                h(CompactTag, { key: "package" }, item.audit_package || benchmarkSuite?.default_audit_package || "agentic-static"),
                ...(item.categories || []).slice(0, 4).map((category) => h(CompactTag, { key: category }, category))
              ])
            ])
          ]),
          h("div", { key: "details", className: "mt-4" }, h(DetailList, { items: [
            { label: "Repo", value: item.repo_url },
            { label: "Expected controls", value: (item.expected_controls || []).join(", ") || "none" },
            { label: "Finding families", value: (item.expected_finding_families || []).join(", ") || "none" }
          ] }))
        ]);
      }) : h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No benchmark cases loaded."))
    ]),
    benchmarkSelectedReport ? h(Card, { key: "last", title: "Latest Benchmark Result", description: "Most recent result returned by this UI session.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "stats", className: "grid gap-3 md:grid-cols-5" }, [
        h("div", { key: "selected", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [h("div", { className: "text-xs uppercase tracking-wide text-slate-500" }, "Cases"), h("div", { className: "mt-1 text-2xl font-semibold text-slate-950" }, String(benchmarkSelectedReport.selected_cases || 0))]),
        h("div", { key: "passed", className: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3" }, [h("div", { className: "text-xs uppercase tracking-wide text-emerald-700" }, "Passed"), h("div", { className: "mt-1 text-2xl font-semibold text-emerald-950" }, String(benchmarkSelectedReport.passed_cases || 0))]),
        h("div", { key: "failed", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3" }, [h("div", { className: "text-xs uppercase tracking-wide text-red-700" }, "Failed"), h("div", { className: "mt-1 text-2xl font-semibold text-red-950" }, String(benchmarkSelectedReport.failed_cases || 0))]),
        h("div", { key: "dry", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [h("div", { className: "text-xs uppercase tracking-wide text-slate-500" }, "Dry-run"), h("div", { className: "mt-1 text-2xl font-semibold text-slate-950" }, String(benchmarkSelectedReport.dry_run_cases || 0))]),
        h("div", { key: "report", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [h("div", { className: "text-xs uppercase tracking-wide text-slate-500" }, "Report"), h("div", { className: "mt-1 truncate text-sm font-semibold text-slate-950" }, benchmarkSelectedReport.report_path || "n/a")])
      ]),
      h("div", { key: "rows", className: "mt-4 grid gap-3" }, (benchmarkSelectedReport.results || []).map((result) => h("div", { key: result.case_id, className: "rounded-2xl border border-slate-200 px-4 py-3" }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-2" }, [
          h("div", { key: "id", className: "font-semibold text-slate-950" }, result.case_id),
          h(Badge, { key: "verdict" }, result.verdict)
        ]),
        h("div", { key: "meta", className: "mt-1 text-sm text-slate-600" }, `run ${result.run_id || "n/a"} · findings ${result.finding_count || 0} · controls ${result.control_ids?.length || 0}`),
        result.issues?.length ? h("ul", { key: "issues", className: "mt-2 space-y-1 text-sm text-red-700" }, result.issues.slice(0, 4).map((issue, index) => h("li", { key: index }, `- ${issue}`))) : null,
        result.drift?.length ? h("ul", { key: "drift", className: "mt-2 space-y-1 text-sm text-amber-700" }, result.drift.slice(0, 4).map((item, index) => h("li", { key: index }, `- ${item}`))) : null
      ])))
    ]) : null,
    h(Card, { key: "reports", title: "Benchmark Reports", description: "Reports are stored under the local benchmark artifact directory and can be compared for drift.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "compare", className: "grid gap-3 md:grid-cols-[1fr_1fr_auto]" }, [
        h(Field, { key: "baseline", label: "Baseline" }, Select({ value: benchmarkCompareBaseline, onChange: (event) => setBenchmarkCompareBaseline(event.target.value) }, [
          h("option", { key: "none", value: "" }, "Select report"),
          ...benchmarkReportOptions.map((report) => h("option", { key: report.file_name, value: report.file_name }, `${report.file_name} (${report.passed_cases || 0}/${report.selected_cases || 0})`))
        ])),
        h(Field, { key: "current", label: "Current" }, Select({ value: benchmarkCompareCurrent, onChange: (event) => setBenchmarkCompareCurrent(event.target.value) }, [
          h("option", { key: "none", value: "" }, "Select report"),
          ...benchmarkReportOptions.map((report) => h("option", { key: report.file_name, value: report.file_name }, `${report.file_name} (${report.passed_cases || 0}/${report.selected_cases || 0})`))
        ])),
        h("div", { key: "button", className: "flex items-end" }, h(Button, { onClick: compareBenchmarkReportsUi, disabled: !benchmarkCompareBaseline || !benchmarkCompareCurrent }, "Compare"))
      ]),
      benchmarkComparison ? h("div", { key: "comparison", className: cn("mt-4 rounded-2xl border px-4 py-3 text-sm", benchmarkComparison.passed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900") }, [
        h("div", { key: "verdict", className: "font-semibold" }, `Comparison: ${benchmarkComparison.passed ? "pass" : "fail"}`),
        h("div", { key: "summary", className: "mt-1" }, `Baseline ${benchmarkComparison.baseline_summary?.passed_cases || 0}/${benchmarkComparison.baseline_summary?.selected_cases || 0}; current ${benchmarkComparison.current_summary?.passed_cases || 0}/${benchmarkComparison.current_summary?.selected_cases || 0}.`),
        benchmarkComparison.issues?.length ? h("ul", { key: "issues", className: "mt-2 space-y-1" }, benchmarkComparison.issues.map((issue, index) => h("li", { key: index }, `- ${issue}`))) : null,
        benchmarkComparison.drift?.length ? h("ul", { key: "drift", className: "mt-2 space-y-1" }, benchmarkComparison.drift.slice(0, 8).map((item, index) => h("li", { key: index }, `- ${item}`))) : null
      ]) : null,
      h("div", { key: "list", className: "mt-5 grid gap-3" }, benchmarkReports.length ? benchmarkReports.slice(0, 12).map((report) => h("div", { key: report.file_name, className: "rounded-2xl border border-slate-200 px-4 py-3" }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-2" }, [
          h("div", { key: "name", className: "min-w-0 truncate font-mono text-sm font-semibold text-slate-950" }, report.file_name),
          h(Badge, { key: "mode" }, report.executed ? "executed" : "dry run")
        ]),
        h("div", { key: "meta", className: "mt-1 text-sm text-slate-600" }, `${report.suite_id || "unknown"}@${report.suite_version || "unknown"} · ${report.passed_cases || 0} passed · ${report.failed_cases || 0} failed · ${formatDate(report.generated_at || report.modified_at)}`)
      ])) : h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No benchmark reports have been generated yet."))
    ])
  ]);
  const adminToolingPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "tooling-moved", title: "Tooling", description: "External tool selection, readiness, lookup paths, and refresh are managed from System -> Setup -> Tools.", className: "border-border bg-card shadow-sm" }, [
      h(Button, { key: "open-tools", onClick: () => { setView("system"); setSystemSubpage("tools"); } }, "Open Tools")
    ])
  ]);
  const runtimeSandboxSettings = {
    ...defaultRuntimeSandboxSettings,
    ...((settings.preflight_json || {}).runtime_sandbox || {})
  };
  const runtimeSandboxResolution = runtimeSandboxReadiness.resolution || emptyRuntimeSandboxReadiness.resolution;
  const runtimeSandboxCandidates = runtimeSandboxResolution.candidates || [];
  const runtimeSandboxWarnings = runtimeSandboxResolution.warnings || runtimeSandboxReadiness.warnings || [];
  const runtimeSandboxBlockers = runtimeSandboxResolution.blockers || runtimeSandboxReadiness.blockers || [];
  const runtimeSandboxPolicySummary = runtimeSandboxReadiness.policy_summary || {};
  const runtimeSandboxStatus = runtimeSandboxResolution.readiness_status || runtimeSandboxReadiness.status || "blocked";
  const runtimeSetupItems = runtimeSandboxSetupPlan?.plan || [];
  const runtimeSetupAutoItems = runtimeSetupItems.filter((item) => item.auto_run);
  const runtimeSetupManualItems = runtimeSetupItems.filter((item) => !item.auto_run && item.command !== "detected");
  const runtimeRecommendedSetupItem = runtimeSetupAutoItems[0] || runtimeSetupManualItems[0] || null;
  const runtimeSandboxDataPending = runtimeSandboxReadinessLoading || !runtimeSandboxReadinessChecked;
  const runtimeSandboxDisplayStatus = runtimeSandboxDataPending ? "checking" : runtimeSandboxStatus;
  const runtimeSandboxStatusClass = runtimeSandboxDataPending
    ? "border-blue-500/40 bg-blue-500/10 text-blue-100"
    : runtimeSandboxStatus === "ready"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
    : runtimeSandboxStatus === "ready_with_warnings"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
      : "border-red-500/40 bg-red-500/10 text-red-100";
  const runtimeBackendLabel = (backendId) => String(backendId || "unavailable").replace(/_/g, " ");
  const runtimeInstallDisabled = runtimeSandboxSetupRunning || runtimeSandboxDataPending || runtimeSandboxStatus !== "blocked" || !runtimeSetupAutoItems.length;
  const runtimeInstallLabel = runtimeSandboxSetupRunning
    ? "Installing..."
    : runtimeSandboxDataPending
      ? "Checking Installer..."
      : runtimeRecommendedSetupItem
        ? `Install ${runtimeRecommendedSetupItem.label}`
        : "Install Runtime Backend";
  const runtimeLaunchable = runtimeSandboxStatus === "ready" || runtimeSandboxStatus === "ready_with_warnings";
  const runtimePostInstallSteps = runtimeRecommendedSetupItem?.post_install?.length
    ? runtimeRecommendedSetupItem.post_install
    : [
      "Start the installed runtime app if it has one.",
      "Click Refresh Readiness.",
      "Restart Tethermark if readiness still does not update."
    ];
  const runtimeSetupExecutedItems = runtimeSandboxSetupResult?.executed || [];
  const runtimeSetupAttemptFailed = runtimeSetupExecutedItems.some((item) => item.error || (item.exit_code != null && item.exit_code !== 0));
  const adminRuntimeSandboxPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "readiness", title: "Local Runtime Sandbox", description: "Runtime validation uses one local sandbox concept. Tethermark resolves the strongest allowed backend automatically and records the selected boundary as evidence.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "status", className: cn("rounded-2xl border px-4 py-3", runtimeSandboxStatusClass) }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide opacity-80" }, "Readiness"),
          h("div", { key: "value", className: "mt-1 text-xl font-semibold" }, runtimeSandboxDisplayStatus)
        ]),
        h("div", { key: "backend", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Selected Backend"),
          h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, runtimeSandboxDataPending ? "checking..." : runtimeBackendLabel(runtimeSandboxResolution.selected_backend))
        ]),
        h("div", { key: "network", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Network"),
          h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, runtimeSandboxPolicySummary.network_policy || runtimeSandboxSettings.network_policy || "none")
        ]),
        h("div", { key: "duration", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Max Duration"),
          h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, `${runtimeSandboxPolicySummary.max_duration_ms || runtimeSandboxSettings.max_duration_ms} ms`)
        ])
      ]),
      !runtimeSandboxDataPending && (runtimeSandboxWarnings.length || runtimeSandboxBlockers.length)
        ? h("div", { key: "messages", className: "mt-4 grid gap-3 lg:grid-cols-2" }, [
          runtimeSandboxWarnings.length ? h("div", { key: "warnings", className: "rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" }, [
            h("div", { key: "title", className: "font-semibold" }, "Warnings"),
            h("ul", { key: "list", className: "mt-2 list-disc space-y-1 pl-5" }, runtimeSandboxWarnings.map((item, index) => h("li", { key: `${item}:${index}` }, item)))
          ]) : null,
          runtimeSandboxBlockers.length ? h("div", { key: "blockers", className: "rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100" }, [
            h("div", { key: "title", className: "font-semibold" }, "Blockers"),
            h("ul", { key: "list", className: "mt-2 list-disc space-y-1 pl-5" }, runtimeSandboxBlockers.map((item, index) => h("li", { key: `${item}:${index}` }, item)))
          ]) : null
        ].filter(Boolean))
        : null,
      !runtimeSandboxDataPending && runtimeSandboxStatus === "blocked" && (runtimeSandboxReadiness.setup_commands || []).length
        ? h("div", { key: "setup-inline", className: "mt-4 rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-100" }, [
          h("div", { key: "title", className: "font-semibold text-blue-50" }, "Setup needed"),
          h("p", { key: "body", className: "mt-1 leading-6 text-blue-100/90" }, "Runtime validation is not launchable yet. Complete the setup steps below, or refresh readiness if you already installed a runtime. Static-only audits remain available.")
        ])
        : null
    ]),
    h(Card, { key: "setup-plan", title: "Set Up Runtime Validation", description: "Follow the recommended local runtime path. Tethermark can run supported installer commands from this page after confirmation.", className: "border-border bg-card shadow-sm" }, runtimeSandboxDataPending
      ? h("div", { className: "rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, "Checking local package managers, runtime backends, and installer options...")
      : runtimeLaunchable
      ? h("div", { className: "grid gap-4" }, [
        h("div", { key: "ready", className: "rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 text-sm leading-6 text-emerald-100" }, [
          h("div", { key: "title", className: "text-base font-semibold" }, "Runtime validation is ready"),
          h("p", { key: "copy", className: "mt-1" }, `Tethermark selected ${runtimeBackendLabel(runtimeSandboxResolution.selected_backend)}. Runtime-validated audits can be launched with the current policy settings.`),
          runtimeSandboxWarnings.length ? h("ul", { key: "warnings", className: "mt-3 list-disc space-y-1 pl-5" }, runtimeSandboxWarnings.map((item, index) => h("li", { key: `${item}:${index}` }, item))) : null
        ]),
        h("div", { key: "actions", className: "flex flex-wrap gap-3" }, [
          h(Button, { key: "refresh", variant: "outline", onClick: refreshRuntimeSandboxReadiness, disabled: runtimeSandboxReadinessLoading || runtimeSandboxSetupRunning }, runtimeSandboxReadinessLoading ? "Refreshing..." : "Refresh Readiness")
        ])
      ])
      : runtimeSetupItems.length
      ? h("div", { className: "grid gap-4" }, [
        h("div", { key: "guided", className: "rounded-2xl border border-border bg-card px-5 py-4" }, [
          h("div", { key: "install-step", className: "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" }, [
            h("div", { key: "copy", className: "min-w-0" }, [
              h("div", { key: "eyebrow", className: "text-xs font-semibold uppercase tracking-wide text-muted" }, "Step 1"),
              h("div", { key: "head", className: "mt-2 flex flex-wrap items-center gap-3" }, [
                h("div", { key: "title", className: "text-lg font-semibold text-foreground" }, runtimeRecommendedSetupItem?.label || "Install a local runtime"),
                h(Badge, { key: "mode" }, runtimeSetupAutoItems.length ? "recommended" : "manual")
              ]),
              h("p", { key: "reason", className: "mt-2 text-sm leading-6 text-muted" }, runtimeRecommendedSetupItem?.reason || "Install Docker, Podman, or gVisor so Tethermark can run runtime validation in a local sandbox."),
              runtimeSetupAutoItems.length
                ? h("p", { key: "auto-copy", className: "mt-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm leading-6 text-blue-100" }, "Tethermark can run the installer command for you. You may still need to approve prompts from the OS installer.")
                : h("p", { key: "manual-copy", className: "mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-100" }, "No supported package manager was detected. Follow the manual installation guidance, then refresh readiness.")
            ]),
            h("div", { key: "actions", className: "flex flex-wrap gap-3 lg:justify-end" }, [
              h(Button, {
                key: "install",
                variant: runtimeSetupAutoItems.length ? "default" : "outline",
                disabled: runtimeInstallDisabled,
                onClick: installRuntimeSandboxBackend
              }, runtimeInstallLabel),
              h(Button, { key: "refresh", variant: "outline", onClick: refreshRuntimeSandboxReadiness, disabled: runtimeSandboxReadinessLoading || runtimeSandboxSetupRunning }, runtimeSandboxReadinessLoading ? "Refreshing..." : "Refresh Readiness")
            ])
          ]),
          h("div", { key: "divider", className: "my-4 border-t border-border" }),
          h("div", { key: "finish-step" }, [
            h("div", { key: "eyebrow", className: "text-xs font-semibold uppercase tracking-wide text-muted" }, "Step 2"),
            h("div", { key: "title", className: "mt-2 text-base font-semibold text-foreground" }, "Finish after installation"),
            h("ol", { key: "list", className: "mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted" }, runtimePostInstallSteps.map((step, index) => h("li", { key: `${step}:${index}` }, step))),
            h("p", { key: "note", className: "mt-3 text-sm leading-6 text-muted" }, "Static audits still work while runtime validation is blocked. Runtime-validated audit launches unlock when readiness passes.")
          ])
        ]),
        h("details", { key: "commands", className: "rounded-2xl border border-border bg-card px-5 py-4" }, [
          h("summary", { key: "summary", className: "cursor-pointer text-sm font-semibold text-foreground" }, "Show install commands and alternatives"),
          h("div", { key: "items", className: "mt-4 grid gap-3" }, runtimeSetupItems.map((item, index) => h("div", {
            key: `${item.label}:${index}`,
            className: "rounded-2xl border border-border bg-card px-4 py-3"
          }, [
            h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
              h("div", { key: "label", className: "font-semibold text-foreground" }, item.label),
              h(Badge, { key: "mode" }, item.command === "detected" ? "ready" : item.auto_run ? "auto" : "manual")
            ]),
            h("pre", { key: "command", className: "mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100" }, item.command_line || item.args?.join(" ") || "No command available."),
            h("div", { key: "reason", className: "mt-2 text-sm leading-6 text-muted" }, item.reason)
          ])))
        ])
      ])
      : h("div", { className: "rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted" }, "Refresh readiness to build a runtime setup plan.")),
    runtimeSandboxSetupResult ? h(Card, { key: "setup-result", title: "Installation Result", description: "Result from the most recent UI-triggered runtime setup attempt.", className: "border-slate-200 bg-white shadow-sm" }, [
      runtimeSetupExecutedItems.length
        ? h("div", { key: "executed", className: "grid gap-4" }, [
          h("div", { key: "summary", className: cn("rounded-2xl border px-5 py-4 text-sm leading-6", runtimeSetupAttemptFailed ? "border-red-200 bg-red-50 text-red-950" : "border-blue-200 bg-blue-50 text-blue-950") }, [
            h("div", { key: "title", className: "text-base font-semibold" }, runtimeSetupAttemptFailed ? "Installer did not finish successfully" : "Installer command finished"),
            h("p", { key: "copy", className: "mt-1" }, runtimeSetupAttemptFailed
              ? "Review the installer message below, then use the manual install guidance if needed."
              : "The package-manager command completed. Finish the runtime setup checklist, then refresh readiness."),
            !runtimeSetupAttemptFailed ? h("ol", { key: "steps", className: "mt-3 list-decimal space-y-1 pl-5" }, runtimePostInstallSteps.map((step, index) => h("li", { key: `${step}:${index}` }, step))) : null
          ]),
          h("details", { key: "logs", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("summary", { key: "summary", className: "cursor-pointer text-sm font-semibold text-slate-950" }, "Advanced: show installer output"),
            h("div", { key: "items", className: "mt-3 grid gap-3" }, runtimeSetupExecutedItems.map((item, index) => h("div", { key: `${item.label}:${index}`, className: "rounded-2xl border border-slate-200 bg-white px-4 py-3" }, [
              h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
                h("div", { key: "label", className: "font-semibold text-slate-950" }, item.label),
                h(Badge, { key: "exit" }, item.error ? "error" : `exit ${item.exit_code ?? "unknown"}`)
              ]),
              item.error ? h("div", { key: "error", className: "mt-2 text-sm text-red-700" }, item.error) : null,
              item.stdout ? h("pre", { key: "stdout", className: "mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100" }, item.stdout.slice(-4000)) : null,
              item.stderr ? h("pre", { key: "stderr", className: "mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-red-950 p-3 text-xs leading-5 text-red-100" }, item.stderr.slice(-4000)) : null
            ])))
          ])
        ])
        : h("div", { key: "none", className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No installer command was executed.")
    ]) : null,
    h("details", {
      key: "advanced-runtime",
      className: "rounded-2xl border border-border bg-card px-5 py-4",
      open: runtimeSandboxAdvancedOpen,
      onToggle: (event) => setRuntimeSandboxAdvancedOpen(Boolean(event.currentTarget.open))
    }, [
      h("summary", { key: "summary", className: "cursor-pointer text-base font-semibold text-foreground" }, "Advanced Runtime Controls"),
      h("p", { key: "description", className: "mt-2 text-sm leading-6 text-muted" }, "Backend selection, execution limits, candidate diagnostics, and raw setup commands are available here for administrators and troubleshooting. Most users should not need these during normal setup."),
      runtimeSandboxAdvancedOpen ? h("div", { key: "content", className: "mt-5 space-y-6" }, [
    h(Card, { key: "settings", title: "Backend Resolution Policy", description: "Controls how Tethermark chooses and gates the internal backend while the launch flow still shows one Local Runtime Sandbox option.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 md:grid-cols-3" }, [
        h(Field, { key: "enabled", label: "Runtime Sandbox" }, Select({
          value: String(runtimeSandboxSettings.enabled !== false),
          onChange: (event) => updateRuntimeSandboxSetting("enabled", event.target.value === "true")
        }, [
          h("option", { key: "enabled", value: "true" }, "enabled"),
          h("option", { key: "disabled", value: "false" }, "disabled")
        ])),
        h(Field, { key: "mode", label: "Resolution Mode" }, Select({
          value: runtimeSandboxSettings.resolution_mode || "auto",
          onChange: (event) => updateRuntimeSandboxSetting("resolution_mode", event.target.value)
        }, [
          h("option", { key: "auto", value: "auto" }, "auto"),
          h("option", { key: "prefer", value: "prefer" }, "prefer then fallback"),
          h("option", { key: "pinned", value: "pinned" }, "pinned only")
        ])),
        h(Field, { key: "preferred", label: "Preferred Backend" }, Select({
          value: runtimeSandboxSettings.preferred_backend || "auto",
          onChange: (event) => updateRuntimeSandboxSetting("preferred_backend", event.target.value)
        }, [
          h("option", { key: "auto", value: "auto" }, "auto"),
          ...runtimeSandboxBackendIds.map((backendId) => h("option", { key: backendId, value: backendId }, runtimeBackendLabel(backendId)))
        ])),
        h(Field, { key: "warning", label: "Warning Backends" }, Select({
          value: String(runtimeSandboxSettings.allow_warning_backends !== false),
          onChange: (event) => updateRuntimeSandboxSetting("allow_warning_backends", event.target.value === "true")
        }, [
          h("option", { key: "allow", value: "true" }, "allow with acceptance"),
          h("option", { key: "block", value: "false" }, "block")
        ])),
        h(Field, { key: "untrusted", label: "Untrusted Repo Policy" }, Select({
          value: String(Boolean(runtimeSandboxSettings.require_hardened_for_untrusted_repo)),
          onChange: (event) => updateRuntimeSandboxSetting("require_hardened_for_untrusted_repo", event.target.value === "true")
        }, [
          h("option", { key: "normal", value: "false" }, "allow configured backends"),
          h("option", { key: "hardened", value: "true" }, "require hardened backend")
        ])),
        h(Field, { key: "network", label: "Network Policy" }, Select({
          value: runtimeSandboxSettings.network_policy || "none",
          onChange: (event) => updateRuntimeSandboxSetting("network_policy", event.target.value)
        }, [
          h("option", { key: "none", value: "none" }, "none"),
          h("option", { key: "dependency", value: "dependency_install_only" }, "dependency install only"),
          h("option", { key: "bounded", value: "bounded" }, "bounded"),
          h("option", { key: "allowlist", value: "allowlist" }, "allowlist")
        ]))
      ]),
      h("div", { key: "allowed", className: "mt-5" }, [
        h("div", { key: "label", className: "mb-2 text-sm font-semibold text-foreground" }, "Allowed Backends"),
        h("div", { key: "list", className: "grid gap-2 md:grid-cols-3" }, runtimeSandboxBackendIds.map((backendId) => h("label", {
          key: backendId,
          className: "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
        }, [
          h("input", {
            key: "check",
            type: "checkbox",
            checked: (runtimeSandboxSettings.allowed_backends || []).includes(backendId),
            onChange: (event) => toggleRuntimeSandboxAllowedBackend(backendId, event.target.checked)
          }),
          h("span", { key: "name" }, runtimeBackendLabel(backendId))
        ])))
      ]),
      h("div", { key: "actions", className: "mt-5 flex flex-wrap justify-end gap-3 border-t border-border pt-4" }, [
        h(Button, { key: "save", onClick: saveRuntimeSandboxSettings, disabled: runtimeSandboxSetupRunning }, "Save Runtime Settings")
      ])
    ]),
    h(Card, { key: "limits", title: "Runtime Policy Defaults", description: "These limits are copied into each runtime execution record and used when constructing sandbox plans.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 md:grid-cols-3" }, [
        h(Field, { key: "max-duration", label: "Max Duration Ms" }, h(Input, {
          type: "number",
          min: 1000,
          value: runtimeSandboxSettings.max_duration_ms || 300000,
          onChange: (event) => updateRuntimeSandboxSetting("max_duration_ms", Math.max(1000, Number(event.target.value || 300000)))
        })),
        h(Field, { key: "step-timeout", label: "Step Timeout Ms" }, h(Input, {
          type: "number",
          min: 1000,
          value: runtimeSandboxSettings.step_timeout_ms || 60000,
          onChange: (event) => updateRuntimeSandboxSetting("step_timeout_ms", Math.max(1000, Number(event.target.value || 60000)))
        })),
        h(Field, { key: "memory", label: "Memory Limit MB" }, h(Input, {
          type: "number",
          min: 128,
          value: runtimeSandboxSettings.memory_limit_mb || 2048,
          onChange: (event) => updateRuntimeSandboxSetting("memory_limit_mb", Math.max(128, Number(event.target.value || 2048)))
        })),
        h(Field, { key: "pids", label: "PID Limit" }, h(Input, {
          type: "number",
          min: 32,
          value: runtimeSandboxSettings.pids_limit || 512,
          onChange: (event) => updateRuntimeSandboxSetting("pids_limit", Math.max(32, Number(event.target.value || 512)))
        })),
        h(Field, { key: "stdout", label: "Stdout Excerpt Bytes" }, h(Input, {
          type: "number",
          min: 256,
          value: runtimeSandboxSettings.max_stdout_bytes || 2000,
          onChange: (event) => updateRuntimeSandboxSetting("max_stdout_bytes", Math.max(256, Number(event.target.value || 2000)))
        })),
        h(Field, { key: "stderr", label: "Stderr Excerpt Bytes" }, h(Input, {
          type: "number",
          min: 256,
          value: runtimeSandboxSettings.max_stderr_bytes || 2000,
          onChange: (event) => updateRuntimeSandboxSetting("max_stderr_bytes", Math.max(256, Number(event.target.value || 2000)))
        }))
      ])
    ]),
    h(Card, { key: "candidates", title: "Backend Candidates", description: "Readiness probe results in resolver priority order. These records explain why a backend was selected, warned, or blocked.", className: "border-border bg-card shadow-sm" }, runtimeSandboxDataPending
      ? h("div", { className: "rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, "Checking available local runtime backends...")
      : runtimeSandboxCandidates.length
      ? h("div", { className: "grid gap-3" }, runtimeSandboxCandidates.map((candidate) => h("div", {
        key: candidate.backend_id,
        className: "rounded-2xl border border-border bg-card px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
          h("div", { key: "name", className: "font-semibold text-foreground" }, runtimeBackendLabel(candidate.backend_id)),
          h("div", { key: "badges", className: "flex flex-wrap gap-2" }, [
            h(Badge, { key: "status" }, candidate.status),
            candidate.version ? h(Badge, { key: "version" }, candidate.version) : null
          ])
        ]),
        h("div", { key: "reason", className: "mt-2 text-sm text-muted" }, candidate.reason),
        candidate.security_notes?.length ? h("ul", { key: "notes", className: "mt-2 list-disc space-y-1 pl-5 text-sm text-muted" }, candidate.security_notes.map((note, index) => h("li", { key: `${candidate.backend_id}:${index}` }, note))) : null
      ])))
      : h("div", { className: "rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted" }, "Refresh readiness to see backend candidates.")),
    h(Card, { key: "setup", title: "Setup Commands", description: "Operator guidance only. The web UI does not silently install privileged container runtimes.", className: "border-border bg-card shadow-sm" }, runtimeSandboxDataPending
      ? h("div", { className: "rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, "Checking platform setup commands...")
      : (runtimeSandboxReadiness.setup_commands || []).length
      ? h("pre", { className: "overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100" }, runtimeSandboxReadiness.setup_commands.join("\n"))
      : h("div", { className: "rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted" }, "No setup commands are available for this platform."))
      ]) : null
    ])
  ]);
  const adminObservabilityPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "observability", title: "Observability", description: "Proof and troubleshooting data for agent, LLM, tool, stage, and queue behavior.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "runs", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Observed Runs"),
          h("div", { key: "value", className: "mt-2 text-xl font-semibold text-slate-950" }, formatCount(observabilityTotals.run_count || runs.length))
        ]),
        h("div", { key: "tokens", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Tokens"),
          h("div", { key: "value", className: "mt-2 text-xl font-semibold text-slate-950" }, formatCount(observabilityTotals.total_tokens))
        ]),
        h("div", { key: "events", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Events / Metrics"),
          h("div", { key: "value", className: "mt-2 text-xl font-semibold text-slate-950" }, `${formatCount(observabilityTotals.event_count)} / ${formatCount(observabilityTotals.metric_count)}`)
        ]),
        h("div", { key: "cost", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Est. Cost"),
          h("div", { key: "value", className: "mt-2 text-xl font-semibold text-slate-950" }, formatCost(observabilityTotals.estimated_cost_usd))
        ])
      ]),
      h("div", { key: "retention", className: "mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" },
        `Retention: raw events ${observabilityRetention.raw_event_retention_days || "n/a"}d, raw metrics ${observabilityRetention.raw_metric_retention_days || "n/a"}d, rollups ${observabilityRetention.rollup_retention_days || "n/a"}d.`
      ),
      h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
        h(Button, { key: "runs", onClick: () => setView("runs") }, "Open Audits"),
        h(Button, { key: "jobs", variant: "outline", onClick: () => { setView("system"); setSystemSubpage("jobs"); } }, "Open Jobs"),
        h(Button, { key: "refresh", variant: "outline", onClick: () => load({ includeDeferred: true }) }, "Refresh Observability")
      ])
    ]),
    h(Card, { key: "learning-observability", title: "Self-Learning Observability", description: "Learning trigger, candidate, synthesis, promotion, and rollback health.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        { label: "Learning Events", value: observabilityLearning.event_count },
        { label: "Open Candidates", value: observabilityLearning.open_candidate_count },
        { label: "Synthesized", value: observabilityLearning.synthesized_candidate_count },
        { label: "Learning Jobs", value: observabilityLearning.job_count }
      ].map((item) => h("div", { key: item.label, className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
        h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, item.label),
        h("div", { key: "value", className: "mt-2 text-xl font-semibold text-slate-950" }, formatCount(item.value))
      ]))),
      h("div", { key: "detail", className: "mt-4 grid gap-3 md:grid-cols-2" }, [
        h("div", { key: "status", className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, "Promotion State"),
          h("div", { key: "copy", className: "mt-1" }, `${formatCount(observabilityLearning.promotion_count)} promotions, ${formatCount(observabilityLearning.rollback_count)} rollbacks, ${formatCount(observabilityLearning.rejected_candidate_count)} rejected candidates.`)
        ]),
        h("div", { key: "job", className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" }, [
          h("div", { key: "title", className: "font-medium text-slate-950" }, "Latest Learning Job"),
          h("div", { key: "copy", className: "mt-1" }, observabilityLearning.latest_job
            ? `${humanizeLearningIdentifier(observabilityLearning.latest_job.trigger)} ${observabilityLearning.latest_job.status} at ${formatDate(observabilityLearning.latest_job.completed_at)}; ${formatCount(observabilityLearning.latest_job.candidates_synthesized)} synthesized, ${formatCount(observabilityLearning.latest_job.synthesis_skipped)} skipped.`
            : "No learning job has been recorded yet.")
        ])
      ]),
      h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
        h(Button, { key: "learning", variant: "outline", onClick: () => setView("learning") }, "Open Learning"),
        h(Button, { key: "settings", variant: "outline", onClick: () => { setView("system"); setSystemSubpage("self-learning-settings"); setSettingsSubpage("learning-settings"); } }, "Learning Settings")
      ])
    ]),
    h(Card, { key: "modules", title: "Observability Modules", description: "Community Edition shows local proof data. Tethermark Cloud and operator modules expand scope and require stronger permissions.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 xl:grid-cols-3" }, [
        observabilityScopeCard({
          id: "oss",
          title: "Community Observability",
          badge: "included",
          enabled: true,
          description: "Local per-run proof that the harness executed the expected agents, tools, and stages.",
          items: [
            "Run observability summary: agent calls, tokens, cost estimate, context/prompt bytes",
            "Tool execution rollups: completed, skipped, failed, fallback used",
            "Stage timing and reuse rollups",
            "Evidence/provenance links and exported SARIF/JSON",
            "No raw hidden chain-of-thought; show structured rationale and tool evidence"
          ]
        }),
        observabilityScopeCard({
          id: "cloud",
          title: "Cloud Observability",
          badge: "requires cloud workspace",
          enabled: false,
          description: "Organization-level monitoring across projects, users, providers, and audit history.",
          items: [
            "Cross-project dashboards, trends, and benchmark comparisons",
            "Provider/model cost, latency, token, retry, and failure analytics",
            "Policy drift, skipped-control trends, and review SLA queues",
            "Role-based access for security reviewers, project owners, and auditors",
            "Longer retention, exports, alerts, and scheduled reports"
          ],
          note: "Requires an authenticated Tethermark Cloud workspace and tenant-scoped permissions."
        }),
        observabilityScopeCard({
          id: "operator",
          title: "Operator Observability",
          badge: "operator only",
          enabled: authInfo.trusted_mode,
          description: "Deep troubleshooting for the harness creator/operator to verify agent logic and performance.",
          items: [
            "Agent/lane traces, evaluator decisions, prompt templates, and model routing",
            "Raw tool inputs/outputs, adapter stderr/stdout, and retry/fallback paths",
            "Redacted prompt/response captures where retention policy allows",
            "Debug bundles for reproducing failed runs and validating agent behavior",
            "Permission-gated access separate from normal reviewer workflows"
          ],
          note: authInfo.trusted_mode
            ? "Trusted local mode can expose operator diagnostics. Cloud operator access should require explicit elevated permission."
            : "Requires elevated operator permission."
        })
      ])
    ]),
    h(Card, { key: "recent", title: "Recent Observed Runs", description: "Latest runs with persisted observability rollups.", className: "border-slate-200 bg-white shadow-sm" }, observabilityRuns.length
      ? h("div", { className: "max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, observabilityRuns.map((run) => h("div", {
        key: run.run_id,
        className: "grid gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_repeat(5,auto)]"
      }, [
        h("div", { key: "id", className: "min-w-0" }, [
          h("div", { key: "run", className: "truncate font-medium text-slate-950" }, run.run_id),
          h("div", { key: "target", className: "mt-1 text-slate-500" }, `${run.target_id || "target n/a"} / ${formatDate(run.created_at)}`)
        ]),
        h("div", { key: "stages", className: "text-slate-700" }, `${formatCount(run.stage_execution_count)} stages`),
        h("div", { key: "events", className: "text-slate-700" }, `${formatCount(run.event_count)} events`),
        h("div", { key: "tokens", className: "text-slate-700" }, `${formatCount(run.total_tokens)} tokens`),
        h("div", { key: "cost", className: "text-slate-700" }, formatCost(run.estimated_cost_usd)),
        h(Button, {
          key: "trace",
          variant: observabilityTraceRunId === run.run_id ? "default" : "outline",
          className: "px-3 py-1.5 text-xs",
          disabled: observabilityTraceLoading && observabilityTraceRunId === run.run_id,
          onClick: () => loadObservabilityTrace(run.run_id)
        }, observabilityTraceRunId === run.run_id ? "Trace Open" : "Trace")
      ])))
      : h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No observability rollups are available yet. Run an audit, then refresh observability.")),
    h(Card, { key: "agent-trace", title: "Agent Trace", description: "Structured agent logic, handoffs, intermediate outputs, QA checks, and correction records for troubleshooting a selected run.", className: "border-slate-200 bg-white shadow-sm" }, renderTracePanel())
  ]);
  const adminSubpageContent = {
    system: adminSystemPanel,
    methodology: methodologyAdminPanel,
    validation: adminValidationPanel,
    benchmarks: adminBenchmarkPanel,
    "runtime-sandbox": adminRuntimeSandboxPanel,
    tooling: adminToolingPanel,
    observability: adminObservabilityPanel
  }[adminSubpage] || adminSystemPanel;
  const adminView = h("section", { className: "overflow-hidden rounded-3xl border border-slate-200 bg-white xl:grid xl:grid-cols-[220px_minmax(0,1fr)]" }, [
    h("aside", { key: "admin-nav", className: "border-b border-slate-200 bg-slate-50/80 px-4 py-5 xl:border-b-0 xl:border-r" }, [
      h("div", { key: "label", className: "px-2 text-xs font-medium text-slate-400" }, "Admin"),
      h("nav", { key: "nav", className: "mt-3 grid gap-1.5" }, adminNavItems.map((item) => h("button", {
        key: item.id,
        type: "button",
        onClick: () => setAdminSubpage(item.id),
        className: cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
          adminSubpage === item.id
            ? "bg-slate-100 font-semibold text-slate-950"
            : "text-slate-700 hover:bg-slate-50"
        )
      }, [
        h("span", { key: "dot", className: cn("h-2.5 w-2.5 rounded-full", adminSubpage === item.id ? "bg-slate-900" : "bg-slate-300") }),
        h("span", { key: "text" }, item.label)
      ])))
    ]),
    h("div", { key: "panel", className: "min-w-0 bg-white px-6 py-6" }, adminSubpageContent)
  ]);

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
    onSaveRemediationItem: saveRemediationItem,
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
    onOutboundTargetNumberChange: setOutboundTargetNumber,
    assistantState,
    assistantSessions,
    assistantSessionsLoading,
    assistantSessionsError,
    assistantInput,
    assistantScopeType,
    onAssistantInputChange: setAssistantInput,
    onAssistantSend: () => sendAssistantMessage(),
    onAssistantPrompt: sendAssistantMessage,
    onAssistantScopeChange: changeAssistantScope,
    onAssistantConfirmAction: (action) => resolveAssistantAction(action, "confirm"),
    onAssistantRejectAction: (action) => resolveAssistantAction(action, "reject"),
    onAssistantNewSession: startNewAssistantSession,
    onAssistantOpenSession: openAssistantSession,
    onAssistantRenameSession: renameAssistantSession,
    onAssistantArchiveSession: archiveAssistantSession,
    onAssistantDeleteSession: deleteAssistantSession,
    notice: runNotice
  });

  const runsLaunchModal = h(LaunchAuditModal, {
    key: "launch-modal",
    open: launchModalOpen,
    onClose: () => setLaunchModalOpen(false),
    requestContext,
    currentProject,
    projects: projectOptions,
    onProjectChange: (projectId) => updateRequestContext("projectId", projectId),
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

  const launchModalOverlay = launchModalOpen && view !== "runs" ? runsLaunchModal : null;

  const runsView = window.TethermarkFeatures?.RunsWorkspace
    ? h(window.TethermarkFeatures.RunsWorkspace, {
      runs,
      selectedRunId,
      onSelectRun: setSelectedRunId,
      onOpenLaunch: () => setLaunchModalOpen(true),
      onOpenReviews: () => setView("findings"),
      detailPane: runsDetailPane,
      launchModal: runsLaunchModal,
      helpers: {
        Button,
        Input,
        Select,
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
                h("h2", { key: "title", className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Audits Inbox"),
                h("p", { key: "desc", className: "mt-2 text-sm leading-6 text-slate-500" }, "Select a run from the queue, inspect the selected run on the right, and launch new audits from a dedicated modal.")
              ]),
              h("div", { key: "actions", className: "flex shrink-0 flex-wrap gap-3" }, [
                h(Button, { key: "launch", onClick: () => setLaunchModalOpen(true) }, "Launch Audit"),
                h(Button, { key: "findings", variant: "outline", onClick: () => setView("findings") }, "Open Findings")
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
            h("option", { key: "disposition", value: "needs_disposition_review" }, "needs exception re-review"),
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
      onSaveRemediationItem: saveRemediationItem,
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
      onOutboundTargetNumberChange: setOutboundTargetNumber,
      publisherMode: publisherModeEnabled,
      assistantState,
      assistantSessions,
      assistantSessionsLoading,
      assistantSessionsError,
      assistantInput,
      assistantScopeType,
      onAssistantInputChange: setAssistantInput,
      onAssistantSend: () => sendAssistantMessage(),
      onAssistantPrompt: sendAssistantMessage,
      onAssistantScopeChange: changeAssistantScope,
      onAssistantConfirmAction: (action) => resolveAssistantAction(action, "confirm"),
      onAssistantRejectAction: (action) => resolveAssistantAction(action, "reject"),
      onAssistantNewSession: startNewAssistantSession,
      onAssistantOpenSession: openAssistantSession,
      onAssistantRenameSession: renameAssistantSession,
      onAssistantArchiveSession: archiveAssistantSession,
      onAssistantDeleteSession: deleteAssistantSession,
      notice: runNotice
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

  const visibleLearningCandidates = learningCandidates.filter((candidate) => !isInvalidLearningCandidate(candidate, getLearningSourceEvents(candidate, learningEvents)));
  const filteredLearningCandidates = visibleLearningCandidates.filter((candidate) => {
    if (learningFilter === "open") return ["proposed", "experimented"].includes(candidate.status);
    if (learningFilter === "promoted") return candidate.status === "promoted";
    if (learningFilter === "closed") return ["rejected", "rolled_back", "expired"].includes(candidate.status);
    return true;
  });
  const learningStats = [
    { label: "Signals", value: learningEvents.length },
    { label: "Open Candidates", value: visibleLearningCandidates.filter((item) => ["proposed", "experimented"].includes(item.status)).length },
    { label: "Synthesized", value: visibleLearningCandidates.filter((item) => item.metadata_json?.llm_synthesis?.status === "completed").length },
    { label: "Learning Jobs", value: learningJobs.length }
  ];
  const learningView = h("div", { className: "space-y-6" }, [
    h("div", { key: "stats", className: "grid gap-4 md:grid-cols-4" }, learningStats.map((item) => h("div", {
      key: item.label,
      className: "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    }, [
      h("div", { key: "label", className: "text-xs uppercase tracking-[0.18em] text-slate-400" }, item.label),
      h("div", { key: "value", className: "mt-3 text-3xl font-semibold tracking-tight text-slate-950" }, String(item.value))
    ]))),
    h(Card, { key: "candidates", title: "Learning Candidates", description: "Governed self-learning proposals. V1 candidates do not change audit behavior until explicitly promoted.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "toolbar", className: "mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" }, [
        h("div", { key: "filter", className: "w-full md:w-56" }, h(Select, {
          value: learningFilter,
          onChange: (event) => setLearningFilter(event.target.value)
        }, [
          h("option", { key: "open", value: "open" }, "Open candidates"),
          h("option", { key: "promoted", value: "promoted" }, "Promoted"),
          h("option", { key: "closed", value: "closed" }, "Closed"),
          h("option", { key: "all", value: "all" }, "All candidates")
        ])),
        h("div", { key: "actions", className: "flex flex-wrap gap-2" }, [
          h(Button, { key: "refresh", variant: "outline", disabled: learningLoading, onClick: () => loadLearningData("Learning refreshed.") }, "Refresh data"),
          h(Button, {
            key: "run",
            disabled: learningLoading || !getLearningSettings(effectiveSettings?.effective).enabled,
            onClick: runLearningNow
          }, learningLoading ? "Running..." : "Run learning now")
        ])
      ]),
      filteredLearningCandidates.length
        ? h("div", { key: "list", className: "space-y-3" }, filteredLearningCandidates.map((candidate) => {
          const sourceEvents = getLearningSourceEvents(candidate, learningEvents);
          const display = getLearningCandidateDisplay(candidate, sourceEvents);
          const synthesisStatus = getCandidateSynthesisStatus(candidate);
          const detailFields = [
            { label: "Recommendation", value: display.typeLabel },
            { label: "Scope", value: display.scopeLabel },
            { label: "Evidence", value: display.evidenceLabel },
            { label: "LLM synthesis", value: `${synthesisStatus.label}${synthesisStatus.detail ? `: ${synthesisStatus.detail}` : ""}` },
            { label: "Promotion impact", value: display.promotionImpact },
            { label: "Review risk", value: display.riskExplanation }
          ].filter((item) => item.value);
          return h("div", {
            key: candidate.id,
            className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
          }, [
            h("div", { key: "head", className: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between" }, [
              h("div", { key: "copy", className: "min-w-0" }, [
                h("div", { key: "title", className: "font-semibold text-slate-950" }, display.title || candidate.title || candidate.id),
                h("div", { key: "summary", className: "mt-1 text-sm text-slate-600" }, display.summary || candidate.summary || ""),
                h("dl", { key: "details", className: "mt-3 grid gap-x-5 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-3" }, detailFields.map((item) => h("div", { key: item.label, className: "min-w-0" }, [
                  h("dt", { key: "label", className: "text-xs uppercase tracking-[0.16em] text-slate-400" }, item.label),
                  h("dd", { key: "value", className: "mt-1 text-slate-700" }, item.value)
                ])))
              ]),
              h("div", { key: "badges", className: "flex flex-wrap gap-2" }, [
                h(Badge, { key: "status" }, candidate.status),
                h(Badge, { key: "synthesis" }, synthesisStatus.label),
                candidate.requires_human_approval ? h(Badge, { key: "approval" }, "approval required") : null
              ].filter(Boolean))
            ]),
            h("div", { key: "rationale", className: "mt-3 text-sm text-slate-600" }, [
              h("div", { key: "label", className: "text-xs uppercase tracking-[0.16em] text-slate-400" }, "Observed reviewer decisions"),
              h("div", { key: "copy", className: "mt-1" }, display.rationale || "No source decision summary recorded.")
            ]),
            h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-2" }, [
              h(Button, { key: "experiment", variant: "outline", disabled: learningLoading || candidate.status === "rejected" || candidate.status === "rolled_back", onClick: () => runLearningCandidateAction(candidate, "experiment") }, "Dry Run"),
              h(Button, { key: "promote", disabled: learningLoading || candidate.status === "promoted" || candidate.status === "rejected" || candidate.status === "rolled_back", onClick: () => runLearningCandidateAction(candidate, "promote") }, "Approve"),
              h(Button, { key: "reject", variant: "outline", disabled: learningLoading || candidate.status === "promoted" || candidate.status === "rejected" || candidate.status === "rolled_back", onClick: () => runLearningCandidateAction(candidate, "reject") }, "Reject")
            ])
          ]);
        }))
        : h("div", { key: "empty", className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No learning candidates in the current filter.")
    ]),
    h(Card, { key: "jobs", title: "Learning Jobs", description: "Recent trigger outcomes for signal sync, candidate generation, and LLM synthesis.", className: "border-slate-200 bg-white shadow-sm" }, learningJobs.length
      ? h("div", { className: "max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, learningJobs.slice(0, 10).map((job) => h("div", {
        key: job.id,
        className: "grid gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_repeat(4,auto)]"
      }, [
        h("div", { key: "id", className: "min-w-0" }, [
          h("div", { key: "trigger", className: "font-medium text-slate-950" }, humanizeLearningIdentifier(job.trigger || "learning job")),
          h("div", { key: "meta", className: "mt-1 text-xs text-slate-500" }, `${job.status || "unknown"} / ${formatDate(job.completed_at || job.started_at)}`)
        ]),
        h("div", { key: "events", className: "text-slate-700" }, `${job.events_synced || 0} synced`),
        h("div", { key: "generated", className: "text-slate-700" }, `${job.candidates_generated || 0} generated`),
        h("div", { key: "synth", className: "text-slate-700" }, `${job.candidates_synthesized || 0} synthesized`),
        h("div", { key: "skipped", className: "text-slate-700" }, `${job.synthesis_skipped || 0} skipped`)
      ])))
      : h("div", { className: "rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500" }, "No learning jobs have run yet.")),
    h(Card, { key: "promotions", title: "Promotion History", description: "Approved learning overlays and rollback state. V1 promotions are auditable records, not hidden prompt or policy mutations.", className: "border-slate-200 bg-white shadow-sm" }, learningPromotions.length
      ? h("div", { className: "space-y-3" }, learningPromotions.map((promotion) => h("div", {
        key: promotion.id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "row", className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium text-slate-900" }, promotion.promoted_artifact_type),
            h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${promotion.scope_type}:${promotion.scope_id} / ${formatDate(promotion.promoted_at)} / ${promotion.promoted_by}`)
          ]),
          h("div", { key: "actions", className: "flex flex-wrap items-center gap-2" }, [
            h(Badge, { key: "status" }, promotion.status),
            promotion.status === "active" ? h(Button, { key: "rollback", variant: "outline", disabled: learningLoading, onClick: () => rollbackLearningPromotionUi(promotion) }, "Rollback") : null
          ].filter(Boolean))
        ])
      ])))
      : h("div", { className: "text-sm text-muted" }, "No learning promotions have been recorded.")),
    h(Card, { key: "events", title: "Recent Learning Signals", description: "Immutable signals extracted from review, disposition, finding quality, runtime follow-up, remediation, and assistant activity.", className: "border-slate-200 bg-white shadow-sm" }, learningEvents.length
      ? h("div", { className: "space-y-2" }, learningEvents.slice(0, 20).map((event) => h("div", {
        key: event.id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      }, [
        h("div", { key: "row", className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "summary", className: "font-medium text-slate-900" }, event.signal_summary),
            h("div", { key: "meta", className: "mt-1 text-slate-500" }, `${event.event_type} / ${event.run_id || "scope"} / ${event.finding_signature || "run-level"}`)
          ]),
          h(Badge, { key: "confidence" }, `confidence ${Math.round(Number(event.confidence || 0) * 100)}%`)
        ])
      ])))
      : h("div", { className: "text-sm text-muted" }, "No learning events have been extracted for this project yet. Review findings or runtime follow-ups, then refresh."))
  ]);

  const defaultPolicyPack = policyPacks.find((item) => item.id === "default") || null;
  const defaultPolicyName = getPolicyPackDisplayLabel(policyPacks, "default");
  const defaultPolicyObjectives = defaultPolicyPack?.policy?.objectives || [];
  const defaultPolicyDecisionRules = defaultPolicyPack?.policy?.control_decision_rules || [];
  const defaultPolicyPublicationRules = defaultPolicyPack?.policy?.publication_rules || [];

  const settingsNavItems = [
    { id: "audit", label: "Audit Type", description: "Audit methodology, scope, and run-shape defaults." },
    { id: "llm", label: "Agent Configuration", description: "Default models, credentials, and agent routing." },
    { id: "learning-settings", label: "Self-Learning", description: "Learning triggers, thresholds, synthesis, and promotion guardrails." },
    { id: "static-tools", label: "External Tools", description: "External audit tool readiness and inclusion defaults." },
    { id: "governance", label: "Policy", description: "Review gates, policy packs, and reference documents." },
    { id: "integrations", label: "Integrations", description: "Outbound delivery and repository integration settings." },
    { id: "artifacts", label: "Artifacts", description: "Debug artifact retention and pruning." }
  ];

  const saveSettings = () => act(
    () => api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), {
      method: "PUT",
      body: JSON.stringify((() => {
        const integrationPayload = buildSettingsIntegrationPayload(settings, integrationRegistry, integrationCredentialDrafts);
        return {
          providers: buildSettingsProvidersPayload(settings, agentCredentialDrafts),
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
          test_mode: settings.test_mode_json,
          learning: getLearningSettings(settings)
        };
      })())
    }, requestContext).then((payload) => Promise.all([
      api("/ui/settings?scope_level=effective", undefined, requestContext),
      api("/llm-providers", undefined, requestContext),
      api("/static-tools", undefined, requestContext),
      api("/runtime-sandbox/readiness", undefined, requestContext)
    ]).then(([effectivePayload, llmProvidersPayload, staticToolsPayload, runtimeSandboxPayload]) => {
      const nextEnvironmentDefaults = llmProvidersPayload.environment_defaults || {};
      setSettings(applyEnvironmentDefaultsToSettings(payload.settings || emptySettings, nextEnvironmentDefaults));
      setLlmRegistry({
        providers: llmProvidersPayload.providers || [],
        presets: llmProvidersPayload.presets || [],
        environment_defaults: nextEnvironmentDefaults
      });
      setProviderCredentialDrafts({});
      setAgentCredentialDrafts({});
      setIntegrationCredentialDrafts({});
      const nextEffectiveSettings = applyEnvironmentDefaultsToEffectiveSettings({
        effective: effectivePayload.settings || emptySettings,
        layers: effectivePayload.layers || emptyEffectiveSettings.layers
      }, nextEnvironmentDefaults);
      setEffectiveSettings(nextEffectiveSettings);
      setStaticToolsReadiness(staticToolsPayload.static_tools || emptyStaticToolsReadiness);
      setRuntimeSandboxReadiness(runtimeSandboxPayload.runtime_sandbox || emptyRuntimeSandboxReadiness);
      setRunForm(deriveRunFormDefaults(currentProject, nextEffectiveSettings, auditPackages));
      setPreflightSummary(null);
      setPreflightStale(true);
      setPreflightCheckedAt(null);
      setPreflightAcceptedAt(null);
    })),
    "Settings saved."
  );

  const applySettingsModelSelection = (selectionValue) => {
    const selectedModel = settingsModelCatalog.find((item) => item.value === selectionValue);
    updateSettings("providers_json", "default_provider", selectedModel?.provider_id || "");
    updateSettings("providers_json", "default_model", selectedModel?.id || "");
  };

  const applySettingsAssistantModelSelection = (selectionValue) => {
    const selectedModel = settingsAgentRoutingModelCatalog.find((item) => item.value === selectionValue);
    updateSettings("providers_json", "assistant_provider", selectedModel?.provider_id || "");
    updateSettings("providers_json", "assistant_model", selectedModel?.id || "");
  };

  const applySettingsAssistantRoutingMode = (mode) => {
    const inheritDefault = mode !== "override";
    setSettings((current) => ({
      ...current,
      providers_json: {
        ...(current.providers_json || {}),
        assistant_inherit_default: inheritDefault,
        assistant_provider: inheritDefault ? "" : ((current.providers_json || {}).assistant_provider || ""),
        assistant_model: inheritDefault ? "" : ((current.providers_json || {}).assistant_model || "")
      }
    }));
  };

  const connectSelectedOAuthProvider = () => {
    if (settings.providers_json.default_provider !== "openai_codex") return;
    const requestId = oauthStatusRequestId.current + 1;
    oauthStatusRequestId.current = requestId;
    clearOAuthStatusPoll();
    act(
      () => api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), {
        method: "PUT",
        body: JSON.stringify({
          providers: settings.providers_json,
          credentials: buildSettingsCredentialsPayload(settings, llmRegistry, providerCredentialDrafts)
        })
      }, requestContext).then(() => api("/llm-providers/openai_codex/status", undefined, requestContext)).then((statusPayload) => {
        if (statusPayload.authenticated ?? statusPayload.connected) {
          if (oauthStatusRequestId.current === requestId) {
            setOauthConnectionState(statusPayload);
          }
          return statusPayload;
        }
        return api("/llm-providers/openai_codex/connect", {
          method: "POST",
          body: JSON.stringify({})
        }, requestContext);
      }).then((payload) => {
        if (oauthStatusRequestId.current === requestId) {
          if (payload.connected) {
            setOauthConnectionState(payload);
          } else {
            setOauthConnectionState({
              status: "started",
              connected: false,
              command: payload.command || "codex",
              checked_at: payload.checked_at || new Date().toISOString(),
              note: payload.note || "A browser sign-in window should open. This status updates automatically after sign-in finishes."
            });
            scheduleOAuthStatusPoll(requestId);
          }
        }
        return Promise.all([
          api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), undefined, requestContext),
          api("/llm-providers", undefined, requestContext)
        ]).then(([settingsPayload, llmProvidersPayload]) => {
          const nextEnvironmentDefaults = llmProvidersPayload.environment_defaults || {};
          setLlmRegistry({
            providers: llmProvidersPayload.providers || [],
            presets: llmProvidersPayload.presets || [],
            environment_defaults: nextEnvironmentDefaults
          });
          setSettings(applyEnvironmentDefaultsToSettings(settingsPayload.settings || settings, nextEnvironmentDefaults));
          return payload;
        });
      }),
      "Connecting ChatGPT account."
    );
  };

  const refreshSelectedOAuthProviderStatus = () => {
    if (settings.providers_json.default_provider !== "openai_codex") return;
    const requestId = oauthStatusRequestId.current + 1;
    oauthStatusRequestId.current = requestId;
    clearOAuthStatusPoll();
    act(
      () => api("/llm-providers/openai_codex/status", undefined, requestContext).then((payload) => {
        if (oauthStatusRequestId.current === requestId) setOauthConnectionState(payload);
        return api("/llm-providers", undefined, requestContext).then((llmProvidersPayload) => {
          setLlmRegistry({
            providers: llmProvidersPayload.providers || [],
            presets: llmProvidersPayload.presets || [],
            environment_defaults: llmProvidersPayload.environment_defaults || {}
          });
          return payload;
        });
      }),
      "Checked Codex connection."
    );
  };

  const saveAndCheckSelectedOAuthProvider = () => {
    if (settings.providers_json.default_provider !== "openai_codex") return;
    const requestId = oauthStatusRequestId.current + 1;
    oauthStatusRequestId.current = requestId;
    clearOAuthStatusPoll();
    act(
      () => api("/ui/settings?scope_level=" + encodeURIComponent(currentSettingsScopeLevel), {
        method: "PUT",
        body: JSON.stringify({
          providers: settings.providers_json,
          credentials: buildSettingsCredentialsPayload(settings, llmRegistry, providerCredentialDrafts)
        })
      }, requestContext).then(() => api("/llm-providers/openai_codex/status", undefined, requestContext)).then((payload) => {
        if (oauthStatusRequestId.current === requestId) setOauthConnectionState(payload);
        return api("/llm-providers", undefined, requestContext).then((llmProvidersPayload) => {
          const nextEnvironmentDefaults = llmProvidersPayload.environment_defaults || {};
          setLlmRegistry({
            providers: llmProvidersPayload.providers || [],
            presets: llmProvidersPayload.presets || [],
            environment_defaults: nextEnvironmentDefaults
          });
          setSettings(applyEnvironmentDefaultsToSettings(settings, nextEnvironmentDefaults));
          return payload;
        });
      }),
      "Saved provider and checked connection."
    );
  };

  const oauthAuthenticated = Boolean(oauthConnectionState?.authenticated ?? oauthConnectionState?.connected);
  const oauthCommandAvailable = Boolean(oauthConnectionState?.command_available);
  const oauthExecutableReady = Boolean(oauthConnectionState?.executable_ready);
  const oauthReady = Boolean(oauthConnectionState?.ready);
  const oauthStatusBadge = oauthConnectionState
    ? (oauthReady
      ? "ready"
      : oauthConnectionState.status === "started"
        ? "sign-in started"
        : oauthAuthenticated
          ? "CLI unavailable"
          : "needs sign-in")
    : "not checked";
  const oauthStatusNote = oauthConnectionState?.note
    || (settingsProviderCredentialStatus.configured
      ? "Codex is configured for local runs. Check the connection if this is the first time using it on this machine."
      : "Connect your ChatGPT account once on this machine. Tethermark will use that local Codex session for manual runtime audits.");
  const learningSettings = getLearningSettings(settings);
  const learningSynthesisEnabled = learningSettings.enabled !== false && learningSettings.llm_synthesis_enabled !== false;

  const settingsLlmPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "llm-defaults", title: "Agent Configuration" }, [
      h("div", {
        key: "intro",
        className: "mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
      }, [
        h("div", { key: "title", className: "font-medium text-slate-900" }, "Configure how models are chosen for audits"),
        h("div", { key: "body", className: "mt-1" }, "Choose one default live model and API key for all agents. If a specific agent needs a different model, set it below in the agent-specific section. If a run sets its own agent model in the launch modal, that run-specific choice is used instead of the settings on this page.")
      ]),
      h("div", { key: "global-model-header", className: "mb-3" }, [
        h("div", { key: "title", className: "font-medium text-slate-900" }, "Global Agent Default Model"),
        h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "This default model is used for all agents unless a specific agent is assigned a different model below.")
      ]),
      h("div", { key: "global-defaults", className: "grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "model", label: "Default Model" }, Select({
          value: settingsDefaultModelValue,
          onChange: (event) => applySettingsModelSelection(event.target.value)
        }, [
          h("option", { key: "placeholder", value: "" }, "select a model"),
          ...(llmRegistry.providers || []).map((provider) => h("optgroup", { key: provider.id, label: provider.name }, settingsModelCatalog
            .filter((item) => item.provider_id === provider.id && item.provider_id !== "mock")
            .map((item) => h("option", { key: item.value, value: item.value }, item.label))))
        ])),
        settingsProvider?.mode === "agent_oauth"
          ? h(Field, { key: "oauth", label: "ChatGPT + Codex CLI" }, h("div", { className: "space-y-3" }, [
            h("div", { key: "buttons", className: "flex h-11 items-center gap-2" }, [
              h(Button, {
                key: "connect",
                onClick: connectSelectedOAuthProvider,
                disabled: settings.providers_json.default_provider !== "openai_codex" || oauthAuthenticated
              }, oauthAuthenticated ? "ChatGPT connected" : "Connect ChatGPT account"),
              h(Button, {
                key: "refresh",
                variant: "outline",
                onClick: refreshSelectedOAuthProviderStatus,
                disabled: settings.providers_json.default_provider !== "openai_codex"
              }, "Refresh")
            ]),
            h("div", { key: "status", className: "rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700" }, [
              h("div", { key: "summary", className: "flex items-center justify-between gap-3" }, [
                h("span", { key: "label", className: "font-medium text-slate-900" }, "Audit readiness"),
                h(Badge, { key: "badge" }, oauthStatusBadge)
              ]),
              h("div", { key: "auth", className: "mt-2 flex items-center justify-between gap-3" }, [
                h("span", { key: "label" }, "ChatGPT session"),
                h("span", { key: "value", className: "font-mono" }, oauthAuthenticated ? "authenticated" : "not authenticated")
              ]),
              h("div", { key: "cli", className: "mt-1 flex items-center justify-between gap-3" }, [
                h("span", { key: "label" }, "Codex CLI check"),
                h("span", { key: "value", className: "font-mono" }, oauthExecutableReady
                  ? "verified"
                  : oauthCommandAvailable
                    ? "status failed"
                    : "unavailable")
              ]),
              h("div", { key: "note", className: "mt-2 text-slate-500" }, oauthStatusNote)
            ]),
            settingsCodexCommandField ? h("div", { key: "command", className: "space-y-2" }, [
              h("div", { key: "label", className: "text-xs font-medium text-slate-700" }, settingsCodexCommandField.label),
              h("div", { key: "input", className: "flex items-center gap-2" }, [
                h(Input, {
                  key: "field",
                  value: settingsCodexCommandValue,
                  onChange: (event) => updateProviderCredentialDraft(settingsCodexCommandField.id, event.target.value),
                  placeholder: settingsCodexCommandPlaceholder
                }),
                h(Button, {
                  key: "save",
                  variant: "outline",
                  onClick: saveAndCheckSelectedOAuthProvider
                }, "Save & check")
              ]),
              h("div", { key: "help", className: "text-xs text-slate-500" }, settingsCodexCommandField.help_text)
            ]) : null
          ]))
          : h(Field, { key: "api", label: "API Key" }, h("div", { className: "space-y-2" }, [
            h(PasswordInput, {
              shown: Boolean(visibleApiKeys.default || (settingsDefaultApiFieldId && visibleApiKeys[settingsDefaultApiFieldId])),
              onToggleShown: () => toggleVisibleApiKey(settingsDefaultApiFieldId || "default"),
              value: settingsDefaultApiDisplayValue,
              onFocus: (event) => settingsDefaultApiConfigured && event.target.select(),
              onChange: (event) => settingsDefaultApiFieldId ? updateProviderCredentialDraft(settingsDefaultApiFieldId, event.target.value) : undefined,
              placeholder: settingsDefaultApiEnvHint || "enter provider API key",
              disabled: !settingsDefaultApiFieldId
            }),
            h("div", { className: "text-xs text-slate-500" }, settingsDefaultApiConfigured
              ? `API key is configured${settingsDefaultApiEnvHint ? ` via ${settingsDefaultApiEnvHint}` : ""}. Enter a new value to replace it.`
              : settingsDefaultApiFieldId
                ? `Used by the global default model. Environment fallback: ${settingsDefaultApiEnvHint || "none"}.`
                : "The selected provider does not use an API key.")
          ]))
      ]),
      h("div", { key: "assistant-routing", className: "mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" }, [
        h("div", { key: "header", className: "mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium text-slate-900" }, "Assistant Model"),
            h("div", { key: "body", className: "mt-1 text-sm text-slate-500" }, "Used by the Ask This Audit assistant. Community Edition keeps deterministic evidence-grounding available when no assistant model is configured.")
          ]),
          h("div", { key: "resolved", className: "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" }, settingsAssistantInheritsDefault
            ? `inherits ${settings.providers_json.default_model || "global default"}`
            : (settings.providers_json.assistant_model || "override not selected"))
        ]),
        h("div", { key: "fields", className: "grid gap-4 md:grid-cols-[0.45fr_1fr]" }, [
          h(Field, { key: "mode", label: "Routing" }, Select({
            value: settingsAssistantInheritsDefault ? "inherit" : "override",
            onChange: (event) => applySettingsAssistantRoutingMode(event.target.value)
          }, [
            h("option", { key: "inherit", value: "inherit" }, "inherit global default"),
            h("option", { key: "override", value: "override" }, "use assistant-specific model")
          ])),
          h(Field, { key: "model", label: "Assistant Model" }, Select({
            value: settingsAssistantInheritsDefault ? "" : settingsAssistantModelValue,
            disabled: settingsAssistantInheritsDefault,
            onChange: (event) => applySettingsAssistantModelSelection(event.target.value)
          }, [
            h("option", { key: "placeholder", value: "" }, settingsAssistantInheritsDefault ? "inherits global default" : "select assistant model"),
            ...(llmRegistry.providers || [])
              .filter((provider) => provider.id !== "mock")
              .map((provider) => h("optgroup", { key: provider.id, label: provider.name }, settingsAgentRoutingModelCatalog
                .filter((item) => item.provider_id === provider.id)
                .map((item) => h("option", { key: `assistant:${item.value}`, value: item.value }, item.label))))
          ]))
        ])
      ]),
      h("div", { key: "agent-routing", className: "mt-8 space-y-4 border-t border-slate-200 pt-6" }, [
        h("div", { key: "title" }, [
          h("div", { key: "heading", className: "font-medium text-slate-900" }, "Individual Agent Overrides"),
          h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Use these rows only when a specific agent should use a different provider, model, or API key than the global default.")
        ]),
        h("div", { key: "rows", className: "space-y-3" }, agentConfigCatalog.map((agent) => {
          const override = settingsAgentOverrides[agent.id] || {};
          const envOverride = llmRegistry.environment_defaults?.agent_overrides?.[agent.id] || {};
          const agentInactive = Boolean(agent.learning_synthesis && !learningSynthesisEnabled);
          const agentDraftPresent = Object.prototype.hasOwnProperty.call(agentCredentialDrafts, agent.id);
          const agentEnvApiConfigured = !agentDraftPresent && !override.api_key && envOverride.api_key_configured;
          const agentApiDisplayValue = agentDraftPresent
            ? (agentCredentialDrafts[agent.id] || "")
            : (override.api_key || envOverride.api_key_value || (agentEnvApiConfigured ? maskedApiKeyValue : ""));
          const providerId = override.provider || "";
          const agentProvider = getProviderDefinition(llmRegistry, providerId);
          const modelValue = providerId && override.model ? `${providerId}:${override.model}` : "";
          return h("div", { key: agent.id, className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" }, [
            h("div", { key: "meta", className: "mb-3 flex flex-wrap items-center justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "name", className: "flex flex-wrap items-center gap-2 font-medium text-slate-900" }, [
                  h("span", { key: "title" }, agent.title),
                  agent.learning_synthesis ? h(Badge, { key: "learning" }, agentInactive ? "inactive" : "learning synthesis") : null
                ]),
                h("div", { key: "inherit", className: "mt-1 text-sm text-slate-500" }, providerId
                  ? (agentInactive ? "Configured but inactive because Self-Learning LLM synthesis is disabled." : "Uses this provider and model by default unless a run overrides it.")
                  : (agentInactive ? "Visible for governance, but inactive because Self-Learning LLM synthesis is disabled." : "Inherits the global provider and model by default."))
              ]),
              h(Button, {
                key: "clear",
                variant: "outline",
                onClick: () => updateSettingsAgentOverride(agent.id, { provider: "", model: "", api_key: "" }),
                disabled: agentInactive || (!providerId && !(override.model || "") && !(override.api_key || ""))
              }, "Inherit Global")
            ]),
            h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
              h(Field, { key: "model", label: "Model" }, Select({
                value: modelValue,
                disabled: agentInactive,
                onChange: (event) => {
                  const selectedModel = settingsAgentRoutingModelCatalog.find((item) => item.value === event.target.value);
                  updateSettingsAgentOverride(agent.id, {
                    provider: selectedModel?.provider_id || "",
                    model: selectedModel?.id || ""
                  });
                }
              }, [
                h("option", { key: "inherit", value: "" }, "inherit global model"),
                ...(llmRegistry.providers || [])
                  .filter((provider) => provider.id !== "mock")
                  .map((provider) => h("optgroup", { key: provider.id, label: provider.name }, settingsAgentRoutingModelCatalog
                    .filter((item) => item.provider_id === provider.id)
                    .map((item) => h("option", { key: `${agent.id}:${item.value}`, value: item.value }, item.label))))
              ])),
              agentProvider?.mode === "agent_oauth"
                ? h(Field, { key: "oauth", label: "OAuth connection" }, h("div", { className: "rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-sm text-indigo-950" }, "Uses the local Codex CLI OAuth session. No agent-specific API key is stored."))
                : h(Field, { key: "api", label: "API key" }, h("div", { className: "space-y-2" }, [
                  h(PasswordInput, {
                    shown: Boolean(visibleApiKeys[agent.id]),
                    onToggleShown: () => toggleVisibleApiKey(agent.id),
                    value: agentApiDisplayValue,
                    onFocus: (event) => agentEnvApiConfigured && event.target.select(),
                    onChange: (event) => updateAgentCredentialDraft(agent.id, event.target.value),
                    placeholder: envOverride.api_key_configured ? `configured via ${envOverride.api_key_env_var}` : `uses ${agent.env_prefix}_API_KEY`,
                    disabled: agentInactive
                  }),
                  h("div", { className: "text-xs text-slate-500" }, envOverride.api_key_configured
                    ? `Environment key is configured via ${envOverride.api_key_env_var}. Leave blank to keep using it.`
                    : `Maps to ${agent.env_prefix}_API_KEY. Leave blank to use the agent-specific or provider environment key.`)
                ]))
            ])
          ]);
        }))
      ]),
    ])
  ]);

  const updateLearningSetting = (key, value) => updateSettings("learning_json", key, value);
  const settingsLearningPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "learning-triggers", title: "Self-Learning Triggers", description: "Controls when reviewer signals become governed improvement candidates." }, [
      h("div", { key: "summary", className: "mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600" }, "Signal extraction and rule-based candidate generation remain deterministic. LLM synthesis enriches eligible candidate copy and review guidance, but cannot promote candidates or change audit behavior."),
      h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4" }, [
        h(Field, { key: "enabled", label: "Learning" }, Select({
          value: String(learningSettings.enabled !== false),
          onChange: (event) => updateLearningSetting("enabled", event.target.value === "true")
        }, [
          h("option", { key: "on", value: "true" }, "enabled"),
          h("option", { key: "off", value: "false" }, "disabled")
        ])),
        h(Field, { key: "trigger-mode", label: "Trigger Mode" }, Select({
          value: learningSettings.trigger_mode || "hybrid",
          onChange: (event) => updateLearningSetting("trigger_mode", event.target.value)
        }, [
          h("option", { key: "hybrid", value: "hybrid" }, "hybrid"),
          h("option", { key: "event", value: "event_driven" }, "event driven"),
          h("option", { key: "scheduled", value: "scheduled" }, "scheduled"),
          h("option", { key: "manual", value: "manual" }, "manual")
        ])),
        h(Field, { key: "sync-limit", label: "Sync Limit" }, h(Input, {
          type: "number",
          min: 1,
          value: learningSettings.sync_limit || 100,
          onChange: (event) => updateLearningSetting("sync_limit", Math.max(1, Number(event.target.value || 100)))
        })),
        h(Field, { key: "schedule", label: "Batch Interval Minutes" }, h(Input, {
          type: "number",
          min: 5,
          value: learningSettings.scheduled_interval_minutes || 60,
          onChange: (event) => updateLearningSetting("scheduled_interval_minutes", Math.max(5, Number(event.target.value || 60)))
        }))
      ]),
      h("div", { key: "checks", className: "mt-5 grid gap-3 md:grid-cols-2" }, [
        ["event_driven_enabled", "Run after completed audits and reviewer actions"],
        ["scheduled_enabled", "Enable scheduled batch trigger"],
        ["llm_nightly_consolidation", "Enable nightly LLM consolidation metadata"],
        ["require_dry_run_before_promotion", "Require dry run before approval"]
      ].map(([key, label]) => h("label", {
        key,
        className: "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
      }, [
        h("input", {
          key: "check",
          type: "checkbox",
          className: "mt-1",
          checked: learningSettings[key] !== false,
          onChange: (event) => updateLearningSetting(key, event.target.checked)
        }),
        h("span", { key: "label" }, label)
      ])))
    ]),
    h(Card, { key: "learning-llm", title: "LLM Synthesis", description: "Controls when the learning synthesizer agent enriches candidate titles, summaries, rationale, and review guidance." }, [
      h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4" }, [
        h(Field, { key: "enabled", label: "LLM Synthesis" }, Select({
          value: String(learningSettings.llm_synthesis_enabled !== false),
          onChange: (event) => updateLearningSetting("llm_synthesis_enabled", event.target.value === "true")
        }, [
          h("option", { key: "on", value: "true" }, "on by default"),
          h("option", { key: "off", value: "false" }, "disabled")
        ])),
        h(Field, { key: "signals", label: "Minimum Signals" }, h(Input, {
          type: "number",
          min: 1,
          value: learningSettings.llm_min_source_signals || 3,
          onChange: (event) => updateLearningSetting("llm_min_source_signals", Math.max(1, Number(event.target.value || 3)))
        })),
        h(Field, { key: "runs", label: "Minimum Runs" }, h(Input, {
          type: "number",
          min: 1,
          value: learningSettings.llm_min_distinct_runs || 2,
          onChange: (event) => updateLearningSetting("llm_min_distinct_runs", Math.max(1, Number(event.target.value || 2)))
        })),
        h(Field, { key: "budget", label: "Max Calls Per Day" }, h(Input, {
          type: "number",
          min: 1,
          value: learningSettings.llm_max_calls_per_day || 50,
          onChange: (event) => updateLearningSetting("llm_max_calls_per_day", Math.max(1, Number(event.target.value || 50)))
        }))
      ]),
      h("div", { key: "checks", className: "mt-5 grid gap-3 md:grid-cols-2" }, [
        ["llm_always_high_risk", "Always synthesize high-risk candidates at 2 signals across 2 runs"],
        ["llm_always_governance_impacting", "Always synthesize accepted-risk, waiver, suppression, and severity candidates"],
        ["llm_manual_synthesis_enabled", "Allow manual synthesis from the Learning page"],
        ["llm_send_source_excerpts", "Send source excerpts to the synthesizer"]
      ].map(([key, label]) => h("label", {
        key,
        className: "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
      }, [
        h("input", {
          key: "check",
          type: "checkbox",
          className: "mt-1",
          checked: learningSettings[key] !== false,
          onChange: (event) => updateLearningSetting(key, event.target.checked)
        }),
        h("span", { key: "label" }, label)
      ]))),
      h("div", { key: "agent-note", className: "mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, learningSettings.llm_synthesis_enabled === false
        ? "The Learning Synthesizer Agent remains visible in Agent Configuration, but is inactive while LLM synthesis is disabled here."
        : "Configure the Learning Synthesizer Agent model in Agent Configuration. If it inherits a mock or missing provider, candidates will show synthesis inactive.")
    ])
  ]);

  const selectedAuditPackageId = settings.audit_defaults_json.audit_package || "agentic-static";
  const selectedAuditPackageConfig = resolvePackageFormConfig(auditPackages, selectedAuditPackageId);
  const selectedAuditPackageLanes = sanitizeEnabledLanes(
    selectedAuditPackageConfig.enabled_lanes,
    selectedAuditPackageConfig.run_mode || "static"
  );
  const selectedAuditPackageDefinition = visibleAuditPackages.find((item) => item.id === selectedAuditPackageId) || getAuditPackageDefinition(auditPackages, selectedAuditPackageId) || null;
  const selectedAuditPackageRuntimeAllowed = runtimeAllowedForPackageConfig(selectedAuditPackageConfig);
  const selectedAuditPackageReviewSeverity = reviewSeverityForPackageConfig(selectedAuditPackageConfig);
  const selectedAuditPackageLaneDetails = auditLaneCatalog.filter((lane) => selectedAuditPackageLanes.includes(lane.id));
  const excludedAuditPackageLaneDetails = auditLaneCatalog.filter((lane) => !selectedAuditPackageLanes.includes(lane.id));
  const settingsAuditPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "audit-defaults", title: "Audit Type", description: "Audit methodology used by project runs and as the starting point for custom runs." }, [
      h("div", { key: "package-note", className: "mb-5 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted" }, "Choose the audit type used by new project runs. Custom run can override this for one launch."),
      visibleAuditPackages.length
        ? h("div", { key: "package-cards", className: "grid gap-3 lg:grid-cols-4" }, visibleAuditPackages.map((item) => {
          const config = resolvePackageFormConfig(auditPackages, item.id);
          const active = item.id === selectedAuditPackageId;
          return h("button", {
            key: item.id,
            type: "button",
            onClick: () => updateAuditDefaultsForPackage(item.id),
            className: cn(
              "rounded-2xl border px-4 py-4 text-left transition",
              active
                ? "border-blue-400 bg-blue-600/20 shadow-md ring-2 ring-blue-400/35"
                : "border-border bg-card hover:border-blue-500/50 hover:bg-muted/20"
            )
          }, [
            h("div", { key: "top", className: "flex items-start justify-between gap-3" }, [
              h("div", { key: "title", className: cn("font-semibold", active ? "text-blue-50" : "text-foreground") }, item.title || item.id),
              active ? h("span", { key: "active", className: "rounded-full border border-blue-300/50 bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white shadow-sm" }, "Selected") : null
            ]),
            h("p", { key: "description", className: cn("mt-2 min-h-[3rem] text-sm leading-5", active ? "text-blue-100" : "text-muted") }, item.description || "Audit package preset."),
            h("div", { key: "meta", className: "mt-4 flex flex-wrap gap-2 text-xs" }, [
              h("span", { key: "mode", className: cn("rounded-full border px-2 py-1", active ? "border-blue-300/40 bg-blue-950/30 text-blue-100" : "border-border bg-card text-muted") }, normalizeRunModeSelection(config.run_mode) || "static"),
              h("span", { key: "lanes", className: cn("rounded-full border px-2 py-1", active ? "border-blue-300/40 bg-blue-950/30 text-blue-100" : "border-border bg-card text-muted") }, `${sanitizeEnabledLanes(config.enabled_lanes, config.run_mode || "static").length} areas`)
            ])
          ]);
        }))
        : h("div", { key: "packages-loading", className: "rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted" }, "Loading audit packages..."),
      h("div", { key: "summary", className: "mt-5 rounded-2xl border border-border bg-card px-4 py-4" }, [
        h("div", { key: "head", className: "flex flex-wrap items-start justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "eyebrow", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Selected Package"),
            h("h3", { key: "title", className: "mt-1 text-lg font-semibold text-foreground" }, selectedAuditPackageDefinition?.title || selectedAuditPackageId),
            h("p", { key: "description", className: "mt-1 max-w-3xl text-sm leading-6 text-muted" }, selectedAuditPackageDefinition?.description || "Package-defined audit methodology.")
          ]),
          h("span", { key: "id", className: "rounded-full border border-border bg-muted/20 px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] text-muted" }, selectedAuditPackageId)
        ]),
        h("div", { key: "facts", className: "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" }, [
          h("div", { key: "mode", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Run Mode"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, normalizeRunModeSelection(selectedAuditPackageConfig.run_mode) || "static")
          ]),
          h("div", { key: "runtime", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Runtime Validation"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, selectedAuditPackageRuntimeAllowed.replace(/_/g, " "))
          ]),
          h("div", { key: "review", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Review Default"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, selectedAuditPackageReviewSeverity)
          ]),
          h("div", { key: "publishability", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Publishability Default"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, selectedAuditPackageConfig.publishability_threshold || "high")
          ])
        ]),
        h("div", { key: "policy-note", className: "mt-4 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted" }, "Policy settings can require stricter review than the package default. They do not change the selected audit methodology.")
      ]),
      h("div", { key: "coverage", className: "mt-5 rounded-2xl border border-border bg-card px-4 py-4" }, [
        h("div", { key: "title", className: "font-semibold text-foreground" }, "Coverage"),
        h("div", { key: "included-label", className: "mt-3 text-xs font-medium uppercase tracking-wide text-muted" }, "Included Audit Areas"),
        h("div", { key: "included", className: "mt-2 flex flex-wrap gap-2" }, selectedAuditPackageLaneDetails.map((lane) => h("span", {
          key: lane.id,
          className: "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-200"
        }, lane.title))),
        excludedAuditPackageLaneDetails.length ? h("div", { key: "excluded-wrap" }, [
          h("div", { key: "excluded-label", className: "mt-4 text-xs font-medium uppercase tracking-wide text-muted" }, "Not Included By This Package"),
          h("div", { key: "excluded", className: "mt-2 flex flex-wrap gap-2" }, excludedAuditPackageLaneDetails.map((lane) => h("span", {
            key: lane.id,
            className: "rounded-full border border-border bg-muted/20 px-3 py-1 text-sm text-muted"
          }, lane.title)))
        ]) : null
      ]),
      h("details", { key: "technical", className: "mt-5 rounded-2xl border border-border bg-card px-4 py-3" }, [
        h("summary", { key: "summary", className: "cursor-pointer text-sm font-semibold text-foreground" }, "Technical limits"),
        h("p", { key: "copy", className: "mt-2 text-sm leading-6 text-muted" }, "These package limits are shown for transparency. Use Custom run for one-time launch changes."),
        h("div", { key: "budget-grid", className: "mt-4 grid gap-3 md:grid-cols-3" }, [
          h("div", { key: "agents", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Max Agent Calls"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, String(selectedAuditPackageConfig.max_agent_calls || 0))
          ]),
          h("div", { key: "tokens", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Max Total Tokens"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, String(selectedAuditPackageConfig.max_total_tokens || 0))
          ]),
          h("div", { key: "reruns", className: "rounded-2xl border border-border bg-muted/20 px-4 py-3" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Max Rerun Rounds"),
            h("div", { key: "value", className: "mt-1 font-semibold text-foreground" }, String(selectedAuditPackageConfig.max_rerun_rounds || 0))
          ])
        ])
      ])
    ])
  ]);

  const settingsReviewPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "readiness-review", title: "Readiness / Review", description: "Controls launch readiness, human review gates, publishability, and disposition renewal." }, [
      h("div", { key: "governance", className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4" }, [
        h(Field, { key: "review-threshold", label: "Human Review Threshold" }, Select({
          value: settings.review_json.require_human_review_for_severity || settings.audit_defaults_json.review_severity || "high",
          onChange: (event) => updateSettings("review_json", "require_human_review_for_severity", event.target.value)
        }, [
          h("option", { key: "low", value: "low" }, "low"),
          h("option", { key: "medium", value: "medium" }, "medium"),
          h("option", { key: "high", value: "high" }, "high"),
          h("option", { key: "critical", value: "critical" }, "critical")
        ])),
        h(Field, { key: "publishability", label: "Publishability Threshold" }, Select({
          value: settings.review_json.publishability_threshold || settings.audit_defaults_json.publishability_threshold || "high",
          onChange: (event) => updateSettings("review_json", "publishability_threshold", event.target.value)
        }, [
          h("option", { key: "low", value: "low" }, "low"),
          h("option", { key: "medium", value: "medium" }, "medium"),
          h("option", { key: "high", value: "high" }, "high")
        ])),
        publisherModeEnabled
          ? h(Field, { key: "default-visibility", label: "Publication Safety Default" }, Select({
              value: settings.review_json.default_visibility || "internal",
              onChange: (event) => updateSettings("review_json", "default_visibility", event.target.value)
            }, [
              h("option", { key: "public", value: "public" }, "public"),
              h("option", { key: "internal", value: "internal" }, "internal"),
              h("option", { key: "internal-only", value: "internal-only" }, "internal-only")
            ]))
          : null,
        h(Field, { key: "readiness-gate", label: "Audit Readiness Gate" }, Select({
          value: settings.preflight_json.readiness_gate_policy || "risk_or_drift",
          onChange: (event) => updateSettings("preflight_json", "readiness_gate_policy", event.target.value)
        }, [
          h("option", { key: "risk", value: "risk_or_drift" }, "require for runtime or drift"),
          h("option", { key: "always", value: "always" }, "always require readiness review"),
          h("option", { key: "never", value: "never" }, "never require readiness review")
        ]))
      ]),
      h("div", { key: "cadence", className: "mt-5 grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "review-renewal", label: "Exception Renewal Days" }, h(Input, {
          type: "number",
          min: 1,
          value: settings.review_json.disposition_renewal_days || 30,
          onChange: (event) => updateSettings("review_json", "disposition_renewal_days", Math.max(1, Number(event.target.value || 30)))
        })),
        h(Field, { key: "review-window", label: "Risk Acceptance Review Window Days" }, h(Input, {
          type: "number",
          min: 1,
          value: settings.review_json.disposition_review_window_days || 30,
          onChange: (event) => updateSettings("review_json", "disposition_review_window_days", Math.max(1, Number(event.target.value || 30)))
        }))
      ].filter(Boolean))
    ])
  ]);

  const selectedExternalToolIds = normalizeExternalAuditToolIds(settings.preflight_json.external_audit_tool_ids);
  const updateExternalToolSelection = (toolId, enabled) => {
    if (mandatoryExternalAuditToolIds.includes(toolId) && !enabled) return;
    const current = new Set(selectedExternalToolIds);
    if (enabled) current.add(toolId);
    else current.delete(toolId);
    updateSettings("preflight_json", "external_audit_tool_ids", normalizeExternalAuditToolIds([...current]));
  };
  const refreshStaticTools = () => {
    setStaticToolsLoading(true);
    act(
      () => withUiTimeout(
        Promise.all([
          api("/static-tools", undefined, requestContext),
          api("/static-tools/path", undefined, requestContext)
        ]),
        15000,
        "Static tool readiness timed out. Check the API process and retry Tool Selection -> Refresh Tools."
      )
        .then(([toolsPayload, pathPayload]) => {
          setStaticToolsReadiness(toolsPayload.static_tools || emptyStaticToolsReadiness);
          setStaticToolsPathMeta(pathPayload.static_tools_path || null);
          setStaticToolsPathDraft(pathPayload.static_tools_path?.file_value || "");
        })
        .finally(() => setStaticToolsLoading(false)),
      "External audit tool readiness refreshed."
    );
  };
  const saveStaticToolsPath = () => {
    setStaticToolsPathSaving(true);
    act(
      () => api("/static-tools/path", {
        method: "PUT",
        body: JSON.stringify({ value: staticToolsPathDraft })
      }, requestContext).then((payload) => {
        setStaticToolsPathMeta(payload.static_tools_path || null);
        setStaticToolsPathDraft(payload.static_tools_path?.file_value ?? "");
        setStaticToolsReadiness(payload.static_tools || emptyStaticToolsReadiness);
      }).finally(() => setStaticToolsPathSaving(false)),
      `${staticToolsEnvVar} saved to .env.`
    );
  };
  const staticToolRows = staticToolsReadiness.tools || [];
  const staticToolsPending = staticToolsLoading && !staticToolRows.length;
  const staticToolsManagedDirs = staticToolsReadiness.tool_path?.managed_dirs || [];
  const staticToolsEnvVar = staticToolsReadiness.tool_path?.env_var || "HARNESS_STATIC_TOOLS_PATH";
  const staticToolsPathDelimiter = staticToolsPathMeta?.delimiter || ";";
  const staticSelectionTools = staticToolRows.filter((tool) => (tool.run_modes || []).includes("static"));
  const runtimeSelectionTools = staticToolRows.filter((tool) => (tool.run_modes || []).includes("runtime") && !(tool.run_modes || []).includes("static"));
  const otherSelectionTools = staticToolRows.filter((tool) => !(tool.run_modes || []).includes("static") && !(tool.run_modes || []).includes("runtime"));
  const renderSelectableToolRows = (tools, emptyText) => tools.length ? tools.map((tool) => h("div", {
    key: tool.id,
    className: cn("rounded-2xl border px-4 py-3", selectedExternalToolIds.includes(tool.id) ? "border-blue-500/40 bg-blue-500/10 text-blue-100" : "border-border bg-card text-foreground")
  }, [
    h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
      h("label", { key: "name", className: "flex items-center gap-3 font-medium text-current" }, [
        h("input", {
          key: "checkbox",
          type: "checkbox",
          checked: selectedExternalToolIds.includes(tool.id),
          disabled: tool.mandatory || mandatoryExternalAuditToolIds.includes(tool.id),
          onChange: (event) => updateExternalToolSelection(tool.id, event.target.checked)
        }),
        h("span", { key: "label" }, tool.label)
      ]),
      h("div", { key: "badges", className: "flex flex-wrap gap-2" }, [
        selectedExternalToolIds.includes(tool.id) ? h(Badge, { key: "selected" }, "selected") : null,
        h(Badge, { key: "status" }, tool.status),
        h(Badge, { key: "category" }, tool.category || "tool"),
        tool.mandatory || mandatoryExternalAuditToolIds.includes(tool.id) ? h(Badge, { key: "mandatory" }, "required") : null
      ])
    ]),
    h("div", { key: "summary", className: "mt-2 break-words text-sm leading-6 opacity-90" }, tool.summary),
    h("div", { key: "details", className: "mt-2 grid gap-1 text-xs opacity-75 md:grid-cols-2" }, [
      h("div", { key: "command" }, `command: ${tool.command || "internal"}`),
      h("div", { key: "modes" }, `modes: ${(tool.run_modes || []).join(", ") || "n/a"}`),
      tool.version ? h("div", { key: "version" }, tool.version) : null,
      tool.fallback ? h("div", { key: "fallback" }, `fallback: ${tool.fallback}`) : null
    ].filter(Boolean)),
    selectedExternalToolIds.includes(tool.id) && !tool.installed
      ? h("div", { key: "fix", className: "mt-2 text-sm opacity-90" }, tool.fix || "Selected but not detected. Check the command path or install the tool.")
      : null
  ])) : [
    h("div", { key: "empty", className: "rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted" }, emptyText)
  ];
  const settingsStaticToolsPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "readiness", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "readiness-header", className: "flex flex-wrap items-start justify-between gap-3" }, [
        h("div", { key: "copy" }, [
          h("h3", { key: "title", className: "text-xl font-semibold tracking-tight text-foreground" }, "Tool Selection"),
          h("p", { key: "description", className: "mt-2 text-sm leading-6 text-muted" }, "Choose which external tools Tethermark should plan around and verify what the API can detect on this machine.")
        ]),
        h(Button, { key: "refresh", variant: "outline", onClick: refreshStaticTools, disabled: staticToolsLoading }, staticToolsLoading ? "Refreshing..." : "Refresh Tools")
      ]),
      h("div", { key: "lookup-banner", className: "mt-5 flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, [
        h("span", { key: "icon", className: "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-300 text-xs font-semibold text-blue-100" }, "i"),
        h("div", { key: "copy", className: "min-w-0" }, [
          h("div", { key: "title", className: "font-semibold text-blue-50" }, "Lookup source"),
          h("p", { key: "body", className: "mt-1 text-blue-100/90" }, `Tethermark checks tools on the system PATH plus any optional ${staticToolsEnvVar} value configured below.`)
        ])
      ]),
      h("div", { key: "summary", className: "mt-5 grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "status", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Selected"),
          h("div", { key: "value", className: "mt-1 font-medium text-foreground" }, String(selectedExternalToolIds.length))
        ]),
        h("div", { key: "static", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Static Status"),
          h("div", { key: "value", className: "mt-1 font-medium text-foreground" }, diagnosticStaticStatus)
        ]),
        h("div", { key: "runtime", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Runtime Adapters"),
          h("div", { key: "value", className: "mt-1 font-medium text-foreground" }, diagnosticRuntimeStatus)
        ]),
        h("div", { key: "warnings", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Warnings"),
          h("div", { key: "value", className: "mt-1 font-medium text-foreground" }, String((staticToolsReadiness.warnings || []).length))
        ])
      ]),
      h("div", { key: "tools", className: "mt-5 grid gap-5" }, staticToolsPending ? [
        h("div", { key: "checking", className: "rounded-2xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, "Checking external audit tool readiness...")
      ] : staticToolRows.length ? [
        h("div", { key: "static", className: "grid gap-3" }, [
          h("div", { key: "heading", className: "flex flex-wrap items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("h4", { key: "title", className: "text-lg font-semibold text-foreground" }, "Static Tools"),
              h("p", { key: "desc", className: "mt-1 text-sm text-muted" }, "Used by static repository audits and validation smoke tests.")
            ]),
            h(Badge, { key: "status" }, diagnosticStaticStatus)
          ]),
          ...renderSelectableToolRows(staticSelectionTools, "No static tool readiness data is available.")
        ]),
        h("div", { key: "runtime", className: "grid gap-3" }, [
          h("div", { key: "heading", className: "flex flex-wrap items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("h4", { key: "title", className: "text-lg font-semibold text-foreground" }, "Runtime Eval Tools"),
              h("p", { key: "desc", className: "mt-1 text-sm text-muted" }, "Deferred until runtime validation is enabled; missing items do not block static repo testing.")
            ]),
            h(Badge, { key: "status" }, diagnosticRuntimeStatus)
          ]),
          ...renderSelectableToolRows(runtimeSelectionTools, "No runtime eval tool readiness data is available.")
        ]),
        otherSelectionTools.length ? h("div", { key: "other", className: "grid gap-3" }, [
          h("h4", { key: "title", className: "text-lg font-semibold text-foreground" }, "Other Tools"),
          ...renderSelectableToolRows(otherSelectionTools, "No additional tool readiness data is available.")
        ]) : null
      ].filter(Boolean) : h("div", { className: "text-sm text-muted" }, "No external tool readiness data loaded."))
    ]),
    h(Card, { key: "tool-path", title: "Tool Path Configuration", description: "Optional extra lookup paths for locally installed audit tools. Leave blank to use the system PATH only.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "lookup-banner", className: "mt-4 flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, [
        h("span", { key: "icon", className: "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-300 text-xs font-semibold text-blue-100" }, "i"),
        h("div", { key: "copy", className: "min-w-0" }, [
          h("div", { key: "title", className: "font-semibold text-blue-50" }, "Tool lookup order"),
          h("p", { key: "body", className: "mt-1 text-blue-100/90" }, `The API checks the system PATH first, then this optional ${staticToolsEnvVar} value. Saving here updates .env and the running API process; manual .env edits require an API restart.`)
        ])
      ]),
      h("div", { key: "grid", className: "mt-4 grid gap-4" }, [
        h(Field, { key: "path", label: `Additional Tool Path (${staticToolsEnvVar})` }, [
          h(Input, {
            key: "input",
            value: staticToolsPathDraft,
            onChange: (event) => setStaticToolsPathDraft(event.target.value),
            placeholder: `Optional; separate paths with "${staticToolsPathDelimiter}"`
          }),
          h("div", { key: "meta", className: "mt-2 grid gap-1 text-xs leading-5 text-muted" }, [
            h("div", { key: "env" }, `Saved in: ${staticToolsPathMeta?.env_path || ".env"}`),
            h("div", { key: "saved" }, `Saved value: ${staticToolsPathMeta?.file_value || "blank"}`),
            h("div", { key: "effective" }, `Effective additional value: ${staticToolsPathMeta?.effective_value || "blank"}`)
          ]),
          h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-2" }, [
            h(Button, {
              key: "save",
              onClick: saveStaticToolsPath,
              disabled: staticToolsPathSaving || staticToolsLoading
            }, staticToolsPathSaving ? "Saving..." : "Save Tool Path"),
            h(Button, {
              key: "clear",
              variant: "outline",
              onClick: () => setStaticToolsPathDraft(""),
              disabled: staticToolsPathSaving || staticToolsLoading || !staticToolsPathDraft
            }, "Clear Field")
          ])
        ])
      ]),
      h("details", { key: "setup", className: "mt-4 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted" }, [
        h("summary", { key: "title", className: "cursor-pointer font-semibold text-foreground" }, "CLI setup helper"),
        h("p", { key: "copy", className: "mt-2" }, "Use this when you want Tethermark to scan for common tool directories and propose an additional path value."),
        h("pre", { key: "command", className: "mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100" }, "npm run scan -- setup-tools --dry-run\nnpm run scan -- setup-tools --yes")
      ])
    ])
  ]);

  const githubStatus = getIntegrationCredentialStatus(integrationRegistry, "github_outbound");
  const webhookStatus = getIntegrationCredentialStatus(integrationRegistry, "generic_webhook");
  const integrationStatusClass = (status) => status?.enabled
    ? status?.configured
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
      : "border-amber-500/40 bg-amber-500/10 text-amber-100"
    : "border-border bg-card text-foreground";
  const githubActionOptions = [
    ["pr_comment", "PR comment"],
    ["issue_create", "Issue draft"],
    ["label", "Label draft"],
    ["check", "Check payload"]
  ];
  const genericWebhookEventOptions = [
    ["run_completed", "Run completed"],
    ["review_required", "Review required"],
    ["review_requires_rerun", "Review requires rerun"],
    ["outbound_delivery_failed", "Outbound delivery failed"]
  ];
  const integrationLoadingCard = h(Card, { key: "integrations-loading", title: "Integrations", description: "Checking local integration settings and saved connector status.", className: "border-border bg-card shadow-sm" }, [
    h("div", { key: "rows", className: "grid gap-4 xl:grid-cols-2" }, [0, 1].map((item) => h("div", { key: item, className: "rounded-2xl border border-border bg-muted/20 px-4 py-4" }, [
      h("div", { key: "title", className: "h-5 w-48 rounded bg-muted" }),
      h("div", { key: "desc", className: "mt-3 h-4 w-4/5 rounded bg-muted" }),
      h("div", { key: "field", className: "mt-5 h-10 rounded-xl bg-muted" }),
      h("div", { key: "field2", className: "mt-3 h-10 rounded-xl bg-muted" })
    ]))),
    h("div", { key: "note", className: "mt-4 text-sm text-muted" }, "This page loads connector definitions from the local API so status labels match persisted settings and environment fallbacks.")
  ]);
  const toggleListSetting = (section, key, value, enabled) => {
    const current = Array.isArray(settings[section]?.[key]) ? settings[section][key] : [];
    const next = enabled ? [...new Set([...current, value])] : current.filter((item) => item !== value);
    updateSettings(section, key, next);
  };
  const renderIntegrationCredentialField = (integrationId, field) => {
    const status = getIntegrationCredentialFieldStatus(integrationRegistry, integrationId, field.id);
    const persistedSection = field.location === "credentials" ? settings.credentials_json : settings.integrations_json;
    const persistedOverride = persistedSection?.[field.id];
    const persistedHere = typeof persistedOverride === "string" ? persistedOverride.trim().length > 0 : Boolean(persistedOverride);
    const draftValue = integrationCredentialDrafts[field.id] || "";
    const clearPersisted = () => {
      updateSettings(field.location === "credentials" ? "credentials_json" : "integrations_json", field.id, null);
      updateIntegrationCredentialDraft(field.id, "");
    };
    return h("div", {
      key: field.id,
      className: "rounded-2xl border border-border bg-card px-4 py-3"
    }, [
      h("div", { key: "label", className: "font-medium text-foreground" }, field.label),
      field.help_text ? h("div", { key: "help", className: "mt-1 text-xs leading-5 text-muted" }, field.help_text) : null,
      h(Input, {
        key: "input",
        className: "mt-3",
        type: field.secret ? "password" : "text",
        value: field.secret ? draftValue : (persistedSection?.[field.id] || ""),
        onChange: (event) => field.secret
          ? updateIntegrationCredentialDraft(field.id, event.target.value)
          : updateSettings(field.location === "credentials" ? "credentials_json" : "integrations_json", field.id, event.target.value || null),
        placeholder: field.secret
          ? (persistedHere ? "stored secret present; enter a new value to replace" : field.placeholder || "")
          : (field.placeholder || "")
      }),
      h("div", { key: "status", className: "mt-2 text-xs font-mono uppercase tracking-[0.18em] text-muted" }, status?.note || "No field status available."),
      h("div", { key: "controls", className: "mt-3 flex flex-wrap items-center gap-2" }, [
        field.secret && draftValue ? h("div", { key: "pending", className: "text-xs text-emerald-300" }, "New secret will be saved when you click Save Settings.") : null,
        field.secret && draftValue ? h(Button, { key: "clear-draft", variant: "outline", onClick: () => updateIntegrationCredentialDraft(field.id, "") }, "Clear Draft") : null,
        persistedHere ? h(Button, { key: "remove", variant: "outline", onClick: clearPersisted }, field.secret ? "Clear Stored Secret" : "Clear Saved Value") : null
      ].filter(Boolean)),
      field.env_var ? h("div", { key: "env", className: "mt-2 text-xs text-muted" }, `Environment fallback: ${field.env_var}`) : null
    ]);
  };
  const githubDraftEnabled = String(settings.integrations_json.github_mode || "disabled") !== "disabled";
  const webhookConfigured = Boolean(String(settings.integrations_json.generic_webhook_url || "").trim());
  const settingsIntegrationsPanel = integrationRegistryLoading && !integrationRegistry.length
    ? h("div", { className: "space-y-6" }, [integrationLoadingCard])
    : h("div", { className: "space-y-6" }, [
    h(Card, { key: "integrations", title: "Integrations", description: "Optional connections for sharing audit results with other tools. You can skip this page if you only use Tethermark directly.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "boundary", className: "mb-5 flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm leading-6 text-blue-100" }, [
        h("span", { key: "icon", className: "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-300 text-xs font-semibold text-blue-100" }, "i"),
        h("div", { key: "copy", className: "min-w-0" }, [
          h("div", { key: "title", className: "font-semibold text-blue-50" }, "When to use this page"),
          h("p", { key: "body", className: "mt-1 text-blue-100/90" }, "Leave everything disabled unless you want Tethermark to prepare GitHub-ready drafts, send audit-event webhooks, or notify a callback URL when background jobs finish.")
        ])
      ]),
      h("div", { key: "workflow", className: "mb-5 grid gap-3 md:grid-cols-3" }, [
        h("div", { key: "draft", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "GitHub"),
          h("div", { key: "copy", className: "mt-1 text-sm text-foreground" }, "Prepare issue, comment, label, or check text for manual review.")
        ]),
        h("div", { key: "webhook", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Automation Webhook"),
          h("div", { key: "copy", className: "mt-1 text-sm text-foreground" }, "Send selected audit events to a URL from another system.")
        ]),
        h("div", { key: "callback", className: "rounded-2xl border border-border bg-card px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-muted" }, "Job Callback"),
          h("div", { key: "copy", className: "mt-1 text-sm text-foreground" }, "Notify one callback URL when async jobs finish.")
        ])
      ]),
      h("div", { key: "cards", className: "grid gap-4 xl:grid-cols-2" }, [
        h("div", { key: "github", className: cn("rounded-2xl border px-4 py-4 text-sm", integrationStatusClass(githubStatus)) }, [
          h("div", { key: "head", className: "flex flex-wrap items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("h3", { key: "title", className: "text-lg font-semibold" }, githubIntegration?.name || "GitHub Export Drafts"),
              h("p", { key: "desc", className: "mt-1 leading-6 opacity-90" }, githubIntegration?.description || "Prepare GitHub-ready content for manual review and copy/paste.")
            ]),
            h(Badge, { key: "status" }, githubDraftEnabled ? "enabled" : "disabled")
          ]),
          h("div", { key: "note", className: "mt-3 text-xs font-mono uppercase tracking-[0.18em] opacity-75" }, githubStatus?.note || "GitHub draft export status unavailable."),
          h("div", { key: "fields", className: "mt-4 grid gap-4" }, [
            h(Field, { key: "mode", label: "GitHub Drafts" }, Select({ value: settings.integrations_json.github_mode || "disabled", onChange: (event) => updateSettings("integrations_json", "github_mode", event.target.value) }, [
              h("option", { key: "disabled", value: "disabled" }, "Off"),
              h("option", { key: "manual", value: "manual" }, "On - create drafts for manual use"),
              h("option", { key: "project_opt_in", value: "project_opt_in" }, "On for selected projects"),
              h("option", { key: "workspace_default", value: "workspace_default" }, "On by default")
            ])),
            !githubDraftEnabled ? h("div", { key: "skip", className: "rounded-xl border border-border bg-card px-3 py-2 text-sm opacity-90" }, "Nothing else is required. Turn this on only if you want Tethermark to prepare GitHub-ready draft content for findings or reviews.") : null,
            githubDraftEnabled ? [
            h("div", { key: "actions" }, [
              h("div", { key: "label", className: "mb-2 text-sm font-medium text-current" }, "Draft Types"),
              h("div", { key: "checks", className: "grid gap-2 sm:grid-cols-2" }, githubActionOptions.map(([value, label]) => h("label", { key: value, className: "flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2" }, [
                h("input", {
                  key: "input",
                  type: "checkbox",
                  checked: (settings.integrations_json.github_allowed_actions || []).includes(value),
                  onChange: (event) => toggleListSetting("integrations_json", "github_allowed_actions", value, event.target.checked)
                }),
                h("span", { key: "label" }, label)
              ])))
            ]),
            h(Field, { key: "owned-prefixes", label: "Allowed GitHub Repository Prefixes" }, h(Textarea, {
              value: (settings.integrations_json.github_owned_repo_prefixes || []).join("\n"),
              placeholder: "https://github.com/your-org/\ngit@github.com:your-org/",
              onChange: (event) => updateSettings("integrations_json", "github_owned_repo_prefixes", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))
            })),
            h("div", { key: "policy", className: "grid gap-4 md:grid-cols-2" }, [
              h(Field, { key: "owned-only", label: "Limit To Allowed Repositories" }, Select({ value: String(settings.integrations_json.github_owned_repo_only !== false), onChange: (event) => updateSettings("integrations_json", "github_owned_repo_only", event.target.value === "true") }, [
                h("option", { key: "true", value: "true" }, "Yes"),
                h("option", { key: "false", value: "false" }, "No")
              ])),
              h(Field, { key: "approval", label: "Require Approval Before Drafting" }, Select({ value: String(settings.integrations_json.github_require_per_run_approval !== false), onChange: (event) => updateSettings("integrations_json", "github_require_per_run_approval", event.target.value === "true") }, [
                h("option", { key: "true", value: "true" }, "Yes"),
                h("option", { key: "false", value: "false" }, "No")
              ]))
            ])
            ] : null
          ])
        ]),
        h("div", { key: "webhook", className: cn("rounded-2xl border px-4 py-4 text-sm", integrationStatusClass(webhookStatus)) }, [
          h("div", { key: "head", className: "flex flex-wrap items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("h3", { key: "title", className: "text-lg font-semibold" }, genericWebhookIntegration?.name || "Audit Event Webhook"),
              h("p", { key: "desc", className: "mt-1 leading-6 opacity-90" }, genericWebhookIntegration?.description || "Send selected audit events to a webhook URL you provide.")
            ]),
            h(Badge, { key: "status" }, webhookStatus?.enabled ? "enabled" : "disabled")
          ]),
          h("div", { key: "note", className: "mt-3 text-xs font-mono uppercase tracking-[0.18em] opacity-75" }, webhookStatus?.note || "Webhook status unavailable."),
          h("div", { key: "fields", className: "mt-4 grid gap-4" }, [
            ...getIntegrationCredentialFields(integrationRegistry, "generic_webhook").map((field) => renderIntegrationCredentialField("generic_webhook", field)),
            !webhookConfigured ? h("div", { key: "skip", className: "rounded-xl border border-border bg-card px-3 py-2 text-sm opacity-90" }, "Skip this unless another system gave you a webhook URL to receive audit events.") : null,
            h("div", { key: "events" }, [
              h("div", { key: "label", className: "mb-2 text-sm font-medium text-current" }, "Events To Send"),
              h("div", { key: "checks", className: "grid gap-2 sm:grid-cols-2" }, genericWebhookEventOptions.map(([value, label]) => h("label", { key: value, className: "flex items-center gap-2 rounded-xl border border-current/20 px-3 py-2" }, [
                h("input", {
                  key: "input",
                  type: "checkbox",
                  checked: (settings.integrations_json.generic_webhook_events || []).includes(value),
                  onChange: (event) => toggleListSetting("integrations_json", "generic_webhook_events", value, event.target.checked)
                }),
                h("span", { key: "label" }, label)
              ])))
            ])
          ])
        ])
      ])
    ]),
    h(Card, { key: "async-callback", title: "Job Completion Callback", description: "Optional callback URL for background job completion. Most users can leave this blank.", className: "border-border bg-card shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "completion-webhook", label: "Completion Callback URL" }, h(Input, {
          value: settings.integrations_json.completion_webhook_url || "",
          placeholder: "https://example.internal/hooks/job-complete",
          onChange: (event) => updateSettings("integrations_json", "completion_webhook_url", event.target.value || null)
        })),
        h(Field, { key: "endpoints", label: "Configured Runtime Endpoints" }, h(Textarea, {
          value: (settings.credentials_json.configured_endpoints || []).join("\n"),
          placeholder: "https://agent.example.internal\nhttp://localhost:3000",
          onChange: (event) => updateSettings("credentials_json", "configured_endpoints", event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean))
        }))
      ])
    ])
  ]);

  const artifactPreviewRows = artifactRetentionPreview?.removed || [];
  const artifactRetentionCanPrune = Boolean(artifactRetentionPreview && artifactRetentionPreview.removed_count > 0);
  const artifactRetentionActionNote = artifactRetentionPreview
    ? artifactRetentionCanPrune
      ? "Preview selected artifacts. Prune Now will permanently delete those local artifact directories."
      : `Nothing is old enough for the current ${artifactRetentionForm.older_than_days}-day policy. Lower Older Than Days or set a Max GB cap to select artifacts.`
    : "Run Preview Prune before deleting artifacts.";
  const settingsArtifactsPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "retention", title: "Artifact Retention", description: "Preview and prune local debug artifact directories. Persisted run records remain in SQLite." }, [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "count", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Entries"),
          h("div", { key: "value", className: "mt-1 text-xl font-semibold text-slate-950" }, String(artifactRetentionSummary?.scanned_count ?? 0))
        ]),
        h("div", { key: "size", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Size"),
          h("div", { key: "value", className: "mt-1 text-xl font-semibold text-slate-950" }, artifactRetentionSummary?.scanned_bytes == null ? "not measured" : formatBytes(artifactRetentionSummary.scanned_bytes))
        ]),
        h("div", { key: "oldest", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Oldest"),
          h("div", { key: "value", className: "mt-1 text-sm font-semibold text-slate-950" }, formatDate(artifactRetentionSummary?.oldest_updated_at))
        ]),
        h("div", { key: "root", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, "Root"),
          h("div", { key: "value", className: "mt-1 truncate text-sm font-semibold text-slate-950" }, artifactRetentionSummary?.root || ".artifacts")
        ])
      ]),
      h("div", { key: "controls", className: "mt-5 grid gap-4 md:grid-cols-3" }, [
        h(Field, { key: "kind", label: "Artifact Type" }, Select({
          value: artifactRetentionForm.kind,
          onChange: (event) => {
            setArtifactRetentionForm((current) => ({ ...current, kind: event.target.value }));
            setArtifactRetentionPreview(null);
          }
        }, [
          h("option", { key: "runs", value: "runs" }, "runs"),
          h("option", { key: "sandboxes", value: "sandboxes" }, "sandboxes"),
          h("option", { key: "all", value: "all" }, "all")
        ])),
        h(Field, { key: "days", label: "Older Than Days" }, h(Input, {
          type: "number",
          min: 1,
          value: artifactRetentionForm.older_than_days,
          onChange: (event) => {
            setArtifactRetentionForm((current) => ({ ...current, older_than_days: Math.max(1, Number(event.target.value || 1)) }));
            setArtifactRetentionPreview(null);
          }
        })),
        h(Field, { key: "max", label: "Max GB" }, h(Input, {
          type: "number",
          min: 0,
          step: "0.1",
          value: artifactRetentionForm.max_gb,
          placeholder: "optional",
          onChange: (event) => {
            setArtifactRetentionForm((current) => ({ ...current, max_gb: event.target.value }));
            setArtifactRetentionPreview(null);
          }
        }))
      ]),
      h("div", { key: "actions", className: "mt-5 flex flex-wrap items-center gap-3" }, [
        h(Button, { key: "summary", variant: "outline", onClick: () => loadArtifactRetentionSummary(true), disabled: artifactRetentionLoading }, artifactRetentionLoading ? "Measuring..." : "Measure Size"),
        h(Button, { key: "preview", onClick: previewArtifactRetention, disabled: artifactRetentionLoading }, artifactRetentionLoading ? "Previewing..." : "Preview Prune"),
        h(Button, {
          key: "prune",
          variant: "secondary",
          onClick: pruneArtifactRetention,
          disabled: artifactRetentionLoading || !artifactRetentionCanPrune
        }, artifactRetentionLoading ? "Working..." : "Prune Now")
      ]),
      h("div", {
        key: "action-note",
        className: cn("mt-2 text-sm", artifactRetentionCanPrune ? "text-slate-600" : "text-slate-500")
      }, artifactRetentionActionNote),
      artifactRetentionPreview
        ? h("div", { key: "preview", className: "mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4" }, [
          h("div", { key: "summary", className: "flex flex-wrap items-center justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "title", className: "font-medium text-slate-950" }, `${artifactRetentionPreview.removed_count} selected for pruning`),
              h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${formatBytes(artifactRetentionPreview.removed_bytes)} removable; ${artifactRetentionPreview.kept_count} kept`)
            ]),
            h(Badge, { key: "mode" }, artifactRetentionPreview.dry_run ? "preview" : "completed")
          ]),
          artifactPreviewRows.length
            ? h("div", { key: "rows", className: "mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200" }, artifactPreviewRows.slice(0, 50).map((item) => h("div", { key: `${item.kind}:${item.id}`, className: "grid gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[1fr_120px_160px]" }, [
              h("div", { key: "id", className: "min-w-0" }, [
                h("div", { key: "name", className: "truncate font-medium text-slate-900" }, `${item.kind}:${item.id}`),
                h("div", { key: "path", className: "truncate text-xs text-slate-500" }, item.path)
              ]),
              h("div", { key: "size", className: "text-slate-700" }, formatBytes(item.size_bytes)),
              h("div", { key: "reason", className: "text-xs text-slate-500" }, (item.prune_reasons || []).join(", "))
            ])))
            : h("div", { key: "empty", className: "mt-4 text-sm text-slate-500" }, "No artifacts match the current retention policy.")
        ])
        : null
    ])
  ]);

  const settingsPolicyPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "policy-pack", title: "Policy Pack", description: "Community Edition includes the built-in default policy pack. Policy-pack management is read-only in this edition." }, [
      h("div", { key: "summary", className: "rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 text-sm" }, [
        h("div", { key: "name", className: "font-medium text-foreground" }, defaultPolicyName),
        h("div", { key: "id", className: "mt-1 text-muted" }, `Pack id: ${defaultPolicyPack?.id || "default"}`),
        h("div", { key: "note", className: "mt-3 text-muted" }, "Community Edition does not support adding new policy packs or editing the default pack. Every run uses Default Audit Supervision.")
      ]),
      defaultPolicyObjectives.length
        ? h("div", { key: "objectives", className: "mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium text-foreground" }, "Objectives"),
          h("ul", { key: "list", className: "mt-2 space-y-1 text-muted" }, defaultPolicyObjectives.map((item, index) => h("li", { key: index }, "- " + item)))
        ])
        : null,
      defaultPolicyDecisionRules.length
        ? h("div", { key: "decisions", className: "mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium text-foreground" }, "Control Decision Rules"),
          h("ul", { key: "list", className: "mt-2 space-y-1 text-muted" }, defaultPolicyDecisionRules.map((item, index) => h("li", { key: index }, "- " + item)))
        ])
        : null,
      defaultPolicyPublicationRules.length
        ? h("div", { key: "publication", className: "mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm" }, [
          h("div", { key: "title", className: "font-medium text-foreground" }, "Publication Rules"),
          h("ul", { key: "list", className: "mt-2 space-y-1 text-muted" }, defaultPolicyPublicationRules.map((item, index) => h("li", { key: index }, "- " + item)))
        ])
        : null
    ])
  ]);

  const settingsProjectPanel = h("div", { className: "space-y-6" }, [
    h(Card, { key: "projects", title: "Projects", description: "Create and manage project containers. Each project has a target and selected Audit Type." }, [
      h("div", { key: "header", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h("div", { key: "count", className: "text-sm text-muted" }, `${projectOptions.length} project${projectOptions.length === 1 ? "" : "s"} in this Community Edition installation`),
        h(Button, { key: "new", onClick: () => setProjectCreateOpen(true) }, "New Project")
      ]),
      projectOptions.length ? h("div", { key: "list", className: "mt-4 overflow-hidden rounded-2xl border border-slate-200" }, [
        h("div", { key: "head", className: "hidden grid-cols-[1.15fr_1fr_1fr_0.7fr_0.9fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid" }, [
          h("div", { key: "project" }, "Project"),
          h("div", { key: "target" }, "Target"),
          h("div", { key: "audit" }, "Audit Type"),
          h("div", { key: "runs" }, "Runs"),
          h("div", { key: "last-run" }, "Last Run"),
          h("div", { key: "actions", className: "text-right" }, "Actions")
        ]),
        h("div", { key: "rows", className: "divide-y divide-slate-200" }, projectOptions.map((project) => {
        const defaults = project.target_defaults_json || {};
        const targetKind = inferTargetKind(defaults);
        const targetValue = targetKind === "repo" ? defaults.repo_url : defaults.local_path;
        const auditType = defaults.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static";
        const persistedRunStats = project.run_stats || null;
        const localRunStats = projectRunStats[project.id] || { runs: 0, openReviews: 0, scoreTotal: 0, scoreCount: 0, lastRunAt: "" };
        const selected = selectedProject?.id === project.id;
        const runStats = persistedRunStats
          ? {
            runs: Number(persistedRunStats.runs || 0),
            openReviews: Number(persistedRunStats.open_reviews || 0),
            averageScore: Number(persistedRunStats.average_score),
            lastRunAt: persistedRunStats.last_run_at || ""
          }
          : {
            runs: localRunStats.runs,
            openReviews: localRunStats.openReviews,
            averageScore: localRunStats.scoreCount ? localRunStats.scoreTotal / localRunStats.scoreCount : NaN,
            lastRunAt: localRunStats.lastRunAt
          };
        const averageProjectScore = Number.isFinite(runStats.averageScore) ? runStats.averageScore.toFixed(1) : "";
        return h("div", {
          key: project.id,
          className: cn("grid cursor-pointer gap-3 px-4 py-4 transition hover:bg-slate-50 md:grid-cols-[1.15fr_1fr_1fr_0.7fr_0.9fr_auto]", selected ? "bg-slate-50" : "bg-white"),
          onClick: () => setSelectedProjectId(project.id)
        }, [
          h("div", { key: "identity" }, [
            h("div", { key: "mobile-label", className: "mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden" }, "Project"),
            h("div", { key: "name", className: "font-semibold text-slate-950" }, `${project.name} (${project.id})`),
            h("div", { key: "description", className: "mt-1 text-sm text-muted" }, project.description || "No description")
          ]),
          h("div", { key: "target", className: "text-sm" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500 md:hidden" }, "Target"),
            h("div", { key: "kind", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500" }, targetKind),
            h("div", { key: "value", className: "mt-1 text-slate-900" }, targetValue || `${targetKind} target not set`)
          ]),
          h("div", { key: "config", className: "text-sm" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500 md:hidden" }, "Audit Type"),
            h("div", { key: "value", className: "mt-1 text-slate-900" }, visibleAuditPackages.find((item) => item.id === auditType)?.title || auditType)
          ]),
          h("div", { key: "runs", className: "text-sm" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500 md:hidden" }, "Runs"),
            h("div", { key: "count", className: "mt-1 font-medium text-slate-900" }, String(runStats.runs)),
            runStats.openReviews
              ? h("div", { key: "reviews", className: "mt-1 text-xs text-amber-700" }, `${runStats.openReviews} open review${runStats.openReviews === 1 ? "" : "s"}`)
              : null,
            averageProjectScore
              ? h("div", { key: "score", className: "mt-1 text-xs text-muted" }, `avg score ${averageProjectScore}`)
              : null
          ]),
          h("div", { key: "last-run", className: "text-sm" }, [
            h("div", { key: "label", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500 md:hidden" }, "Last Run"),
            h("div", { key: "value", className: "mt-1 text-slate-900" }, runStats.lastRunAt ? formatDate(runStats.lastRunAt) : "No runs")
          ]),
          h("div", { key: "actions", className: "flex items-center justify-end gap-2" }, [
            h(Button, {
              key: "edit",
              variant: "outline",
              onClick: (event) => {
                event.stopPropagation();
                openProjectEditor(project);
              }
            }, "Edit")
          ])
        ]);
      }))
      ]) : h("div", { key: "empty", className: "mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-muted" }, "No projects yet. The built-in Default Project is available for launches."),
      h(Modal, {
        key: "create-modal",
        open: projectCreateOpen,
        title: "New Project",
        description: "Create the project identity, target, and selected Audit Type.",
        onClose: () => setProjectCreateOpen(false),
        size: "lg"
      }, h("div", { className: "space-y-4" }, [
        h(Field, { key: "name", label: "Project Name" }, h(Input, { value: projectForm.name, onChange: (event) => updateProjectForm("name", event.target.value) })),
        h(Field, { key: "description", label: "Description" }, h(Input, { value: projectForm.description, onChange: (event) => updateProjectForm("description", event.target.value) })),
        h("div", { key: "target", className: "grid gap-4 md:grid-cols-2" }, [
          h(Field, { key: "kind", label: "Target Source" }, Select({ value: projectForm.target_kind === "repo" ? "repo" : "path", onChange: (event) => updateProjectForm("target_kind", event.target.value) }, [
            h("option", { key: "path", value: "path" }, "local path"),
            h("option", { key: "repo", value: "repo" }, "repo url")
          ])),
          projectForm.target_kind === "repo"
            ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, { value: projectForm.repo_url, onChange: (event) => updateProjectForm("repo_url", event.target.value) }))
            : h(Field, { key: "path", label: "Local Path" }, h(Input, { value: projectForm.local_path, onChange: (event) => updateProjectForm("local_path", event.target.value) }))
        ]),
        h(Field, { key: "audit-type", label: "Audit Type" }, Select({
          value: projectForm.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static",
          onChange: (event) => updateProjectForm("audit_package", event.target.value)
        }, visibleAuditPackages.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} (${item.id})`)))),
        h("div", { key: "actions", className: "flex justify-end gap-3 pt-2" }, [
          h(Button, { key: "cancel", variant: "outline", onClick: () => setProjectCreateOpen(false) }, "Cancel"),
          h(Button, { key: "create", onClick: createProject, disabled: !projectForm.name.trim() }, "Create Project")
        ])
      ]))
    ]),
    h(Card, {
      key: "project-activity",
      title: selectedProject ? `${selectedProject.name} Activity` : "Project Activity",
      description: "Scoped project context. The main Audits and Findings pages remain the full operational views and can add their own project filters."
    }, selectedProject ? [
      h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
        h("div", { key: "id", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" }, "Project"),
          h("div", { key: "value", className: "mt-1 font-medium text-slate-950" }, selectedProject.id)
        ]),
        h("div", { key: "audit", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" }, "Audit Type"),
          h("div", { key: "value", className: "mt-1 font-medium text-slate-950" }, visibleAuditPackages.find((item) => item.id === (selectedProject.target_defaults_json?.audit_package || ""))?.title || selectedProject.target_defaults_json?.audit_package || "baseline-static")
        ]),
        h("div", { key: "runs", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" }, "Loaded Runs"),
          h("div", { key: "value", className: "mt-1 font-medium text-slate-950" }, projectDetailLoading ? "Loading" : String(selectedProjectRuns.length))
        ]),
        h("div", { key: "reviews", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "label", className: "text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" }, "Open Findings"),
          h("div", { key: "value", className: "mt-1 font-medium text-slate-950" }, projectDetailLoading ? "Loading" : String(selectedProjectReviews.length))
        ])
      ]),
      h("div", { key: "activity-grid", className: "mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]" }, [
        h("div", { key: "runs" }, [
          h("div", { key: "header", className: "mb-3 flex items-center justify-between gap-3" }, [
            h("div", { key: "title", className: "font-semibold text-slate-950" }, "Recent Audits"),
            h(Button, {
              key: "refresh",
              variant: "outline",
              onClick: () => loadProjectRuns(selectedProject.id)
            }, "Refresh")
          ]),
          projectDetailLoading
            ? h("div", { key: "loading", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted" }, "Loading project runs...")
            : h(RunsTable, {
              key: "table",
              runs: selectedProjectRuns.slice(0, 8),
              selectedRunId,
              onSelect: (runId) => {
                setSelectedRunId(runId);
                setView("runs");
              }
            })
        ]),
        h("div", { key: "reviews" }, [
          h("div", { key: "title", className: "mb-3 font-semibold text-slate-950" }, "Project Reviews"),
          selectedProjectReviews.length
            ? h(RunInboxList, {
              key: "list",
              runs: selectedProjectReviews.slice(0, 6),
              selectedRunId,
              onSelect: (runId) => {
                setSelectedRunId(runId);
                setView("findings");
              }
            })
            : h("div", { key: "empty", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted" }, "No open reviews for this project.")
        ])
      ])
    ] : h("div", { className: "text-sm text-muted" }, "Select a project to inspect recent activity.")),
    h(Modal, {
      key: "edit-modal",
      open: projectEditOpen,
      title: "Edit Project",
      description: "Update the project identity, target, and selected Audit Type.",
      onClose: () => setProjectEditOpen(false),
      size: "lg"
    }, projectEditor.id ? h("div", { className: "space-y-4" }, [
      h("div", { key: "details", className: "grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "name", label: "Project Name" }, h(Input, { value: projectEditor.name, onChange: (event) => updateProjectEditor("name", event.target.value) })),
        h(Field, { key: "description", label: "Description" }, h(Input, { value: projectEditor.description, onChange: (event) => updateProjectEditor("description", event.target.value) })),
        h(Field, { key: "target-kind", label: "Target Source" }, Select({ value: projectEditor.target_kind === "repo" ? "repo" : "path", onChange: (event) => updateProjectEditor("target_kind", event.target.value) }, [
          h("option", { key: "path", value: "path" }, "local path"),
          h("option", { key: "repo", value: "repo" }, "repo url")
        ])),
        projectEditor.target_kind === "repo"
          ? h(Field, { key: "repo", label: "Repository URL" }, h(Input, { value: projectEditor.repo_url, onChange: (event) => updateProjectEditor("repo_url", event.target.value) }))
          : h(Field, { key: "path", label: "Local Path" }, h(Input, { value: projectEditor.local_path, onChange: (event) => updateProjectEditor("local_path", event.target.value) }))
      ]),
      h("div", { key: "audit-type", className: "mt-6 grid gap-4 md:grid-cols-2" }, [
        h(Field, { key: "package", label: "Audit Type" }, Select({
          value: projectEditor.audit_package || effectiveSettings.effective.audit_defaults_json?.audit_package || "baseline-static",
          onChange: (event) => updateProjectEditor("audit_package", event.target.value)
        }, visibleAuditPackages.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} (${item.id})`)))),
        h("div", { key: "note", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-muted" }, "Projects select an Audit Type methodology. Edit Audit Type details in Settings -> Audit Type; agent model defaults stay in Agent Configuration.")
      ]),
      h("div", { key: "actions", className: "flex justify-end gap-3 pt-2" }, [
        h(Button, { key: "cancel", variant: "outline", onClick: () => setProjectEditOpen(false) }, "Cancel"),
        h(Button, { key: "save", onClick: saveProjectEditor, disabled: !projectEditor.name.trim() }, "Save Project")
      ])
    ]) : h("div", { className: "text-sm text-muted" }, "Select a project to edit."))
  ]);

  const settingsDocumentsPanel = h("div", { className: "space-y-6" }, [
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
  ]);

  const governanceTabs = [
    { id: "gates", label: "Gates" },
    { id: "policy", label: "Policy Packs" },
    { id: "documents", label: "Reference Documents" }
  ];
  const governanceTabContent = {
    gates: settingsReviewPanel,
    policy: settingsPolicyPanel,
    documents: settingsDocumentsPanel
  }[governanceTab] || settingsReviewPanel;
  const settingsGovernancePanel = h("div", { className: "space-y-6" }, [
    h("div", { key: "content" }, governanceTabContent)
  ]);

  const activeSettingsNavItem = settingsNavItems.find((item) => item.id === settingsSubpage) || settingsNavItems[0];
  const settingsHeaderTabs = settingsSubpage === "governance"
    ? h("div", { key: "tabs", className: "flex flex-wrap gap-2" }, governanceTabs.map((tab) => h("button", {
      key: tab.id,
      type: "button",
      onClick: () => setGovernanceTab(tab.id),
      className: cn(
        "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
        governanceTab === tab.id
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )
    }, tab.label)))
    : h("div", { key: "spacer" });
  const settingsPageHeader = h("div", { key: "settings-header", className: "sticky top-0 z-30 -mx-6 bg-white px-6 pt-6" }, [
    h("div", { key: "head", className: "pb-7" }, [
      h("div", { key: "copy" }, [
        h("h2", { key: "title", className: "text-lg font-semibold text-slate-950" }, activeSettingsNavItem.label),
        h("p", { key: "description", className: "mt-1 text-sm text-slate-500" }, activeSettingsNavItem.description)
      ])
    ]),
    h("div", { key: "action-row", className: "flex flex-col gap-3 border-b border-slate-200 pb-4 shadow-[0_10px_18px_-18px_rgba(15,23,42,0.45)] md:flex-row md:items-center md:justify-between" }, [
      settingsHeaderTabs,
      h(Button, { key: "save", onClick: saveSettings }, "Save Settings")
    ])
  ]);

  const settingsSubpageContent = {
    llm: settingsLlmPanel,
    "learning-settings": settingsLearningPanel,
    "static-tools": settingsStaticToolsPanel,
    audit: settingsAuditPanel,
    governance: settingsGovernancePanel,
    integrations: settingsIntegrationsPanel,
    artifacts: settingsArtifactsPanel
  }[settingsSubpage] || settingsAuditPanel;

  const settingsView = h("section", { className: "h-[calc(100vh-11rem)] min-h-0 overflow-hidden rounded-3xl border border-slate-200 bg-white xl:grid xl:grid-cols-[220px_minmax(0,1fr)]" }, [
    h("aside", { key: "settings-nav", className: "min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/80 px-4 py-5 xl:border-b-0 xl:border-r" }, [
      h("div", { key: "groups", className: "space-y-6" }, [
        h("div", { key: "group" }, [
          h("div", { key: "label", className: "px-2 text-xs font-medium text-slate-400" }, "Settings"),
          h("nav", { key: "nav", className: "mt-3 grid gap-1.5" }, settingsNavItems.map((item) => h("button", {
              key: item.id,
              type: "button",
              onClick: () => setSettingsSubpage(item.id),
              className: cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                settingsSubpage === item.id
                  ? "bg-slate-100 font-semibold text-slate-950"
                  : "text-slate-700 hover:bg-slate-50"
              )
            }, [
              h("span", { key: "dot", className: cn("h-2.5 w-2.5 rounded-full", settingsSubpage === item.id ? "bg-slate-900" : "bg-slate-300") }),
              h("span", { key: "text" }, item.label)
            ])))
        ])
      ])
    ]),
    h("div", { key: "panel", ref: systemPanelScrollRef, className: "min-h-0 min-w-0 overflow-y-auto bg-white px-6 pb-6", style: { overflowAnchor: "none" } }, [
      settingsPageHeader,
      h("div", { key: "content", className: "mt-6" }, settingsSubpageContent)
    ])
  ]);

  const toolsSystemPanel = h("div", { className: "space-y-6" }, [
    settingsStaticToolsPanel,
  ]);
  const auditConfigurationSystemPanel = h("div", { className: "space-y-6" }, [
    settingsAuditPanel,
    methodologyAdminPanel
  ]);
  const dataMaintenanceSystemPanel = h("div", { className: "space-y-6" }, [
    adminSystemPanel,
    settingsArtifactsPanel
  ]);
  const systemFeaturePanels = {
    "audit-configuration": auditConfigurationSystemPanel,
    agents: settingsLlmPanel,
    "runtime-sandbox": adminRuntimeSandboxPanel,
    tools: toolsSystemPanel,
    policy: settingsGovernancePanel,
    integrations: settingsIntegrationsPanel,
    artifacts: settingsArtifactsPanel,
    "self-learning-settings": settingsLearningPanel,
    benchmarks: adminBenchmarkPanel,
    validation: adminValidationPanel,
    observability: adminObservabilityPanel,
    jobs: jobsView,
    data: dataMaintenanceSystemPanel
  };
  const systemSettingsSubpageMap = {
    "audit-configuration": "audit",
    agents: "llm",
    tools: "static-tools",
    policy: "governance",
    integrations: "integrations",
    artifacts: "artifacts",
    "self-learning-settings": "learning-settings",
    data: "artifacts"
  };
  const systemAdminSubpageMap = {
    "audit-configuration": "methodology",
    "runtime-sandbox": "runtime-sandbox",
    tools: "tooling",
    benchmarks: "benchmarks",
    validation: "validation",
    observability: "observability",
    data: "system"
  };
  const systemFeatureItems = [
    { id: "runtime-sandbox", group: "setup", label: "Runtime Sandbox", description: "Local runtime readiness, backend policy, resource limits, and setup guidance.", status: runtimeSandboxReadiness.status === "ready" ? "Ready" : runtimeSandboxReadiness.status === "ready_with_warnings" ? "Warning" : "Needs setup", settings: false },
    { id: "tools", group: "setup", label: "Tools", description: "Scorecard, Semgrep, Trivy, static tool readiness, and tool-control mapping.", status: staticToolsReadiness.status === "ready" ? "Ready" : staticToolsReadiness.status === "blocked" ? "Blocked" : "Warning", settings: true },
    { id: "integrations", group: "setup", label: "Integrations", description: "Outbound delivery, repository integration, webhooks, and connector settings.", status: "Optional", settings: true },
    { id: "audit-configuration", group: "audit-behavior", label: "Audit Configuration", description: "Audit type defaults, run shape, methodology, lanes, and built-in controls.", status: "Configured", settings: true },
    { id: "agents", group: "audit-behavior", label: "Agents & Models", description: "Default models, credentials, assistant routing, and agent-specific overrides.", status: settingsProviderCredentialStatus.configured ? "Ready" : "Needs setup", settings: true },
    { id: "policy", group: "audit-behavior", label: "Policy", description: "Review gates, policy packs, reference documents, and governance settings.", status: "Configured", settings: true },
    { id: "artifacts", group: "audit-behavior", label: "Artifacts & Exports", description: "Export behavior, report-related settings, artifact retention, and pruning.", status: "Configured", settings: true },
    { id: "self-learning-settings", group: "quality", label: "Self-Learning Settings", description: "Learning triggers, thresholds, LLM synthesis, and promotion guardrails.", status: learningSettings.enabled === false ? "Off" : "On", settings: true },
    { id: "benchmarks", group: "quality", label: "Benchmarks", description: "Product benchmark suite execution, report history, and baseline comparison.", status: benchmarkReports.length ? `${benchmarkReports.length} reports` : "Ready", settings: false },
    { id: "validation", group: "quality", label: "Validation Suite", description: "Installation, static audit, and benchmark smoke checks.", status: "Ready", settings: false },
    { id: "observability", group: "operations", label: "Observability", description: "Agent traces, QA checks, tool executions, handoffs, and troubleshooting evidence.", status: observabilityTraceLoading ? "Loading" : "Ready", settings: false },
    { id: "jobs", group: "operations", label: "Jobs", description: "Durable background work, retries, cancellations, and completed run links.", status: jobs.some(isActiveAsyncJob) ? `${jobs.filter(isActiveAsyncJob).length} active` : "Idle", settings: false },
    { id: "data", group: "data", label: "Data & Maintenance", description: "Local data refresh, retained artifacts, cleanup previews, storage, and maintenance controls.", status: globalSyncLoading ? "Refreshing" : "Ready", settings: true }
  ];
  const systemFeatureById = Object.fromEntries(systemFeatureItems.map((item) => [item.id, item]));
  const systemDefaultSubpageByGroup = {
    setup: "runtime-sandbox",
    "audit-behavior": "audit-configuration",
    quality: "self-learning-settings",
    operations: "observability",
    data: "data"
  };
  const systemGroups = [
    { id: "setup", label: "Setup", description: "Installation readiness, local runtime, tools, and integrations." },
    { id: "audit-behavior", label: "Audit Behavior", description: "How audits run, which models agents use, and which policies apply." },
    { id: "quality", label: "Quality & Improvement", description: "Product validation, benchmarks, and governed self-learning controls." },
    { id: "operations", label: "Operations", description: "Runtime jobs, traces, failures, handoffs, and troubleshooting evidence." },
    { id: "data", label: "Data", description: "Local state, retained artifacts, cleanup, and maintenance." }
  ];
  const systemGroupById = Object.fromEntries(systemGroups.map((item) => [item.id, item]));
  const activeSystemFeature = systemFeatureById[systemSubpage] || null;
  const activeSystemGroupId = activeSystemFeature?.group || (systemGroupById[systemSubpage] ? systemSubpage : "setup");
  const activeSystemGroup = systemGroupById[activeSystemGroupId] || systemGroups[0];
  const systemScrollKeyForSubpage = (subpageId, tabId = governanceTab) => (
    subpageId === "policy" ? `page:${subpageId}:policy:${tabId}` : `page:${subpageId}`
  );
  const saveCurrentSystemScroll = (options = {}) => {
    const container = systemPanelScrollRef.current;
    const currentKey = systemScrollKeyRef.current;
    if (!options.force && systemScrollSaveSuspendedRef.current) return;
    if (container && currentKey) {
      systemScrollPositionsRef.current[currentKey] = container.scrollTop;
    }
  };
  const prepareSystemTabChange = (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (systemScrollSaveSuspendedRef.current) return;
    saveCurrentSystemScroll({ force: true });
    systemScrollSaveSuspendedRef.current = true;
    window.setTimeout(() => {
      systemScrollSaveSuspendedRef.current = false;
    }, 600);
  };
  const restoreSystemScroll = (key) => {
    const nextTop = Number(systemScrollPositionsRef.current[key] || 0);
    const restore = () => {
      if (systemPanelScrollRef.current) {
        systemPanelScrollRef.current.scrollTop = nextTop;
      }
    };
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
      window.setTimeout(restore, 50);
      window.setTimeout(() => {
        restore();
        systemScrollSaveSuspendedRef.current = false;
      }, 150);
    });
  };
  const changeSystemSubpage = (subpageId) => {
    const resolvedSubpageId = systemDefaultSubpageByGroup[subpageId] || subpageId;
    saveCurrentSystemScroll();
    setSystemSubpage(resolvedSubpageId);
    if (systemSettingsSubpageMap[resolvedSubpageId]) setSettingsSubpage(systemSettingsSubpageMap[resolvedSubpageId]);
    if (systemAdminSubpageMap[resolvedSubpageId]) setAdminSubpage(systemAdminSubpageMap[resolvedSubpageId]);
    restoreSystemScroll(systemScrollKeyForSubpage(resolvedSubpageId));
  };
  const systemInnerTabs = systemFeatureItems.filter((item) => item.group === activeSystemGroupId);
  const systemGroupTabs = systemInnerTabs.length > 1
    ? h("div", { key: "group-tabs", className: "flex flex-wrap gap-2" }, systemInnerTabs.map((tab) => h("button", {
      key: tab.id,
      type: "button",
      onPointerDownCapture: prepareSystemTabChange,
      onMouseDownCapture: prepareSystemTabChange,
      onMouseDown: prepareSystemTabChange,
      onClick: () => changeSystemSubpage(tab.id),
      style: systemSubpage === tab.id ? {
        backgroundColor: "#2563eb",
        border: "1px solid #60a5fa",
        color: "#ffffff"
      } : undefined,
      className: cn(
        "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        systemSubpage === tab.id
          ? "system-tab-active shadow-sm"
          : "border border-border bg-card text-muted hover:border-blue-500/50 hover:text-foreground"
      )
    }, tab.label)))
    : h("div", { key: "spacer" });
  const policyTabs = systemSubpage === "policy"
    ? h("div", { key: "tabs", className: "flex flex-wrap gap-2" }, governanceTabs.map((tab) => h("button", {
      key: tab.id,
      type: "button",
      onPointerDownCapture: prepareSystemTabChange,
      onMouseDownCapture: prepareSystemTabChange,
      onMouseDown: prepareSystemTabChange,
      onClick: () => {
        saveCurrentSystemScroll();
        setGovernanceTab(tab.id);
        restoreSystemScroll(systemScrollKeyForSubpage("policy", tab.id));
      },
      style: governanceTab === tab.id ? {
        backgroundColor: "#2563eb",
        border: "1px solid #60a5fa",
        color: "#ffffff"
      } : undefined,
      className: cn(
        "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        governanceTab === tab.id
          ? "system-tab-active shadow-sm"
          : "border border-border bg-card text-muted hover:border-blue-500/50 hover:text-foreground"
      )
    }, tab.label)))
    : h("div", { key: "spacer" });
  const visibleSystemNavItem = activeSystemGroup;
  const systemSubpageContent = activeSystemFeature
    ? systemFeaturePanels[activeSystemFeature.id] || adminSystemPanel
    : systemFeaturePanels["runtime-sandbox"] || adminSystemPanel;
  const systemCanSave = Boolean(activeSystemFeature?.settings);
  const systemView = h("section", { className: "h-[calc(100vh-11rem)] min-h-0 overflow-hidden rounded-3xl border border-slate-200 bg-white xl:grid xl:grid-cols-[260px_minmax(0,1fr)]" }, [
    h("aside", { key: "system-nav", className: "min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/80 px-4 py-5 xl:border-b-0 xl:border-r" }, [
      h("div", { key: "label", className: "px-2 text-xs font-medium text-slate-400" }, "System"),
      h("nav", { key: "nav", className: "mt-4 grid gap-1.5" }, systemGroups.map((item) => h("button", {
        key: item.id,
        type: "button",
        onPointerDownCapture: prepareSystemTabChange,
        onMouseDownCapture: prepareSystemTabChange,
        onMouseDown: prepareSystemTabChange,
        onClick: () => changeSystemSubpage(item.id),
        className: cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
          activeSystemGroupId === item.id
            ? "bg-slate-100 font-semibold text-slate-950"
            : "text-slate-700 hover:bg-slate-50"
        )
      }, [
        h("span", { key: "dot", className: cn("h-2.5 w-2.5 rounded-full", activeSystemGroupId === item.id ? "bg-slate-900" : "bg-slate-300") }),
        h("span", { key: "text" }, item.label)
      ])))
    ]),
    h("div", { key: "panel", className: "flex min-h-0 min-w-0 flex-col bg-white" }, [
      h("div", { key: "system-header", className: "border-b border-slate-200 bg-white px-6 pt-6" }, [
        h("div", { key: "head", className: "pb-7" }, [
          h("h2", { key: "title", className: "text-lg font-semibold text-slate-950" }, visibleSystemNavItem.label),
          h("p", { key: "description", className: "mt-1 text-sm text-slate-500" }, visibleSystemNavItem.description)
        ]),
        h("div", { key: "action-row", className: "flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between" }, [
          systemGroupTabs,
          systemCanSave ? h(Button, { key: "save", onClick: saveSettings }, "Save Settings") : h("div", { key: "no-save" })
        ]),
        systemSubpage === "policy" ? h("div", { key: "policy-tabs", className: "border-t border-slate-200 py-3" }, policyTabs) : null
      ]),
      h("div", { key: "content-scroll", ref: systemPanelScrollRef, className: "min-h-0 flex-1 overflow-y-auto px-6 pb-6", style: { overflowAnchor: "none" } }, [
        h("div", { key: `content:${systemScrollKey}`, className: "mt-6" }, systemSubpageContent)
      ])
    ])
  ]);

  const projectsView = settingsProjectPanel;

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
          onClick: () => setLaunchModalOpen(true),
          className: "flex flex-1 items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-700"
        }, [
          h(SidebarIcon, { key: "icon", kind: "plus" }),
          h("span", { key: "label" }, "Quick Create")
        ]),
        h("button", {
          key: "mail",
          type: "button",
          onClick: () => setView("findings"),
          className: "flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-slate-700 hover:bg-slate-50"
        }, h(SidebarIcon, { kind: "mail" })),
        h("button", {
          key: "theme",
          type: "button",
          onClick: () => setTheme((current) => current === "dark" ? "light" : "dark"),
          className: "flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-slate-700 hover:bg-slate-50",
          title: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
          "aria-label": theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
          "data-testid": "theme-toggle"
        }, h(SidebarIcon, { kind: theme === "dark" ? "sun" : "moon" }))
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
        h("div", { key: "scope", className: "font-medium text-slate-700" }, `Project: ${requestContext.projectId}`),
        h("div", { key: "desc", className: "mt-1" }, pageDescriptions[view] || "Focused audit console for operating the harness.")
      ])
    ]),
    h("main", { key: "main", className: view === "runs" ? "min-w-0 h-screen overflow-hidden" : "px-5 py-6 lg:px-8" }, [
      launchModalOverlay,
      view !== "runs" ? h("header", { key: "header", className: "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" }, [
        h("div", { key: "heading" }, [
          h("h2", { key: "title", className: "text-3xl font-semibold tracking-tight text-slate-950" }, navItems.find(([item]) => item === view)?.[1] || "Dashboard"),
          h("p", { key: "desc", className: "mt-1 text-sm text-slate-500" }, pageDescriptions[view] || "Focused audit console for operating the harness.")
        ]),
        h("div", { key: "actions", className: "flex items-center gap-3" }, [
          h("div", { key: "status", className: "hidden flex-wrap gap-2 md:flex" }, [
            h(Badge, { key: "auth" }, authInfo.trusted_mode ? "trusted_local" : authInfo.auth_mode || "authenticated")
          ])
        ])
      ]) : null,
      error ? h("div", { key: "error", className: cn(view === "runs" ? "m-4" : "mt-6", "rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700") }, error) : null,
      notice ? h("div", { key: "notice", className: cn(view === "runs" ? "m-4" : "mt-6", "rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700") }, notice) : null,
      h(ViewErrorBoundary, {
        key: `view:${view}`,
        resetKey: `${view}:${selectedRunId || ""}:${selectedRuntimeFollowupId || ""}`
      }, h("div", { key: "view", className: view === "runs" || view === "settings" || view === "system" ? "" : "mt-6" }, view === "dashboard"
        ? dashboard
        : view === "projects"
          ? projectsView
        : view === "runs"
          ? runsView
          : view === "findings"
            ? reviewsView
          : view === "remediation"
            ? runtimeFollowupsView
          : view === "jobs"
            ? jobsView
            : view === "followups"
              ? runtimeFollowupsView
              : view === "learning"
                ? learningView
              : view === "reviews"
                ? reviewsView
                : view === "system"
                  ? systemView
                : view === "admin"
                  ? adminView
                  : settingsView))
    ])
  ]);
}

createRoot(document.getElementById("root")).render(h(App));


