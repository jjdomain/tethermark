import type {
  AnalysisSummary,
  AuditRequest,
  BaselineDimensionKey,
  BaselineDimensionScore,
  ControlResult,
  MethodologyArtifact,
  StandardControlDefinition,
  StaticBaselineMethodology,
  TargetClass
} from "./contracts.js";

const BASELINE_DIMENSIONS: StaticBaselineMethodology["dimensions"] = [
  {
    dimension: "repo_posture",
    weight: 0.30,
    title: "Repository Posture",
    summary: "OSS repository, dependency, CI/CD, and supply-chain posture based on OpenSSF Scorecard, SLSA, and NIST SSDF-aligned controls.",
    frameworks: ["OpenSSF Scorecard", "SLSA", "NIST SSDF"]
  },
  {
    dimension: "agentic_guardrails",
    weight: 0.30,
    title: "Agentic Guardrails",
    summary: "Static evidence of tool-use boundaries, prompt/tool guardrails, and constrained agent behavior aligned with OWASP LLM, OWASP Agentic, MITRE ATLAS, and NIST AI RMF concerns.",
    frameworks: ["OWASP LLM Applications", "OWASP Agentic Applications", "MITRE ATLAS", "NIST AI RMF"]
  },
  {
    dimension: "ai_data_exposure",
    weight: 0.20,
    title: "AI Data Exposure",
    summary: "Static indicators of sensitive data exposure, unsafe prompt or tool handling, and leakage risks in AI-enabled systems.",
    frameworks: ["OWASP LLM Applications", "NIST AI RMF", "NIST SP 800-218A"]
  },
  {
    dimension: "observability_auditability",
    weight: 0.10,
    title: "Observability and Auditability",
    summary: "Static evidence that the project exposes enough traceability, logging, and review signals to support trustworthy security assessment.",
    frameworks: ["NIST AI RMF", "NIST SSDF", "NIST SP 800-218A"]
  },
  {
    dimension: "evidence_readiness",
    weight: 0.10,
    title: "Evidence Readiness",
    summary: "Static evidence that the repository is documented and instrumented well enough for recurring audit and reassessment.",
    frameworks: ["NIST SSDF", "SLSA", "OpenSSF Scorecard", "NIST SP 800-218A"]
  }
];

const BASELINE_DIMENSION_WEIGHTS = Object.fromEntries(BASELINE_DIMENSIONS.map((item) => [item.dimension, item.weight])) as Record<BaselineDimensionKey, number>;

