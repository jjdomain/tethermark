import path from "node:path";

/**
 * Resolve the single writable artifact root used by local Community Edition
 * processes. Shared-service deployments set HARNESS_ARTIFACT_ROOT so the
 * application checkout can remain read-only.
 */
export function resolveArtifactRoot(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd()
): string {
  const configured = environment.HARNESS_ARTIFACT_ROOT?.trim();
  return path.resolve(configured || path.join(workingDirectory, ".artifacts"));
}

export function resolveArtifactPath(...segments: string[]): string {
  return path.join(resolveArtifactRoot(), ...segments);
}
