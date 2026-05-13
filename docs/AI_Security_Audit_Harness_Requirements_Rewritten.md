# Tethermark — Rewritten Requirements and Roadmap

Version: 4/8/2026 rewrite  
Based on prior spec: `AI_Security_Audit_Engine_Requirements_v1_v2_v3.md`

---

## 1. Purpose

This document defines a **single complete agentic audit harness architecture** for AI/agent security review.

It replaces the earlier framing of separate v1/v2/v3 conceptual products with:
- **one showcase-ready architecture** from day one
- **phased implementation milestones** that increase coverage and polish
- a clear public thesis centered on **harness engineering**, not just scanner orchestration

The harness is intended to power:
- recurring OSS case-file audits
- local and CI security review of AI/agent repos
- MCP/API/CLI/worker-based audit workflows
- future commercial developer tooling
- portfolio demonstration of agent-security systems design and harness engineering

This harness is **not** the same thing as:
- downstream publishing, research, or leaderboard shells
- **AI Assurance Control Plane**, which is the downstream assurance/evidence/review workflow layer

---

## 2. Positioning

The project should be positioned as:

**an open, headless, agentic AI security audit harness for repositories, local AI/agent systems, MCP/tool boundaries, and isolated target-specific security evaluations**

More specifically:
- it is a **policy-bounded agentic harness**, not an unconstrained autonomous auditor
- it combines **planner/subagent orchestration**, deterministic scanners, custom eval packs, graders, validation, and evidence bundles
- it is designed for **reproducibility, inspectability, and downstream reuse**

It should **not** be positioned as:
- a generic “AI security agent”
- a clone of Codex Security
- a vulnerability oracle
- a package trust registry
- a GRC/control-plane product
- a production endpoint pentest platform

### 2.1 Why this exists even after Codex Security

Codex Security covers important repo-security workflows such as threat modeling, scanning, sandbox validation, ranked findings, and GitHub-centered patch workflows.

This project remains justified because it focuses on areas that are still under-served or differently served:
- open/self-hosted/headless execution
- multi-tool orchestration across deterministic scanners and agent-specific eval tools
- local-path and repository targets beyond connected GitHub repos
- isolated runtime validation for AI/agent behavior
- agent/tool/MCP boundary mapping
- custom eval packs and methodology
- reusable outputs for downstream publishing systems and AI Assurance Control Plane
- portable CLI/API/MCP/GitHub Action surfaces
- editorial and assurance downstream integration
- explicit **harness engineering** as part of the product thesis

---

## 3. Core thesis

The strategic thesis is:

**not “we built another repo security agent”**

but:

**“we built an open, multi-tool, agentic AI security audit harness with threat-model-driven review, planner/subagent orchestration, graders, reusable outputs, and downstream editorial/assurance integration.”**

This wording matters for both product clarity and hiring/portfolio value.

---

## 4. Product boundary

### 4.1 What the harness owns

The harness owns:
- target intake and classification
- repo/local target inspection
- architecture and threat-model extraction
- planner/subagent orchestration
- bounded tool orchestration
- custom eval orchestration
- finding normalization and deduplication
- evidence bundle generation
- grader/skeptic review
- optional validation/reproduction
- optional remediation memo or patch suggestion
- export surfaces (CLI/API/MCP/GitHub Action)
- run traces and decision logs
- public-safe filtering metadata

### 4.2 What the harness does not own

The harness does **not** own:
- newsletter generation
- public leaderboard UI
- historical case-file publishing
- beehiiv/site publishing
- general GRC workflow
- assurance review routing
- incident lifecycle management
- recertification workflows

Those belong elsewhere.

---

## 5. Relationship to adjacent products

### 5.1 Downstream publishing shell

A downstream publishing or research shell should consume this harness as:
- library
- CLI
- internal API
- worker job
- GitHub Action result

The downstream publishing shell owns:
- scheduling
- editorial review
- publication
- freshness display
- disclosure-aware public presentation
- cross-project archive/leaderboard

