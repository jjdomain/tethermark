import fs from "node:fs/promises";

function unwrapExecutiveSummary(input) {
  if (input?.schema_name === "executive_summary.v1") return input.payload;
  if (input?.export_schema?.schema_name === "executive_summary.v1") return input.export_schema.payload;
  if (input?.report_executive) return input.report_executive;
  return input;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node examples/transform-executive-summary-dashboard.mjs <executive-summary.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const summary = unwrapExecutiveSummary(payload);

const dashboardView = {
  run: {
    id: summary.run_id,
    status: summary.status,
    audit_package: summary.audit_package,
    run_mode: summary.run_mode,
    target_class: summary.target_class ?? null
  },
  scorecard: {
    overall_score: summary.overall_score ?? null,
    rating: summary.rating ?? null,
    publishability_status: summary.publishability_status ?? null,
    human_review_required: Boolean(summary.human_review_required)
  },
  metrics: {
    finding_count: summary.finding_count ?? 0,
    top_finding_count: Array.isArray(summary.top_findings) ? summary.top_findings.length : 0,
    runtime_validated_count: summary.runtime_validation?.validated_count ?? 0,
    runtime_blocked_count: summary.runtime_validation?.blocked_count ?? 0,
    runtime_followups_required: summary.runtime_followups?.required_count ?? 0,
    runtime_followups_resolved: summary.runtime_followups?.resolved_count ?? 0,
    active_disposition_count: summary.dispositions?.active_count ?? 0,
    outstanding_action_count: Array.isArray(summary.outstanding_actions) ? summary.outstanding_actions.length : 0
  },
  cards: [
    {
      key: "publishability",
      label: "Publishability",
      value: summary.publishability_status ?? "unknown"
    },
    {
      key: "runtime_validation",
      label: "Runtime Validation",
      value: `validated=${summary.runtime_validation?.validated_count ?? 0}, blocked=${summary.runtime_validation?.blocked_count ?? 0}`
    },
    {
      key: "followups",
      label: "Runtime Follow-ups",
      value: `required=${summary.runtime_followups?.required_count ?? 0}, resolved=${summary.runtime_followups?.resolved_count ?? 0}`
    }
  ],
  top_findings: (summary.top_findings || []).map((item) => ({
    finding_id: item.finding_id,
    title: item.title,
    severity: item.severity,
    runtime_validation_status: item.runtime_validation_status,
    next_action: item.next_action,
    disposition: item.disposition
  })),
  outstanding_actions: summary.outstanding_actions || []
};

console.log(JSON.stringify(dashboardView, null, 2));
