import { watch, type FSWatcher } from "node:fs";
import { extname } from "node:path";

const RELEVANT_EXTENSIONS = new Set([".flac", ".jpg", ".jpeg", ".png", ".webp"]);

export class LibraryWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly folders = new Map<string, string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingFolders = new Map<string, string>();
  private readonly pollingTimer: NodeJS.Timeout;
  private active = true;

  constructor(private readonly onChange: (folder: string) => void) {
    // `fs.watch` funciona en recursos SMB modernos, pero algunos NAS no
    // notifican todos los eventos. Este sondeo es el respaldo de consistencia.
    this.pollingTimer = setInterval(() => {
      if (!this.active) return;
      for (const folder of this.folders.values()) this.schedule(folder, 0);
    }, 600_000);
    this.pollingTimer.unref();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      for (const [key, timer] of this.debounceTimers) {
        clearTimeout(timer);
        const folder = this.folders.get(key);
        if (folder) this.pendingFolders.set(key, folder);
      }
      this.debounceTimers.clear();
      return;
    }
    for (const folder of this.pendingFolders.values()) this.schedule(folder, 3_000);
    this.pendingFolders.clear();
  }

  setFolders(folders: string[]): void {
    const next = new Map(folders.map((folder) => [normalizeFolderKey(folder), folder]));
    for (const [key, watcher] of this.watchers) {
      if (next.has(key)) continue;
      watcher.close();
      this.watchers.delete(key);
    }
    for (const [key, timer] of this.debounceTimers) {
      if (next.has(key)) continue;
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
    this.folders.clear();
    for (const [key, folder] of next) {
      this.folders.set(key, folder);
      if (!this.watchers.has(key)) this.startWatching(key, folder);
    }
  }

  destroy(): void {
    clearInterval(this.pollingTimer);
    for (const watcher of this.watchers.values()) watcher.close();
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.watchers.clear();
    this.debounceTimers.clear();
    this.pendingFolders.clear();
  }

  private startWatching(key: string, folder: string): void {
    try {
      const watcher = watch(folder, { recursive: true }, (_event, fileName) => {
        if (fileName && !RELEVANT_EXTENSIONS.has(extname(String(fileName)).toLowerCase())) return;
        this.schedule(folder, 1_500);
      });
      watcher.on("error", () => {
        watcher.close();
        this.watchers.delete(key);
      });
      this.watchers.set(key, watcher);
    } catch {
      // El sondeo periódico reintentará aunque el NAS no esté conectado ahora.
    }
  }

  private schedule(folder: string, delay: number): void {
    const key = normalizeFolderKey(folder);
    if (!this.active) {
      this.pendingFolders.set(key, folder);
      return;
    }
    const current = this.debounceTimers.get(key);
    if (current) clearTimeout(current);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.onChange(folder);
      if (!this.watchers.has(key) && this.folders.has(key)) this.startWatching(key, folder);
    }, delay);
    timer.unref();
    this.debounceTimers.set(key, timer);
  }
}

function normalizeFolderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, "").toLocaleLowerCase();
}
