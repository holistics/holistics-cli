import { writeFile, mkdir, stat, readdir } from "fs/promises";
import { fetch } from "undici";
import { extract } from "tar";
import { join } from "path";
import { getCacheDir, getModulePath, ensureCacheDir } from "./cache";

async function downloadAndExtract(pkg: string, version: string) {
  const modulePath = getModulePath(pkg, version);

  await mkdir(modulePath, { recursive: true });

  const tarballUrl = pkg.startsWith("@")
    ? `https://registry.npmjs.org/${pkg.replace("/", "%2F")}/-/${pkg.split("/")[1]}-${encodeURIComponent(version)}.tgz`
    : `https://registry.npmjs.org/${pkg}/-/${pkg}-${version}.tgz`;

  console.log(`Downloading version ${pkg}@${version}...`);
  const response = await fetch(tarballUrl);
  if (!response.ok) throw new Error(`Failed to download package: ${response.statusText}`);

  const tarball = await response.arrayBuffer();
  await writeFile(join(modulePath, "package.tgz"), new Uint8Array(tarball)); // Now safe

  await extract({ file: join(modulePath, "package.tgz"), cwd: modulePath, strip: 1 });
}

async function getLatestVersion(pkg: string): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`);
  if (!res.ok) throw new Error(`Failed to fetch package info: ${res.statusText}`);

  const data = await res.json();
  const ver = data["dist-tags"]?.latest || "";
  return ver;
}

async function findCachedVersion(pkg: string): Promise<string | null> {
  const cacheDir = getCacheDir();
  const prefix = `${pkg}@`;
  try {
    const entries = await readdir(cacheDir);
    const matches = entries
      .filter(e => e.startsWith(prefix))
      .map(e => e.slice(prefix.length))
      .sort()
      .reverse();
    return matches.length > 0 ? matches[0] : null;
  } catch {
    return null;
  }
}

export async function ensureModule(pkg: string, version?: string) {
  // Allow pinning the version via environment variable to skip npm registry calls entirely
  if (!version) version = process.env.HOLISTICS_CLI_CORE_VERSION;

  if (!version) {
    try {
      version = await getLatestVersion(pkg);
    } catch (err) {
      // Offline fallback: if npm is unreachable, try to use a cached version
      const cached = await findCachedVersion(pkg);
      if (cached) {
        console.log(`Network unavailable, using cached version ${pkg}@${cached}`);
        return getModulePath(pkg, cached);
      }
      throw err;
    }
  }

  const modulePath = getModulePath(pkg, version);

  try {
    await stat(modulePath); // Check if module is already installed
  } catch {
    await ensureCacheDir();
    await downloadAndExtract(pkg, version);
  }
  return modulePath;
}
