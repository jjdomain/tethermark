export interface PromptDefinition {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  buildUserPrompt(context: unknown): string;
}

const plannerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    selected_profile: { type: "string" },
    classification_review: {
      type: "object",
      additionalProperties: false,
      properties: {
        semantic_class: { type: "string" },
        final_class: { type: "string" },
        secondary_traits: { type: "array", items: { type: "string" } },
        confidence: { type: "number" },
        evidence: { type: "array", items: { type: "string" } },
        override_reason: { type: "string" }
      },
      required: ["semantic_class", "final_class", "secondary_traits", "confidence", "evidence", "override_reason"]
    },
    frameworks_in_scope: { type: "array", items: { type: "string" } },
    applicable_control_ids: { type: "array", items: { type: "string" } },
    deferred_control_ids: { type: "array", items: { type: "string" } },
    non_applicable_control_ids: { type: "array", items: { type: "string" } },
    rationale: { type: "array", items: { type: "string" } },
    constraints: {
      type: "object",
      additionalProperties: false,
      properties: {
        max_runtime_minutes: { type: "integer" },
        network_mode: { type: "string", enum: ["none", "bounded", "bounded_remote"] },
        sandbox_required: { type: "boolean" },
        install_allowed: { type: "boolean" },
        read_only_analysis_only: { type: "boolean" },
        target_execution_allowed: { type: "boolean" }
      },
      required: ["max_runtime_minutes", "network_mode", "sandbox_required", "install_allowed", "read_only_analysis_only", "target_execution_allowed"]
    }
  },
  required: ["selected_profile", "classification_review", "frameworks_in_scope", "applicable_control_ids", "deferred_control_ids", "non_applicable_control_ids", "rationale", "constraints"]
};

const threatModelSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        system_type: { type: "string" },
        stack_guess: { type: "array", items: { type: "string" } },
        confidence: { type: "number" }
      },
      required: ["system_type", "stack_guess", "confidence"]
    },
    assets: { type: "array", items: { type: "string" } },
    entry_points: { type: "array", items: { type: "string" } },
    trust_boundaries: { type: "array", items: { type: "string" } },
    attack_surfaces: { type: "array", items: { type: "string" } },
    likely_abuse_cases: { type: "array", items: { type: "string" } },
    high_risk_components: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    questions_for_reviewer: { type: "array", items: { type: "string" } },
    framework_focus: { type: "array", items: { type: "string" } }
  },
  required: ["summary", "assets", "entry_points", "trust_boundaries", "attack_surfaces", "likely_abuse_cases", "high_risk_components", "assumptions", "questions_for_reviewer", "framework_focus"]
};

const evalSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseline_tools: { type: "array", items: { type: "string" } },
    runtime_tools: { type: "array", items: { type: "string" } },
    custom_eval_packs: { type: "array", items: { type: "string" } },
    validation_candidates: { type: "array", items: { type: "string" } },
    control_tool_map: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          control_id: { type: "string" },
          tools: { type: "array", items: { type: "string" } },
          rationale: { type: "string" }
        },
        required: ["control_id", "tools", "rationale"]
      }
    },
    rationale: { type: "array", items: { type: "string" } }
  },
  required: ["baseline_tools", "runtime_tools", "custom_eval_packs", "validation_candidates", "control_tool_map", "rationale"]
};

const supervisorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        overall_evidence_sufficiency: { type: "string", enum: ["low", "medium", "high"] },
        overall_false_positive_risk: { type: "string", enum: ["low", "medium", "high"] },
        publication_safety_note: { type: "string" }
      },
      required: ["overall_evidence_sufficiency", "overall_false_positive_risk", "publication_safety_note"]
    },
    grader_outputs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          finding_id: { type: "string" },
          evidence_sufficiency: { type: "string", enum: ["low", "medium", "high"] },
          false_positive_risk: { type: "string", enum: ["low", "medium", "high"] },
          validation_recommendation: { type: "string", enum: ["yes", "no"] },
          reasoning_summary: { type: "string" }
        },
        required: ["finding_id", "evidence_sufficiency", "false_positive_risk", "validation_recommendation", "reasoning_summary"]
      }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["rerun_planner", "rerun_threat_model", "rerun_eval_selection", "rerun_evidence_subset", "rerun_lane", "rerun_tool", "reassess_control_subset", "drop_findings", "downgrade_controls", "request_additional_evidence"] },
          reason: { type: "string" },
          lane_names: { type: "array", items: { type: "string" } },
          control_ids: { type: "array", items: { type: "string" } },
          finding_ids: { type: "array", items: { type: "string" } },
          provider_ids: { type: "array", items: { type: "string" } }
        },
        required: ["type", "reason", "lane_names", "control_ids", "finding_ids", "provider_ids"]
      }
    },
    notes: { type: "array", items: { type: "string" } }
  },
  required: ["summary", "grader_outputs", "actions", "notes"]
};

const remediationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    checklist: { type: "array", items: { type: "string" } },
    human_review_required: { type: "boolean" }
  },
  required: ["summary", "checklist", "human_review_required"]
};

const laneSpecialistSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "array", items: { type: "string" } },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          evidence: { type: "array", items: { type: "string" } }
        },
        required: ["title", "summary", "evidence"]
      }
    }
  },
  required: ["summary", "observations"]
};

function asJsonContext(context: unknown): string {
  return JSON.stringify(context, null, 2);
}

