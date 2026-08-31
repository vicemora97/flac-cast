import { execFile } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { writeSha256 } from "./checksum.mjs";
import { packageMac, projectRoot } from "./mac-build.mjs";

const run = promisify(execFile);

const [appOutputDirectory] = await packageMac();
if (!appOutputDirectory) throw new Error("Electron Packager no devolvió la carpeta de la aplicación");

const appBundle = join(appOutputDirectory, "Flac Cast.app");
const stagingDirectory = join(projectRoot, "out", "dmg-staging");
const outputDirectory = join(projectRoot, "out", "make", "dmg");
const dmgPath = join(outputDirectory, "Flac-Cast-macOS-arm64.dmg");

await rm(stagingDirectory, { recursive: true, force: true });
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(stagingDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

await run("cp", ["-R", appBundle, stagingDirectory]);
await symlink("/Applications", join(stagingDirectory, "Applications"));

await createDmgWithRetry();

const checksumPath = await writeSha256(dmgPath);
console.log(`Instalador generado en:\n${dmgPath}\nSHA-256 generado en:\n${checksumPath}`);

async function createDmgWithRetry() {
  const maximumAttempts = 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      await run("hdiutil", [
        "create",
        "-volname",
        "Flac Cast",
        "-srcfolder",
        stagingDirectory,
        "-ov",
        "-format",
        "UDZO",
        dmgPath
      ]);
      return;
    } catch (error) {
      const stderr = String(error?.stderr ?? "");
      const resourceBusy = /resource busy/i.test(stderr);
      if (!resourceBusy || attempt === maximumAttempts) throw error;
      console.warn(`hdiutil reported a busy temporary resource (attempt ${attempt}/${maximumAttempts}); retrying.`);
      await rm(dmgPath, { force: true });
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
}
