import { createHash } from "node:crypto";

export type ProductionStaticToolId = "scorecard" | "semgrep" | "trivy";

export interface StaticToolReleaseAsset {
  platform: "win32" | "linux" | "darwin";
  arch: "x64" | "arm64";
  archive: "zip" | "tar.gz";
  filename: string;
  sha256: string;
  url: string;
}

export interface StaticToolVersionPolicy {
  id: ProductionStaticToolId;
  label: string;
  command: string;
  version_args: string[];
  pinned_version: string;
  supported_minimum: string;
  supported_maximum_exclusive: string;
  release_assets: StaticToolReleaseAsset[];
  package_sha256?: string[];
}

function githubAsset(args: {
  owner: string;
  repo: string;
  tag: string;
  platform: StaticToolReleaseAsset["platform"];
  arch: StaticToolReleaseAsset["arch"];
  archive: StaticToolReleaseAsset["archive"];
  filename: string;
  sha256: string;
}): StaticToolReleaseAsset {
  return {
    platform: args.platform,
    arch: args.arch,
    archive: args.archive,
    filename: args.filename,
    sha256: args.sha256,
    url: `https://github.com/${args.owner}/${args.repo}/releases/download/${args.tag}/${args.filename}`
  };
}

export const STATIC_TOOL_POLICIES: Record<ProductionStaticToolId, StaticToolVersionPolicy> = {
  scorecard: {
    id: "scorecard",
    label: "OpenSSF Scorecard",
    command: "scorecard",
    version_args: ["version"],
    pinned_version: "5.5.0",
    supported_minimum: "5.5.0",
    supported_maximum_exclusive: "6.0.0",
    release_assets: [
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "win32", arch: "x64", archive: "tar.gz", filename: "scorecard_5.5.0_windows_amd64.tar.gz", sha256: "21ca42b37260785e670c58f602b483510099e7b1988e3c6eb5005f143dc2a2ab" }),
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "win32", arch: "arm64", archive: "tar.gz", filename: "scorecard_5.5.0_windows_arm64.tar.gz", sha256: "375ccf037552cf2ca105b9143311ed9128c669352d29faeb6bd11024e5d0be4a" }),
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "linux", arch: "x64", archive: "tar.gz", filename: "scorecard_5.5.0_linux_amd64.tar.gz", sha256: "83b90a05c1540ef1390db1cd5711e5fd04be9c1d8537fb84d39d02092d6a8dff" }),
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "linux", arch: "arm64", archive: "tar.gz", filename: "scorecard_5.5.0_linux_arm64.tar.gz", sha256: "3ce59d20c1d53e540c4a14e0da1e0d96b3b294e8ddc96a3c5a7b8a637b32991e" }),
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "darwin", arch: "x64", archive: "tar.gz", filename: "scorecard_5.5.0_darwin_amd64.tar.gz", sha256: "979487ca20e726f6a4d2bd63a0a4c544184f589724b3d12d2ba8d0ea80889063" }),
      githubAsset({ owner: "ossf", repo: "scorecard", tag: "v5.5.0", platform: "darwin", arch: "arm64", archive: "tar.gz", filename: "scorecard_5.5.0_darwin_arm64.tar.gz", sha256: "bac6371a4f810d6bdd0b65d63c3311906bdfe3ba0d76a5ea743ce24ced170fcf" })
    ]
  },
  semgrep: {
    id: "semgrep",
    label: "Semgrep",
    command: "semgrep",
    version_args: ["--version"],
    pinned_version: "1.172.0",
    supported_minimum: "1.172.0",
    supported_maximum_exclusive: "2.0.0",
    release_assets: [],
    package_sha256: [
      "7bcac633a0ffb7dfe75b7b99e44876f839590f2c01cd159c44caecc35e591df4",
      "09e92c9e6c1635a1549d4e297b2d4a9684dcd351b216ed7f2eb51cfc55479c49",
      "c881a305b965e594b88b15c2c6419b398e76e438ec61e60916c8b2effe927240",
      "d8b94af4266a575287ad2cd844573743ab4fe58f6bfb6d9229327807937eade3",
      "8ba0d661c8cb3a451b27d4300b2d958483d6761262ce84e4dd5ff4f94e700346",
      "f13ddebc870e784b03c9247f095720f49f67244eca1e7da493364f55c65b4493",
      "e32868faeb67b241bbd3fabd82a12fba4b467464dedde9da285b9bf78e808ba3"
    ]
  },
  trivy: {
    id: "trivy",
    label: "Trivy",
    command: "trivy",
    version_args: ["--version"],
    pinned_version: "0.73.0",
    supported_minimum: "0.73.0",
    supported_maximum_exclusive: "0.74.0",
    release_assets: [
      githubAsset({ owner: "aquasecurity", repo: "trivy", tag: "v0.73.0", platform: "win32", arch: "x64", archive: "zip", filename: "trivy_0.73.0_windows-64bit.zip", sha256: "d2d3ad5292aae470a03eb6506db86fce81b1894592b8451cadaf60eaa22f2025" }),
      githubAsset({ owner: "aquasecurity", repo: "trivy", tag: "v0.73.0", platform: "linux", arch: "x64", archive: "tar.gz", filename: "trivy_0.73.0_Linux-64bit.tar.gz", sha256: "2edd39da482bb4e9831962487b68f68e3928ec3137794757f54d00383d79547b" }),
      githubAsset({ owner: "aquasecurity", repo: "trivy", tag: "v0.73.0", platform: "linux", arch: "arm64", archive: "tar.gz", filename: "trivy_0.73.0_Linux-ARM64.tar.gz", sha256: "13833d97e8a1a5367471c372a173180157f593bece570e20d5d925fef552f5dd" }),
      githubAsset({ owner: "aquasecurity", repo: "trivy", tag: "v0.73.0", platform: "darwin", arch: "x64", archive: "tar.gz", filename: "trivy_0.73.0_macOS-64bit.tar.gz", sha256: "d39d1374dd3e35d48621b82df9b6625fe69f9920cc67d2739ed81bb679f16f51" }),
      githubAsset({ owner: "aquasecurity", repo: "trivy", tag: "v0.73.0", platform: "darwin", arch: "arm64", archive: "tar.gz", filename: "trivy_0.73.0_macOS-ARM64.tar.gz", sha256: "80cc25faaf6378e37701202d0b4f9f43d9e413d198d594ba60fdf559fe44a683" })
    ]
  }
};

