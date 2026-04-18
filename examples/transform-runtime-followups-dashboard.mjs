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
  console.error("Usage: node examples/transform-runtime-followups-dashboard.mjs <runtime-followups.json>");
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
const queue = unwrapFollowupQueue(payload);
const summary = queue.runtime_followup_summary || {};
const items = Array.isArray(queue.runtime_followups) ? queue.runtime_followups : [];

const dashboardView = {
  summary: {
    total_count: summary.total_count ?? items.length,
    pending_count: summary.pending_count ?? 0,
    launched_count: summary.launched_count ?? 0,
    adoption_ready_count: summary.adoption_ready_count ?? 0,
    resolved_count: summary.resolved_count ?? 0,
    confirmed_count: summary.confirmed_count ?? 0,
    not_reproduced_count: summary.not_reproduced_count ?? 0,
    inconclusive_count: summary.inconclusive_count ?? 0
  },
  rows: items.map((item) => ({
    id: item.id,
    source_run_id: item.source_run_id ?? null,
    linked_rerun_run_id: item.linked_rerun_run_id ?? null,
    finding_id: item.finding_id ?? null,
    finding_title: item.finding_title ?? null,
    status: item.status ?? "unknown",
    rerun_outcome: item.rerun_outcome ?? "none",
    adoption_state: item.adoption_state ?? "none",
    owner: item.owner ?? null,
    updated_at: item.updated_at ?? item.completed_at ?? item.created_at ?? null
  })),
  grouped_counts: {
    by_status: Object.fromEntries(
      [...new Set(items.map((item) => item.status ?? "unknown"))].map((status) => [
        status,
        items.filter((item) => (item.status ?? "unknown") === status).length
      ])
    ),
    by_outcome: Object.fromEntries(
      [...new Set(items.map((item) => item.rerun_outcome ?? "none"))].map((outcome) => [
        outcome,
        items.filter((item) => (item.rerun_outcome ?? "none") === outcome).length
      ])
    )
  }
};

console.log(JSON.stringify(dashboardView, null, 2));
