import fs from "node:fs/promises";

function unwrapFollowupQueue(input) {
  if (input?.schema_name === "runtime_followup_queue.v1") return input.payload;
  if (input?.export_schema?.schema_name === "runtime_followup_queue.v1") return input.export_schema.payload;
  if (Array.isArray(input?.runtime_followups)) {
    return {
      runtime_followup_summary: input.runtime_followup_summary || {},
      runtime_followups: input.runtime_followups
    };
  }
  return input;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node examples/consume-runtime-followups.mjs <runtime-followups.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const queue = unwrapFollowupQueue(payload);
const summary = queue.runtime_followup_summary || {};

console.log(`Total follow-ups: ${summary.total_count ?? 0}`);
console.log(`Pending: ${summary.pending_count ?? 0}`);
console.log(`Launched: ${summary.launched_count ?? 0}`);
console.log(`Adoption ready: ${summary.adoption_ready_count ?? 0}`);
console.log(`Resolved: ${summary.resolved_count ?? 0}`);
console.log("");
console.log("Adoption-ready or resolved items:");
for (const item of (queue.runtime_followups || []).filter((entry) => entry.status === "resolved" || (entry.rerun_outcome && entry.rerun_outcome !== "pending" && entry.rerun_outcome !== "none"))) {
  console.log(`- ${item.id} ${item.finding_title || item.finding_id} outcome=${item.rerun_outcome || "none"} status=${item.status}`);
}