### 5.2 AI Assurance Control Plane

The assurance control plane should ingest selected findings/evidence from this harness as:
- imported findings
- evidence references
- control-family tags
- reviewer-routing metadata

The assurance control plane should not re-implement scanning/orchestration.

---

## 6. High-level design principles

1. **Threat-model first, not scanner-first**
2. **Evidence-first, not score-first**
3. **Agent-specific, not generic AppSec only**
4. **Harness-first, not prompt-only**
5. **Composable, not monolithic**
6. **Headless-first**
7. **Reusable outputs**
8. **Conservative claims**
9. **Human review remains required**
10. **Agentic, but bounded by policy and traceability**

---

## 7. Harness engineering stance

The project should explicitly embrace **harness engineering**.

That means the core value is not only the LLM prompts or the scanner list. The value is the design of the full operating environment around the model and tools:
- planner agent
- specialist subagents
- tool wrappers
- grading logic
- traces
- guardrails
- sandboxing
- evidence capture
- rerun policy
- public-safe filtering

The harness should be visibly model-centered from the first public release.

### 7.1 Three harness layers

#### A. Target Harness
How the target system is wrapped for analysis/testing:
- repo snapshot
- local runtime sandbox
- isolated container or microVM runtime wrapper
- reduced-confidence endpoint context wrapper
- MCP/plugin wrapper
- capability map
- environment/profile setup

#### B. Eval Harness
How security tasks are executed and judged:
- attack tasks/scenarios
- prompt sets
- graders
- pass/fail checks
- transcript and artifact capture
- trial aggregation

#### C. Audit Harness
How the audit system itself operates:
- planner orchestration
- specialist subagents
- tool adapters
- validator/skeptic loop
- run graph
- scoring
- export

---

## 8. Target users

### Primary users
- AI security researchers
- security engineers auditing AI/agent repos
- OSS maintainers who want structured AI/agent security review
- practitioners building internal security pipelines around AI systems
- employers evaluating agent-security systems thinking

### Secondary users
- downstream editorial workflows
- AI assurance/governance operators importing findings downstream
- internal developer platform/security teams

---

## 9. Core use cases

1. Audit an open-source AI repo before writing a case file.
2. Run a repo audit in CI against an MCP/tool-using app.
3. Inspect a public hosted demo/API when repo access is limited.
4. Generate an editable threat model from a repo.
5. Run custom eval packs for tool misuse, prompt injection, and unsafe escalation.
6. Produce normalized findings that can feed downstream publishing systems and/or the assurance control plane.
7. Expose audit capability via MCP/tool/skill/API for other agentic systems.
8. Demonstrate a real agentic security harness in a portfolio/job-search context.

---

## 10. Non-goals

The harness should not try to be:
- a universal AppSec replacement
- a broad package trust registry
- a full runtime defense platform
- an observability platform
- a managed SaaS-first company product at launch
- a local model inference stack
- a fully autonomous patching platform
- an auto-disclosing vulnerability bot

---

## 11. Single complete architecture

There is **one complete architecture**, not three separate conceptual versions.

The public story should be:
- the harness is already agentic
- the harness already uses orchestration and specialist subagents
- later phases expand breadth/depth, not the architectural identity

### 11.1 Architectural components

#### Intake and analysis
- `ingest-service`
- `classifier`
- `repo-analyzer`
- `agent-surface-mapper`
- `framework-detector`
- `policy-pack-resolver`

#### Agentic control layer
- `planner-agent`
- `threat-model-agent`
- `eval-selection-agent`
- `skeptic-agent`
- `validator-agent`
- `remediation-agent`
- `run-graph-orchestrator`

#### Tool and execution layer
- `tool-orchestrator`
- `tool-adapters`
- `eval-runner`
- `validation-runner`
- `sandbox-manager`
- `artifact-store`

