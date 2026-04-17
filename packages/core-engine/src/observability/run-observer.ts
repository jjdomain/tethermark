import type { HarnessEvent, HarnessMetricSnapshot } from "../contracts.js";
import { createHarnessEvent } from "./events.js";
import { logHarnessEvent } from "./logger.js";
import { MetricsRecorder } from "./metrics.js";

export class RunObserver {
  readonly events: HarnessEvent[] = [];
  readonly metrics = new MetricsRecorder();

  constructor(private readonly runId: string) {}

  emit(args: {
    level: HarnessEvent["level"];
    stage: string;
    actor: string;
    eventType: string;
    status?: string;
    durationMs?: number;
    details?: Record<string, unknown>;
  }): HarnessEvent {
    const event = createHarnessEvent({
      runId: this.runId,
      level: args.level,
      stage: args.stage,
      actor: args.actor,
      eventType: args.eventType,
      status: args.status,
      durationMs: args.durationMs,
      details: args.details
    });
    this.events.push(event);
    logHarnessEvent(event);
    this.metrics.increment("events_total", 1, { level: event.level, stage: event.stage, event_type: event.event_type });
    return event;
  }

  async observeStage<T>(args: {
    stage: string;
    actor: string;
    details?: Record<string, unknown>;
    fn: () => Promise<T>;
  }): Promise<T> {
    const started = Date.now();
    this.emit({ level: "info", stage: args.stage, actor: args.actor, eventType: "stage_started", status: "running", details: args.details });
    try {
      const result = await args.fn();
      const durationMs = Date.now() - started;
      this.emit({ level: "info", stage: args.stage, actor: args.actor, eventType: "stage_completed", status: "success", durationMs, details: args.details });
      this.metrics.increment("stage_success_total", 1, { stage: args.stage });
      this.metrics.observe("stage_duration_ms", durationMs, { stage: args.stage });
      return result;
    } catch (error) {
      const durationMs = Date.now() - started;
      this.emit({ level: "error", stage: args.stage, actor: args.actor, eventType: "stage_failed", status: "failure", durationMs, details: { ...args.details, error: error instanceof Error ? error.message : String(error) } });
      this.metrics.increment("stage_failure_total", 1, { stage: args.stage });
      this.metrics.observe("stage_duration_ms", durationMs, { stage: args.stage });
      throw error;
    }
  }

  snapshotMetrics(): HarnessMetricSnapshot[] {
    return this.metrics.snapshot();
  }
}
