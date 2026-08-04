import type { HandoffRecord } from "../../handoff-contracts/src/index.js";
import { createModelProvider, ProviderPolicyError, resolveAgentProviderConfig, type ProviderConfig, type ProviderPolicyDecision } from "../../llm-provider/src/index.js";
import { PROMPTS } from "../../prompt-registry/src/index.js";
import { beginInvocation, createHandoff, finishInvocation, type AgentInvocationRecord } from "../../trace-recorder/src/index.js";
import type { AgentConfigSummary } from "../../core-engine/src/contracts.js";

export interface AgentRuntimeArtifacts {
  invocations: AgentInvocationRecord[];
  handoffs: HandoffRecord[];
  configSummary: AgentConfigSummary[];
  providerPolicy: ProviderPolicyDecision[];
}

export interface AgentCallResult<T> {
  artifact: T;
  invocation: AgentInvocationRecord;
}

export class AgentRuntime {
  readonly artifacts: AgentRuntimeArtifacts = {
    invocations: [],
    handoffs: [],
    configSummary: [],
    providerPolicy: []
  };

  private requestCount = 0;
  private tokenCount = 0;

  constructor(private readonly providerConfig: ProviderConfig = {}) {}

  get totalRequestCount(): number {
    return this.requestCount;
  }

  setRunBudget(maxRequests: number, maxTokens: number): void {
    this.providerConfig.maxRequests = this.providerConfig.maxRequests == null ? maxRequests : Math.min(this.providerConfig.maxRequests, maxRequests);
    this.providerConfig.maxTokens = this.providerConfig.maxTokens == null ? maxTokens : Math.min(this.providerConfig.maxTokens, maxTokens);
  }

  async callAgent<T>(params: {
    runId: string;
    agentName: keyof typeof PROMPTS;
    context: unknown;
    inputArtifacts: string[];
    outputArtifact: string;
    stageName?: string;
    laneName?: string | null;
  }): Promise<AgentCallResult<T>> {
    const prompt = PROMPTS[params.agentName];
    const resolved = resolveAgentProviderConfig(params.agentName, this.providerConfig);
    if (this.requestCount >= resolved.policyDecision.max_requests) {
      throw new ProviderPolicyError("provider_request_budget_exhausted", `Run request ${this.requestCount + 1} exceeds the ${resolved.policyDecision.max_requests} request budget.`);
    }
    if (this.tokenCount >= resolved.policyDecision.max_tokens) {
      throw new ProviderPolicyError("provider_token_budget_exhausted", `Run token usage ${this.tokenCount} reached the ${resolved.policyDecision.max_tokens} token budget.`);
    }
    let requestIndex: number | null = null;
    if (!this.artifacts.providerPolicy.some((item) => item.provider === resolved.policyDecision.provider && item.model === resolved.policyDecision.model)) {
      this.artifacts.providerPolicy.push({ ...resolved.policyDecision });
    }
    const provider = createModelProvider(this.providerConfig, params.agentName);
    if (!this.artifacts.configSummary.find((item) => item.agent_name === params.agentName)) {
      this.artifacts.configSummary.push({
        agent_name: params.agentName,
        provider: provider.providerName,
        model: provider.modelName,
        api_key_source: resolved.apiKeySource,
        workload_class: resolved.policyDecision.workload_class,
        credential_class: resolved.policyDecision.credential_class,
        initiation_mode: resolved.policyDecision.initiation_mode,
        max_requests: resolved.policyDecision.max_requests,
        max_tokens: resolved.policyDecision.max_tokens
      });
    }

    const userPrompt = prompt.buildUserPrompt(params.context);
    const contextBytes = Buffer.byteLength(JSON.stringify(params.context), "utf8");
    const userPromptBytes = Buffer.byteLength(userPrompt, "utf8");
    const seed = beginInvocation(
      params.runId,
      params.agentName,
      params.inputArtifacts,
      params.outputArtifact,
      { contextBytes, userPromptBytes },
      { stageName: params.stageName ?? null, laneName: params.laneName ?? null }
    );

    try {
      const result = await provider.generateStructured<T>({
        agentName: params.agentName,
        schemaName: prompt.schemaName,
        schema: prompt.schema,
        systemPrompt: prompt.systemPrompt,
        userPrompt,
        metadata: { context: params.context },
        temperature: 0.2,
        maxRetries: resolved.policyDecision.max_retries,
        maxOutputTokens: Math.max(1, Math.min(16_384, resolved.policyDecision.max_tokens - this.tokenCount)),
        beforeAttempt: () => {
          const nextRequestIndex = this.requestCount + 1;
          if (nextRequestIndex > resolved.policyDecision.max_requests) {
            throw new ProviderPolicyError("provider_request_budget_exhausted", `Run request ${nextRequestIndex} exceeds the ${resolved.policyDecision.max_requests} request budget.`);
          }
          this.requestCount = nextRequestIndex;
          requestIndex ??= nextRequestIndex;
        }
      });

      if (result.usage?.total_tokens == null && resolved.policyDecision.provider !== "mock") {
        throw new ProviderPolicyError(
          "provider_usage_unavailable",
          `${resolved.policyDecision.provider} did not return auditable token usage; the run was stopped before another model request.`
        );
      }
      this.tokenCount += result.usage?.total_tokens ?? 0;
      if (this.tokenCount > resolved.policyDecision.max_tokens) {
        throw new ProviderPolicyError("provider_token_budget_exhausted", `Run token usage ${this.tokenCount} exceeded the ${resolved.policyDecision.max_tokens} token budget.`);
      }

      const invocation = finishInvocation(seed, {
        provider: result.provider,
        model: result.model,
        status: "success",
        attempts: result.attempts,
        workloadClass: resolved.policyDecision.workload_class,
        credentialClass: resolved.policyDecision.credential_class,
        initiationMode: resolved.policyDecision.initiation_mode,
        requestIndex: requestIndex ?? this.requestCount + 1,
        terminalReason: "completed",
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
        totalTokens: result.usage?.total_tokens ?? null,
        estimatedCostUsd: result.usage?.estimated_cost_usd ?? null
      });
      this.artifacts.invocations.push(invocation);
      return { artifact: result.parsed, invocation };
    } catch (error) {
      const invocation = finishInvocation(seed, {
        provider: provider.providerName,
        model: provider.modelName,
        status: "failure",
        attempts: 1,
        workloadClass: resolved.policyDecision.workload_class,
        credentialClass: resolved.policyDecision.credential_class,
        initiationMode: resolved.policyDecision.initiation_mode,
        requestIndex: requestIndex ?? this.requestCount + 1,
        terminalReason: error instanceof ProviderPolicyError ? error.code : "provider_error"
      });
      this.artifacts.invocations.push(invocation);
      throw error;
    }
  }

  handoff(runId: string, fromAgent: string, toAgent: keyof typeof PROMPTS, reason: string, artifacts: string[]): HandoffRecord {
    const record = createHandoff(runId, fromAgent, toAgent, reason, artifacts);
    this.artifacts.handoffs.push(record);
    return record;
  }
}