#### Interpretation and export layer
- `finding-normalizer`
- `scoring-engine`
- `grader-engine`
- `public-safety-filter`
- `exporters`
- `mcp-server`
- `api-server`
- `cli`

### 11.2 Core idea

The planner agent and subagents are first-class parts of the system from day one, but they are **bounded**:
- they can only call approved tools/adapters
- they can only branch within allowed policy packs
- they must emit structured outputs
- they must produce traces
- they cannot auto-publish or auto-disclose sensitive findings

---

## 12. Canonical run flow

1. **Target intake**
2. **Classification**
3. **Deterministic extraction**
4. **Planner agent emits run plan**
5. **Threat-model agent drafts threat model**
6. **Eval-selection agent chooses tool/eval packs**
7. **Execution through bounded tool adapters**
8. **Normalization and dedupe**
9. **Skeptic/grader review**
10. **Selective validation**
11. **Scoring and confidence calculation**
12. **Public-safe filtering metadata**
13. **Remediation synthesis**
14. **Export**

This keeps the system visibly agentic while still being reproducible.

---

## 13. Target classes

Every target should be classified before deeper scanning.

### Class 1 — Repo posture only
Use when:
- repo is primarily a library/framework
- difficult to run
- no practical runtime/demo path

Typical outputs:
- architecture summary
- repo hygiene signals
- static security posture findings
- limited threat model
- remediation memo

### Class 2 — Runnable local app
Use when:
- repo can be built or launched in sandbox
- endpoints/UI available locally

Typical outputs:
- Class 1 outputs
- runtime eval results
- validation evidence
- deeper threat model with execution paths

### Class 3 — Hosted endpoint / black-box
Use when:
- explicitly authorized non-production demo/API exists
- repo unavailable or incomplete
- production endpoint testing is out of scope

Typical outputs:
- reduced-confidence runtime/behavioral findings
- endpoint-specific threat notes
- reduced architecture confidence
- limited static posture assumptions

### Class 4 — Tool-using / multi-turn agent
Use when:
- tools, memory, multi-step state, MCP, or delegated actions exist

Typical outputs:
- capability map
- tool/data/auth boundary analysis
- multi-turn evaluation results
- agent-specific control findings

### Class 5 — MCP server / plugin / skill package
Use when:
- artifact is an MCP server, plugin, or reusable skill/tool

Typical outputs:
- permission surface map
- action/data boundary analysis
- install/usage risk notes
- focused threat model and recommended hardening checks

---

## 14. Agent roles

### 14.1 Planner Agent
Responsibilities:
- inspect extracted repo/target signals
- select run profile
- decide which tool packs to invoke from an allowlist
- decide when to request deeper evaluation or validation
- output structured run-plan JSON

Must not:
- call arbitrary shell/network actions directly
- bypass policy packs
- change scoring methodology

### 14.2 Threat-Model Agent
Responsibilities:
- turn extracted signals into threat-model draft
- derive assets, trust boundaries, attack surfaces, risky components, assumptions, reviewer questions
- output editable JSON + Markdown artifact

### 14.3 Eval-Selection Agent
Responsibilities:
- choose custom eval packs and runtime scenarios
- choose target-specific hardening expectations
- explain selection rationale

### 14.4 Skeptic Agent
Responsibilities:
- review normalized findings
- look for weak evidence or false positives
- produce confidence rationale
- recommend validation candidates

### 14.5 Validator Agent
Responsibilities:
- inspect selected findings
- choose allowed validation pathway
- supervise bounded sandbox reproduction attempts
- attach validation traces and artifact references

### 14.6 Remediation Agent
Responsibilities:
- summarize likely root cause
- generate remediation memo/checklist
- optionally propose patch/diff where enabled
- always include human-review note

---

## 15. Tool strategy

### 15.1 Philosophy

Use multiple tools as complementary layers.
Do **not** average raw outputs.
Do **not** force every target through every tool.
Do **not** let the agent invent unsupported tool usage.

### 15.2 Deterministic posture/security tools
- OpenSSF Scorecard
- Trivy
- Semgrep

