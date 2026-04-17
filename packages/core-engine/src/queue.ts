import type { RunEnvelope } from "./contracts.js";
import { nowIso } from "./utils.js";

export class InMemoryJobQueue {
  private readonly runs = new Map<string, RunEnvelope>();

  add(run: RunEnvelope): RunEnvelope {
    this.runs.set(run.run_id, run);
    return run;
  }

  get(runId: string): RunEnvelope | undefined {
    return this.runs.get(runId);
  }

  update(runId: string, update: Partial<RunEnvelope>): RunEnvelope | undefined {
    const current = this.runs.get(runId);
    if (!current) return undefined;
    const next = { ...current, ...update, updated_at: nowIso() };
    this.runs.set(runId, next);
    return next;
  }

  list(): RunEnvelope[] {
    return [...this.runs.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
  }
}
