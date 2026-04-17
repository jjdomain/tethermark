import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SandboxSourceProvenance, SandboxStorageUsage } from "../../contracts.js";

const execFileAsync = promisify(execFile);
const SKIP_NAMES = new Set([".git", "node_modules", ".artifacts", ".npm-cache", ".legacy-js-archive", "dist", "build", "__pycache__", ".venv"]);

export async function cloneRepo(repoUrl: string, destination: string): Promise<string | null> {
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, destination], { maxBuffer: 8 * 1024 * 1024 });
  try {
    const { stdout } = await execFileAsync("git", ["-C", destination, "rev-parse", "HEAD"], { maxBuffer: 1024 * 1024 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readPackedRef(gitDir: string, refName: string): Promise<string | null> {
  try {
    const packed = await fs.readFile(path.join(gitDir, "packed-refs"), "utf8");
    const line = packed.split(/\r?\n/).find((entry) => entry && !entry.startsWith("#") && !entry.startsWith("^") && entry.endsWith(` ${refName}`));
    return line ? line.split(" ")[0] ?? null : null;
  } catch {
    return null;
  }
}

async function resolveGitDir(source: string): Promise<string | null> {
  try {
    const gitPath = path.join(path.resolve(source), ".git");
    const gitStat = await fs.stat(gitPath);
    if (gitStat.isDirectory()) {
      return gitPath;
    }
    const pointer = await fs.readFile(gitPath, "utf8");
    const match = pointer.match(/gitdir:\s*(.+)/i);
    return match?.[1] ? path.resolve(path.dirname(gitPath), match[1].trim()) : null;
  } catch {
    return null;
  }
}

function normalizeRepoUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.git$/i, "");
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/i);
  if (sshMatch) {
    return "https://" + sshMatch[1] + "/" + sshMatch[2].replace(/\.git$/i, "");
  }
  return null;
}

export async function inferGitCommitSha(source: string): Promise<string | null> {
  try {
    const gitDir = await resolveGitDir(source);
    if (!gitDir) return null;
    const head = (await fs.readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
    if (/^[a-f0-9]{40}$/i.test(head)) return head;
    const refMatch = head.match(/^ref:\s*(.+)$/i);
    if (!refMatch?.[1]) return null;
    const refName = refMatch[1].trim();
    try {
      const refValue = (await fs.readFile(path.join(gitDir, ...refName.split("/")), "utf8")).trim();
      return /^[a-f0-9]{40}$/i.test(refValue) ? refValue : null;
    } catch {
      return readPackedRef(gitDir, refName);
    }
  } catch {
    return null;
  }
}

export async function inferGitRepoUrl(source: string): Promise<string | null> {
  const gitDir = await resolveGitDir(source);
  if (!gitDir) return null;
  try {
    const config = await fs.readFile(path.join(gitDir, "config"), "utf8");
    const lines = config.split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
      const section = line.match(/^\s*\[(.+)\]\s*$/);
      if (section) {
        inOrigin = /remote\s+"origin"/i.test(section[1] ?? "");
        continue;
      }
      if (!inOrigin) continue;
      const match = line.match(/^\s*url\s*=\s*(.+)\s*$/i);
      if (match?.[1]) return normalizeRepoUrl(match[1]) ?? match[1].trim();
    }
  } catch {
    return null;
  }
  return null;
}

export async function mirrorDirectory(source: string, destination: string, sandboxRoot: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });

  async function visit(currentSource: string, currentDestination: string): Promise<void> {
    const entries = await fs.readdir(currentSource, { withFileTypes: true });
    await fs.mkdir(currentDestination, { recursive: true });

    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name)) {
        continue;
      }

      const sourcePath = path.join(currentSource, entry.name);
      const destinationPath = path.join(currentDestination, entry.name);
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDestination = path.resolve(destinationPath);

      if (resolvedSource.startsWith(path.resolve(sandboxRoot))) {
        continue;
      }

      if (!resolvedDestination.startsWith(path.resolve(destination))) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(resolvedSource, resolvedDestination);
      } else if (entry.isSymbolicLink()) {
        continue;
      } else {
        await fs.copyFile(resolvedSource, resolvedDestination);
      }
    }
  }

  await visit(path.resolve(source), path.resolve(destination));
}

export async function collectStorageUsage(rootDir: string): Promise<SandboxStorageUsage> {
  let targetBytes = 0;
  let targetFileCount = 0;

  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (!entry.isSymbolicLink()) {
        const stat = await fs.stat(absolute);
        targetBytes += stat.size;
        targetFileCount += 1;
      }
    }
  }

  await visit(rootDir);
  return { target_bytes: targetBytes, target_file_count: targetFileCount };
}

export function buildSourceProvenance(args: {
  repoUrl?: string;
  localPath?: string;
  endpointUrl?: string;
  commitSha?: string | null;
  upstreamRepoUrl?: string | null;
}): SandboxSourceProvenance {
  if (args.repoUrl) {
    return {
      source_type: "repo",
      source_value: args.repoUrl,
      commit_sha: args.commitSha ?? null,
      upstream_repo_url: args.repoUrl
    };
  }
  if (args.localPath) {
    return {
      source_type: "path",
      source_value: path.resolve(args.localPath),
      commit_sha: args.commitSha ?? null,
      upstream_repo_url: args.upstreamRepoUrl ?? null
    };
  }
  return {
    source_type: "endpoint",
    source_value: args.endpointUrl ?? "unknown-endpoint",
    commit_sha: null,
    upstream_repo_url: null
  };
}
