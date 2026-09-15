import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.FLAC_CAST_TEST_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require("esbuild");
const result = await build({
  entryPoints: [join(root, "src/renderer/album-grouping.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const { buildAlbumGroups } = module.exports;

function track(id, artist, albumArtist, album = "Shared Album") {
  return { id, title: id, artist, albumArtist, album, localUrl: `http://localhost/${id}` };
}

test("tracks with different performers share one album when album artist matches", () => {
  const groups = buildAlbumGroups([
    track("one", "Main Artist feat. Guest", "Main Artist"),
    track("two", "Main Artist & Collaborator", "Main Artist")
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].artist, "Main Artist");
  assert.deepEqual(groups[0].tracks.map(({ id }) => id), ["one", "two"]);
});

test("albums without album-artist metadata remain separated by track artist", () => {
  const groups = buildAlbumGroups([
    track("one", "First Artist", undefined, "Greatest Hits"),
    track("two", "Second Artist", undefined, "Greatest Hits")
  ]);
  assert.equal(groups.length, 2);
});

test("harmless casing and surrounding whitespace do not split an album", () => {
  const groups = buildAlbumGroups([
    track("one", "Guest One", "Main Artist", "Shared Album"),
    track("two", "Guest Two", " main artist ", " shared album ")
  ]);
  assert.equal(groups.length, 1);
});

test("album cards are ordered by album title with artist only as a tie-breaker", () => {
  const groups = buildAlbumGroups([
    track("zebra", "A Artist", "A Artist", "Zebra"),
    track("alpha-b", "B Artist", "B Artist", "Alpha"),
    track("alpha-a", "A Artist", "A Artist", "Alpha")
  ]);
  assert.deepEqual(groups.map(({ title, artist }) => `${title}:${artist}`), [
    "Alpha:A Artist",
    "Alpha:B Artist",
    "Zebra:A Artist"
  ]);
});
