import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadEnvironment } from "../dist/packages/core-engine/src/env.js";
import { executeEvidenceProvider } from "../dist/packages/core-engine/src/evidence-providers.js";

loadEnvironment();

const repoRoot = process.cwd();
const tempParent = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-static-adversarial-"));
const targetRoot = path.join(tempParent, "target");
const outsidePath = path.join(tempParent, "outside-secret.txt");
const evidencePath = path.join(repoRoot, ".artifacts", "phase4-static-scanner-fixtures.json");

function normalizedLocations(record) {
  const values = Array.isArray(record?.normalized?.locations) ? record.normalized.locations : [];
  return values.map((item) => String(item?.path ?? "").replace(/\\/g, "/")).filter(Boolean);
}

try {
  await fs.mkdir(path.join(targetRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(targetRoot, "nested-repository", ".git"), { recursive: true });
  await fs.writeFile(path.join(targetRoot, "src", "agent.js"), [
    "import { exec } from 'node:child_process';",
    "const api_key = 'fixture-secret-token-1234567890';",
    "exec(process.env.USER_CONTROLLED_COMMAND);",
    "// prompt injection controls must be explicit"
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "package.json"), "{ malformed-json: true,\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "nested-repository", ".git", "config"), "[core]\n\trepositoryformatversion = 0\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "nested-repository", "nested.py"), "password = 'nested-secret-1234567890'\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "--hostile [name] $.txt"), "token='hostile-file-secret-1234567890'\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "..%2fescape.txt"), "not a traversal\n", "utf8");
  await fs.writeFile(path.join(targetRoot, "binary.bin"), Buffer.from([0, 255, 1, 254, 2, 253, 0, 10]));
  await fs.writeFile(path.join(targetRoot, "large.txt"), "safe-large-line\n".repeat(131072), "utf8");
  await fs.writeFile(outsidePath, "api_key='outside-secret-should-not-be-scanned'\n", "utf8");

  let symlinkCreated = false;
  try {
    await fs.symlink(outsidePath, path.join(targetRoot, "outside-link.txt"), "file");
    symlinkCreated = true;
  } catch (error) {
    if (!error || !["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
  }

  const request = { local_path: targetRoot, run_mode: "static", audit_package: "deep-static", llm_provider: "mock" };
  const startedAt = new Date().toISOString();
  const semgrep = await executeEvidenceProvider({ providerId: "semgrep", request, rootPath: targetRoot, repoUrl: null });
  const trivy = await executeEvidenceProvider({ providerId: "trivy", request, rootPath: targetRoot, repoUrl: null });
  const finishedAt = new Date().toISOString();

  for (const record of [semgrep, trivy]) {
    assert.equal(record.status, "completed", `${record.provider_id} failed: ${record.summary}\n${record.stderr ?? ""}`);
    assert.equal(record.capability_status, "available");
    assert.ok(record.parsed && typeof record.parsed === "object", `${record.provider_id} did not return parsed JSON`);
    assert.ok(!normalizedLocations(record).some((value) => path.resolve(targetRoot, value).startsWith(path.resolve(tempParent)) && !path.resolve(targetRoot, value).startsWith(path.resolve(targetRoot))), `${record.provider_id} emitted evidence outside the target root`);
  }
  assert.ok(Number(semgrep.normalized?.signal_count ?? 0) >= 2, "Semgrep did not detect the deterministic secret and execution surfaces");

  const evidence = {
    schema_version: 1,
    started_at: startedAt,
    finished_at: finishedAt,
    platform: process.platform,
    arch: process.arch,
    fixture: {
      symlink_created: symlinkCreated,
      cases: ["symlink", "traversal-like filename", "large file", "binary file", "nested repository", "hostile filename", "secret-like content", "malformed manifest"]
    },
    scanners: [semgrep, trivy].map((record) => ({
      provider_id: record.provider_id,
      status: record.status,
      capability_status: record.capability_status,
      summary: record.summary,
      normalized: record.normalized,
      command: record.command
    }))
  };
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ passed: true, evidence_path: evidencePath, scanners: evidence.scanners.map((item) => ({ provider_id: item.provider_id, summary: item.summary })) }, null, 2));
} finally {
  await fs.rm(tempParent, { recursive: true, force: true });
}
