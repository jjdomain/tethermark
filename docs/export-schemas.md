# Tethermark Export Schemas

Tethermark JSON-native export surfaces use a shared schema envelope for downstream tooling.

## Common Envelope

Every versioned JSON export includes:

- `schema_name`
- `schema_version`
- `generated_at`
- `tethermark_version`
- `payload`

Current schema version:

- `1.0.0`

## Export Schemas

### `executive_summary.v1`

Source:

- `GET /runs/:runId/report-executive?format=json`

Payload contains:

- run identity and score
- publishability and human-review status
- top findings
- runtime validation summary
- disposition summary
- runtime follow-up summary
- remediation summary/checklist
- outstanding actions

### `run_comparison.v1`

Source:

- `GET /runs/:runId/report-compare?compare_to=<runId>&format=json`

Payload contains:

- current and comparison run ids
- comparison summary counts
- `new_findings`
- `resolved_findings`
- `changed_findings`

### `finding_evaluations.v1`

Source:

- `GET /runs/:runId/finding-evaluations`

Payload contains:

- run-level evaluation aggregates
- duplicate/conflict groupings
- sandbox execution summary
- per-finding evaluation records
- normalized runtime evidence location references for finding drilldown and SARIF/export interoperability

### `runtime_followup_summary.v1`

Source:

- `GET /runtime-followups/summary`

Payload contains:

- follow-up queue totals by status/outcome

### `runtime_followup_queue.v1`

Source:

- `GET /runtime-followups/export?format=json`

Payload contains:

- runtime follow-up queue summary
- full runtime follow-up records

### `runtime_followup_report.v1`

Source:

- `GET /runtime-followups/:id/report`

Payload contains:

- follow-up record
- source run/finding/evaluation
- linked rerun summary/findings/evaluations
- source review actions for the finding

### `review_audit.v1`

Source:

- `GET /runs/:runId/review-audit`

Payload contains:

- review workflow
- review actions
- review comments
- derived review summary
- finding dispositions

### `export_index.v1`

Source:

- `GET /runs/:runId/exports`

Payload contains:

- run-scoped export catalog
- supported formats per export
- recommended filenames
- API routes for each export
- schema names for JSON-native exports

## Stable Enum Values

Downstream consumers should treat the following value sets as stable contract values.

### Severity

- `critical`
- `high`
- `medium`
- `low`
- `info`

### Publishability Status

- `publishable`
- `internal_only`
- `review_required`
- `blocked`

### Review Workflow Status

- `review_required`
- `in_review`
- `approved`
- `rejected`
- `requires_rerun`

### Review Disposition

- `open`
- `confirmed`
- `suppressed`
- `downgraded`
- `needs_validation`
- `waived`

### Disposition Status

- `active`
- `expired`
- `revoked`
- `none`

### Runtime Validation Status

- `validated`
- `blocked`
- `failed`
- `recommended`
- `not_applicable`

### Runtime Follow-up Policy

- `none`
- `not_applicable`
- `rerun_in_capable_env`
- `manual_runtime_review`
- `runtime_validation_recommended`

### Runtime Follow-up Resolution

- `none`
- `rerun_requested`
- `rerun_outcome_adopted`
- `manual_review_completed`
- `accepted_without_runtime_validation`

### Runtime Follow-up Outcome

- `none`
- `pending`
- `confirmed`
- `not_reproduced`
- `still_inconclusive`

## Compatibility Notes

- SARIF export remains SARIF-native and is not wrapped in the Tethermark envelope.
- Markdown exports remain text-first and are not wrapped in the Tethermark envelope.
- New schema versions should be additive where possible and should bump `schema_version` when compatibility changes.
