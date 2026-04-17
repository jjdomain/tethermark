# AI Agent Security Audit Engine — Requirements, Architecture, and Implementation Spec (v1 / v2 / v3)

## 1. Purpose

This document specifies a **separate reusable audit engine** for AI/agent security review.

The engine is intended to power:
- recurring OSS case-file audits
- local and CI security review of AI/agent repos
- MCP/API/CLI/worker-based audit workflows
- future commercial developer tooling

This engine is **not** the same thing as:
- downstream publishing, research, or leaderboard shells
- **AI Assurance Control Plane**, which is the downstream assurance/evidence/review workflow layer

### 1.1 Positioning

The engine should be positioned as:

**an open, headless AI/agent security audit orchestrator for repositories, hosted agent systems, MCP/tool boundaries, and target-specific security evaluations**

It should **not** be positioned as:
- a generic “AI security agent”
- a clone of Codex Security
- a vulnerability oracle
- a package trust registry
- a GRC/control-plane product

### 1.2 Why this exists even after Codex Security

Codex Security now covers:
- repo-specific threat modeling
- commit/history-aware scanning
- sandboxed validation
- ranked findings
- suggested patches in GitHub-oriented workflows

That means the simple version of this project is no longer strategically interesting.

This engine remains justified because it should focus on areas that are **still under-served or differently served**:
- open/self-hosted/headless execution
- multi-tool orchestration across deterministic scanners and agent-specific eval tools
- target classes beyond connected GitHub repos
- agent/tool/MCP boundary mapping
- custom eval packs and methodology
- reusable outputs for downstream publishing systems and AI Assurance Control Plane
- portable CLI/API/MCP/GitHub Action surfaces
- editorial and assurance downstream integration

---

## 2. Product boundary

## 2.1 What the engine owns

The engine owns:
- target intake and classification
- repo/endpoint inspection
- architecture and threat-model extraction
- tool orchestration
- custom eval orchestration
- finding normalization
- evidence bundle generation
- optional validation/reproduction
- optional remediation memo or patch suggestion
- export surfaces (CLI/API/MCP/GitHub Action)

## 2.2 What the engine does not own

The engine does **not** own:
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

## 3. Relationship to adjacent products

## 3.1 Downstream publishing shell

A downstream publishing or research shell should consume this engine as:
- library
- CLI
- internal API
- worker job
- GitHub Action result

The downstream publishing shell owns scheduling, editorial review, publication, freshness display, and cross-project archive or leaderboard behavior.

## 3.2 AI Assurance Control Plane

The assurance control plane should ingest selected findings/evidence from this engine as:
- imported findings
- evidence references
- control-family tags
- reviewer-routing metadata

The assurance control plane should not re-implement scanning/orchestration.

## 3.3 Codex Security

reference url: https://openai.com/index/codex-security-now-in-research-preview/

This engine should deliberately **not** claim parity with Codex Security at launch.

Instead, it should:
- reproduce a meaningful subset of strong ideas
- remain multi-tool and self-hostable
- add features that matter for agent security specifically
- remain useful even when Codex Security is unavailable or unsuitable

---

## 4. High-level design principles

1. **Threat-model first, not scanner-first**
2. **Evidence-first, not score-first**
3. **Agent-specific, not generic appsec only**
4. **Composable, not monolithic**
5. **Headless-first**
6. **Reusable outputs**
7. **Conservative claims**
8. **Human review remains required**

---

## 5. Target users

### Primary users
- AI security researchers
- security engineers auditing AI/agent repos
- OSS maintainers who want structured AI/agent security review
- practitioners building internal security pipelines around AI systems

### Secondary users
- downstream editorial workflows
- AI assurance/governance operators importing findings downstream
- internal developer platform/security teams
- employers evaluating agent-security systems thinking

---

## 6. Core use cases

