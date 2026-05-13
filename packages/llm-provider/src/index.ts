import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeModelKey(modelName: string): string {
  return modelName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readCostRate(modelName: string, suffix: "INPUT_COST_PER_1M" | "OUTPUT_COST_PER_1M"): number | null {
  const modelKey = sanitizeModelKey(modelName);
  const modelSpecific = readEnv(`AUDIT_LLM_${modelKey}_${suffix}`);
  const generic = readEnv(`AUDIT_LLM_${suffix}`);
  const candidate = modelSpecific ?? generic;
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function estimateCostUsd(modelName: string, promptTokens: number | null, completionTokens: number | null): number | null {
  if (promptTokens == null && completionTokens == null) return null;
  const inputRate = readCostRate(modelName, "INPUT_COST_PER_1M");
  const outputRate = readCostRate(modelName, "OUTPUT_COST_PER_1M");
  if (inputRate == null && outputRate == null) return null;
  const inputCost = ((promptTokens ?? 0) / 1_000_000) * (inputRate ?? 0);
  const outputCost = ((completionTokens ?? 0) / 1_000_000) * (outputRate ?? 0);
  return Number((inputCost + outputCost).toFixed(8));
}

export interface StructuredGenerationUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
}

export interface StructuredGenerationRequest {
  agentName: string;
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  metadata?: Record<string, unknown>;
  temperature?: number;
  maxRetries?: number;
}

export interface StructuredGenerationResult<T> {
  provider: string;
  model: string;
  rawText: string;
  parsed: T;
  attempts: number;
  usage?: StructuredGenerationUsage;
}

export interface ModelProvider {
  readonly providerName: string;
  readonly modelName: string;
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

export interface ProviderConfig {
  provider?: "openai" | "openai_codex" | "mock";
  model?: string;
  apiKey?: string;
  agentOverrides?: Record<string, {
    provider?: "openai" | "openai_codex" | "mock";
    model?: string;
    apiKey?: string;
  }>;
}

export interface ResolvedProviderConfig {
  provider: "openai" | "openai_codex" | "mock";
  model?: string;
  apiKey?: string;
  apiKeySource: "agent-specific" | "request-level" | "global-audit-llm" | "global-generic" | "oauth-local" | "none";
}

type MockResponseFactory = (request: StructuredGenerationRequest) => unknown;

const AGENT_ENV_PREFIX: Record<string, string[]> = {
  planner_agent: ["AUDIT_LLM_PLANNER"],
  threat_model_agent: ["AUDIT_LLM_THREAT_MODEL"],
  eval_selection_agent: ["AUDIT_LLM_EVIDENCE_SELECTION"],
  audit_supervisor_agent: ["AUDIT_LLM_SUPERVISOR"],
  remediation_agent: ["AUDIT_LLM_REMEDIATION"],
  lane_specialist_agent: ["AUDIT_LLM_AREA_REVIEW"]
};

function readAgentEnv(agentName: string, suffix: "PROVIDER" | "MODEL" | "API_KEY"): string | undefined {
  for (const prefix of AGENT_ENV_PREFIX[agentName] || []) {
    const value = readEnv(`${prefix}_${suffix}`);
    if (value) return value;
  }
  return undefined;
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function parseStructuredJson<T>(text: string): T {
  return JSON.parse(stripCodeFences(text)) as T;
}

function makeOpenAIRequestBody(request: StructuredGenerationRequest, modelName: string): Record<string, unknown> {
  return {
    model: modelName,
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    },
    temperature: request.temperature ?? 0.2
  };
}

function extractOpenAIMessageContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const textPart = content.find((part) => part?.type === "text" && typeof part.text === "string");
    if (textPart?.text) {
      return textPart.text;
    }
  }
  throw new Error("OpenAI response did not contain structured message content.");
}

function extractOpenAIUsage(payload: any, modelName: string): StructuredGenerationUsage {
  const promptTokens = typeof payload?.usage?.prompt_tokens === "number" ? payload.usage.prompt_tokens : null;
  const completionTokens = typeof payload?.usage?.completion_tokens === "number" ? payload.usage.completion_tokens : null;
  const totalTokens = typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : (promptTokens != null || completionTokens != null ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimateCostUsd(modelName, promptTokens, completionTokens)
  };
}

export class OpenAIModelProvider implements ModelProvider {
  readonly providerName = "openai";

