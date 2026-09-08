import { spawn } from "node:child_process";
import { constants, setPriority } from "node:os";
import { stat } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import type { AudioEnvelope } from "../shared/contracts.js";

const executable = ffmpegPath?.replace("app.asar", "app.asar.unpacked");
const MAX_BINS = 72_000; // Two hours, 10 measurements per second.

// Keeps only an RMS envelope, never a whole decoded song. Playback is untouched.
export class EnvelopeAccumulator {
  readonly values: number[] = [];
  private tail = Buffer.alloc(0);
  push(chunk: Buffer): void {
    const data = Buffer.concat([this.tail, chunk]);
    let offset = 0;
    for (; offset + 1600 <= data.length; offset += 1600) {
      if (this.values.length >= MAX_BINS) throw new Error("Analysis duration limit");
      let squares = 0;
      for (let i = offset; i < offset + 1600; i += 2) squares += (data.readInt16LE(i) / 32768) ** 2;
      const db = 20 * Math.log10(Math.max(1e-6, Math.sqrt(squares / 800)));
      this.values.push(Math.max(0, Math.min(1, (db + 60) / 52)));
    }
    this.tail = Buffer.from(data.subarray(offset));
  }
}

export class AudioEnvelopeService {
  private generation = 0;
  private stop?: () => void;
  private exited: Promise<void> = Promise.resolve();
  private cache = new Map<string, AudioEnvelope>();
  cancel(): void { this.generation++; this.stop?.(); }

  async analyze(path: string): Promise<AudioEnvelope | undefined> {
    this.cancel();
    const generation = this.generation;
    await this.exited;
    if (generation !== this.generation) return;
    const details = await stat(path).catch(() => undefined);
    if (!details?.isFile() || !executable || generation !== this.generation) return;
    const key = `${path}\0${details.size}\0${details.mtimeMs}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    return new Promise((resolve) => {
      const accumulator = new EnvelopeAccumulator();
      const child = spawn(executable, ["-nostdin", "-v", "error", "-threads", "1", "-i", path,
        "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1", "-filter_threads", "1",
        "-t", "7200", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      let done = false;
      let canceled = false;
      let resolveExit!: () => void;
      this.exited = new Promise<void>((resolve) => { resolveExit = resolve; });
      const finish = (result?: AudioEnvelope) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        if (this.stop === stop) this.stop = undefined;
        resolve(result);
      };
      const stop = () => { canceled = true; child.kill(); };
      this.stop = stop;
      const timeout = setTimeout(stop, 120_000);
      child.on("spawn", () => {
        try { if (child.pid) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* Optional OS hint. */ }
      });
      child.stdout.on("data", (data: Buffer) => {
        if (done || canceled) return;
        try { accumulator.push(data); } catch { stop(); }
      });
      child.on("error", () => finish());
      child.on("close", (code) => {
        resolveExit();
        if (done || canceled || generation !== this.generation || code !== 0 || !accumulator.values.length) { finish(); return; }
        const result = { step: .1, levels: Float32Array.from(accumulator.values) };
        this.cache.set(key, result);
        while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
        finish(result);
      });
    });
  }
}
