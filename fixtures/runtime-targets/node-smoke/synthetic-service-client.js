import assert from "node:assert/strict";
import fs from "node:fs";

const serviceUrl = process.env.TETHERMARK_FAKE_SERVICE_URL;
const toolUrl = process.env.TETHERMARK_FAKE_TOOL_URL;
assert.equal(serviceUrl, "http://tethermark-fake-service:8081");
assert.equal(toolUrl, "http://tethermark-fake-service:8081/tool");

const secret = await fetch(`${serviceUrl}/secret`).then((response) => response.json());
assert.deepEqual(secret, { value: "tm_fake_runtime_validation_only", synthetic: true });

const tool = await fetch(toolUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "bounded-test" })
}).then((response) => response.json());
assert.equal(tool.ok, true);
assert.equal(tool.tool, "synthetic_echo");

fs.writeFileSync("/artifacts/synthetic-client-result.json", JSON.stringify({ secret, tool }));
