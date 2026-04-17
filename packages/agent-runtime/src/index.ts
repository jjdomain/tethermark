import type { HandoffRecord } from "../../handoff-contracts/src/index.js";
import { createModelProvider, resolveAgentProviderConfig, type ProviderConfig } from "../../llm-provider/src/index.js";
import { PROMPTS } from "../../prompt-registry/src/index.js";
import { beginInvocation, createHandoff, finishInvocation, type AgentInvocationRecord } from "../../trace-recorder/src/index.js";
import type { AgentConfigSummary } from "../../core-engine/src/contracts.js";

export interface AgentRuntimeArtifacts {
  invocations: AgentInvocationRecord[];
  handoffs: HandoffRecord[];
  configSummary: AgentConfigSummary[];
}

export interface AgentCallResult<T> {
  artifact: T;
  invocation: AgentInvocationRecord;
}

export class AgentRuntime {
  readonly artifacts: AgentRuntimeArtifacts = {
    invocations: [],
    handoffs: [],
    configSummary: []
  };

  constructor(private readonly providerConfig: ProviderConfig = {}) {}

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
    const provider = createModelProvider(this.providerConfig, params.agentName);
    if (!this.artifacts.configSummary.find((item) => item.agent_name === params.agentName)) {
      this.artifacts.configSummary.push({
        agent_name: params.agentName,
        provider: provider.providerName,
        model: provider.modelName,
        api_key_source: resolved.apiKeySource
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
        maxRetries: 2
      });

      const invocation = finishInvocation(seed, {
        provider: result.provider,
        model: result.model,
        status: "success",
        attempts: result.attempts,
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
        attempts: 1
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
