import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, open, readdir, rename, stat, unlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const ffmpegExecutablePath = ffmpegPath?.includes("app.asar")
  ? ffmpegPath.replace("app.asar", "app.asar.unpacked")
  : ffmpegPath;
const MAX_CACHE_BYTES = 1024 * 1024 * 1024;
const MAX_CACHE_FILES = 8;
const MAX_CAST_METADATA_BYTES = 128 * 1024;
const MAX_PADDING_BYTES = 32 * 1024;

export type PreparedFlac = {
  filePath: string;
  repacked: boolean;
  metadataBytes: number;
};

type FlacInspection = {
  metadataBytes: number;
  paddingBytes: number;
};

export class LosslessTranscoder {
  private readonly cacheFolder = join(tmpdir(), "hires-local", "wav-cache");
  private readonly flacInProgress = new Map<string, Promise<PreparedFlac>>();
  private readonly compatibleFlacInProgress = new Map<string, Promise<string>>();
  private readonly wavInProgress = new Map<string, Promise<string>>();
  private readonly cacheReservations = new Map<string, number>();
  private activeFilePath?: string;

  isAvailable(): boolean {
    return Boolean(ffmpegExecutablePath && existsSync(ffmpegExecutablePath));
  }

  setActiveFile(filePath?: string): void {
    if (this.activeFilePath === filePath) return;
    this.activeFilePath = filePath;
    if (filePath) void touch(filePath);
  }

  async inspectPreparedFlac(sourcePath: string): Promise<{ repacked: boolean; prepared?: PreparedFlac }> {
    const sourceStat = await stat(sourcePath);
    const inspection = await inspectFlac(sourcePath, sourceStat.size);
    const repacked = inspection.metadataBytes > MAX_CAST_METADATA_BYTES
      || inspection.paddingBytes > MAX_PADDING_BYTES;
    const key = createHash("sha256")
      .update(`flac-cache-v2\0${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${repacked}`)
      .digest("hex");
    const outputPath = join(this.cacheFolder, `flac-${key}.flac`);
    try {
      const outputStat = await stat(outputPath);
      if (outputStat.size > 42) {
        await touch(outputPath);
        await this.pruneCache(outputPath);
        return {
          repacked,
          prepared: { filePath: outputPath, repacked, metadataBytes: inspection.metadataBytes }
        };
      }
    } catch { /* No hay una copia preparada disponible. */ }
    return { repacked };
  }

  async prepareFlac(sourcePath: string): Promise<PreparedFlac> {
    const sourceStat = await stat(sourcePath);
    const inspection = await inspectFlac(sourcePath, sourceStat.size);
    const repacked = inspection.metadataBytes > MAX_CAST_METADATA_BYTES
      || inspection.paddingBytes > MAX_PADDING_BYTES;
    const key = createHash("sha256")
      .update(`flac-cache-v2\0${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${repacked}`)
      .digest("hex");
    const outputPath = join(this.cacheFolder, `flac-${key}.flac`);

    try {
      const outputStat = await stat(outputPath);
      if (outputStat.size > 42) {
        await touch(outputPath);
        await this.pruneCache(outputPath);
        return { filePath: outputPath, repacked, metadataBytes: inspection.metadataBytes };
      }
      await unlink(outputPath);
    } catch { /* Todavía no está en caché. */ }

    const existing = this.flacInProgress.get(outputPath);
    if (existing) return existing;

    this.cacheReservations.set(outputPath, sourceStat.size);
    const preparation = this.createPreparedFlac(sourcePath, outputPath, inspection, repacked)
      .finally(() => {
        this.flacInProgress.delete(outputPath);
        this.cacheReservations.delete(outputPath);
      });
    this.flacInProgress.set(outputPath, preparation);
    return preparation;
  }

  async toCompatibleFlac(sourcePath: string, bitsPerSample: 16 | 24, outputSampleRate: number): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para preparar FLAC compatible");
    const sourceStat = await stat(sourcePath);
    const key = createHash("sha256")
      .update(`compatible-flac-v1\0${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${bitsPerSample}\0${outputSampleRate}`)
      .digest("hex");
    const outputPath = join(this.cacheFolder, `compatible-${key}.flac`);

    try {
      const outputStat = await stat(outputPath);
      if (outputStat.size > 42) {
        await touch(outputPath);
        await this.pruneCache(outputPath);
        return outputPath;
      }
      await unlink(outputPath);
    } catch { /* Todavía no está en caché. */ }

