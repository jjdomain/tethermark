# Tethermark Export Examples

These examples show how to consume Tethermark's versioned export contracts outside the web UI.

## Included Examples

- `consume-executive-summary.mjs`
  Reads `executive_summary.v1` JSON and prints a compact stakeholder summary.
- `consume-run-comparison.mjs`
  Reads `run_comparison.v1` JSON and prints new/resolved/changed findings.
- `consume-runtime-followups.mjs`
  Reads `runtime_followup_queue.v1` JSON and prints queue totals plus adoption-ready items.
- `transform-executive-summary-dashboard.mjs`
  Converts `executive_summary.v1` JSON into a flat dashboard card and metrics payload.
- `transform-run-comparison-dashboard.mjs`
  Converts `run_comparison.v1` JSON into trend-friendly summary counts and rows.
- `transform-runtime-followups-dashboard.mjs`
  Converts `runtime_followup_queue.v1` JSON into ops-table rows plus grouped counts.
- `upload-sarif-to-github.mjs`
  Uploads a Tethermark SARIF report to GitHub code scanning using the REST API.

## Usage

```bash
node examples/consume-executive-summary.mjs ./run-executive-summary.json
node examples/consume-run-comparison.mjs ./run-comparison.json
node examples/consume-runtime-followups.mjs ./runtime-followups.json
node examples/transform-executive-summary-dashboard.mjs ./run-executive-summary.json
node examples/transform-run-comparison-dashboard.mjs ./run-comparison.json
node examples/transform-runtime-followups-dashboard.mjs ./runtime-followups.json
GITHUB_TOKEN=... node examples/upload-sarif-to-github.mjs ./run-report.sarif.json jjdomain/tethermark <commit_sha> refs/heads/main
```

The JSON examples accept the full API response body or the `export_schema` envelope object directly.

## Dashboard Transform Shapes

### `transform-executive-summary-dashboard.mjs`

Outputs:

- `run`: run identity and scope labels
- `scorecard`: score, rating, and publishability fields
- `metrics`: flat numeric counters for findings, runtime validation, follow-ups, and dispositions
- `cards`: dashboard-card friendly label/value records
- `top_findings`: compact finding rows
- `outstanding_actions`: passthrough action list

### `transform-run-comparison-dashboard.mjs`

Outputs:

- `runs`: current and comparison run ids
- `summary`: flat new/resolved/changed counts plus score and runtime-validation deltas
- `trend_rows`: normalized rows with `change_type` of `new`, `resolved`, or `changed`

### `transform-runtime-followups-dashboard.mjs`

Outputs:

- `summary`: queue totals by state/outcome
- `rows`: flat follow-up table rows for ops dashboards
- `grouped_counts`: simple `by_status` and `by_outcome` maps for charts or filters