1. Audit an open-source AI repo before writing a case file.
2. Run a repo audit in CI against an MCP/tool-using app.
3. Inspect a public hosted demo/API when repo access is limited.
4. Generate an editable threat model from a repo.
5. Run custom eval packs for tool misuse, prompt injection, and unsafe escalation.
6. Produce normalized findings that can feed downstream publishing systems and/or the assurance control plane.
7. Expose audit capability via MCP/tool/skill/API for other agentic systems.

---

## 7. Non-goals

For v1/v2, the engine should not try to be:
- a universal AppSec replacement
- a broad package trust registry
- a full runtime agent defense platform
- an observability platform
- a managed SaaS-first company product
- a local model inference stack
- a full autonomous patching platform

---

## 8. Target classes

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
- public demo/API exists
- repo unavailable or incomplete

Typical outputs:
- runtime/behavioral findings
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

## 9. Canonical workflow

1. **Target intake**
2. **Classification**
3. **Architecture extraction**
4. **Threat-model draft**
5. **Tool/eval selection**
6. **Execution**
7. **Normalization and dedupe**
8. **Validation / evidence bundling**
9. **Scoring**
10. **Remediation synthesis**
11. **Export**

---

## 10. Architecture overview

## 10.1 Logical components

- `ingest-service`
- `classifier`
- `repo-analyzer`
- `agent-surface-mapper`
- `threat-model-builder`
- `policy-pack-resolver`
- `tool-orchestrator`
- `eval-runner`
- `validation-runner`
- `finding-normalizer`
- `scoring-engine`
- `remediation-engine`
- `exporters`
- `mcp-server`
- `api-server`
- `cli`

## 10.2 Recommended stack

### Core
- TypeScript / Node.js for orchestration
- Python adapters where tool ecosystems demand it
- Docker for worker isolation
- Postgres optional for long-running service mode
- MinIO/S3-compatible storage for artifacts
- JSON-first canonical contracts

### Execution
- ephemeral worker containers
- queue-driven execution
- no persistent secrets inside worker images
- environment injection at runtime

### Packaging
- pnpm or npm workspaces for monorepo
- separate packages for adapters/exporters
- Python virtualenv inside specific adapters where needed

---

## 11. Surfaces

The engine should eventually support all of:

### 11.1 CLI
Examples:
- `audit-engine scan repo https://github.com/org/repo`
- `audit-engine scan path ./project`
- `audit-engine scan endpoint https://demo.example.com`
- `audit-engine threat-model ./repo`
- `audit-engine export --format sarif`

### 11.2 HTTP API
Example routes:
- `POST /runs`
- `GET /runs/:id`
- `GET /runs/:id/findings`
- `GET /runs/:id/artifacts`
- `POST /threat-models/generate`
- `POST /validate`

### 11.3 MCP server
Expose tools such as:
- `audit_repo`
- `generate_threat_model`
- `list_findings`
- `get_evidence_bundle`
- `score_target`
- `suggest_hardening_steps`

### 11.4 GitHub Action
Use cases:
- PR audit
- scheduled repo scan
- release-triggered scan
- nightly posture refresh

---

## 12. Core data contracts

## 12.1 Target descriptor

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

## 12.2 Threat-model artifact

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

## 12.3 Canonical finding schema

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

## 12.4 Score bundle

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

## 13. Tool strategy

## 13.1 Philosophy

Use multiple tools as complementary layers.
Do **not** average raw outputs.
Do **not** force every target through every tool.

## 13.2 Deterministic posture/security tools
- OpenSSF Scorecard
- Trivy
- Semgrep

## 13.3 AI/agent-specific tools
- promptfoo
- garak
- PyRIT
- Inspect

## 13.4 Optional specialist helpers
- stack-specific review helpers
- repo parsers / tree-sitter-based analyzers
- custom MCP manifests/rule parsers
- custom policy evaluators

## 13.5 Custom eval packs

Custom packs are first-class. They are your moat.

