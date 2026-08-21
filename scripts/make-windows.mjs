import installer from "electron-winstaller";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeSha256 } from "./checksum.mjs";
import { packageWindows, projectRoot } from "./windows-build.mjs";

const [appDirectory] = await packageWindows();
if (!appDirectory) throw new Error("Electron Packager no devolvió la carpeta de la aplicación");

const outputDirectory = join(projectRoot, "out", "make", "squirrel.windows", "x64");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const setupFileName = "Flac-Cast-Windows-x64-Setup.exe";
const setupPath = join(outputDirectory, setupFileName);
await installer.createWindowsInstaller({
  appDirectory,
  outputDirectory,
  authors: "Flac Cast contributors",
  // Squirrel maps this field to the outer Setup.exe ProductName resource.
  // Keep it identical to the project name for SignPath metadata enforcement.
  description: "Flac Cast",
  exe: "Flac Cast.exe",
  name: "FlacCast",
  setupExe: setupFileName,
  setupIcon: join(projectRoot, "assets", "icon.ico"),
  title: "Flac Cast",
  noMsi: true
});

const checksumPath = await writeSha256(setupPath);
console.log(`Instalador generado en:\n${setupPath}\nSHA-256 generado en:\n${checksumPath}`);
