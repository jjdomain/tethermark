import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_API_HOST,
  DEFAULT_WEB_UI_HOST,
  EXTERNAL_BIND_ACKNOWLEDGEMENT,
  enforceNetworkExposurePolicy,
  resolveNetworkExposureConfig
} from "../dist/apps/shared/src/network-exposure.js";

const rootDir = process.cwd();
const apiEntrypoint = path.resolve(rootDir, "dist/apps/api-server/src/index.js");
const webEntrypoint = path.resolve(rootDir, "dist/apps/web-ui/src/index.js");
const combinedEntrypoint = path.resolve(rootDir, "scripts/run-api-web.mjs");

function expectPolicyFailure(env, pattern, surfaces = ["api", "web-ui"]) {
  assert.throws(
    () => enforceNetworkExposurePolicy(resolveNetworkExposureConfig(env), surfaces),
    pattern
  );
}

function expectStartupFailure(entrypoint, envOverrides, pattern) {
  const result = spawnSync(process.execPath, [entrypoint], {
    cwd: rootDir,
    env: {
      ...process.env,
      HARNESS_API_HOST: "127.0.0.1",
      WEB_UI_HOST: "127.0.0.1",
      HARNESS_API_AUTH_MODE: "none",
      HARNESS_API_KEY: "",
      HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT: "",
      ...envOverrides
    },
    encoding: "utf8",
    timeout: 20_000
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.equal(result.signal, null, `startup check timed out or was killed:\n${output}`);
  assert.notEqual(result.status, 0, `unsafe startup unexpectedly succeeded:\n${output}`);
  assert.match(output, pattern);
}

const defaults = resolveNetworkExposureConfig({});
assert.equal(defaults.apiHost, DEFAULT_API_HOST);
assert.equal(defaults.webUiHost, DEFAULT_WEB_UI_HOST);
assert.deepEqual(enforceNetworkExposurePolicy(defaults).externallyBoundSurfaces, []);

const ipv6Loopback = resolveNetworkExposureConfig({ HARNESS_API_HOST: "[::1]", WEB_UI_HOST: "localhost" });
assert.deepEqual(enforceNetworkExposurePolicy(ipv6Loopback).externallyBoundSurfaces, []);

expectPolicyFailure({ HARNESS_API_HOST: "0.0.0.0" }, /HARNESS_API_AUTH_MODE=api_key/, ["api"]);
expectPolicyFailure({ WEB_UI_HOST: "0.0.0.0" }, /HARNESS_API_AUTH_MODE=api_key/, ["web-ui"]);
expectPolicyFailure({
  HARNESS_API_HOST: "0.0.0.0",
  HARNESS_API_AUTH_MODE: "api_key",
  HARNESS_API_KEY: "too-short",
  HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT: EXTERNAL_BIND_ACKNOWLEDGEMENT
}, /at least 32 characters/, ["api"]);
expectPolicyFailure({
  WEB_UI_HOST: "0.0.0.0",
  HARNESS_API_AUTH_MODE: "api_key",
  HARNESS_API_KEY: "a".repeat(32)
}, /HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT/, ["web-ui"]);
expectPolicyFailure({ HARNESS_API_HOST: "http://0.0.0.0:8787" }, /without a URL scheme/);
expectPolicyFailure({ HARNESS_API_HOST: "127.attacker.example" }, /HARNESS_API_AUTH_MODE=api_key/, ["api"]);

const explicitlyAllowed = enforceNetworkExposurePolicy(resolveNetworkExposureConfig({
  HARNESS_API_HOST: "0.0.0.0",
  WEB_UI_HOST: "::",
  HARNESS_API_AUTH_MODE: "api_key",
  HARNESS_API_KEY: "a".repeat(32),
  HARNESS_EXTERNAL_BIND_ACKNOWLEDGEMENT: EXTERNAL_BIND_ACKNOWLEDGEMENT
}));
assert.deepEqual(explicitlyAllowed.externallyBoundSurfaces, ["api", "web-ui"]);
assert.match(explicitlyAllowed.warning ?? "", /does not terminate TLS/);

expectStartupFailure(apiEntrypoint, { HARNESS_API_HOST: "0.0.0.0" }, /Refusing external api binding/);
expectStartupFailure(webEntrypoint, { WEB_UI_HOST: "0.0.0.0" }, /Refusing external web-ui binding/);
expectStartupFailure(combinedEntrypoint, { HARNESS_API_HOST: "0.0.0.0" }, /Refusing external api binding/);

console.log("Network exposure policy checks passed.");
