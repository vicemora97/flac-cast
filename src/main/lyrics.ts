import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LyricsLine, LyricsLookupResult, LyricsTrack, SyncedLyrics } from "../shared/contracts.js";

const FOUND_TTL = 180 * 24 * 60 * 60 * 1000;
const MISSING_TTL = 14 * 24 * 60 * 60 * 1000;
const REQUEST_SPACING = 350;

type FoundEntry = { status: "found"; fetchedAt: number; lyrics: SyncedLyrics };
type MissingEntry = { status: "missing"; fetchedAt: number };
type InstrumentalEntry = { status: "instrumental"; fetchedAt: number };
type CacheEntry = FoundEntry | MissingEntry | InstrumentalEntry;
type LyricsCache = { version: 4; entries: Record<string, CacheEntry> };
type LrclibResponse = {
  trackName?: unknown;
  artistName?: unknown;
  albumName?: unknown;
  duration?: unknown;
  instrumental?: unknown;
  plainLyrics?: unknown;
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

  async getSyncedLyrics(track: LyricsTrack): Promise<LyricsLookupResult> {
    const duration = Math.round(track.durationSeconds ?? 0);
    if (!track.title.trim() || !track.artist.trim() || !track.album.trim() || duration <= 0) return { status: "missing" };
    const key = createTrackKey(track, duration);
    const cached = await this.getCached(key);
    if (cached !== "expired") return cached;

    let result: LyricsLookupResult = { status: "missing" };
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

  private async fetchLyrics(track: LyricsTrack, duration: number, key: string): Promise<LyricsLookupResult> {
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.set("track_name", track.title);
    url.searchParams.set("artist_name", track.artist);
    url.searchParams.set("album_name", track.album);
    url.searchParams.set("duration", String(duration));
    const exactResponse = await this.request(url);
    if (exactResponse.status !== 404 && !exactResponse.ok) throw new Error(`LRCLIB respondió HTTP ${exactResponse.status}`);
    const exact = exactResponse.ok ? await exactResponse.json() as LrclibResponse : undefined;
    const exactLines = parseResponseLines(exact);
    if (exact && exactLines.length > 0) {
      const result = await this.rememberFound(key, track, exact, exactLines);
      return result;
    }

    const searchUrl = new URL("https://lrclib.net/api/search");
    searchUrl.searchParams.set("track_name", track.title);
    searchUrl.searchParams.set("artist_name", track.artist);
    const searchResponse = await this.request(searchUrl);
    if (!searchResponse.ok) throw new Error(`LRCLIB respondió HTTP ${searchResponse.status}`);
    const rawCandidates = await searchResponse.json() as unknown;
    const candidates = Array.isArray(rawCandidates) ? rawCandidates as LrclibResponse[] : [];
    let synchronized = selectBestSynchronizedCandidate(candidates, track, duration);
    if (!synchronized) {
      const broadSearchUrl = new URL("https://lrclib.net/api/search");
      broadSearchUrl.searchParams.set("q", track.title);
      const broadSearchResponse = await this.request(broadSearchUrl);
      if (!broadSearchResponse.ok) throw new Error(`LRCLIB respondió HTTP ${broadSearchResponse.status}`);
      const rawBroadCandidates = await broadSearchResponse.json() as unknown;
      if (Array.isArray(rawBroadCandidates)) candidates.push(...rawBroadCandidates as LrclibResponse[]);
      synchronized = selectBestSynchronizedCandidate(candidates, track, duration);
    }
    if (synchronized) {
      const result = await this.rememberFound(key, track, synchronized.payload, synchronized.lines);
      return result;
    }

    const vocalEvidence = candidates.some((candidate) =>
      isStrongCandidate(candidate, track, duration)
      && candidate.instrumental !== true
      && hasLyricsText(candidate)
    );
    const instrumentalEvidence = exact?.instrumental === true
      || candidates.some((candidate) => isStrongCandidate(candidate, track, duration) && candidate.instrumental === true);
    if (instrumentalEvidence && !vocalEvidence) {
      await this.remember(key, { status: "instrumental", fetchedAt: Date.now() });
      return { status: "instrumental" };
    }

    await this.remember(key, { status: "missing", fetchedAt: Date.now() });
    return { status: "missing" };
  }

  private async rememberFound(key: string, track: LyricsTrack, payload: LrclibResponse, lines: LyricsLine[]): Promise<LyricsLookupResult> {
    const lyrics: SyncedLyrics = {
      source: "LRCLIB",
      trackName: typeof payload.trackName === "string" ? payload.trackName : track.title,
      artistName: typeof payload.artistName === "string" ? payload.artistName : track.artist,
      lines
    };
    await this.remember(key, { status: "found", fetchedAt: Date.now(), lyrics });
    return { status: "found", lyrics };
  }

  private async request(url: URL): Promise<Response> {
    const waitUntil = Math.max(this.blockedUntil, this.lastRequestAt + REQUEST_SPACING);
    if (waitUntil > Date.now()) await wait(waitUntil - Date.now());
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
    return response;
  }

  private async getCached(key: string): Promise<LyricsLookupResult | "expired"> {
    const cache = await this.readCache();
    const entry = cache.entries[key];
    if (!entry) return "expired";
    const ttl = entry.status === "found" ? FOUND_TTL : MISSING_TTL;
    if (Date.now() - entry.fetchedAt > ttl) return "expired";
    if (entry.status === "found") return { status: "found", lyrics: entry.lyrics };
    return { status: entry.status };
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
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as {
        version?: unknown;
        entries?: Record<string, CacheEntry>;
      };
      if (parsed.version === 4 && parsed.entries && typeof parsed.entries === "object") {
        this.cache = { version: 4, entries: parsed.entries as Record<string, CacheEntry> };
        return this.cache;
      }
      if ((parsed.version === 1 || parsed.version === 2 || parsed.version === 3) && parsed.entries && typeof parsed.entries === "object") {
        const entries = Object.fromEntries(
          Object.entries(parsed.entries).filter(([, entry]) => entry.status === "found")
        ) as Record<string, CacheEntry>;
        this.cache = { version: 4, entries };
        return this.cache;
      }
    } catch { /* La primera consulta comienza con un caché vacío. */ }
    this.cache = { version: 4, entries: {} };
    return this.cache;
  }
}

