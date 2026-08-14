import { packager } from "@electron/packager";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function packageMac() {
  return packager({
    dir: projectRoot,
    out: join(projectRoot, "out"),
    overwrite: true,
    platform: "darwin",
    arch: "arm64",
    electronVersion: "37.4.0",
    name: "Flac Cast",
    executableName: "Flac Cast",
    icon: join(projectRoot, "assets", "icon.icns"),
    asar: { unpack: "**/node_modules/ffmpeg-static/**" },
    prune: true,
    ignore: [
      /^\/(?:src|docs|scripts|out)(?:\/|$)/,
      /^\/(?:README\.md|tsconfig\.json)$/
    ],
    appBundleId: "com.vicente.flaccast",
    appCategoryType: "public.app-category.music"
  });
}