export const BUNDLED_SEMGREP_RULESET_VERSION = "2026.08.07.1";
export const BUNDLED_SEMGREP_RULESET = `rules:
  - id: tethermark.generic.hardcoded-secret
    message: Potential hardcoded secret or token material in source.
    severity: WARNING
    languages:
      - generic
    pattern-regex: (?i)(api[_-]?key|secret|token|password)\\s*[:=]\\s*['\\"][A-Za-z0-9_./+=-]{16,}['\\"]
  - id: tethermark.generic.prompt-injection-surface
    message: Prompt injection handling is referenced and should have an explicit control.
    severity: INFO
    languages:
      - generic
    pattern-regex: (?i)prompt\\s+injection
  - id: tethermark.generic.shell-execution-surface
    message: Shell or subprocess execution surface should be reviewed for static audit controls.
    severity: INFO
    languages:
      - generic
    pattern-regex: (?i)(child_process|subprocess|exec\\(|spawn\\(|shell=True)
`;

export const BUNDLED_SEMGREP_RULESET_SHA256 = "cafd1d6ff752b8aba82d0f3da637c6d06bbebc590726c5582f5a85838b5dcf04";
const calculatedRulesetSha256 = createHash("sha256").update(BUNDLED_SEMGREP_RULESET, "utf8").digest("hex");
if (calculatedRulesetSha256 !== BUNDLED_SEMGREP_RULESET_SHA256) {
  throw new Error(`Bundled Semgrep ruleset checksum mismatch: expected ${BUNDLED_SEMGREP_RULESET_SHA256}, calculated ${calculatedRulesetSha256}.`);
}

function versionTuple(value: string): [number, number, number] | null {
  const match = value.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[^\d]|$)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function extractStaticToolVersion(value: string): string | null {
  const tuple = versionTuple(value);
  return tuple ? tuple.join(".") : null;
}

export function evaluateStaticToolVersion(toolId: ProductionStaticToolId, output: string): {
  detected_version: string | null;
  supported: boolean;
  pinned: boolean;
  reason: string;
} {
  const policy = STATIC_TOOL_POLICIES[toolId];
  const detected = extractStaticToolVersion(output);
  if (!detected) {
    return { detected_version: null, supported: false, pinned: false, reason: `Could not parse a semantic version from ${policy.label} output.` };
  }
  const tuple = versionTuple(detected)!;
  const minimum = versionTuple(policy.supported_minimum)!;
  const maximum = versionTuple(policy.supported_maximum_exclusive)!;
  const supported = compareVersions(tuple, minimum) >= 0 && compareVersions(tuple, maximum) < 0;
  const pinned = detected === policy.pinned_version;
  return {
    detected_version: detected,
    supported,
    pinned,
    reason: supported
      ? pinned
        ? `${policy.label} ${detected} matches the production pin.`
        : `${policy.label} ${detected} is supported but differs from the production pin ${policy.pinned_version}.`
      : `${policy.label} ${detected} is outside the supported range >=${policy.supported_minimum} <${policy.supported_maximum_exclusive}.`
  };
}

export function resolveStaticToolReleaseAsset(toolId: "scorecard" | "trivy", platform = process.platform, arch = process.arch): StaticToolReleaseAsset | null {
  return STATIC_TOOL_POLICIES[toolId].release_assets.find((asset) => asset.platform === platform && asset.arch === arch) ?? null;
}

export function resolveStaticToolInvocation(toolId: ProductionStaticToolId): { command: string; prefix_args: string[]; logical_command: string } {
  const envPrefix = toolId.toUpperCase();
  const configuredCommand = process.env[`HARNESS_${envPrefix}_COMMAND`]?.trim();
  const configuredRunner = process.env[`HARNESS_${envPrefix}_RUNNER`]?.trim();
  if (configuredCommand) return { command: configuredCommand, prefix_args: configuredRunner ? [configuredRunner] : [], logical_command: STATIC_TOOL_POLICIES[toolId].command };
  if (toolId === "semgrep") {
    const python = process.env.HARNESS_SEMGREP_PYTHON?.trim();
    const runner = process.env.HARNESS_SEMGREP_RUNNER?.trim();
    if (python && runner) return { command: python, prefix_args: [runner], logical_command: "semgrep" };
  }
  return { command: STATIC_TOOL_POLICIES[toolId].command, prefix_args: [], logical_command: STATIC_TOOL_POLICIES[toolId].command };
}
