import type { HarnessEvent } from "../contracts.js";
import { createId, nowIso } from "../utils.js";

export function createHarnessEvent(args: {
  runId: string;
  level: HarnessEvent["level"];
  stage: string;
  actor: string;
  eventType: string;
  status?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}): HarnessEvent {
  return {
    event_id: createId("evt"),
    run_id: args.runId,
    timestamp: nowIso(),
    level: args.level,
    stage: args.stage,
    actor: args.actor,
    event_type: args.eventType,
    status: args.status,
    duration_ms: args.durationMs,
    details: args.details
  };
}

export function formatEventJsonl(events: HarnessEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}
