import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, readFile, rm, stat, utimes } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { get } from "node:http";

const root = process.env.FLAC_CAST_TEST_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { build } = require("esbuild");
async function load(relativePath) {
  const result = await build({ entryPoints: [join(root, relativePath)], bundle: true,
    platform: "node", format: "cjs", packages: "external", write: false });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { CastController } = await load("src/main/cast-controller.ts");
const { MediaServer } = await load("src/main/media-server.ts");
const { LosslessTranscoder } = await load("src/main/lossless-transcoder.ts");
const track = (id) => ({ id, title: id, artist: "Test", castUrl: `http://localhost/${id}.mp3`,
  format: "MP3", durationSeconds: 120 });
const item = (id, itemId) => ({ itemId, media: { customData: { trackId: id } } });
const request = { tracks: [track("a"), track("b")], currentIndex: 0, repeatMode: "off", shuffle: false };

function receiver() {
  const events = [];
  const status = { playerState: "PLAYING", currentTime: 20, currentItemId: 1,
    media: { customData: { trackId: "a" } }, items: [item("a", 1), item("c", 2)], repeatMode: "REPEAT_OFF" };
  let nextId = 3;
  const player = {
    getStatus(callback) { callback(null, structuredClone(status)); },
    queueInsert(items, options, callback) {
      events.push("insert");
      const before = status.items.findIndex((entry) => entry.itemId === options.insertBefore);
      status.items.splice(before < 0 ? status.items.length : before, 0,
        ...items.map((entry) => ({ ...entry, itemId: nextId++ })));
      callback(null);
    },
    queueRemove(ids, _options, callback) {
      events.push("remove");
      status.items = status.items.filter((entry) => !ids.includes(entry.itemId));
      callback(null);
    },
    queueReorder(ids, _options, callback) {
      events.push("reorder");
      status.items = [...status.items.filter((entry) => !ids.includes(entry.itemId)),
        ...ids.map((id) => status.items.find((entry) => entry.itemId === id))];
      callback(null);
    }
  };
  // Skip discovery: exercise the actual controller against a deterministic receiver.
  const controller = Object.create(CastController.prototype);
  Object.assign(controller, { player, state: { connected: true, queueActive: true, currentTrackId: "a" },
    queueMutation: Promise.resolve(), queueGeneration: 0, activeQueueGeneration: 0,
    reportDiagnostic: (event) => events.push(event), lastStatusDiagnosticSignature: "" });
  return { controller, player, status, events };
}

test("late insertion acknowledgement is reconciled without a duplicate insert", async () => {
  const { controller, player, status, events } = receiver();
  const insert = player.queueInsert.bind(player);
  player.queueInsert = (items, options, callback) => insert(items, options,
    () => setTimeout(() => callback(null), 10_100));
  await controller.updateQueue(request);
  assert.equal(events.filter((event) => event === "insert").length, 1);
  assert.ok(events.includes("queue-reconcile"));
  assert.deepEqual(status.items.map((entry) => entry.media.customData.trackId), ["a", "b"]);
});

test("applied insert followed by an error is read back before recomputing the diff", async () => {
  const { controller, player, status, events } = receiver();
  const insert = player.queueInsert.bind(player);
  player.queueInsert = (items, options, callback) => insert(items, options,
    () => callback(new Error("Response lost after applying")));
  await controller.updateQueue(request);
  assert.equal(events.filter((event) => event === "insert").length, 1);
  assert.deepEqual(status.items.map((entry) => entry.media.customData.trackId), ["a", "b"]);
});

test("an unacknowledged command blocks further mutations until it settles", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const { controller, player, status, events } = receiver();
  const insert = player.queueInsert.bind(player);
  let acknowledge;
  player.queueInsert = (items, options, callback) => insert(items, options, () => { acknowledge = callback; });
  const first = assert.rejects(controller.updateQueue(request), /still unconfirmed/);
  await flush();
  assert.equal(typeof acknowledge, "function");
  t.mock.timers.tick(10_000);
  await flush();
  t.mock.timers.tick(10_000);
  await first;
  const second = assert.rejects(controller.updateQueue(request), /still unconfirmed/);
  await flush();
  t.mock.timers.tick(10_000);
  await second;
  assert.equal(events.filter((event) => event === "insert").length, 1);
  assert.ok(!events.includes("remove"));
  acknowledge(null);
  await flush();
  await controller.updateQueue(request);
  assert.deepEqual(status.items.map((entry) => entry.media.customData.trackId), ["a", "b"]);
  assert.equal(events.filter((event) => event === "insert").length, 1);
});

