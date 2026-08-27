import assert from "node:assert/strict";

import { assertSafeArchiveListing } from "../dist/apps/cli/src/archive-security.js";
import { sanitizeLogValue } from "../dist/packages/core-engine/src/observability/logger.js";
import {
  assertRequestSafeForDurableQueue,
  assertSafeRepositoryUrl,
  assertSafeWebhookTarget,
  publicRepositoryUrl,
  publicWebhookUrl
} from "../dist/packages/core-engine/src/security-boundaries.js";

assert.equal(assertSafeRepositoryUrl("https://github.com/example/repo.git"), "https://github.com/example/repo.git");
assert.equal(assertSafeRepositoryUrl("git@github.com:example/repo.git"), "git@github.com:example/repo.git");
assert.equal(publicRepositoryUrl("https://operator:secret@example.com/repo.git?token=secret#main"), "https://example.com/repo.git");
assert.equal(publicWebhookUrl("https://operator:secret@example.com/events?token=secret#private"), "https://example.com/events");
assert.throws(() => assertSafeRepositoryUrl("http://example.com/repo.git"), /requires_https_or_ssh/);
assert.throws(() => assertSafeRepositoryUrl("https://operator:secret@example.com/repo.git"), /embedded_credentials_forbidden/);
assert.throws(() => assertSafeRepositoryUrl("https://example.com/repo.git?token=secret"), /requires_https_or_ssh/);
assert.throws(() => assertRequestSafeForDurableQueue({
  local_path: ".",
  llm_provider: "openai",
  llm_api_key: "must-not-persist"
}), /async_inline_llm_api_key_forbidden/);

assert.equal(
  await assertSafeWebhookTarget("http://127.0.0.1:8787/callback", "completion_unsigned"),
  "http://127.0.0.1:8787/callback"
);
assert.equal(
  await assertSafeWebhookTarget("http://[::1]:8787/callback", "completion_unsigned"),
  "http://[::1]:8787/callback"
);
assert.equal(
  await assertSafeWebhookTarget("http://localhost:8787/callback", "completion_unsigned", {
    lookup: async () => [{ address: "127.0.0.1" }, { address: "::1" }]
  }),
  "http://localhost:8787/callback"
);
await assert.rejects(() => assertSafeWebhookTarget("http://localhost:8787/callback", "completion_unsigned", {
  lookup: async () => [{ address: "127.0.0.1" }, { address: "93.184.216.34" }]
}), /must_be_loopback/);
const publicLookup = async () => [{ address: "93.184.216.34" }];
await assert.rejects(() => assertSafeWebhookTarget("https://hooks.example.com/callback", "completion_unsigned", { lookup: publicLookup }), /must_be_loopback/);
await assert.rejects(() => assertSafeWebhookTarget("https://hooks.example.com/callback", "generic_unsigned", { lookup: publicLookup }), /must_be_loopback/);
await assert.rejects(() => assertSafeWebhookTarget("http://hooks.example.com/callback", "generic_signed", { lookup: publicLookup }), /requires_https/);
await assert.rejects(() => assertSafeWebhookTarget("https://hooks.example.com/callback?token=secret", "generic_signed"), /without_credentials_query_or_fragment/);
assert.equal(
  await assertSafeWebhookTarget("https://hooks.example.com/callback", "generic_signed", {
    lookup: async () => [{ address: "93.184.216.34" }]
  }),
  "https://hooks.example.com/callback"
);
await assert.rejects(() => assertSafeWebhookTarget("https://hooks.example.com/callback", "generic_signed", {
  lookup: async () => [{ address: "169.254.169.254" }]
}), /private_network_target_forbidden/);
await assert.rejects(() => assertSafeWebhookTarget("https://[::ffff:10.0.0.1]/callback", "generic_signed"), /private_network_target_forbidden/);

assert.doesNotThrow(() => assertSafeArchiveListing("tool\nLICENSE\n", "-rwxr-xr-x user group 1 Jan 1 tool\n"));
assert.throws(() => assertSafeArchiveListing("../../outside\n"), /archive_entry_path_unsafe/);
assert.throws(() => assertSafeArchiveListing("C:\\outside.exe\n"), /archive_entry_path_unsafe/);
assert.throws(() => assertSafeArchiveListing("tool\n", "lrwxrwxrwx user group 1 Jan 1 tool -> ../../outside\n"), /archive_link_entry_forbidden/);
assert.throws(() => assertSafeArchiveListing("tool\n", "   hrw-r--r-- user group 1 Jan 1 tool link to outside\n"), /archive_link_entry_forbidden/);

const sanitized = sanitizeLogValue({
  nested: { api_key: "secret-value", safe: "kept" },
  message: "request failed for https://operator:password@example.com/path; token=secret-value"
});
assert.deepEqual(sanitized.nested, { api_key: "[redacted]", safe: "kept" });
assert.doesNotMatch(JSON.stringify(sanitized), /secret-value|operator:password/);

console.log("Security boundary checks passed.");
