import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
const root = process.env.FLAC_CAST_TEST_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require("esbuild");
async function load(path) {
  const result = await build({ entryPoints: [join(root, path)], bundle: true, platform: "node", format: "cjs", packages: "external", write: false });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { normalizeColors, paletteFromPixels, cycleColor, PlayerColors } = await load("src/renderer/player-colors.ts");
const { EnvelopeAccumulator, AudioEnvelopeService } = await load("src/main/audio-envelope.ts");

test("settings are bounded, default static and opt-in; malformed values are harmless", () => {
  assert.deepEqual(normalizeColors(null), { mode: "static", intensity: 35, seconds: 24, reactive: false });
  assert.deepEqual(normalizeColors({ mode: "bad", intensity: Infinity, seconds: -4, reactive: "yes" }), { mode: "static", intensity: 35, seconds: 6, reactive: false });
});
test("three distinct dominant colors, transparent fallback, and a continuous cyclic boundary", () => {
  const pixels = new Uint8ClampedArray(Array.from({ length: 30 }, (_, i) => i < 10 ? [200, 30, 30, 255] : i < 20 ? [30, 200, 30, 255] : [30, 30, 200, 255]).flat());
  const palette = paletteFromPixels(pixels);
  assert.equal(new Set(palette.map(String)).size, 3);
  assert.deepEqual(cycleColor(palette, 0), cycleColor(palette, 1));
  assert.deepEqual(cycleColor(palette, .999999), cycleColor(palette, 0));
  assert.equal(paletteFromPixels(new Uint8ClampedArray(16)).length, 3);
});
test("RMS envelope handles split samples, silence and louder passages with bounded output", () => {
  const accumulator = new EnvelopeAccumulator();
  const pcm = Buffer.alloc(4800);
  for (let i = 1600; i < 3200; i += 2) pcm.writeInt16LE(1000, i);
  for (let i = 3200; i < 4800; i += 2) pcm.writeInt16LE(18000, i);
  accumulator.push(pcm.subarray(0, 17)); accumulator.push(pcm.subarray(17, 2451)); accumulator.push(pcm.subarray(2451));
  assert.equal(accumulator.values.length, 3);
  assert.equal(accumulator.values[0], 0);
  assert.ok(accumulator.values[1] > 0 && accumulator.values[2] > accumulator.values[1]);
  assert.ok(accumulator.values.every((v) => v >= 0 && v <= 1));
});
test("FFmpeg analysis decodes a real WAV without changing the file, reuses cache and cancels", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flac-colors-"));
  const path = join(directory, "tone.wav");
  const service = new AudioEnvelopeService();
  try {
    const data = Buffer.alloc(44 + 32000);
    data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write("data", 36); data.writeUInt32LE(32000, 40);
    for (let i = 0; i < 16000; i++) data.writeInt16LE(Math.round((i < 8000 ? 1000 : 16000) * Math.sin(i * .35)), 44 + i * 2);
    await writeFile(path, data);
    const result = await service.analyze(path);
    assert.equal(result?.levels.length, 20);
    assert.ok(result.levels[15] > result.levels[5]);
    assert.equal(await service.analyze(path), result);
    const pending = service.analyze(path); service.cancel();
    assert.equal(await pending, undefined);
    const { readFile } = await import("node:fs/promises");
    assert.deepEqual(await readFile(path), data);
  } finally { service.cancel(); await rm(directory, { recursive: true, force: true }); }
});
test("disabled, paused, hidden and reduced-motion states stop animation and optional analysis", async () => {
  const elements = new Map();
  const element = () => ({ value: "", checked: false, disabled: false, open: false, dataset: {}, style: { setProperty() {} },
    listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, showModal() { this.open = true; }, close() { this.open = false; } });
  globalThis.document = { hidden: false, addEventListener() {}, querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelectorAll() { return [element()]; } };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const reduced = { matches: false, addEventListener() {} };
  globalThis.matchMedia = () => reduced;
  let frames = 0, canceled = 0, analysisCanceled = 0;
  globalThis.requestAnimationFrame = () => ++frames;
  globalThis.cancelAnimationFrame = () => canceled++;
  let nativeVisibility;
  globalThis.window = { setTimeout: () => 1, hires: { onPlayerVisualVisibility: (fn) => { nativeVisibility = fn; }, cancelAudioAnalysis: async () => { analysisCanceled++; } } };
  const state = { url: "file:test", time: 0, playing: false };
  const colors = new PlayerColors(() => state);
  colors.sync(); assert.equal(frames, 0);
  const mode = elements.get("#color-mode"); mode.value = "animated"; mode.listeners.input();
  state.playing = true; colors.sync(); assert.equal(frames, 1);
  const reactive = elements.get("#color-reactive"); reactive.checked = true; reactive.listeners.input();
  nativeVisibility(false); colors.sync(); assert.equal(canceled, 1); assert.equal(analysisCanceled, 1);
  document.hidden = true; nativeVisibility(true);
  document.hidden = false; reduced.matches = true; colors.sync(); assert.equal(frames, 1);
  reduced.matches = false; state.playing = false; colors.sync(); assert.equal(frames, 1);
  mode.value = "off"; mode.listeners.input(); state.playing = true; colors.sync(); assert.equal(frames, 1);
});
