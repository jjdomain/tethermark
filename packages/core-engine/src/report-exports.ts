import type { PersistedFindingRecord, PersistedRemediationMemoRecord, PersistedResolvedConfigurationRecord, PersistedReviewDecisionRecord } from "./persistence/contracts.js";
import type { FindingEvaluationSummary } from "./finding-evaluation.js";

export interface ReportRunSummaryRecord {
  id: string;
  status: string;
  audit_package: string;
  run_mode: string;
  rating: string | null;
  overall_score: number | null;
}

function severityToSarifLevel(severity: string): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function severityRank(severity: string | null | undefined): number {
  switch (String(severity ?? "").toLowerCase()) {
    case "critical": return 5;
    case "high": return 4;
    case "medium": return 3;
    case "low": return 2;
    case "info": return 1;
    default: return 0;
  }
}

function normalizeSarifToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function buildSarifRuleId(category: string | null | undefined, title: string | null | undefined): string {
  return `tethermark/${normalizeSarifToken(category)}/${normalizeSarifToken(title)}`;
}

function deriveSarifLocations(evidence: string[]): Array<Record<string, unknown>> | undefined {
  const fileLikeEntry = evidence.find((item) => /([A-Za-z]:\\|\/|\.\/|[^:\s]+\/)[^\s]+/.test(item));
  if (!fileLikeEntry) return undefined;
  const match = fileLikeEntry.match(/(?<path>(?:[A-Za-z]:\\|\.\/|\/)?[^\s:]+(?:[\\/][^\s:]+)*\.[A-Za-z0-9]+)(?::(?<line>\d+))?/);
  if (!match?.groups?.path) return undefined;
  return [{
    physicalLocation: {
      artifactLocation: {
        uri: match.groups.path.replace(/\\/g, "/")
      },
      region: match.groups.line ? { startLine: Number(match.groups.line) } : undefined
    }
  }];
}

function deriveSarifLocationsFromEvidenceRecords(evidenceRecords: Array<Record<string, any>>): Array<Record<string, unknown>> | undefined {
  const locations: Array<Record<string, unknown>> = [];
  for (const record of evidenceRecords) {
    const recordLocations = Array.isArray(record?.locations_json)
      ? record.locations_json
      : Array.isArray(record?.locations)
        ? record.locations
        : [];
    for (const location of recordLocations) {
      const path = typeof location?.path === "string" && location.path
        ? location.path
        : typeof location?.uri === "string" && location.uri && !/^https?:/i.test(location.uri)
          ? location.uri
          : null;
      if (!path) continue;
      locations.push({
        physicalLocation: {
          artifactLocation: {
            uri: String(path).replace(/\\/g, "/")
          },
          region: location?.line
            ? {
                startLine: Number(location.line),
                startColumn: typeof location?.column === "number" ? Number(location.column) : undefined,
                endLine: typeof location?.end_line === "number" ? Number(location.end_line) : undefined,
                endColumn: typeof location?.end_column === "number" ? Number(location.end_column) : undefined
              }
            : undefined
        },
        message: location?.label ? { text: String(location.label) } : undefined
      });
    }
  }
  return locations.length ? locations.slice(0, 25) : undefined;
}

function deriveSarifRelatedLocationsFromEvidenceRecords(evidenceRecords: Array<Record<string, any>>): Array<Record<string, unknown>> | undefined {
  const locations = deriveSarifLocationsFromEvidenceRecords(evidenceRecords) ?? [];
  if (locations.length <= 1) return undefined;
  return locations.slice(1, 26).map((location, index) => ({
    id: index + 1,
    ...location
  }));
}