Required launch packs:
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

Later packs:
- coding-agent pack
- browser/computer-use pack
- RAG pack
- support/helpdesk pack

---

## 14. Deduplication and normalization logic

When multiple tools surface the same underlying issue, merge findings by:
- category
- component/path
- evidence family
- semantic similarity
- control-family overlap

Keep:
- original source attribution
- per-tool evidence links
- strongest validation status
- highest defensible severity/confidence combination

Merged finding should preserve source lineage.

---

## 15. Scoring logic

## 15.1 Scoring dimensions

- `repo_posture_score`
- `runtime_ai_security_score`
- `agent_control_score`
- `observability_score`
- `evidence_readiness_score`

## 15.2 Confidence logic

Confidence should depend on:
- tool agreement
- validation status
- richness of evidence
- target-class certainty
- reviewer overrides where applicable

## 15.3 Freshness logic

Freshness should depend on:
- snapshot recency
- repo churn since deep scan
- whether runtime artifacts are current
- whether config/dependency changes materially affect prior findings

## 15.4 Public score caution

Scores should be explanatory, not absolute truth.
Always expose dimension breakdowns and confidence context.

---

## 16. V1 / V2 / V3 roadmap

# V1 — Repo-aware audit foundation

## 16.1 Goal

Build a practical, headless engine that demonstrates strong systems design and produces publishable findings for downstream consumers without trying to match full Codex Security behavior.

## 16.2 What V1 must do

### Ingest and classify
- repo URL
- local path
- optional endpoint URL
- classify target into one of the target classes

### Extract architecture
- identify framework/language
- identify likely entry points
- identify tool integrations
- detect MCP-related files/manifests if present
- detect auth/config files
- detect secrets/config risks

### Generate editable threat model
- summarize system type
- derive trust boundaries
- derive risky components
- derive reviewer questions
- export JSON + Markdown threat model

### Run baseline posture tools
- Scorecard
- Trivy
- Semgrep

### Run limited custom analysis
- prompt/policy artifact discovery
- tool boundary heuristics
- memory/store detection
- risky capability detection

### Normalize results
- canonical finding schema
- score dimensions
- artifact manifest
- Markdown summary bundle

### Export
- CLI output
- JSON bundle
- Markdown report
- SARIF export
- downstream ingest bundle

## 16.3 What V1 explicitly does not do
- full sandbox validation across many findings
- broad runtime endpoint testing
- patch generation
- full GitHub App integration
- always-on SaaS UI

## 16.4 V1 implementation steps

1. Create monorepo with packages:
   - `packages/core-types`
   - `packages/classifier`
   - `packages/repo-analyzer`
   - `packages/threat-model-builder`
   - `packages/tool-adapters`
   - `packages/findings-normalizer`
   - `packages/exporters`
   - `apps/cli`

2. Implement repo analyzer logic:
   - clone repo or inspect local path
   - build file inventory
   - detect framework markers
   - detect AI/agent dependencies
   - detect tool/MCP manifests
   - detect auth and secret-related files

3. Implement threat-model builder:
   - static prompts/templates first
   - optional LLM summarization over file inventory + extracted features
   - write editable JSON artifact

4. Implement adapter wrappers:
   - Scorecard
   - Trivy
   - Semgrep

5. Implement custom rule pass:
   - scan for prompt directories/files
   - scan for tool execution code
   - scan for file/network/database access wrappers
   - scan for memory/session/state patterns

6. Normalize output:
   - merge tool results
   - assign category/control-family/framework tags
   - compute dimension scores and confidence

7. Export results:
   - JSON
   - Markdown
   - SARIF
   - minimal downstream ingest payload

## 16.5 V1 success criteria
- can analyze a real OSS repo
- produces a coherent threat model
- surfaces meaningful agent-specific findings, not only generic SAST output
- can feed downstream case-file workflows
- can be run from CLI by one operator on KVM2

---