export const PROMPTS: Record<string, PromptDefinition> = {
  planner_agent: {
    schemaName: "planner_agent_audit_scope",
    schema: plannerSchema,
    systemPrompt: `You are planner-agent for an AI security audit harness.

Your job:
- semantically review the target classification using curated repo context, not just filenames
- classify the target into an audit profile
- choose which standards and controls are in scope for this repo and this audit mode
- decide which controls are applicable, deferred, or not applicable
- preserve conservative execution constraints
- when skeptic feedback is supplied, correct scope conservatively and explicitly

Rules:
- reason only from the provided target descriptor, heuristic target profile, repo context, sandbox metadata, analysis summary, request, control catalog, and any skeptic feedback
- static mode means read-only analysis only; controls requiring execution should be deferred, not failed
- do not invent tool results or control outcomes
- include only control IDs from the provided control catalog
- when operator control constraints are provided, treat them as hard bounds on framework and control selection while still choosing the best in-scope audit shape within those bounds
- prefer planner-selected scope by default; do not expand or narrow scope arbitrarily without evidence or an explicit operator constraint
- provide semantic_class, final_class, confidence, and evidence for your classification review
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Plan the audit scope and semantic target classification from the following structured context. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  },
  threat_model_agent: {
    schemaName: "threat_model_agent_artifact",
    schema: threatModelSchema,
    systemPrompt: `You are threat-model-agent for an AI security audit harness.

Your job:
- build a threat model grounded in the extracted signals and curated repo context
- identify system assets, boundaries, attack surfaces, abuse cases, and high-risk components
- highlight which standards families are most relevant, especially OWASP LLM, OWASP Agentic, MITRE ATLAS, and NIST AI RMF for AI-enabled systems

Rules:
- rely only on supplied extracted signals, planner output, and repo context
- do not claim vulnerabilities as confirmed facts
- focus on threat-informed prioritization that helps choose and interpret controls
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Draft a standards-aware threat model from the following context. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  },
  eval_selection_agent: {
    schemaName: "eval_selection_agent_output",
    schema: evalSelectionSchema,
    systemPrompt: `You are eval-selection-agent for an AI security audit harness.

Your job:
- choose the bounded evidence providers and analysis strategies needed to assess the selected controls
- map control IDs to provider IDs or analysis strategies
- respect audit mode and sandbox constraints
- when skeptic feedback is supplied, fill missing control coverage conservatively

Rules:
- in static mode, do not select providers that require target execution
- baseline providers may include repo_analysis, scorecard, scorecard_api, trivy, semgrep
- runtime providers may include inspect, garak, pyrit, internal_python_worker only when justified outside static mode
- control_tool_map must use only provided control IDs
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Select evidence providers and control mappings from the following context. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  },
  audit_supervisor_agent: {
    schemaName: "audit_supervisor_agent_output",
    schema: supervisorSchema,
    systemPrompt: `You are audit-supervisor-agent for an AI security audit harness.

Your job:
- act as the supervisory reviewer for the audit rather than a default contrarian
- assess whether findings, control outcomes, and publication notes are supported by the available evidence and audit policy
- decide whether a result should be upheld, downgraded, dropped, or rerouted to an upstream stage for recomputation
- apply organization-specific audit policy, publication constraints, and evidence sufficiency rules when they are provided
- emit typed corrective actions that choose the minimum sufficient correction while preserving audit integrity

Rules:
- distinguish direct provider evidence, deterministic repository/source evidence, and higher-level inference
- do not fabricate missing evidence or unstated company policy
- do not prefer downgrades by default; choose the action that best matches the evidence and audit policy
- request upstream reruns when classification, threat framing, or evidence strategy is materially wrong
- use local downgrade/drop actions when the issue is overclaim, unsupported severity, or publication safety on existing evidence
- be conservative about public conclusions from static-only evidence
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Supervise the following standards-based audit context as an audit supervisor. Apply the audit policy when present. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  },
  lane_specialist_agent: {
    schemaName: "lane_specialist_agent_output",
    schema: laneSpecialistSchema,
    systemPrompt: `You are lane-specialist-agent for an AI security audit harness.

Your job:
- review one audit lane only, using scoped controls, evidence, findings, and tool outputs
- produce lane-specific summary statements suitable for a final audit report
- surface any lane-specific observations where evidence quality, tool coverage, or scope limits materially affect confidence

Rules:
- stay within the supplied lane scope and do not restate global audit conclusions
- do not invent new findings or change control outcomes
- do not duplicate evidence verbatim; synthesize compact lane-specific conclusions
- prefer observations about evidence sufficiency, coverage gaps, and notable lane-specific risk concentration
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Analyze the following lane-specific audit context. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  },

  remediation_agent: {
    schemaName: "remediation_agent_memo",
    schema: remediationSchema,
    systemPrompt: `You are remediation-agent for an AI security audit harness.

Your job:
- summarize the most important failed or partial controls
- produce a compact remediation memo suitable for an audit report
- prioritize fixes that improve standards coverage and real security posture

Rules:
- derive recommendations only from supplied findings, control results, score summary, and skeptic outputs
- distinguish quick wins from structural improvements
- do not promise remediation sufficiency
- always preserve human review requirement
- output only valid JSON matching the required schema`,
    buildUserPrompt(context: unknown): string {
      return `Create a remediation memo and checklist from the following standards-based audit context. Output strict JSON only.\n\n${asJsonContext(context)}`;
    }
  }
};

