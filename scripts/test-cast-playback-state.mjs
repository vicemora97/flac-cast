import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.FLAC_CAST_TEST_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require("esbuild");
const result = await build({
  entryPoints: [join(root, "src/renderer/cast-playback-state.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
const { castPlaybackReachedEnd, remoteTrackIdForAdoption } = module.exports;

test("a connected Cast session can update the selected track", () => {
  assert.equal(remoteTrackIdForAdoption({ connected: true, currentTrackId: "remote-track" }), "remote-track");
});

test("a disconnected Cast session cannot replace local playback with its stale track", () => {
  assert.equal(remoteTrackIdForAdoption({ connected: false, currentTrackId: "stale-remote-track" }), undefined);
});

test("buffering at the final reported timestamp is still recognized as the end", () => {
  assert.equal(castPlaybackReachedEnd({ currentTime: 211, idleReason: undefined }, 211), true);
});

test("ordinary mid-track buffering is not mistaken for the end", () => {
  assert.equal(castPlaybackReachedEnd({ currentTime: 120, idleReason: undefined }, 211), false);
});

test("an explicit FINISHED status remains terminal without timing metadata", () => {
  assert.equal(castPlaybackReachedEnd({ idleReason: "FINISHED" }, undefined), true);
});
