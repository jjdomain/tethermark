import fs from "node:fs";
import path from "node:path";

let loaded = false;
const MAX_ENV_FILE_BYTES = 1024 * 1024;

export function resolveEnvironmentFilePath(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd()
): string {
  const configured = environment.HARNESS_ENV_FILE?.trim();
  return path.resolve(configured || path.join(workingDirectory, ".env"));
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadEnvironment(): void {
  if (loaded) {
    return;
  }

  const envPath = resolveEnvironmentFilePath();
  if (fs.existsSync(envPath)) {
    const stat = fs.lstatSync(envPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Tethermark environment file must be a regular non-symlink file: ${envPath}`);
    }
    if (stat.size > MAX_ENV_FILE_BYTES) {
      throw new Error(`Tethermark environment file exceeds ${MAX_ENV_FILE_BYTES} bytes: ${envPath}`);
    }
    const contents = fs.readFileSync(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }
      if (!(parsed.key in process.env)) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }

  loaded = true;
}
