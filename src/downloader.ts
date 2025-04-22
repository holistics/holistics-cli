import { writeFile, mkdir, stat } from "fs/promises";
import { fetch } from "undici";
import { extract } from "tar";
import { join } from "path";
import { getModulePath, ensureCacheDir } from "./cache";

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
  // console.log(`Fetching latest version of ${pkg}...`);
  const res = await fetch(`https://registry.npmjs.org/${pkg}`);
  if (!res.ok) throw new Error(`Failed to fetch package info: ${res.statusText}`);
  
  const data = await res.json();
  const ver = data["dist-tags"]?.latest || "";
  // console.log(`Latest version is ${ver}`);
  return ver;
}

export async function ensureModule(pkg: string, version?: string) {
  if (!version) version = await getLatestVersion(pkg);
  const modulePath = getModulePath(pkg, version);

  try {
    await stat(modulePath); // Check if module is already installed
  } catch {
    await ensureCacheDir();
    await downloadAndExtract(pkg, version);
  }
  return modulePath;
}
