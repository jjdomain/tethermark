import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { AuditRequest } from "./contracts.js";

export type WebhookKind = "generic_signed" | "generic_unsigned" | "completion_unsigned";

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isLoopbackIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) return normalized.split(".")[0] === "127";
  if (isIP(normalized) === 6) return normalized === "::1" || normalized.startsWith("::ffff:127.");
  return false;
}

function isPrivateOrSpecialIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (isLoopbackIp(normalized)) return true;
  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    return parts[0] === 0
      || parts[0] === 10
      || parts[0] === 127
      || parts[0] >= 224
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 192 && parts[1] === 0 && parts[2] === 0)
      || (parts[0] === 192 && parts[1] === 0 && parts[2] === 2)
      || (parts[0] === 198 && parts[1] === 18)
      || (parts[0] === 198 && parts[1] === 19)
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  if (isIP(normalized) === 6) {
    return normalized === "::"
      || normalized.startsWith("::ffff:")
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:");
  }
  return true;
}

export function publicRepositoryUrl(value: string): string {
  const trimmed = value.trim();
  const scpMatch = trimmed.match(/^git@([^/:\s]+):([^\s]+)$/i);
  if (scpMatch) return `git@${scpMatch[1]}:${scpMatch[2]}`;
  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[invalid-repository-url]";
  }
}

export function assertSafeRepositoryUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || hasControlCharacters(trimmed) || trimmed.startsWith("-")) {
    throw new Error("repository_url_invalid");
  }
  const scpMatch = trimmed.match(/^git@([A-Za-z0-9.-]+):([^\s?#]+)$/);
  if (scpMatch) {
    if (!scpMatch[2] || scpMatch[2].startsWith("-") || scpMatch[2].split("/").includes("..")) {
      throw new Error("repository_url_invalid");
    }
    return trimmed;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("repository_url_invalid");
  }
  if (!(["https:", "ssh:"].includes(parsed.protocol)) || !parsed.hostname || parsed.hash || parsed.search) {
    throw new Error("repository_url_requires_https_or_ssh_without_query_or_fragment");
  }
  if (parsed.password || (parsed.protocol === "https:" && parsed.username) || (parsed.protocol === "ssh:" && parsed.username !== "git")) {
    throw new Error("repository_url_embedded_credentials_forbidden: use the local Git credential helper or SSH agent");
  }
  if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname.split("/").includes("..")) {
    throw new Error("repository_url_invalid");
  }
  return trimmed;
}

export function assertRequestSafeForDurableQueue(request: AuditRequest): AuditRequest {
  if (typeof request.llm_api_key === "string" && request.llm_api_key.length > 0) {
    throw new Error("async_inline_llm_api_key_forbidden: configure the provider key in the server environment instead of persisting it in a job request");
  }
  if (request.repo_url) assertSafeRepositoryUrl(request.repo_url);
  return request;
}

export function parseWebhookUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("webhook_url_invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error("webhook_url_must_be_http_without_credentials_query_or_fragment");
  }
  return parsed;
}

export function publicWebhookUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return "[invalid-webhook-url]";
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[invalid-webhook-url]";
  }
}

export async function assertSafeWebhookTarget(
  value: string,
  kind: WebhookKind,
  options: {
    allowPrivateNetwork?: boolean;
    lookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  } = {}
): Promise<string> {
  const parsed = parseWebhookUrl(value);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily > 0
    ? [{ address: hostname }]
    : await (options.lookup ?? (async (name) => dnsLookup(name, { all: true, verbatim: true })))(hostname);
  if (!addresses.length) throw new Error("webhook_hostname_unresolved");
  if (addresses.every((item) => isLoopbackIp(item.address))) return parsed.toString();

  if (kind === "completion_unsigned") {
    throw new Error("completion_webhook_must_be_loopback");
  }
  if (kind === "generic_unsigned") {
    throw new Error("unsigned_generic_webhook_must_be_loopback");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("remote_generic_webhook_requires_https");
  }

  if (!options.allowPrivateNetwork && addresses.some((item) => isPrivateOrSpecialIp(item.address))) {
    throw new Error("webhook_private_network_target_forbidden");
  }
  return parsed.toString();
}

export function redactUrlCredentials(value: string): string {
  return value.replace(/\b(https?|ssh):\/\/([^\s/@:]+)(?::[^\s/@]*)?@/gi, "$1://[redacted]@");
}
