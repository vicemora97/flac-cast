import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { parseFile } from "music-metadata";
import type { Track } from "../shared/contracts.js";
import type { MediaServer } from "./media-server.js";

type CachedArtwork = { fileName: string; format: string };
type CachedTrack = {
  filePath: string;
  fileSize: number;
  modifiedMs: number;
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  durationSeconds?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  bitrate?: number;
  fileExtension?: string;
  contentType?: string;
  trackNumber?: number;
  discNumber?: number;
  addedAtMs?: number;
  artwork?: CachedArtwork;
};
type CachedLibrary = { folder: string; tracks: CachedTrack[] };
type LibraryCache = { version: 2; libraries: CachedLibrary[] };
type LegacyLibraryCache = { version: 1; folder: string; tracks: CachedTrack[] };
type AudioFile = { filePath: string; fileSize: number; modifiedMs: number; filesystemCreatedMs: number };
type ArtworkData = { data: Uint8Array; format: string };
type ArtworkEndpoint = { localUrl: string; castUrl?: string };
type LibraryRefresh = { tracks: Track[]; changed: boolean };

export class LibraryManager {
  private readonly cachePath: string;
  private readonly temporaryCachePath: string;
  private readonly artworkFolder: string;
  private cacheWriteQueue: Promise<void> = Promise.resolve();
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly refreshes = new Map<string, Promise<LibraryRefresh>>();

  constructor(userDataFolder: string, private readonly mediaServer: MediaServer) {
    this.cachePath = join(userDataFolder, "library-cache.json");
    this.temporaryCachePath = join(userDataFolder, "library-cache.tmp.json");
    this.artworkFolder = join(userDataFolder, "artwork-cache");
  }

  async getCachedFolders(): Promise<string[]> {
    return (await this.readCache()).libraries.map((library) => library.folder);
  }

  async loadCached(folders: string[]): Promise<Track[]> {
    const requested = new Set(folders.map(normalizeFolderKey));
    const records = (await this.readCache()).libraries
      .filter((library) => requested.has(normalizeFolderKey(library.folder)))
      .flatMap((library) => library.tracks);
    return this.materialize(sortAndDedupe(records));
  }

  async refresh(folder: string): Promise<LibraryRefresh> {
    const key = normalizeFolderKey(folder);
    const current = this.refreshes.get(key);
    if (current) return current;
    const refresh = this.enqueue(() => this.refreshInternal(folder)).finally(() => this.refreshes.delete(key));
    this.refreshes.set(key, refresh);
    return refresh;
  }

  async remove(folder: string): Promise<void> {
    await this.enqueue(async () => {
      const key = normalizeFolderKey(folder);
      const cache = await this.readCache();
      cache.libraries = cache.libraries.filter((library) => normalizeFolderKey(library.folder) !== key);
      await this.writeCache(cache);
    });
  }

  private async refreshInternal(folder: string): Promise<LibraryRefresh> {
    const cache = await this.readCache();
    const key = normalizeFolderKey(folder);
    const previous = cache.libraries.find((library) => normalizeFolderKey(library.folder) === key);
    let files: AudioFile[];
    try {
      files = await findAudioFiles(folder);
    } catch (error) {
      throw new LibraryUnavailableError(folder, error);
    }
    if (files.length === 0 && (previous?.tracks.length ?? 0) > 0) {
      throw new LibraryUnavailableError(folder, new Error("La carpeta respondió vacía mientras se reconectaba"));
    }

    const previousByPath = new Map(previous?.tracks.map((track) => [track.filePath, track]));
    const externalArtwork = new Map<string, Promise<ArtworkData | undefined>>();
    const records: CachedTrack[] = [];
    const discoveredAtMs = Date.now();
    for (const file of files) {
      const cached = previousByPath.get(file.filePath);
      const addedAtMs = cached?.addedAtMs ?? (cached ? file.filesystemCreatedMs : discoveredAtMs);
      if (cached && cached.fileSize === file.fileSize && cached.modifiedMs === file.modifiedMs) {
        records.push(cached.addedAtMs == null ? { ...cached, addedAtMs } : cached);
      }
      else {
        try {
          records.push(await this.readTrack(file, externalArtwork, addedAtMs));
        } catch (error) {
          console.warn(`No se pudo leer ${file.filePath}`, error);
        }
      }
    }
    records.sort(compareCachedTracks);
    if (previous && sameCachedTracks(previous.tracks, records)) {
      return { tracks: await this.materialize(previous.tracks), changed: false };
    }
    cache.libraries = cache.libraries.filter((library) => normalizeFolderKey(library.folder) !== key);
    cache.libraries.push({ folder, tracks: records });
    await this.writeCache(cache);
    return { tracks: await this.materialize(records), changed: true };
  }

