import { isIP } from "node:net";

export const DEFAULT_API_HOST = "127.0.0.1";
export const DEFAULT_WEB_UI_HOST = "127.0.0.1";
export const EXTERNAL_BIND_ACKNOWLEDGEMENT = "I_UNDERSTAND_TETHERMARK_WILL_BE_NETWORK_ACCESSIBLE";

export type NetworkSurface = "api" | "web-ui";

export interface NetworkExposureConfig {
  apiHost: string;
  webUiHost: string;
  authMode: string;
  apiKeyLength: number;
  acknowledgement: string;
}

export interface EnforcedNetworkExposure {
  config: NetworkExposureConfig;
  externallyBoundSurfaces: NetworkSurface[];
  warning: string | null;
}

function normalizeHost(value: string | undefined, fallback: string, envName: string): string {
  let host = (value ?? fallback).trim();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host || host.includes("://") || /[\s/\\?#]/.test(host)) {
    throw new Error(`${envName} must be a hostname or IP address without a URL scheme, path, or port.`);
  }

  if (isIP(host) === 0) {
    if (host.length > 253 || !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*\.?$/.test(host)) {
      throw new Error(`${envName} is not a valid hostname or IP address.`);
    }
    host = host.replace(/\.$/, "");
  }
  return host;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "localhost") return true;
  const family = isIP(normalized);
  if (family === 4) return normalized.split(".")[0] === "127";
  if (family === 6) return normalized === "::1" || normalized.startsWith("::ffff:127.");
  return false;
}

export function formatHostForUrl(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

export function resolveNetworkExposureConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): NetworkExposureConfig {
  return {
    apiHost: normalizeHost(env.HARNESS_API_HOST, DEFAULT_API_HOST, "HARNESS_API_HOST"),
    webUiHost: normalizeHost(env.WEB_UI_HOST, DEFAULT_WEB_UI_HOST, "WEB_UI_HOST"),
    authMode: (env.HARNESS_API_AUTH_MODE ?? "none").trim().toLowerCase(),
    apiKeyLength: (env.HARNESS_API_KEY ?? "").length,
    acknowledgement: (env.HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT ?? "").trim()
  };
}

export function enforceNetworkExposurePolicy(
  config: NetworkExposureConfig,
  surfaces: readonly NetworkSurface[] = ["api", "web-ui"]
): EnforcedNetworkExposure {
  const externallyBoundSurfaces = surfaces.filter((surface) => {
    const host = surface === "api" ? config.apiHost : config.webUiHost;
    return !isLoopbackHost(host);
  });

  if (externallyBoundSurfaces.length === 0) {
    return { config, externallyBoundSurfaces: [], warning: null };
  }

  const names = externallyBoundSurfaces.join(" and ");
  if (config.authMode !== "api_key") {
    throw new Error(`Refusing external ${names} binding: set HARNESS_API_AUTH_MODE=api_key.`);
  }
  if (config.apiKeyLength < 32) {
    throw new Error(`Refusing external ${names} binding: HARNESS_API_KEY must contain at least 32 characters.`);
  }
  if (config.acknowledgement !== EXTERNAL_BIND_ACKNOWLEDGEMENT) {
    throw new Error(
      `Refusing external ${names} binding: set HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT=${EXTERNAL_BIND_ACKNOWLEDGEMENT} after reviewing the network-exposure warning.`
    );
  }

  return {
    config,
    externallyBoundSurfaces,
    warning: `WARNING: ${names} will accept non-loopback traffic. API-key authentication is enforced, but Tethermark does not terminate TLS; use a trusted TLS reverse proxy and firewall.`
  };
}
