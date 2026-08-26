# Tethermark Product Benchmark Suite

The product benchmark suite validates Tethermark itself against representative public AI-agent and LLM-application repositories. It is separate from normal user target history.

Normal users do not need to run this suite before auditing their own repository. User repos get baseline comparison from their own previous audit runs. Product benchmarks answer a different question: "Did a Tethermark code, prompt, provider, or policy change make the audit engine worse?"

## Benchmark Layers

Tethermark uses three validation layers:

- **Fixture validation**: tiny repo-owned targets under `fixtures/validation-targets` for deterministic local smoke checks.
- **Product benchmark suite**: pinned public repositories that represent real AI-agent, MCP, workflow, supply-chain, and LLM-app surfaces.
- **Target history comparison**: normal user repo comparisons across that user's own previous runs and commits.

## Initial Suite

The initial suite lives at:

```text
benchmarks/suites/ai-agent-static-v1.json
```

The deterministic regression suite lives at:

```text
benchmarks/suites/community-fixture-calibration-v1.json
```

It uses repo-owned fixtures for good, mixed, and risky posture across ordinary,
runnable, agentic, and MCP target families. These fixtures are internal
regression tests: they verify deterministic behavior and integrity metrics but
are not independent evidence that Tethermark detects real-world vulnerabilities.
Their versioned seed expectations remain `pending_human_review` and are not
eligible to establish externally validated false-positive or false-negative
claims.

The external-ground-truth calibration suite lives at:

```text
benchmarks/suites/external-reviewed-agentic-v1.json
```

It pins vulnerable and direct fixed commits for four maintainer-reviewed
advisories:

- `GHSA-3q26-f695-pp76` / `CVE-2025-53107` in
  `cyanheads/git-mcp-server`: command injection through `child_process.exec`,
  fixed with argument-safe `execFile` calls.
- `GHSA-vjqx-cfc4-9h6v` / `CVE-2026-27735` in
  `modelcontextprotocol/servers`: `git_add` path traversal through
  `repo.index.add(files)`, fixed with repository-boundary-enforcing
  `repo.git.add("--", *files)`.
- `GHSA-rhm9-gp5p-5248` / `CVE-2024-51751` in
  `gradio-app/gradio`: arbitrary file read when omitted FileData metadata
  bypasses path validation, fixed by requiring explicit trusted-file metadata
  during model validation.
- `GHSA-rvqx-wpfh-mfx7` / `CVE-2025-3248` in
  `langflow-ai/langflow`: unauthenticated code injection through the sensitive
  `/api/v1/validate/code` operation, fixed by requiring `CurrentActiveUser`.

Each case measures only the advisory's known finding. It does not label
unrelated findings or claim that any repository snapshot is otherwise
vulnerability-free.

Default cases:

- `pi-agent-static`: lightweight public smoke benchmark.
- `mini-swe-agent-static`: coding-agent tool/file/command boundary benchmark.
- `aider-static`: CLI coding assistant with repo-editing and git workflow surface.
- `mcp-servers-static`: MCP/tool-server boundary benchmark.

Extended cases:

- `crewai-static`: multi-agent orchestration framework.
- `langgraph-static`: graph/stateful agent workflow framework.
- `flowise-static`: LLM workflow platform with server/frontend/connector surface.

Runtime-pending case:

- `agentdojo-runtime-pending`: runtime prompt-injection/tool-use benchmark anchor for Local Runtime Sandbox and hosted sandbox adapters.

## How Benchmark Runs Associate With Audit Runs

Each executed benchmark case launches a normal Tethermark audit run with extra benchmark metadata in `AuditRequest.hints.benchmark`:

```json
{
  "benchmark": {
    "suite_id": "ai-agent-static-v1",
    "suite_version": "2026.06",
    "case_id": "mini-swe-agent-static",
    "target_id": "mini-swe-agent",
    "categories": ["agent_tool_boundary", "ci_workflow", "supply_chain"],
    "expected_controls": ["owasp_agentic.tool_misuse_boundary"],
    "expected_finding_families": ["workflow_permissions"]
  },
  "repo_checkout_ref": "2afd0fb81bacbf0aacfac9ded6f093c5acd0bf7c"
}
```

The benchmark runner evaluates the returned audit result and writes a benchmark report that links each case to its `run_id`. The audit run remains a normal run, so failures can be debugged through run detail, evidence, agent traces, supervisor review, policy application, and post-supervisor integrity artifacts.

## CLI

