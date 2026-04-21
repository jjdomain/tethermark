const React = window.React;
const h = React.createElement;

function RunDetailPanelComponent(props) {
  const {
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
  } = props.helpers;
  const {
    helpers,
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
  } = props;
  const FindingsWorkspace = window.TethermarkFeatures?.FindingsWorkspace;
  const findingDetailTabs = [
    ["summary", "Summary"],
    ["evidence", "Evidence"],
    ["evaluation", "Evaluation"],
    ["governance", "Governance"]
  ];
  if (!detail && !loading && window.TethermarkFeatures?.RunDetailShell) {
    return h(window.TethermarkFeatures.RunDetailShell, {
      loading,
      hasDetail: false,
      panels: [],
      helpers: { Button, Card }
    });
  }
  if (loading && window.TethermarkFeatures?.RunDetailShell) {
    return h(window.TethermarkFeatures.RunDetailShell, {
      loading,
      hasDetail: false,
      panels: [],
      helpers: { Button, Card }
    });
  }
  if (loading) {
    return h(Card, { title: "Run Detail", description: "Loading persisted run detail and planned profile.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "Loading run detail..."));
  }
  if (!detail) {
    return h(Card, { title: "Run Detail", description: "Select a run to compare planned launch posture with the executed configuration.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "text-sm text-slate-500" }, "No run selected."));
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
  const overviewItems = [
    { label: "Run Id", value: summary.run_id || run.id },
    { label: "Target", value: run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id || "n/a" },
    { label: "Status", value: summary.status || run.status },
    { label: "Review", value: summary.review_workflow_status || run.review_workflow?.status || "none" },
    { label: "Overall Score", value: String(summary.overall_score ?? run.overall_score ?? "n/a") },
    { label: "Current Reviewer", value: summary.current_reviewer_id || run.review_workflow?.current_reviewer_id || "unassigned" },
    { label: "Sandbox Readiness", value: summary.sandbox_execution?.readiness_status || "n/a" },
    { label: "Created", value: formatDate(summary.created_at || run.created_at) }
  ];
  const findingsRollupItems = [
    { label: "Needs Validation", value: String(findingEvaluations?.findings_needing_validation_count || 0) },
    { label: "Runtime Follow-up Required", value: String(findingEvaluations?.runtime_followup_required_count || 0) },
    { label: "Runtime Blocked", value: String(findingEvaluations?.runtime_validation_blocked_count || 0) },
    { label: "Runtime Failed", value: String(findingEvaluations?.runtime_validation_failed_count || 0) },
    { label: "Suppressed", value: String(findingEvaluations?.suppressed_finding_count || 0) },
    { label: "Waived", value: String(findingEvaluations?.waived_finding_count || 0) },
    { label: "Re-Review", value: String(findingEvaluations?.findings_needing_disposition_review_count || 0) },
    { label: "Due Soon", value: String(dueSoonDispositionFindingSummaries.length) },
    { label: "Conflicts", value: String((findingEvaluations?.conflict_pairs || []).length) },
    { label: "Duplicates", value: String((findingEvaluations?.duplicate_groups || []).length) }
  ];
  const panels = [
    h(Card, { key: "overview", title: "Run Detail", description: "Persisted summary and review state for the selected run.", className: "border-slate-200 bg-white shadow-sm" }, [
      h(DetailList, {
        key: "summary",
        items: overviewItems
      })
    ]),
    h(Card, { key: "runtime-followups", title: "Runtime Follow-up Queue", description: "Linked rerun work items created from runtime-sensitive review decisions.", className: "border-slate-200 bg-white shadow-sm" }, runtimeFollowups.length
      ? h("div", { className: "space-y-3" }, runtimeFollowups.map((followup) => h("div", {
        key: followup.id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "title", className: "font-medium text-slate-900" }, followup.finding_title || followup.finding_id),
            h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${followup.followup_policy} | requested ${formatDate(followup.requested_at)} by ${followup.requested_by}`)
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
          ? h("div", { key: "outcome", className: "mt-2 text-sm text-slate-500" }, followup.rerun_outcome_summary)
          : null,
        followup.resolution_notes
          ? h("div", { key: "notes", className: "mt-2 text-sm text-slate-500" }, followup.resolution_notes)
          : null,
        h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-3" }, [
          followup.rerun_request_json && (followup.status === "pending" || followup.status === "completed")
            ? h(Button, { key: "launch", onClick: () => onLaunchRuntimeFollowup?.(followup.id) }, "Launch Linked Rerun")
            : null
        ].filter(Boolean))
      ])))
      : h("div", { className: "text-sm text-slate-500" }, "No runtime follow-up items are linked to this run yet.")),
    h(Card, { key: "compare", title: "Planned Vs Executed", description: "Preflight launch profile is compared against the resolved configuration stored for the completed run.", className: "border-slate-200 bg-white shadow-sm" }, [
      plannedProfile
        ? h("div", { key: "planned", className: "space-y-4" }, [
          h("div", { key: "planned-title", className: "text-xs font-mono uppercase tracking-[0.28em] text-slate-500" }, "Planned Launch Profile"),
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
        : h("div", { key: "missing", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, "No persisted preflight summary is available for this run."),
      h("div", { key: "executed", className: "mt-5 space-y-4" }, [
        h("div", { key: "executed-title", className: "text-xs font-mono uppercase tracking-[0.28em] text-slate-500" }, "Executed Configuration"),
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
    h(Card, { key: "sandbox-execution", title: "Sandbox Execution", description: "Bounded install/build/test/runtime-probe readiness derived for runtime-capable runs.", className: "border-slate-200 bg-white shadow-sm" }, sandboxExecution
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
            className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          }, [
            h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "phase", className: "font-medium" }, `${planStep?.phase || "step"}: ${item.step_id}`),
                h("div", { key: "command", className: "text-sm text-slate-500" }, (planStep?.command || []).join(" ")),
                h("div", { key: "summary", className: "text-sm text-slate-500" }, item.summary),
                h("div", { key: "adapter", className: "text-xs text-slate-500" }, `adapter ${item.adapter || planStep?.adapter || "unknown"}${item.normalized_artifact?.title ? ` - ${item.normalized_artifact.title}` : ""}`)
              ]),
              h(Badge, { key: "status" }, item.status)
            ]),
            h("div", { key: "meta", className: "mt-2 space-y-1 text-xs text-slate-500" }, [
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
      : h("div", { className: "text-sm text-slate-500" }, "No sandbox execution planning data is available for this run.")),
    h(Card, { key: "intent", title: "Launch Intent", description: "What the operator submitted and whether the most recent preflight was explicitly accepted.", className: "border-slate-200 bg-white shadow-sm" }, launchIntent
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
          ? h("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, launchIntent.notes.join(" | "))
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No persisted launch intent is available for this run.")),
    h(Card, { key: "outbound", title: "Outbound Preview", description: "Prepared GitHub-facing payloads only. This does not post anything externally.", className: "border-slate-200 bg-white shadow-sm" }, outboundPreview
      ? h("div", { className: "space-y-4" }, [
        h("div", { key: "status-row", className: "flex flex-wrap gap-3" }, [
          h(Badge, { key: "mode" }, outboundPreview.policy?.mode || "disabled"),
          h(Badge, { key: "status" }, outboundPreview.readiness?.status || "unknown"),
          h(Badge, { key: "approval" }, outboundPreview.readiness?.approved ? "approved" : "approval_pending"),
          h(Badge, { key: "verification" }, outboundPreview.readiness?.verified ? "verified" : "verification_pending")
        ]),
        h("div", { key: "copy", className: "text-sm text-slate-500" }, (outboundPreview.readiness?.reasons || []).length ? outboundPreview.readiness.reasons.join(" ") : "Preview is available. External posting remains manual."),
        outboundApproval
          ? h("div", { key: "approved-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `Approved by ${outboundApproval.approved_by} at ${formatDate(outboundApproval.approved_at)}`)
          : null,
        outboundVerification
          ? h("div", { key: "verification-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `${outboundVerification.status} by ${outboundVerification.verified_by} at ${formatDate(outboundVerification.verified_at)}: ${outboundVerification.reason}`)
          : null,
        h("div", { key: "body", className: "rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm whitespace-pre-wrap" }, outboundPreview.preview_summary?.body || "No outbound body prepared."),
        h("div", { key: "actions", className: "space-y-3" }, (outboundPreview.proposed_actions || []).map((item, index) => h("div", {
          key: item.action_type + ":" + index,
          className: "rounded-2xl border border-slate-200 bg-slate-50 p-4"
        }, [
          h("div", { key: "title", className: "font-medium" }, item.action_type),
          h("pre", { key: "payload", className: "mt-2 overflow-x-auto text-xs text-slate-500" }, JSON.stringify(item.payload_preview, null, 2))
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
          ? h("div", { key: "send-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `${outboundSend.status} by ${outboundSend.attempted_by} at ${formatDate(outboundSend.attempted_at)}: ${outboundSend.reason}`)
          : null,
        outboundDelivery
          ? h("div", { key: "delivery-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `${outboundDelivery.status} by ${outboundDelivery.attempted_by} at ${formatDate(outboundDelivery.attempted_at)}: ${outboundDelivery.reason}${outboundDelivery.external_url ? ` (${outboundDelivery.external_url})` : ""}`)
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No outbound preview is available for this run.")),
    h(Card, { key: "webhook-deliveries", title: "Automation Webhooks", description: "Generic OSS automation hook deliveries for this run.", className: "border-slate-200 bg-white shadow-sm" }, webhookDeliveries.length
      ? h("div", { className: "space-y-3" }, webhookDeliveries.map((item) => h("div", {
        key: item.id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "row", className: "flex items-center justify-between gap-3" }, [
          h("div", { key: "copy" }, [
            h("div", { key: "event", className: "font-medium" }, item.event_type),
            h("div", { key: "meta", className: "text-sm text-slate-500" }, `${item.status} | ${formatDate(item.attempted_at)} | ${item.target_url}`)
          ]),
          h(Badge, { key: "status" }, item.status)
        ]),
        item.response_summary
          ? h("div", { key: "summary", className: "mt-2 text-sm text-slate-500" }, item.response_summary)
          : null
      ])))
      : h("div", { className: "text-sm text-slate-500" }, "No generic webhook deliveries were recorded for this run.")),
    h(Card, { key: "assignment", title: "Reviewer Assignment", description: "Assign ownership before review starts so the queue is explicitly owned.", className: "border-slate-200 bg-white shadow-sm" }, [
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
      h("div", { key: "assignment-meta", className: "mt-3 text-sm text-slate-500" }, "Current reviewer: " + (summary.current_reviewer_id || run.review_workflow?.current_reviewer_id || "none"))
    ]),
    h(Card, { key: "review-decisions", title: "Review Decisions", description: "Run-level reviewer actions and rerun gates.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "buttons", className: "flex flex-wrap gap-3" }, [
        h(Button, { key: "start", variant: "secondary", onClick: () => onRunReviewAction?.("start_review"), disabled: !detail }, "Start Review"),
        h(Button, { key: "approve", onClick: () => onRunReviewAction?.("approve_run"), disabled: !detail }, "Approve Run"),
        h(Button, { key: "reject", variant: "outline", onClick: () => onRunReviewAction?.("reject_run"), disabled: !detail }, "Reject Run"),
        h(Button, { key: "rerun", variant: "outline", onClick: () => onRunReviewAction?.("require_rerun"), disabled: !detail }, "Require Rerun")
      ]),
      h("div", { key: "hint", className: "mt-3 text-sm text-slate-500" }, "Use the run-level controls after finding adjudication is complete, or force a rerun when validation is still required.")
    ]),
    h(Card, { key: "handoff", title: "Reviewer Handoff", description: "Compact reviewer context for reassignment, triage, and unresolved findings.", className: "border-slate-200 bg-white shadow-sm" }, reviewSummary
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
          ? h("div", { key: "unresolved", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, `Unresolved: ${reviewSummary.handoff.unresolved_finding_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.findings_needing_disposition_review_ids?.length
          ? h("div", { key: "disposition-rereview", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Disposition re-review: ${reviewSummary.handoff.findings_needing_disposition_review_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.latest_notes?.length
          ? h("div", { key: "latest-notes", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Latest Notes"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, reviewSummary.handoff.latest_notes.map((note, index) => h("li", { key: `${index}:${note}` }, note)))
          ])
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No review summary is available for this run yet.")),
    h(Card, { key: "findings", title: "Findings And Results", description: "Drill into persisted evidence, control impact, remediation, and adjudication for a selected finding.", className: "border-slate-200 bg-white shadow-sm" }, findings.length
      ? h(FindingsWorkspace, {
        listPane: h("div", { key: "finding-list", className: "space-y-4" }, findings.map((finding) => {
          const state = findingReviewState?.[finding.id] || {};
          const summaryState = findingSummaries.find((item) => item.finding_id === finding.id) || null;
          const evaluationState = findingEvaluations?.evaluations?.find((item) => item.finding_id === finding.id) || null;
          return h("div", {
            key: finding.id,
            className: cn("rounded-2xl border px-4 py-4", selectedFinding?.id === finding.id ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50")
          }, [
            h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "title", className: "font-medium" }, finding.title || finding.id),
                h("div", { key: "meta", className: "mt-1 text-sm text-slate-500" }, `${finding.id} | ${finding.severity || "unknown"} severity`)
              ]),
              h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
                h(Badge, { key: "severity" }, (summaryState?.current_severity || finding.severity || "unknown")),
                summaryState ? h(Badge, { key: "status" }, summaryState.disposition) : null
              ].filter(Boolean))
            ]),
            finding.summary ? h("div", { key: "summary", className: "mt-3 text-sm text-foreground" }, finding.summary) : null,
            summaryState ? h("div", { key: "status-row", className: "mt-3 grid gap-3 md:grid-cols-3 text-sm text-slate-500" }, [
              h("div", { key: "visibility" }, `Visibility ${summaryState.current_visibility || "unknown"}`),
              h("div", { key: "reviewer" }, `Last reviewer ${summaryState.last_reviewer_id || "none"}`),
              h("div", { key: "when" }, `Last action ${formatDate(summaryState.last_action_at)}`)
            ]) : null,
            summaryState?.notes?.length
              ? h("div", { key: "notes", className: "mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" }, summaryState.notes.join(" | "))
              : null,
            h("div", { key: "inspect", className: "mt-4 flex items-center justify-between gap-3" }, [
              h("div", { key: "counts", className: "text-sm text-slate-500" }, [
                runtimeFollowupCount({ review_summary_counts: { runtime_followup_required_count: evaluationState?.runtime_followup_policy && evaluationState.runtime_followup_policy !== "none" && evaluationState.runtime_followup_policy !== "not_applicable" ? 1 : 0 } }) ? "Runtime follow-up required" : "No runtime follow-up",
                summaryState?.needs_disposition_review ? " | disposition re-review" : ""
              ].join("")),
              h(Button, {
                key: "open",
                variant: selectedFinding?.id === finding.id ? "secondary" : "outline",
                onClick: () => onSelectFinding?.(finding.id)
              }, selectedFinding?.id === finding.id ? "Viewing Detail" : "Open")
            ])
          ]);
        })),
        hasSelectedFinding: Boolean(selectedFinding),
        detailHeader: selectedFinding
          ? h("div", { key: "header", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" }, [
            h("div", { key: "title-row", className: "flex items-start justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, selectedFinding.category || "finding"),
                h("h4", { key: "title", className: "mt-2 font-serif text-2xl" }, selectedFinding.title),
                h("div", { key: "meta", className: "mt-2 text-sm text-slate-500" }, `${selectedFinding.id} | confidence ${selectedFinding.confidence} | source ${selectedFinding.source}`)
              ]),
              h("div", { key: "badges", className: "flex flex-wrap gap-2 justify-end" }, [
                h(Badge, { key: "severity" }, selectedFindingSummary?.current_severity || selectedFinding.severity),
                selectedFindingSummary ? h(Badge, { key: "disposition" }, selectedFindingSummary.disposition) : null,
                selectedFindingDisposition?.effective_disposition ? h(Badge, { key: "active-disposition" }, `${selectedFindingDisposition.effective_disposition.disposition_type} (${selectedFindingDisposition.effective_disposition.scope_level})`) : null
              ].filter(Boolean))
            ]),
            h("div", { key: "description", className: "mt-4 text-sm leading-6 text-foreground" }, selectedFinding.description)
          ])
          : null,
        comparisonContext: selectedComparisonFinding
          ? h("div", { key: "comparison-context", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Compared against prior finding ${selectedComparisonFinding.id} from run ${compareRunId || "n/a"}.`)
          : null,
        detailTabs: findingDetailTabs,
        helpers: { Button },
        emptyDetail: h("div", { key: "finding-empty", className: "rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500" }, "Select a finding from the queue to inspect evidence, evaluation, and governance detail."),
        renderDetailContent: ({ view: findingDetailView }) => h("div", { className: "space-y-4" }, [
                findingDetailView === "summary" ? h(Card, { key: "review-controls", title: "Review Controls", description: "Primary adjudication controls for the selected finding." }, [
              h("div", { key: "controls", className: "grid gap-4 md:grid-cols-3" }, [
                h(Field, { key: "visibility", label: "Visibility" }, h(Select, {
                  value: selectedFindingState.visibility_override || selectedFindingSummary?.current_visibility || "internal",
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "visibility_override", event.target.value)
                }, [
                  h("option", { key: "internal", value: "internal" }, "internal"),
                  h("option", { key: "public", value: "public" }, "public")
                ])),
                h(Field, { key: "severity-select", label: "Downgrade Severity" }, h(Select, {
                  value: selectedFindingState.updated_severity || selectedFindingSummary?.current_severity || "medium",
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "updated_severity", event.target.value)
                }, ["critical", "high", "medium", "low", "info"].map((level) => h("option", { key: level, value: level }, level)))),
                h(Field, { key: "notes", label: "Reviewer Notes" }, h(Input, {
                  value: selectedFindingState.notes || "",
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "notes", event.target.value),
                  placeholder: "optional reviewer notes"
                }))
              ]),
              h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-3" }, [
                h(Button, { key: "confirm", variant: "secondary", onClick: () => onFindingReviewAction?.(selectedFinding, "confirm_finding") }, "Confirm"),
                h(Button, { key: "suppress", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "suppress_finding") }, "Suppress"),
                h(Button, { key: "downgrade", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "downgrade_severity") }, "Apply Downgrade"),
                h(Button, { key: "validate", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "request_validation") }, "Request Validation"),
                selectedFindingEvaluation?.runtime_followup_policy === "rerun_in_capable_env"
                  ? h(Button, { key: "rerun-capable", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "rerun_in_capable_env") }, "Rerun In Capable Env")
                  : null,
                selectedFindingEvaluation?.runtime_followup_policy === "manual_runtime_review"
                  ? h(Button, { key: "manual-runtime-review", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "mark_manual_runtime_review_complete") }, "Manual Runtime Review Complete")
                  : null,
                selectedFindingEvaluation?.runtime_followup_policy !== "none" && selectedFindingEvaluation?.runtime_followup_policy !== "not_applicable"
                  ? h(Button, { key: "accept-runtime-gap", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "accept_without_runtime_validation") }, "Accept Without Runtime Validation")
                  : null
              ].filter(Boolean))
            ]) : null,
            findingDetailView === "summary" || findingDetailView === "evidence" ? h(Card, { key: "evidence", title: "Evidence And Impact", description: "Persisted evidence, linked standards, and direct control impact." }, [
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
              h("div", { key: "evidence-list", className: "mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Evidence"),
                Array.isArray(selectedFinding.evidence_json) && selectedFinding.evidence_json.length
                  ? h("ul", { key: "list", className: "mt-3 space-y-2 text-sm" }, selectedFinding.evidence_json.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  : h("div", { key: "empty", className: "mt-3 text-sm text-slate-500" }, "No persisted evidence strings are available for this finding."),
                selectedFindingEvaluation?.runtime_evidence_locations?.length
                  ? h("div", { key: "locations", className: "mt-4" }, [
                      h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Normalized Evidence Locations"),
                      h("ul", { key: "list", className: "mt-3 space-y-2 text-sm" }, selectedFindingEvaluation.runtime_evidence_locations.map((location, index) => h("li", { key: `${index}:${formatEvidenceLocation(location)}` }, formatEvidenceLocation(location))))
                    ])
                  : null
              ])
            ]) : null,
            findingDetailView === "summary" || findingDetailView === "evidence" ? h(Card, { key: "controls", title: "Affected Controls", description: "Normalized control results linked to the selected finding." }, relatedControls.length
              ? h("div", { className: "space-y-3" }, relatedControls.map((control) => h("div", {
                key: control.control_id,
                className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, `${control.control_id} - ${control.title}`),
                    h("div", { key: "meta", className: "text-sm text-slate-500" }, `${control.framework} / ${control.standard_ref}`)
                  ]),
                  h(Badge, { key: "status" }, control.status)
                ]),
                Array.isArray(control.rationale_json) && control.rationale_json.length
                  ? h("div", { key: "rationale", className: "mt-2 text-sm text-slate-500" }, control.rationale_json.join(" "))
                  : null
              ])))
              : h("div", { className: "text-sm text-slate-500" }, "No normalized control results are linked to this finding.")) : null,
            findingDetailView === "summary" || findingDetailView === "evidence" ? h(Card, { key: "runtime-evidence", title: "Runtime Validation Evidence", description: "Normalized build, test, and runtime-probe records captured from bounded sandbox execution." }, relatedRuntimeEvidence.length
              ? h("div", { className: "space-y-3" }, relatedRuntimeEvidence.map((item) => h("div", {
                key: item.id || item.evidence_id,
                className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, getEvidenceMetadata(item)?.normalized_artifact?.title || item.source_id || "sandbox evidence"),
                    h("div", { key: "meta", className: "text-sm text-slate-500" }, `${getEvidenceMetadata(item)?.phase || "unknown"} / ${getEvidenceMetadata(item)?.adapter || "unknown"} / ${getEvidenceMetadata(item)?.status || "unknown"}`)
                  ]),
                  h(Badge, { key: "status" }, getEvidenceMetadata(item)?.status || "unknown")
                ]),
                h("div", { key: "summary", className: "mt-2 text-sm" }, item.summary),
                getEvidenceLocations(item).length
                  ? h("ul", { key: "locations", className: "mt-2 space-y-1 text-sm text-slate-500" }, getEvidenceLocations(item).map((location, index) => h("li", { key: `${index}:${formatEvidenceLocation(location)}` }, formatEvidenceLocation(location))))
                  : null,
                runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact).length
                  ? h(DetailList, { key: "runtime-artifact-details", items: runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact) })
                  : null
              ])))
              : h("div", { className: "text-sm text-slate-500" }, "No normalized runtime validation evidence is linked to this finding.")) : null,
            findingDetailView === "summary" || findingDetailView === "evaluation" ? h(Card, { key: "review-grade", title: "Finding Evaluation", description: "Normalized evidence quality, duplicate/conflict analysis, and validation guidance derived from supervisor outputs." }, selectedFindingEvaluation
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
                h("div", { key: "reasoning", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, selectedFindingEvaluation.evidence_quality_summary || selectedFindingEvaluation.reasoning_summary),
                selectedFindingEvaluation.active_disposition_reason
                  ? h("div", { key: "disposition-reason", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, `Disposition reason: ${selectedFindingEvaluation.active_disposition_reason}`)
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
                  ? h("div", { key: "runtime-link-summaries", className: "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3" }, [
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
                      ? h("div", { key: "duplicates", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, [
                        h("div", { key: "title", className: "font-semibold" }, "Possible Duplicates"),
                        h("div", { key: "body", className: "mt-2 text-slate-500" }, selectedFindingEvaluation.duplicate_with_finding_ids.join(", ")),
                        selectedFindingEvaluation.evidence_symbols?.length
                          ? h("div", { key: "reason", className: "mt-2 text-xs text-cyan-900" }, `Shared evidence identity: ${selectedFindingEvaluation.evidence_symbols.join(", ")}`)
                          : null
                      ])
                      : null,
                    selectedFindingEvaluation.conflict_with_finding_ids?.length
                      ? h("div", { key: "conflicts", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, [
                        h("div", { key: "title", className: "font-semibold" }, "Conflicting Outcomes"),
                        h("div", { key: "body", className: "mt-2 text-slate-500" }, selectedFindingEvaluation.conflict_with_finding_ids.join(", ")),
                        selectedFindingEvaluation.evidence_symbols?.length
                          ? h("div", { key: "reason", className: "mt-2 text-xs text-amber-900" }, `Conflict linked by evidence identity: ${selectedFindingEvaluation.evidence_symbols.join(", ")}`)
                          : null
                      ])
                      : null
                  ].filter(Boolean))
                  : null,
                !selectedFindingEvaluation.evidence_quality_summary && relatedSupervisorGrade
                  ? h("div", { key: "fallback", className: "text-sm text-slate-500" }, relatedSupervisorGrade.reasoning_summary)
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
                : h("div", { className: "text-sm text-slate-500" }, "No normalized evaluation is available for this finding.")) : null,
            findingDetailView === "summary" || findingDetailView === "governance" ? h(Card, { key: "finding-dispositions", title: "Suppressions And Waivers", description: "Create explicit run suppressions or project waivers with reason and optional expiry." }, [
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
                  className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                }, [
                  h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                    h("div", { key: "kind", className: "font-medium" }, `${item.disposition_type} (${item.scope_level})`),
                    h(Badge, { key: "status" }, item.status)
                  ]),
                  h("div", { key: "meta", className: "mt-1 text-slate-500" }, `${item.created_by} | ${formatDate(item.created_at)}${item.expires_at ? ` | expires ${formatDate(item.expires_at)}` : ""}`),
                  item.metadata_json?.owner_id || item.metadata_json?.reviewed_at || item.metadata_json?.review_due_by
                    ? h("div", { key: "governance", className: "mt-1 text-slate-500" }, `owner ${item.metadata_json?.owner_id || "n/a"} | reviewed ${item.metadata_json?.reviewed_at ? formatDate(item.metadata_json.reviewed_at) : "n/a"} | review due ${item.metadata_json?.review_due_by ? formatDate(item.metadata_json.review_due_by) : "n/a"}`)
                    : null,
                  h("div", { key: "reason", className: "mt-2" }, item.reason),
                  h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-2" }, [
                    h(Button, { key: "edit", variant: "outline", onClick: () => onEditFindingDisposition?.(selectedFinding, item) }, "Load For Edit"),
                    h(Button, { key: "revoke", variant: "outline", onClick: () => onRevokeFindingDisposition?.(selectedFinding, item) }, "Revoke")
                  ])
                ])))
                : h("div", { key: "empty", className: "mt-4 text-sm text-slate-500" }, "No active suppression or waiver applies to this finding.")
              ,
              selectedFindingDispositionHistory.length
                ? h("div", { key: "history", className: "mt-4 space-y-3" }, selectedFindingDispositionHistory.map((item) => h("div", {
                  key: item.id,
                  className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                }, [
                  h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                    h("div", { key: "kind", className: "font-medium" }, `${item.disposition_type} (${item.scope_level})`),
                    h(Badge, { key: "status" }, item.status)
                  ]),
                  h("div", { key: "meta", className: "mt-1 text-slate-500" }, `${item.created_by} | ${formatDate(item.created_at)}${item.expires_at ? ` | expires ${formatDate(item.expires_at)}` : ""}${item.revoked_at ? ` | revoked ${formatDate(item.revoked_at)}` : ""}`),
                  h("div", { key: "reason", className: "mt-2" }, item.reason)
                ])))
                : null
            ]) : null,
            findingDetailView === "summary" || findingDetailView === "governance" ? h(Card, { key: "remediation", title: "Remediation And Observations", description: "Run-level remediation memo and nearby audit observations relevant to the selected finding." }, [
              remediation
                ? h("div", { key: "remediation-copy", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                  h("div", { key: "summary", className: "text-sm" }, remediation.summary),
                  Array.isArray(remediation.checklist_json) && remediation.checklist_json.length
                    ? h("ul", { key: "checklist", className: "mt-3 space-y-2 text-sm text-slate-500" }, remediation.checklist_json.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                    : null
                ])
                : h("div", { key: "remediation-empty", className: "text-sm text-slate-500" }, "No remediation memo is available for this run."),
              h("div", { key: "observations", className: "mt-4 space-y-3" }, relatedObservations.length
                ? relatedObservations.map((item, index) => h("div", {
                  key: `${index}:${item.title || item.summary || "observation"}`,
                  className: "rounded-2xl border border-slate-200 bg-white px-4 py-3"
                }, [
                  h("div", { key: "title", className: "font-medium" }, item.title || "Observation"),
                  h("div", { key: "summary", className: "mt-2 text-sm text-slate-500" }, item.summary || "n/a"),
                  Array.isArray(item.evidence) && item.evidence.length
                    ? h("div", { key: "evidence", className: "mt-2 text-xs text-slate-500" }, item.evidence.join(" | "))
                    : null
                ]))
                : h("div", { className: "text-sm text-slate-500" }, "No related observations were matched for this finding."))
            ]) : null
          ])
      })
      : h("div", { className: "text-sm text-slate-500" }, "No persisted findings are available for this run.")),
    h(Card, { key: "review-activity", title: "Review Activity", description: "Assignment context, reviewer notes, discussion, and timeline are grouped into one activity surface.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "notes-block", className: "space-y-5" }, [
        h("div", { key: "notes-head" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Reviewer Notes"),
          h("div", { key: "body", className: "mt-3" }, h(ReviewNotesTimeline, { actions: reviewActions }))
        ]),
        h("div", { key: "discussion-head" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Discussion"),
          h("div", { key: "body", className: "mt-3" }, h(ReviewCommentsPanel, {
            comments: reviewComments,
            commentBody,
            commentFindingId,
            findings,
            onCommentBodyChange,
            onCommentFindingChange,
            onSubmitComment
          }))
        ]),
        h("div", { key: "timeline-head" }, [
          h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Action Timeline"),
          h("div", { key: "body", className: "mt-3" }, h(ReviewActionTimeline, { actions: reviewActions }))
        ])
      ])
    ]),
    h(Card, { key: "findings-rollup", title: "Findings Rollup", description: "Compact run-level findings and disposition summary for review decisions.", className: "border-slate-200 bg-white shadow-sm" }, [
      h(DetailList, { key: "rollup", items: findingsRollupItems }),
      findingEvaluations?.runtime_strengthened_finding_count || findingEvaluations?.runtime_generated_finding_count || findingEvaluations?.runtime_weakened_finding_count
        ? h("div", { key: "runtime-impact", className: "mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" },
          `${findingEvaluations.runtime_strengthened_finding_count || 0} strengthened | ${findingEvaluations.runtime_generated_finding_count || 0} generated | ${findingEvaluations.runtime_weakened_finding_count || 0} weakened by runtime evidence`)
        : null,
      findingsNeedingDispositionReview.length
        ? h("div", { key: "rereview", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" },
          `Disposition re-review queue: ${findingsNeedingDispositionReview.map((item) => item.finding_id).join(", ")}`)
        : null
    ]),
    h(Card, { key: "notes-timeline", title: "Review Notes", description: "Reviewer notes separated from raw action history for faster handoff and audit context.", className: "border-slate-200 bg-white shadow-sm" }, h(ReviewNotesTimeline, { actions: reviewActions })),
    h(Card, { key: "evaluation-overview", title: "Evaluation Overview", description: "Run-level result evaluation derived from findings, supervisor review, and review workflow.", className: "border-slate-200 bg-white shadow-sm" }, findingEvaluations
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
      : h("div", { className: "text-sm text-slate-500" }, "No evaluation summary is available for this run.")),
    h(Card, { key: "disposition-lifecycle", title: "Disposition Lifecycle", description: "Track active suppressions/waivers, upcoming expiries, and findings that need explicit re-review.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 lg:grid-cols-4" }, [
        h("div", { key: "suppressed", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Suppressed"),
          suppressedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, suppressedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No active suppressions.")
        ]),
        h("div", { key: "waived", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Waived"),
          waivedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, waivedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No active waivers.")
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
    h(Card, { key: "discussion", title: "Review Discussion", description: "Comments are persisted separately from state-changing review actions.", className: "border-slate-200 bg-white shadow-sm" }, h(ReviewCommentsPanel, {
      comments: reviewComments,
      commentBody,
      commentFindingId,
      findings,
      onCommentBodyChange,
      onCommentFindingChange,
      onSubmitComment
    })),
    h(Card, { key: "audit-export", title: "Review Audit Export", description: "Export workflow, actions, comments, and derived summary as a single JSON bundle.", className: "border-slate-200 bg-white shadow-sm" }, h(Button, {
      variant: "outline",
      onClick: onExportReviewAudit,
      disabled: !detail
    }, "Download Review Audit")),
    h(Card, { key: "report-exports", title: "Report Exports", description: "Generate portable report formats from persisted findings and evaluation state.", className: "border-slate-200 bg-white shadow-sm" }, h("div", { className: "flex flex-wrap gap-3" }, [
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
    h(Card, { key: "comparison-preview", title: "Run Comparison Preview", description: compareRunId ? "Live diff against the selected comparison run, including evidence-identity matches." : "Set a comparison run ID to preview changed, new, and resolved findings inline.", className: "border-slate-200 bg-white shadow-sm" }, comparisonLoading
      ? h("div", { className: "text-sm text-slate-500" }, "Loading comparison preview...")
      : !compareRunId
        ? h("div", { className: "text-sm text-slate-500" }, "No comparison run selected.")
        : !comparisonPayload
          ? h("div", { className: "text-sm text-slate-500" }, "Comparison preview unavailable for the selected run pair.")
          : h("div", { className: "space-y-4" }, [
            h("div", { key: "summary", className: "grid gap-3 md:grid-cols-4" }, [
              h("div", { key: "overview", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, ComparisonSummaryText(comparisonPayload)),
              h("div", { key: "score", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, `Score ${comparisonPayload.summary?.compare_to_overall_score ?? "n/a"} -> ${comparisonPayload.summary?.current_overall_score ?? "n/a"}`),
              h("div", { key: "runtime-followup", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Runtime follow-up ${comparisonPayload.summary?.compare_to_runtime_followup_required_count ?? 0} -> ${comparisonPayload.summary?.current_runtime_followup_required_count ?? 0}`),
              h("div", { key: "runtime-blocked", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Runtime blocked ${comparisonPayload.summary?.compare_to_runtime_validation_blocked_count ?? 0} -> ${comparisonPayload.summary?.current_runtime_validation_blocked_count ?? 0}`)
            ]),
            changedComparisonItems.length ? h("div", { key: "changed", className: "space-y-3" }, [
              h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Changed Findings"),
              h("div", { key: "navigation", className: "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, [
                h("div", { key: "position", className: "text-slate-500" }, selectedChangedComparisonIndex >= 0
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
                className: `rounded-2xl border px-4 py-3 ${selectedFindingId === item.current_finding_id || selectedComparisonFindingId === item.previous_finding_id ? "border-indigo-300 bg-indigo-50/70" : "border-slate-200 bg-slate-50"}`
              }, [
                h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
                  h("div", { key: "title", className: "font-medium" }, `${item.title} (${item.category})`),
                  h("div", { key: "badge-wrap", className: "flex flex-wrap gap-2" }, [
                    h(Badge, { key: "match" }, item.match_strategy === "evidence_symbols" ? "matched by evidence identity" : "matched by finding signature"),
                    item.shared_evidence_symbols?.length ? h(Badge, { key: "symbols", tone: "success" }, item.shared_evidence_symbols.join(", ")) : null
                  ].filter(Boolean))
                ]),
                h("div", { key: "meta", className: "mt-1 text-xs text-slate-500" }, `${item.previous_finding_id} -> ${item.current_finding_id}`),
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
            ]) : h("div", { key: "no-changes", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, "No changed findings in this comparison."),
            h("div", { key: "other-groups", className: "grid gap-4 md:grid-cols-2" }, [
              h("div", { key: "new", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "New Findings"),
                comparisonPayload.new_findings?.length
                  ? h("div", { key: "list", className: "mt-2 space-y-2 text-sm" }, comparisonPayload.new_findings.slice(0, 6).map((item) => h("div", {
                    key: item.finding_id || item.signature,
                    className: "rounded-xl border border-slate-200 bg-white px-3 py-2"
                  }, [
                    h("div", { key: "text" }, `${item.title} (${item.category})${item.evidence_symbols?.length ? ` [${item.evidence_symbols.join(", ")}]` : ""}`),
                    item.finding_id ? h("div", { key: "actions", className: "mt-2" }, h(Button, {
                      variant: "outline",
                      onClick: () => onSelectFinding?.(item.finding_id)
                    }, "Inspect Finding")) : null
                  ])))
                  : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No new findings.")
              ]),
              h("div", { key: "resolved", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Resolved Findings"),
                comparisonPayload.resolved_findings?.length
                  ? h("div", { key: "list", className: "mt-2 space-y-2 text-sm" }, comparisonPayload.resolved_findings.slice(0, 6).map((item) => h("div", {
                    key: item.finding_id || item.signature,
                    className: "rounded-xl border border-slate-200 bg-white px-3 py-2"
                  }, [
                    h("div", { key: "text" }, `${item.title} (${item.category})${item.evidence_symbols?.length ? ` [${item.evidence_symbols.join(", ")}]` : ""}`),
                    item.finding_id ? h("div", { key: "actions", className: "mt-2" }, h(Button, {
                      variant: "outline",
                      onClick: () => onSelectComparisonFinding?.(item.finding_id)
                    }, "Inspect Prior Finding")) : null
                  ])))
                  : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No resolved findings.")
              ])
            ]),
            compareRunId ? h(Card, {
              key: "comparison-detail",
              title: "Prior Run Finding Detail",
              description: selectedComparisonFindingId ? "Inspect the matched finding from the comparison run." : "Choose a resolved finding to inspect prior-run context."
            }, comparisonDetailLoading
              ? h("div", { className: "text-sm text-slate-500" }, "Loading prior-run detail...")
              : !selectedComparisonFinding
                ? h("div", { className: "text-sm text-slate-500" }, "No prior-run finding selected.")
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
                    : h("div", { key: "no-diffs", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, "No field-level differences between the selected current and prior findings."),
                  selectedComparisonFinding.description ? h("div", { key: "description", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, selectedComparisonFinding.description) : null
                ]))
              : null
          ])),
    h(Card, { key: "indexed-exports", title: "Machine-readable Exports", description: "Per-run export catalog for versioned JSON contracts and portable report artifacts.", className: "border-slate-200 bg-white shadow-sm" }, indexedExports.length
      ? h("div", { className: "space-y-3" }, indexedExports.map((item) => h("div", {
        key: `${item.export_type}:${item.format}:${item.route}`,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between" }, [
          h("div", { key: "meta", className: "space-y-1" }, [
            h("div", { key: "title", className: "font-medium text-foreground" }, `${item.export_type.replace(/_/g, " ")} (${item.format})`),
            h("div", { key: "filename", className: "text-sm text-slate-500" }, item.filename),
            h("div", { key: "route", className: "break-all text-xs font-mono text-slate-500" }, item.route),
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
      : h("div", { className: "text-sm text-slate-500" }, "No export catalog is available for this run.")),
    h(Card, { key: "comparison-export", title: "Run Comparison", description: "Compare this run against a prior run or linked rerun and export the diff.", className: "border-slate-200 bg-white shadow-sm" }, [
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
      h("div", { key: "hint", className: "mt-3 text-sm text-slate-500" }, "Use a previous run id or a linked rerun run id to export a direct run-to-run diff.")
    ]),
    h(Card, { key: "timeline", title: "Review Timeline", description: "Persisted reviewer actions, assignment history, and adjudication trail.", className: "border-slate-200 bg-white shadow-sm" }, h(ReviewActionTimeline, { actions: reviewActions })),
    h(Card, { key: "providers", title: "Provider Readiness", description: "Persisted preflight provider readiness at launch time.", className: "border-slate-200 bg-white shadow-sm" }, preflight?.provider_readiness?.length
      ? h("div", { className: "space-y-3" }, preflight.provider_readiness.map((item) => h("div", {
        key: item.provider_id,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      }, [
        h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
          h("div", { key: "label", className: "font-medium" }, `${item.provider_id} (${item.provider_kind})`),
          h(Badge, { key: "status" }, item.status)
        ]),
        h("div", { key: "summary", className: "mt-2 text-sm text-slate-500" }, item.summary)
      ])))
      : h("div", { className: "text-sm text-slate-500" }, "No provider readiness data is available for this run."))
  ];
  if (window.TethermarkFeatures?.RunDetailShell) {
    return h(window.TethermarkFeatures.RunDetailShell, {
      loading: false,
      hasDetail: true,
      panels,
      helpers: { Button, Card }
    });
  }
  return h("div", { className: "space-y-6" }, panels);
}

window.TethermarkFeatures = {
  ...(window.TethermarkFeatures || {}),
  RunDetailPanel: RunDetailPanelComponent
};