function deriveSarifCodeFlowsFromEvidenceRecords(evidenceRecords: Array<Record<string, any>>): Array<Record<string, unknown>> | undefined {
  const rawLocations = evidenceRecords.flatMap((record) => Array.isArray(record?.locations_json) ? record.locations_json : Array.isArray(record?.locations) ? record.locations : []);
  if (rawLocations.length <= 1) return undefined;
  const threadFlows = rawLocations.slice(0, 10).map((location) => {
    const uri = typeof location?.path === "string" && location.path
      ? String(location.path).replace(/\\/g, "/")
      : typeof location?.uri === "string" && location.uri
        ? String(location.uri)
        : null;
    const symbol = typeof location?.symbol === "string" && location.symbol ? String(location.symbol) : null;
    return {
      location: {
        physicalLocation: uri ? {
          artifactLocation: { uri },
          region: typeof location?.line === "number" ? {
            startLine: Number(location.line),
            startColumn: typeof location?.column === "number" ? Number(location.column) : undefined
          } : undefined
        } : undefined,
        logicalLocations: symbol ? [{ name: symbol, kind: "function" }] : undefined,
        message: location?.label ? { text: String(location.label) } : undefined
      }
    };
  });
  return [{ threadFlows: [{ locations: threadFlows }] }];
}

function deriveEvidenceSymbolsFromEvidenceRecords(evidenceRecords: Array<Record<string, any>>): string[] {
  const symbols = new Set<string>();
  for (const record of evidenceRecords) {
    const recordLocations = Array.isArray(record?.locations_json)
      ? record.locations_json
      : Array.isArray(record?.locations)
        ? record.locations
        : [];
    for (const location of recordLocations) {
      if (typeof location?.symbol === "string" && location.symbol.trim()) {
        symbols.add(location.symbol.trim());
      }
    }
  }
  return [...symbols].slice(0, 25);
}

function formatEvidenceLocation(location: Record<string, any>): string {
  const path = typeof location?.path === "string" && location.path
    ? location.path
    : typeof location?.uri === "string" && location.uri
      ? location.uri
      : location?.symbol
        ? String(location.symbol)
        : "unknown";
  const line = typeof location?.line === "number" ? `:${location.line}` : "";
  const column = typeof location?.column === "number" ? `:${location.column}` : "";
  const suffix = location?.label ? ` (${String(location.label)})` : "";
  return `${path}${line}${column}${suffix}`;
}

