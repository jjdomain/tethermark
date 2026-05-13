import path from "node:path";

function splitPathList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getManagedStaticToolDirs(cwd = process.cwd()): string[] {
  const configured = splitPathList(process.env.HARNESS_STATIC_TOOLS_PATH);
  return [...new Set(configured.map((item) => path.resolve(cwd, item)))];
}

export function buildToolPathEnv(cwd = process.cwd(), basePath = process.env.PATH ?? ""): string {
  return [...getManagedStaticToolDirs(cwd), ...splitPathList(basePath)].join(path.delimiter);
}

export function staticToolPathDetails(cwd = process.cwd()): { managed_dirs: string[]; env_var: string } {
  return {
    managed_dirs: getManagedStaticToolDirs(cwd),
    env_var: "HARNESS_STATIC_TOOLS_PATH"
  };
}