List default benchmark cases:

```bash
npm run scan -- benchmark list
```

List all static cases:

```bash
npm run scan -- benchmark list --include-extended
```

Dry-run the selected suite and write a report without cloning public repos:

```bash
npm run scan -- benchmark run
```

Execute the default public benchmark cases:

```bash
npm run scan -- benchmark run --execute
```

Execute one case:

```bash
npm run scan -- benchmark run --case mini-swe-agent-static --execute
```

Execute the deterministic calibration suite without local scanner binaries or
live model usage:

```bash
HARNESS_DISABLE_LOCAL_BINARIES=1 npm run scan -- benchmark run --suite community-fixture-calibration-v1 --execute
```

Execute the GitHub-reviewed vulnerable/fixed calibration pairs:

```bash
HARNESS_DISABLE_LOCAL_BINARIES=1 npm run scan -- benchmark run --suite external-reviewed-agentic-v1 --execute --strict
```

For a bounded interactive live-model pilot, first confirm `codex login status`
reports a ChatGPT login. Then run the same reviewed case with each model. This
uses the ChatGPT subscription session, not an API key:

```powershell
$env:HARNESS_DISABLE_LOCAL_BINARIES = "1"
$env:HARNESS_DISABLE_PYTHON_WORKERS = "1"
npm run scan -- benchmark run --suite external-reviewed-agentic-v1 --case gradio-file-payload-read-vulnerable --execute --strict --output .artifacts/benchmarks/model-variance/sol --llm-provider openai_codex --llm-model gpt-5.6-sol --llm-workload interactive_operator --llm-credential-class chatgpt_session --llm-max-requests 18 --llm-max-tokens 400000 --audit-max-agent-calls 18 --audit-max-tokens 280000 --audit-max-reruns 1
npm run scan -- benchmark run --suite external-reviewed-agentic-v1 --case gradio-file-payload-read-vulnerable --execute --strict --output .artifacts/benchmarks/model-variance/terra --llm-provider openai_codex --llm-model gpt-5.6-terra --llm-workload interactive_operator --llm-credential-class chatgpt_session --llm-max-requests 18 --llm-max-tokens 400000 --audit-max-agent-calls 18 --audit-max-tokens 280000 --audit-max-reruns 1
```

Live benchmarks can consume substantial subscription capacity. Start with one
reviewed case and expand only after inspecting the result. The provider and
audit-package ceilings are separate, explicit, and recorded in each report.

Executed reports include bounded, redacted finding summaries under schema
`2026-08-19.benchmark-finding-summary.v1`. Each summary retains the finding
title/category/severity, a truncated description, up to 12 evidence references,
control mappings, and post-supervisor integrity diagnostics.

Executed reports also include control and dimension score summaries under schema
`2026-08-19.benchmark-scoring-summary.v1`. Control summaries retain applicability,
assessability, final status, maximum/awarded/unawarded score, bounded rationale and
evidence, finding ids, and evidence sources. Dimension summaries retain raw score,
percentage, configured weight, weighted contribution, applicable/assessed control
counts, control ids, and frameworks. Together these fields make the final static
score reviewable without preserving the temporary audit database.

Configured secrets, credential-shaped values, private keys, and local
home/workspace paths are redacted from both summary types; raw prompts and raw
model responses are not copied into benchmark reports.

Benchmark execution uses fixed evidence-plan policy
`2026-08-19.calibration-evidence-plan.v1` for static calibration. Every applicable
control receives the same ordered provider set: `repo_analysis`, `scorecard`,
`semgrep`, and `trivy`. This selection bypasses model choice and cannot be narrowed
by a supervisor correction request. Unavailable providers still produce explicit
skipped or failed attempts, including eligible Scorecard API fallback. Reports
retain the policy version, planned providers, control-to-provider mappings, and
attempted providers under schema
`2026-08-19.benchmark-evidence-plan-summary.v1`; a missing planned-provider attempt
fails the benchmark case.

Control statuses and awarded scores produced by the deterministic standards
engine are also a calibration safety floor. Supervisor `downgrade_controls`
actions remain advisory unless a deterministic control-quality validator
explicitly approves the affected control IDs. This prevents model-only review
variance from converting evidenced control results to `not_assessed` after the
standards evaluation has completed.

Selective correction is lane-scoped. Although the deterministic standards
engine may recompute global controls and findings while servicing a lane rerun,
the correction merger accepts only control and finding IDs owned by the selected
lane. Re-emitted artifacts from reused lanes are ignored so correction cannot
duplicate findings or replace off-lane control results.

