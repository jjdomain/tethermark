const React = window.React;
const h = React.createElement;

function computeTargetValue(runForm) {
  if (runForm.target_kind === "repo") return runForm.repo_url || "";
  if (runForm.target_kind === "endpoint") return runForm.endpoint_url || "";
  return runForm.local_path || "";
}

function getCurrentTargetSummary(runForm) {
  if (runForm.target_kind === "repo") return runForm.repo_url || "No repository URL selected";
  if (runForm.target_kind === "endpoint") return runForm.endpoint_url || "No endpoint URL selected";
  return runForm.local_path || "No local path selected";
}

function normalizePolicyPackId(policyPackId) {
  return policyPackId || "default";
}

function getPolicyPackLabel(policyPacks, policyPackId) {
  const effectiveId = normalizePolicyPackId(policyPackId);
  const match = (policyPacks || []).find((item) => item.id === effectiveId);
  return match ? match.name : (effectiveId === "default" ? "Default built-in policy" : `${effectiveId} (custom)`);
}

function getResolvedModelLabel(runModelOptions, providerId, modelId) {
  if (!modelId) return "";
  const match = (runModelOptions || []).find((item) => item.provider_id === providerId && item.id === modelId)
    || (runModelOptions || []).find((item) => item.id === modelId);
  return match?.label || modelId;
}

function getLaunchPlanModelLabel(runForm, runModelOptions) {
  const usingGlobalLlmConfig = runForm.use_global_llm_config !== false && Boolean(runForm.llm_model);
  if (usingGlobalLlmConfig) {
    return getResolvedModelLabel(runModelOptions, runForm.llm_provider, runForm.llm_model) || "Not selected";
  }
  const configuredAgentModels = agentConfigCatalog
    .map((agent) => {
      const config = runForm.agent_configs?.[agent.id] || {};
      return getResolvedModelLabel(runModelOptions, config.provider, config.model);
    })
    .filter(Boolean);
  const uniqueLabels = [...new Set(configuredAgentModels)];
  if (!uniqueLabels.length) return "Not selected";
  if (uniqueLabels.length === 1) return uniqueLabels[0];
  return "Mixed";
}

const auditLaneCatalog = [
  { id: "repo_posture", title: "Repository posture", summary: "Repository hygiene, maintainer practices, and governance signals." },
  { id: "supply_chain", title: "Supply chain", summary: "Dependency, CI/CD, provenance, and workflow integrity analysis." },
  { id: "agentic_controls", title: "Agentic controls", summary: "Tool-use safety, MCP exposure, and autonomy boundaries." },
  { id: "data_exposure", title: "Data exposure", summary: "Secrets, logging leakage, model I/O, and sensitive data handling." },
  { id: "runtime_validation", title: "Runtime validation", summary: "Bounded build, runtime, and deeper validation checks." }
];

const frameworkCatalog = [
  "OpenSSF Scorecard",
  "SLSA",
  "NIST SSDF",
  "OWASP LLM Applications",
  "OWASP Agentic Applications",
  "MITRE ATLAS",
  "NIST AI RMF",
  "NIST SP 800-218A",
  "Harness Internal Controls"
];

const controlCatalog = [
  { id: "openssf.security_policy", framework: "OpenSSF Scorecard", title: "Publish a security policy" },
  { id: "openssf.dependency_update_tool", framework: "OpenSSF Scorecard", title: "Automate dependency update hygiene" },
  { id: "openssf.pinned_dependencies", framework: "OpenSSF Scorecard", title: "Pin or lock dependencies" },
  { id: "openssf.token_permissions", framework: "OpenSSF Scorecard", title: "Minimize workflow token permissions" },
  { id: "openssf.dangerous_workflow", framework: "OpenSSF Scorecard", title: "Avoid dangerous workflow patterns" },
  { id: "openssf.branch_protection", framework: "OpenSSF Scorecard", title: "Protect main development branches" },
  { id: "slsa.pinned_build_dependencies", framework: "SLSA", title: "Pin CI/CD build dependencies" },
  { id: "slsa.provenance", framework: "SLSA", title: "Produce verifiable build provenance" },
  { id: "nist_ssdf.disclosure_process", framework: "NIST SSDF", title: "Establish a disclosure and response process" },
  { id: "nist_ssdf.automated_security_checks", framework: "NIST SSDF", title: "Use automated security checks in development workflows" },
  { id: "owasp_llm.prompt_injection_guardrails", framework: "OWASP LLM Applications", title: "Implement prompt and tool-use guardrails" },
  { id: "owasp_llm.sensitive_information_disclosure", framework: "OWASP LLM Applications", title: "Prevent sensitive information disclosure" },
  { id: "owasp_agentic.tool_misuse_boundary", framework: "OWASP Agentic Applications", title: "Bound agent tool use" },
  { id: "mitre_atlas.tool_misuse_mitigation", framework: "MITRE ATLAS", title: "Mitigate AI-enabled tool misuse paths" },
  { id: "harness_internal.audit_traceability", framework: "Harness Internal Controls", title: "Preserve audit traceability signals" },
  { id: "harness_internal.security_logging", framework: "Harness Internal Controls", title: "Expose security-relevant logging or monitoring markers" },
  { id: "harness_internal.eval_harness_presence", framework: "Harness Internal Controls", title: "Expose eval or validation harness markers" },
  { id: "harness_internal.architecture_evidence", framework: "Harness Internal Controls", title: "Provide architecture or system-context evidence" }
];

