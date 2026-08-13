import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromRoot = (...parts) => join(root, ...parts);

await rm(fromRoot("dist"), { recursive: true, force: true });
await mkdir(fromRoot("dist/main"), { recursive: true });
await mkdir(fromRoot("dist/renderer"), { recursive: true });

await Promise.all([
  build({
    entryPoints: [fromRoot("src/main/main.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron", "bonjour-service", "castv2-client", "ffmpeg-static"],
    outfile: fromRoot("dist/main/main.cjs")
  }),
  build({
    entryPoints: [fromRoot("src/main/preload.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    outfile: fromRoot("dist/main/preload.cjs")
  }),
  build({
    entryPoints: [fromRoot("src/renderer/app.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome138",
    outfile: fromRoot("dist/renderer/app.js")
  })
]);

await Promise.all([
  cp(fromRoot("src/renderer/index.html"), fromRoot("dist/renderer/index.html")),
  cp(fromRoot("src/renderer/styles.css"), fromRoot("dist/renderer/styles.css"))
]);