const EXTERNAL_CONTROL_CATALOG: StandardControlDefinition[] = [
  {
    control_id: "openssf.security_policy",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Security-Policy",
    title: "Publish a security policy",
    description: "Repository publishes a SECURITY.md or equivalent vulnerability disclosure policy.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "evidence_readiness",
    catalog: "external_standard",
    applicability: ["all", "repo"]
  },
  {
    control_id: "openssf.dependency_update_tool",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Dependency-Update-Tool",
    title: "Automate dependency update hygiene",
    description: "Repository uses automated dependency update tooling such as Dependabot or Renovate.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["dependency", "repo", "all"]
  },
  {
    control_id: "openssf.pinned_dependencies",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Pinned-Dependencies",
    title: "Pin or lock dependencies",
    description: "Repository uses lockfiles or equivalent mechanisms to reduce dependency drift.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["dependency", "repo", "all"]
  },
  {
    control_id: "openssf.token_permissions",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Token-Permissions",
    title: "Minimize workflow token permissions",
    description: "CI/CD workflows avoid broad write permissions by default.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["ci", "repo", "all"]
  },
  {
    control_id: "openssf.dangerous_workflow",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Dangerous-Workflow",
    title: "Avoid dangerous workflow patterns",
    description: "CI/CD workflows avoid obviously dangerous automation patterns.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["ci", "repo", "all"]
  },
  {
    control_id: "openssf.branch_protection",
    framework: "OpenSSF Scorecard",
    standard_ref: "OpenSSF Scorecard / Branch-Protection",
    title: "Protect main development branches",
    description: "Default branches should be protected by repository settings.",
    weight: 6,
    static_assessable: false,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["repo", "all"]
  },
  {
    control_id: "slsa.pinned_build_dependencies",
    framework: "SLSA",
    standard_ref: "SLSA / Build integrity / pinned build dependencies",
    title: "Pin CI/CD build dependencies",
    description: "Build and CI actions should be pinned tightly enough to reduce supply-chain drift.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["ci", "repo", "all"]
  },
  {
    control_id: "slsa.provenance",
    framework: "SLSA",
    standard_ref: "SLSA / Provenance",
    title: "Produce verifiable build provenance",
    description: "Build outputs should have verifiable provenance.",
    weight: 6,
    static_assessable: false,
    baseline_dimension: "evidence_readiness",
    catalog: "external_standard",
    applicability: ["ci", "repo", "all"]
  },
  {
    control_id: "nist_ssdf.disclosure_process",
    framework: "NIST SSDF",
    standard_ref: "NIST SSDF / Respond to vulnerabilities",
    title: "Establish a disclosure and response process",
    description: "Project provides a visible process for vulnerability reporting and response.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "evidence_readiness",
    catalog: "external_standard",
    applicability: ["repo", "all"]
  },
  {
    control_id: "nist_ssdf.automated_security_checks",
    framework: "NIST SSDF",
    standard_ref: "NIST SSDF / Automated security checks",
    title: "Use automated security checks in development workflows",
    description: "Project uses visible static security checks or comparable CI security automation.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "repo_posture",
    catalog: "external_standard",
    applicability: ["ci", "repo", "all"]
  },
  {
    control_id: "owasp_llm.prompt_injection_guardrails",
    framework: "OWASP LLM Applications",
    standard_ref: "OWASP LLM Top 10 / Prompt Injection",
    title: "Implement prompt and tool-use guardrails",
    description: "Agentic or LLM-enabled systems should show explicit safeguards against prompt-driven misuse.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "external_standard",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "owasp_llm.sensitive_information_disclosure",
    framework: "OWASP LLM Applications",
    standard_ref: "OWASP LLM Top 10 / Sensitive Information Disclosure",
    title: "Prevent sensitive information disclosure",
    description: "Systems should avoid hardcoded secrets or policies that expose sensitive information.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "ai_data_exposure",
    catalog: "external_standard",
    applicability: ["all", "repo", "agentic"]
  },
  {
    control_id: "owasp_agentic.tool_misuse_boundary",
    framework: "OWASP Agentic Applications",
    standard_ref: "OWASP Agentic Applications / Tool misuse boundaries",
    title: "Bound agent tool use",
    description: "Agentic systems should expose clear authorization and command boundaries around tool use.",
    weight: 10,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "external_standard",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "mitre_atlas.tool_misuse_mitigation",
    framework: "MITRE ATLAS",
    standard_ref: "MITRE ATLAS / Tool misuse mitigation",
    title: "Mitigate AI-enabled tool misuse paths",
    description: "AI-enabled systems should constrain dangerous tool misuse paths that adversaries can exploit.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "external_standard",
    applicability: ["agentic", "mcp"]
  }
];

