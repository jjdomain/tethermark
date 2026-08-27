import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digestPattern = /^[a-f0-9]{64}$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drifted: expected ${expected}, received ${actual ?? "missing"}`);
}

export function readToolchainLock() {
  const lock = readJson(path.join(repoRoot, "scripts", "toolchain-lock.json"));
  requireEqual(lock.schema_version, "2026-08-27.toolchain-lock.v1", "toolchain lock schema");
  return lock;
}

export function verifyBrowserLock() {
  const lock = readToolchainLock();
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const packageLock = readJson(path.join(repoRoot, "package-lock.json"));
  const browserManifestPath = path.join(repoRoot, "node_modules", "playwright-core", "browsers.json");
  if (!fs.existsSync(browserManifestPath)) throw new Error("Playwright browser manifest is unavailable; run npm ci first.");

  requireEqual(packageJson.devDependencies?.playwright, lock.browser.package_version, "package.json Playwright version");
  const playwrightPackage = packageLock.packages?.["node_modules/playwright"];
  const playwrightCorePackage = packageLock.packages?.["node_modules/playwright-core"];
  requireEqual(playwrightPackage?.version, lock.browser.package_version, "package-lock Playwright version");
  requireEqual(playwrightPackage?.integrity, lock.browser.package_integrity, "package-lock Playwright integrity");
  requireEqual(playwrightCorePackage?.version, lock.browser.package_version, "package-lock Playwright Core version");
  requireEqual(playwrightCorePackage?.integrity, lock.browser.core_package_integrity, "package-lock Playwright Core integrity");

  const manifestBytes = fs.readFileSync(browserManifestPath);
  const manifestDigest = createHash("sha256").update(manifestBytes).digest("hex");
  requireEqual(manifestDigest, lock.browser.manifest_sha256, "Playwright browser manifest SHA-256");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  for (const [name, expected] of Object.entries(lock.browser.revisions)) {
    const actual = manifest.browsers?.find((item) => item.name === name);
    if (!actual) throw new Error(`Playwright browser manifest is missing ${name}.`);
    requireEqual(actual.revision, expected.revision, `${name} revision`);
    requireEqual(actual.browserVersion ?? null, expected.browser_version, `${name} browser version`);
  }
  return lock;
}

export async function verifyToolchainLock() {
  const lock = verifyBrowserLock();
  const staticPolicyUrl = pathToFileURL(path.join(repoRoot, "dist", "packages", "core-engine", "src", "static-tool-policy.js")).href;
  const runtimePolicyUrl = pathToFileURL(path.join(repoRoot, "dist", "packages", "validation-runner", "src", "index.js")).href;
  const runtimeFixtureUrl = pathToFileURL(path.join(repoRoot, "dist", "apps", "cli", "src", "runtime-fixtures.js")).href;
  const { STATIC_TOOL_POLICIES } = await import(staticPolicyUrl);
  const { LOCAL_RUNTIME_IMAGES } = await import(runtimePolicyUrl);
  const { RUNTIME_FIXTURE_IMAGE } = await import(runtimeFixtureUrl);

  for (const [tool, expectedVersion] of Object.entries(lock.static_tools)) {
    const policy = STATIC_TOOL_POLICIES[tool];
    if (!policy) throw new Error(`Static tool policy is missing ${tool}.`);
    requireEqual(policy.pinned_version, expectedVersion, `${tool} production pin`);
    const checksums = [...policy.release_assets.map((asset) => asset.sha256), ...(policy.package_sha256 ?? [])];
    if (!checksums.length || checksums.some((digest) => !digestPattern.test(digest))) {
      throw new Error(`${tool} does not have a complete SHA-256 allowlist.`);
    }
  }

  for (const [name, expectedImage] of Object.entries(lock.runtime_images)) {
    requireEqual(LOCAL_RUNTIME_IMAGES[name], expectedImage, `${name} runtime image`);
    if (!/@sha256:[a-f0-9]{64}$/.test(expectedImage)) throw new Error(`${name} runtime image is not digest pinned.`);
  }
  requireEqual(RUNTIME_FIXTURE_IMAGE, lock.runtime_images.alpine, "runtime readiness fixture image");
  return lock;
}