# V2 — Validation and runtime expansion

## 17.1 Goal

Add selective validation and runtime/behavioral assessment so the engine becomes closer to a true agent-security review system, while still staying narrower than Codex Security.

## 17.2 What V2 adds

### Sandboxed validation
- validate only high-priority findings
- capture commands, logs, stdout/stderr, diffs, and artifacts
- mark findings as validated/unvalidated

### Runtime evaluation
- promptfoo integration
- garak integration
- custom eval packs
- endpoint-only audits for hosted demos/APIs

### Tool-using/multi-turn testing
- Inspect or equivalent multi-turn evaluator
- tool-misuse scenarios
- unsafe escalation scenarios
- transcript leakage scenarios

### Better target-specific logic
- coding-agent target profile
- voice-agent target profile
- MCP server target profile
- RAG target profile

### Better exports
- evidence bundle
- validation trace bundle
- remediation memo per finding
- GitHub Action support

## 17.3 What V2 still does not fully do
- automated patch generation at broad scale
- commit-by-commit historical scanning at product-grade depth
- full enterprise multi-user UI
- continuous runtime monitoring

## 17.4 V2 implementation steps

1. Add `validation-runner` package:
   - ephemeral workspace
   - deterministic command execution
   - result capture
   - artifact packaging

2. Add `eval-runner` package:
   - promptfoo adapter
   - garak adapter
   - optional PyRIT integration for selected targets
   - Inspect integration for multi-turn/tool targets

3. Add target profiles:
   - profile-specific prompt sets
   - profile-specific hardening expectations
   - profile-specific score weighting

4. Add GitHub Action:
   - scheduled posture audit
   - manual deep audit trigger
   - artifact upload
   - SARIF publication where helpful

5. Add remediation layer:
   - structured remediation memo
   - likely root cause
   - recommended design change
   - confidence and validation status included

## 17.5 V2 success criteria
- can validate a subset of top findings in sandbox
- can audit a hosted endpoint/demo in reduced-confidence mode
- can run multi-turn agent/security evals
- can produce evidence bundles strong enough for publication or downstream assurance review

---

# V3 — Advanced orchestration and developer platform mode

## 18.1 Goal

Add the strongest “state of the art” features that demonstrate expertise relative to products like Codex Security, without pretending to replicate a full proprietary product stack.

## 18.2 What V3 adds

### Patch and fix assistance
- generate suggested patches/diffs for selected findings
- keep human review mandatory
- attach patch rationale and likely regression concerns

### Incremental scanning
- changed-files focus
- commit-range scan mode
- faster follow-up scans after baseline threat model exists

### Persistent threat-model refinement
- allow reviewer edits
- learn from prior confirmed/false-positive patterns
- maintain target-specific context across runs

### MCP/tool/skill integration
- headless audit tools exposed to other agent systems
- reusable skill/workflow packages
- “audit this repo” and “explain this finding” tool endpoints

### Cross-project benchmarking
- compare findings across similar target classes
- compare control gaps across categories
- generate reusable pattern reports

### Downstream integration hardening
- native ingest bundle for downstream consumers
- native imported finding format for AI Assurance Control Plane

## 18.3 Optional V3 stretch features
- patch validation loop
- diff-aware remediation quality scoring
- policy-pack marketplace
- sponsor-ready hosted API tier
- organization/workspace model

## 18.4 V3 implementation steps

1. Add remediation generator:
   - LLM-backed code change suggestions
   - diff formatting
   - file/line anchors
   - human-review-only workflow

2. Add incremental scan planner:
   - commit diff parser
   - changed component detection
   - threat-model delta updates

3. Add reviewer feedback loop:
   - accepted/rejected finding memory
   - false-positive suppression hints
   - target-specific criticality preferences

4. Add MCP server and API hardening:
   - auth
   - quotas
   - audit logs
   - safe artifact retrieval