  constructor(
    private readonly apiKey: string,
    readonly modelName: string,
    private readonly baseUrl = readEnv("LLM_BASE_URL") ?? readEnv("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"
  ) {}

  async generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
    const maxRetries = request.maxRetries ?? 2;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(makeOpenAIRequestBody(request, this.modelName))
        });

        if (!response.ok) {
          throw new Error(`OpenAI API request failed with status ${response.status}: ${await response.text()}`);
        }

        const payload = await response.json();
        const rawText = extractOpenAIMessageContent(payload);
        const parsed = parseStructuredJson<T>(rawText);
        return {
          provider: this.providerName,
          model: this.modelName,
          rawText,
          parsed,
          attempts: attempt,
          usage: extractOpenAIUsage(payload, this.modelName)
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`OpenAI structured generation failed after ${maxRetries} attempts. ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
}

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function readNumberEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appendLimited(current: string, chunk: Buffer, limit = 20_000): string {
  const next = current + chunk.toString("utf8");
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function runProcess(command: string, args: string[], stdin: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      settled = true;
      reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ exitCode, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

function resolveCodexCommand(command: string, prefixArgs: string[]): { command: string; prefixArgs: string[] } {
  if (prefixArgs.length > 0 || process.platform !== "win32" || command.toLowerCase() !== "codex") {
    return { command, prefixArgs };
  }
  const probe = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    timeout: 10_000
  });
  const output = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`.toLowerCase();
  if (probe.status === 0 && !output.includes("access is denied")) {
    return { command, prefixArgs };
  }
  return {
    command: "npx",
    prefixArgs: ["-y", "@openai/codex"]
  };
}

function buildCodexPrompt(request: StructuredGenerationRequest): string {
  return [
    "You are running as a bounded Tethermark audit harness agent.",
    "Return only the final structured JSON object requested by the provided schema. Do not edit files.",
    "",
    "System prompt:",
    request.systemPrompt,
    "",
    "User prompt:",
    request.userPrompt
  ].join("\n");
}

export class OpenAICodexCliProvider implements ModelProvider {
  readonly providerName = "openai_codex";
  private readonly resolvedCommand: string;
  private readonly resolvedPrefixArgs: string[];

  constructor(
    readonly modelName = readEnv("AUDIT_LLM_CODEX_MODEL") ?? readEnv("AUDIT_LLM_MODEL") ?? "gpt-5.1-codex",
    private readonly command = readEnv("AUDIT_LLM_CODEX_COMMAND") ?? readEnv("CODEX_COMMAND") ?? "codex",
    private readonly sandbox = readEnv("AUDIT_LLM_CODEX_SANDBOX") ?? "read-only",
    private readonly timeoutMs = readNumberEnv("AUDIT_LLM_CODEX_TIMEOUT_MS", 600_000),
    private readonly commandPrefixArgs: string[] = []
  ) {
    const resolved = resolveCodexCommand(this.command, this.commandPrefixArgs);
    this.resolvedCommand = resolved.command;
    this.resolvedPrefixArgs = resolved.prefixArgs;
  }