Static scanner advisory titles describe the advisory's potential impact; they
do not by themselves claim that the benchmark executed or reproduced that
impact. Integrity checks continue to block affirmative runtime, execution, or
reproduction claims when a static-only run has no runtime evidence, while
recognizing explicit negations such as "no runtime execution was performed."

Benchmark execution disables stage reuse so every case is evaluated by the
current engine and configuration rather than cached planner or evidence-selection
artifacts.

Execute extended cases too:

```bash
npm run scan -- benchmark run --execute --include-extended
```

Compare a current report with a baseline:

```bash
npm run scan -- benchmark compare --baseline benchmarks/baselines/ai-agent-static-v1.baseline.json --current .artifacts/benchmarks/<report>.json
```

Measure repeat or cross-model variance across two or more reports:

```bash
npm run scan -- benchmark variance --report <first-report.json> --report <second-report.json>
```

Ordinary comparison requires identical model identity. Variance analysis allows
the model name to differ but still requires the same suite, case/commit,
thresholds, audit inputs, prompt/catalog/policy versions, tool capabilities,
workload, credentials, and recorded budgets. A passing variance result does not
make all unrelated findings ground truth; external advisory labels remain
limited to the reviewed known finding. Identical model identities are classified
as repeat runs and use `maximum_repeat_score_spread`; different identities use
`maximum_score_drift`. Finding-count and category differences are always printed
as drift for review, but do not become a blocking threshold unless the suite
explicitly defines one in a future schema.
Planned evidence-provider policy and mappings must match exactly. Differences in
attempted providers are reported as reviewable execution drift.

Final reconciliation treats deterministic heuristic findings as a safety floor.
A model supervisor may add review reasoning and request a drop, but deletion is
allowed only when the deterministic integrity record independently marks the
finding unsupported, incorrectly mapped, or integrity-blocking. Selective lane
reruns replace findings owned by that lane rather than merging newly generated
finding IDs with stale lane findings. Control `finding_ids` are rebuilt from the
final finding set so removed findings cannot remain as stale references.

Convenience scripts:

```bash
npm run benchmark:product
npm run benchmark:product:execute
```

## Pass/Fail Semantics

The benchmark evaluator treats these as hard failures:

- target class is outside the expected classes
- pinned commit provenance is missing or wrong
- expected controls are not in scope
- any finding has no evidence
- any finding maps to an unknown control
- static runs claim runtime/exploit proof without runtime evidence
- post-supervisor integrity verdict is `fail`
- citation coverage, control traceability, duplicate groups, conflicts, false
  negatives, or false positives exceed the suite's versioned acceptance
  thresholds (FP/FN gates activate for human-reviewed labels or supported
  external advisory ground truth)

The evaluator treats these as warnings or drift signals:

- expected controls are in scope but not assessed
- evidence providers are skipped or fail
- expected finding families are missing in non-strict mode
- public repo findings differ from a previous report

Use `--strict` when you want missing expected finding families to fail the benchmark. Default mode is less brittle because public repos, static tools, and model outputs can change.

Every executed case records methodology, static-baseline, control-catalog,
policy, audit-package-catalog, and prompt-set versions, plus tool versions,
model identity, workload, credential class, and provider/audit budget ceilings.
Report comparison is blocked when either report is a dry run,
labels lack eligible human review or external ground truth, or the suite version,
thresholds, run mode, package, pinned commit, version manifest, tool capabilities,
or model identity differ. External-ground-truth comparisons also require the
same source advisory and target state. Comparable reports still fail when a
passing case regresses, score drift exceeds the threshold, or repeat-run score
spread is too large.

## Baselines

A benchmark report can become a baseline after human review. Baselines should not be refreshed automatically. Refresh only when:

- the public target commit is intentionally updated
- a Tethermark detection change is intentional and reviewed
- expected controls or finding-family expectations are updated
- model/provider behavior is intentionally rebaselined

Store reviewed baselines under:

```text
benchmarks/baselines/
```

## Admin UI

The current implementation provides the CLI and JSON reports. Admin UI integration should show:

- suite and case selection
- linked run ID
- pass/fail/warning/drift counts
- control coverage matrix
- finding-family matrix
- post-supervisor integrity verdict
- report comparison against a selected baseline

The UI should continue to label this as a product benchmark or diagnostic action, not as a required step for user repo audits.
