import { join } from "path";
import { ensureModule } from "./downloader";

export async function loadModule(pkg: string, version?: string) {
  const modulePath = await ensureModule(pkg, version);
  return import(join(modulePath, "dist/commands.js"));
}
