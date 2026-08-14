import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Playlist } from "../shared/contracts.js";

export type SavedWindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
};

type PreferencesData = {
  version: 3;
  libraryFolders: string[];
  playlists: Playlist[];
  window?: SavedWindowState;
};

type LegacyPreferencesData = {
  version?: 1;
  libraryFolder?: string;
  window?: SavedWindowState;
};

export class PreferencesStore {
  private readonly filePath: string;
  private readonly temporaryPath: string;
  private data: PreferencesData = { version: 3, libraryFolders: [], playlists: [] };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataFolder: string) {
    this.filePath = join(userDataFolder, "settings.json");
    this.temporaryPath = join(userDataFolder, "settings.tmp.json");
  }

  async load(): Promise<void> {
    try {
      this.data = parsePreferences(JSON.parse(await readFile(this.filePath, "utf8")) as unknown);
    } catch {
      try {
        this.data = parsePreferences(JSON.parse(readFileSync(this.temporaryPath, "utf8")) as unknown);
      } catch {
        this.data = { version: 3, libraryFolders: [], playlists: [] };
      }
    }
  }

  getLibraryFolders(): string[] {
    return [...this.data.libraryFolders];
  }

  getWindowState(): SavedWindowState | undefined {
    return this.data.window ? { ...this.data.window } : undefined;
  }

  getPlaylists(): Playlist[] {
    return this.data.playlists.map((playlist) => ({ ...playlist, trackIds: [...playlist.trackIds] }));
  }

  async createPlaylist(name: string): Promise<void> {
    const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!cleanName) throw new Error("La playlist necesita un nombre");
    const now = Date.now();
    this.data.playlists.push({ id: randomUUID(), name: cleanName, trackIds: [], createdAt: now, updatedAt: now });
    await this.save();
  }

  async updatePlaylist(id: string, changes: { name?: string; artworkDataUrl?: string | null }): Promise<void> {
    const playlist = this.data.playlists.find((item) => item.id === id);
    if (!playlist) throw new Error("La playlist ya no existe");
    if (changes.name !== undefined) {
      const cleanName = changes.name.trim().replace(/\s+/g, " ").slice(0, 80);
      if (!cleanName) throw new Error("La playlist necesita un nombre");
      playlist.name = cleanName;
    }
    if (changes.artworkDataUrl !== undefined) {
      if (changes.artworkDataUrl === null) delete playlist.artworkDataUrl;
      else playlist.artworkDataUrl = changes.artworkDataUrl;
    }
    playlist.updatedAt = Date.now();
    await this.save();
  }

  async deletePlaylist(id: string): Promise<void> {
    this.data.playlists = this.data.playlists.filter((playlist) => playlist.id !== id);
    await this.save();
  }

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlist = this.data.playlists.find((item) => item.id === playlistId);
    if (!playlist) throw new Error("La playlist ya no existe");
    if (!playlist.trackIds.includes(trackId)) playlist.trackIds.push(trackId);
    playlist.updatedAt = Date.now();
    await this.save();
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlist = this.data.playlists.find((item) => item.id === playlistId);
    if (!playlist) throw new Error("La playlist ya no existe");
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    playlist.updatedAt = Date.now();
    await this.save();
  }

  async removeTrackFromAllPlaylists(trackId: string): Promise<void> {
    let changed = false;
    for (const playlist of this.data.playlists) {
      const nextTrackIds = playlist.trackIds.filter((id) => id !== trackId);
      if (nextTrackIds.length === playlist.trackIds.length) continue;
      playlist.trackIds = nextTrackIds;
      playlist.updatedAt = Date.now();
      changed = true;
    }
    if (changed) await this.save();
  }

  setLibraryFolders(folders: string[]): Promise<void> {
    this.data.libraryFolders = uniqueFolders(folders);
    return this.save();
  }

  async addLibraryFolder(folder: string): Promise<void> {
    await this.setLibraryFolders([...this.data.libraryFolders, folder]);
  }

  async removeLibraryFolder(folder: string): Promise<void> {
    const key = normalizeFolderKey(folder);
    await this.setLibraryFolders(this.data.libraryFolders.filter((item) => normalizeFolderKey(item) !== key));
  }

  setWindowState(window: SavedWindowState): Promise<void> {
    this.data.window = { ...window };
    return this.save();
  }

  setWindowStateSync(window: SavedWindowState): void {
    this.data.window = { ...window };
    const snapshot = this.snapshot();
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.temporaryPath}.${randomUUID()}`;
    writeFileSync(temporaryPath, snapshot, "utf8");
    renameSync(temporaryPath, this.filePath);
  }

  private snapshot(): string {
    return `${JSON.stringify(this.data, null, 2)}\n`;
  }

  private save(): Promise<void> {
    const snapshot = this.snapshot();
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.temporaryPath}.${randomUUID()}`;
        await writeFile(temporaryPath, snapshot, "utf8");
        await rename(temporaryPath, this.filePath);
      });
    return this.writeQueue;
  }
}

function parsePreferences(value: unknown): PreferencesData {
  if (!value || typeof value !== "object") throw new Error("Preferencias inválidas");
  const parsed = value as {
    version?: number;
    libraryFolders?: unknown;
    libraryFolder?: unknown;
    playlists?: unknown;
    window?: SavedWindowState;
  };
  if ((parsed.version === 2 || parsed.version === 3) && Array.isArray(parsed.libraryFolders)) {
    return {
      version: 3,
      libraryFolders: uniqueFolders(parsed.libraryFolders.filter((folder): folder is string => typeof folder === "string")),
      playlists: parsePlaylists(parsed.playlists),
      window: parsed.window
    };
  }
  return {
    version: 3,
    libraryFolders: typeof parsed.libraryFolder === "string" ? [parsed.libraryFolder] : [],
    playlists: [],
    window: parsed.window
  };
}

function parsePlaylists(value: unknown): Playlist[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Playlist[] => {
    if (!item || typeof item !== "object") return [];
    const playlist = item as Partial<Playlist>;
    if (typeof playlist.id !== "string" || typeof playlist.name !== "string" || !Array.isArray(playlist.trackIds)) return [];
    return [{
      id: playlist.id,
      name: playlist.name.slice(0, 80),
      artworkDataUrl: typeof playlist.artworkDataUrl === "string" && playlist.artworkDataUrl.startsWith("data:image/")
        ? playlist.artworkDataUrl
        : undefined,
      trackIds: [...new Set(playlist.trackIds.filter((id): id is string => typeof id === "string"))],
      createdAt: typeof playlist.createdAt === "number" ? playlist.createdAt : Date.now(),
      updatedAt: typeof playlist.updatedAt === "number" ? playlist.updatedAt : Date.now()
    }];
  });
}

function uniqueFolders(folders: string[]): string[] {
  const seen = new Set<string>();
  return folders.filter((folder) => {
    const key = normalizeFolderKey(folder);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeFolderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, "").toLocaleLowerCase();
}
