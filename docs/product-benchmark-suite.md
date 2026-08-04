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

Execute extended cases too:

```bash
npm run scan -- benchmark run --execute --include-extended
```

Compare a current report with a baseline:

```bash
npm run scan -- benchmark compare --baseline benchmarks/baselines/ai-agent-static-v1.baseline.json --current .artifacts/benchmarks/<report>.json
```

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

The evaluator treats these as warnings or drift signals:

- expected controls are in scope but not assessed
- evidence providers are skipped or fail
- expected finding families are missing in non-strict mode
- public repo findings differ from a previous report

Use `--strict` when you want missing expected finding families to fail the benchmark. Default mode is less brittle because public repos, static tools, and model outputs can change.

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
