// Dev-only entry point used by build-dev.sh.
//
// Embeds a locally built @holistics/cli-core tarball into the compiled binary so it
// can be copied to another machine (e.g. a Windows PC) and tested without publishing
// to npm. On first run the tarball is extracted into the regular cache dir under a
// unique dev version, then loaded through the same code path as the released launcher.
import { writeFile, mkdir, stat, rm } from "fs/promises";
import { join } from "path";
import { extract } from "tar";
import { Command } from "commander";
// @ts-ignore -- bun embeds the file into the executable and returns its path
import cliCoreTarball from "../.dev-build/cli-core.tgz" with { type: "file" };
import { getModulePath, ensureCacheDir } from "../src/cache";
import { loadModule } from "../src/loader";

declare const Bun: any;
// Injected via `bun build --define`
declare const DEV_CLI_CORE_VERSION: string;

const PKG = "@holistics/cli-core";

async function installEmbeddedCliCore(version: string) {
  const modulePath = getModulePath(PKG, version);
  try {
    await stat(join(modulePath, "dist/commands.js"));
    return;
  } catch {
    // not extracted yet
  }

  await ensureCacheDir();
  await mkdir(modulePath, { recursive: true });
  try {
    const tarballPath = join(modulePath, "package.tgz");
    await writeFile(tarballPath, new Uint8Array(await Bun.file(cliCoreTarball).arrayBuffer()));
    await extract({ file: tarballPath, cwd: modulePath, strip: 1 });
  } catch (err) {
    await rm(modulePath, { recursive: true, force: true });
    throw err;
  }
}

if (process.env.HOLISTICS_DEV_BUILD_INFO) {
  console.error(`[dev build] ${PKG}@${DEV_CLI_CORE_VERSION} -> ${getModulePath(PKG, DEV_CLI_CORE_VERSION)}`);
}

await installEmbeddedCliCore(DEV_CLI_CORE_VERSION);

const program = new Command();
const clicore = await loadModule(PKG, DEV_CLI_CORE_VERSION);
clicore.registerCommands(program);

program.parse(process.argv);
