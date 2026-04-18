import fs from "node:fs/promises";

function unwrapComparison(input) {
  if (input?.schema_name === "run_comparison.v1") return input.payload;
  if (input?.export_schema?.schema_name === "run_comparison.v1") return input.export_schema.payload;
  if (input?.report_compare) return input.report_compare;
  return input;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node examples/transform-run-comparison-dashboard.mjs <run-comparison.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const comparison = unwrapComparison(payload);

const dashboardView = {
  runs: {
    current_run_id: comparison.current_run_id,
    compare_to_run_id: comparison.compare_to_run_id
  },
  summary: {
    new_finding_count: comparison.summary?.new_finding_count ?? 0,
    resolved_finding_count: comparison.summary?.resolved_finding_count ?? 0,
    changed_finding_count: comparison.summary?.changed_finding_count ?? 0,
    unchanged_finding_count: comparison.summary?.unchanged_finding_count ?? 0,
    score_delta: comparison.summary?.overall_score_delta ?? 0,
    runtime_validation_delta: comparison.summary?.runtime_validation_delta ?? {}
  },
  trend_rows: [
    ...(comparison.new_findings || []).map((item) => ({
      change_type: "new",
      finding_id: item.finding_id,
      title: item.title,
      severity: item.current_severity,
      runtime_validation_status: item.runtime_validation_status
    })),
    ...(comparison.resolved_findings || []).map((item) => ({
      change_type: "resolved",
      finding_id: item.finding_id,
      title: item.title,
      severity: item.previous_severity,
      runtime_validation_status: item.previous_runtime_validation_status ?? null
    })),
    ...(comparison.changed_findings || []).map((item) => ({
      change_type: "changed",
      finding_id: item.finding_id,
      title: item.title,
      changes: item.changes || [],
      current_severity: item.current_severity ?? null,
      previous_severity: item.previous_severity ?? null
    }))
  ]
};

console.log(JSON.stringify(dashboardView, null, 2));
