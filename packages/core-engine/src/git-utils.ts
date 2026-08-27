import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertSafeRepositoryUrl, redactUrlCredentials } from "./security-boundaries.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

export type GitTlsMode = "default" | "windows_schannel";

export interface GitRunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  env?: Record<string, string | undefined>;
}

export interface GitRepoAccessResult {
  ok: boolean;
  tls_mode: GitTlsMode | null;
  summary: string;
  details?: string;
}

export function gitArgs(args: string[], tlsMode: GitTlsMode): string[] {
  if (tlsMode !== "windows_schannel") return args;
  return ["-c", "http.sslBackend=schannel", "-c", "http.sslCAInfo=", ...args];
}

function gitProcessEnvironment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const allowed = [
    "PATH", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TMP", "TEMP", "TMPDIR",
    "SSH_AUTH_SOCK", "GIT_SSH", "GIT_ASKPASS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM",
    "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY", "SSL_CERT_FILE", "GIT_SSL_CAINFO",
    "LANG", "LC_ALL"
  ];
  return {
    ...Object.fromEntries(allowed.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]])),
    GIT_TERMINAL_PROMPT: "0",
    ...overrides
  };
}

export async function runGit(args: string[], tlsMode: GitTlsMode = "default", options: GitRunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", gitArgs(args, tlsMode), {
    maxBuffer: options.maxBuffer ?? GIT_MAX_BUFFER,
    timeout: options.timeoutMs,
    env: gitProcessEnvironment(options.env)
  });
}

export function gitErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const err = error as { message?: unknown; stdout?: unknown; stderr?: unknown; signal?: unknown; code?: unknown };
  return [err.message, err.stdout, err.stderr, err.signal ? `signal=${String(err.signal)}` : "", err.code ? `code=${String(err.code)}` : ""]
    .filter((item) => typeof item === "string" && item)
    .join("\n");
}

export function isGitTlsCertificateError(error: unknown): boolean {
  return /SSL certificate problem|unable to get local issuer certificate|certificate verify failed|schannel:.*certificate/i.test(gitErrorText(error));
}

export function isSshGitUrl(repoUrl: string): boolean {
  return /^(?:git@|ssh:\/\/git@)/i.test(repoUrl.trim());
}

function summarizeGitAccessFailure(repoUrl: string, error: unknown): string {
  const details = gitErrorText(error);
  if (/timed out|signal=SIGTERM|ETIMEDOUT/i.test(details)) {
    return "Repository access check timed out. Verify network access and that Git can reach the remote non-interactively.";
  }
  if (isGitTlsCertificateError(error)) {
    return "Repository access failed because Git could not validate the TLS certificate chain.";
  }
  if (isSshGitUrl(repoUrl)) {
    return "SSH repository access failed. Configure the local SSH key, agent, and host trust, then verify `git ls-remote` works non-interactively.";
  }
  if (/Authentication failed|could not read Username|terminal prompts disabled|Repository not found|not found|access denied|Permission denied/i.test(details)) {
    return "Repository access failed. Configure local Git credentials or confirm the repository exists and this operator is authorized.";
  }
  return "Repository access failed. Verify the URL, network access, and local Git credentials.";
}

export async function checkGitRepoAccess(repoUrl: string, timeoutMs = 20000): Promise<GitRepoAccessResult> {
  const trimmed = assertSafeRepositoryUrl(repoUrl);
  const env = isSshGitUrl(trimmed)
    ? { GIT_SSH_COMMAND: "ssh -o BatchMode=yes" }
    : undefined;
  const args = ["ls-remote", "--exit-code", "--", trimmed, "HEAD"];
  try {
    await runGit(args, "default", { timeoutMs, maxBuffer: 1024 * 1024, env });
    return { ok: true, tls_mode: "default", summary: "Repository is accessible with local Git credentials." };
  } catch (error) {
    const shouldRetryWithWindowsTrust = process.platform === "win32" && !isSshGitUrl(trimmed) && isGitTlsCertificateError(error);
    if (!shouldRetryWithWindowsTrust) {
      return { ok: false, tls_mode: null, summary: summarizeGitAccessFailure(trimmed, error), details: redactUrlCredentials(gitErrorText(error)) };
    }
    try {
      await runGit(args, "windows_schannel", { timeoutMs, maxBuffer: 1024 * 1024 });
      return { ok: true, tls_mode: "windows_schannel", summary: "Repository is accessible with local Git credentials using the Windows certificate store." };
    } catch (retryError) {
      return {
        ok: false,
        tls_mode: "windows_schannel",
        summary: `Repository access failed after retrying with the Windows certificate store. ${summarizeGitAccessFailure(trimmed, retryError)}`,
        details: redactUrlCredentials(gitErrorText(retryError))
      };
    }
  }
}
