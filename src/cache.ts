import { stat, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export function getCacheDir() {
  return process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || homedir(), "holistics")
    : join(homedir(), ".cache", "holistics");
}

export function getModulePath(pkg: string, version: string) {
  return join(getCacheDir(), `${pkg}@${version}`);
}

export async function ensureCacheDir() {
  const cacheDir = getCacheDir();
  try {
    await stat(cacheDir);
  } catch {
    await mkdir(cacheDir, { recursive: true });
  }
}
