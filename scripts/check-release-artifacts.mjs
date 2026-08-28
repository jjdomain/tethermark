import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildReleaseArtifacts, parsePythonRequirementsLock, verifyReleaseArtifacts } from "./release-artifacts-lib.mjs";

const parsed = parsePythonRequirementsLock("example-package==1.2.3 \\\n    --hash=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
assert.deepEqual(parsed, [{ name: "example-package", version: "1.2.3", hashes: ["a".repeat(64)] }]);
assert.throws(() => parsePythonRequirementsLock("example==1.0.0\n"), /no SHA-256/);

const releaseWorkflow = await fs.readFile(path.join(process.cwd(), ".github", "workflows", "release-artifacts.yml"), "utf8");
assert.match(releaseWorkflow, /version="\$\(node -p 'require\("\.\/package\.json"\)\.version'\)"/);
assert.doesNotMatch(releaseWorkflow, /node -p \\"require/);

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-release-artifacts-"));
const first = path.join(temporaryRoot, "first");
const second = path.join(temporaryRoot, "second");
try {
  const firstBuild = await buildReleaseArtifacts({ outputPath: first, allowDirty: true });
  const secondBuild = await buildReleaseArtifacts({ outputPath: second, allowDirty: true });
  const firstVerification = await verifyReleaseArtifacts(first);
  const secondVerification = await verifyReleaseArtifacts(second);
  assert.deepEqual(firstVerification, secondVerification);
  assert.equal(firstVerification.python_component_count, 93);
  assert.equal(await fs.readFile(path.join(first, "SHA256SUMS"), "utf8"), await fs.readFile(path.join(second, "SHA256SUMS"), "utf8"));

  const archive = firstBuild.checksummed.find((item) => item.filename.endsWith("-source.zip"));
  assert.ok(archive);
  await fs.appendFile(path.join(first, archive.filename), "tamper", "utf8");
  await assert.rejects(() => verifyReleaseArtifacts(first), /SHA-256 mismatch/);
} finally {
  const resolved = path.resolve(temporaryRoot);
  const allowedPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(allowedPrefix) || !path.basename(resolved).startsWith("tethermark-release-artifacts-")) throw new Error("Refusing to remove an unexpected release-artifact test path.");
  await fs.rm(resolved, { recursive: true, force: true });
}

console.log("Release artifact reproducibility, SBOM coverage, checksum, and tamper checks passed.");