    const existing = this.compatibleFlacInProgress.get(outputPath);
    if (existing) return existing;

    this.cacheReservations.set(outputPath, sourceStat.size);
    const conversion = this.convertToCompatibleFlac(sourcePath, outputPath, bitsPerSample, outputSampleRate)
      .finally(() => {
        this.compatibleFlacInProgress.delete(outputPath);
        this.cacheReservations.delete(outputPath);
      });
    this.compatibleFlacInProgress.set(outputPath, conversion);
    return conversion;
  }

  async toWav(sourcePath: string, bitsPerSample?: number, sampleRate?: number, outputSampleRate?: number): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para la conversión lossless");
    const sourceStat = await stat(sourcePath);
    const key = createHash("sha256")
      .update(`${sourcePath}\0${sourceStat.size}\0${sourceStat.mtimeMs}\0${bitsPerSample}\0${sampleRate}\0${outputSampleRate}`)
      .digest("hex");
    const outputPath = join(this.cacheFolder, `${key}.wav`);

    try {
      const outputStat = await stat(outputPath);
      if (outputStat.size > 44) {
        await touch(outputPath);
        await this.pruneCache(outputPath);
        return outputPath;
      }
      await unlink(outputPath);
    } catch { /* Todavía no está en caché. */ }

    const existing = this.wavInProgress.get(outputPath);
    if (existing) return existing;

    const conversion = this.convertToWav(sourcePath, outputPath, bitsPerSample, sampleRate, outputSampleRate)
      .finally(() => this.wavInProgress.delete(outputPath));
    this.wavInProgress.set(outputPath, conversion);
    return conversion;
  }

  private async createPreparedFlac(
    sourcePath: string,
    outputPath: string,
    inspection: FlacInspection,
    repacked: boolean
  ): Promise<PreparedFlac> {
    await mkdir(this.cacheFolder, { recursive: true });
    await this.pruneCache(outputPath);
    const temporaryPath = join(this.cacheFolder, `${basename(outputPath, ".flac")}.${randomUUID()}.tmp.flac`);
    try {
      if (repacked) {
        if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para sanear el contenedor FLAC");
        // La imagen ya se envía como metadata Cast. Omitirla del archivo temporal
        // evita cabeceras enormes, conservando el audio FLAC bit por bit y sus tags.
        await execFileAsync(ffmpegExecutablePath, [
          "-hide_banner", "-loglevel", "error", "-threads", "1", "-y",
          "-i", sourcePath,
          "-map", "0:a:0", "-map_metadata", "0", "-map_chapters", "-1",
          "-c:a", "copy", temporaryPath
        ], { windowsHide: true, maxBuffer: 1024 * 1024 });
      } else {
        await copyFile(sourcePath, temporaryPath);
      }
      await rename(temporaryPath, outputPath);
      await this.pruneCache(outputPath);
      return { filePath: outputPath, repacked, metadataBytes: inspection.metadataBytes };
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new Error(`No se pudo preparar ${basename(sourcePath)} para Cast: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async convertToCompatibleFlac(
    sourcePath: string,
    outputPath: string,
    bitsPerSample: 16 | 24,
    outputSampleRate: number
  ): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para preparar FLAC compatible");
    await mkdir(this.cacheFolder, { recursive: true });
    await this.pruneCache(outputPath);
    const temporaryPath = join(this.cacheFolder, `${basename(outputPath, ".flac")}.${randomUUID()}.tmp.flac`);
    const sampleFormat = bitsPerSample === 16 ? "s16" : "s32";
    try {
      await execFileAsync(ffmpegExecutablePath, [
        "-hide_banner", "-loglevel", "error", "-threads", "1", "-y",
        "-i", sourcePath,
        "-map", "0:a:0", "-vn", "-map_metadata", "0", "-map_chapters", "-1",
        "-c:a", "flac", "-compression_level", "5", "-sample_fmt", sampleFormat,
        "-ar", String(outputSampleRate), temporaryPath
      ], { windowsHide: true, maxBuffer: 1024 * 1024 });
      await rename(temporaryPath, outputPath);
      await this.pruneCache(outputPath);
      return outputPath;
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new Error(`No se pudo preparar ${basename(sourcePath)} como FLAC compatible: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async convertToWav(
    sourcePath: string,
    outputPath: string,
    bitsPerSample?: number,
    sampleRate?: number,
    outputSampleRate?: number
  ): Promise<string> {
    if (!ffmpegExecutablePath) throw new Error("FFmpeg no está disponible para la conversión lossless");
    await mkdir(this.cacheFolder, { recursive: true });
    const codec = (bitsPerSample ?? 24) > 16 ? "pcm_s24le" : "pcm_s16le";
    const temporaryPath = join(this.cacheFolder, `${basename(outputPath, ".wav")}.${randomUUID()}.tmp.wav`);
    const args = ["-hide_banner", "-loglevel", "error", "-threads", "1", "-y", "-i", sourcePath, "-map", "0:a:0", "-vn", "-c:a", codec];
    if (codec === "pcm_s16le") args.push("-af", "aresample=dither_method=triangular_hp");
    if (outputSampleRate) args.push("-ar", String(outputSampleRate));
    else if (sampleRate && sampleRate > 96_000) args.push("-ar", "96000");
    args.push(temporaryPath);

    try {
      await execFileAsync(ffmpegExecutablePath, args, { windowsHide: true, maxBuffer: 1024 * 1024 });
      await rename(temporaryPath, outputPath);
      await this.pruneCache(outputPath);
      return outputPath;
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new Error(`No se pudo convertir ${basename(sourcePath)} a WAV lossless: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pruneCache(currentPath: string): Promise<void> {
    try {
      const entries = (await readdir(this.cacheFolder, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && (entry.name.endsWith(".wav") || entry.name.endsWith(".flac")));
      const cached = await Promise.all(entries.map(async (entry) => {
        const path = join(this.cacheFolder, entry.name);
        const details = await stat(path);
        return { name: entry.name, path, modified: details.mtimeMs, size: details.size };
      }));
      cached.sort((a, b) => b.modified - a.modified);

      const protectedPaths = new Set([
        currentPath,
        ...(this.activeFilePath ? [this.activeFilePath] : []),
        ...this.flacInProgress.keys(),
        ...this.compatibleFlacInProgress.keys(),
        ...this.wavInProgress.keys(),
        ...this.cacheReservations.keys()
      ]);
      const protectedItems = cached.filter((item) => protectedPaths.has(item.path));
      const cachedPaths = new Set(cached.map((item) => item.path));
      const pendingReservations = [...this.cacheReservations.entries()]
        .filter(([path]) => !cachedPaths.has(path));
      const keep = new Set(protectedItems.map((item) => item.path));
      let keptFiles = protectedItems.length + pendingReservations.length;
      let keptBytes = protectedItems.reduce((sum, item) => sum + item.size, 0)
        + pendingReservations.reduce((sum, [, size]) => sum + size, 0);

      for (const item of cached) {
        if (keep.has(item.path)) continue;
        if (keptFiles < MAX_CACHE_FILES && keptBytes + item.size <= MAX_CACHE_BYTES) {
          keep.add(item.path);
          keptFiles += 1;
          keptBytes += item.size;
        }
      }

      await Promise.all(cached
        .filter((item) => !keep.has(item.path))
        .map((item) => unlink(item.path).catch(() => undefined)));
    } catch {
      // La limpieza es oportunista y nunca debe impedir la reproducción.
    }
  }
}

async function inspectFlac(filePath: string, fileSize: number): Promise<FlacInspection> {
  const handle = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(4);
    await readExactly(handle, signature, 0);
    if (signature.toString("ascii") !== "fLaC") throw new Error("El archivo no tiene una cabecera FLAC válida");

    let position = 4;
    let last = false;
    let paddingBytes = 0;
    let blocks = 0;
    while (!last && blocks < 128) {
      const header = Buffer.alloc(4);
      await readExactly(handle, header, position);
      last = (header[0] & 0x80) !== 0;
      const type = header[0] & 0x7f;
      const length = header.readUIntBE(1, 3);
      if (blocks === 0 && (type !== 0 || length !== 34)) throw new Error("STREAMINFO FLAC inválido");
      if (type === 1) paddingBytes += length;
      position += 4 + length;
      if (position > fileSize) throw new Error("Los bloques de metadata FLAC exceden el tamaño del archivo");
      blocks += 1;
    }
    if (!last) throw new Error("La cabecera FLAC contiene demasiados bloques o está incompleta");
    return { metadataBytes: position, paddingBytes };
  } finally {
    await handle.close();
  }
}

async function readExactly(handle: Awaited<ReturnType<typeof open>>, buffer: Buffer, position: number): Promise<void> {
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
  if (bytesRead !== buffer.length) throw new Error("La cabecera FLAC está truncada");
}

async function touch(filePath: string): Promise<void> {
  const now = new Date();
  await utimes(filePath, now, now).catch(() => undefined);
}
