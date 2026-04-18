import assert from "node:assert/strict";

import { readGoldenExports, refreshGoldenExports, buildGoldenExports } from "./export-golden.js";

async function run(): Promise<void> {
  const command = process.argv[2] ?? "check";
  if (command === "refresh") {
    await refreshGoldenExports();
    console.log("Refreshed export-golden fixtures.");
    return;
  }
  if (command !== "check") {
    throw new Error(`Unsupported export maintenance command: ${command}`);
  }
  const expected = await readGoldenExports();
  const generated = buildGoldenExports();
  assert.equal(JSON.stringify(generated.executiveJson, null, 2), expected.executiveJson, "Executive summary JSON fixture drifted.");
  assert.equal(generated.executiveMarkdown, expected.executiveMarkdown, "Executive summary Markdown fixture drifted.");
  assert.equal(JSON.stringify(generated.sarif, null, 2), expected.sarif, "SARIF fixture drifted.");
  console.log("Export schemas and golden snapshots are current.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