const HARNESS_INTERNAL_CONTROL_CATALOG: StandardControlDefinition[] = [
  {
    control_id: "harness_internal.audit_traceability",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Audit traceability",
    title: "Preserve audit traceability signals",
    description: "The target exposes enough artifacts, logs, or traces to support repeatable audit review.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "observability_auditability",
    catalog: "harness_internal",
    applicability: ["all", "repo", "agentic"]
  },
  {
    control_id: "harness_internal.security_logging",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Security logging",
    title: "Expose security-relevant logging or monitoring markers",
    description: "The target contains code or docs indicating security-relevant logging or monitoring pathways.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "observability_auditability",
    catalog: "harness_internal",
    applicability: ["all", "repo", "agentic"]
  },
  {
    control_id: "harness_internal.eval_harness_presence",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Evaluation harness readiness",
    title: "Expose eval or validation harness markers",
    description: "The target exposes enough test, eval, or harness material to support recurring validation.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "evidence_readiness",
    catalog: "harness_internal",
    applicability: ["all", "repo", "agentic"]
  },
  {
    control_id: "harness_internal.architecture_evidence",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Architecture evidence",
    title: "Provide architecture or system-context evidence",
    description: "The target exposes architecture, threat-model, or system-context evidence useful for audit interpretation.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "evidence_readiness",
    catalog: "harness_internal",
    applicability: ["all", "repo", "agentic"]
  },
  {
    control_id: "harness_internal.agent_tool_allowlist",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Agent tool allowlists",
    title: "Define agent tool allowlists and approval gates",
    description: "Agentic systems expose explicit tool allowlists, denied capabilities, or human approval gates before sensitive actions.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "harness_internal.agent_permission_boundaries",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Agent permission boundaries",
    title: "Constrain shell, file, and network permissions",
    description: "Agentic systems constrain dangerous shell, filesystem mutation, browser, and network capabilities with sandbox or policy boundaries.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "harness_internal.untrusted_content_prompt_injection",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Untrusted content prompt-injection handling",
    title: "Handle prompt injection from untrusted content",
    description: "Agentic systems that ingest external content include prompt-injection handling, instruction hierarchy, or untrusted-content isolation.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "harness_internal.secret_env_isolation",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Secret redaction and env isolation",
    title: "Redact secrets and isolate environment access",
    description: "Agentic systems avoid leaking process environment data and include secret redaction or safe environment access boundaries.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "ai_data_exposure",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "harness_internal.mcp_plugin_permissions",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / MCP and plugin permission surfaces",
    title: "Document MCP and plugin permission surfaces",
    description: "MCP servers, plugins, or skills document exposed tools and apply permission policy for externally callable capabilities.",
    weight: 8,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "harness_internal",
    applicability: ["mcp"]
  },
  {
    control_id: "harness_internal.browser_automation_safety",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Browser automation safety",
    title: "Constrain browser automation safety",
    description: "Browser automation agents constrain navigation, downloads, credential handling, and external page instruction trust.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "agentic_guardrails",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  },
  {
    control_id: "harness_internal.telemetry_log_redaction",
    framework: "Harness Internal Controls",
    standard_ref: "Harness Internal / Telemetry and log redaction",
    title: "Redact telemetry and logs",
    description: "Agentic systems avoid logging prompts, tool arguments, secrets, or user data without redaction or minimization.",
    weight: 6,
    static_assessable: true,
    baseline_dimension: "observability_auditability",
    catalog: "harness_internal",
    applicability: ["agentic", "mcp"]
  }
];

const CONTROL_CATALOG: StandardControlDefinition[] = [...EXTERNAL_CONTROL_CATALOG, ...HARNESS_INTERNAL_CONTROL_CATALOG];

function isAgentic(targetClass: TargetClass): boolean {
  return targetClass === "tool_using_multi_turn_agent" || targetClass === "mcp_server_plugin_skill_package";
}

function hasCi(analysis: AnalysisSummary): boolean {
  return analysis.ci_workflows.length > 0;
}

function hasDependencySurface(analysis: AnalysisSummary): boolean {
  return analysis.dependency_manifests.length > 0 || analysis.lockfiles.length > 0;
}

function hasContainerSurface(analysis: AnalysisSummary): boolean {
  return analysis.container_files.length > 0;
}

function isApplicable(control: StandardControlDefinition, analysis: AnalysisSummary, targetClass: TargetClass): boolean {
  if (control.applicability.includes("all")) return true;
  if (control.applicability.includes("agentic") && isAgentic(targetClass)) return true;
  if (control.applicability.includes("mcp") && targetClass === "mcp_server_plugin_skill_package") return true;
  if (control.applicability.includes("ci") && hasCi(analysis)) return true;
  if (control.applicability.includes("dependency") && hasDependencySurface(analysis)) return true;
  if (control.applicability.includes("container") && hasContainerSurface(analysis)) return true;
  if (control.applicability.includes("repo")) return true;
  return false;
}

export function getControlCatalog(): StandardControlDefinition[] {
  return CONTROL_CATALOG;
}

export function getHarnessInternalControls(): StandardControlDefinition[] {
  return HARNESS_INTERNAL_CONTROL_CATALOG;
}

export function getCandidateControls(args: { analysis: AnalysisSummary; targetClass: TargetClass; request: AuditRequest }): StandardControlDefinition[] {
  return CONTROL_CATALOG.filter((control) => isApplicable(control, args.analysis, args.targetClass));
}

export function getMethodologyArtifact(): MethodologyArtifact {
  return {
    version: "2026-04-11.standards-static.v2",
    summary: "Static audit methodology based on a crosswalk of OpenSSF Scorecard, SLSA, NIST SSDF, OWASP LLM / Agentic guidance, MITRE ATLAS, and harness-internal auditability controls where applicable.",
    frameworks: [
      {
        framework: "OpenSSF Scorecard",
        purpose: "OSS repository posture controls for security policy, dependency hygiene, and workflow safety.",
        scoring_notes: ["High-confidence repo and workflow controls contribute strongly in static mode."]
      },
      {
        framework: "SLSA",
        purpose: "Supply-chain and build integrity controls.",
        scoring_notes: ["Controls requiring build provenance remain not_assessed in static-only runs."]
      },
      {
        framework: "NIST SSDF",
        purpose: "Secure software development process controls.",
        scoring_notes: ["Visible development and disclosure practices influence control results in static mode."]
      },
      {
        framework: "OWASP LLM Applications",
        purpose: "LLM-specific risk areas for AI-enabled systems.",
        scoring_notes: ["Only applied when the repository shows LLM or agentic surfaces relevant to the control."]
      },
      {
        framework: "OWASP Agentic Applications",
        purpose: "Agent-specific tool and action safety boundaries.",
        scoring_notes: ["Applied only to tool-using or MCP-style targets."]
      },
      {
        framework: "MITRE ATLAS",
        purpose: "Threat-informed framing for AI-enabled system attack paths.",
        scoring_notes: ["Used as a threat-informed control mapping layer rather than a complete score-only framework."]
      },
      {
        framework: "Harness Internal Controls",
        purpose: "Harness-owned controls for auditability, evidence readiness, and repeatable AI security review.",
        scoring_notes: ["Used to make the static baseline more useful even where external standards are high-level."]
      }
    ],
    scoring_rules: [
      "Controls are marked pass, partial, fail, not_assessed, or not_applicable.",
      "Only applicable controls contribute to framework scores.",
      "Static runs do not fail controls solely because runtime-only evidence is unavailable; such controls should be not_assessed.",
      "Overall score is computed from framework rollups of applicable controls using control weights and awarded points."
    ]
  };
}

export function getStaticBaselineMethodology(): StaticBaselineMethodology {
  return {
    version: "2026-04-11.static-ai-baseline.v2",
    summary: "Static AI Security Baseline Methodology that rolls standards-aligned and harness-internal controls into reusable AI security posture dimensions for repository-first assessment.",
    dimensions: BASELINE_DIMENSIONS,
    scoring_rules: [
      "Dimension scores are computed only from applicable controls mapped to that dimension.",
      "Not assessed and not applicable controls do not award points but remain visible through coverage counts.",
      "Static score is a weighted average of the dimension percentages using the methodology-defined dimension weights.",
      "Static score should be treated as a baseline posture signal, not a substitute for runtime or behavioral validation."
    ]
  };
}

export function getBaselineDimensionWeights(): Record<BaselineDimensionKey, number> {
  return { ...BASELINE_DIMENSION_WEIGHTS };
}

export function computeBaselineDimensionScores(controlResults: ControlResult[], controlCatalog: StandardControlDefinition[]): BaselineDimensionScore[] {
  const controlMap = new Map(controlCatalog.map((control) => [control.control_id, control]));
  return BASELINE_DIMENSIONS.map((dimension) => {
    const controls = controlResults.filter((control) => {
      const definition = controlMap.get(control.control_id);
      return definition?.baseline_dimension === dimension.dimension;
    });
    const applicableControls = controls.filter((control) => control.applicability === "applicable");
    const assessedControls = applicableControls.filter((control) => control.assessability !== "not_assessed");
    const maxScore = applicableControls.reduce((sum, control) => sum + control.max_score, 0);
    const score = applicableControls.reduce((sum, control) => sum + control.score_awarded, 0);
    return {
      dimension: dimension.dimension,
      score,
      weight: dimension.weight,
      max_score: maxScore,
      percentage: maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : 0,
      assessed_controls: assessedControls.length,
      applicable_controls: applicableControls.length,
      control_ids: applicableControls.map((control) => control.control_id),
      frameworks: [...new Set(applicableControls.map((control) => control.framework))]
    };
  });
}

export function computeStaticBaselineScore(dimensionScores: BaselineDimensionScore[]): number {
  const weightedScore = dimensionScores.reduce((sum, item) => sum + (item.percentage * item.weight), 0);
  return Math.max(0, Math.min(100, Math.round(weightedScore)));
}
