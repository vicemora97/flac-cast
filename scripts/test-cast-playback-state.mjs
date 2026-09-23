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
const { castPlaybackReachedEnd, castQueueCurrentIndex, distinctCastHistory, reconcileCastScheduledFuture, remoteTrackIdForAdoption } = module.exports;

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

test("a stale current marker cannot move a played track back into the future queue", () => {
  const items = [
    { trackId: "midnight", current: true, group: "current" },
    { trackId: "miracles", group: "scheduled" },
    { trackId: "mountain", group: "scheduled" }
  ];
  assert.equal(castQueueCurrentIndex(items, "miracles"), 1);
});

test("an exact current marker wins when the same track ID also exists in history", () => {
  const items = [
    { trackId: "midnight", group: "history" },
    { trackId: "miracles", group: "history" },
    { trackId: "midnight", current: true, group: "current" },
    { trackId: "mountain", group: "scheduled" }
  ];
  assert.equal(castQueueCurrentIndex(items, "midnight"), 2);
});

test("Cast history excludes current and future duplicates while retaining recent unique tracks", () => {
  const value = (id) => ({ id });
  const history = [value("older"), value("midnight"), value("miracles"), value("midnight")];
  const active = [value("miracles"), value("mountain")];
  assert.deepEqual(distinctCastHistory(history, active).map((item) => item.id), ["older", "midnight"]);
});

test("remote queue reconciliation never moves a played track behind the current one", () => {
  const value = (id) => ({ id });
  const queue = [value("midnight"), value("miracles"), value("mountain"), value("next")];
  const reconciled = reconcileCastScheduledFuture(queue, 1, ["mountain", "next", "midnight"]);
  assert.deepEqual(reconciled.map((item) => item.id), ["midnight", "miracles", "mountain", "next"]);
});

test("remote queue reconciliation can reorder future tracks without altering history", () => {
  const value = (id) => ({ id });
  const queue = [value("past"), value("current"), value("one"), value("two"), value("three")];
  const reconciled = reconcileCastScheduledFuture(queue, 1, ["three", "one", "two"]);
  assert.deepEqual(reconciled.map((item) => item.id), ["past", "current", "three", "one", "two"]);
});
