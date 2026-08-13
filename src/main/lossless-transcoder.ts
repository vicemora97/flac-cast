import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, unlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const ffmpegExecutablePath = ffmpegPath?.includes("app.asar")
  ? ffmpegPath.replace("app.asar", "app.asar.unpacked")
  : ffmpegPath;

export class LosslessTranscoder {
  private readonly cacheFolder = join(tmpdir(), "hires-local", "wav-cache");
  private readonly maxCachedFiles = 7;
  private readonly inProgress = new Map<string, Promise<string>>();

  isAvailable(): boolean {
    return Boolean(ffmpegExecutablePath && existsSync(ffmpegExecutablePath));
  }

  async toWav(sourcePath: string, bitsPerSample?: number, sampleRate?: number): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para la conversión lossless");
    const sourceStat = await stat(sourcePath);
    const key = createHash("sha256")
      .update(`${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${bitsPerSample}\0${sampleRate}`)
      .digest("hex");
    const outputPath = join(this.cacheFolder, `${key}.wav`);

    try {
      const outputStat = await stat(outputPath);
      if (outputStat.size > 44) {
        const now = new Date();
        void utimes(outputPath, now, now).catch(() => undefined);
        return outputPath;
      }
    } catch { /* Todavía no está en caché. */ }

    const existing = this.inProgress.get(key);
    if (existing) return existing;

    const conversion = this.convert(sourcePath, outputPath, bitsPerSample, sampleRate)
      .finally(() => this.inProgress.delete(key));
    this.inProgress.set(key, conversion);
    return conversion;
  }

  private async convert(sourcePath: string, outputPath: string, bitsPerSample?: number, sampleRate?: number): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para la conversión lossless");
    await mkdir(this.cacheFolder, { recursive: true });
    const codec = (bitsPerSample ?? 24) > 16 ? "pcm_s24le" : "pcm_s16le";
    const args = ["-hide_banner", "-loglevel", "error", "-threads", "1", "-y", "-i", sourcePath, "-map", "0:a:0", "-vn", "-c:a", codec];
    if (codec === "pcm_s16le") args.push("-af", "aresample=dither_method=triangular_hp");
    if (sampleRate && sampleRate > 96_000) args.push("-ar", "96000");
    args.push(outputPath);

    try {
      await execFileAsync(ffmpegExecutablePath, args, { windowsHide: true, maxBuffer: 1024 * 1024 });
      await this.pruneCache(outputPath);
      return outputPath;
    } catch (error) {
      throw new Error(`No se pudo convertir ${basename(sourcePath)} a WAV lossless: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pruneCache(currentPath: string): Promise<void> {
    try {
      const entries = (await readdir(this.cacheFolder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".wav"));
      const cached = await Promise.all(entries.map(async (entry) => ({
        name: entry.name,
        path: join(this.cacheFolder, entry.name),
        modified: (await stat(join(this.cacheFolder, entry.name))).mtimeMs
      })));
      cached.sort((a, b) => b.modified - a.modified);
      const protectedNames = new Set([
        basename(currentPath),
        ...[...this.inProgress.keys()].map((key) => `${key}.wav`)
      ]);
      const removable = cached.filter((item, index) => index >= this.maxCachedFiles && !protectedNames.has(item.name));
      await Promise.all(removable.map((item) => unlink(item.path).catch(() => undefined)));
    } catch {
      // La limpieza es oportunista y nunca debe impedir la reproducción.
    }
  }
}
