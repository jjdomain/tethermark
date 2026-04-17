import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { cleanupEmbeddedJsonMirrors } from "./backfill.js";

const createdDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (createdDirs.length) {
    const dir = createdDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cleanupEmbeddedJsonMirrors dry run reports only legacy table mirrors", async () => {
  const rootDir = await makeTempDir("harness-cleanup-dry-");
  await fs.mkdir(path.join(rootDir, "runs"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "harness.sqlite"), "sqlite");
  await fs.writeFile(path.join(rootDir, "persistence-meta.json"), "{}\n");
  await fs.writeFile(path.join(rootDir, "runs.json"), "[]\n");
  await fs.writeFile(path.join(rootDir, "targets.json"), "[]\n");
  await fs.writeFile(path.join(rootDir, "metrics.json"), "[]\n");

  const summary = await cleanupEmbeddedJsonMirrors({ rootDir, dryRun: true });

  assert.equal(summary.dry_run, true);
  assert.deepEqual(summary.removed_files, ["metrics.json", "runs.json", "targets.json"]);
  assert.deepEqual(summary.kept_files, ["harness.sqlite", "persistence-meta.json", "runs"]);

  const remaining = (await fs.readdir(rootDir)).sort();
  assert.deepEqual(remaining, ["harness.sqlite", "metrics.json", "persistence-meta.json", "runs", "runs.json", "targets.json"]);
});

test("cleanupEmbeddedJsonMirrors removes only legacy table mirrors when not dry run", async () => {
  const rootDir = await makeTempDir("harness-cleanup-live-");
  await fs.mkdir(path.join(rootDir, "runs"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "harness.sqlite"), "sqlite");
  await fs.writeFile(path.join(rootDir, "persistence-meta.json"), "{}\n");
  await fs.writeFile(path.join(rootDir, "events.json"), "[]\n");
  await fs.writeFile(path.join(rootDir, "tool_executions.json"), "[]\n");

  const summary = await cleanupEmbeddedJsonMirrors({ rootDir, dryRun: false });

  assert.equal(summary.dry_run, false);
  assert.deepEqual(summary.removed_files, ["events.json", "tool_executions.json"]);
  assert.deepEqual(summary.kept_files, ["harness.sqlite", "persistence-meta.json", "runs"]);

  const remaining = (await fs.readdir(rootDir)).sort();
  assert.deepEqual(remaining, ["harness.sqlite", "persistence-meta.json", "runs"]);
});
