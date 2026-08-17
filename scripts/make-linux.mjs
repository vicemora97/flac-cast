import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { writeSha256 } from "./checksum.mjs";
import { packageLinux, projectRoot } from "./linux-build.mjs";

const run = promisify(execFile);

const appName = "Flac Cast";
const appId = "flac-cast";
const architecture = "x86_64";

const [appOutputDirectory] = await packageLinux();
if (!appOutputDirectory) throw new Error("Electron Packager no devolvió la carpeta de la aplicación");

const appDir = join(projectRoot, "out", "AppDir");
const outputDirectory = join(projectRoot, "out", "make", "appimage");
const appImagePath = join(outputDirectory, `Flac-Cast-Linux-${architecture}.AppImage`);

await rm(appDir, { recursive: true, force: true });
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(join(appDir, "usr", "bin", appId), { recursive: true });
await mkdir(outputDirectory, { recursive: true });

await cp(appOutputDirectory, join(appDir, "usr", "bin", appId), { recursive: true });
await cp(join(projectRoot, "assets", "icon.png"), join(appDir, `${appId}.png`));

await writeFile(
  join(appDir, "AppRun"),
  `#!/bin/sh\ncd "$(dirname "$0")/usr/bin/${appId}"\nexec "./${appName}" --no-sandbox "$@"\n`,
  "utf8"
);
await chmod(join(appDir, "AppRun"), 0o755);

await writeFile(
  join(appDir, `${appId}.desktop`),
  [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${appName}`,
    "Comment=Local hi-res FLAC player with Google Cast support",
    "Exec=AppRun %U",
    `Icon=${appId}`,
    "Categories=AudioVideo;Audio;Player;",
    "Terminal=false",
    ""
  ].join("\n"),
  "utf8"
);

const appimagetoolPath = await ensureAppimagetool();

await run(appimagetoolPath, [appDir, appImagePath], {
  env: { ...process.env, ARCH: architecture, APPIMAGE_EXTRACT_AND_RUN: "1" }
});
await chmod(appImagePath, 0o755);

const checksumPath = await writeSha256(appImagePath);
console.log(`Instalador generado en:\n${appImagePath}\nSHA-256 generado en:\n${checksumPath}`);

async function ensureAppimagetool() {
  const toolsDirectory = join(projectRoot, "out", "tools");
  const toolPath = join(toolsDirectory, `appimagetool-${architecture}.AppImage`);
  const digestPath = `${toolPath}.digest`;
  await mkdir(toolsDirectory, { recursive: true });

  const response = await fetch("https://api.github.com/repos/AppImage/appimagetool/releases/latest");
  if (!response.ok) throw new Error(`No se pudo consultar la versión de appimagetool: ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find((candidate) => candidate.name === `appimagetool-${architecture}.AppImage`);
  if (!asset?.digest) throw new Error("La release de appimagetool no incluye el binario o su digest esperado");
  const expectedDigest = asset.digest;

  try {
    const cachedDigest = await readFile(digestPath, "utf8");
    if (cachedDigest.trim() === expectedDigest) return toolPath;
  } catch {
    // Aún no hay una copia en caché.
  }

  const download = await fetch(asset.browser_download_url);
  if (!download.ok) throw new Error(`No se pudo descargar appimagetool: ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());

  const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actualDigest !== expectedDigest) {
    throw new Error(`El hash de appimagetool no coincide con el publicado por GitHub (${actualDigest} != ${expectedDigest})`);
  }

  await writeFile(toolPath, bytes);
  await chmod(toolPath, 0o755);
  await writeFile(digestPath, expectedDigest, "utf8");
  return toolPath;
}