  private async readTrack(
    file: AudioFile,
    externalArtwork: Map<string, Promise<ArtworkData | undefined>>,
    addedAtMs: number
  ): Promise<CachedTrack> {
    const metadata = await parseFile(file.filePath, { duration: true, skipCovers: false });
    const picture = metadata.common.picture?.[0] ?? await findExternalArtwork(dirname(file.filePath), externalArtwork);
    return {
      filePath: file.filePath,
      fileSize: file.fileSize,
      modifiedMs: file.modifiedMs,
      id: createHash("sha256").update(file.filePath).digest("hex").slice(0, 16),
      title: metadata.common.title ?? basename(file.filePath, extname(file.filePath)),
      artist: metadata.common.artist ?? "Unknown artist",
      album: metadata.common.album ?? "Unknown album",
      albumArtist: metadata.common.albumartist ?? undefined,
      durationSeconds: metadata.format.duration,
      sampleRate: metadata.format.sampleRate,
      bitsPerSample: metadata.format.bitsPerSample,
      bitrate: metadata.format.bitrate,
      fileExtension: extname(file.filePath).toLowerCase(),
      contentType: contentTypeForExtension(extname(file.filePath)),
      trackNumber: metadata.common.track.no ?? undefined,
      discNumber: metadata.common.disk.no ?? undefined,
      addedAtMs,
      artwork: picture ? await this.persistArtwork(picture.data, picture.format) : undefined
    };
  }

  private async persistArtwork(data: Uint8Array, format: string): Promise<CachedArtwork> {
    const fileName = createHash("sha256").update(data).digest("hex");
    await mkdir(this.artworkFolder, { recursive: true });
    try { await writeFile(join(this.artworkFolder, fileName), data, { flag: "wx" }); }
    catch (error) { if (!isAlreadyExists(error)) throw error; }
    return { fileName, format };
  }

  private async materialize(records: CachedTrack[]): Promise<Track[]> {
    const artworkEndpoints = new Map<string, Promise<ArtworkEndpoint | undefined>>();
    return Promise.all(records.map(async (record) => {
      const media = this.mediaServer.register(record.filePath);
      const artwork = record.artwork
        ? await getOrCreateArtworkEndpoint(record.artwork, this.artworkFolder, this.mediaServer, artworkEndpoints)
        : undefined;
      return {
        id: record.id, title: record.title, artist: record.artist, album: record.album, albumArtist: record.albumArtist,
        durationSeconds: record.durationSeconds, sampleRate: record.sampleRate, bitsPerSample: record.bitsPerSample,
        bitrate: record.bitrate, fileExtension: record.fileExtension ?? extname(record.filePath).toLowerCase(),
        contentType: record.contentType ?? contentTypeForExtension(extname(record.filePath)),
        trackNumber: record.trackNumber, discNumber: record.discNumber,
        addedAtMs: record.addedAtMs,
        artworkUrl: artwork?.localUrl, castArtworkUrl: artwork?.castUrl,
        localUrl: media.localUrl, castUrl: media.castUrl
      } satisfies Track;
    }));
  }

  private async readCache(): Promise<LibraryCache> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as LibraryCache | LegacyLibraryCache;
      if (parsed.version === 2 && Array.isArray(parsed.libraries)) return parsed;
      if (parsed.version === 1 && typeof parsed.folder === "string" && Array.isArray(parsed.tracks)) {
        return { version: 2, libraries: [{ folder: parsed.folder, tracks: parsed.tracks }] };
      }
    } catch { /* Se recupera con una caché vacía. */ }
    return { version: 2, libraries: [] };
  }

  private writeCache(cache: LibraryCache): Promise<void> {
    const snapshot = `${JSON.stringify(cache)}\n`;
    this.cacheWriteQueue = this.cacheWriteQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.cachePath), { recursive: true });
      const temporaryPath = `${this.temporaryCachePath}.${randomUUID()}`;
      await writeFile(temporaryPath, snapshot, "utf8");
      await rename(temporaryPath, this.cachePath);
    });
    return this.cacheWriteQueue;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.catch(() => undefined).then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class LibraryUnavailableError extends Error {
  constructor(folder: string, cause: unknown) {
    super(`La biblioteca no está disponible por ahora (${folder})`, { cause });
    this.name = "LibraryUnavailableError";
  }
}

