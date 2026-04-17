import type { HandoffRecord } from "../../handoff-contracts/src/index.js";
import { createId, nowIso } from "../../core-engine/src/utils.js";

export interface AgentInvocationRecord {
  agent_call_id: string;
  run_id: string;
  stage_name?: string | null;
  lane_name?: string | null;
  agent_name: string;
  model_provider: string;
  model_name: string;
  input_artifacts: string[];
  output_artifact: string;
  status: "success" | "failure";
  started_at: string;
  completed_at: string;
  attempts: number;
  context_bytes?: number;
  user_prompt_bytes?: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
}

export function beginInvocation(
  runId: string,
  agentName: string,
  inputArtifacts: string[],
  outputArtifact: string,
  usage?: { contextBytes?: number; userPromptBytes?: number },
  ownership?: { stageName?: string | null; laneName?: string | null }
): Pick<AgentInvocationRecord, "agent_call_id" | "run_id" | "stage_name" | "lane_name" | "agent_name" | "input_artifacts" | "output_artifact" | "started_at" | "context_bytes" | "user_prompt_bytes"> {
  return {
    agent_call_id: createId("call"),
    run_id: runId,
    stage_name: ownership?.stageName ?? null,
    lane_name: ownership?.laneName ?? null,
    agent_name: agentName,
    input_artifacts: inputArtifacts,
    output_artifact: outputArtifact,
    started_at: nowIso(),
    context_bytes: usage?.contextBytes,
    user_prompt_bytes: usage?.userPromptBytes
  };
}

export function finishInvocation(
  seed: Pick<AgentInvocationRecord, "agent_call_id" | "run_id" | "stage_name" | "lane_name" | "agent_name" | "input_artifacts" | "output_artifact" | "started_at" | "context_bytes" | "user_prompt_bytes">,
  details: {
    provider: string;
    model: string;
    status: "success" | "failure";
    attempts: number;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    estimatedCostUsd?: number | null;
  }
): AgentInvocationRecord {
  return {
    ...seed,
    model_provider: details.provider,
    model_name: details.model,
    status: details.status,
    attempts: details.attempts,
    completed_at: nowIso(),
    prompt_tokens: details.promptTokens ?? null,
    completion_tokens: details.completionTokens ?? null,
    total_tokens: details.totalTokens ?? null,
    estimated_cost_usd: details.estimatedCostUsd ?? null
  };
}

export function createHandoff(runId: string, fromAgent: string, toAgent: string, reason: string, artifacts: string[]): HandoffRecord {
  return {
    handoff_id: createId("handoff"),
    run_id: runId,
    from_agent: fromAgent,
    to_agent: toAgent,
    reason,
    artifacts
  };
}