test("automatic track transition during insertion stops the old queue update", async () => {
  const { controller, player, status, events } = receiver();
  const insert = player.queueInsert.bind(player);
  player.queueInsert = (items, options, callback) => insert(items, options, () => {
    status.currentItemId = 2;
    status.media.customData.trackId = "c";
    callback(null);
  });
  const result = await controller.updateQueue(request);
  assert.equal(result.currentTrackId, "c");
  assert.ok(!events.includes("remove"));
  assert.ok(!events.includes("reorder"));
});

test("queued requests cannot mutate a newer playback generation", async () => {
  const { controller, events } = receiver();
  const operation = controller.updateQueue(request);
  controller.queueGeneration += 1;
  await operation;
  assert.deepEqual(events, []);
});

test("a replaced session cannot receive continuation of an old update", async () => {
  const { controller, player, events } = receiver();
  const insert = player.queueInsert.bind(player);
  player.queueInsert = (items, options, callback) => insert(items, options, () => {
    controller.player = {};
    controller.queueGeneration += 1;
    callback(null);
  });
  await assert.rejects(controller.updateQueue(request), /session or playback request changed/);
  assert.ok(!events.includes("remove"));
});

test("FINISHED remains valid for IDLE, but is not inherited by a playing new track", () => {
  const { controller } = receiver();
  controller.applyStatus({ playerState: "IDLE", idleReason: "FINISHED", media: { customData: { trackId: "b" } } });
  assert.equal(controller.getState().idleReason, "FINISHED");
  controller.applyStatus({ playerState: "PLAYING", idleReason: "FINISHED", media: { customData: { trackId: "c" } } });
  assert.equal(controller.getState().idleReason, undefined);
});

test("HTTP supports ranges, full-response multi-range fallback and interrupted-transfer diagnostics", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flac-cast-http-test-"));
  const file = join(folder, "sample.flac");
  const data = Buffer.alloc(8 * 1024 * 1024, 7);
  await writeFile(file, data);
  const events = [];
  const server = new MediaServer((event, payload) => events.push({ event, ...payload }));
  try {
    await server.start();
    assert.equal(server.server.timeout, 0);
    const { localUrl } = server.register(file);
    let response = await fetch(localUrl, { headers: { Range: "bytes=2-5" } });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 4);
    response = await fetch(localUrl, { headers: { Range: "bytes=-3" } });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 3);
    response = await fetch(localUrl, { headers: { Range: "bytes=0-2,5-7" } });
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, data.length);
    response = await fetch(localUrl, { headers: { Range: "bytes=-" } });
    assert.equal(response.status, 416);
    await response.arrayBuffer();
    response = await fetch(localUrl, { headers: { Range: "bytes=999999999-" } });
    assert.equal(response.status, 416);
    await response.arrayBuffer();
    await new Promise((resolve, reject) => {
      const req = get(localUrl, (res) => res.once("data", () => { res.destroy(); resolve(); }));
      req.on("error", reject);
    });
    for (let attempt = 0; attempt < 50 && !events.some((event) => event.outcome === "interrupted"); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(events.some((event) => event.outcome === "interrupted"));
    assert.ok(events.some((event) => event.outcome === "response-finished" && event.status === 206));
    assert.ok(!JSON.stringify(events).includes(file));
    const terminalIds = events.filter((event) => event.event === "media-transfer").map((event) => event.requestId);
    assert.equal(new Set(terminalIds).size, terminalIds.length);
  } finally {
    server.server?.closeAllConnections();
    server.stop();
    await rm(folder, { recursive: true, force: true });
  }
});