5. Add downstream connectors:
   - downstream case-file bundle export
   - AI Assurance imported-finding bundle export

## 18.5 V3 success criteria
- clear demonstration of repo-aware threat modeling + validation + remediation guidance
- credible “skill/tool/API” surface for other agent systems
- useful incremental re-scan workflow
- strong portfolio proof of agent-security systems design

---

## 19. Detailed logic by subsystem

## 19.1 Classification logic

Inputs:
- repo metadata
- file inventory
- dependency hints
- endpoint hints
- user-provided classification hints

Decision rules:
- If no runnable app and mostly library/framework markers → Class 1
- If docker-compose/package scripts/server entry points present → Class 2
- If only endpoint provided → Class 3
- If tools/MCP/memory/multi-turn workflows detected → Class 4
- If MCP/package/skill manifest dominates → Class 5

Allow reviewer override.

## 19.2 Framework detection logic

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

## 19.3 Threat-model generation logic

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

Use deterministic extraction first, then optional LLM synthesis.

## 19.4 Finding generation logic

Findings can originate from:
- deterministic tools
- custom repo heuristics
- runtime eval tools
- validation runner
- reviewer annotations

Each finding must include:
- category
- evidence type
- severity
- confidence
- validation status
- remediation summary
- source lineage

## 19.5 Validation logic

Validate only selected findings:
- high severity
- high confidence
- target class supports reproduction
- resource budget available

Validation should:
- create isolated workspace
- execute bounded commands/tests
- record stdout/stderr
- save diffs/artifacts
- update finding with validation status

## 19.6 Remediation logic

V1:
- prose-only remediation memo

V2:
- structured remediation checklist

V3:
- proposed patch/diff with rationale and human-review note

---

## 20. Security and safety requirements

- ephemeral execution workspaces
- bounded network access where possible
- no persistent secrets in images
- clear disclosure path for likely real vulnerabilities
- public-safe filtering for report output
- no automatic public exploit generation in normal mode
- no auto-apply patches to target repos

---

## 21. Deployment models

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
    threat-model-builder/
    agent-surface-mapper/
    tool-adapters/
    eval-runner/
    validation-runner/
    findings-normalizer/
    scoring-engine/
    remediation-engine/
    exporters/
    policy-packs/
  docker/
    worker/
  examples/
  docs/
```

---

## 23. Recommended build order

### First 2 weeks
- repo skeleton
- core types
- classifier
- repo analyzer
- threat-model builder
- Scorecard/Trivy/Semgrep adapters
- JSON/Markdown export

### Weeks 3–5
- custom repo heuristics
- finding normalization
- score dimensions
- downstream ingest bundle
- initial CLI UX

### Weeks 6–8
- promptfoo/garak integration
- target profiles
- runtime eval mode
- evidence/artifact bundling

### Weeks 9–12
- validation runner
- GitHub Action
- MCP server
- remediation memos
- first public docs/examples

### Later
- V3 features
- incremental scans
- patch suggestions
- feedback loop
- assurance-control-plane connector

---

## 24. MVP evaluation criteria

The engine is successful if it can do all of the following on at least a few representative OSS repos:

1. classify the target correctly
2. generate a useful threat model
3. find agent-specific issues, not just generic code smells
4. attach meaningful evidence
5. export a structured bundle a downstream consumer can ingest
6. run on your practical infrastructure
7. demonstrate a stronger, more differentiated thesis than “generic AI security agent”

---

## 25. Final recommendation

Build the audit engine as a **separate reusable engine**, then let:
- downstream publishing systems use it for recurring public case files and leaderboards
- **AI Assurance Control Plane** ingest selected outputs for downstream evidence/review workflows

The strategic thesis after Codex Security is:

**not “we built another repo security agent”**  
but:

**“we built an open, multi-tool, agent-specific security audit orchestrator with threat-model-driven review, reusable outputs, and downstream editorial/assurance integration.”**
