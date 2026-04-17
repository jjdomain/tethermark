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
    lines.push("");
  }
  return lines.join("\n");
}

export function buildSarifRunReport(args: {
  run: ReportRunSummaryRecord;
  findings: PersistedFindingRecord[];
  evaluations: FindingEvaluationSummary;
  toolName?: string;
}): Record<string, unknown> {
  const rules = new Map<string, Record<string, unknown>>();
  const results = args.findings.map((finding) => {
    const evaluation = args.evaluations.evaluations.find((item) => item.finding_id === finding.id);
    const ruleId = `${finding.category}:${finding.title}`.replace(/\s+/g, "_");
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: finding.title,
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.description },
        properties: {
          category: finding.category,
          defaultSeverity: finding.severity
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
      message: {
        text: finding.description,
        markdown
      },
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
        evidence: toArray(finding.evidence_json)
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
