import fs from "node:fs/promises";
import path from "node:path";

import { resolveEnvironmentFilePath } from "../../../packages/core-engine/src/env.js";
import { defaultPersistenceRoot } from "../../../packages/core-engine/src/persistence/backend.js";
import { hasSqliteDatabase } from "../../../packages/core-engine/src/persistence/sqlite.js";
import { removePersistedUiCredentials } from "../../../packages/core-engine/src/persistence/ui-settings.js";

const SECRET_ENV_NAME = /(?:^|_)(?:API_?KEY|SERVICE_ROLE_KEY|ACCESS_?TOKEN|REFRESH_?TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i;

export async function removeManagedCredentials(args: { yes?: boolean; envPath?: string; persistenceRoot?: string } = {}): Promise<{ env_path: string; env_values_found: number; persisted_values_found: number; changed: boolean }> {
  const envPath = path.resolve(args.envPath ?? resolveEnvironmentFilePath());
  let contents = "";
  try {
    const stat = await fs.lstat(envPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("credential_environment_file_unsafe");
    contents = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let envValuesFound = 0;
  const nextLines = contents.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/);
    if (!match || !SECRET_ENV_NAME.test(match[2]) || !match[4].trim()) return line;
    envValuesFound += 1;
    return `${match[1]}${match[2]}${match[3]}`;
  });
  const persistenceRoot = path.resolve(args.persistenceRoot ?? defaultPersistenceRoot("local"));
  let persistedValuesFound = 0;
  if (await hasSqliteDatabase(persistenceRoot)) {
    persistedValuesFound = (await removePersistedUiCredentials(persistenceRoot, { dryRun: !args.yes })).values_removed;
  }
  if (args.yes && envValuesFound) {
    await fs.writeFile(envPath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`, { encoding: "utf8", mode: 0o600 });
    if (process.platform !== "win32") await fs.chmod(envPath, 0o600);
  }
  return { env_path: envPath, env_values_found: envValuesFound, persisted_values_found: persistedValuesFound, changed: Boolean(args.yes && (envValuesFound || persistedValuesFound)) };
}
