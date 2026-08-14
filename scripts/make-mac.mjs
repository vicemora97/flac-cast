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
const dmgPath = join(outputDirectory, "Flac Cast.dmg");

await rm(stagingDirectory, { recursive: true, force: true });
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(stagingDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

await run("cp", ["-R", appBundle, stagingDirectory]);
await symlink("/Applications", join(stagingDirectory, "Applications"));

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

const checksumPath = await writeSha256(dmgPath);
console.log(`Instalador generado en:\n${dmgPath}\nSHA-256 generado en:\n${checksumPath}`);