function parseControlIdText(value) {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function frameworkForControlId(controlId) {
  return controlCatalog.find((control) => control.id === controlId)?.framework || null;
}

function stripRedundantControlIds(controlIds, frameworkIds) {
  const frameworkSet = new Set(Array.isArray(frameworkIds) ? frameworkIds : []);
  return controlIds.filter((controlId) => {
    const framework = frameworkForControlId(controlId);
    return !framework || !frameworkSet.has(framework);
  });
}

const agentConfigCatalog = [
  { id: "planner_agent", title: "Planner Agent", env_prefix: "AUDIT_LLM_PLANNER", help: "Builds the initial audit scope, semantic target classification, and standards/control plan for the run." },
  { id: "threat_model_agent", title: "Threat Model Agent", env_prefix: "AUDIT_LLM_THREAT_MODEL", help: "Translates repo and target signals into attack surfaces, trust boundaries, abuse cases, and framework focus areas." },
  { id: "eval_selection_agent", title: "Evidence Selection Agent", env_prefix: "AUDIT_LLM_EVAL_SELECTION", help: "Chooses which tools, evals, and evidence providers should be used to assess the controls selected by the planner." },
  { id: "lane_specialist_agent", title: "Audit Area Review Agent", env_prefix: "AUDIT_LLM_LANE_SPECIALIST", help: "Runs an optional specialist pass on one audit area, such as supply chain or data exposure, to produce tighter observations and report-ready summaries." },
  { id: "audit_supervisor_agent", title: "Supervisor Agent", env_prefix: "AUDIT_LLM_SUPERVISOR", help: "Acts as the audit QA reviewer. It checks evidence sufficiency, finding quality, and whether reruns or downgrades are needed." },
  { id: "remediation_agent", title: "Remediation Agent", env_prefix: "AUDIT_LLM_REMEDIATION", help: "Summarizes the most important failed or partial controls into a prioritized remediation memo and checklist." }
];

function RunInboxListComponent({ runs, selectedRunId, onSelect, helpers }) {
  const { cn, Badge, formatDate, runtimeFollowupCount } = helpers;
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

function RunsWorkspaceComponent({
  runs,
  selectedRunId,
  onSelectRun,
  onOpenLaunch,
  onOpenReviews,
  detailPane,
  launchModal,
  helpers
}) {
  const { Button, formatDate } = helpers;
  return h("div", { className: "h-screen overflow-hidden" }, [
    h("div", { key: "workspace", className: "grid h-full overflow-hidden border border-slate-200 bg-white xl:grid-cols-[420px_1fr]" }, [
      h("section", { key: "queue", className: "flex min-h-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r" }, [
        h("div", { key: "queue-header", className: "border-b border-slate-200 px-5 py-5" }, [
          h("div", { key: "top", className: "flex items-start justify-between gap-4" }, [
            h("div", { key: "copy" }, [
              h("h2", { key: "title", className: "text-2xl font-semibold tracking-tight text-slate-950" }, "Runs Inbox"),
              h("p", { key: "desc", className: "mt-2 text-sm leading-6 text-slate-500" }, "Select a run from the queue, inspect the selected run on the right, and launch new audits from a dedicated modal.")
            ]),
            h("div", { key: "actions", className: "flex shrink-0 flex-wrap gap-3" }, [
              h(Button, { key: "launch", onClick: onOpenLaunch }, "Launch Audit"),
              h(Button, { key: "reviews", variant: "outline", onClick: onOpenReviews }, "Open Reviews")
            ])
          ]),
          h("div", { key: "queue-meta", className: "mt-4 flex items-center justify-between gap-3 text-sm text-slate-500" }, [
            h("div", { key: "count" }, `${runs.length} run${runs.length === 1 ? "" : "s"} in current scope`),
            h("div", { key: "latest" }, runs[0]?.created_at ? `Latest ${formatDate(runs[0].created_at)}` : "No recent activity")
          ])
        ]),
        h("div", { key: "queue-list", className: "min-h-0 flex-1 overflow-y-auto" }, h(RunInboxListComponent, {
          runs,
          selectedRunId,
          onSelect: onSelectRun,
          helpers
        }))
      ]),
      h("section", { key: "detail-pane", className: "min-w-0 overflow-y-auto bg-slate-50 px-5 py-5" }, detailPane)
    ]),
    launchModal
  ]);
}

function RunDetailShellComponent({ loading, hasDetail, panels, helpers }) {
  const React = window.React;
  const { useEffect, useState } = React;
  const { Button, Card } = helpers;
  const [detailView, setDetailView] = useState("overview");
  const detailTabs = [
    ["overview", "Overview"],
    ["findings", "Findings"],
    ["review", "Review"],
    ["runtime", "Runtime Validation"],
    ["history", "History / Comparison"],
    ["exports", "Exports / Integrations"]
  ];
  const panelGroups = {
    overview: ["overview", "compare", "intent"],
    findings: ["findings", "findings-rollup"],
    review: ["assignment", "review-decisions", "handoff", "review-activity"],
    runtime: ["runtime-followups", "sandbox-execution"],
    history: ["comparison-preview", "comparison-export"],
    exports: ["outbound", "report-exports", "indexed-exports", "audit-export", "webhook-deliveries"]
  };
  const tabDescriptions = {
    overview: "Run provenance, launch intent, configuration drift, and provider/preflight posture.",
    findings: "Finding evidence, evaluation, and disposition governance for the selected run.",
    review: "Assignee, review actions, handoff context, notes, comments, and timeline.",
    runtime: "Sandbox execution evidence and runtime follow-up work linked to the run.",
    history: "Run-to-run comparison and prior-run context.",
    exports: "Outbound sharing, exports, and automation delivery metadata."
  };
  if (loading) {
    return h(Card, { title: "Run Detail", description: "Loading persisted run detail and planned profile.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "Loading run detail..."));
  }
  if (!hasDetail) {
    return h(Card, { title: "Run Detail", description: "Select a run to compare planned launch posture with the executed configuration.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "No run selected."));
  }
  const visiblePanels = (panels || []).filter((panel) => panelGroups[detailView]?.includes(panel?.key));
  return h("div", { className: "space-y-6" }, [
    h("div", { key: "tabs", className: "sticky top-0 z-10 border border-slate-200 bg-white/95 p-3 backdrop-blur" }, [
      h("div", { key: "tab-list", className: "flex flex-wrap gap-2" }, detailTabs.map(([id, label]) => h(Button, {
        key: id,
        variant: detailView === id ? "secondary" : "outline",
        onClick: () => setDetailView(id),
        className: detailView === id ? "bg-slate-900 text-white hover:bg-slate-800" : ""
      }, label))),
      h("div", { key: "tab-copy", className: "mt-3 text-sm text-slate-500" }, tabDescriptions[detailView])
    ]),
    ...visiblePanels
  ]);
}

function FindingDetailShellComponent({ tabs, renderContent, helpers }) {
  const React = window.React;
  const { useEffect, useState } = React;
  const { Button } = helpers;
  const [view, setView] = useState("summary");
  return h("div", { className: "space-y-4" }, [
    h("div", { key: "finding-tabs", className: "rounded-2xl border border-slate-200 bg-white p-3" }, [
      h("div", { key: "tab-list", className: "flex flex-wrap gap-2" }, (tabs || []).map(([id, label]) => h(Button, {
        key: id,
        variant: view === id ? "secondary" : "outline",
        onClick: () => setView(id),
        className: view === id ? "bg-slate-900 text-white hover:bg-slate-800" : ""
      }, label)))
    ]),
    renderContent ? renderContent({ view, setView }) : null
  ]);
}

function FindingsWorkspaceComponent({
  listPane,
  hasSelectedFinding,
  detailHeader,
  comparisonContext,
  detailTabs,
  renderDetailContent,
  emptyDetail,
  helpers
}) {
  return h("div", { className: "grid gap-6 xl:grid-cols-[0.95fr_1.05fr]" }, [
    h("div", { key: "finding-list", className: "space-y-4" }, listPane),
    hasSelectedFinding
      ? h("div", { key: "finding-detail", className: "space-y-4" }, [
        detailHeader,
        h(FindingDetailShellComponent, {
          key: "finding-shell",
          tabs: detailTabs,
          helpers,
          renderContent: renderDetailContent
        }),
        comparisonContext
      ].filter(Boolean))
      : emptyDetail
  ]);
}

function LaunchAuditModalComponent({
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
  helpers
}) {
  const { useEffect, useState } = React;
  const {
    Modal,
    Button,
    HoverCard,
    Field,
    Input,
    Select,
    Badge,
    cn,
    formatDate
  } = helpers;
  const preflightStatus = preflightSummary
    ? (launchReadiness.accepted ? "accepted" : (preflightSummary.readiness?.status || "ready").replace(/_/g, " "))
    : "not run";
  const targetStepComplete = Boolean(computeTargetValue(runForm).trim()) && !launchReadiness.issues.some((issue) => issue.includes("target"));
  const usingPresets = Boolean(runForm.use_audit_presets);
  const globalModelAvailable = Boolean(runForm.llm_model);
  const usingGlobalLlmConfig = runForm.use_global_llm_config !== false && globalModelAvailable;
  const configStepComplete = Boolean(runForm.run_mode && runForm.llm_provider && (!usingPresets || runForm.audit_package));
  const requiredFieldsReady = targetStepComplete && configStepComplete;
  const activeModel = runModelOptions.find((item) => item.provider_id === runForm.llm_provider && item.id === runForm.llm_model) || null;
  const selectedAuditPackage = (auditPackages || []).find((item) => item.id === runForm.audit_package) || null;
  const resolvedEnabledLanes = Array.isArray(runForm.enabled_lanes) ? runForm.enabled_lanes : [];
  const agentConfigs = runForm.agent_configs || {};
  const [activeStep, setActiveStep] = useState("target");
  const [requiredControlDraft, setRequiredControlDraft] = useState("");
  const [excludedControlDraft, setExcludedControlDraft] = useState("");
  const requiredControlIds = parseControlIdText(runForm.required_control_ids_text || "");
  const excludedControlIds = parseControlIdText(runForm.excluded_control_ids_text || "");
  const requiredFrameworks = Array.isArray(runForm.required_frameworks) ? runForm.required_frameworks : [];
  const excludedFrameworks = Array.isArray(runForm.excluded_frameworks) ? runForm.excluded_frameworks : [];
  const availableRequiredControls = controlCatalog.filter((control) => !requiredControlIds.includes(control.id) && !requiredFrameworks.includes(control.framework));
  const availableExcludedControls = controlCatalog.filter((control) => !excludedControlIds.includes(control.id) && !excludedFrameworks.includes(control.framework));
  const currentTargetSummary = getCurrentTargetSummary(runForm);
  const currentPolicyPackId = normalizePolicyPackId(runForm.audit_policy_pack || "");
  const currentProfileSummary = {
    target: currentTargetSummary,
    packageLabel: selectedAuditPackage ? selectedAuditPackage.title : (runForm.audit_package || "No package selected"),
    policyPackLabel: getPolicyPackLabel(policyPacks, currentPolicyPackId),
    runMode: runForm.run_mode || "Not selected",
    modelLabel: getLaunchPlanModelLabel(runForm, runModelOptions),
    runtimeValidation: (runForm.runtime_allowed || "not set").replace(/_/g, " "),
    reviewThreshold: runForm.review_severity || "not set"
  };
  const recommendedProfile = preflightSummary?.launch_profile || null;
  const recommendedPolicyPackId = normalizePolicyPackId(recommendedProfile?.audit_policy_pack || "");
  const recommendedPackageLabel = recommendedProfile?.audit_package
    ? ((auditPackages || []).find((item) => item.id === recommendedProfile.audit_package)?.title || recommendedProfile.audit_package)
    : "Default package";
  const recommendedPolicyLabel = getPolicyPackLabel(policyPacks, recommendedPolicyPackId);
  const recommendedModelLabel = recommendedProfile?.llm_model
    ? `${recommendedProfile.llm_provider || "default"}/${recommendedProfile.llm_model}`
    : (recommendedProfile?.llm_provider || "Default provider/model");
  const comparisonRows = recommendedProfile ? [
    {
      id: "package",
      label: "Package",
      current: currentProfileSummary.packageLabel,
      recommended: recommendedPackageLabel,
      changed: (recommendedProfile.audit_package || "") !== (runForm.audit_package || "")
    },
    {
      id: "policy",
      label: "Policy pack",
      current: currentProfileSummary.policyPackLabel,
      recommended: recommendedPolicyLabel,
      changed: recommendedPolicyPackId !== currentPolicyPackId
    },
    {
      id: "mode",
      label: "Run mode",
      current: currentProfileSummary.runMode,
      recommended: recommendedProfile.run_mode || "Default",
      changed: (recommendedProfile.run_mode || "") !== (runForm.run_mode || "")
    },
    {
      id: "model",
      label: "Provider / model",
      current: `${runForm.llm_provider || "default"}/${runForm.llm_model || "default"}`,
      recommended: recommendedModelLabel,
      changed: (recommendedProfile.llm_provider || "") !== (runForm.llm_provider || "") || (recommendedProfile.llm_model || "") !== (runForm.llm_model || "")
    }
  ] : [];
  const applyAuditPackage = (packageId) => updateRunForm("audit_package", packageId);
  useEffect(() => {
    if (requiredControlDraft && !availableRequiredControls.some((control) => control.id === requiredControlDraft)) {
      setRequiredControlDraft("");
    }
  }, [requiredControlDraft, runForm.required_control_ids_text, runForm.required_frameworks]);
  useEffect(() => {
    if (excludedControlDraft && !availableExcludedControls.some((control) => control.id === excludedControlDraft)) {
      setExcludedControlDraft("");
    }
  }, [excludedControlDraft, runForm.excluded_control_ids_text, runForm.excluded_frameworks]);
  const updateAgentConfig = (agentId, key, value) => updateRunForm("agent_configs", {
    ...agentConfigs,
    [agentId]: {
      ...(agentConfigs[agentId] || {}),
      [key]: value
    }
  });
  const toggleFrameworkConstraint = (key, framework) => {
    const current = Array.isArray(runForm[key]) ? runForm[key] : [];
    const oppositeKey = key === "required_frameworks" ? "excluded_frameworks" : "required_frameworks";
    const oppositeCurrent = Array.isArray(runForm[oppositeKey]) ? runForm[oppositeKey] : [];
    const next = current.includes(framework)
      ? current.filter((item) => item !== framework)
      : [...current, framework];
    updateRunForm(key, next);
    if (!current.includes(framework) && oppositeCurrent.includes(framework)) {
      updateRunForm(oppositeKey, oppositeCurrent.filter((item) => item !== framework));
    }
    if (!current.includes(framework)) {
      if (key === "required_frameworks") {
        updateControlConstraintText("required_control_ids_text", requiredControlIds.filter((controlId) => frameworkForControlId(controlId) !== framework));
      } else {
        updateControlConstraintText("excluded_control_ids_text", excludedControlIds.filter((controlId) => frameworkForControlId(controlId) !== framework));
      }
    }
    setRequiredControlDraft("");
    setExcludedControlDraft("");
  };
  const updateControlConstraintText = (key, values) => updateRunForm(key, values.join("\n"));
  const addControlConstraint = (key, oppositeKey, controlId) => {
    if (!controlId) return;
    const current = key === "required_control_ids_text" ? requiredControlIds : excludedControlIds;
    const opposite = oppositeKey === "required_control_ids_text" ? requiredControlIds : excludedControlIds;
    const sameSideFrameworks = key === "required_control_ids_text" ? requiredFrameworks : excludedFrameworks;
    if (sameSideFrameworks.includes(frameworkForControlId(controlId))) {
      setRequiredControlDraft("");
      setExcludedControlDraft("");
      return;
    }
    const next = current.includes(controlId) ? current : [...current, controlId];
    updateControlConstraintText(key, next);
    if (opposite.includes(controlId)) {
      updateControlConstraintText(oppositeKey, opposite.filter((item) => item !== controlId));
    }
    setRequiredControlDraft("");
    setExcludedControlDraft("");
  };
  const removeControlConstraint = (key, controlId) => {
    const current = key === "required_control_ids_text" ? requiredControlIds : excludedControlIds;
    updateControlConstraintText(key, current.filter((item) => item !== controlId));
    setRequiredControlDraft("");
    setExcludedControlDraft("");
  };
  const toggleLane = (laneId) => {
    const next = resolvedEnabledLanes.includes(laneId)
      ? resolvedEnabledLanes.filter((item) => item !== laneId)
      : [...resolvedEnabledLanes, laneId];
    updateRunForm("enabled_lanes", next);
  };
  const helpLabel = (text, help, ariaLabel) => h("span", { className: "inline-flex items-center gap-2" }, [
    h("span", { key: "text" }, text),
    help ? h(HoverCard, {
      key: "hover",
      side: "top",
      align: "start",
      trigger: h("button", {
        type: "button",
        className: "inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-500 hover:bg-slate-50",
        "aria-label": ariaLabel || `${text} help`
      }, "?")
    }, help) : null
  ]);
  return h(Modal, {
    open,
    onClose,
    size: "full",
    title: "Launch Audit",
    description: "Choose a target, confirm the audit configuration, run the audit readiness review if needed, then launch."
  }, h("div", { className: "flex h-[calc(100vh-11rem)] flex-col" }, [
    h("div", { key: "steps", className: "mb-4 border-b border-slate-200 pb-4" }, [
      h("div", { key: "step-row", className: "flex flex-wrap gap-2" }, [
        ["target", "1. Target"],
        ["launch", "2. Launch Profile"],
        ["advanced", "3. Advanced Config"],
        ["preflight", "4. Audit Readiness"]
      ].map(([id, label]) => h(Button, {
        key: id,
        type: "button",
        variant: activeStep === id ? "secondary" : "outline",
        onClick: () => setActiveStep(id),
        className: activeStep === id ? "bg-slate-900 text-white hover:bg-slate-800" : ""
      }, label)))
    ]),
    h("section", { key: "current-launch-plan", className: "mb-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4" }, [
      h("div", { key: "header", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h("div", { key: "copy", className: "min-w-0 flex-1" }, [
          h("div", { key: "title", className: "text-sm font-semibold text-slate-950" }, "Current Launch Plan"),
          h("div", { key: "target", className: "mt-1 truncate text-sm text-slate-500" }, currentProfileSummary.target)
        ]),
        h(Badge, { key: "readiness" }, `Readiness: ${launchReadiness.requiresReadinessReview ? (launchReadiness.accepted ? "accepted" : preflightStatus) : "optional"}`)
      ]),
      h("div", { key: "items", className: "mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5" }, [
        ["Package", currentProfileSummary.packageLabel],
        ["Policy pack", currentProfileSummary.policyPackLabel],
        ["Run mode", currentProfileSummary.runMode],
        ["Agent Model", currentProfileSummary.modelLabel],
        ["Runtime / review", `${currentProfileSummary.runtimeValidation} runtime, ${currentProfileSummary.reviewThreshold}+ review`]
      ].map(([label, value]) => h("div", {
        key: label,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
      }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-[0.14em] text-slate-500" }, label),
        h("div", { key: "value", className: "mt-1 text-sm text-slate-900" }, value)
      ])))
    ]),
    h("div", { key: "scroll-region", className: "min-h-0 flex-1 overflow-y-auto pr-1" }, [
    h("section", { key: "setup", className: "rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4" }, [
      h("div", { key: "setup-grid", className: "mt-4" }, [
        activeStep === "target" ? h("div", { key: "target-block", className: "space-y-4" }, [
          h("div", { key: "target-header" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Target"),
            h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Choose the system, repository, or path you want to audit.")
          ]),
          h("div", { key: "fields", className: "grid gap-4 md:grid-cols-2" }, [
            h(Field, { key: "target-kind", label: helpLabel("Target kind", "Choose whether this run audits a local codebase, a repository URL, or a live hosted endpoint. This changes both preflight classification and what evidence can be collected.") }, Select({
              value: runForm.target_kind,
              onChange: (event) => updateRunForm("target_kind", event.target.value)
            }, [
              h("option", { key: "path", value: "path" }, "local path"),
              h("option", { key: "repo", value: "repo" }, "repo url"),
              h("option", { key: "endpoint", value: "endpoint" }, "endpoint url")
            ])),
            runForm.target_kind === "repo"
              ? h(Field, { key: "repo", label: helpLabel("Repository URL", "Use a canonical Git repository URL when you want repository identity, history linking, and integration-safe matching across repeated runs.") }, h(Input, {
                value: runForm.repo_url,
                onChange: (event) => updateRunForm("repo_url", event.target.value),
                placeholder: "https://github.com/org/repo or git@github.com:org/repo.git"
              }))
              : runForm.target_kind === "endpoint"
                ? h(Field, { key: "endpoint", label: helpLabel("Endpoint URL", "Use this for hosted or black-box targets where the audit should reason from a live service rather than repository contents.") }, h(Input, {
                  value: runForm.endpoint_url,
                  onChange: (event) => updateRunForm("endpoint_url", event.target.value),
                  placeholder: "https://service.example.com/v1"
                }))
                : h(Field, { key: "path", label: helpLabel("Local Path", "Point to a local repository or source tree on disk. This is best for self-hosted code, fixtures, or local clones.") }, h(Input, {
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
        ]) : null,
        activeStep === "launch" ? h("div", { key: "config-block", className: "space-y-5" }, [
          h("div", { key: "config-header" }, [
            h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Choose the audit family, package presets, and run-shape settings for this audit.")
          ]),
          h("div", { key: "preset-row", className: "mt-4 grid gap-3 md:grid-cols-2" }, [
            h(Field, {
              key: "preset-toggle-field",
              label: h("span", { className: "inline-flex items-center gap-2" }, [
                h("span", { key: "text" }, "Audit presets"),
                h(HoverCard, {
                  key: "hover",
                  side: "top",
                  align: "start",
                  trigger: h("button", {
                    type: "button",
                    className: "inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-500 hover:bg-slate-50",
                    "aria-label": "Audit presets help"
                  }, "?")
                }, "Presets lock package-derived depth, budget, publishability, and audit area settings. Turn this off for full custom configuration.")
              ])
            }, h("label", { className: "flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4" }, [
              h("input", {
                type: "checkbox",
                checked: usingPresets,
                onChange: (event) => updateRunForm("use_audit_presets", event.target.checked)
              }),
              h("span", { className: "font-medium text-slate-900" }, "Use audit presets")
            ])),
            h(Field, { key: "pkg", label: helpLabel("Preset package", "Audit packages are curated presets that set depth, audit area coverage, and review strictness. With audit presets enabled, this drives the locked package-derived settings below.") }, Select({
              value: runForm.audit_package,
              disabled: !usingPresets,
              className: !usingPresets ? "border-slate-200 bg-slate-100 text-slate-400" : "",
              onChange: (event) => applyAuditPackage(event.target.value)
            }, [
              ...auditPackages.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} (${item.id})`)),
              !auditPackages.some((item) => item.id === runForm.audit_package)
                ? h("option", { key: runForm.audit_package || "custom-package", value: runForm.audit_package }, `${runForm.audit_package || "custom"} (custom)`)
                : null
              ].filter(Boolean)))
          ]),
          h("div", { key: "policy-row", className: "grid gap-3" }, [
            h(Field, {
              key: "policy-pack",
              label: helpLabel("Policy pack", "Policy packs control audit supervision rules such as publication logic, waiver behavior, and review-oriented governance. Use the default built-in pack unless your workspace or project has a specific governance policy.")
            }, h("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, [
              h("div", { key: "value", className: "font-medium text-slate-900" }, getPolicyPackLabel(policyPacks, "default")),
              h("div", { key: "note", className: "mt-1" }, "OSS uses the built-in default policy pack only.")
            ]))
          ]),
          h("div", { key: "run-mode-row", className: "grid gap-3" }, [
            h(Field, { key: "mode", label: helpLabel("Run mode", "Choose whether the run stays static, uses runtime-capable validation, or lets the app automatically resolve the audit path from repo structure and planner analysis.") }, Select({
              value: runForm.run_mode,
              disabled: usingPresets,
              className: usingPresets ? "border-slate-200 bg-slate-100 text-slate-400" : "",
              onChange: (event) => updateRunForm("run_mode", event.target.value)
            }, [
              h("option", { key: "placeholder", value: "", disabled: true }, "select run mode"),
              h("option", { key: "auto", value: "auto" }, "auto"),
              h("option", { key: "static", value: "static" }, "static"),
              h("option", { key: "runtime", value: "runtime" }, "runtime")
            ]))
          ]),
          h("div", { key: "runtime-row", className: "grid gap-3" }, [
            h(Field, { key: "runtime-allowed", label: helpLabel("Runtime validation", "Controls whether the audit may build, execute, or probe the target beyond static analysis. Presets may lock this based on the selected package.") }, Select({
              value: runForm.runtime_allowed,
              disabled: usingPresets,
              className: usingPresets ? "border-slate-200 bg-slate-100 text-slate-400" : "",
              onChange: (event) => updateRunForm("runtime_allowed", event.target.value)
            }, [
              h("option", { key: "never", value: "never" }, "never"),
              h("option", { key: "targeted_only", value: "targeted_only" }, "targeted only"),
              h("option", { key: "allowed", value: "allowed" }, "allowed")
            ]))
          ]),
          h("div", { key: "review-row", className: "grid gap-3" }, [
            h(Field, { key: "review-severity", label: helpLabel("Review threshold", "Findings at or above this severity trigger stronger review expectations. This is a launch-time threshold, not the finding severity scale itself.") }, Select({
              value: runForm.review_severity,
              disabled: usingPresets,
              className: usingPresets ? "border-slate-200 bg-slate-100 text-slate-400" : "",
              onChange: (event) => updateRunForm("review_severity", event.target.value)
            }, [
              h("option", { key: "critical", value: "critical" }, "critical"),
              h("option", { key: "high", value: "high" }, "high"),
              h("option", { key: "medium", value: "medium" }, "medium"),
              h("option", { key: "low", value: "low" }, "low")
            ]))
          ])
        ]) : null,
        activeStep === "advanced" ? h("div", { key: "advanced-content", className: "space-y-5" }, [
          h("div", { key: "standards-block", className: "space-y-4 rounded-2xl border border-slate-200 bg-white px-4 py-4" }, [
            h("div", { key: "standards-header" }, [
              h("div", { key: "standards-title", className: "text-sm font-medium text-slate-900" }, "Standards and controls"),
              h("div", { key: "standards-copy", className: "mt-1 text-sm text-slate-500" }, "The planner agent selects applicable frameworks and controls by default. Use constrained automatic mode only when you need to bound that selection for this run.")
            ]),
            h("div", { key: "selection-mode", className: "grid gap-3" }, [
              h(Field, { key: "control-selection-mode", label: helpLabel("Control selection mode", "Automatic keeps the planner in full control. Constrained automatic still uses the planner, but lets you bound the framework and control scope for this run.") }, h("div", { className: "grid gap-2 md:grid-cols-2" }, [
                h("button", {
                  key: "automatic",
                  type: "button",
                  onClick: () => updateRunForm("control_selection_mode", "automatic"),
                  className: cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    (runForm.control_selection_mode || "automatic") === "automatic"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )
                }, [
                  h("div", { key: "title", className: "font-medium" }, "Automatic"),
                  h("div", { key: "copy", className: cn("mt-1 text-sm", (runForm.control_selection_mode || "automatic") === "automatic" ? "text-slate-200" : "text-slate-500") }, "Planner-selected controls")
                ]),
                h("button", {
                  key: "constrained",
                  type: "button",
                  onClick: () => updateRunForm("control_selection_mode", "constrained"),
                  className: cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    runForm.control_selection_mode === "constrained"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )
                }, [
                  h("div", { key: "title", className: "font-medium" }, "Constrained Automatic"),
                  h("div", { key: "copy", className: cn("mt-1 text-sm", runForm.control_selection_mode === "constrained" ? "text-slate-200" : "text-slate-500") }, "Planner with operator bounds")
                ])
              ]))
            ]),
            runForm.control_selection_mode === "constrained" ? h("div", { key: "constrained-controls", className: "space-y-4" }, [
              h("div", { key: "framework-grid", className: "grid gap-4 md:grid-cols-2" }, [
                h("div", { key: "required-frameworks", className: "space-y-3" }, [
                h("div", { key: "label", className: "text-sm font-medium text-slate-900" }, helpLabel("Required frameworks", "These framework families must remain in scope when the planner selects controls. Use them to force broad standards coverage.")),
                  h("div", { key: "copy", className: "text-sm text-slate-500" }, "The planner must keep these framework families in scope. Required control IDs below are only for narrower carve-ins outside this base selection."),
                  h("div", { key: "options", className: "flex flex-wrap gap-2" }, frameworkCatalog.map((framework) => {
                    const enabled = (runForm.required_frameworks || []).includes(framework);
                    return h("button", {
                      key: framework,
                      type: "button",
                      onClick: () => toggleFrameworkConstraint("required_frameworks", framework),
                      className: cn(
                        "rounded-full border px-3 py-1.5 text-sm transition",
                        enabled ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      )
                    }, framework);
                  }))
                ]),
                h("div", { key: "excluded-frameworks", className: "space-y-3" }, [
                h("div", { key: "label", className: "text-sm font-medium text-slate-900" }, helpLabel("Excluded frameworks", "These framework families must stay out of scope. Use them to prevent the planner from scoring or selecting controls from that framework family.")),
                  h("div", { key: "copy", className: "text-sm text-slate-500" }, "The planner must keep these framework families out of scope. Excluded control IDs below are only for narrower carve-outs inside otherwise included scope."),
                  h("div", { key: "options", className: "flex flex-wrap gap-2" }, frameworkCatalog.map((framework) => {
                    const enabled = (runForm.excluded_frameworks || []).includes(framework);
                    return h("button", {
                      key: framework,
                      type: "button",
                      onClick: () => toggleFrameworkConstraint("excluded_frameworks", framework),
                      className: cn(
                        "rounded-full border px-3 py-1.5 text-sm transition",
                        enabled ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      )
                    }, framework);
                  }))
                ])
              ]),
              h("div", { key: "control-id-grid", className: "grid gap-3 md:grid-cols-2" }, [
                h(Field, { key: "required-controls", label: helpLabel("Required controls", "Use specific controls only when you want a narrow carve-in without requiring the whole framework. These are exceptions to the broader framework selection.") }, h("div", { className: "space-y-2" }, [
                  h("div", { className: "flex gap-2" }, [
                    h("div", { key: `required-select-${runForm.required_control_ids_text || ""}-${(runForm.required_frameworks || []).join("|")}`, className: "flex-1" }, Select({
                      value: requiredControlDraft,
                      onChange: (event) => setRequiredControlDraft(event.target.value)
                    }, [
                      h("option", { key: "placeholder", value: "" }, "add a required control"),
                      ...availableRequiredControls.map((control) => h("option", { key: control.id, value: control.id }, `${control.title} (${control.id})`))
                    ])),
                    h(Button, {
                      type: "button",
                      variant: "outline",
                      onClick: () => {
                        addControlConstraint("required_control_ids_text", "excluded_control_ids_text", requiredControlDraft);
                        setRequiredControlDraft("");
                      },
                      disabled: !requiredControlDraft
                    }, "Add")
                  ]),
                  requiredControlIds.length ? h("div", { className: "flex flex-wrap gap-2" }, requiredControlIds.map((controlId) => {
                    const control = controlCatalog.find((item) => item.id === controlId);
                    return h("button", {
                      key: controlId,
                      type: "button",
                      onClick: () => removeControlConstraint("required_control_ids_text", controlId),
                      className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    }, `${control?.title || controlId} x`);
                  })) : null,
                  h("div", { className: "text-xs text-slate-500" }, "Use this only to require specific controls without requiring the whole framework. If you require a framework, redundant required controls from that framework are cleared automatically.")
                ])),
                h(Field, { key: "excluded-controls", label: helpLabel("Excluded controls", "Use specific controls only when you want a narrow carve-out without excluding the whole framework. These are exceptions to the broader framework selection.") }, h("div", { className: "space-y-2" }, [
                  h("div", { className: "flex gap-2" }, [
                    h("div", { key: `excluded-select-${runForm.excluded_control_ids_text || ""}-${(runForm.excluded_frameworks || []).join("|")}`, className: "flex-1" }, Select({
                      value: excludedControlDraft,
                      onChange: (event) => setExcludedControlDraft(event.target.value)
                    }, [
                      h("option", { key: "placeholder", value: "" }, "add an excluded control"),
                      ...availableExcludedControls.map((control) => h("option", { key: control.id, value: control.id }, `${control.title} (${control.id})`))
                    ])),
                    h(Button, {
                      type: "button",
                      variant: "outline",
                      onClick: () => {
                        addControlConstraint("excluded_control_ids_text", "required_control_ids_text", excludedControlDraft);
                        setExcludedControlDraft("");
                      },
                      disabled: !excludedControlDraft
                    }, "Add")
                  ]),
                  excludedControlIds.length ? h("div", { className: "flex flex-wrap gap-2" }, excludedControlIds.map((controlId) => {
                    const control = controlCatalog.find((item) => item.id === controlId);
                    return h("button", {
                      key: controlId,
                      type: "button",
                      onClick: () => removeControlConstraint("excluded_control_ids_text", controlId),
                      className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    }, `${control?.title || controlId} x`);
                  })) : null,
                  h("div", { className: "text-xs text-slate-500" }, "Use this only to exclude specific controls without excluding the whole framework. If you exclude a framework, redundant excluded controls from that framework are cleared automatically.")
                ]))
              ])
            ]) : h("div", { key: "automatic-note", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" }, "Automatic mode lets the planner choose applicable standards and controls from the full control catalog based on target semantics, repo signals, and run mode.")
          ]),
          h("div", { key: "advanced-block", className: "space-y-4 rounded-2xl border border-slate-200 bg-white px-4 py-4" }, [
            h("div", { key: "advanced-header" }, [
              h("div", { key: "advanced-title", className: "text-sm font-medium text-slate-900" }, "Depth and scope"),
              h("div", { key: "advanced-copy", className: "mt-1 text-sm text-slate-500" }, usingPresets
                ? "Preset-derived package fields are locked. Turn off audit presets to override audit area coverage, budget, and publishability."
                : "Override the default audit areas and package budget directly.")
            ]),
            h("div", { key: "budget-grid", className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4" }, [
              h(Field, { key: "agents", label: helpLabel("Max agent calls", "Upper bound for model-backed agent invocations during this run. Lower values reduce cost but may limit review depth.") }, h(Input, {
                type: "number",
                min: 1,
                disabled: usingPresets,
                value: runForm.max_agent_calls || "",
                onChange: (event) => updateRunForm("max_agent_calls", event.target.value)
              })),
              h(Field, { key: "tokens", label: helpLabel("Max total tokens", "Overall token budget across planner, specialists, supervisor, and remediation agents for this run.") }, h(Input, {
                type: "number",
                min: 1,
                disabled: usingPresets,
                value: runForm.max_total_tokens || "",
                onChange: (event) => updateRunForm("max_total_tokens", event.target.value)
              })),
              h(Field, { key: "reruns", label: helpLabel("Max rerun rounds", "How many correction or retry rounds the audit may use when evidence is insufficient or the supervisor requests a rerun.") }, h(Input, {
                type: "number",
                min: 1,
                disabled: usingPresets,
                value: runForm.max_rerun_rounds || "",
                onChange: (event) => updateRunForm("max_rerun_rounds", event.target.value)
              })),
              h(Field, { key: "publishability", label: helpLabel("Publishability threshold", "Controls how strict the audit is about evidence sufficiency before conclusions are considered safe to publish beyond internal review.") }, Select({
                value: runForm.publishability_threshold || "high",
                disabled: usingPresets,
                onChange: (event) => updateRunForm("publishability_threshold", event.target.value)
              }, [
                h("option", { key: "low", value: "low" }, "low"),
                h("option", { key: "medium", value: "medium" }, "medium"),
                h("option", { key: "high", value: "high" }, "high")
              ]))
            ]),
            h("div", { key: "lane-grid", className: "grid gap-3 md:grid-cols-2" }, auditLaneCatalog.map((lane) => {
              const enabled = resolvedEnabledLanes.includes(lane.id);
              return h("label", {
                key: lane.id,
                className: cn(
                  "flex items-start gap-3 rounded-2xl border px-4 py-4",
                  enabled ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white",
                  usingPresets && "opacity-70"
                )
              }, [
                h("input", {
                  type: "checkbox",
                  checked: enabled,
                  disabled: usingPresets,
                  onChange: () => toggleLane(lane.id)
                }),
                h("div", { key: "lane-copy", className: "min-w-0" }, [
                  h("div", { key: "lane-title", className: "font-medium text-slate-900" }, helpLabel(lane.title, lane.summary)),
                  h("div", { key: "lane-summary", className: "mt-1 text-sm text-slate-500" }, lane.summary)
                ])
              ]);
            })),
            h("div", { key: "lane-note", className: "text-xs text-slate-500" }, "Run mode resets the default audit area selection. Override audit areas here only when you want a non-default audit scope.")
          ]),
          h("div", { key: "agent-block", className: "space-y-4 rounded-2xl border border-slate-200 bg-white px-4 py-4" }, [
            h("div", { key: "agent-header" }, [
              h("div", { key: "agent-title", className: "text-sm font-medium text-slate-900" }, "Agent Models"),
              h("div", { key: "agent-copy", className: "mt-1 text-sm text-slate-500" }, "Use a single inherited LLM configuration for all agent stages, or switch to per-agent overrides below."),
              h("label", { key: "agent-inherit-toggle", className: cn("mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3", globalModelAvailable ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50") }, [
                h("input", {
                  type: "checkbox",
                  checked: usingGlobalLlmConfig && globalModelAvailable,
                  disabled: !globalModelAvailable,
                  onChange: (event) => updateRunForm("use_global_llm_config", event.target.checked)
                }),
                h("div", { key: "copy", className: "min-w-0" }, [
                  h("div", { key: "label", className: "text-sm font-medium text-slate-900" }, "Use global LLM model and credential"),
                  h("div", { key: "body", className: "mt-1 text-sm text-slate-500" }, globalModelAvailable
                    ? `All agent stages inherit ${activeModel?.label || runForm.llm_model} and the configured provider credential from Settings.`
                    : "No global LLM model is configured in Settings. Configure one there to enable inherited agent defaults.")
                ])
              ])
            ]),
            h("div", { key: "agent-grid", className: "space-y-4" }, agentConfigCatalog.map((agent) => {
              const config = agentConfigs[agent.id] || {};
              const agentModel = runModelOptions.find((item) => item.provider_id === config.provider && item.id === config.model)
                || runModelOptions.find((item) => item.id === config.model)
                || null;
              const agentOverrideProviders = (llmRegistry.providers || []).filter((provider) => provider.id !== "mock");
              return h("div", {
                key: agent.id,
                className: cn(
                  "rounded-2xl border border-slate-200 px-4 py-4 transition",
                  usingGlobalLlmConfig ? "bg-slate-50 opacity-60" : "bg-white"
                )
              }, [
                h("div", { key: "agent-meta", className: "mb-3" }, [
                  h("div", { key: "agent-name", className: "font-medium text-slate-900" }, helpLabel(agent.title, agent.help, `${agent.title} help`))
                ]),
                h("div", { key: "agent-fields", className: "grid gap-3 md:grid-cols-2" }, [
                  h(Field, { key: "agent-model", label: helpLabel("LLM model", `Choose the model used for the ${agent.title.toLowerCase()} stage when per-agent overrides are active.`) }, Select({
                    value: agentModel?.value || "",
                    disabled: usingGlobalLlmConfig,
                    onChange: (event) => {
                      const selectedModel = runModelOptions.find((item) => item.value === event.target.value);
                      updateAgentConfig(agent.id, "provider", selectedModel?.provider_id || "");
                      updateAgentConfig(agent.id, "model", selectedModel?.id || "");
                    }
                  }, [
                    h("option", { key: "placeholder", value: "" }, "select a model"),
                    ...agentOverrideProviders.map((provider) => h("optgroup", { key: provider.id, label: provider.name }, runModelOptions
                      .filter((item) => item.provider_id === provider.id)
                      .map((item) => h("option", { key: `${agent.id}:${item.value}`, value: item.value }, item.label))))
                  ])),
                  h(Field, { key: "agent-api", label: helpLabel("API key", `Optional credential override for the ${agent.title.toLowerCase()} stage only.`) }, h("div", { className: "space-y-2" }, [
                    h(Input, {
                      type: "password",
                      disabled: usingGlobalLlmConfig,
                      value: config.api_key || "",
                      onChange: (event) => updateAgentConfig(agent.id, "api_key", event.target.value),
                      placeholder: `uses ${agent.env_prefix}_API_KEY`
                    }),
                    h("div", { className: "text-xs text-slate-500" }, `Maps to ${agent.env_prefix}_API_KEY. Leave blank to use the agent-specific or provider environment key.`)
                  ]))
                ])
              ]);
            }))
          ])
        ]) : null,
        activeStep === "preflight" ? h("div", { key: "preflight-step", className: "space-y-5" }, [
          h("div", { key: "preflight-header" }, [
            h("div", { key: "copy", className: "text-sm text-slate-500" }, "Audit readiness reviews whether the target and selected launch profile are appropriate for a complete audit. It highlights blockers, warnings, and configuration drift, recommends a launch profile based on repo structure and semantic target analysis, and gives the operator a checkpoint to confirm the audit plan before spending runtime and model budget."),
            h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
              h(Button, { key: "preflight", variant: "outline", onClick: runPreflight, disabled: !requiredFieldsReady }, preflightLoading ? "Running Readiness Check..." : "Run Readiness Check"),
              h(Button, {
                key: "accept-readiness",
                variant: "secondary",
                onClick: acceptPreflight,
                disabled: !preflightSummary || preflightStale
              }, "Accept Audit Readiness"),
              h(Button, {
                key: "apply-readiness",
                variant: "outline",
                onClick: applyPreflightRecommendations,
                disabled: !preflightSummary?.launch_profile || !launchReadiness.profileDrift.length
              }, "Apply Recommended Profile")
            ])
          ]),
          launchReadiness.issues.length
            ? h("div", { key: "issues", className: "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" }, [
              h("div", { key: "title", className: "font-medium" }, "Input issues"),
              h("ul", { key: "list", className: "mt-2 space-y-1" }, launchReadiness.issues.map((item, index) => h("li", { key: index }, `- ${item}`)))
            ])
            : h("div", { key: "ready-copy", className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" }, launchReadiness.requiresReadinessReview
              ? "This run currently requires an audit readiness review before launch. Run the readiness check to validate the target, review the recommended audit profile, and confirm whether the run is ready to launch."
              : "Audit readiness is optional for this run unless the review surfaces blockers, warnings, or launch-profile drift."),
          preflightSummary
            ? h("section", {
              key: "preflight-results",
              className: cn(
                "rounded-[28px] border px-5 py-4",
                preflightSummary.readiness.status === "blocked" ? "border-red-200 bg-red-50/60" : (preflightSummary.readiness.status === "ready_with_warnings" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60")
              )
            }, [
              h("div", { key: "header" }, [
                h("div", { key: "title", className: "font-semibold text-slate-950" }, "Audit Readiness Results"),
                h("div", { key: "summary", className: "mt-1 text-sm text-slate-500" }, `${preflightStatus}. ${preflightSummary.readiness.blockers?.length || 0} blockers, ${preflightSummary.readiness.warnings?.length || 0} warnings.`)
              ]),
              h("div", { key: "flags", className: "mb-4 flex flex-wrap gap-2" }, [
                preflightStale ? h(Badge, { key: "stale" }, "stale") : null,
                launchReadiness.accepted ? h(Badge, { key: "accepted" }, "accepted") : null
              ].filter(Boolean)),
              preflightSummary.launch_profile
                ? h("div", { key: "profile-compare", className: "mt-4 space-y-4 rounded-2xl border border-white/70 bg-white px-4 py-4 text-sm text-slate-500" }, [
                  h("div", { key: "title" }, [
                    h("div", { key: "heading", className: "font-medium text-slate-900" }, "Current vs Recommended Launch Profile"),
                    h("div", { key: "copy", className: "mt-1 text-sm text-slate-500" }, "Use this comparison to review launch-profile drift before accepting audit readiness or applying the recommended profile.")
                  ]),
                  h("div", { key: "columns", className: "grid gap-4 md:grid-cols-2" }, [
                    h("div", { key: "current", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                      h("div", { key: "title", className: "font-medium text-slate-900" }, "Current launch profile"),
                      h("div", { key: "body", className: "mt-2 grid gap-2" }, [
                        h("div", { key: "pkg" }, `package: ${currentProfileSummary.packageLabel}`),
                        h("div", { key: "policy" }, `policy pack: ${currentProfileSummary.policyPackLabel}`),
                        h("div", { key: "mode" }, `run mode: ${currentProfileSummary.runMode}`),
                        h("div", { key: "provider" }, `provider/model: ${runForm.llm_provider || "default"}/${runForm.llm_model || "default"}`)
                      ])
                    ]),
                    h("div", { key: "recommended", className: "rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3" }, [
                      h("div", { key: "title", className: "font-medium text-slate-900" }, "Recommended launch profile"),
                      h("div", { key: "body", className: "mt-2 grid gap-2" }, [
                        h("div", { key: "pkg" }, `package: ${recommendedPackageLabel}`),
                        h("div", { key: "policy" }, `policy pack: ${recommendedPolicyLabel}`),
                        h("div", { key: "mode" }, `run mode: ${preflightSummary.launch_profile.run_mode || "default"}`),
                        h("div", { key: "provider" }, `provider/model: ${recommendedModelLabel}`)
                      ])
                    ])
                  ]),
                  h("div", { key: "drift", className: "space-y-2" }, [
                    h("div", { key: "label", className: "font-medium text-slate-900" }, "Configuration drift"),
                    h("div", { key: "rows", className: "space-y-2" }, comparisonRows.map((row) => h("div", {
                      key: row.id,
                      className: cn(
                        "rounded-2xl border px-4 py-3",
                        row.changed ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50"
                      )
                    }, [
                      h("div", { key: "header", className: "flex flex-wrap items-center justify-between gap-2" }, [
                        h("div", { key: "name", className: "font-medium text-slate-900" }, row.label),
                        h(Badge, { key: "badge" }, row.changed ? "drift detected" : "matches recommendation")
                      ]),
                      h("div", { key: "values", className: "mt-2 grid gap-2 md:grid-cols-2" }, [
                        h("div", { key: "current" }, `current: ${row.current}`),
                        h("div", { key: "recommended" }, `recommended: ${row.recommended}`)
                      ])
                    ])))
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
        ]) : null
      ])
    ])
  ]),
  h("div", { key: "actions", className: "mt-4 border-t border-slate-200 bg-white px-1 pt-4" }, [
    h("div", { key: "buttons", className: "flex flex-wrap gap-3" }, [
      h(Button, {
        key: "launch",
        disabled: !requiredFieldsReady || !launchReadiness.canLaunch,
        onClick: launchRun
      }, !requiredFieldsReady
        ? "Complete Required Fields"
        : launchReadiness.requiresReadinessReview && !preflightSummary
          ? "Run Audit Readiness First"
          : launchReadiness.requiresReadinessReview && !launchReadiness.accepted
            ? "Accept Audit Readiness First"
            : "Start Run")
    ]),
    h("div", { key: "times", className: "mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" }, [
      h("div", { key: "checked" }, `Checked: ${formatDate(preflightCheckedAt)}`),
      preflightSummary ? h("div", { key: "accepted" }, `Accepted: ${formatDate(preflightAcceptedAt)}`) : null
    ].filter(Boolean))
  ])
  ]));
}

window.TethermarkFeatures = {
  ...(window.TethermarkFeatures || {}),
  RunsWorkspace: RunsWorkspaceComponent,
  RunDetailShell: RunDetailShellComponent,
  FindingDetailShell: FindingDetailShellComponent,
  FindingsWorkspace: FindingsWorkspaceComponent,
  RunInboxList: RunInboxListComponent,
  LaunchAuditModal: LaunchAuditModalComponent
};
