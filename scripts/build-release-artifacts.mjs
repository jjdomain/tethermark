import path from "node:path";

import { buildReleaseArtifacts } from "./release-artifacts-lib.mjs";

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

const args = process.argv.slice(2);
const known = new Set(["--output", "--tag", "--allow-dirty"]);
for (let index = 0; index < args.length; index += 1) {
  if (!known.has(args[index])) throw new Error(`Unknown release artifact option: ${args[index]}`);
  if (args[index] !== "--allow-dirty") index += 1;
}

const result = await buildReleaseArtifacts({
  outputPath: valueAfter(args, "--output") ? path.resolve(valueAfter(args, "--output")) : undefined,
  releaseTag: valueAfter(args, "--tag") ?? undefined,
  allowDirty: args.includes("--allow-dirty")
});
console.log(JSON.stringify({
  status: "built",
  output_path: result.outputPath,
  version: result.manifest.version,
  release_tag: result.manifest.release_tag,
  revision_sha: result.manifest.revision_sha,
  artifacts: result.checksummed.map(({ filename, sha256, bytes }) => ({ filename, sha256, bytes }))
}, null, 2));
