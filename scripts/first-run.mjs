import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const supported = new Set(["--dry-run", "--no-onboard", "--skip-doctor", "--skip-fixtures"]);
for (const arg of args) {
  if (!supported.has(arg)) throw new Error(`Unknown first-run option: ${arg}`);
}

const dryRun = args.has("--dry-run");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function printable(command, commandArgs) {
  return [command, ...commandArgs].map((item) => /\s/.test(item) ? JSON.stringify(item) : item).join(" ");
}

function run(command, commandArgs) {
  console.log(`+ ${printable(command, commandArgs)}`);
  if (dryRun) return;
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status ?? "unknown"}`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22 && nodeMajor !== 24) {
  throw new Error(`Unsupported Node.js ${process.versions.node}. Tethermark first-run requires Node.js 22.x or 24.x.`);
}

console.log("Tethermark reproducible first run");
console.log(`Workspace: ${repoRoot}`);
console.log(`Node.js: ${process.versions.node}`);
run(npmCommand, ["ci"]);
run(npmCommand, ["run", "build", "--silent"]);

if (!args.has("--no-onboard")) {
  const onboardArgs = [path.join(repoRoot, "dist", "apps", "cli", "src", "index.js"), "onboard"];
  if (args.has("--skip-doctor")) onboardArgs.push("--skip-doctor");
  if (args.has("--skip-fixtures")) onboardArgs.push("--skip-fixtures");
  run(process.execPath, onboardArgs);
}

console.log(dryRun
  ? "First-run dry run complete; no files or dependencies were changed."
  : "First-run setup complete. Review doctor warnings before running a production audit.");