### 15.3 AI/agent-specific tools
- promptfoo
- garak
- PyRIT
- Inspect

### 15.4 Optional specialist helpers
- stack-specific review helpers
- repo parsers / tree-sitter-based analyzers
- custom MCP manifests/rule parsers
- custom policy evaluators

### 15.5 Custom eval packs

Custom packs are first-class and should be treated as a core moat.

#### Required launch packs
- Core pack
  - prompt injection
  - transcript leakage
  - policy bypass
  - unsafe escalation
  - unauthorized action/tool misuse
- MCP/tool pack
  - overbroad permissions
  - hidden side effects
  - unsafe fallback when tools fail
- Voice agent pack
  - identity confusion
  - unsafe caller escalation
  - transcript/privacy leaks

#### Later packs
- coding-agent pack
- browser/computer-use pack
- RAG pack
- support/helpdesk pack

---

## 16. Data contracts

### 16.1 Target descriptor

```json
{
  "target_id": "uuid",
  "target_type": "repo",
  "repo_url": "https://github.com/example/project",
  "local_path": null,
  "endpoint_url": null,
  "snapshot": {
    "type": "commit",
    "value": "abc123",
    "captured_at": "2026-03-28T20:00:00Z"
  },
  "hints": {
    "target_class": "tool_using_multi_turn_agent",
    "framework": null,
    "entrypoints": []
  }
}
```

### 16.2 Run plan artifact

```json
{
  "run_id": "run_123",
  "target_id": "uuid",
  "planner_version": "planner_v1",
  "selected_profile": "class4_deep_audit",
  "baseline_tools": ["scorecard", "trivy", "semgrep"],
  "runtime_tools": ["promptfoo", "inspect"],
  "custom_eval_packs": ["core", "mcp_tool"],
  "validation_candidates": ["finding_12", "finding_19"],
  "skip": ["pyrit"],
  "constraints": {
    "max_runtime_minutes": 30,
    "network_mode": "bounded",
    "sandbox_required": true
  },
  "rationale": [
    "Detected Class 4 tool-using agent",
    "MCP manifests present",
    "Runnable local app available"
  ]
}
```

### 16.3 Threat-model artifact

```json
{
  "target_id": "uuid",
  "version": "tm_v1",
  "summary": {
    "system_type": "coding_agent",
    "stack_guess": ["Next.js", "Supabase", "OpenAI", "MCP"],
    "confidence": 0.76
  },
  "assets": [
    "credentials",
    "source code",
    "chat transcripts",
    "tool outputs"
  ],
  "entry_points": [
    "chat input",
    "MCP tool invocation",
    "admin API"
  ],
  "trust_boundaries": [
    "user -> model",
    "model -> tool",
    "app -> third-party MCP server"
  ],
  "high_risk_components": [
    "tool runner",
    "memory store",
    "file write path"
  ],
  "assumptions": [
    "tool permissions are app-enforced",
    "tenant context is attached to each tool call"
  ],
  "questions_for_reviewer": [
    "Can the model trigger filesystem writes outside a sandbox?",
    "Is MCP server access scoped per user/session?"
  ]
}
```

### 16.4 Canonical finding schema

```json
{
  "finding_id": "uuid",
  "run_id": "run_123",
  "finding_key": "tool-boundary-001",
  "target_ref": {
    "type": "commit",
    "value": "abc123"
  },
  "source_tool": "custom_eval_pack",
  "source_stage": "runtime_eval",
  "title": "Prompt injection led to unauthorized tool attempt",
  "description": "The target followed an injected instruction and attempted a tool action outside the expected policy boundary.",
  "category": "tool_misuse",
  "severity": "high",
  "confidence": 0.84,
  "validation_status": "validated",
  "reproducible": true,
  "evidence_type": "multi_turn_runtime",
  "control_family": "tool_permissions",
  "framework_tags": [
    "owasp_agentic:A03",
    "mitre_atlas:execution",
    "nist_airmf:measure"
  ],
  "public_safe": true,
  "status": "new",
  "artifacts": [
    "s3://bucket/path/transcript.json",
    "s3://bucket/path/log.txt"
  ],
  "remediation_summary": "Introduce server-side allowlists and user-scoped policy checks before tool execution."
}
```

