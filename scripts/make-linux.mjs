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
const appimagetool = {
  name: `appimagetool-${architecture}.AppImage`,
  url: `https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-${architecture}.AppImage`,
  digest: "sha256:ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
};
const appImageRuntime = {
  name: `runtime-${architecture}`,
  url: `https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-${architecture}`,
  digest: "sha256:2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"
};

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

const appimagetoolPath = await ensureVerifiedTool(appimagetool, true);
const runtimePath = await ensureVerifiedTool(appImageRuntime, false);

await run(appimagetoolPath, ["--runtime-file", runtimePath, appDir, appImagePath], {
  env: { ...process.env, ARCH: architecture, APPIMAGE_EXTRACT_AND_RUN: "1" }
});
await chmod(appImagePath, 0o755);

const checksumPath = await writeSha256(appImagePath);
console.log(`Instalador generado en:\n${appImagePath}\nSHA-256 generado en:\n${checksumPath}`);

async function ensureVerifiedTool(tool, executable) {
  const toolsDirectory = join(projectRoot, "out", "tools");
  const toolPath = join(toolsDirectory, tool.name);
  await mkdir(toolsDirectory, { recursive: true });

  try {
    const cachedBytes = await readFile(toolPath);
    if (digest(cachedBytes) === tool.digest) return toolPath;
  } catch {
    // The tool has not been cached yet.
  }

  const download = await fetch(tool.url);
  if (!download.ok) throw new Error(`Could not download ${tool.name}: HTTP ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  const actualDigest = digest(bytes);
  if (actualDigest !== tool.digest) {
    throw new Error(`${tool.name} failed SHA-256 verification (${actualDigest} != ${tool.digest})`);
  }

  await writeFile(toolPath, bytes);
  if (executable) await chmod(toolPath, 0o755);
  return toolPath;
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
