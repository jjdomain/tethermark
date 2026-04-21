const React = window.React;
const h = React.createElement;

function computeTargetValue(runForm) {
  if (runForm.target_kind === "repo") return runForm.repo_url || "";
  if (runForm.target_kind === "endpoint") return runForm.endpoint_url || "";
  return runForm.local_path || "";
}

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
  const { useState } = React;
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
  const { useState } = React;
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
  const {
    Modal,
    Button,
    Field,
    Input,
    Select,
    Badge,
    LaunchStatusCard,
    cn,
    formatDate
  } = helpers;
  const preflightStatus = preflightSummary
    ? (launchReadiness.accepted ? "accepted" : (preflightSummary.readiness?.status || "ready").replace(/_/g, " "))
    : "not run";
  const targetStepComplete = Boolean(computeTargetValue(runForm).trim()) && !launchReadiness.issues.some((issue) => issue.includes("target"));
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

window.TethermarkFeatures = {
  ...(window.TethermarkFeatures || {}),
  RunsWorkspace: RunsWorkspaceComponent,
  RunDetailShell: RunDetailShellComponent,
  FindingDetailShell: FindingDetailShellComponent,
  FindingsWorkspace: FindingsWorkspaceComponent,
  RunInboxList: RunInboxListComponent,
  LaunchAuditModal: LaunchAuditModalComponent
};
