import { packager } from "@electron/packager";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function packageLinux() {
  return packager({
    dir: projectRoot,
    out: join(projectRoot, "out"),
    overwrite: true,
    platform: "linux",
    arch: "x64",
    name: "Flac Cast",
    executableName: "Flac Cast",
    icon: join(projectRoot, "assets", "icon.png"),
    asar: { unpack: "**/node_modules/ffmpeg-static/**" },
    prune: true,
    ignore: [
      /^\/(?:src|docs|scripts|out)(?:\/|$)/,
      /^\/(?:README\.md|tsconfig\.json)$/
    ]
  });
}