  async generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-codex-"));
    const schemaPath = path.join(tempDir, `${request.schemaName}.schema.json`);
    const outputPath = path.join(tempDir, `${request.schemaName}.result.json`);
    try {
      await fs.writeFile(schemaPath, JSON.stringify(request.schema, null, 2), "utf8");
      const args = [
        ...this.resolvedPrefixArgs,
        "exec",
        "--ephemeral",
        "--sandbox",
        this.sandbox,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath
      ];
      if (this.modelName) {
        args.push("--model", this.modelName);
      }
      const result = await runProcess(this.resolvedCommand, args, buildCodexPrompt(request), this.timeoutMs);
      if (result.exitCode !== 0) {
        throw new Error(`Codex CLI exited with code ${result.exitCode}. ${result.stderr || result.stdout}`.trim());
      }
      const rawText = await fs.readFile(outputPath, "utf8");
      return {
        provider: this.providerName,
        model: this.modelName,
        rawText,
        parsed: parseStructuredJson<T>(rawText),
        attempts: 1,
        usage: {
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
          estimated_cost_usd: null
        }
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

export class MockModelProvider implements ModelProvider {
  readonly providerName = "mock";

  constructor(readonly modelName = "mock-agent-runtime", private readonly responseFactory?: MockResponseFactory) {}

  async generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
    const payload = this.responseFactory ? this.responseFactory(request) : {};
    const rawText = JSON.stringify(payload);
    return {
      provider: this.providerName,
      model: this.modelName,
      rawText,
      parsed: parseStructuredJson<T>(rawText),
      attempts: 1,
      usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: null
      }
    };
  }
}

function inferMockPayload(request: StructuredGenerationRequest): unknown {
  const context = request.metadata?.context as Record<string, any> | undefined;
  const controlCatalog = (context?.controlCatalog ?? []) as Array<{ control_id: string; framework: string; static_assessable: boolean }>;
  const skepticFeedback = context?.skepticFeedback;
  const applicableControlIds = controlCatalog
    .filter((control) => control.framework !== "MITRE ATLAS" || context?.targetClass === "tool_using_multi_turn_agent" || context?.targetClass === "mcp_server_plugin_skill_package")
    .map((control) => control.control_id);
  const deferredControlIds = controlCatalog
    .filter((control) => !control.static_assessable && context?.request?.run_mode === "static")
    .map((control) => control.control_id);
  const nonApplicableControlIds = controlCatalog
    .filter((control) => control.framework === "OWASP Agentic Applications" && !(context?.targetClass === "tool_using_multi_turn_agent" || context?.targetClass === "mcp_server_plugin_skill_package"))
    .map((control) => control.control_id);

  switch (request.agentName) {
    case "planner_agent": {
      const correctedApplicable = [...new Set([
        ...applicableControlIds.filter((id) => !deferredControlIds.includes(id) && !nonApplicableControlIds.includes(id)),
        ...(((skepticFeedback?.actions ?? []).flatMap((action: any) => action.control_ids ?? [])).filter((id: string) => applicableControlIds.includes(id)))
      ])];
      return {
        selected_profile: context?.targetProfile?.semantic_review?.final_class === "tool_using_multi_turn_agent" || context?.targetProfile?.semantic_review?.final_class === "mcp_server_plugin_skill_package" ? "agentic_mcp_static_repo" : "static_oss_repo_security_review",
        classification_review: {
          semantic_class: context?.targetProfile?.semantic_review?.semantic_class ?? context?.targetClass ?? "repo_posture_only",
          final_class: context?.targetProfile?.semantic_review?.final_class ?? context?.targetClass ?? "repo_posture_only",
          secondary_traits: context?.targetProfile?.heuristic?.secondary_traits ?? [],
          confidence: context?.targetProfile?.semantic_review?.confidence ?? 0.7,
          evidence: context?.targetProfile?.semantic_review?.evidence ?? ["Mock planner reused curated target profile evidence."],
          override_reason: ""
        },
        frameworks_in_scope: [...new Set(controlCatalog.map((control) => control.framework))],
        applicable_control_ids: correctedApplicable,
        deferred_control_ids: deferredControlIds,
        non_applicable_control_ids: nonApplicableControlIds,
        rationale: skepticFeedback?.actions?.length
          ? ["Mock planner incorporated supervisor feedback actions conservatively."]
          : ["Mock planner selected standards and controls from the supplied catalog."],
        constraints: {
          max_runtime_minutes: 20,
          network_mode: context?.request?.endpoint_url ? "bounded_remote" : "bounded",
          sandbox_required: true,
          install_allowed: context?.request?.run_mode !== "static",
          read_only_analysis_only: context?.request?.run_mode === "static",
          target_execution_allowed: context?.request?.run_mode !== "static"
        }
      };
    }
    case "threat_model_agent":
      return {
        summary: {
          system_type: context?.targetClass ?? "repo_posture_only",
          stack_guess: context?.analysis?.frameworks ?? [],
          confidence: 0.64
        },
        assets: ["source code", "dependency manifests", "CI/CD workflows"],
        entry_points: context?.analysis?.entry_points ?? [],
        trust_boundaries: ["repository -> contributors", "workflow -> Git provider token", "application -> external services"],
        attack_surfaces: ["repository source tree", "workflow automation", "dependency resolution"],
        likely_abuse_cases: ["supply-chain tampering", "workflow token misuse", "tool misuse"],
        high_risk_components: ["workflow definitions", "evidence runner", "credential-bearing configs"],
        assumptions: ["Static run does not execute target code."],
        questions_for_reviewer: ["Are runtime-only controls deferred rather than treated as failed?"],
        framework_focus: ["OpenSSF Scorecard", "SLSA", "NIST SSDF"]
      };
    case "eval_selection_agent": {
      const selectedControlIds = context?.plannerArtifact?.applicable_control_ids ?? applicableControlIds;
      const selectedToolIds = Array.isArray(context?.request?.hints?.external_audit_tools?.included_tool_ids)
        ? new Set(["scorecard", ...context.request.hints.external_audit_tools.included_tool_ids])
        : null;
      const keepSelectedTools = (tools: string[]) => tools.filter((tool) => !selectedToolIds || selectedToolIds.has(tool));
      const controlToolMap = selectedControlIds.map((controlId: string) => ({
        control_id: controlId,
        tools: keepSelectedTools(controlId.includes("workflow") || controlId.includes("slsa") ? ["scorecard", "semgrep"] : controlId.includes("secret") ? ["trivy", "semgrep"] : ["scorecard", "trivy", "semgrep"]),
        rationale: ((skepticFeedback?.actions ?? []).length > 0) ? "Mock selector refreshed coverage after supervisor feedback." : "Mock selector mapped controls to bounded static tools."
      }));
      return {
        baseline_tools: ["repo_analysis", ...keepSelectedTools(["scorecard", "trivy", "semgrep"])],
        runtime_tools: context?.request?.run_mode === "static" ? [] : keepSelectedTools(["inspect"]),
        custom_eval_packs: ["static_core"],
        validation_candidates: [],
        control_tool_map: controlToolMap,
        rationale: [((skepticFeedback?.actions ?? []).length > 0) ? "Mock eval selector returned refreshed tool mappings after supervisor feedback." : "Mock eval selector returned bounded static tool mappings."]
      };
    }
    case "lane_specialist_agent":
      return {
        summary: ["Mock lane specialist summarized scoped evidence for the assigned lane."],
        observations: [
          {
            title: String(context?.plan?.lane_name ?? "lane") + " evidence posture",
            summary: "Mock lane specialist reviewed the compact lane bundle without introducing new unsupported findings.",
            evidence: ((context?.evidenceRecords ?? []) as Array<any>).slice(0, 3).map((item) => item.evidence_id ?? item.source_id ?? "evidence")
          }
        ]
      };
    case "audit_supervisor_agent":
      return {
        summary: {
          overall_evidence_sufficiency: "medium",
          overall_false_positive_risk: "medium",
          publication_safety_note: "Mock audit supervisor review. Human review still required."
        },
        grader_outputs: (context?.findings ?? []).map((finding: any) => ({
          finding_id: finding.finding_id,
          evidence_sufficiency: finding.source === "tool" ? "high" : "medium",
          false_positive_risk: finding.source === "tool" ? "low" : "medium",
          validation_recommendation: "no",
          reasoning_summary: "Mock supervisor review adjusted confidence based on source type and available evidence."
        })),
        actions: [],
        notes: ["Mock supervisor review found no additional corrective actions."]
      };
    case "remediation_agent":
      return {
        summary: "Mock remediation summary generated from current control failures and findings.",
        checklist: ["Address failed controls first.", "Prioritize credential exposure and CI/CD issues.", "Retest after remediation."],
        human_review_required: true
      };
    default:
      return {};
  }
}

export function resolveAgentProviderConfig(agentName: string, baseConfig: ProviderConfig = {}): ResolvedProviderConfig {
  const agentOverride = baseConfig.agentOverrides?.[agentName];
  const envProvider = readAgentEnv(agentName, "PROVIDER");
  const envModel = readAgentEnv(agentName, "MODEL");
  const agentApiKey = readAgentEnv(agentName, "API_KEY");

  const apiKey = agentOverride?.apiKey
    ?? baseConfig.apiKey
    ?? agentApiKey
    ?? readEnv("AUDIT_LLM_API_KEY")
    ?? readEnv("LLM_API_KEY")
    ?? readEnv("OPENAI_API_KEY")
    ?? undefined;

  let apiKeySource: ResolvedProviderConfig["apiKeySource"] = "none";
  if (agentOverride?.apiKey || baseConfig.apiKey) {
    apiKeySource = "request-level";
  } else if (agentApiKey) {
    apiKeySource = "agent-specific";
  } else if (readEnv("AUDIT_LLM_API_KEY")) {
    apiKeySource = "global-audit-llm";
  } else if (readEnv("LLM_API_KEY") || readEnv("OPENAI_API_KEY")) {
    apiKeySource = "global-generic";
  }

  const provider = (agentOverride?.provider ?? baseConfig.provider ?? envProvider ?? readEnv("AUDIT_LLM_PROVIDER") ?? (apiKey ? "openai" : "mock")) as "openai" | "openai_codex" | "mock";
  return {
    provider,
    model: agentOverride?.model ?? baseConfig.model ?? envModel ?? readEnv("AUDIT_LLM_MODEL") ?? undefined,
    apiKey,
    apiKeySource: provider === "openai_codex" ? "oauth-local" : apiKeySource
  };
}

export function createModelProvider(config: ProviderConfig = {}, agentName?: string): ModelProvider {
  const resolved = agentName ? resolveAgentProviderConfig(agentName, config) : resolveAgentProviderConfig("", config);
  if (resolved.provider === "openai") {
    const apiKey = resolved.apiKey;
    if (!apiKey) {
      throw new Error("A live provider-backed run requires an API key. Set LLM_API_KEY, AUDIT_LLM_API_KEY, or an agent-specific *_API_KEY value.");
    }
    return new OpenAIModelProvider(apiKey, resolved.model ?? "gpt-4.1");
  }

  if (resolved.provider === "openai_codex") {
    return new OpenAICodexCliProvider(resolved.model ?? undefined);
  }

  return new MockModelProvider(resolved.model ?? "mock-agent-runtime", inferMockPayload);
}