export function buildExecutiveSummaryPayload(args: {
  run: ReportRunSummaryRecord;
  summary: Record<string, unknown>;
  findings: PersistedFindingRecord[];
  evaluations: FindingEvaluationSummary;
  reviewDecision: PersistedReviewDecisionRecord | null;
  remediation: PersistedRemediationMemoRecord | null;
  resolvedConfiguration: PersistedResolvedConfigurationRecord | null;
}): Record<string, unknown> {
  const topFindings = [...args.findings]
    .map((finding) => {
      const evaluation = args.evaluations.evaluations.find((item) => item.finding_id === finding.id);
      return {
        finding_id: finding.id,
        title: finding.title,
        category: finding.category,
        severity: evaluation?.current_severity ?? finding.severity,
        confidence: finding.confidence,
        evidence_sufficiency: evaluation?.evidence_sufficiency ?? "unknown",
        runtime_validation_status: evaluation?.runtime_validation_status ?? "not_applicable",
        next_action: evaluation?.next_action ?? "ready_for_review",
        disposition: evaluation?.review_disposition ?? "open"
      };
    })
    .sort((left, right) => {
      const severityDiff = severityRank(right.severity) - severityRank(left.severity);
      if (severityDiff !== 0) return severityDiff;
      return Number(right.confidence ?? 0) - Number(left.confidence ?? 0);
    })
    .slice(0, 5);
  const activeDispositions = args.evaluations.evaluations
    .filter((item) => item.active_disposition_type)
    .map((item) => ({
      finding_id: item.finding_id,
      title: item.title,
      type: item.active_disposition_type,
      scope: item.active_disposition_scope ?? "none",
      reason: item.active_disposition_reason ?? null,
      review_due_by: item.active_disposition_review_due_by ?? null,
      expires_at: item.active_disposition_expires_at ?? null
    }));
  const outstandingFollowups = args.evaluations.evaluations
    .filter((item) => item.runtime_followup_policy && item.runtime_followup_policy !== "none" && item.runtime_followup_policy !== "not_applicable" && !["rerun_outcome_adopted", "manual_review_completed", "accepted_without_runtime_validation"].includes(String(item.runtime_followup_resolution ?? "none")))
    .map((item) => ({
      finding_id: item.finding_id,
      title: item.title,
      runtime_followup_policy: item.runtime_followup_policy,
      runtime_validation_status: item.runtime_validation_status,
      runtime_followup_outcome: item.runtime_followup_outcome,
      next_action: item.next_action
    }));
  return {
    run_id: args.run.id,
    status: args.run.status,
    audit_package: args.run.audit_package,
    run_mode: args.run.run_mode,
    rating: args.run.rating ?? null,
    overall_score: args.summary.overall_score ?? args.run.overall_score ?? null,
    target_class: args.resolvedConfiguration?.initial_target_class ?? null,
    publishability_status: args.reviewDecision?.publishability_status ?? null,
    human_review_required: Boolean(args.reviewDecision?.human_review_required),
    finding_count: args.findings.length,
    top_findings: topFindings,
    runtime_validation: {
      validated_count: args.evaluations.runtime_validation_validated_count,
      blocked_count: args.evaluations.runtime_validation_blocked_count,
      failed_count: args.evaluations.runtime_validation_failed_count,
      recommended_count: args.evaluations.runtime_validation_recommended_count
    },
    dispositions: {
      suppressed_count: args.evaluations.suppressed_finding_count,
      waived_count: args.evaluations.waived_finding_count,
      expired_count: args.evaluations.expired_disposition_count,
      reopened_count: args.evaluations.reopened_disposition_count,
      needs_review_count: args.evaluations.findings_needing_disposition_review_count,
      active: activeDispositions
    },
    runtime_followups: {
      required_count: args.evaluations.runtime_followup_required_count,
      resolved_count: args.evaluations.runtime_followup_resolved_count,
      rerun_requested_count: args.evaluations.runtime_followup_rerun_requested_count,
      completed_count: args.evaluations.runtime_followup_completed_count,
      outstanding: outstandingFollowups
    },
    remediation_summary: args.remediation?.summary ?? null,
    remediation_checklist: toArray(args.remediation?.checklist_json),
    outstanding_actions: [
      ...(args.reviewDecision?.human_review_required ? ["human_review_required"] : []),
      ...(args.evaluations.findings_needing_validation_count ? [`${args.evaluations.findings_needing_validation_count} findings need validation`] : []),
      ...(args.evaluations.runtime_followup_required_count ? [`${args.evaluations.runtime_followup_required_count} runtime follow-up items require action`] : []),
      ...(args.evaluations.findings_needing_disposition_review_count ? [`${args.evaluations.findings_needing_disposition_review_count} findings need disposition re-review`] : [])
    ]
  };
}

