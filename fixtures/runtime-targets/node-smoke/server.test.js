import assert from "node:assert/strict";
import test from "node:test";

test("runtime smoke fixture executes in the isolated workspace", () => {
  assert.equal(process.env.CI, "1");
  assert.equal(process.getuid?.(), 65532);
});
