import fs from "node:fs/promises";
import path from "node:path";

import type { AuditRequest, RunStatus, TargetKind } from "./contracts.js";
import { nowIso } from "./utils.js";

export interface RunRegistryEntry {
  run_id: string;
  artifact_dir: string;
  request_output_dir: string | null;
  target_kind: TargetKind;
  run_mode: NonNullable<AuditRequest["run_mode"]>;
  status: RunStatus;
  created_at: string;
  updated_at: string;
}

function defaultRegistryPath(): string {
  return path.resolve(process.cwd(), ".artifacts", "run-index.json");
}

async function readRegistry(registryPath: string): Promise<Record<string, RunRegistryEntry>> {
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    return JSON.parse(raw) as Record<string, RunRegistryEntry>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function registerRunArtifactLocation(params: {
  runId: string;
  artifactDir: string;
  request: AuditRequest;
  status: RunStatus;
  registryPath?: string;
}): Promise<RunRegistryEntry> {
  const registryPath = path.resolve(params.registryPath ?? defaultRegistryPath());
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  const registry = await readRegistry(registryPath);
  const previous = registry[params.runId];
  const entry: RunRegistryEntry = {
    run_id: params.runId,
    artifact_dir: path.resolve(params.artifactDir),
    request_output_dir: params.request.output_dir ? path.resolve(params.request.output_dir) : null,
    target_kind: params.request.repo_url ? "repo" : params.request.local_path ? "path" : "endpoint",
    run_mode: params.request.run_mode ?? "static",
    status: params.status,
    created_at: previous?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
  registry[params.runId] = entry;
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return entry;
}

export async function getRunArtifactLocation(runId: string, registryPath?: string): Promise<RunRegistryEntry | null> {
  const registry = await readRegistry(path.resolve(registryPath ?? defaultRegistryPath()));
  return registry[runId] ?? null;
}

export async function listRunArtifactLocations(registryPath?: string): Promise<RunRegistryEntry[]> {
  const registry = await readRegistry(path.resolve(registryPath ?? defaultRegistryPath()));
  return Object.values(registry);
}
