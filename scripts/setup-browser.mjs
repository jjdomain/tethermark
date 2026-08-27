import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { repoRoot, verifyBrowserLock } from "./toolchain-integrity.mjs";

const args = process.argv.slice(2);
const allowedBrowsers = new Set(["chromium", "firefox", "webkit"]);
let dryRun = false;
let confirmed = false;
let withDeps = false;
let allBrowsers = false;
const selected = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--yes") confirmed = true;
  else if (arg === "--with-deps") withDeps = true;
  else if (arg === "--all") allBrowsers = true;
  else if (arg === "--browser") selected.push(args[++index]);
  else throw new Error(`Unknown browser setup option: ${arg}`);
}
if (selected.some((name) => !allowedBrowsers.has(name))) {
  throw new Error(`Unsupported browser selection. Expected chromium, firefox, or webkit.`);
}

const lock = verifyBrowserLock();
const browsers = allBrowsers ? [...allowedBrowsers] : selected.length ? [...new Set(selected)] : lock.browser.default_browsers;
const cli = path.join(repoRoot, "node_modules", "playwright", "cli.js");
const commandArgs = [cli, "install", ...(withDeps ? ["--with-deps"] : []), ...(!confirmed || dryRun ? ["--dry-run"] : []), ...browsers];
console.log("Tethermark browser bootstrap");
console.log(`Policy: Playwright ${lock.browser.package_version}; manifest sha256:${lock.browser.manifest_sha256}`);
console.log(`Browsers: ${browsers.join(", ")}`);
console.log(`+ ${process.execPath} ${commandArgs.join(" ")}`);
const result = spawnSync(process.execPath, commandArgs, { cwd: repoRoot, env: process.env, stdio: "inherit", shell: false });
if (result.error || result.status !== 0) throw new Error(`Playwright browser setup failed: ${result.error?.message ?? `exit ${result.status}`}`);
if (!confirmed || dryRun) {
  console.log("Browser setup preview complete; no browser files were changed. Re-run with --yes after review.");
  process.exit(0);
}

const playwright = await import("playwright");
for (const name of browsers) {
  const browser = await playwright[name].launch({ headless: true });
  try {
    const actualVersion = browser.version();
    const expectedVersion = lock.browser.revisions[name].browser_version;
    if (actualVersion !== expectedVersion) throw new Error(`${name} version mismatch: expected ${expectedVersion}, received ${actualVersion}`);
    console.log(`Verified ${name} ${actualVersion} by launching the installed browser.`);
  } finally {
    await browser.close();
  }
}
