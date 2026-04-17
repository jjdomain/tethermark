# Tethermark — LLM Orchestration Clarification Addendum

Date: 2026-04-09
Applies to: `AI_Security_Audit_Harness_Requirements_Rewritten.md`

## Purpose of this addendum

This addendum removes ambiguity in the rewritten harness spec.

The rewritten spec correctly describes an **agentic audit harness** with planner and specialist subagents, but it does **not** make LLM-backed orchestration mandatory enough at implementation time. As a result, a code generator can reasonably interpret `planner-agent`, `skeptic-agent`, `validator-agent`, and related components as ordinary deterministic modules instead of actual model-backed agents.

This addendum makes the model-backed orchestration requirements explicit.

---

## 1. Non-ambiguous implementation requirement

The harness is **not** merely a set of named modules.

The harness **must** include a real **LLM-backed orchestration layer** in the core execution path.

At minimum:
- `planner-agent` MUST be implemented as an LLM-backed agent that emits a structured run plan
- `threat-model-agent` MUST be implemented as an LLM-backed agent that drafts the threat model from extracted signals
- `skeptic-agent` MUST be implemented as an LLM-backed reviewer that evaluates evidence strength, false-positive risk, and validation priority
- `remediation-agent` MUST be implemented as an LLM-backed summarizer for remediation memos

`validator-agent` may be LLM-supervised over deterministic validation tools, but Phase 2 onward it should also be model-backed for validation-path selection and reasoning.

These agents may call deterministic tools, but they are **not optional conceptual wrappers**.

---

## 2. Required architecture statement

Replace any vague wording implying that the system is only “agentic in architecture” with the following requirement:

> The harness MUST execute every audit run through a model-backed planner/orchestrator and at least one additional model-backed specialist subagent. The system is not considered compliant if all planning, selection, grading, and reasoning are implemented purely as deterministic code without live or test-doubled LLM agent invocations.

---

## 3. Mandatory agent participation by phase

### Phase 1 — required model-backed agents

Every Phase 1 end-to-end run MUST invoke all of the following:
- `planner-agent`
- `threat-model-agent`
- `skeptic-agent`

Every Phase 1 run SHOULD invoke:
- `remediation-agent`

Phase 1 may keep `validator-agent` as a hybrid component, but a deterministic-only implementation is not sufficient to satisfy the public thesis of the project.

### Phase 2 — required model-backed agents

Every Phase 2 run MUST invoke all of the following when applicable:
- `planner-agent`
- `threat-model-agent`
- `eval-selection-agent`
- `skeptic-agent`
- `validator-agent`
- `remediation-agent`

### Phase 3 — expanded model-backed behavior

Phase 3 adds:
- deeper handoff logic between subagents
- incremental scan planning
- patch suggestion and rationale generation
- reviewer-feedback-aware agent context

---

## 4. Required execution flow

The canonical run flow MUST be interpreted as executable LLM orchestration, not a documentation diagram.

Required flow:
1. deterministic extraction collects repo/target signals
2. `planner-agent` receives structured context and emits `run_plan.json`
3. `threat-model-agent` receives extracted signals and emits threat-model artifacts
4. `eval-selection-agent` receives the run plan plus target features and selects from an allowed set of eval packs/tools
5. deterministic tool adapters execute only the selected approved actions
6. `skeptic-agent` reviews normalized findings and emits grader outputs
7. `validator-agent` selects allowed validation actions for chosen findings
8. `remediation-agent` emits remediation memo or structured checklist
9. exporters emit findings, traces, evidence, and public-safety metadata

A build that skips steps 2, 3, 6, and 8 as real model calls is not compliant.

---

## 5. Required provider/runtime layer

The harness MUST include an explicit provider abstraction for model-backed agents.

Required package(s) or equivalent runtime layer:
- `llm-provider` or `model-runtime`
- `agent-runtime`
- `prompt-registry`
- `trace-recorder`
- `handoff-contracts`

The implementation MUST support:
- a production provider such as OpenAI or Anthropic
- structured JSON output enforcement
- retry/error handling for malformed outputs
- model call tracing
- test doubles or mock agents for CI

The spec should not allow the codebase to omit a model provider abstraction entirely.

---

## 6. Required data contracts to prove agentic execution

The harness MUST persist artifacts proving actual agent participation.

### 6.1 Agent invocation record

```json
{
  "agent_call_id": "call_123",
  "run_id": "run_123",
  "agent_name": "planner_agent",
  "model_provider": "openai",
  "model_name": "gpt-4.1",
  "input_artifacts": ["repo_inventory.json", "target_descriptor.json"],
  "output_artifact": "run_plan.json",
  "status": "success",
  "started_at": "2026-04-09T18:00:00Z",
  "completed_at": "2026-04-09T18:00:06Z"
}
```

### 6.2 Handoff record

```json
{
  "handoff_id": "handoff_001",
  "run_id": "run_123",
  "from_agent": "planner_agent",
  "to_agent": "threat_model_agent",
  "reason": "class4_deep_audit_selected",
  "artifacts": ["run_plan.json"]
}
```

### 6.3 Grader output

```json
{
  "grader_id": "grader_123",
  "run_id": "run_123",
  "agent_name": "skeptic_agent",
  "finding_id": "finding_12",
  "evidence_sufficiency": "medium",
  "false_positive_risk": "low",
  "validation_recommendation": "yes",
  "reasoning_summary": "Multiple artifact-backed signals align with the same tool-boundary issue."
}
```

A harness run is not considered agentic unless these records exist.

---

## 7. Acceptance criteria changes

Add the following acceptance criteria.

### 7.1 Phase 1 acceptance criteria

Phase 1 is successful only if:
- the run invokes real or mockable LLM-backed `planner-agent`, `threat-model-agent`, and `skeptic-agent`
- the run produces agent traces and invocation logs
- the planner agent chooses among allowed tool/eval options rather than deterministic code hardcoding all selections
- the skeptic agent emits grader outputs that affect confidence or validation recommendation
- the implementation visibly demonstrates model-centered harness engineering

### 7.2 Failure condition

A build is **not** acceptable as a showcase implementation if:
- named agent modules are implemented as plain deterministic classes/functions with no model runtime
- tool selection is fully hardcoded with no planner output artifact
- threat model generation is purely template/rule based
- grading/skeptic review is omitted or implemented without an agent call trace

---

## 8. Required repo/package structure additions

Add the following packages to the suggested repo structure:

```text
packages/
  llm-provider/
  agent-runtime/
  prompt-registry/
  trace-recorder/
  handoff-contracts/
```

Optional if split further:

```text
packages/
  planner-prompts/
  grader-prompts/
  remediation-prompts/
```

---

## 9. Recommended implementation wording for Codex

Use this wording in build instructions:

> Implement the harness as a real LLM-backed agentic system. Do not stub the planner/subagent architecture as ordinary deterministic modules. The `planner-agent`, `threat-model-agent`, and `skeptic-agent` must call a model runtime through a provider abstraction and must emit structured artifacts and traces. Tool execution remains bounded and deterministic, but planning, threat-model drafting, grading, and remediation summarization must be model-backed.

And:

> A submission that contains modules named `planner-agent` or `skeptic-agent` but does not perform actual model invocations does not satisfy the requirements.

---

## 10. Practical build recommendation

For implementation:
- keep the core orchestration in TypeScript
- add a real model provider abstraction immediately
- use structured outputs for run plans, threat models, and grader outputs
- allow CI to swap in mock agents
- keep deterministic tool execution bounded behind adapters

This preserves the security and reproducibility benefits of the harness while making the project visibly and unambiguously agentic.
