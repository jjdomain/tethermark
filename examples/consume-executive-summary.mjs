import fs from "node:fs/promises";

function unwrapExecutiveSummary(input) {
  if (input?.schema_name === "executive_summary.v1") return input.payload;
  if (input?.export_schema?.schema_name === "executive_summary.v1") return input.export_schema.payload;
  if (input?.report_executive) return input.report_executive;
  return input;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node examples/consume-executive-summary.mjs <executive-summary.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const summary = unwrapExecutiveSummary(payload);

console.log(`Run: ${summary.run_id}`);
console.log(`Status: ${summary.status}`);
console.log(`Package: ${summary.audit_package}`);
console.log(`Score: ${summary.overall_score ?? "n/a"} (${summary.rating ?? "unrated"})`);
console.log(`Publishability: ${summary.publishability_status ?? "unknown"}`);
console.log(`Human review required: ${summary.human_review_required ? "yes" : "no"}`);
console.log(`Findings: ${summary.finding_count}`);
console.log(`Runtime validation blocked: ${summary.runtime_validation?.blocked_count ?? 0}`);
console.log(`Runtime follow-ups required: ${summary.runtime_followups?.required_count ?? 0}`);
console.log("");
console.log("Top Findings:");
for (const item of summary.top_findings || []) {
  console.log(`- ${item.title} [${item.severity}] runtime=${item.runtime_validation_status} next=${item.next_action}`);
}
