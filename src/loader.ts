import { join } from "path";
import { ensureModule } from "./downloader";

/**
 * Load a module from npm or a local path.
 *
 * For local development, set CLI_CORE_PATH to point to your local cli-core:
 *   CLI_CORE_PATH=/path/to/holistics-core/packages/cli-core pnpm cli ...
 */
export async function loadModule(pkg: string, version?: string) {
  // Support local development via environment variable
  if (pkg === '@holistics/cli-core' && process.env.CLI_CORE_PATH) {
    const localPath = process.env.CLI_CORE_PATH;
    console.error(`[dev] Using local cli-core from: ${localPath}`);
    return import(join(localPath, "dist/commands.js"));
  }

  const modulePath = await ensureModule(pkg, version);
  return import(join(modulePath, "dist/commands.js"));
}
