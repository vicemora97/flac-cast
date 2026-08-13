import { packager } from "@electron/packager";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function packageWindows() {
  return packager({
    dir: projectRoot,
    out: join(projectRoot, "out"),
    overwrite: true,
    platform: "win32",
    arch: "x64",
    electronVersion: "37.4.0",
    name: "Flac Cast",
    executableName: "Flac Cast",
    icon: join(projectRoot, "assets", "icon.ico"),
    asar: { unpack: "**/node_modules/ffmpeg-static/**" },
    prune: true,
    ignore: [
      /^\/(?:src|docs|scripts|out)(?:\/|$)/,
      /^\/(?:README\.md|tsconfig\.json)$/
    ],
    win32metadata: {
      CompanyName: "Flac Cast",
      FileDescription: "Reproductor local FLAC Hi-Res",
      ProductName: "Flac Cast"
    }
  });
}
