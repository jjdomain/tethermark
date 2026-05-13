import fs from "node:fs/promises";
import path from "node:path";

import type { AuditRequest, SandboxSession } from "../../contracts.js";
import { createId } from "../../utils.js";
import { buildSourceProvenance, cloneRepo, collectStorageUsage, inferGitCommitSha, inferGitRepoUrl, mirrorDirectory, resolvePinnedCheckoutRef } from "./shared.js";

export class WindowsLocalStaticSandboxBackend {
  constructor(private readonly rootDir: string) {}

  async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
    const runMode = request.run_mode ?? "static";
    if (runMode !== "static") {
      throw new Error("windows-local-static sandbox backend only supports static mode.");
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
      commitSha = await inferGitCommitSha(request.local_path);
      await mirrorDirectory(path.resolve(request.local_path), targetDir, sandboxRoot);
    }

    const storageUsage = await collectStorageUsage(targetDir);

    return {
      sandbox_id: sandboxId,
      backend: "windows-local-static",
      platform: process.platform,
      root_dir: sandboxRoot,
      target_dir: targetDir,
      run_mode: runMode,
      enforcement_notes: [
        "Static-mode sandbox only.",
        "Target install, build, runtime execution, and validation are blocked in this backend.",
        "Repository content is copied or cloned into a dedicated per-run workspace before analysis.",
        "Symlinks are skipped during mirror and analysis preparation."
      ],
      command_policy: {
        allow_install_commands: false,
        allow_target_execution: false,
        allow_network_egress: false,
        allowed_command_prefixes: ["git clone --depth 1", "git rev-parse HEAD"],
        blocked_command_patterns: ["npm install", "pip install", "docker run", "python app.py", "node server.js"]
      },
      source_provenance: buildSourceProvenance({ repoUrl: request.repo_url, localPath: request.local_path, endpointUrl: request.endpoint_url, commitSha, upstreamRepoUrl }),
      storage_usage: storageUsage
    };
  }
}