async function getOrCreateArtworkEndpoint(artwork: CachedArtwork, folder: string, server: MediaServer, endpoints: Map<string, Promise<ArtworkEndpoint | undefined>>): Promise<ArtworkEndpoint | undefined> {
  let endpoint = endpoints.get(artwork.fileName);
  if (!endpoint) {
    const artworkPath = join(folder, artwork.fileName);
    endpoint = stat(artworkPath)
      .then(() => server.registerArtworkFile(artworkPath, artwork.format))
      .catch(() => undefined);
    endpoints.set(artwork.fileName, endpoint);
  }
  return endpoint;
}

async function findExternalArtwork(folder: string, cache: Map<string, Promise<ArtworkData | undefined>>): Promise<ArtworkData | undefined> {
  const cached = cache.get(folder);
  if (cached) return cached;
  const lookup = (async () => {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const baseName of ["cover", "folder", "front", "album"]) {
      const match = entries.find((entry) => {
        const extension = extname(entry.name).toLowerCase();
        return entry.isFile() && basename(entry.name, extension).toLowerCase() === baseName && [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
      });
      if (match) {
        const extension = extname(match.name).toLowerCase();
        return { data: await readFile(join(folder, match.name)), format: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg" };
      }
    }
    return undefined;
  })().catch(() => undefined);
  cache.set(folder, lookup);
  return lookup;
}

const AUDIO_EXTENSIONS = new Set([".flac", ".wav", ".wave", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".aif", ".aiff", ".alac"]);

async function findAudioFiles(folder: string): Promise<AudioFile[]> {
  const result: AudioFile[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filePath = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await findAudioFiles(filePath));
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      const details = await stat(filePath);
      const filesystemCreatedMs = validFileTimestamp(details.birthtimeMs)
        ?? validFileTimestamp(details.ctimeMs)
        ?? details.mtimeMs;
      result.push({ filePath, fileSize: details.size, modifiedMs: details.mtimeMs, filesystemCreatedMs });
    }
  }
  return result;
}

function contentTypeForExtension(value: string): string {
  switch (value.toLowerCase()) {
    case ".flac": return "audio/flac";
    case ".wav": case ".wave": return "audio/wav";
    case ".mp3": return "audio/mpeg";
    case ".m4a": case ".alac": return "audio/mp4";
    case ".aac": return "audio/aac";
    case ".ogg": case ".oga": return "audio/ogg";
    case ".opus": return "audio/opus";
    case ".aif": case ".aiff": return "audio/aiff";
    default: return "application/octet-stream";
  }
}

function sortAndDedupe(records: CachedTrack[]): CachedTrack[] {
  const unique = new Map(records.map((record) => [normalizeFolderKey(record.filePath), record]));
  return [...unique.values()].sort(compareCachedTracks);
}
function compareCachedTracks(a: CachedTrack, b: CachedTrack): number {
  return a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album)
    || (a.discNumber ?? 1) - (b.discNumber ?? 1)
    || (a.trackNumber ?? Number.MAX_SAFE_INTEGER) - (b.trackNumber ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title);
}
function sameCachedTracks(a: CachedTrack[], b: CachedTrack[]): boolean {
  return a.length === b.length && a.every((track, index) => {
    const other = b[index];
    return other != null
      && track.filePath === other.filePath
      && track.fileSize === other.fileSize
      && track.modifiedMs === other.modifiedMs
      && track.addedAtMs === other.addedAtMs;
  });
}
function normalizeFolderKey(folder: string): string { return folder.replace(/[\\/]+$/, "").toLocaleLowerCase(); }
function validFileTimestamp(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 && value <= Date.now() + 86_400_000 ? value : undefined;
}
function isAlreadyExists(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "EEXIST"; }
