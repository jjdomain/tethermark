import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 128 * 1024 * 1024;
export const RELEASE_ARTIFACT_SCHEMA = "2026-08-28.release-artifacts.v1";
export const RELEASE_SBOM_GENERATOR_VERSION = "2026-08-28.v1";

async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      timeout: options.timeoutMs ?? 5 * 60_000
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const detail = (stderr || error?.message || String(error)).split(/\r?\n/).filter(Boolean).slice(-10).join("\n").slice(0, 2_000);
    throw new Error(`${path.basename(command)} failed: ${detail}`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function stableJson(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  return sha256Buffer(await fs.readFile(filePath));
}

function uuidFromSha256(digest) {
  const chars = digest.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizePythonName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

export function parsePythonRequirementsLock(contents) {
  const packages = [];
  let current = null;
  for (const line of String(contents).split(/\r?\n/)) {
    const requirement = line.match(/^([A-Za-z0-9_.-]+)==([^\s\\]+)(?:\s*;\s*(.+?))?\s*\\?$/);
    if (requirement) {
      current = { name: normalizePythonName(requirement[1]), version: requirement[2], hashes: [] };
      if (requirement[3]) current.environment_marker = requirement[3].trim();
      packages.push(current);
      continue;
    }
    const hash = line.match(/^\s*--hash=sha256:([a-f0-9]{64})(?:\s*\\)?$/i);
    if (hash && current) current.hashes.push(hash[1].toLowerCase());
  }
  if (!packages.length) throw new Error("Python requirements lock contains no pinned packages.");
  const seen = new Set();
  for (const item of packages) {
    const id = `${item.name}@${item.version}`;
    if (seen.has(id)) throw new Error(`Python requirements lock repeats ${id}.`);
    if (!item.hashes.length) throw new Error(`Python requirement ${id} has no SHA-256 hashes.`);
    seen.add(id);
    item.hashes.sort();
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

async function resolveNpmInvocation() {
  const bundled = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const npmCli = process.env.npm_execpath || await fs.access(bundled).then(() => bundled).catch(() => null);
  if (process.platform === "win32" && !npmCli) throw new Error("npm CLI entrypoint is unavailable; invoke through npm run release:artifacts.");
  return npmCli ? { command: process.execPath, prefix: [npmCli] } : { command: "npm", prefix: [] };
}

async function generateCombinedSbom(repoRoot, packageName, packageVersion, revision, commitTimestamp) {
  const npm = await resolveNpmInvocation();
  const result = await run(npm.command, [
    ...npm.prefix,
    "sbom",
    "--package-lock-only",
    "--sbom-format", "cyclonedx",
    "--sbom-type", "application"
  ], { cwd: repoRoot });
  let sbom;
  try {
    sbom = JSON.parse(result.stdout);
  } catch {
    throw new Error("npm sbom did not emit valid JSON.");
  }
  if (sbom?.bomFormat !== "CycloneDX" || sbom?.specVersion !== "1.5" || !Array.isArray(sbom.components) || !Array.isArray(sbom.dependencies)) {
    throw new Error("npm sbom did not emit the expected CycloneDX 1.5 structure.");
  }
  const generatedRootRef = sbom.metadata?.component?.["bom-ref"];
  const npmRootRef = `${packageName}@${packageVersion}`;
  sbom.metadata.component.name = packageName;
  sbom.metadata.component.version = packageVersion;
  sbom.metadata.component.purl = `pkg:npm/${packageName}@${packageVersion}`;
  sbom.metadata.component["bom-ref"] = npmRootRef;
  const generatedRootDependency = sbom.dependencies.find((item) => item.ref === generatedRootRef);
  if (!generatedRootDependency) throw new Error("CycloneDX root dependency graph is missing.");
  generatedRootDependency.ref = npmRootRef;

  const requirementsPath = path.join(repoRoot, "workers", "python", "requirements.lock");
  const pyproject = JSON.parse(JSON.stringify({ name: "audit-workers", version: packageVersion }));
  const pyprojectContents = await fs.readFile(path.join(repoRoot, "workers", "python", "pyproject.toml"), "utf8");
  const workerName = pyprojectContents.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? pyproject.name;
  const workerVersion = pyprojectContents.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? pyproject.version;
  const pythonPackages = parsePythonRequirementsLock(await fs.readFile(requirementsPath, "utf8"));
  const workerRef = `pkg:pypi/${normalizePythonName(workerName)}@${workerVersion}`;
  const pythonRefs = pythonPackages.map((item) => `pkg:pypi/${item.name}@${encodeURIComponent(item.version)}`);

  sbom.components.push({
    "bom-ref": workerRef,
    type: "application",
    name: workerName,
    version: workerVersion,
    purl: workerRef,
    properties: [{ name: "tethermark:source-lock", value: "workers/python/requirements.lock" }]
  });
  for (let index = 0; index < pythonPackages.length; index += 1) {
    const item = pythonPackages[index];
    sbom.components.push({
      "bom-ref": pythonRefs[index],
      type: "library",
      name: item.name,
      version: item.version,
      purl: pythonRefs[index],
      hashes: item.hashes.map((content) => ({ alg: "SHA-256", content })),
      properties: [
        { name: "tethermark:source-lock", value: "workers/python/requirements.lock" },
        ...(item.environment_marker ? [{ name: "tethermark:pypi:environment-marker", value: item.environment_marker }] : [])
      ]
    });
  }

  const rootRef = sbom.metadata?.component?.["bom-ref"];
  const rootDependency = sbom.dependencies.find((item) => item.ref === rootRef);
  if (!rootRef || !rootDependency || !Array.isArray(rootDependency.dependsOn)) throw new Error("CycloneDX root dependency graph is incomplete.");
  rootDependency.dependsOn = [...new Set([...rootDependency.dependsOn, workerRef])].sort();
  sbom.dependencies.push({ ref: workerRef, dependsOn: pythonRefs });
  for (const ref of pythonRefs) sbom.dependencies.push({ ref, dependsOn: [] });

  sbom.components.sort((left, right) => String(left["bom-ref"]).localeCompare(String(right["bom-ref"])));
  for (const dependency of sbom.dependencies) dependency.dependsOn = [...new Set(dependency.dependsOn ?? [])].sort();
  sbom.dependencies.sort((left, right) => String(left.ref).localeCompare(String(right.ref)));
  sbom.metadata.timestamp = commitTimestamp;
  sbom.metadata.tools = [{ vendor: "Tethermark", name: "release-artifacts", version: RELEASE_SBOM_GENERATOR_VERSION }];
  sbom.metadata.properties = [
    { name: "tethermark:git:revision", value: revision },
    { name: "tethermark:lock:npm", value: "package-lock.json" },
    { name: "tethermark:lock:python", value: "workers/python/requirements.lock" }
  ];
  delete sbom.serialNumber;
  const serialDigest = sha256Buffer(stableJson(sbom));
  sbom.serialNumber = `urn:uuid:${uuidFromSha256(serialDigest)}`;
  return canonical(sbom);
}

function validateVersion(value) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new Error(`Unsupported package version ${value}.`);
}

async function ensureEmptyOutput(outputPath) {
  await fs.mkdir(outputPath, { recursive: true });
  const entries = await fs.readdir(outputPath);
  if (entries.length) throw new Error(`Release artifact output directory must be empty: ${outputPath}`);
}

async function artifactRecord(filePath, mediaType) {
  const stat = await fs.stat(filePath);
  return { filename: path.basename(filePath), media_type: mediaType, bytes: stat.size, sha256: await sha256File(filePath) };
}

export async function buildReleaseArtifacts(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputPath = path.resolve(options.outputPath ?? path.join(repoRoot, ".artifacts", "release"));
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  validateVersion(packageJson.version);

  const status = (await run("git", ["status", "--porcelain"], { cwd: repoRoot })).stdout.trim();
  if (status && !options.allowDirty) throw new Error("Release artifacts require a clean checkout. Commit or remove working-tree changes first.");
  const revision = (await run("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error("Unable to resolve a full Git revision.");
  const commitTimestamp = new Date((await run("git", ["show", "-s", "--format=%cI", "HEAD"], { cwd: repoRoot })).stdout.trim()).toISOString();
  const releaseTag = options.releaseTag ?? process.env.TETHERMARK_RELEASE_TAG ?? null;
  if (releaseTag) {
    const expected = `v${packageJson.version}`;
    if (releaseTag !== expected) throw new Error(`Release tag ${releaseTag} must exactly match package version tag ${expected}.`);
    const tagRevision = (await run("git", ["rev-list", "-n", "1", releaseTag], { cwd: repoRoot })).stdout.trim();
    if (tagRevision !== revision) throw new Error(`Release tag ${releaseTag} does not resolve to HEAD ${revision}.`);
  }

  await ensureEmptyOutput(outputPath);
  const baseName = `tethermark-ce-${packageJson.version}`;
  const prefix = `${baseName}/`;
  const archiveSpecs = [
    { filename: `${baseName}-source.zip`, format: "zip", mediaType: "application/zip" },
    { filename: `${baseName}-source.tar.gz`, format: "tar.gz", mediaType: "application/gzip" }
  ];
  for (const archive of archiveSpecs) {
    await run("git", ["archive", `--format=${archive.format}`, `--prefix=${prefix}`, `--output=${path.join(outputPath, archive.filename)}`, "HEAD"], { cwd: repoRoot });
  }

  const sbomFilename = `${baseName}.cdx.json`;
  const sbomPath = path.join(outputPath, sbomFilename);
  const sbom = await generateCombinedSbom(repoRoot, packageJson.name, packageJson.version, revision, commitTimestamp);
  await fs.writeFile(sbomPath, stableJson(sbom), { encoding: "utf8", mode: 0o600 });

  const sourceArtifacts = [];
  for (const archive of archiveSpecs) sourceArtifacts.push(await artifactRecord(path.join(outputPath, archive.filename), archive.mediaType));
  const sbomArtifact = await artifactRecord(sbomPath, "application/vnd.cyclonedx+json");
  const manifest = {
    schema_version: RELEASE_ARTIFACT_SCHEMA,
    product: "Tethermark Community Edition",
    package_name: packageJson.name,
    version: packageJson.version,
    release_tag: releaseTag,
    revision_sha: revision,
    source_date: commitTimestamp,
    archive_prefix: prefix,
    locks: {
      npm: { filename: "package-lock.json", sha256: await sha256File(path.join(repoRoot, "package-lock.json")) },
      python: { filename: "workers/python/requirements.lock", sha256: await sha256File(path.join(repoRoot, "workers", "python", "requirements.lock")) }
    },
    sbom: { filename: sbomFilename, format: "CycloneDX", spec_version: "1.5", component_count: sbom.components.length },
    artifacts: [...sourceArtifacts, sbomArtifact]
  };
  const manifestFilename = "release-manifest.json";
  const manifestPath = path.join(outputPath, manifestFilename);
  await fs.writeFile(manifestPath, stableJson(manifest), { encoding: "utf8", mode: 0o600 });
  const manifestArtifact = await artifactRecord(manifestPath, "application/json");
  const checksummed = [...sourceArtifacts, sbomArtifact, manifestArtifact].sort((left, right) => left.filename.localeCompare(right.filename));
  await fs.writeFile(path.join(outputPath, "SHA256SUMS"), `${checksummed.map((item) => `${item.sha256}  ${item.filename}`).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

  return { outputPath, manifest, checksummed };
}

function parseChecksumManifest(contents) {
  const entries = [];
  const names = new Set();
  for (const line of String(contents).split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/i);
    if (!match) throw new Error(`Malformed SHA256SUMS line: ${line.slice(0, 120)}`);
    if (names.has(match[2])) throw new Error(`Duplicate SHA256SUMS entry: ${match[2]}`);
    names.add(match[2]);
    entries.push({ sha256: match[1].toLowerCase(), filename: match[2] });
  }
  if (!entries.length) throw new Error("SHA256SUMS contains no entries.");
  return entries;
}

export async function verifyReleaseArtifacts(directory) {
  const outputPath = path.resolve(directory);
  const manifest = JSON.parse(await fs.readFile(path.join(outputPath, "release-manifest.json"), "utf8"));
  if (manifest?.schema_version !== RELEASE_ARTIFACT_SCHEMA) throw new Error("Release manifest schema is unsupported.");
  validateVersion(manifest.version);
  if (!/^[a-f0-9]{40}$/i.test(manifest.revision_sha ?? "")) throw new Error("Release manifest revision is invalid.");
  if (manifest.release_tag !== null && manifest.release_tag !== `v${manifest.version}`) throw new Error("Release manifest tag/version mismatch.");
  const baseName = `tethermark-ce-${manifest.version}`;
  const expectedNames = new Set([
    `${baseName}-source.zip`,
    `${baseName}-source.tar.gz`,
    `${baseName}.cdx.json`,
    "release-manifest.json"
  ]);
  const checksums = parseChecksumManifest(await fs.readFile(path.join(outputPath, "SHA256SUMS"), "utf8"));
  if (checksums.length !== expectedNames.size || checksums.some((item) => !expectedNames.has(item.filename))) throw new Error("SHA256SUMS does not contain the exact release artifact set.");
  for (const entry of checksums) {
    const actual = await sha256File(path.join(outputPath, entry.filename));
    if (actual !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.filename}.`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) throw new Error("Release manifest artifact list is incomplete.");
  for (const artifact of manifest.artifacts) {
    const checksum = checksums.find((item) => item.filename === artifact.filename);
    const stat = await fs.stat(path.join(outputPath, artifact.filename));
    if (!checksum || checksum.sha256 !== artifact.sha256 || stat.size !== artifact.bytes) throw new Error(`Release manifest metadata mismatch for ${artifact.filename}.`);
  }
  const sbom = JSON.parse(await fs.readFile(path.join(outputPath, manifest.sbom.filename), "utf8"));
  if (sbom?.bomFormat !== "CycloneDX" || sbom?.specVersion !== "1.5" || !Array.isArray(sbom.components) || sbom.components.length !== manifest.sbom.component_count) throw new Error("CycloneDX SBOM metadata or component count is invalid.");
  if (sbom?.metadata?.component?.name !== manifest.package_name || sbom?.metadata?.component?.version !== manifest.version || sbom?.metadata?.component?.purl !== `pkg:npm/${manifest.package_name}@${manifest.version}`) throw new Error("CycloneDX root component does not match the release package identity.");
  const pythonComponents = sbom.components.filter((item) => item?.properties?.some((property) => property?.name === "tethermark:source-lock" && property?.value === "workers/python/requirements.lock"));
  if (pythonComponents.length < 2) throw new Error("CycloneDX SBOM does not include the Python worker dependency set.");
  return { version: manifest.version, release_tag: manifest.release_tag, revision_sha: manifest.revision_sha, artifact_count: checksums.length, component_count: sbom.components.length, python_component_count: pythonComponents.length };
}
