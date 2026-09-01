import path from "node:path";

import { verifyReleaseArtifacts } from "./release-artifacts-lib.mjs";

const args = process.argv.slice(2);
if (args.length > 1) throw new Error("Usage: npm run release:verify -- [artifact-directory]");
const directory = path.resolve(args[0] ?? path.join(process.cwd(), ".artifacts", "release"));
const result = await verifyReleaseArtifacts(directory);
console.log(JSON.stringify({ status: "verified", directory, ...result }, null, 2));