export function buildExecutiveMarkdownReport(args: {
  run: ReportRunSummaryRecord;
  summary: Record<string, unknown>;
  findings: PersistedFindingRecord[];
  evaluations: FindingEvaluationSummary;
  reviewDecision: PersistedReviewDecisionRecord | null;
  remediation: PersistedRemediationMemoRecord | null;
  resolvedConfiguration: PersistedResolvedConfigurationRecord | null;
}): string {
  const executive = buildExecutiveSummaryPayload(args);
  const lines: string[] = [];
  lines.push(`# Executive Security Summary`);
  lines.push("");
  lines.push(`- Run ID: ${executive.run_id}`);
  lines.push(`- Status: ${executive.status}`);
  lines.push(`- Audit Package: ${executive.audit_package}`);
  lines.push(`- Rating: ${executive.rating ?? "n/a"}`);
  lines.push(`- Overall Score: ${executive.overall_score ?? "n/a"}`);
  lines.push(`- Target Class: ${executive.target_class ?? "n/a"}`);
  lines.push(`- Publishability: ${executive.publishability_status ?? "n/a"}`);
  lines.push(`- Human Review Required: ${executive.human_review_required ? "yes" : "no"}`);
  lines.push("");
  lines.push(`## Top Findings`);
  lines.push("");
  if (!(executive.top_findings as Array<unknown>).length) {
    lines.push(`No top findings were recorded for this run.`);
  } else {
    for (const item of executive.top_findings as Array<Record<string, unknown>>) {
      lines.push(`- ${String(item.title)} (${String(item.category)}) - ${String(item.severity)} severity, runtime ${String(item.runtime_validation_status)}, next ${String(item.next_action)}`);
    }
  }
  lines.push("");
  lines.push(`## Runtime Validation`);
  lines.push("");
  lines.push(`- Validated: ${String((executive.runtime_validation as Record<string, unknown>).validated_count ?? 0)}`);
  lines.push(`- Blocked: ${String((executive.runtime_validation as Record<string, unknown>).blocked_count ?? 0)}`);
  lines.push(`- Failed: ${String((executive.runtime_validation as Record<string, unknown>).failed_count ?? 0)}`);
  lines.push(`- Recommended: ${String((executive.runtime_validation as Record<string, unknown>).recommended_count ?? 0)}`);
  lines.push("");
  lines.push(`## Dispositions`);
  lines.push("");
  lines.push(`- Waived: ${String((executive.dispositions as Record<string, unknown>).waived_count ?? 0)}`);
  lines.push(`- Suppressed: ${String((executive.dispositions as Record<string, unknown>).suppressed_count ?? 0)}`);
  lines.push(`- Expired: ${String((executive.dispositions as Record<string, unknown>).expired_count ?? 0)}`);
  lines.push(`- Needs Re-Review: ${String((executive.dispositions as Record<string, unknown>).needs_review_count ?? 0)}`);
  lines.push("");
  lines.push(`## Outstanding Actions`);
  lines.push("");
  if (!(executive.outstanding_actions as Array<unknown>).length) {
    lines.push(`No outstanding actions were derived for this run.`);
  } else {
    for (const item of executive.outstanding_actions as Array<unknown>) lines.push(`- ${String(item)}`);
  }
  if (executive.remediation_summary) {
    lines.push("");
    lines.push(`## Remediation Summary`);
    lines.push("");
    lines.push(String(executive.remediation_summary));
  }
  return lines.join("\n");
}

