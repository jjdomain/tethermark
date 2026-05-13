import fs from "node:fs/promises";
import path from "node:path";

import type { AuditRequest, SandboxSession } from "../../contracts.js";
import { createId } from "../../utils.js";
import { buildSourceProvenance, cloneRepo, collectStorageUsage, inferGitRepoUrl, mirrorDirectory, resolvePinnedCheckoutRef } from "./shared.js";

export class LinuxStaticSandboxBackend {
  constructor(private readonly rootDir: string) {}

  async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
    const runMode = request.run_mode ?? "static";
    if (runMode !== "static") {
      throw new Error("linux-static sandbox backend currently supports static mode only. Containerized build/runtime/validate backends still need implementation.");
    }

    const sandboxId = createId("sandbox");
    const sandboxRoot = path.join(this.rootDir, runId);
    const targetDir = path.join(sandboxRoot, "target");

    await fs.mkdir(sandboxRoot, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    let commitSha: string | null = null;
    let upstreamRepoUrl: string | null = request.repo_url ?? null;
    if (request.repo_url) {
      commitSha = await cloneRepo(request.repo_url, targetDir, resolvePinnedCheckoutRef(request.hints));
    } else if (request.local_path) {
      upstreamRepoUrl = await inferGitRepoUrl(request.local_path);
      await mirrorDirectory(path.resolve(request.local_path), targetDir, sandboxRoot);
    }

    const storageUsage = await collectStorageUsage(targetDir);

    return {
      sandbox_id: sandboxId,
      backend: "linux-static",
      platform: process.platform,
      root_dir: sandboxRoot,
      target_dir: targetDir,
      run_mode: runMode,
      enforcement_notes: [
        "Linux static sandbox backend.",
        "Clone or copy occurs in a dedicated per-run workspace before analysis.",
        "Containerized build, runtime, and validation execution are not implemented yet in this backend.",
        "Symlinks are skipped during mirror and analysis preparation."
      ],
      command_policy: {
        allow_install_commands: false,
        allow_target_execution: false,
        allow_network_egress: false,
        allowed_command_prefixes: ["git clone --depth 1", "git rev-parse HEAD"],
        blocked_command_patterns: ["npm install", "pip install", "docker run", "docker compose", "python app.py", "node server.js"]
      },
      source_provenance: buildSourceProvenance({ repoUrl: request.repo_url, localPath: request.local_path, endpointUrl: request.endpoint_url, commitSha, upstreamRepoUrl }),
      storage_usage: storageUsage
    };
  }
}
