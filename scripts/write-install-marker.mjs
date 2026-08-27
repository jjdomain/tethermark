import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const installDir = readFlag("--install-dir");
const repo = readFlag("--repo");
const ref = readFlag("--ref");
const commit = readFlag("--commit");
if (!installDir || !repo || !ref || !commit) {
  throw new Error("install_marker_arguments_required");
}
if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("install_marker_commit_invalid");

const resolvedInstallDir = path.resolve(installDir);
const packageJson = JSON.parse(fs.readFileSync(path.join(resolvedInstallDir, "package.json"), "utf8"));
if (packageJson.name !== "tethermark") throw new Error("install_marker_package_mismatch");

function sanitizedRepository(value) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

const marker = {
  schema_version: "2026-08-27.install-marker.v1",
  repository: sanitizedRepository(repo),
  requested_ref: ref,
  commit_sha: commit.toLowerCase(),
  installed_at: new Date().toISOString()
};
fs.writeFileSync(path.join(resolvedInstallDir, ".tethermark-install.json"), `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