export function buildMarkdownRunReport(args: {
  run: ReportRunSummaryRecord;
  summary: Record<string, unknown>;
  findings: PersistedFindingRecord[];
  evaluations: FindingEvaluationSummary;
  reviewDecision: PersistedReviewDecisionRecord | null;
  remediation: PersistedRemediationMemoRecord | null;
  resolvedConfiguration: PersistedResolvedConfigurationRecord | null;
}): string {
  const lines: string[] = [];
  lines.push(`# AI Security Audit Report`);
  lines.push("");
  lines.push(`- Run ID: ${args.run.id}`);
  lines.push(`- Status: ${args.run.status}`);
  lines.push(`- Audit Package: ${args.run.audit_package}`);
  lines.push(`- Run Mode: ${args.run.run_mode}`);
  lines.push(`- Rating: ${args.run.rating ?? "n/a"}`);
  lines.push(`- Overall Score: ${String(args.summary.overall_score ?? args.run.overall_score ?? "n/a")}`);
  lines.push(`- Publishability: ${args.reviewDecision?.publishability_status ?? "n/a"}`);
  lines.push(`- Human Review Required: ${args.reviewDecision?.human_review_required ? "yes" : "no"}`);
  lines.push(`- Target Class: ${args.resolvedConfiguration?.initial_target_class ?? "n/a"}`);
  lines.push("");
  lines.push(`## Evaluation Summary`);
  lines.push("");
  lines.push(`- Overall Evidence Sufficiency: ${args.evaluations.overall_evidence_sufficiency}`);
  lines.push(`- Overall False Positive Risk: ${args.evaluations.overall_false_positive_risk}`);
  lines.push(`- Findings Needing Validation: ${args.evaluations.findings_needing_validation_count}`);
  lines.push(`- Runtime Validation Validated: ${args.evaluations.runtime_validation_validated_count}`);
  lines.push(`- Runtime Validation Blocked: ${args.evaluations.runtime_validation_blocked_count}`);
  lines.push(`- Runtime Validation Failed: ${args.evaluations.runtime_validation_failed_count}`);
  lines.push(`- Runtime Validation Recommended: ${args.evaluations.runtime_validation_recommended_count}`);
  lines.push(`- Runtime Follow-up Required: ${args.evaluations.runtime_followup_required_count}`);
  lines.push(`- Runtime Follow-up Resolved: ${args.evaluations.runtime_followup_resolved_count}`);
  lines.push(`- Runtime Follow-up Rerun Requested: ${args.evaluations.runtime_followup_rerun_requested_count}`);
  lines.push(`- Runtime Follow-up Completed: ${args.evaluations.runtime_followup_completed_count}`);
  lines.push(`- Suppressed Findings: ${args.evaluations.suppressed_finding_count}`);
  lines.push(`- Waived Findings: ${args.evaluations.waived_finding_count}`);
  lines.push(`- Duplicate Groups: ${args.evaluations.duplicate_groups.length}`);
  lines.push(`- Conflict Pairs: ${args.evaluations.conflict_pairs.length}`);
  if (args.evaluations.sandbox_execution) {
    lines.push(`- Sandbox Execution Readiness: ${args.evaluations.sandbox_execution.readiness_status}`);
    lines.push(`- Sandbox Steps: ${args.evaluations.sandbox_execution.total_steps}`);
    lines.push(`- Sandbox Completed Steps: ${args.evaluations.sandbox_execution.completed_step_count}`);
    lines.push(`- Sandbox Failed Steps: ${args.evaluations.sandbox_execution.failed_step_count}`);
    lines.push(`- Sandbox Blocked Steps: ${args.evaluations.sandbox_execution.blocked_step_count}`);
  }
  lines.push("");
  if (args.evaluations.sandbox_execution?.attention_reasons?.length) {
    lines.push(`Sandbox Execution Attention:`);
    for (const item of args.evaluations.sandbox_execution.attention_reasons) lines.push(`- ${item}`);
    lines.push("");
  }
  if (args.remediation) {
    lines.push(`## Remediation Summary`);
    lines.push("");
    lines.push(args.remediation.summary);
    const checklist = toArray(args.remediation.checklist_json);
    if (checklist.length) {
      lines.push("");
      lines.push(`Checklist:`);
      for (const item of checklist) lines.push(`- ${item}`);
      lines.push("");
    } else {
      lines.push("");
    }
  }
  lines.push(`## Findings`);
  lines.push("");
  if (!args.findings.length) {
    lines.push(`No persisted findings were recorded for this run.`);
    return lines.join("\n");
  }
  for (const finding of args.findings) {
    const evaluation = args.evaluations.evaluations.find((item) => item.finding_id === finding.id);
    lines.push(`### ${finding.title}`);
    lines.push("");
    lines.push(`- Finding ID: ${finding.id}`);
    lines.push(`- Severity: ${evaluation?.current_severity ?? finding.severity}`);
    lines.push(`- Category: ${finding.category}`);
    lines.push(`- Confidence: ${finding.confidence}`);
    lines.push(`- Visibility: ${evaluation?.current_visibility ?? finding.publication_state}`);
    lines.push(`- Review Disposition: ${evaluation?.review_disposition ?? "open"}`);
    lines.push(`- Active Disposition Type: ${evaluation?.active_disposition_type ?? "none"}`);
    lines.push(`- Active Disposition Scope: ${evaluation?.active_disposition_scope ?? "none"}`);
    lines.push(`- Evidence Sufficiency: ${evaluation?.evidence_sufficiency ?? "unknown"}`);
    lines.push(`- False Positive Risk: ${evaluation?.false_positive_risk ?? "unknown"}`);
    lines.push(`- Runtime Validation Status: ${evaluation?.runtime_validation_status ?? "not_applicable"}`);
    lines.push(`- Runtime Follow-up Policy: ${evaluation?.runtime_followup_policy ?? "not_applicable"}`);
    lines.push(`- Runtime Follow-up Resolution: ${evaluation?.runtime_followup_resolution ?? "none"}`);
    lines.push(`- Runtime Follow-up Outcome: ${evaluation?.runtime_followup_outcome ?? "none"}`);
    lines.push(`- Validation Recommendation: ${evaluation?.validation_recommendation ?? "no"}`);
    lines.push(`- Next Action: ${evaluation?.next_action ?? "ready_for_review"}`);
    if (evaluation?.runtime_followup_linked_run_id) lines.push(`- Linked Rerun Run: ${evaluation.runtime_followup_linked_run_id}`);
    lines.push("");
    lines.push(finding.description);
    const evidence = toArray(finding.evidence_json);
    if (evidence.length) {
      lines.push("");
      lines.push(`Evidence:`);
      for (const item of evidence) lines.push(`- ${item}`);
    }
    if (evaluation?.validation_reasons?.length) {
      lines.push("");
      lines.push(`Validation Reasons:`);
      for (const item of evaluation.validation_reasons) lines.push(`- ${item}`);
    }
    if (evaluation?.active_disposition_reason) {
      lines.push("");
      lines.push(`Disposition Reason: ${evaluation.active_disposition_reason}`);
    }
    if (evaluation?.duplicate_with_finding_ids?.length) {
      lines.push("");
      lines.push(`Possible Duplicates: ${evaluation.duplicate_with_finding_ids.join(", ")}`);
    }
    if (evaluation?.conflict_with_finding_ids?.length) {
      lines.push("");
      lines.push(`Conflicts: ${evaluation.conflict_with_finding_ids.join(", ")}`);
    }
    if (evaluation?.runtime_evidence_locations?.length) {
      lines.push("");
      lines.push(`Runtime Evidence Locations:`);
      for (const item of evaluation.runtime_evidence_locations) lines.push(`- ${formatEvidenceLocation(item)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildSarifRunReport(args: {
  run: ReportRunSummaryRecord;
  findings: PersistedFindingRecord[];
  evaluations: FindingEvaluationSummary;
  evidenceRecords?: any[];
  toolName?: string;
}): Record<string, unknown> {
  const rules = new Map<string, Record<string, unknown>>();
  const results = args.findings.map((finding) => {
    const evaluation = args.evaluations.evaluations.find((item) => item.finding_id === finding.id);
    const evidence = toArray(finding.evidence_json);
    const linkedEvidenceRecords = Array.isArray(args.evidenceRecords)
      ? args.evidenceRecords.filter((record: any) => {
          if (Array.isArray(evaluation?.runtime_evidence_ids) && evaluation.runtime_evidence_ids.includes(record?.id || record?.evidence_id)) return true;
          return false;
        })
      : [];
    const evidenceLocations = linkedEvidenceRecords.flatMap((record: any) => Array.isArray(record?.locations_json) ? record.locations_json : Array.isArray(record?.locations) ? record.locations : []);
    const evidenceSymbols = deriveEvidenceSymbolsFromEvidenceRecords(linkedEvidenceRecords);
    const primaryLocation = deriveSarifLocationsFromEvidenceRecords(linkedEvidenceRecords) ?? deriveSarifLocations(evidence);
    const ruleId = buildSarifRuleId(finding.category, finding.title);
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: finding.title,
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.description },
        properties: {
          category: finding.category,
          defaultSeverity: finding.severity,
          tethermarkCategory: finding.category,
          tags: [normalizeSarifToken(finding.category), normalizeSarifToken(evaluation?.current_severity ?? finding.severity)]
        }
      });
    }
    const markdown = [
      `Evidence sufficiency: ${evaluation?.evidence_sufficiency ?? "unknown"}`,
      `False positive risk: ${evaluation?.false_positive_risk ?? "unknown"}`,
      `Runtime validation status: ${evaluation?.runtime_validation_status ?? "not_applicable"}`,
      `Runtime follow-up policy: ${evaluation?.runtime_followup_policy ?? "not_applicable"}`,
      `Runtime follow-up resolution: ${evaluation?.runtime_followup_resolution ?? "none"}`,
      `Runtime follow-up outcome: ${evaluation?.runtime_followup_outcome ?? "none"}`,
      `Validation recommendation: ${evaluation?.validation_recommendation ?? "no"}`,
      ...(evaluation?.validation_reasons?.length ? ["Validation reasons:", ...evaluation.validation_reasons.map((item) => `- ${item}`)] : [])
    ].join("\n");
    return {
      ruleId,
      level: severityToSarifLevel(evaluation?.current_severity ?? finding.severity),
      fingerprints: {
        "tethermark/finding-id": String(finding.id),
        "tethermark/signature": `${normalizeSarifToken(finding.category)}:${normalizeSarifToken(finding.title)}:${normalizeSarifToken(evaluation?.current_severity ?? finding.severity)}`,
        ...(evidenceLocations[0]?.path ? { "tethermark/location": `${normalizeSarifToken(evidenceLocations[0].path)}:${evidenceLocations[0].line ?? 0}:${evidenceLocations[0].column ?? 0}` } : {}),
        ...(evidenceSymbols[0] ? { "tethermark/symbol": normalizeSarifToken(evidenceSymbols[0]) } : {})
      },
      partialFingerprints: {
        "tethermark/runtime-validation-status": String(evaluation?.runtime_validation_status ?? "not_applicable"),
        "tethermark/runtime-followup-policy": String(evaluation?.runtime_followup_policy ?? "not_applicable"),
        ...(evidenceSymbols.length ? { "tethermark/evidence-identity": evidenceSymbols.map((item) => normalizeSarifToken(item)).join(",") } : {})
      },
      message: {
        text: finding.description,
        markdown
      },
      locations: primaryLocation,
      relatedLocations: deriveSarifRelatedLocationsFromEvidenceRecords(linkedEvidenceRecords),
      codeFlows: deriveSarifCodeFlowsFromEvidenceRecords(linkedEvidenceRecords),
      properties: {
        sandboxExecution: args.evaluations.sandbox_execution,
        findingId: finding.id,
        category: finding.category,
        originalSeverity: finding.severity,
        currentSeverity: evaluation?.current_severity ?? finding.severity,
        visibility: evaluation?.current_visibility ?? finding.publication_state,
        reviewDisposition: evaluation?.review_disposition ?? "open",
        activeDispositionType: evaluation?.active_disposition_type ?? null,
        activeDispositionScope: evaluation?.active_disposition_scope ?? null,
        activeDispositionReason: evaluation?.active_disposition_reason ?? null,
        activeDispositionExpiresAt: evaluation?.active_disposition_expires_at ?? null,
        confidence: finding.confidence,
        evidenceSufficiency: evaluation?.evidence_sufficiency ?? null,
        falsePositiveRisk: evaluation?.false_positive_risk ?? null,
        runtimeValidationStatus: evaluation?.runtime_validation_status ?? "not_applicable",
        runtimeFollowupPolicy: evaluation?.runtime_followup_policy ?? "not_applicable",
        runtimeFollowupResolution: evaluation?.runtime_followup_resolution ?? "none",
        runtimeFollowupOutcome: evaluation?.runtime_followup_outcome ?? "none",
        runtimeFollowupLinkedRunId: evaluation?.runtime_followup_linked_run_id ?? null,
        validationRecommendation: evaluation?.validation_recommendation ?? "no",
        nextAction: evaluation?.next_action ?? "ready_for_review",
        duplicateWithFindingIds: evaluation?.duplicate_with_finding_ids ?? [],
        conflictWithFindingIds: evaluation?.conflict_with_finding_ids ?? [],
        evidence,
        ...(evidenceSymbols.length ? { evidenceSymbols } : {}),
        ...(evidenceLocations.length ? { evidenceLocations } : {}),
        tethermarkRuleId: ruleId
      }
    };
  });
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: args.toolName ?? "tethermark",
            informationUri: "https://github.com/",
            semanticVersion: "1.0.0",
            taxa: [
              {
                id: "tethermark.runtime_validation",
                name: "Runtime Validation",
                shortDescription: { text: "Tethermark runtime-validation and rerun-aware audit taxonomy." }
              }
            ],
            rules: [...rules.values()]
          }
        },
        automationDetails: {
          id: args.run.id
        },
        results
      }
    ]
  };
}
