import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactRecord } from "./contracts.js";
import { createId, nowIso } from "./utils.js";

export class ArtifactStore {
  constructor(private readonly rootDir: string, private readonly groupByRunId = true) {}

  resolveRunDir(runId: string): string {
    return this.groupByRunId ? path.join(this.rootDir, runId) : this.rootDir;
  }

  private async writeArtifact(runId: string, type: string, filename: string, content: string): Promise<ArtifactRecord> {
    const runDir = this.resolveRunDir(runId);
    await fs.mkdir(runDir, { recursive: true });
    const filePath = path.join(runDir, filename);
    await fs.writeFile(filePath, content, "utf8");
    return {
      artifact_id: createId("artifact"),
      run_id: runId,
      type,
      path: filePath,
      created_at: nowIso()
    };
  }

  async writeJson(runId: string, type: string, payload: unknown): Promise<ArtifactRecord> {
    return this.writeArtifact(runId, type, `${type}.json`, `${JSON.stringify(payload, null, 2)}\n`);
  }

  async writeText(runId: string, type: string, filename: string, content: string): Promise<ArtifactRecord> {
    return this.writeArtifact(runId, type, filename, content);
  }
}