test("streamed FLAC removes pictures/padding, preserves audio, supports every range boundary and decodes identically", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flac-stream-test-"));
  const server = new MediaServer();
  try {
    const ffmpeg = require("ffmpeg-static");
    const exec = promisify(execFile);
    const original = join(folder, "original.flac");
    await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-ar", "192000", "-sample_fmt", "s32", "-c:a", "flac", original], { windowsHide: true });
    const raw = await readFile(original);
    let offset = 4;
    const retained = [];
    while (true) {
      const type = raw[offset] & 127;
      const length = raw.readUIntBE(offset + 1, 3);
      const last = Boolean(raw[offset] & 128);
      if (type !== 1 && type !== 6) {
        const block = Buffer.from(raw.subarray(offset, offset + 4 + length));
        block[0] = type;
        retained.push(block);
      }
      offset += 4 + length;
      if (last) break;
    }
    const audio = raw.subarray(offset);
    const padding = Buffer.alloc(512 * 1024 + 4);
    padding[0] = 0x81;
    padding.writeUIntBE(padding.length - 4, 1, 3);
    const picture = Buffer.alloc(1028); picture[0] = 6; picture.writeUIntBE(1024, 1, 3);
    const source = join(folder, "padded.flac");
    await writeFile(source, Buffer.concat([Buffer.from("fLaC"), ...retained, picture, padding, audio]));
    const canonical = retained.map((block) => Buffer.from(block));
    canonical.at(-1)[0] |= 128;
    const prefix = Buffer.concat([Buffer.from("fLaC"), ...canonical]);
    const expected = Buffer.concat([prefix, audio]);
    await server.start();
    const { localUrl } = await server.registerFlacStream(source);
    const full = await fetch(localUrl);
    assert.equal(Number(full.headers.get("content-length")), expected.length);
    const actual = Buffer.from(await full.arrayBuffer());
    assert.deepEqual(actual, expected);
    for (const [start, end] of [[0,3],[0,prefix.length - 1],[prefix.length - 2,prefix.length + 8],
      [prefix.length,prefix.length + 1024],[expected.length - 5,expected.length - 1]]) {
      const res = await fetch(localUrl, { headers: { Range: `bytes=${start}-${end}` } });
      assert.equal(res.status, 206);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), expected.subarray(start,end + 1));
    }
    const head = await fetch(localUrl, {method: "HEAD"});
    assert.equal(Number(head.headers.get("content-length")), expected.length);
    const suffix = await fetch(localUrl, {headers:{Range:"bytes=-19"}});
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), expected.subarray(-19));
    const output = join(folder, "streamed.flac");
    await writeFile(output, actual);
    const decodeHash = async (file) => (await exec(ffmpeg, ["-v","error","-i",file,"-map","0:a:0","-f","hash","-hash","sha256","-"], {windowsHide:true})).stdout;
    assert.equal(await decodeHash(original), await decodeHash(output));
    // The same original source URL must not retain obsolete layout metadata.
    await writeFile(source, raw);
    await utimes(source, new Date(), new Date(Date.now() + 2000));
    const changed = await fetch(localUrl);
    assert.deepEqual(Buffer.from(await changed.arrayBuffer()), expected);
  } finally {
    server.server?.closeAllConnections(); server.stop();
    await rm(folder, {recursive:true,force:true});
  }
});

test("eviction protects active, leased and upcoming files, skips temporary outputs and reports removed entries", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flac-cache-test-"));
  const removed = [];
  const cache = new LosslessTranscoder((path) => removed.push(path));
  cache.cacheFolder = folder;
  try {
    const paths = Array.from({length:12}, (_,index) => join(folder, `${index}.flac`));
    for (const path of paths) await writeFile(path, Buffer.alloc(100));
    const temporary = join(folder, "in-progress.tmp.flac");
    await writeFile(temporary, Buffer.alloc(100));
    cache.setActiveFile(paths[0]);
    const release = cache.holdFile(paths[1]);
    cache.setUpcomingFiles([paths[2]]);
    await Promise.all([cache.pruneCache(paths[3]), cache.pruneCache(paths[3])]);
    for (const path of [temporary,...paths.slice(0,4)]) assert.ok((await stat(path)).isFile());
    assert.equal(removed.length, 4);
    for (const path of removed) await assert.rejects(stat(path), {code:"ENOENT"});
    release(); release();
    assert.equal(cache.heldFiles.size, 0);
  } finally { await rm(folder, {recursive:true,force:true}); }
});

test("an evicted immutable HTTP entry returns 404 before audio headers rather than a false 206", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flac-missing-test-"));
  const server = new MediaServer();
  try {
    const path = join(folder,"cached.flac"); await writeFile(path,Buffer.alloc(100));
    await server.start();
    const { localUrl } = server.register(path,undefined,{immutable:true});
    await (await fetch(localUrl)).arrayBuffer();
    await rm(path);
    const missing = await fetch(localUrl,{headers:{Range:"bytes=0-20"}});
    assert.equal(missing.status,404);
  } finally {
    server.server?.closeAllConnections();server.stop();
    await rm(folder,{recursive:true,force:true});
  }
});