### 16.5 Agent trace contract

```json
{
  "trace_id": "trace_123",
  "run_id": "run_123",
  "steps": [
    {
      "step": 1,
      "actor": "planner_agent",
      "action": "emit_run_plan",
      "inputs": ["repo_inventory", "target_class", "framework_markers"],
      "outputs": ["run_plan.json"],
      "artifacts": [],
      "decision_summary": "Selected Class 4 deep audit profile"
    },
    {
      "step": 2,
      "actor": "tool_orchestrator",
      "action": "invoke_promptfoo",
      "inputs": ["run_plan.json"],
      "outputs": ["promptfoo_results.json"],
      "artifacts": ["s3://bucket/promptfoo_results.json"],
      "decision_summary": "Runtime eval enabled"
    }
  ]
}
```

### 16.6 Score bundle

```json
{
  "run_id": "run_123",
  "score_dimensions": {
    "repo_posture_score": 72,
    "runtime_ai_security_score": 61,
    "agent_control_score": 48,
    "observability_score": 44,
    "evidence_readiness_score": 57
  },
  "confidence_score": 0.79,
  "freshness_score": 0.95,
  "base_score": 56,
  "effective_score": 42
}
```

---

## 17. Scoring and grading logic

### 17.1 Score dimensions
- `repo_posture_score`
- `runtime_ai_security_score`
- `agent_control_score`
- `observability_score`
- `evidence_readiness_score`

### 17.2 Confidence logic
Confidence should depend on:
- tool agreement
- validation status
- richness of evidence
- target-class certainty
- skeptic/grader rationale
- reviewer overrides where applicable

### 17.3 Freshness logic
Freshness should depend on:
- snapshot recency
- repo churn since deep scan
- whether runtime artifacts are current
- whether config/dependency changes materially affect prior findings

### 17.4 Public score caution
Scores should be explanatory, not absolute truth.
Always expose dimension breakdowns and confidence context.

### 17.5 Grader outputs
Each major run should emit grader outputs such as:
- evidence sufficiency
- likely false-positive risk
- validation recommendation
- severity confidence rationale
- publication safety note

---

## 18. Detailed subsystem logic

### 18.1 Classification logic
Inputs:
- repo metadata
- file inventory
- dependency hints
- endpoint hints
- user-provided classification hints

Decision rules:
Endpoint-only classification is allowed only for explicitly authorized non-production targets and should produce reduced-confidence results.
- If no runnable app and mostly library/framework markers → Class 1
- If docker-compose/package scripts/server entry points present → Class 2
- If only endpoint provided → Class 3
- If tools/MCP/memory/multi-turn workflows detected → Class 4
- If MCP/package/skill manifest dominates → Class 5

Allow reviewer override.

### 18.2 Framework detection logic
Detect using:
- package manifests
- imports
- config files
- lockfiles
- docs/README patterns

Examples to detect:
- Next.js / React
- FastAPI / Flask / Django
- LangChain / LangGraph
- OpenAI SDK / Agents SDK
- MCP SDKs and manifests
- Supabase
- vector DB packages
- speech/voice frameworks
- browser automation frameworks

### 18.3 Threat-model generation logic
Threat model should be built from:
- file inventory
- framework detection
- entrypoint detection
- tool capability detection
- auth and tenant-context signals
- storage/memory signals
- external service integrations

Then derive:
- assets
- trust boundaries
- attack surface
- likely abuse cases
- reviewer questions

Use deterministic extraction first, then bounded agent synthesis.

