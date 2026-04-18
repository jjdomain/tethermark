import fs from "node:fs/promises";

function unwrapComparison(input) {
  if (input?.schema_name === "run_comparison.v1") return input.payload;
  if (input?.export_schema?.schema_name === "run_comparison.v1") return input.export_schema.payload;
  if (input?.report_compare) return input.report_compare;
  return input;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node examples/consume-run-comparison.mjs <run-comparison.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const comparison = unwrapComparison(payload);

console.log(`Current run: ${comparison.current_run_id}`);
console.log(`Compared to: ${comparison.compare_to_run_id}`);
console.log(`New findings: ${comparison.summary?.new_finding_count ?? 0}`);
console.log(`Resolved findings: ${comparison.summary?.resolved_finding_count ?? 0}`);
console.log(`Changed findings: ${comparison.summary?.changed_finding_count ?? 0}`);
console.log("");

if ((comparison.new_findings || []).length) {
  console.log("New Findings:");
  for (const item of comparison.new_findings) {
    console.log(`- ${item.title} [${item.current_severity}] runtime=${item.runtime_validation_status}`);
  }
  console.log("");
}

if ((comparison.resolved_findings || []).length) {
  console.log("Resolved Findings:");
  for (const item of comparison.resolved_findings) {
    console.log(`- ${item.title} [${item.previous_severity}]`);
  }
  console.log("");
}

if ((comparison.changed_findings || []).length) {
  console.log("Changed Findings:");
  for (const item of comparison.changed_findings) {
    const changeSummary = (item.changes || []).map((change) => `${change.field}:${change.previous}->${change.current}`).join(", ");
    console.log(`- ${item.title}: ${changeSummary}`);
  }
}
