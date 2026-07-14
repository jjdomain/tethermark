const React = window.React;
const h = React.createElement;

function severityChipClass(severity) {
  const level = String(severity || "unknown").toLowerCase();
  if (level === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (level === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (level === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  if (level === "low") return "border-sky-200 bg-sky-50 text-sky-700";
  if (level === "info") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-slate-200 bg-white text-slate-500";
}

function dispositionChipClass(disposition) {
  const state = String(disposition || "unknown").toLowerCase();
  if (state === "open") return "border-blue-200 bg-blue-50 text-blue-700";
  if (state === "confirmed") return "border-red-200 bg-red-50 text-red-700";
  if (["remediation_open", "fix_in_progress", "verification_pending", "reopened"].includes(state)) return "border-blue-200 bg-blue-50 text-blue-700";
  if (state === "suppressed" || state === "waived") return "border-slate-200 bg-slate-50 text-slate-600";
  if (state === "resolved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-white text-slate-500";
}

function findingChip(label, value, className = "border-slate-200 bg-slate-50 text-slate-600") {
  const text = label ? `${label} ${value}` : String(value || "unknown");
  return h("span", { key: `${label}:${value}`, className: `inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${className}` }, text);
}

function qualityChipClass(value) {
  const state = String(value || "unknown").toLowerCase();
  if (["supported", "correct", "pass", "ready_for_review"].includes(state)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["partially_supported", "plausible", "weak", "needs_review", "manual_review"].includes(state)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["unsupported", "wrong_control", "missing_control", "fail", "needs_evidence", "fix_control_mapping", "downgrade_or_reword", "needs_runtime_validation"].includes(state)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function AssistantIcon({ kind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-5 w-5"
  };
  if (kind === "history") return h("svg", common, [
    h("path", { key: "clock", d: "M3 12a9 9 0 1 0 3-6.7" }),
    h("path", { key: "arrow", d: "M3 4v5h5" }),
    h("path", { key: "hand", d: "M12 7v5l3 2" })
  ]);
  if (kind === "settings") return h("svg", common, [
    h("path", { key: "circle", d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" }),
    h("path", { key: "gear", d: "M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06A1.8 1.8 0 0 0 8.4 19.3a1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 1 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.8 14.7 1.8 1.8 0 0 0 2.15 13H2a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.7 7.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 8.3 3a1.8 1.8 0 0 0 1.09-1.65V1.3a2.1 2.1 0 0 1 4.2 0v.06A1.8 1.8 0 0 0 14.8 3a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98A1.8 1.8 0 0 0 21 8.7h.06a2.1 2.1 0 0 1 0 4.2H21A1.8 1.8 0 0 0 19.4 15Z" })
  ]);
  if (kind === "compose") return h("svg", common, [
    h("path", { key: "box", d: "M12 20h9" }),
    h("path", { key: "pen", d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" })
  ]);
  if (kind === "close") return h("svg", common, [
    h("path", { key: "a", d: "M18 6 6 18" }),
    h("path", { key: "b", d: "m6 6 12 12" })
  ]);
  if (kind === "fullscreen") return h("svg", common, [
    h("path", { key: "a", d: "M8 3H5a2 2 0 0 0-2 2v3" }),
    h("path", { key: "b", d: "M16 3h3a2 2 0 0 1 2 2v3" }),
    h("path", { key: "c", d: "M8 21H5a2 2 0 0 1-2-2v-3" }),
    h("path", { key: "d", d: "M16 21h3a2 2 0 0 0 2-2v-3" })
  ]);
  if (kind === "plus") return h("svg", common, [
    h("path", { key: "h", d: "M12 5v14" }),
    h("path", { key: "v", d: "M5 12h14" })
  ]);
  if (kind === "send") return h("svg", common, [
    h("path", { key: "stem", d: "M12 19V5" }),
    h("path", { key: "head", d: "m5 12 7-7 7 7" })
  ]);
  if (kind === "terminal") return h("svg", common, [
    h("rect", { key: "rect", x: "3", y: "5", width: "18", height: "14", rx: "2" }),
    h("path", { key: "prompt", d: "m7 9 3 3-3 3" }),
    h("path", { key: "line", d: "M13 15h4" })
  ]);
  return h("svg", common, h("circle", { cx: "12", cy: "12", r: "8" }));
}

function assistantRelativeTime(value) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function controlAssessmentLabel(control, { findingContext = false } = {}) {
  const status = String(control?.status || "unknown").toLowerCase();
  const assessability = String(control?.assessability || "").toLowerCase();
  const applicability = String(control?.applicability || "").toLowerCase();
  if (applicability === "not_applicable" || status === "not_applicable") {
    return findingContext ? "Scope mismatch" : "Not applicable";
  }
  if (assessability === "not_assessed" || status === "not_assessed") return "Not assessed";
  if (status === "pass") return "Passed";
  if (status === "fail") return "Failed";
  if (status === "partial") return "Issue found";
  return status.replace(/_/g, " ");
}

function controlAssessmentDetail(control) {
  const parts = [
    control?.status ? `status ${control.status}` : null,
    control?.assessability ? `assessability ${control.assessability}` : null,
    Number.isFinite(control?.score_awarded) && Number.isFinite(control?.max_score) ? `score ${control.score_awarded}/${control.max_score}` : null
  ].filter(Boolean);
  return parts.join(" / ") || "No normalized assessment detail is available.";
}

function decisionLabel(value) {
  const state = String(value || "unknown").toLowerCase();
  if (state === "needs_validation") return "Needs validation";
  if (state === "false_positive") return "False positive";
  if (state === "out_of_scope") return "Not applicable";
  if (state === "accepted_risk") return "Accepted risk";
  if (state === "suppressed") return "Not applicable";
  if (state === "waived") return "Accepted risk";
  if (state === "confirmed") return "Confirmed";
  if (state === "remediation_open") return "Remediation open";
  if (state === "fix_in_progress") return "Fix in progress";
  if (state === "verification_pending") return "Verification pending";
  if (state === "resolved") return "Resolved";
  if (state === "reopened") return "Reopened";
  if (state === "open") return "Open";
  return state.replace(/_/g, " ");
}

function decisionStateLabel(summary) {
  const triageDecision = summary?.triage_decision;
  if (triageDecision) return decisionLabel(triageDecision);
  return decisionLabel(summary?.disposition || "open");
}

function exceptionRecordLabel(record) {
  const triageDecision = record?.metadata_json?.triage_decision;
  if (triageDecision === "accepted_risk" || record?.disposition_type === "waiver") return "Risk acceptance";
  if (triageDecision === "false_positive") return "False positive";
  if (triageDecision === "out_of_scope" || record?.disposition_type === "suppression") return "Not applicable";
  return "Exception";
}

function appliesToLabel(scope) {
  return scope === "project" || scope === "future_repo" ? "Future scans for this repo" : "This run";
}

function activeExceptionCopy(record) {
  return `${exceptionRecordLabel(record)} / ${appliesToLabel(record?.scope_level)}`;
}

function findingStatusChips({ finding, summary, disposition }) {
  const severity = summary?.current_severity || finding?.severity || "unknown";
  const decision = summary ? decisionStateLabel(summary) : decisionLabel("open");
  return [
    findingChip("", severity, severityChipClass(severity)),
    findingChip("", decision, dispositionChipClass(summary?.disposition || "open")),
    disposition?.effective_disposition ? findingChip("exception", activeExceptionCopy(disposition.effective_disposition)) : null
  ].filter(Boolean);
}

function actionLabel(value) {
  const state = String(value || "unknown").toLowerCase();
  if (state === "ready_for_review") return "ready for review";
  if (state === "request_validation") return "review needed";
  if (state === "deduplicate") return "deduplicate";
  if (state === "review_conflict") return "review conflict";
  if (state === "manual_review") return "manual review";
  if (state === "suppressed") return "handled";
  if (state === "waived") return "handled";
  if (state === "review_expired_disposition") return "review exception";
  if (state === "rerun_in_capable_env") return "rerun required";
  return state.replace(/_/g, " ");
}

const findingFieldHelp = {
  "Severity": "The effective severity after audit scoring and any reviewer override.",
  "Decision": "The current reviewer outcome for this finding, such as confirmed, not applicable, false positive, accepted risk, or needs validation.",
  "Confidence": "How strongly the audit evidence supports this finding on a 0 to 1 scale.",
  "Source": "The source that produced or normalized the finding, such as a tool, policy check, or agent review.",
  "Needs Human Review": "Whether the finding requires a reviewer before it can be considered final.",
  "Score Impact": "The score penalty or weight this finding contributes to the run result.",
  "Standards": "Security standards, frameworks, or control references linked to the finding.",
  "Active Exception": "The effective exception currently controlling this finding, if one applies.",
  "Priority": "Reviewer-assigned handling priority for triage and follow-up work.",
  "Follow-up Needed": "The validation or review action expected before this finding can be closed.",
  "Publication State": "Publisher-only classification for whether finding details are safe to publish externally.",
  "Evidence Sufficiency": "How complete the available evidence is for supporting a final decision.",
  "False Positive Risk": "The estimated chance that the finding may not represent a real issue.",
  "Runtime Validation Status": "Whether runtime validation was attempted, skipped, completed, or blocked.",
  "Runtime Follow-up Policy": "The policy-selected follow-up path when runtime validation is needed.",
  "Runtime Follow-up Resolution": "The reviewer resolution for runtime follow-up work.",
  "Runtime Follow-up Outcome": "The outcome observed from a linked runtime follow-up or rerun.",
  "Linked Rerun Run": "The run id of the runtime follow-up or rerun linked to this finding.",
  "Runtime Impact": "How runtime validation changed the confidence or handling of this finding.",
  "Runtime Evidence Count": "Number of runtime evidence records linked to this finding.",
  "Validation Recommended": "Whether the evaluator recommends more validation before final disposition.",
  "Triage Decision": "The reviewer classification recorded for this finding.",
  "Exception Status": "Whether an exception is active, expired, revoked, or absent.",
  "Evidence Symbols": "Normalized identifiers used to deduplicate or relate findings across evidence sources.",
  "Risk Owner": "The person or role accountable for an accepted-risk decision.",
  "Reviewed At": "When the risk acceptance or exception was reviewed.",
  "Review Due By": "When the exception or accepted-risk decision should be reviewed again.",
  "Reasoning": "Evaluator rationale supporting the normalized finding assessment."
};

function helpForFindingField(label) {
  return findingFieldHelp[label] || "Additional context for this finding field.";
}

function RunDetailPanelComponent(props) {
  const {
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
  } = props;
  const { useState } = React;
  const [findingSeverityFilter, setFindingSeverityFilter] = useState("all");
  const [findingDispositionFilter, setFindingDispositionFilter] = useState("all");
  const [assistantPromptsExpanded, setAssistantPromptsExpanded] = useState(false);
  const [assistantHistoryExpanded, setAssistantHistoryExpanded] = useState(false);
  const [remediationDrafts, setRemediationDrafts] = useState({});
  const FindingsWorkspace = window.TethermarkFeatures?.FindingsWorkspace;
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
  const remediationItems = detail.remediationItems?.remediation_items || [];
  const reviewActions = detail.reviewActions?.review_actions || [];
  const reviewSummary = detail.reviewSummary?.review_summary || null;
  const runtimeFollowups = detail.runtimeFollowups?.runtime_followups || [];
  const learningEvents = detail.learning?.learning_events || [];
  const learningCandidates = detail.learning?.learning_candidates || [];
  const indexedExports = detail.exportsIndex?.export_index?.exports || [];
  const findingDispositions = detail.findingDispositions?.finding_dispositions || [];
  const resolvedFindingDispositions = detail.findingDispositions?.resolved_finding_dispositions || [];
  const agentInvocations = detail.agentInvocations?.agent_invocations || [];
  const metrics = detail.metrics?.metrics || [];
  const observabilitySummary = detail.observabilitySummary || null;
  const toolAdapterSummary = detail.toolAdapters || null;
  const toolAdapterBuckets = toolAdapterSummary?.buckets || [];
  const findingEvaluations = detail.findingEvaluations?.finding_evaluations || null;
  const findingQuality = detail.findingQuality?.finding_quality || null;
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
  const findingSummaryById = new Map(findingSummaries.map((item) => [item.finding_id, item]));
  const findingQualityById = new Map((findingQuality?.findings || []).map((item) => [item.finding_id, item]));
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4, unknown: 5 };
  const severityOptions = Array.from(new Set(findings.map((finding) => (findingSummaryById.get(finding.id)?.current_severity || finding.severity || "unknown").toLowerCase())))
    .sort((a, b) => (severityRank[a] ?? 99) - (severityRank[b] ?? 99) || a.localeCompare(b));
  const dispositionOptions = Array.from(new Set(findings.map((finding) => findingSummaryById.get(finding.id)?.disposition || "unknown"))).sort();
  const filterFindingsFor = (severityFilter, dispositionFilter) => findings.filter((finding) => {
    const summaryState = findingSummaryById.get(finding.id);
    const severity = (summaryState?.current_severity || finding.severity || "unknown").toLowerCase();
    const disposition = summaryState?.disposition || "unknown";
    if (severityFilter !== "all" && severity !== severityFilter) return false;
    if (dispositionFilter !== "all" && disposition !== dispositionFilter) return false;
    return true;
  });
  const visibleFindings = filterFindingsFor(findingSeverityFilter, findingDispositionFilter);
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
  const selectedFindingQuality = selectedFinding ? findingQualityById.get(selectedFinding.id) || null : null;
  const selectedFindingDisposition = selectedFinding ? resolvedFindingDispositions.find((item) => item.finding_id === selectedFinding.id) || null : null;
  const selectedFindingDispositionHistory = selectedFinding
    ? findingDispositions.filter((item) => item.finding_id === selectedFinding.id || (item.scope_level === "project" && item.finding_signature === selectedFindingDisposition?.finding_signature))
    : [];
  const selectedRemediationItem = selectedFinding ? remediationItems.find((item) => item.finding_id === selectedFinding.id) || null : null;
  const selectedRemediationDraft = selectedFinding
    ? {
        status: selectedRemediationItem?.status || "open",
        owner_id: selectedRemediationItem?.owner_id || "",
        priority: selectedRemediationItem?.priority || selectedFindingSummary?.review_priority || "",
        due_at: selectedRemediationItem?.due_at || "",
        summary: selectedRemediationItem?.summary || `Remediate confirmed finding: ${selectedFinding.title || selectedFinding.id}`,
        acceptance_criteria: selectedRemediationItem?.acceptance_criteria || "A validation audit no longer reproduces this finding, or the reviewer records explicit closure evidence.",
        external_issue_url: selectedRemediationItem?.external_issue_url || "",
        external_pr_url: selectedRemediationItem?.external_pr_url || "",
        fix_commit_sha: selectedRemediationItem?.fix_commit_sha || "",
        validation_run_id: selectedRemediationItem?.validation_run_id || "",
        resolution_notes: selectedRemediationItem?.resolution_notes || "",
        ...(remediationDrafts[selectedFinding.id] || {})
      }
    : {};
  const selectedActiveDisposition = selectedFindingDisposition?.effective_status === "active" ? selectedFindingDisposition.effective_disposition : null;
  const selectedActiveDispositionStoredDecision = selectedActiveDisposition?.metadata_json?.triage_decision;
  const selectedActiveDispositionDecision = ["accepted_risk", "false_positive", "out_of_scope"].includes(selectedActiveDispositionStoredDecision)
    ? selectedActiveDispositionStoredDecision
    : selectedActiveDisposition?.disposition_type === "waiver"
    ? "accepted_risk"
    : selectedActiveDisposition?.disposition_type === "suppression"
      ? "out_of_scope"
      : "";
  const selectedFindingState = selectedFinding ? (findingReviewState?.[selectedFinding.id] || {}) : {};
  const selectedTriageDecision = selectedActiveDispositionDecision || selectedFindingState.triage_decision || "confirmed";
  const findingDetailTabs = [
    ["evidence", "Evidence"],
    ["evaluation", "Evaluation"],
    ["governance", "Triage"],
    ["remediation", "Remediation"]
  ];
  const selectedTriageRequiresDisposition = selectedTriageDecision === "accepted_risk" || selectedTriageDecision === "out_of_scope" || selectedTriageDecision === "false_positive";
  const selectedTriageRequiresWaiverMetadata = selectedTriageDecision === "accepted_risk";
  const selectedExceptionScope = selectedFindingState.exception_scope
    || (selectedActiveDisposition?.scope_level === "project" ? "future_repo" : "")
    || (selectedTriageDecision === "accepted_risk" || selectedTriageDecision === "false_positive" ? "future_repo" : "this_run");
  const selectedExceptionScopeLevel = selectedExceptionScope === "future_repo" ? "project" : "run";
  const selectedTriageConflictsWithActiveDisposition = Boolean(
    selectedActiveDispositionDecision
    && selectedTriageDecision
    && selectedTriageDecision !== selectedActiveDispositionDecision
  );
  const selectedTriageFieldsEditable = !selectedActiveDisposition;
  const selectedDispositionReasonReady = Boolean(String(selectedFindingState.disposition_reason || "").trim());
  const selectedWaiverOwnerReady = Boolean(String(selectedFindingState.disposition_owner_id || "").trim());
  const selectedWaiverReviewedReady = Boolean(String(selectedFindingState.disposition_reviewed_at || "").trim());
  const selectedFutureExpiryReady = selectedExceptionScope !== "future_repo" || Boolean(String(selectedFindingState.disposition_expires_at || "").trim());
  const selectedExceptionFieldsReady = selectedTriageDecision === "accepted_risk"
    ? selectedDispositionReasonReady && selectedWaiverOwnerReady && selectedWaiverReviewedReady && selectedFutureExpiryReady
    : selectedTriageDecision === "out_of_scope" || selectedTriageDecision === "false_positive"
      ? selectedDispositionReasonReady && selectedFutureExpiryReady
      : true;
  const selectedTriageCanCommit = !selectedActiveDisposition && selectedExceptionFieldsReady && !selectedTriageConflictsWithActiveDisposition;
  const selectedMissingFields = [
    selectedTriageRequiresDisposition && !selectedDispositionReasonReady ? "reason" : null,
    selectedTriageRequiresDisposition && !selectedFutureExpiryReady ? "expiry for future scans" : null,
    selectedTriageDecision === "accepted_risk" && !selectedWaiverOwnerReady ? "risk owner" : null,
    selectedTriageDecision === "accepted_risk" && !selectedWaiverReviewedReady ? "reviewed at" : null
  ].filter(Boolean);
  function findingItems(items) {
    return items.map((item) => ({ ...item, help: item.help || helpForFindingField(item.label) }));
  }
  function fieldLabel(label, help = helpForFindingField(label)) {
    if (!help || !HoverCard) return label;
    return h("span", { className: "inline-flex items-center gap-1.5" }, [
      h("span", { key: "text" }, label),
      h(HoverCard, {
        key: "help",
        trigger: h("button", {
          type: "button",
          className: "inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold leading-none text-slate-500 hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200",
          "aria-label": `${label} help`,
          title: `${label} help`,
          onClick: (event) => event.preventDefault()
        }, "?")
      }, h("div", { className: "text-sm leading-6 text-slate-600" }, help))
    ]);
  }
  function evidenceLocationLabel(location) {
    const label = String(location?.label || location?.source_kind || "location").replace(/_/g, " ");
    return label;
  }
  function renderEvidenceLocationRow(location, index, keyPrefix = "location") {
    const primary = location?.path || location?.uri || location?.symbol || formatEvidenceLocation(location);
    const lineParts = [
      Number.isFinite(location?.line) ? `line ${location.line}` : null,
      Number.isFinite(location?.column) ? `column ${location.column}` : null
    ].filter(Boolean);
    return h("div", {
      key: `${keyPrefix}:${index}:${formatEvidenceLocation(location)}`,
      className: "grid gap-2 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
    }, [
      h("div", { key: "copy", className: "min-w-0" }, [
        h("div", { key: "primary", className: "break-words text-sm font-medium text-slate-900" }, primary),
        lineParts.length
          ? h("div", { key: "lines", className: "mt-1 text-xs text-slate-500" }, lineParts.join(" / "))
          : null
      ]),
      h("div", { key: "kind", className: "flex items-start justify-start sm:justify-end" },
        findingChip("", evidenceLocationLabel(location), "border-slate-200 bg-slate-50 text-slate-600")
      )
    ]);
  }
  function renderProvenanceSection({ selectedFinding, selectedFindingEvaluation, relatedRuntimeEvidence }) {
    const normalizedLocations = selectedFindingEvaluation?.runtime_evidence_locations || [];
    const runtimeLocations = (relatedRuntimeEvidence || []).flatMap((item) => getEvidenceLocations(item));
    const evidenceSymbols = selectedFindingEvaluation?.evidence_symbols || [];
    const hasProvenance = normalizedLocations.length || runtimeLocations.length || evidenceSymbols.length || selectedFinding.source || selectedFinding.standards_refs_json?.length;
    if (!hasProvenance) return null;
    return h(Card, { key: "provenance", title: "Provenance", description: "SARIF-style source references used for traceability, exports, and finding matching." }, [
      h("details", { key: "details", className: "rounded-2xl border border-slate-200 bg-white" }, [
        h("summary", { key: "summary", className: "cursor-pointer px-4 py-3 text-sm font-medium text-slate-900" }, "Show evidence references"),
        h("div", { key: "content", className: "border-t border-slate-200" }, [
          h("div", { key: "meta", className: "flex flex-wrap gap-1.5 px-4 py-3" }, [
            selectedFinding.source ? findingChip("source", selectedFinding.source) : null,
            ...(selectedFinding.standards_refs_json || []).map((standard) => findingChip("standard", standard, "border-slate-200 bg-slate-50 text-slate-700")),
            ...evidenceSymbols.map((symbol) => findingChip("symbol", symbol, "border-cyan-200 bg-cyan-50 text-cyan-800"))
          ].filter(Boolean)),
          normalizedLocations.length
            ? h("div", { key: "normalized", className: "border-t border-slate-200" }, [
              h("div", { key: "title", className: "px-4 pt-3 text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Normalized Locations"),
              h("div", { key: "rows", className: "mt-2 max-h-64 overflow-y-auto border-t border-slate-200" },
                normalizedLocations.map((location, index) => renderEvidenceLocationRow(location, index, "normalized-location"))
              )
            ])
            : null,
          runtimeLocations.length
            ? h("div", { key: "runtime", className: "border-t border-slate-200" }, [
              h("div", { key: "title", className: "px-4 pt-3 text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Runtime Evidence Locations"),
              h("div", { key: "rows", className: "mt-2 max-h-64 overflow-y-auto border-t border-slate-200" },
                runtimeLocations.map((location, index) => renderEvidenceLocationRow(location, index, "runtime-location"))
              )
            ])
            : null
        ])
      ])
    ]);
  }
  function evaluationStat(label, value, className = "") {
    return h("div", { key: label, className: "min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
      h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, label),
      h("div", { key: "value", className: cn("mt-2 break-words text-base font-semibold text-slate-950", className) }, value || "n/a")
    ]);
  }
  function evaluationReasoningText({ finding, evaluation, activeDisposition }) {
    if (!finding || !evaluation) return "No reasoning summary is available.";
    const raw = String(evaluation.evidence_quality_summary || evaluation.reasoning_summary || "").trim();
    const evidenceCount = Array.isArray(finding.evidence_json) ? finding.evidence_json.length : 0;
    const confidence = Number(finding.confidence);
    const confidenceText = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}% confidence` : "reported confidence";
    const reasons = Array.isArray(evaluation.validation_reasons) ? evaluation.validation_reasons : [];
    if (activeDisposition && evaluation.validation_recommendation !== "yes") {
      return `This finding is currently handled by an active exception. The underlying static evidence remains ${evaluation.evidence_sufficiency}, false-positive risk is ${evaluation.false_positive_risk}, and no additional review is required unless the exception expires or evidence changes.`;
    }
    if (/mock supervisor review adjusted confidence based on source type and available evidence/i.test(raw)) {
      const staticPresenceCheck = String(finding.category || "").includes("security_policy") || /security policy|SECURITY\.md/i.test(`${finding.title} ${finding.description}`);
      if (staticPresenceCheck) {
        return `This is a static repository-presence check. The audit did not find a visible SECURITY.md or equivalent policy disclosure, producing ${evidenceCount} evidence record(s) with ${confidenceText}. Evidence is rated ${evaluation.evidence_sufficiency} and false-positive risk is ${evaluation.false_positive_risk} because the finding is based on direct file/disclosure absence rather than runtime behavior.`;
      }
      return `The evaluation combines ${evidenceCount} persisted evidence record(s), ${confidenceText}, source ${finding.source || "unknown"}, and supervisor grading. Evidence is rated ${evaluation.evidence_sufficiency}; false-positive risk is ${evaluation.false_positive_risk}.${reasons.length ? ` Review is requested because ${reasons.join("; ")}.` : ""}`;
    }
    return raw || `Derived from ${evidenceCount} persisted evidence record(s) with ${confidenceText}.`;
  }
  function commitFindingTriage() {
    if (!selectedFinding) return;
    if (selectedTriageConflictsWithActiveDisposition) return;
    if (selectedActiveDisposition) return;
    if (selectedTriageDecision === "accepted_risk") {
      onFindingDispositionAction?.(selectedFinding, "waiver", selectedExceptionScopeLevel);
      return;
    }
    if (selectedTriageDecision === "out_of_scope") {
      onFindingDispositionAction?.(selectedFinding, "suppression", selectedExceptionScopeLevel);
      return;
    }
    if (selectedTriageDecision === "false_positive" && selectedExceptionScope === "future_repo") {
      onFindingDispositionAction?.(selectedFinding, "suppression", "project");
      return;
    }
    const actionType = selectedTriageDecision === "needs_validation"
      ? "request_validation"
      : selectedTriageDecision === "false_positive"
        ? "suppress_finding"
        : "confirm_finding";
    onFindingReviewAction?.(selectedFinding, actionType);
  }
  function updateRemediationDraft(field, value) {
    if (!selectedFinding) return;
    setRemediationDrafts((current) => ({
      ...current,
      [selectedFinding.id]: {
        ...(current[selectedFinding.id] || {}),
        [field]: value
      }
    }));
  }
  function saveSelectedRemediation(status) {
    if (!selectedFinding) return;
    onSaveRemediationItem?.(selectedFinding, {
      ...selectedRemediationDraft,
      status: status || selectedRemediationDraft.status || "open",
      external_provider: selectedRemediationDraft.external_issue_url ? "github" : "manual"
    });
  }
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
  const selectedRuntimeEvaluationRelevant = Boolean(selectedFindingEvaluation && (
    relatedRuntimeEvidence.length
    || selectedFindingEvaluation.runtime_evidence_ids?.length
    || !["none", "not_applicable"].includes(String(selectedFindingEvaluation.runtime_validation_status || ""))
    || !["none", "not_applicable"].includes(String(selectedFindingEvaluation.runtime_followup_policy || ""))
    || !["none", "not_applicable"].includes(String(selectedFindingEvaluation.runtime_impact || ""))
    || !["none", "not_applicable", "pending"].includes(String(selectedFindingEvaluation.runtime_followup_outcome || ""))
  ));
  const selectedRelationshipEvaluationRelevant = Boolean(selectedFindingEvaluation && (
    selectedFindingEvaluation.duplicate_with_finding_ids?.length
    || selectedFindingEvaluation.conflict_with_finding_ids?.length
  ));
  const selectedEvaluationReviewStatus = selectedFindingEvaluation?.validation_recommendation === "yes"
    ? actionLabel(selectedFindingEvaluation.next_action)
    : selectedFindingDisposition?.effective_disposition
      ? "handled by exception"
      : "no review needed";
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
  const repoContextEvidence = evidenceRecords.find((item) => item.source_type === "repo_context" || item.source_id === "repo_context") || null;
  const repoCapabilitySignals = getEvidenceMetadata(repoContextEvidence)?.capability_signals || [];
  const groupedAgenticSignals = repoCapabilitySignals.reduce((groups, signal) => {
    const text = String(signal || "");
    const splitIndex = text.indexOf(":");
    const group = splitIndex > 0 ? text.slice(0, splitIndex) : "repo_signal";
    const value = splitIndex > 0 ? text.slice(splitIndex + 1) : text;
    if (!groups[group]) groups[group] = [];
    if (value && !groups[group].includes(value)) groups[group].push(value);
    return groups;
  }, {});
  const agenticControlIds = [
    "harness_internal.agent_tool_allowlist",
    "harness_internal.agent_permission_boundaries",
    "harness_internal.untrusted_content_prompt_injection",
    "harness_internal.secret_env_isolation",
    "harness_internal.mcp_plugin_permissions",
    "harness_internal.browser_automation_safety",
    "harness_internal.telemetry_log_redaction"
  ];
  const agenticControlResults = controlResults.filter((control) => agenticControlIds.includes(control.control_id));
  const agenticAssessedCount = agenticControlResults.filter((control) => control.assessability === "assessed").length;
  const formatSignal = (value) => String(value || "").replace(/_/g, " ");
  const signalList = (items, empty = "none") => (items || []).length ? items.map(formatSignal).join(", ") : empty;
  const formatNumber = (value) => Number(value || 0).toLocaleString();
  const metricValue = (name) => metrics.find((item) => item.name === name)?.value ?? null;
  const usageTotals = observabilitySummary?.totals || {
    agent_invocation_count: agentInvocations.length,
    tool_execution_count: toolAdapterSummary?.total_executions ?? 0,
    prompt_tokens: metricValue("llm_prompt_tokens_total") ?? 0,
    completion_tokens: metricValue("llm_completion_tokens_total") ?? 0,
    total_tokens: metricValue("llm_total_tokens_total") ?? 0,
    estimated_cost_usd: metricValue("llm_estimated_cost_usd") ?? 0
  };
  const contextBytesTotal = metricValue("llm_context_bytes_total") ?? agentInvocations.reduce((sum, item) => sum + Number(item.context_bytes || 0), 0);
  const userPromptBytesTotal = metricValue("llm_user_prompt_bytes_total") ?? agentInvocations.reduce((sum, item) => sum + Number(item.user_prompt_bytes || 0), 0);
  const completedToolExecutions = toolAdapterBuckets.reduce((sum, item) => sum + Number(item.completed_count || 0), 0);
  const skippedToolExecutions = toolAdapterBuckets.reduce((sum, item) => sum + Number(item.skipped_count || 0), 0);
  const failedToolExecutions = toolAdapterBuckets.reduce((sum, item) => sum + Number(item.failed_count || 0), 0);
  const stageDurationMetrics = metrics.filter((item) => item.name === "stage_duration_ms");
  const providerMetrics = metrics.filter((item) => item.name === "provider_execution_total");
  const stageRollups = observabilitySummary?.stage_rollups || [];
  const providerRollups = observabilitySummary?.provider_rollups || [];
  const recentAgentInvocations = agentInvocations.slice(0, 8);
  const overviewItems = [
    { label: "Run Id", value: summary.run_id || run.id },
    { label: "Audit Package", value: run.audit_package || resolved.selected_audit_package || "n/a" },
    { label: "Policy Pack", value: resolved.policy_pack_id || run.policy_pack_id || "default" },
    { label: "Current Reviewer", value: summary.current_reviewer_id || run.review_workflow?.current_reviewer_id || "unassigned" },
    { label: "Sandbox Readiness", value: summary.sandbox_execution?.readiness_status || "n/a" },
    { label: "Created", value: formatDate(summary.created_at || run.created_at) }
  ];
  const overviewKpis = [
    { label: "Target", value: run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id || "n/a" },
    { label: "Status", value: summary.status || run.status || "unknown" },
    { label: "Review", value: summary.review_workflow_status || run.review_workflow?.status || "none" },
    { label: "Score", value: String(summary.overall_score ?? run.overall_score ?? "n/a") },
    { label: "Findings", value: String(findings.length || run.finding_count || 0) },
    { label: "Follow-ups", value: String(runtimeFollowupCount(run)) }
  ];
  const findingsRollupItems = [
    { label: "Integrity Verdict", value: findingQuality?.overall_verdict || "n/a" },
    { label: "Integrity Blockers", value: String(findingQuality?.blocking_count || 0) },
    { label: "Unsupported", value: String(findingQuality?.unsupported_count || 0) },
    { label: "Control Mismatch", value: String((findingQuality?.wrong_control_count || 0) + (findingQuality?.missing_control_count || 0)) },
    { label: "Needs Validation", value: String(findingEvaluations?.findings_needing_validation_count || 0) },
    { label: "Runtime Follow-up Required", value: String(findingEvaluations?.runtime_followup_required_count || 0) },
    { label: "Runtime Blocked", value: String(findingEvaluations?.runtime_validation_blocked_count || 0) },
    { label: "Runtime Failed", value: String(findingEvaluations?.runtime_validation_failed_count || 0) },
    { label: "Exceptions", value: String(findingEvaluations?.suppressed_finding_count || 0) },
    { label: "Accepted Risk", value: String(findingEvaluations?.waived_finding_count || 0) },
    { label: "Re-Review", value: String(findingEvaluations?.findings_needing_disposition_review_count || 0) },
    { label: "Due Soon", value: String(dueSoonDispositionFindingSummaries.length) },
    { label: "Conflicts", value: String((findingEvaluations?.conflict_pairs || []).length) },
    { label: "Duplicates", value: String((findingEvaluations?.duplicate_groups || []).length) }
  ];
  const assistantPrimaryPrompts = assistantScopeType === "target"
    ? [
      "What changed since the last run?",
      "Which findings keep recurring?",
      "Summarize the target history for a manager."
    ]
    : [
      "Give me a manager summary for this audit.",
      "What are the top risks and release blockers?",
      selectedFinding ? `Explain ${selectedFinding.id} in plain language.` : "Which findings need review?"
    ];
  const assistantExtraPrompts = assistantScopeType === "target"
    ? []
    : [
      selectedFinding ? `What evidence supports ${selectedFinding.id}?` : null,
      selectedFinding ? `Draft a triage note for ${selectedFinding.id}.` : null,
      "Which findings look most likely to be false positives?",
      "What remediation should engineering do first?"
    ].filter(Boolean);
  const assistantPrompts = assistantPromptsExpanded
    ? [...assistantPrimaryPrompts, ...assistantExtraPrompts]
    : assistantPrimaryPrompts;
  const assistantMessages = assistantState?.messages || [];
  const assistantActions = assistantState?.lastActions || [];
  const assistantSessionItems = assistantSessions || [];
  const assistantVisibleSessions = assistantHistoryExpanded ? assistantSessionItems : assistantSessionItems.slice(0, 5);
  const assistantContextLabel = assistantScopeType === "target"
    ? `Target history: ${run.target?.canonical_name || run.target_summary?.canonical_name || run.target_id || "selected target"}`
    : selectedFinding
      ? `Run: ${run.id || summary.run_id || "selected run"} / finding: ${selectedFinding.id}`
      : `Run: ${run.id || summary.run_id || "selected run"}`;
  const assistantInputPlaceholder = assistantScopeType === "target" ? "Ask Tethermark about this target..." : "Ask Tethermark about this audit...";
  const assistantIconButtonClass = "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40";
  const assistantScopeButtonClass = (scope) => cn(
    "rounded px-2 py-1 text-xs font-medium transition",
    assistantScopeType === scope ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
  );
  const assistantPanel = h("section", { key: "assistant", className: "flex h-full min-h-0 flex-col bg-white text-slate-900" }, [
    h("div", { key: "topbar", className: "shrink-0 border-b border-slate-200" }, [
      h("div", { key: "header", className: "flex items-center justify-between px-4 py-3" }, [
        h("div", { key: "copy", className: "min-w-0" }, [
          h("h2", { key: "title", className: "truncate text-base font-semibold text-slate-950" }, "Ask AI"),
          h("p", { key: "description", className: "mt-0.5 truncate text-xs text-slate-500" }, "Evidence-grounded audit assistant")
        ]),
        h("div", { key: "actions", className: "flex items-center gap-2" }, [
          h("button", {
            key: "history",
            type: "button",
            "data-testid": "assistant-history-toggle",
            className: assistantIconButtonClass,
            disabled: assistantState?.loading,
            title: assistantHistoryExpanded ? "Show fewer conversations" : "View all conversations",
            "aria-label": assistantHistoryExpanded ? "Show fewer conversations" : "View all conversations",
            onClick: () => setAssistantHistoryExpanded((current) => !current)
          }, h(AssistantIcon, { kind: "history" })),
          h("button", {
            key: "new-chat",
            type: "button",
            "data-testid": "assistant-new-chat-button",
            className: assistantIconButtonClass,
            disabled: assistantState?.loading,
            title: "New chat",
            "aria-label": "New chat",
            onClick: onAssistantNewSession
          }, h(AssistantIcon, { kind: "compose" })),
          h("button", {
            key: "close",
            type: "button",
            className: assistantIconButtonClass,
            title: "Close assistant",
            "aria-label": "Close assistant",
            onClick: () => window.dispatchEvent(new CustomEvent("tethermark:close-assistant"))
          }, h(AssistantIcon, { kind: "close" }))
        ])
      ]),
      h("div", { key: "scope", className: "flex items-center gap-2 px-5 pb-3" }, [
        h("div", { key: "scope-toggle", className: "flex rounded-md bg-slate-100 p-0.5" }, [
          h("button", { key: "run", type: "button", className: assistantScopeButtonClass("run"), disabled: assistantState?.loading, onClick: () => onAssistantScopeChange?.("run") }, "Run"),
          h("button", { key: "target", type: "button", className: assistantScopeButtonClass("target"), disabled: assistantState?.loading, onClick: () => onAssistantScopeChange?.("target") }, "Target")
        ]),
        h("div", {
          key: "context",
          "data-testid": "assistant-context-label",
          className: "min-w-0 flex-1 truncate text-xs text-slate-500",
          title: assistantContextLabel
        }, assistantContextLabel)
      ])
    ]),
    h("div", { key: "history", "data-testid": "assistant-history", className: "shrink-0 border-b border-slate-200 px-5 pb-3 pt-4" }, [
      h("div", { key: "label", className: "mb-2 text-xs font-semibold uppercase text-slate-400" }, "Conversations"),
      assistantSessionsLoading
        ? h("div", { key: "loading", className: "py-2 text-sm text-slate-500" }, "Loading conversations...")
        : assistantSessionsError
          ? h("div", { key: "error", className: "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" }, assistantSessionsError)
          : assistantSessionItems.length
            ? h("div", { key: "items", className: "grid gap-2" }, assistantVisibleSessions.map((session) => h("div", {
              key: session.id,
              className: cn(
                "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                assistantState?.session?.id === session.id ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-600 hover:bg-slate-50"
              )
            }, [
              h("button", {
                key: "open",
                type: "button",
                className: "min-w-0 truncate text-left leading-6",
                disabled: assistantState?.loading,
                onClick: () => onAssistantOpenSession?.(session),
                title: session.title || "New chat"
              }, session.title || "New chat"),
              h("div", { key: "meta", className: "flex items-center gap-2 text-xs text-slate-400" }, [
                h("span", { key: "time", className: "w-8 text-right" }, assistantRelativeTime(session.last_message?.created_at || session.updated_at || session.created_at)),
                h("button", {
                  key: "rename",
                  type: "button",
                  "data-testid": "assistant-session-rename-button",
                  className: "hidden rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-900 group-hover:inline-flex",
                  disabled: assistantState?.loading,
                  onClick: (event) => {
                    event.stopPropagation();
                    onAssistantRenameSession?.(session);
                  }
                }, "Rename"),
                h("button", {
                  key: "archive",
                  type: "button",
                  "data-testid": "assistant-session-archive-button",
                  className: "hidden rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-900 group-hover:inline-flex",
                  disabled: assistantState?.loading,
                  onClick: (event) => {
                    event.stopPropagation();
                    onAssistantArchiveSession?.(session);
                  }
                }, "Archive"),
                h("button", {
                  key: "delete",
                  type: "button",
                  "data-testid": "assistant-session-delete-button",
                  className: "hidden rounded px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-50 hover:text-red-700 group-hover:inline-flex",
                  disabled: assistantState?.loading,
                  onClick: (event) => {
                    event.stopPropagation();
                    onAssistantDeleteSession?.(session);
                  }
                }, "Delete")
              ])
            ])))
            : h("div", { key: "empty", className: "py-2 text-sm text-slate-500" }, "No conversations for this context yet."),
      assistantSessionItems.length > 5
        ? h("button", {
          key: "view-all",
          type: "button",
          className: "mt-3 text-left text-sm text-slate-500 hover:text-slate-900",
          disabled: assistantState?.loading,
          onClick: () => setAssistantHistoryExpanded((current) => !current)
        }, assistantHistoryExpanded ? "Show less" : `View all (${assistantSessionItems.length})`)
        : null
    ]),
    h("div", { key: "body", className: "min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3" }, [
      assistantState?.error
        ? h("div", { key: "error", className: "mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" }, assistantState.error)
        : null,
      !assistantMessages.length ? h("div", { key: "empty-state", className: "flex min-h-[10rem] flex-col items-center justify-center gap-4 text-center" }, [
        h("div", { key: "mark", className: "flex h-16 w-16 items-center justify-center rounded-full border-4 border-slate-200 text-slate-400" }, h("span", { className: "font-mono text-2xl" }, ">_")),
        h("div", { key: "prompts", className: "grid w-full gap-2" }, assistantPrompts.map((prompt) => h("button", {
          key: prompt,
          type: "button",
          className: "truncate rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-950",
          disabled: assistantState?.loading,
          onClick: () => onAssistantPrompt?.(prompt),
          title: prompt
        }, prompt))),
        assistantExtraPrompts.length
          ? h("button", {
            key: "more-prompts",
            type: "button",
            className: "text-left text-sm text-slate-500 hover:text-slate-900",
            disabled: assistantState?.loading,
            onClick: () => setAssistantPromptsExpanded((current) => !current)
          }, assistantPromptsExpanded ? "Fewer prompts" : "More prompts")
          : null
      ]) : null,
      h("div", { key: "thread", className: "space-y-3" }, assistantMessages.map((message) => h("div", {
        key: message.id,
        className: cn(
          "rounded-lg px-3 py-2 text-sm leading-6",
          message.role === "user" ? "ml-7 bg-slate-100 text-slate-900" : "mr-7 border border-slate-200 bg-white text-slate-900 shadow-sm"
        )
      }, [
        h("div", { key: "role", className: "mb-1 text-[11px] font-semibold uppercase text-slate-400" }, message.role === "user" ? "User" : "Assistant"),
        h("div", { key: "body", className: "whitespace-pre-wrap" }, message.body),
        message.response_json?.citations?.length
          ? h("div", { key: "citations", className: "mt-2 flex flex-wrap gap-1" }, message.response_json.citations.slice(0, 8).map((citation) => h("span", {
            key: `${citation.citation_type}:${citation.id}`,
            className: "rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500"
          }, `${citation.citation_type}: ${citation.id}`)))
          : null,
        message.response_json?.limitations?.length
          ? h("div", { key: "limitations", className: "mt-2 text-xs text-amber-700" }, message.response_json.limitations.join(" "))
          : null
      ]))),
      assistantActions.length
        ? h("div", { key: "actions", className: "mt-4 space-y-2" }, assistantActions.map((action) => h("div", {
          key: action.id,
          className: "rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        }, [
          h("div", { key: "title", className: "font-semibold" }, action.title),
          h("div", { key: "summary", className: "mt-1 text-amber-800" }, action.summary),
          action.status
            ? h("div", { key: "status", className: "mt-2 text-xs uppercase text-amber-700" }, action.status)
            : h("div", { key: "buttons", className: "mt-3 flex flex-wrap gap-2" }, [
              action.requires_confirmation
                ? h("button", { key: "confirm", type: "button", className: "rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800", disabled: assistantState?.loading, onClick: () => onAssistantConfirmAction?.(action) }, "Confirm")
                : null,
              h("button", { key: "reject", type: "button", className: "rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50", disabled: assistantState?.loading, onClick: () => onAssistantRejectAction?.(action) }, "Dismiss")
            ])
        ])))
        : null
    ]),
    h("div", { key: "composer", className: "shrink-0 border-t border-slate-200 px-5 pb-5 pt-4" }, [
      h("div", { key: "box", className: "rounded-2xl border border-slate-200 bg-white px-4 pb-3 pt-4 shadow-sm" }, [
        h(Textarea, {
          key: "textarea",
          "data-testid": "assistant-input",
          value: assistantInput || "",
          onChange: (event) => onAssistantInputChange?.(event.target.value),
          placeholder: assistantInputPlaceholder,
          className: "min-h-[4rem] resize-none border-0 bg-transparent px-0 py-0 text-sm text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:ring-0 disabled:bg-transparent disabled:text-slate-500",
          disabled: assistantState?.loading
        }),
        h("div", { key: "composer-actions", className: "mt-3 flex items-center justify-between" }, [
          h("div", { key: "hint", className: "truncate text-xs text-slate-400" }, "Uses selected audit evidence. Actions require confirmation."),
          h("button", {
            key: "send",
            type: "button",
            "data-testid": "assistant-send-button",
            className: "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
            disabled: assistantState?.loading || !String(assistantInput || "").trim(),
            onClick: onAssistantSend,
            title: assistantState?.loading ? "Working" : "Send",
            "aria-label": assistantState?.loading ? "Working" : "Send"
          }, h(AssistantIcon, { kind: "send" }))
        ])
      ]),
      h("div", { key: "footer", className: "hidden" }, [
        h(AssistantIcon, { key: "terminal", kind: "terminal" }),
        h("span", { key: "chevron", className: "text-lg leading-none" }, "⌄")
      ])
    ])
  ]);
  const panels = [
    h(Card, { key: "overview", title: "Run Summary", description: "Current audit state, score, review posture, and run identity.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "kpis", className: "grid gap-3 md:grid-cols-3 xl:grid-cols-6" }, overviewKpis.map((item) => h("div", {
        key: item.label,
        className: "min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
      }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, item.label),
        h("div", { key: "value", className: "mt-1 truncate text-sm font-semibold text-slate-950" }, item.value)
      ]))),
      h("div", { key: "meta", className: "mt-4" }, h(DetailList, {
        items: overviewItems
      }))
    ]),
    h(Card, { key: "learning", title: "Learning Signals", description: "Governed improvement signals and candidates linked to this run. V1 records do not change audit behavior until promoted.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "kpis", className: "grid gap-3 md:grid-cols-3" }, [
        { label: "Signals", value: learningEvents.length },
        { label: "Candidates", value: learningCandidates.length },
        { label: "Promoted", value: learningCandidates.filter((item) => item.status === "promoted").length }
      ].map((item) => h("div", {
        key: item.label,
        className: "rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
      }, [
        h("div", { key: "label", className: "text-xs font-medium uppercase tracking-wide text-slate-500" }, item.label),
        h("div", { key: "value", className: "mt-1 text-sm font-semibold text-slate-950" }, String(item.value))
      ]))),
      learningCandidates.length
        ? h("div", { key: "candidates", className: "mt-4 space-y-2" }, learningCandidates.slice(0, 5).map((candidate) => h("div", {
          key: candidate.id,
          className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        }, [
          h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy", className: "min-w-0" }, [
              h("div", { key: "title", className: "truncate font-medium text-slate-900" }, candidate.title || candidate.id),
              h("div", { key: "summary", className: "mt-1 text-sm text-slate-500" }, candidate.summary || candidate.candidate_type)
            ]),
            h(Badge, { key: "status" }, candidate.status)
          ])
        ])))
        : h("div", { key: "empty", className: "mt-4 text-sm text-slate-500" }, "No learning candidates are linked to this run yet.")
    ]),
    h(Card, { key: "execution-observability", title: "Execution Observability", description: "Per-run agent, LLM, tool, and stage usage persisted for auditability.", className: "border-slate-200 bg-white shadow-sm" }, [
      h(DetailList, {
        key: "usage",
        items: [
          { label: "Agent Calls", value: formatNumber(agentInvocations.length) },
          { label: "Tool Executions", value: `${completedToolExecutions} completed, ${skippedToolExecutions} skipped, ${failedToolExecutions} failed` },
          { label: "Prompt Tokens", value: formatNumber(usageTotals.prompt_tokens) },
          { label: "Completion Tokens", value: formatNumber(usageTotals.completion_tokens) },
          { label: "Total Tokens", value: formatNumber(usageTotals.total_tokens) },
          { label: "Estimated LLM Cost", value: `$${Number(usageTotals.estimated_cost_usd || 0).toFixed(6)}` },
          { label: "Context Bytes", value: formatNumber(contextBytesTotal) },
          { label: "Prompt Bytes", value: formatNumber(userPromptBytesTotal) }
        ]
      }),
      agentInvocations.some((item) => item.total_tokens == null)
        ? h("div", { key: "token-note", className: "mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" }, "Some providers did not return token counts for this run; byte counts remain available for audit sizing.")
        : null,
      toolAdapterBuckets.length
        ? h("div", { key: "tools", className: "mt-4 space-y-3" }, toolAdapterBuckets.map((tool, index) => {
          const fallback = Number(tool.fallback_count || 0) > 0;
          return h("div", {
            key: `${tool.requested_provider_id}:${index}`,
            className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          }, [
            h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
              h("div", { key: "copy" }, [
                h("div", { key: "title", className: "font-medium text-slate-900" }, tool.requested_provider_id || "provider"),
                h("div", { key: "summary", className: "mt-1 text-sm text-slate-500" }, `${formatNumber(tool.completed_count)} completed, ${formatNumber(tool.skipped_count)} skipped, ${formatNumber(tool.failed_count)} failed`),
                h("div", { key: "observed", className: "mt-1 text-xs text-slate-500" }, `observed ${tool.providers_observed?.join(", ") || "none"}${tool.fallback_targets?.length ? `; fallback targets ${tool.fallback_targets.join(", ")}` : ""}`)
              ]),
              h("div", { key: "badges", className: "flex flex-wrap justify-end gap-2" }, [
                h(Badge, { key: "status" }, tool.failed_count ? "failed" : tool.skipped_count ? "skipped" : "completed"),
                fallback ? h(Badge, { key: "fallback" }, "fallback") : null
              ].filter(Boolean))
            ])
          ]);
        }))
        : h("div", { key: "no-tools", className: "mt-4 text-sm text-slate-500" }, "No tool execution rollup is available for this run."),
      recentAgentInvocations.length
        ? h("div", { key: "agents", className: "mt-4 grid gap-3 md:grid-cols-2" }, recentAgentInvocations.map((call) => h("div", {
          key: call.id || call.agent_call_id,
          className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        }, [
          h("div", { key: "head", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "agent", className: "font-medium" }, call.agent_name || "agent"),
              h("div", { key: "model", className: "mt-1 text-sm text-slate-500" }, `${call.model_provider || call.provider || "provider"} / ${call.model_name || call.model || "model"}`)
            ]),
            h(Badge, { key: "status" }, call.status || "unknown")
          ]),
          h(DetailList, {
            key: "call-detail",
            items: [
              { label: "Stage", value: call.stage_name || "n/a" },
              { label: "Tokens", value: call.total_tokens == null ? "not reported" : formatNumber(call.total_tokens) },
              { label: "Bytes", value: `${formatNumber(call.context_bytes)} context, ${formatNumber(call.user_prompt_bytes)} prompt` },
              { label: "Cost", value: `$${Number(call.estimated_cost_usd || 0).toFixed(6)}` }
            ]
          })
        ])))
        : null,
      stageRollups.length || providerRollups.length || stageDurationMetrics.length || providerMetrics.length
        ? h("div", { key: "metrics", className: "mt-4 grid gap-3 md:grid-cols-2" }, [
          stageRollups.length || stageDurationMetrics.length
            ? h("div", { key: "stages", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, [
              h("div", { key: "title", className: "font-medium text-slate-900" }, "Stage Durations"),
              h("ul", { key: "list", className: "mt-2 space-y-1 text-slate-500" }, (stageRollups.length
                ? stageRollups.map((item) => ({ key: item.stage_name, text: `${item.stage_name}: ${formatNumber(item.total_duration_ms)} ms${item.reused_count ? `, ${item.reused_count} reused` : ""}` }))
                : stageDurationMetrics.map((item) => ({ key: item.tags_json?.stage || item.tags?.stage || "stage", text: `${item.tags_json?.stage || item.tags?.stage || "stage"} avg ${Math.round(item.avg ?? item.value ?? 0)} ms` }))
              ).map((item, index) => h("li", { key: `${index}:${item.key}` }, item.text)))
            ])
            : null,
          providerRollups.length || providerMetrics.length
            ? h("div", { key: "providers", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, [
              h("div", { key: "title", className: "font-medium text-slate-900" }, "Provider Results"),
              h("ul", { key: "list", className: "mt-2 space-y-1 text-slate-500" }, (providerRollups.length
                ? providerRollups.map((item) => ({ key: item.provider_id, text: `${item.provider_id}: ${formatNumber(item.completed_count || item.invocation_count || item.tool_execution_count)} completed/invoked, ${formatNumber(item.skipped_count)} skipped, ${formatNumber(item.failed_count)} failed` }))
                : providerMetrics.map((item) => ({ key: item.tags_json?.provider_id || item.tags?.provider_id || "provider", text: `${item.tags_json?.provider_id || item.tags?.provider_id || "provider"} ${item.tags_json?.status || item.tags?.status || "status"}: ${formatNumber(item.value)}` }))
              ).map((item, index) => h("li", { key: `${index}:${item.key}` }, item.text)))
            ])
            : null
        ].filter(Boolean))
        : null
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
              publisherMode ? { label: "Publication Safety Default", value: plannedProfile.review_visibility } : null
            ].filter(Boolean)
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
    h(Card, { key: "agentic-signals", title: "Agentic Signals", description: "Repository signals that drive agent classification and agentic static controls.", className: "border-slate-200 bg-white shadow-sm" }, [
      h(DetailList, {
        key: "agentic-summary",
        items: [
          { label: "Target Class", value: resolved.initial_target_class || preflight?.target?.target_class || "n/a" },
          { label: "AI Frameworks", value: signalList(groupedAgenticSignals.ai_framework) },
          { label: "Capabilities", value: signalList(groupedAgenticSignals.agentic_capability) },
          { label: "Risk Indicators", value: signalList(groupedAgenticSignals.agentic_risk) },
          { label: "Control Indicators", value: signalList(groupedAgenticSignals.agentic_control) },
          { label: "Agentic Controls", value: `${agenticAssessedCount}/${agenticControlResults.length} assessed` }
        ]
      }),
      agenticControlResults.length
        ? h("div", { key: "controls", className: "mt-4 grid gap-3 md:grid-cols-2" }, agenticControlResults.map((control) => h("div", {
          key: control.control_id,
          className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        }, [
          h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("div", { key: "title", className: "font-medium text-slate-900" }, control.title || control.control_id),
              h("div", { key: "id", className: "mt-1 text-xs text-slate-500" }, control.control_id)
            ]),
            h(Badge, { key: "status", title: controlAssessmentDetail(control) }, controlAssessmentLabel(control))
          ]),
          control.rationale_json?.length
            ? h("div", { key: "rationale", className: "mt-2 text-sm text-slate-500" }, control.rationale_json[0])
            : null
        ])))
        : h("div", { key: "empty-controls", className: "mt-4 text-sm text-slate-500" }, "No agentic static controls were selected for this run.")
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
            publisherMode ? { label: "Requested Publication Safety", value: launchIntent.requested_profile.review_visibility } : null
          ].filter(Boolean)
        }),
        launchIntent.notes?.length
          ? h("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, launchIntent.notes.join(" | "))
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No persisted launch intent is available for this run.")),
    h(Card, { key: "outbound", title: "Outbound Preview", description: "Prepared GitHub-facing payloads only. Community Edition does not post anything externally.", className: "border-slate-200 bg-white shadow-sm" }, outboundPreview
      ? h("div", { className: "space-y-4" }, [
        h("div", { key: "status-row", className: "flex flex-wrap gap-3" }, [
          h(Badge, { key: "mode" }, outboundPreview.policy?.mode || "disabled"),
          h(Badge, { key: "status" }, outboundPreview.readiness?.status || "unknown"),
          h(Badge, { key: "approval" }, outboundPreview.readiness?.approved ? "approved" : "approval_pending"),
          h(Badge, { key: "verification" }, outboundPreview.readiness?.verified ? "verified" : "verification_pending")
        ]),
        h("div", { key: "copy", className: "text-sm text-slate-500" }, (outboundPreview.readiness?.reasons || []).length ? outboundPreview.readiness.reasons.join(" ") : "Preview is available. Copy the payload manually. Tethermark Cloud performs GitHub verification, delivery, and webhook sync."),
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
          h(Button, { key: "verify", variant: "outline", onClick: () => onVerifyOutbound?.(), disabled: true, title: "Automatic GitHub access verification is available in Tethermark Cloud." }, "Cloud Verify"),
          h(Button, { key: "send", variant: "secondary", onClick: () => onPrepareOutboundSend?.(), disabled: !outboundPreview.readiness?.send_allowed }, "Prepare Manual Send"),
          h(Button, { key: "deliver", onClick: () => onExecuteOutboundDelivery?.(), disabled: true, title: "Automatic GitHub delivery is available in Tethermark Cloud." }, "Cloud Delivery")
        ]),
        outboundSend
          ? h("div", { key: "send-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `${outboundSend.status} by ${outboundSend.attempted_by} at ${formatDate(outboundSend.attempted_at)}: ${outboundSend.reason}`)
          : null,
        outboundDelivery
          ? h("div", { key: "delivery-meta", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" }, `${outboundDelivery.status} by ${outboundDelivery.attempted_by} at ${formatDate(outboundDelivery.attempted_at)}: ${outboundDelivery.reason}${outboundDelivery.external_url ? ` (${outboundDelivery.external_url})` : ""}`)
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No outbound preview is available for this run.")),
    h(Card, { key: "webhook-deliveries", title: "Automation Webhooks", description: "Generic Community Edition automation hook deliveries for this run.", className: "border-slate-200 bg-white shadow-sm" }, webhookDeliveries.length
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
          "data-testid": "review-assignee-input",
          value: reviewAssignee || "",
          onChange: (event) => onReviewAssigneeChange?.(event.target.value),
          placeholder: "reviewer id"
        })),
        h("div", { key: "button-wrap", className: "flex items-end" }, h(Button, {
          "data-testid": "assign-reviewer-button",
          variant: "outline",
          onClick: onAssignReviewer,
          disabled: !detail || !reviewAssignee
        }, "Assign Reviewer"))
      ]),
      h("div", { key: "assignment-meta", className: "mt-3 text-sm text-slate-500" }, "Current reviewer: " + (summary.current_reviewer_id || run.review_workflow?.current_reviewer_id || "none"))
    ]),
    h(Card, { key: "review-decisions", title: "Review Decisions", description: "Run-level reviewer actions and rerun gates.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "buttons", className: "flex flex-wrap gap-3" }, [
        h(Button, { key: "start", "data-testid": "start-review-button", variant: "secondary", onClick: () => onRunReviewAction?.("start_review"), disabled: !detail }, "Start Review"),
        h(Button, { key: "approve", "data-testid": "approve-run-button", onClick: () => onRunReviewAction?.("approve_run"), disabled: !detail }, "Approve Run"),
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
            { label: "Exception Re-Review", value: String(reviewSummary.handoff.findings_needing_disposition_review_count || 0) },
            { label: "Expired Exceptions", value: String(reviewSummary.handoff.expired_disposition_count || 0) },
            { label: "Reopened Exceptions", value: String(reviewSummary.handoff.reopened_disposition_count || 0) },
            { label: "Review Age (hours)", value: String(reviewSummary.handoff.age_hours) },
            { label: "Last Action", value: reviewSummary.handoff.last_action_type || "none" },
            { label: "Last Updated", value: formatDate(reviewSummary.handoff.last_action_at) }
          ]
        }),
        reviewSummary.handoff.unresolved_finding_ids?.length
          ? h("div", { key: "unresolved", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" }, `Unresolved: ${reviewSummary.handoff.unresolved_finding_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.findings_needing_disposition_review_ids?.length
          ? h("div", { key: "disposition-rereview", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Exception re-review: ${reviewSummary.handoff.findings_needing_disposition_review_ids.join(", ")}`)
          : null,
        reviewSummary.handoff.latest_notes?.length
          ? h("div", { key: "latest-notes", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
            h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Latest Notes"),
            h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, reviewSummary.handoff.latest_notes.map((note, index) => h("li", { key: `${index}:${note}` }, note)))
          ])
          : null
      ])
      : h("div", { className: "text-sm text-slate-500" }, "No review summary is available for this run yet.")),
    h("section", { key: "findings", className: "flex h-full min-h-0 flex-col border-b border-slate-200 bg-white" }, [
      h("div", { key: "header", className: "sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-3" }, [
        h("div", { key: "title-row", className: "flex flex-wrap items-end justify-between gap-3" }, [
        h("div", { key: "copy" }, [
          h("h3", { key: "title", className: "text-lg font-semibold text-slate-950" }, "Findings"),
          h("p", { key: "description", className: "mt-1 text-sm text-slate-500" }, "Review findings from the queue, then inspect evidence, evaluation, and decision details.")
        ]),
        h("div", { key: "count", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, `${visibleFindings.length} of ${findings.length} findings`)
        ]),
      h("div", { key: "filters", className: "mt-3 grid gap-2 sm:grid-cols-2" }, [
        Select({
          key: "severity",
          value: findingSeverityFilter,
          onChange: (event) => {
            const nextSeverity = event.target.value;
            setFindingSeverityFilter(nextSeverity);
            const nextVisible = filterFindingsFor(nextSeverity, findingDispositionFilter);
            if (nextVisible.length && !nextVisible.some((finding) => finding.id === selectedFindingId)) {
              onSelectFinding?.(nextVisible[0].id);
            }
          },
          className: "h-9 min-w-0 rounded-md px-2 text-xs"
        }, [
          h("option", { key: "all", value: "all" }, "All severities"),
          ...severityOptions.map((severity) => h("option", { key: severity, value: severity }, severity))
        ]),
        Select({
          key: "disposition",
          value: findingDispositionFilter,
          onChange: (event) => {
            const nextDisposition = event.target.value;
            setFindingDispositionFilter(nextDisposition);
            const nextVisible = filterFindingsFor(findingSeverityFilter, nextDisposition);
            if (nextVisible.length && !nextVisible.some((finding) => finding.id === selectedFindingId)) {
              onSelectFinding?.(nextVisible[0].id);
            }
          },
          className: "h-9 min-w-0 rounded-md px-2 text-xs"
        }, [
          h("option", { key: "all", value: "all" }, "All decisions"),
          ...dispositionOptions.map((disposition) => h("option", { key: disposition, value: disposition }, decisionLabel(disposition)))
        ])
      ]),
      ]),
      findings.length
        ? h(FindingsWorkspace, {
          listPane: visibleFindings.length
            ? h("div", { key: "finding-list", className: "overflow-hidden border border-slate-200 bg-white" }, visibleFindings.map((finding) => {
          const state = findingReviewState?.[finding.id] || {};
          const summaryState = findingSummaryById.get(finding.id) || null;
          const evaluationState = findingEvaluations?.evaluations?.find((item) => item.finding_id === finding.id) || null;
          const qualityState = findingQualityById.get(finding.id) || null;
          const selected = selectedFinding?.id === finding.id;
          const severity = summaryState?.current_severity || finding.severity || "unknown";
          const disposition = summaryState?.disposition || "unknown";
          const needsFollowup = evaluationState?.runtime_followup_policy && evaluationState.runtime_followup_policy !== "none" && evaluationState.runtime_followup_policy !== "not_applicable";
          return h("button", {
            key: finding.id,
            type: "button",
            "data-testid": "finding-list-item",
            "data-finding-id": finding.id,
            onClick: () => onSelectFinding?.(finding.id),
            className: cn("block w-full border-b border-slate-200 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50", selected ? "bg-slate-100" : "bg-white")
          }, [
            h("div", { key: "head", className: "min-w-0" }, [
              h("div", { key: "title", className: "line-clamp-2 text-sm font-semibold leading-5 text-slate-950" }, finding.title || finding.id),
              h("div", { key: "meta", className: "mt-1 truncate font-mono text-xs text-slate-500" }, finding.id)
            ]),
            h("div", { key: "status-row", className: "mt-2 flex flex-wrap items-center gap-1.5" }, [
              findingChip("", severity, severityChipClass(severity)),
              findingChip("", decisionStateLabel(summaryState), dispositionChipClass(disposition)),
              qualityState ? findingChip("qa", qualityState.qa_blocking ? "blocked" : qualityState.control_mapping_verdict, qualityChipClass(qualityState.qa_blocking ? "fail" : qualityState.control_mapping_verdict)) : null,
              needsFollowup ? findingChip("", "runtime follow-up", "border-amber-200 bg-amber-50 text-amber-700") : null,
              summaryState?.needs_disposition_review ? findingChip("", "needs re-review", "border-amber-200 bg-amber-50 text-amber-700") : null
            ].filter(Boolean)),
            h("div", { key: "review-meta", className: "mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500" }, [
              h("span", { key: "reviewer" }, `reviewer ${summaryState?.last_reviewer_id || "none"}`),
              h("span", { key: "action" }, `last action ${summaryState?.last_action_at ? formatDate(summaryState.last_action_at) : "none"}`)
            ])
          ]);
        }))
            : h("div", { key: "finding-list-empty", className: "border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500" }, "No findings match the selected filters."),
        hasSelectedFinding: Boolean(selectedFinding),
        detailHeader: selectedFinding
          ? h("div", { key: "header", className: "bg-slate-50 px-3 py-3" }, [
            h("div", { key: "title-row", className: "min-w-0" }, [
                h("div", { key: "eyebrow", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, selectedFinding.category || "finding"),
                h("h4", { key: "title", className: "mt-2 line-clamp-3 text-lg font-semibold leading-6 text-slate-950" }, selectedFinding.title),
                h("div", { key: "meta", className: "mt-1 break-all text-xs text-slate-500" }, selectedFinding.id),
              h("div", { key: "badges", className: "mt-2 flex flex-wrap gap-1.5" }, findingStatusChips({
                finding: selectedFinding,
                summary: selectedFindingSummary,
                disposition: selectedFindingDisposition
              }).concat(selectedFindingQuality ? [
                findingChip("evidence", selectedFindingQuality.evidence_support_verdict, qualityChipClass(selectedFindingQuality.evidence_support_verdict)),
                findingChip("controls", selectedFindingQuality.control_mapping_verdict, qualityChipClass(selectedFindingQuality.control_mapping_verdict))
              ] : []))
            ]),
            h("div", { key: "description", className: "mt-3 line-clamp-3 text-sm leading-6 text-foreground" }, selectedFinding.description)
          ])
          : null,
        comparisonContext: selectedComparisonFinding
          ? h("div", { key: "comparison-context", className: "border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" }, `Compared against prior finding ${selectedComparisonFinding.id} from run ${compareRunId || "n/a"}.`)
          : null,
        detailTabs: findingDetailTabs,
        detailKey: selectedFinding?.id || "none",
        detailNotice: notice,
        helpers: { Button },
        emptyDetail: h("div", { key: "finding-empty", className: "border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500" }, "Select a finding from the queue to inspect evidence, evaluation, and decision detail."),
        renderDetailContent: ({ view: findingDetailView }) => h("div", { className: "space-y-4" }, [
                findingDetailView === "governance" ? h(Card, { key: "triage-decision", title: "Triage Decision", description: "Classify the finding, set review priority, scope any exception, and save the review record." }, [
              h("div", { key: "controls", className: "grid gap-4 lg:grid-cols-3" }, [
                h(Field, { key: "decision", label: fieldLabel("Decision") }, Select({
                  "data-testid": "triage-decision-select",
                  value: selectedTriageDecision,
                  disabled: Boolean(selectedActiveDisposition),
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "triage_decision", event.target.value)
                }, [
                  h("option", { key: "confirm", value: "confirmed" }, "Confirmed"),
                  h("option", { key: "needs-validation", value: "needs_validation" }, "Needs validation"),
                  h("option", { key: "false-positive", value: "false_positive" }, "False positive (suppress)"),
                  h("option", { key: "out-of-scope", value: "out_of_scope" }, "Not applicable (suppress)"),
                  h("option", { key: "accepted-risk", value: "accepted_risk" }, "Accepted risk (waiver)")
                ])),
                h(Field, { key: "severity-select", label: fieldLabel("Severity Override", "Optional reviewer override for the effective severity.") }, Select({
                  "data-testid": "triage-severity-select",
                  value: selectedFindingState.updated_severity || "",
                  disabled: !selectedTriageFieldsEditable,
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "updated_severity", event.target.value)
                }, [
                  h("option", { key: "keep", value: "" }, `Keep ${selectedFindingSummary?.current_severity || selectedFinding.severity || "current"}`),
                  ...["critical", "high", "medium", "low", "info"].map((level) => h("option", { key: level, value: level }, level))
                ])),
                publisherMode
                  ? h(Field, { key: "visibility", label: fieldLabel("Publication Safety", "Publisher-only control for whether the finding can be shown in public reports.") }, Select({
                      value: selectedFindingState.visibility_override || selectedFindingSummary?.current_visibility || "internal",
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "visibility_override", event.target.value)
                    }, [
                      h("option", { key: "internal", value: "internal" }, "keep internal"),
                      h("option", { key: "public", value: "public" }, "public-safe")
                    ]))
                  : null,
                h(Field, { key: "priority", label: fieldLabel("Priority") }, Select({
                  "data-testid": "triage-priority-select",
                  value: selectedFindingState.review_priority || "",
                  disabled: !selectedTriageFieldsEditable,
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "review_priority", event.target.value)
                }, [
                  h("option", { key: "unset", value: "" }, "unset"),
                  h("option", { key: "p0", value: "p0" }, "P0 immediate"),
                  h("option", { key: "p1", value: "p1" }, "P1 this cycle"),
                  h("option", { key: "p2", value: "p2" }, "P2 backlog"),
                  h("option", { key: "p3", value: "p3" }, "P3 informational")
                ])),
                h(Field, { key: "validation-intent", label: fieldLabel("Follow-up Needed", "The validation or review follow-up needed before this finding can be considered closed.") }, Select({
                  "data-testid": "triage-validation-intent-select",
                  value: selectedFindingState.validation_intent || "not_required",
                  disabled: !selectedTriageFieldsEditable,
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "validation_intent", event.target.value)
                }, [
                  h("option", { key: "not-required", value: "not_required" }, "not required"),
                  h("option", { key: "manual", value: "manual_review" }, "manual review"),
                  h("option", { key: "runtime", value: "runtime_validation" }, "runtime validation"),
                  h("option", { key: "rerun", value: "rerun_required" }, "rerun required")
                ])),
                selectedTriageRequiresDisposition
                  ? h(Field, { key: "exception-scope", label: fieldLabel("Applies to", "Controls whether this exception applies only to the current run or matching findings in future scans for the same repo.") }, Select({
                    value: selectedExceptionScope,
                    disabled: !selectedTriageFieldsEditable,
                    onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "exception_scope", event.target.value)
                  }, [
                    h("option", { key: "this-run", value: "this_run" }, "This run"),
                    h("option", { key: "future-repo", value: "future_repo" }, "Future scans for this repo")
                  ]))
                  : null,
                h(Field, { key: "notes", label: fieldLabel("Reason", "Reviewer rationale or context for the saved decision.") }, h(Input, {
                  "data-testid": "triage-notes-input",
                  value: selectedFindingState.notes || "",
                  disabled: !selectedTriageFieldsEditable,
                  onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "notes", event.target.value),
                  onKeyDown: (event) => {
                    if (event.key !== "Enter" || !selectedTriageCanCommit) return;
                    event.preventDefault();
                    commitFindingTriage();
                  },
                  placeholder: "why this decision is appropriate"
                })),
                selectedTriageRequiresDisposition
                  ? h(Field, { key: "disposition-reason", label: fieldLabel("Reason", "Required rationale for a false-positive, not-applicable, or accepted-risk exception.") }, h(Input, {
                      value: selectedFindingState.disposition_reason || "",
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_reason", event.target.value),
                      placeholder: "required rationale"
                    }))
                  : null,
                selectedTriageRequiresDisposition
                  ? h(Field, { key: "disposition-expiry", label: fieldLabel("Expires At", "When a reusable exception should stop applying and return to review.") }, h(Input, {
                      type: "datetime-local",
                      value: formatDateInputValue(selectedFindingState.disposition_expires_at || ""),
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_expires_at", event.target.value ? new Date(event.target.value).toISOString() : "")
                    }))
                  : null,
                selectedTriageRequiresWaiverMetadata
                  ? h(Field, { key: "disposition-owner", label: fieldLabel("Risk Owner") }, h(Input, {
                      value: selectedFindingState.disposition_owner_id || "",
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_owner_id", event.target.value),
                      placeholder: "required owner"
                    }))
                  : null,
                selectedTriageRequiresWaiverMetadata
                  ? h(Field, { key: "disposition-reviewed", label: fieldLabel("Reviewed At") }, h(Input, {
                      type: "datetime-local",
                      value: formatDateInputValue(selectedFindingState.disposition_reviewed_at || ""),
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_reviewed_at", event.target.value ? new Date(event.target.value).toISOString() : "")
                    }))
                  : null,
                selectedTriageRequiresWaiverMetadata
                  ? h(Field, { key: "disposition-review-due", label: fieldLabel("Review Due By") }, h(Input, {
                      type: "datetime-local",
                      value: formatDateInputValue(selectedFindingState.disposition_review_due_by || ""),
                      disabled: !selectedTriageFieldsEditable,
                      onChange: (event) => onFindingReviewStateChange?.(selectedFinding.id, "disposition_review_due_by", event.target.value ? new Date(event.target.value).toISOString() : "")
                    }))
                  : null
              ].filter(Boolean)),
              selectedActiveDisposition
                ? h("div", { key: "active-exception-note", className: "mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" }, [
                    h("div", { key: "copy" }, `Active ${exceptionRecordLabel(selectedActiveDisposition)} applies to ${appliesToLabel(selectedActiveDisposition.scope_level).toLowerCase()}. Revoke it before recording a different decision.`),
                    h("div", { key: "actions", className: "mt-2 flex flex-wrap gap-2" }, [
                      h(Button, {
                        key: "revoke-active",
                        variant: "outline",
                        onClick: () => onRevokeFindingDisposition?.(selectedFinding, selectedActiveDisposition)
                      }, "Revoke Exception")
                    ])
                  ])
                : null,
              selectedTriageRequiresDisposition
                ? h("div", { key: "exception-note", className: "mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" }, selectedTriageDecision === "accepted_risk"
                    ? selectedActiveDisposition ? "Accepted risk already has an active exception. Revoke it before changing the decision." : selectedExceptionScope === "future_repo" ? "Accepted risk will apply to matching future scans for this repo and requires owner, review date, and expiry." : "Accepted risk applies only to this run and requires owner and review date."
                    : selectedActiveDisposition ? `${exceptionRecordLabel(selectedActiveDisposition)} already has an active exception. Revoke it before changing the decision.` : selectedTriageDecision === "false_positive" ? (selectedExceptionScope === "future_repo" ? "False positive will apply to matching future scans for this repo and requires a reason and expiry." : "False positive applies only to this run and requires a reason.") : selectedExceptionScope === "future_repo" ? "Not applicable will apply to matching future scans for this repo and requires a reason and expiry." : "Not applicable applies only to this run and requires a reason.")
                : null,
              selectedMissingFields.length
                ? h("div", { key: "missing-fields", className: "mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" }, `Required before commit: ${selectedMissingFields.join(", ")}.`)
                : null,
              h("div", { key: "action-groups", className: "mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3" }, [
                  selectedActiveDisposition
                    ? h(Button, {
                        key: "revoke-active-primary",
                        variant: "secondary",
                        onClick: () => onRevokeFindingDisposition?.(selectedFinding, selectedActiveDisposition)
                      }, "Revoke Exception")
                    : h(Button, {
                        key: "commit-triage",
                        "data-testid": "save-triage-decision-button",
                        variant: "secondary",
                        disabled: !selectedTriageCanCommit,
                        onClick: commitFindingTriage
                      }, "Save Decision"),
                  (selectedFindingEvaluation?.runtime_followup_policy === "rerun_in_capable_env"
                    || selectedFindingState.validation_intent === "rerun_required"
                    || selectedTriageDecision === "needs_validation")
                    ? h(Button, { key: "rerun-capable", "data-testid": "rerun-capable-env-button", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "rerun_in_capable_env") }, "Rerun In Capable Env")
                    : null,
                  selectedFindingEvaluation?.runtime_followup_policy === "manual_runtime_review"
                    ? h(Button, { key: "manual-runtime-review", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "mark_manual_runtime_review_complete") }, "Manual Runtime Review Complete")
                    : null,
                  selectedFindingEvaluation?.runtime_followup_policy !== "none" && selectedFindingEvaluation?.runtime_followup_policy !== "not_applicable"
                    ? h(Button, { key: "accept-runtime-gap", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "accept_without_runtime_validation") }, "Accept Without Runtime Validation")
                    : null
                ].filter(Boolean)
              )
            ]) : null,
            findingDetailView === "evidence" ? h(Card, { key: "controls", title: "Affected Controls", description: "Assessment results for controls linked to the selected finding." }, relatedControls.length
              ? h("div", { className: "max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, relatedControls.map((control) => h("div", {
                key: control.control_id,
                className: "border-b border-slate-200 bg-slate-50 px-4 py-3 last:border-b-0"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, `${control.control_id} - ${control.title}`),
                    h("div", { key: "meta", className: "text-sm text-slate-500" }, `${control.framework} / ${control.standard_ref}`)
                  ]),
                  h(Badge, { key: "status", title: controlAssessmentDetail(control) }, controlAssessmentLabel(control, { findingContext: true }))
                ]),
                h("div", { key: "assessment-detail", className: "mt-2 text-xs text-slate-500" }, controlAssessmentDetail(control)),
                Array.isArray(control.rationale_json) && control.rationale_json.length
                  ? h("div", { key: "rationale", className: "mt-2 text-sm text-slate-500" }, control.rationale_json.join(" "))
                  : null
              ])))
              : h("div", { className: "text-sm text-slate-500" }, "No normalized control results are linked to this finding.")) : null,
            findingDetailView === "evidence" ? h(Card, { key: "evidence", title: "Evidence Records", description: "Reviewer-facing observations that support the finding." }, [
              h("div", { key: "evidence-list", className: "max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, [
                Array.isArray(selectedFinding.evidence_json) && selectedFinding.evidence_json.length
                  ? selectedFinding.evidence_json.map((item, index) => h("div", {
                    key: `evidence:${index}:${item}`,
                    className: "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 last:border-b-0"
                  }, [
                    h("div", { key: "index", className: "flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-mono text-slate-500" }, String(index + 1)),
                    h("div", { key: "body", className: "min-w-0" }, [
                      h("div", { key: "label", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Observation"),
                      h("div", { key: "value", className: "mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900" }, item),
                      h("div", { key: "meta", className: "mt-2 flex flex-wrap gap-1.5" }, [
                        selectedFinding.source ? findingChip("source", selectedFinding.source) : null,
                        selectedFinding.category ? findingChip("category", selectedFinding.category) : null
                      ].filter(Boolean))
                    ])
                  ]))
                  : h("div", { key: "empty", className: "px-4 py-3 text-sm text-slate-500" }, "No persisted evidence records are available for this finding.")
              ])
            ]) : null,
            findingDetailView === "evidence" ? h(Card, { key: "runtime-evidence", title: "Runtime Validation Evidence", description: "Normalized build, test, and runtime-probe records captured from bounded sandbox execution." }, relatedRuntimeEvidence.length
              ? h("div", { className: "max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, relatedRuntimeEvidence.map((item) => h("div", {
                key: item.id || item.evidence_id,
                className: "border-b border-slate-200 bg-slate-50 px-4 py-3 last:border-b-0"
              }, [
                h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                  h("div", { key: "copy" }, [
                    h("div", { key: "title", className: "font-medium" }, getEvidenceMetadata(item)?.normalized_artifact?.title || item.source_id || "sandbox evidence"),
                    h("div", { key: "meta", className: "text-sm text-slate-500" }, `${getEvidenceMetadata(item)?.phase || "unknown"} / ${getEvidenceMetadata(item)?.adapter || "unknown"} / ${getEvidenceMetadata(item)?.status || "unknown"}`)
                  ]),
                  h(Badge, { key: "status" }, getEvidenceMetadata(item)?.status || "unknown")
                ]),
                h("div", { key: "summary", className: "mt-2 whitespace-pre-wrap break-words text-sm leading-6" }, item.summary),
                getEvidenceLocations(item).length
                  ? h("div", { key: "locations", className: "mt-3 flex flex-wrap gap-1.5" },
                    getEvidenceLocations(item).slice(0, 3).map((location, index) => findingChip("", evidenceLocationLabel(location), "border-slate-200 bg-white text-slate-600")).concat(
                      getEvidenceLocations(item).length > 3 ? [findingChip("", `+${getEvidenceLocations(item).length - 3} refs`, "border-slate-200 bg-white text-slate-600")] : []
                    )
                  )
                  : null,
                runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact).length
                  ? h(DetailList, { key: "runtime-artifact-details", items: runtimeArtifactDetailItems(getEvidenceMetadata(item)?.normalized_artifact) })
                  : null
              ])))
              : h("div", { className: "text-sm text-slate-500" }, "No normalized runtime validation evidence is linked to this finding.")) : null,
            findingDetailView === "evidence" ? renderProvenanceSection({ selectedFinding, selectedFindingEvaluation, relatedRuntimeEvidence }) : null,
            findingDetailView === "evaluation" ? h(Card, { key: "review-grade", title: "Finding Evaluation", description: "Evidence strength, false-positive risk, and review guidance for this finding." }, selectedFindingEvaluation
              ? h("div", { className: "space-y-4" }, [
                h("div", { key: "summary-grid", className: "grid gap-3 md:grid-cols-3" }, [
                  evaluationStat("Evidence", selectedFindingEvaluation.evidence_sufficiency),
                  evaluationStat("False-Positive Risk", selectedFindingEvaluation.false_positive_risk),
                  evaluationStat("Review Guidance", selectedEvaluationReviewStatus)
                ]),
                selectedFindingQuality
                  ? h("div", { key: "finding-quality", className: cn("rounded-2xl border px-4 py-3", selectedFindingQuality.qa_blocking ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50") }, [
                    h("div", { key: "head", className: "flex flex-wrap items-center justify-between gap-3" }, [
                      h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Finding QA"),
                      h("div", { key: "chips", className: "flex flex-wrap gap-1.5" }, [
                        findingChip("evidence", selectedFindingQuality.evidence_support_verdict, qualityChipClass(selectedFindingQuality.evidence_support_verdict)),
                        findingChip("controls", selectedFindingQuality.control_mapping_verdict, qualityChipClass(selectedFindingQuality.control_mapping_verdict)),
                        findingChip("score", String(selectedFindingQuality.quality_score ?? "n/a"), qualityChipClass(selectedFindingQuality.qa_blocking ? "fail" : selectedFindingQuality.control_mapping_verdict))
                      ])
                    ]),
                    selectedFindingQuality.reasons?.length
                      ? h("ul", { key: "reasons", className: cn("mt-3 space-y-1 text-sm", selectedFindingQuality.qa_blocking ? "text-red-950" : "text-slate-700") }, selectedFindingQuality.reasons.slice(0, 5).map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                      : null,
                    selectedFindingQuality.unsupported_claims?.length
                      ? h("div", { key: "unsupported", className: "mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-900" }, [
                        h("div", { key: "label", className: "font-medium" }, "Unsupported claims"),
                        h("ul", { key: "list", className: "mt-1 list-disc space-y-1 pl-5" }, selectedFindingQuality.unsupported_claims.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                      ])
                      : null,
                    selectedFindingQuality.recommended_control_ids?.length
                      ? h("div", { key: "recommended", className: "mt-3 text-sm text-slate-600" }, `Recommended controls: ${selectedFindingQuality.recommended_control_ids.join(", ")}`)
                      : null
                  ])
                  : null,
                h("div", { key: "reasoning", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                  h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Reasoning"),
                  h("div", { key: "body", className: "mt-2 text-sm leading-6 text-slate-900" }, evaluationReasoningText({
                    finding: selectedFinding,
                    evaluation: selectedFindingEvaluation,
                    activeDisposition: selectedFindingDisposition?.effective_disposition
                  }))
                ]),
                selectedFindingEvaluation.validation_reasons?.length
                  ? h("div", { key: "validation-reasons", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-amber-700" }, "Why review is needed"),
                    h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-900" }, selectedFindingEvaluation.validation_reasons.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                  ])
                  : null,
                selectedRuntimeEvaluationRelevant
                  ? h("div", { key: "runtime", className: "rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3" }, [
                    h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-indigo-700" }, "Runtime Validation"),
                    h("div", { key: "badges", className: "mt-2 flex flex-wrap gap-1.5" }, [
                      findingChip("status", selectedFindingEvaluation.runtime_validation_status, "border-indigo-200 bg-white text-indigo-800"),
                      findingChip("impact", selectedFindingEvaluation.runtime_impact, "border-indigo-200 bg-white text-indigo-800"),
                      !["none", "not_applicable"].includes(String(selectedFindingEvaluation.runtime_followup_policy || ""))
                        ? findingChip("follow-up", selectedFindingEvaluation.runtime_followup_policy, "border-indigo-200 bg-white text-indigo-800")
                        : null,
                      selectedFindingEvaluation.runtime_evidence_ids?.length
                        ? findingChip("evidence", String(selectedFindingEvaluation.runtime_evidence_ids.length), "border-indigo-200 bg-white text-indigo-800")
                        : null
                    ].filter(Boolean)),
                    selectedFindingEvaluation.runtime_followup_outcome_summary
                      ? h("div", { key: "outcome", className: "mt-3 text-sm leading-6 text-indigo-950" }, selectedFindingEvaluation.runtime_followup_outcome_summary)
                      : null,
                    selectedFindingEvaluation.runtime_impact_reasons?.length
                      ? h("ul", { key: "impact-reasons", className: "mt-3 space-y-1 text-sm text-indigo-950" }, selectedFindingEvaluation.runtime_impact_reasons.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
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
                      selectedRuntimeEvaluationRelevant
                        ? h(Button, { key: "accept-runtime-gap", variant: "outline", onClick: () => onFindingReviewAction?.(selectedFinding, "accept_without_runtime_validation") }, "Accept Without Runtime Validation")
                        : null
                    ].filter(Boolean))
                  ])
                  : null,
                selectedRelationshipEvaluationRelevant
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
                h("details", { key: "calculation", className: "rounded-2xl border border-slate-200 bg-white" }, [
                  h("summary", { key: "summary", className: "cursor-pointer px-4 py-3 text-sm font-medium text-slate-900" }, "How this is calculated"),
                  h("div", { key: "content", className: "border-t border-slate-200 px-4 py-3 text-sm leading-6 text-slate-600" }, [
                    h("p", { key: "intro" }, "These fields are decision support, not a replacement for reviewer judgment."),
                    h("ul", { key: "rules", className: "mt-2 list-disc space-y-1 pl-5" }, [
                      h("li", { key: "evidence" }, "Evidence strength comes from the supervisor grade when available; otherwise it falls back to persisted evidence count and finding confidence."),
                      h("li", { key: "fp" }, "False-positive risk comes from the supervisor grade when available; otherwise it falls back to confidence bands."),
                      h("li", { key: "review" }, "Review is requested for low evidence, high false-positive risk, explicit supervisor/workflow requests, duplicate or conflicting findings, runtime-sensitive sandbox issues, or expired exceptions."),
                      h("li", { key: "runtime" }, "Runtime validation appears only for findings tied to runtime, build, install, test, service health, or explicitly linked runtime evidence.")
                    ])
                  ])
                ]),
                h("details", { key: "audit-metadata", className: "rounded-2xl border border-slate-200 bg-white" }, [
                  h("summary", { key: "summary", className: "cursor-pointer px-4 py-3 text-sm font-medium text-slate-900" }, "Audit metadata"),
                  h("div", { key: "content", className: "border-t border-slate-200 p-4" }, h(DetailList, {
                    items: findingItems([
                      { label: "Confidence", value: String(selectedFinding.confidence ?? "n/a") },
                      { label: "Score Impact", value: String(selectedFinding.score_impact ?? 0) },
                      { label: "Source", value: selectedFinding.source || "n/a" },
                      { label: "Standards", value: (selectedFinding.standards_refs_json || []).join(", ") || "n/a" },
                      { label: "Runtime Validation Status", value: selectedFindingEvaluation.runtime_validation_status },
                      { label: "Runtime Follow-up Policy", value: selectedFindingEvaluation.runtime_followup_policy },
                      { label: "Runtime Follow-up Resolution", value: selectedFindingEvaluation.runtime_followup_resolution },
                      { label: "Runtime Follow-up Outcome", value: selectedFindingEvaluation.runtime_followup_outcome },
                      { label: "Linked Rerun Run", value: selectedFindingEvaluation.runtime_followup_linked_run_id || "none" },
                      { label: "Runtime Evidence Count", value: String(selectedFindingEvaluation.runtime_evidence_ids?.length || 0) },
                      publisherMode ? { label: "Publication Safety", value: selectedFindingEvaluation.current_visibility } : null,
                      { label: "Evidence Symbols", value: selectedFindingEvaluation.evidence_symbols?.join(", ") || "none" }
                    ].filter(Boolean))
                  }))
                ]),
                !selectedFindingEvaluation.evidence_quality_summary && relatedSupervisorGrade
                  ? h("div", { key: "fallback", className: "text-sm text-slate-500" }, relatedSupervisorGrade.reasoning_summary)
                  : null
              ])
              : relatedSupervisorGrade
                ? h(DetailList, {
                  items: findingItems([
                    { label: "Evidence Sufficiency", value: relatedSupervisorGrade.evidence_sufficiency },
                    { label: "False Positive Risk", value: relatedSupervisorGrade.false_positive_risk },
                    { label: "Validation Recommended", value: relatedSupervisorGrade.validation_recommendation },
                    { label: "Reasoning", value: relatedSupervisorGrade.reasoning_summary }
                  ])
                })
                : h("div", { className: "text-sm text-slate-500" }, "No normalized evaluation is available for this finding.")) : null,
            findingDetailView === "governance" ? h(Card, { key: "finding-dispositions", title: "Exception History", description: "Active, expired, and revoked exceptions for this finding. Use this as reference while triaging." }, [
              selectedFindingSummary?.needs_disposition_review
                ? h("div", { key: "expired-note", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, "An earlier exception expired or changed. Re-review and save a new decision only if it still applies.")
                : null,
              selectedFindingSummary?.disposition_review_reason
                ? h("div", { key: "review-reason", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, selectedFindingSummary.disposition_review_reason)
                : null,
              selectedFindingDispositionHistory.length
                ? h("div", { key: "history", className: "mt-4 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white" }, selectedFindingDispositionHistory.map((item) => h("div", {
                  key: item.id,
                  className: "border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                }, [
                  h("div", { key: "head", className: "flex items-center justify-between gap-3" }, [
                    h("div", { key: "kind", className: "font-medium" }, `${exceptionRecordLabel(item)} / ${appliesToLabel(item.scope_level)}`),
                    h(Badge, { key: "status" }, item.status)
                  ]),
                  h("div", { key: "meta", className: "mt-1 text-slate-500" }, `${item.created_by} | ${formatDate(item.created_at)}${item.expires_at ? ` | expires ${formatDate(item.expires_at)}` : ""}${item.revoked_at ? ` | revoked ${formatDate(item.revoked_at)}` : ""}`),
                  item.metadata_json?.owner_id || item.metadata_json?.reviewed_at || item.metadata_json?.review_due_by
                    ? h("div", { key: "governance", className: "mt-1 text-slate-500" }, `owner ${item.metadata_json?.owner_id || "n/a"} | reviewed ${item.metadata_json?.reviewed_at ? formatDate(item.metadata_json.reviewed_at) : "n/a"} | review due ${item.metadata_json?.review_due_by ? formatDate(item.metadata_json.review_due_by) : "n/a"}`)
                    : null,
                  h("div", { key: "reason", className: "mt-2" }, item.reason),
                  item.status === "active"
                    ? h("div", { key: "actions", className: "mt-3 flex flex-wrap gap-2" }, [
                      h(Button, { key: "edit", variant: "outline", onClick: () => onEditFindingDisposition?.(selectedFinding, item) }, "Edit"),
                      h(Button, { key: "revoke", variant: "outline", onClick: () => onRevokeFindingDisposition?.(selectedFinding, item) }, "Revoke")
                    ])
                    : null
                ])))
                : h("div", { key: "empty", className: "mt-4 text-sm text-slate-500" }, "No exception history is available for this finding.")
            ]) : null,
            findingDetailView === "remediation" ? h(Card, { key: "remediation", title: "Remediation Plan", description: "Corrective-action planning for confirmed findings. Track owner, due date, fix work, verification evidence, and closure status here." }, [
              selectedFindingSummary?.disposition !== "confirmed"
                && !["remediation_open", "fix_in_progress", "verification_pending", "resolved", "reopened"].includes(String(selectedFindingSummary?.disposition || ""))
                ? h("div", { key: "triage-note", className: "mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" },
                  "This finding is not confirmed yet. Keep remediation planning lightweight until triage confirms the issue or assigns an accepted-risk/exception outcome."
                )
                : null,
              h("div", { key: "status", className: "grid gap-3 md:grid-cols-3" }, [
                evaluationStat("Remediation Status", selectedRemediationItem ? decisionLabel(selectedRemediationItem.status) : "not opened"),
                evaluationStat("Owner", selectedRemediationItem?.owner_id || "unassigned"),
                evaluationStat("Validation Run", selectedRemediationItem?.validation_run_id || "not linked")
              ]),
              h("div", { key: "remediation-form", className: "mt-4 grid gap-4 lg:grid-cols-2" }, [
                h(Field, { key: "summary", label: "Summary" }, h(Input, {
                  "data-testid": "remediation-summary-input",
                  value: selectedRemediationDraft.summary || "",
                  onChange: (event) => updateRemediationDraft("summary", event.target.value),
                  placeholder: "what engineering should fix"
                })),
                h(Field, { key: "owner", label: "Owner" }, h(Input, {
                  "data-testid": "remediation-owner-input",
                  value: selectedRemediationDraft.owner_id || "",
                  onChange: (event) => updateRemediationDraft("owner_id", event.target.value),
                  placeholder: "owner or team"
                })),
                h(Field, { key: "priority", label: "Priority" }, Select({
                  value: selectedRemediationDraft.priority || "",
                  onChange: (event) => updateRemediationDraft("priority", event.target.value)
                }, [
                  h("option", { key: "unset", value: "" }, "unset"),
                  h("option", { key: "p0", value: "p0" }, "P0 immediate"),
                  h("option", { key: "p1", value: "p1" }, "P1 this cycle"),
                  h("option", { key: "p2", value: "p2" }, "P2 backlog"),
                  h("option", { key: "p3", value: "p3" }, "P3 informational")
                ])),
                h(Field, { key: "due", label: "Due At" }, h(Input, {
                  type: "datetime-local",
                  value: formatDateInputValue(selectedRemediationDraft.due_at || ""),
                  onChange: (event) => updateRemediationDraft("due_at", event.target.value ? new Date(event.target.value).toISOString() : "")
                })),
                h(Field, { key: "issue", label: "External Issue URL" }, h(Input, {
                  "data-testid": "remediation-issue-url-input",
                  value: selectedRemediationDraft.external_issue_url || "",
                  onChange: (event) => updateRemediationDraft("external_issue_url", event.target.value),
                  placeholder: "manual GitHub/Jira link"
                })),
                h(Field, { key: "pr", label: "Fix PR URL" }, h(Input, {
                  "data-testid": "remediation-pr-url-input",
                  value: selectedRemediationDraft.external_pr_url || "",
                  onChange: (event) => updateRemediationDraft("external_pr_url", event.target.value),
                  placeholder: "pull request or change request"
                })),
                h(Field, { key: "commit", label: "Fix Commit SHA" }, h(Input, {
                  "data-testid": "remediation-commit-input",
                  value: selectedRemediationDraft.fix_commit_sha || "",
                  onChange: (event) => updateRemediationDraft("fix_commit_sha", event.target.value),
                  placeholder: "merge or fix commit"
                })),
                h(Field, { key: "validation", label: "Validation Run ID" }, h(Input, {
                  "data-testid": "remediation-validation-run-input",
                  value: selectedRemediationDraft.validation_run_id || "",
                  onChange: (event) => updateRemediationDraft("validation_run_id", event.target.value),
                  placeholder: "run id that verifies the fix"
                })),
                h(Field, { key: "criteria", label: "Acceptance Criteria" }, h("textarea", {
                  className: "min-h-[5rem] w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400",
                  value: selectedRemediationDraft.acceptance_criteria || "",
                  onChange: (event) => updateRemediationDraft("acceptance_criteria", event.target.value),
                  placeholder: "what proves the finding is fixed"
                })),
                h(Field, { key: "notes", label: "Resolution Notes" }, h("textarea", {
                  className: "min-h-[5rem] w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400",
                  value: selectedRemediationDraft.resolution_notes || "",
                  onChange: (event) => updateRemediationDraft("resolution_notes", event.target.value),
                  placeholder: "closure evidence or reviewer notes"
                }))
              ]),
              h("div", { key: "remediation-actions", className: "mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3" }, [
                h(Button, { key: "open", "data-testid": "remediation-open-button", variant: selectedRemediationItem ? "outline" : "secondary", onClick: () => saveSelectedRemediation("open") }, selectedRemediationItem ? "Save Remediation" : "Open Remediation"),
                h(Button, { key: "progress", "data-testid": "remediation-start-fix-button", variant: "outline", onClick: () => saveSelectedRemediation("fix_in_progress") }, "Start Fix"),
                h(Button, { key: "ready", "data-testid": "remediation-ready-validation-button", variant: "outline", onClick: () => saveSelectedRemediation("fix_ready_for_validation") }, "Fix Ready For Validation"),
                h(Button, { key: "verify", "data-testid": "remediation-verification-pending-button", variant: "outline", onClick: () => saveSelectedRemediation("verification_pending") }, "Verification Pending"),
                h(Button, {
                  key: "resolved",
                  "data-testid": "remediation-resolve-button",
                  onClick: () => saveSelectedRemediation("resolved"),
                  disabled: !String(selectedRemediationDraft.validation_run_id || selectedRemediationDraft.resolution_notes || selectedRemediationDraft.fix_commit_sha || "").trim()
                }, "Resolve With Evidence"),
                selectedRemediationItem
                  ? h(Button, { key: "reopen", variant: "outline", onClick: () => saveSelectedRemediation("reopened") }, "Reopen")
                  : null
              ].filter(Boolean)),
              h("div", { key: "community-note", className: "mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600" },
                "Community Edition stores manual external issue and PR links but does not create GitHub issues or listen for GitHub webhooks. Tethermark Cloud automates connector creation, webhook sync, merge detection, and validation scheduling."
              ),
              remediation
                ? h("div", { key: "remediation-copy", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
                  h("div", { key: "summary", className: "text-sm" }, remediation.summary),
                  Array.isArray(remediation.checklist_json) && remediation.checklist_json.length
                    ? h("ul", { key: "checklist", className: "mt-3 space-y-2 text-sm text-slate-500" }, remediation.checklist_json.map((item, index) => h("li", { key: `${index}:${item}` }, item)))
                    : null
                ])
                : h("div", { key: "remediation-empty", className: "text-sm text-slate-500" }, "No remediation memo is available for this run."),
              h("div", { key: "cap-note", className: "mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600" },
                "Equivalent to a CAP or POA&M item: assign an owner, define corrective tasks, set a target date, attach fix evidence, and verify closure in a later run."
              )
            ]) : null
          ])
      })
        : h("div", { className: "border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500" }, "No persisted findings are available for this run.")
    ]),
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
          `Exception re-review queue: ${findingsNeedingDispositionReview.map((item) => item.finding_id).join(", ")}`)
        : null
    ]),
    h(Card, { key: "notes-timeline", title: "Review Notes", description: "Reviewer notes separated from raw action history for faster handoff and audit context.", className: "border-slate-200 bg-white shadow-sm" }, h(ReviewNotesTimeline, { actions: reviewActions })),
    h(Card, { key: "evaluation-overview", title: "Evaluation Overview", description: "Run-level result evaluation derived from findings, supervisor review, and review workflow.", className: "border-slate-200 bg-white shadow-sm" }, findingEvaluations
      ? h("div", { className: "space-y-4" }, [
        h(DetailList, {
          key: "evaluation-summary",
          items: [
            { label: "Overall Evidence Sufficiency", value: findingEvaluations.overall_evidence_sufficiency },
            { label: "Integrity Verdict", value: findingQuality?.overall_verdict || "n/a" },
            { label: "Integrity Blockers", value: String(findingQuality?.blocking_count || 0) },
            { label: "Unsupported Findings", value: String(findingQuality?.unsupported_count || 0) },
            { label: "Control Mapping Issues", value: String((findingQuality?.wrong_control_count || 0) + (findingQuality?.missing_control_count || 0)) },
            { label: "Overall False Positive Risk", value: findingEvaluations.overall_false_positive_risk },
            { label: "Needs Validation", value: String(findingEvaluations.findings_needing_validation_count) },
            { label: "Exceptions", value: String(findingEvaluations.suppressed_finding_count || 0) },
            { label: "Accepted Risk", value: String(findingEvaluations.waived_finding_count || 0) },
            { label: "Expired Exceptions", value: String(findingEvaluations.expired_disposition_count || 0) },
            { label: "Reopened Exceptions", value: String(findingEvaluations.reopened_disposition_count || 0) },
            { label: "Needs Exception Re-Review", value: String(findingEvaluations.findings_needing_disposition_review_count || 0) },
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
    h(Card, { key: "disposition-lifecycle", title: "Exception Lifecycle", description: "Track active exceptions, upcoming expiries, and findings that need explicit re-review.", className: "border-slate-200 bg-white shadow-sm" }, [
      h("div", { key: "grid", className: "grid gap-4 lg:grid-cols-4" }, [
        h("div", { key: "suppressed", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Exceptions"),
          suppressedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, suppressedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No active exceptions.")
        ]),
        h("div", { key: "waived", className: "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-slate-500" }, "Accepted Risk"),
          waivedFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm" }, waivedFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-slate-500" }, "No active risk acceptances.")
        ]),
        h("div", { key: "expired", className: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-amber-700" }, "Expired / Re-Review"),
          expiredDispositionFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-amber-900" }, expiredDispositionFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-amber-900/80" }, "No expired exceptions.")
        ]),
        h("div", { key: "due-soon", className: "rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3" }, [
          h("div", { key: "title", className: "text-xs font-mono uppercase tracking-[0.18em] text-orange-700" }, "Due Soon"),
          dueSoonDispositionFindingSummaries.length
            ? h("ul", { key: "list", className: "mt-2 space-y-1 text-sm text-orange-900" }, dueSoonDispositionFindingSummaries.map((item) => h("li", { key: item.finding_id }, `${item.finding_id}: ${item.title}${item.active_disposition_hours_until_expiry !== null ? ` (${Math.max(0, Math.round(item.active_disposition_hours_until_expiry))}h)` : ""}`)))
            : h("div", { key: "empty", className: "mt-2 text-sm text-orange-900/80" }, "No exceptions due soon.")
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
        ? h("div", { key: "rereview", className: "mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" }, `Exception re-review queue: ${findingsNeedingDispositionReview.map((item) => item.finding_id).join(", ")}`)
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
      assistantPanel,
      helpers: { Button, Card }
    });
  }
  return h("div", { className: "grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]" }, [
    h("div", { key: "panels", className: "space-y-6" }, panels),
    h("aside", { key: "assistant", className: "min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200 bg-white" }, assistantPanel)
  ]);
}

window.TethermarkFeatures = {
  ...(window.TethermarkFeatures || {}),
  RunDetailPanel: RunDetailPanelComponent
};