### 18.4 Finding generation logic
Findings can originate from:
- deterministic tools
- custom repo heuristics
- runtime eval tools
- validation runner
- reviewer annotations
- agent-generated synthesis only when backed by artifacts

Each finding must include:
- category
- evidence type
- severity
- confidence
- validation status
- remediation summary
- source lineage

### 18.5 Validation logic
Validate only selected findings:
- high severity
- high confidence
- target class supports reproduction
- resource budget available
- disclosure policy allows safe testing

Validation should:
- create isolated workspace
- execute bounded commands/tests
- record stdout/stderr
- save diffs/artifacts
- update finding with validation status

### 18.6 Remediation logic
Phase 1:
- prose remediation memo

Phase 2:
- structured remediation checklist

Phase 3:
- proposed patch/diff with rationale and human-review note

---

## 19. Security and safety requirements

- ephemeral execution workspaces
- bounded network access where possible
- no persistent secrets in images
- no arbitrary shell/network access by planner or subagents
- clear disclosure path for likely real vulnerabilities
- public-safe filtering for report output
- no automatic public exploit generation in normal mode
- no auto-apply patches to target repos
- full traces for planner/subagent decisions
- human review mandatory before public disclosure of sensitive findings

---

## 20. Deployment models

### Local
- CLI on analyst workstation

### Single-node VPS
- internal API + worker on Hostinger KVM2

### CI/CD
- GitHub Action or pipeline step

### Future commercial
- hosted API
- managed artifact storage
- team/workspace features

---

## 21. Surfaces

The harness should eventually support all of:

### 21.1 CLI
Examples:
- `audit-harness scan repo https://github.com/org/repo`
- `audit-harness scan path ./project`
- `audit-harness scan endpoint https://demo.example.com`
- `audit-harness threat-model ./repo`
- `audit-harness export --format sarif`

### 21.2 HTTP API
Example routes:
- `POST /runs`
- `GET /runs/:id`
- `GET /runs/:id/findings`
- `GET /runs/:id/artifacts`
- `GET /runs/:id/traces`
- `POST /threat-models/generate`
- `POST /validate`

### 21.3 MCP server
Expose tools such as:
- `audit_repo`
- `generate_threat_model`
- `list_findings`
- `get_evidence_bundle`
- `get_run_trace`
- `score_target`
- `suggest_hardening_steps`

### 21.4 GitHub Action
Use cases:
- PR audit
- scheduled repo scan
- release-triggered scan
- nightly posture refresh

---

## 22. Suggested repo structure

```text
tethermark/
  apps/
    cli/
    api/
    mcp/
  packages/
    core-types/
    classifier/
    repo-analyzer/
    framework-detector/
    agent-surface-mapper/
    planner-agent/
    threat-model-agent/
    eval-selection-agent/
    skeptic-agent/
    validator-agent/
    remediation-agent/
    tool-adapters/
    eval-runner/
    validation-runner/
    findings-normalizer/
    grader-engine/
    scoring-engine/
    exporters/
    policy-packs/
    public-safety-filter/
    run-graph/
  docker/
    worker/
  examples/
  docs/
```

---

## 23. Implementation roadmap

This roadmap is **phase-based implementation of one complete architecture**, not a sequence of conceptually different products.

### Phase 1 — Complete harness, narrow scope

Goal:
Build a fully recognizable agentic audit harness that works end to end on a narrow set of targets.

Required capabilities:
- target intake and classification
- deterministic repo analysis
- planner agent with structured run plan output
- threat-model agent
- bounded tool orchestration
- baseline posture tools: Scorecard, Trivy, Semgrep
- limited custom analysis for prompts/tools/memory/state
- skeptic/grader pass
- canonical finding schema
- scoring bundle
- run traces
- JSON + Markdown + SARIF export
- downstream ingest bundle

Supported target classes at minimum:
- Class 1
- Class 4

Success criteria:
- clearly looks like an agentic harness, not just scanner glue
- can analyze a real OSS repo
- produces a coherent threat model
- surfaces meaningful agent-specific findings, not only generic SAST output
- emits planner decisions and traces
- can feed downstream case-file workflows
- can run from CLI by one operator on KVM2

