import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LyricsLine, LyricsTrack, SyncedLyrics } from "../shared/contracts.js";

const FOUND_TTL = 180 * 24 * 60 * 60 * 1000;
const MISSING_TTL = 14 * 24 * 60 * 60 * 1000;
const REQUEST_SPACING = 350;

type FoundEntry = { status: "found"; fetchedAt: number; lyrics: SyncedLyrics };
type MissingEntry = { status: "missing"; fetchedAt: number };
type CacheEntry = FoundEntry | MissingEntry;
type LyricsCache = { version: 1; entries: Record<string, CacheEntry> };
type LrclibResponse = {
  trackName?: unknown;
  artistName?: unknown;
  instrumental?: unknown;
  syncedLyrics?: unknown;
};

export class LyricsService {
  private readonly cachePath: string;
  private readonly temporaryCachePath: string;
  private readonly userAgent: string;
  private cache?: LyricsCache;
  private requestQueue: Promise<void> = Promise.resolve();
  private writeQueue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private blockedUntil = 0;

  constructor(userDataFolder: string, appVersion: string) {
    this.cachePath = join(userDataFolder, "lyrics-cache.json");
    this.temporaryCachePath = join(userDataFolder, "lyrics-cache.tmp.json");
    this.userAgent = `Flac Cast/${appVersion} (https://github.com/vicemora97/flac-cast)`;
  }

  async getSyncedLyrics(track: LyricsTrack): Promise<SyncedLyrics | undefined> {
    const duration = Math.round(track.durationSeconds ?? 0);
    if (!track.title.trim() || !track.artist.trim() || !track.album.trim() || duration <= 0) return undefined;
    const key = createTrackKey(track, duration);
    const cached = await this.getCached(key);
    if (cached !== "expired") return cached;

    let result: SyncedLyrics | undefined;
    const operation = this.requestQueue.catch(() => undefined).then(async () => {
      const secondLook = await this.getCached(key);
      if (secondLook !== "expired") {
        result = secondLook;
        return;
      }
      result = await this.fetchLyrics(track, duration, key);
    });
    this.requestQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  private async fetchLyrics(track: LyricsTrack, duration: number, key: string): Promise<SyncedLyrics | undefined> {
    const waitUntil = Math.max(this.blockedUntil, this.lastRequestAt + REQUEST_SPACING);
    if (waitUntil > Date.now()) await wait(waitUntil - Date.now());

    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("track_name", track.title);
    url.searchParams.set("artist_name", track.artist);
    url.searchParams.set("album_name", track.album);
    url.searchParams.set("duration", String(duration));
    this.lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000)
    });

    if (response.status === 429) {
      const retrySeconds = Math.max(1, Number(response.headers.get("retry-after")) || 30);
      this.blockedUntil = Date.now() + retrySeconds * 1000;
      throw new Error(`LRCLIB limitó temporalmente las consultas. Reintenta en ${retrySeconds} segundos.`);
    }
    if (response.status === 404) {
      await this.remember(key, { status: "missing", fetchedAt: Date.now() });
      return undefined;
    }
    if (!response.ok) throw new Error(`LRCLIB respondió HTTP ${response.status}`);

    const payload = await response.json() as LrclibResponse;
    const lines = typeof payload.syncedLyrics === "string" ? parseLrc(payload.syncedLyrics) : [];
    if (payload.instrumental === true || lines.length === 0) {
      await this.remember(key, { status: "missing", fetchedAt: Date.now() });
      return undefined;
    }
    const lyrics: SyncedLyrics = {
      source: "LRCLIB",
      trackName: typeof payload.trackName === "string" ? payload.trackName : track.title,
      artistName: typeof payload.artistName === "string" ? payload.artistName : track.artist,
      lines
    };
    await this.remember(key, { status: "found", fetchedAt: Date.now(), lyrics });
    return lyrics;
  }

  private async getCached(key: string): Promise<SyncedLyrics | undefined | "expired"> {
    const cache = await this.readCache();
    const entry = cache.entries[key];
    if (!entry) return "expired";
    const ttl = entry.status === "found" ? FOUND_TTL : MISSING_TTL;
    if (Date.now() - entry.fetchedAt > ttl) return "expired";
    return entry.status === "found" ? entry.lyrics : undefined;
  }

  private async remember(key: string, entry: CacheEntry): Promise<void> {
    const cache = await this.readCache();
    cache.entries[key] = entry;
    const snapshot = `${JSON.stringify(cache)}\n`;
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.cachePath), { recursive: true });
      const temporaryPath = `${this.temporaryCachePath}.${randomUUID()}`;
      await writeFile(temporaryPath, snapshot, "utf8");
      await rename(temporaryPath, this.cachePath);
    });
    await this.writeQueue;
  }

  private async readCache(): Promise<LyricsCache> {
    if (this.cache) return this.cache;
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as Partial<LyricsCache>;
      if (parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") {
        this.cache = { version: 1, entries: parsed.entries as Record<string, CacheEntry> };
        return this.cache;
      }
    } catch { /* La primera consulta comienza con un caché vacío. */ }
    this.cache = { version: 1, entries: {} };
    return this.cache;
  }
}

function createTrackKey(track: LyricsTrack, duration: number): string {
  const signature = [track.title, track.artist, track.album]
    .map((value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .concat(String(duration))
    .join("\0");
  return createHash("sha256").update(signature).digest("hex");
}

function parseLrc(source: string): LyricsLine[] {
  const offsetMatch = /^\[offset:([+-]?\d+)\]$/im.exec(source);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: LyricsLine[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    if (timestamps.length === 0) continue;
    const text = rawLine.replace(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g, "").trim();
    if (!text) continue;
    for (const timestamp of timestamps) {
      const startTime = Math.max(0, Number(timestamp[1]) * 60 + Number(timestamp[2]) + offsetSeconds);
      if (Number.isFinite(startTime)) lines.push({ startTime, text });
    }
  }
  return lines.sort((a, b) => a.startTime - b.startTime);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