function parseResponseLines(payload: LrclibResponse | undefined): LyricsLine[] {
  return typeof payload?.syncedLyrics === "string" ? parseLrc(payload.syncedLyrics) : [];
}

function hasLyricsText(payload: LrclibResponse): boolean {
  return (typeof payload.plainLyrics === "string" && payload.plainLyrics.trim().length > 0)
    || (typeof payload.syncedLyrics === "string" && payload.syncedLyrics.trim().length > 0);
}

function selectBestSynchronizedCandidate(
  candidates: LrclibResponse[],
  track: LyricsTrack,
  duration: number
): { payload: LrclibResponse; lines: LyricsLine[] } | undefined {
  return candidates
    .map((payload) => ({ payload, lines: parseResponseLines(payload), score: scoreCandidate(payload, track, duration) }))
    .filter((candidate) => candidate.lines.length > 0 && candidate.score >= 100)
    .sort((a, b) => b.score - a.score)[0];
}

function isStrongCandidate(candidate: LrclibResponse, track: LyricsTrack, duration: number): boolean {
  return scoreCandidate(candidate, track, duration) >= 100;
}

function scoreCandidate(candidate: LrclibResponse, track: LyricsTrack, duration: number): number {
  const candidateTitle = normalizeLookupText(candidate.trackName);
  const candidateArtist = normalizeLookupText(candidate.artistName);
  const title = normalizeLookupText(track.title);
  const artist = normalizeLookupText(track.artist);
  if (!candidateTitle || !candidateArtist || candidateArtist !== artist) return 0;
  const titleScore = candidateTitle === title
    ? 100
    : candidateTitle.includes(title) || title.includes(candidateTitle)
      ? 70
      : 0;
  if (titleScore === 0) return 0;

  const candidateDuration = typeof candidate.duration === "number" ? candidate.duration : Number(candidate.duration);
  const durationDifference = Number.isFinite(candidateDuration) ? Math.abs(candidateDuration - duration) : Number.POSITIVE_INFINITY;
  const albumMatches = normalizeLookupText(candidate.albumName) === normalizeLookupText(track.album);
  if (durationDifference > 15 && !albumMatches) return 0;
  return titleScore + (albumMatches ? 25 : 0) + Math.max(0, 45 - durationDifference * 4);
}

function normalizeLookupText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    : "";
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