### Phase 2 — Broader runtime coverage

Goal:
Expand target coverage and deepen isolated AI-security runtime testing/validation while keeping the same harness architecture.

Adds:
- validation-runner package
- promptfoo adapter
- garak adapter
- optional PyRIT integration for selected targets
- Inspect integration for multi-turn/tool targets
- target profiles
- isolated container or microVM runtime validation for repo/local targets
- synthetic credentials and simulated tool/service backends
- hosted endpoint / reduced-confidence mode only for explicitly authorized non-production targets
- better evidence bundle
- validation trace bundle
- remediation memo per finding
- GitHub Action support

Supported target classes:
- Class 1
- Class 2
- Class 3
- Class 4
- initial Class 5

Success criteria:
- can validate a subset of top findings in sandbox
- can audit an explicitly authorized non-production endpoint/demo in reduced-confidence mode
- can run multi-turn agent/security evals
- produces publication-grade evidence bundles

### Phase 3 — Advanced developer platform features

Goal:
Add the strongest differentiators without changing the underlying architecture.

Adds:
- patch/fix assistance
- incremental scan planner
- changed-files focus
- persistent threat-model refinement
- reviewer feedback loop
- stronger MCP/tool/API surfaces
- cross-project benchmarking
- downstream publishing bundle hardening
- AI Assurance imported-finding bundle hardening

Optional stretch features:
- patch validation loop
- diff-aware remediation quality scoring
- policy-pack marketplace
- sponsor-ready hosted API tier
- organization/workspace model

Success criteria:
- strong portfolio proof of agent-security systems design
- useful incremental re-scan workflow
- credible skill/tool/API surface for other agent systems
- richer downstream product reuse

---

## 24. Recommended build order

### Weeks 1–2
- repo skeleton
- core types
- classifier
- repo analyzer
- framework detector
- planner agent scaffold
- threat-model agent scaffold
- Scorecard/Trivy/Semgrep adapters
- JSON/Markdown export
- run trace schema

### Weeks 3–5
- custom repo heuristics
- findings normalization
- skeptic/grader pass
- score dimensions
- downstream ingest bundle
- initial CLI UX
- agent decision logging

### Weeks 6–8
- promptfoo/garak integration
- target profiles
- runtime eval mode
- isolated container or microVM validation path
- evidence/artifact bundling
- validation-runner MVP

### Weeks 9–12
- Inspect integration
- reduced-confidence non-production endpoint mode
- GitHub Action
- MCP server
- remediation memos
- first public docs/examples

### Later
- incremental scans
- patch suggestions
- feedback loop memory
- assurance-control-plane connector
- benchmarking reports

---

## 25. MVP evaluation criteria

The harness is successful if it can do all of the following on at least a few representative OSS repos:

1. classify the target correctly
2. generate a useful threat model
3. visibly use planner/subagent orchestration
4. find agent-specific issues, not just generic code smells
5. attach meaningful evidence
6. export a structured bundle a downstream consumer can ingest
7. produce traces that explain why tools/evals were selected
8. run on your practical infrastructure
9. demonstrate a stronger thesis than “generic AI security agent” or “just scanner glue”

---

## 26. Final recommendation

Build the project as a **single complete agentic audit harness architecture**, then implement it in phases.

Do **not** publicly frame it as:
- V1 = basic scanner pipeline
- V2 = better scanner pipeline
- V3 = real agent mode

Instead, frame it as:

**“An agentic AI security audit harness with planner, specialist subagents, bounded tool orchestration, graders, validation, traces, and reusable outputs.”**

Then describe the roadmap only as:
- Phase 1: narrow scope, end-to-end harness
- Phase 2: broader runtime coverage
- Phase 3: advanced platform features

That preserves the strongest possible showcase value while staying aligned with the original product boundary and downstream integration model.
