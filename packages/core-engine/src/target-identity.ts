import path from "node:path";

import { createStableId } from "./utils.js";

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalizeLocalPath(value: string): string {
  return normalizeSlashes(path.resolve(value)).toLowerCase();
}

function stripTrailingRepoSuffix(value: string): string {
  return value.replace(/\/+$/, "").replace(/\.git$/i, "");
}

function normalizeRepoPathname(value: string): string {
  return stripTrailingRepoSuffix(value)
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
    .join("/");
}

export function normalizeRepoUrl(value: string): string {
  const trimmed = value.trim();
  const sshMatch = trimmed.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/]([^?#]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const host = sshMatch[1]?.toLowerCase() ?? "";
    const repoPath = normalizeRepoPathname(sshMatch[2] ?? "");
    return repoPath ? `${host}/${repoPath}` : host;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port && !((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80"))
      ? `:${parsed.port}`
      : "";
    const repoPath = normalizeRepoPathname(parsed.pathname);
    return repoPath ? `${host}${port}/${repoPath}` : `${host}${port}`;
  } catch {
    return normalizeRepoPathname(trimmed);
  }
}

export function normalizeEndpointUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const sortedParams = [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
    parsed.search = sortedParams.length ? `?${new URLSearchParams(sortedParams).toString()}` : "";
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" && !parsed.search ? "" : parsed.toString().endsWith("/") ? "" : parsed.toString());
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export function deriveCanonicalTargetId(args: {
  targetType?: string | null;
  repoUrl?: string | null;
  localPath?: string | null;
  endpointUrl?: string | null;
  snapshotValue?: string | null;
  fallbackTargetId?: string | null;
}): string {
  const normalizedRepoUrl = args.repoUrl ? normalizeRepoUrl(args.repoUrl) : null;
  if (normalizedRepoUrl) {
    return createStableId("target", `repo:${normalizedRepoUrl}`);
  }

  const normalizedEndpoint = args.endpointUrl
    ? normalizeEndpointUrl(args.endpointUrl)
    : args.targetType === "endpoint" && args.snapshotValue
      ? normalizeEndpointUrl(args.snapshotValue)
      : null;
  if (normalizedEndpoint) {
    return createStableId("target", `endpoint:${normalizedEndpoint}`);
  }

  const normalizedLocalPath = args.localPath
    ? normalizeLocalPath(args.localPath)
    : args.snapshotValue
      ? normalizeLocalPath(args.snapshotValue)
      : null;
  if (normalizedLocalPath) {
    return createStableId("target", `path:${normalizedLocalPath}`);
  }

  return args.fallbackTargetId ?? createStableId("target", "unknown");
}

export function deriveCanonicalTargetName(args: {
  targetType?: string | null;
  repoUrl?: string | null;
  localPath?: string | null;
  endpointUrl?: string | null;
  snapshotValue?: string | null;
  fallbackName?: string | null;
}): string {
  if (args.repoUrl) {
    const repoName = normalizeRepoUrl(args.repoUrl).split("/").filter(Boolean).at(-1);
    if (repoName) return repoName;
  }
  if (args.endpointUrl || args.targetType === "endpoint") {
    return args.endpointUrl ? normalizeEndpointUrl(args.endpointUrl) : args.fallbackName ?? "endpoint";
  }
  const localBasis = args.localPath ?? args.snapshotValue ?? args.fallbackName ?? "target";
  return path.basename(String(localBasis));
}
