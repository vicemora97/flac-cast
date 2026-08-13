import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from "electron";
import squirrelStartup = require("electron-squirrel-startup");
import { join } from "node:path";
import { LibraryManager, LibraryUnavailableError } from "./library.js";
import { LibraryWatcher } from "./library-watcher.js";
import { MediaServer } from "./media-server.js";
import { CastController } from "./cast-controller.js";
import { LosslessTranscoder } from "./lossless-transcoder.js";
import { PreferencesStore } from "./preferences.js";
import type { CastTrack, LibraryResult, PlaybackCommand, TaskbarPlaybackState } from "../shared/contracts.js";

if (squirrelStartup) app.quit();
app.setName("Flac Cast");
// Conserva la ubicación histórica para no perder bibliotecas ni caché al renombrar la app.
app.setPath("userData", join(app.getPath("appData"), "Hires Local"));
app.setAppUserModelId("com.squirrel.FlacCast.FlacCast");

const mediaServer = new MediaServer();
const transcoder = new LosslessTranscoder();
let preferences: PreferencesStore;
let libraryManager: LibraryManager;
let libraryWatcher: LibraryWatcher;
let libraryActivityCount = 0;
let castPrewarmGeneration = 0;
let tray: Tray | undefined;
let isQuitting = false;
const taskbarStateCache = new Map<number, string>();
const taskbarIconCache = new Map<string, Electron.NativeImage>();
const castController = new CastController(
  async (track) => {
    if (!track.castUrl) throw new Error("La pista no tiene una URL local para Chromecast");
    const sourcePath = mediaServer.resolveFile(track.castUrl);
    if (!sourcePath) throw new Error("No se encontró el archivo original para preparar el FLAC");
    const prepared = await transcoder.prepareFlac(sourcePath);
    transcoder.setActiveFile(prepared.filePath);
    const endpoint = mediaServer.register(prepared.filePath);
    if (!endpoint.castUrl) throw new Error("No hay una dirección LAN para transmitir el FLAC preparado");
    return { url: endpoint.castUrl, repacked: prepared.repacked };
  },
  async (track, targetBits) => {
    if (!track.castUrl) throw new Error("La pista no tiene una URL local para Chromecast");
    const sourcePath = mediaServer.resolveFile(track.castUrl);
    if (!sourcePath) throw new Error("No se encontró el archivo local para convertirlo");
    const wavPath = await transcoder.toWav(sourcePath, targetBits, track.sampleRate);
    transcoder.setActiveFile(wavPath);
    const endpoint = mediaServer.register(wavPath);
    if (!endpoint.castUrl) throw new Error("No hay una dirección LAN para transmitir el WAV");
    return endpoint.castUrl;
  }
);

async function createWindow(): Promise<void> {
  await mediaServer.start();
  const savedWindow = preferences.getWindowState();

  const window = new BrowserWindow({
    width: savedWindow?.width ?? 1120,
    height: savedWindow?.height ?? 760,
    x: savedWindow?.x,
    y: savedWindow?.y,
    minWidth: 760,
    minHeight: 520,
    title: "Flac Cast",
    icon: join(app.getAppPath(), "assets", "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#101210",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Los temporizadores ocultos ya usan frecuencias reducidas; mantener el
      // renderer despierto evita un tirón y retrasos de autoavance al restaurar.
      backgroundThrottling: false
    }
  });

  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Error cargando preload: ${preloadPath}`, error);
  });

  let windowSaveTimer: NodeJS.Timeout | undefined;
  const saveWindowState = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    void preferences.setWindowState({ ...bounds, maximized: window.isMaximized() });
  };
  const scheduleWindowSave = () => {
    if (windowSaveTimer) clearTimeout(windowSaveTimer);
    windowSaveTimer = setTimeout(saveWindowState, 350);
  };
  window.on("move", scheduleWindowSave);
  window.on("resize", scheduleWindowSave);
  window.on("minimize", () => libraryWatcher.setActive(false));
  window.on("hide", () => libraryWatcher.setActive(false));
  window.on("restore", () => libraryWatcher.setActive(true));
  window.on("show", () => libraryWatcher.setActive(true));
  window.on("focus", () => libraryWatcher.setActive(true));
  window.on("close", (event) => {
    if (windowSaveTimer) clearTimeout(windowSaveTimer);
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    preferences.setWindowStateSync({ ...bounds, maximized: window.isMaximized() });
    if (!isQuitting && process.env.HIRES_SMOKE_TEST !== "1") {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => taskbarStateCache.delete(window.id));

  if (savedWindow?.maximized) window.maximize();

  await window.loadFile(join(__dirname, "../renderer/index.html"));
  createTray(window);
  setTaskbarButtons(window, { hasTrack: false, isPlaying: false, canGoPrevious: false, canGoNext: false });

  if (process.env.HIRES_SMOKE_TEST === "1") {
    await new Promise((resolve) => setTimeout(resolve, 3_500));
    const taskbarControls = setTaskbarButtons(window, { hasTrack: true, isPlaying: true, canGoPrevious: true, canGoNext: true });
    const diagnostics = await window.webContents.executeJavaScript(`(() => {
      const transportItems = [...document.querySelectorAll('.transport-controls > *')];
      const centers = transportItems.map((item) => { const rect = item.getBoundingClientRect(); return rect.top + rect.height / 2; });
      document.querySelector('.track-row .more-button')?.click();
      const trackContextMenu = !document.querySelector('#context-menu')?.hidden && document.querySelector('#context-menu')?.textContent?.includes('Agregar a la cola');
      document.querySelector('#queue-panel-button')?.click();
      const queuePanelVisible = !document.querySelector('#queue-panel')?.hidden;
      const search = document.querySelector('#library-search');
      search.value = 'Mirror';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const searchResults = document.querySelectorAll('.search-results .track-row').length;
      return JSON.stringify({
        api: typeof window.hires,
        chooseLibrary: typeof window.hires?.chooseLibrary,
        button: Boolean(document.querySelector('#choose-folder')),
        buttonDisabled: document.querySelector('#choose-folder')?.disabled,
        ffmpeg: ${transcoder.isAvailable()},
        folder: document.querySelector('#folder')?.textContent,
        count: document.querySelector('#count')?.textContent,
        renderedTracks: document.querySelectorAll('.track').length,
        libraryFolders: document.querySelectorAll('.library-folder').length,
        playlistsTab: Boolean(document.querySelector('#playlists-tab')),
        trackMenuButtons: document.querySelectorAll('.track-row .more-button').length,
        trackContextMenu,
        queuePanelVisible,
        playlistEditDialog: Boolean(document.querySelector('#playlist-edit-dialog')),
        searchResults,
        activityIndicator: Boolean(document.querySelector('#library-activity')),
        customTransport: Boolean(document.querySelector('#local-player .timeline')),
        transportAligned: Math.max(...centers) - Math.min(...centers) < 1,
        tabIndicatorWidth: getComputedStyle(document.querySelector('.view-tabs')).getPropertyValue('--tab-pill-width'),
        taskbarControls: ${taskbarControls}
      });
    })()`);
    console.log(`HIRES_SMOKE ${diagnostics}`);
    setTimeout(() => {
      mediaServer.stop();
      castController.destroy();
      app.exit(0);
    }, 250);
  }
}

ipcMain.handle("library:choose", async (event): Promise<LibraryResult> => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = {
    title: "Selecciona tu carpeta de música",
    properties: ["openDirectory"]
  };
  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  if (selection.canceled || !selection.filePaths[0]) return getLibraryResult();

  const folder = selection.filePaths[0];
  await preferences.addLibraryFolder(folder);
  libraryWatcher.setFolders(preferences.getLibraryFolders());
  return refreshLibraries([folder]);
});

ipcMain.handle("library:saved", async (): Promise<LibraryResult> => {
  return getLibraryResult();
});

ipcMain.handle("library:refresh", async (): Promise<LibraryResult> => {
  return refreshLibraries(preferences.getLibraryFolders());
});

ipcMain.handle("library:remove", async (_event, folder: string): Promise<LibraryResult> => {
  await preferences.removeLibraryFolder(folder);
  await libraryManager.remove(folder);
  libraryWatcher.setFolders(preferences.getLibraryFolders());
  return getLibraryResult();
});

ipcMain.handle("ui:set-scale", (event, scale: number) => {
  const safeScale = Math.max(0.8, Math.min(1.5, Number.isFinite(scale) ? scale : 1));
  event.sender.setZoomFactor(safeScale);
  return safeScale;
});

ipcMain.handle("cast:devices", () => castController.listDevices());
ipcMain.handle("cast:state", (_event, refreshVolume = true) => refreshVolume ? castController.getFreshState() : castController.getState());
ipcMain.handle("cast:connect", (_event, deviceId: string) => castController.connect(deviceId));
ipcMain.handle("cast:track", (_event, track: CastTrack) => castController.castTrack(track));
ipcMain.handle("cast:command", (_event, command: "play" | "pause") => castController.command(command));
ipcMain.handle("cast:seek", (_event, seconds: number) => castController.seek(seconds));
ipcMain.handle("cast:volume", (_event, level: number) => castController.setVolume(level));
ipcMain.handle("cast:prewarm", async (_event, tracks: CastTrack[]): Promise<number> => {
  const generation = ++castPrewarmGeneration;
  let prepared = 0;
  for (const [index, track] of tracks.slice(0, 5).entries()) {
    if (generation !== castPrewarmGeneration || !castController.getState().connected) break;
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    if (generation !== castPrewarmGeneration) break;
    if (!track.castUrl) continue;
    const sourcePath = mediaServer.resolveFile(track.castUrl);
    if (!sourcePath) continue;
    try {
      await transcoder.prepareFlac(sourcePath);
      prepared += 1;
    } catch (error) {
      console.warn(`No se pudo precalentar ${track.title}`, error);
    }
  }
  return prepared;
});
ipcMain.handle("cast:disconnect", () => {
  castPrewarmGeneration += 1;
  transcoder.setActiveFile(undefined);
  return castController.disconnect();
});
ipcMain.handle("media:last-access", () => mediaServer.getLastMediaAccess());
ipcMain.on("playback:taskbar-state", (event, state: TaskbarPlaybackState) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) setTaskbarButtons(window, state);
});
ipcMain.handle("playlist:list", () => preferences.getPlaylists());
ipcMain.handle("playlist:create", async (_event, name: string) => {
  await preferences.createPlaylist(name);
  return preferences.getPlaylists();
});
ipcMain.handle("playlist:update", async (_event, id: string, changes: { name?: string; artworkDataUrl?: string | null }) => {
  await preferences.updatePlaylist(id, changes);
  return preferences.getPlaylists();
});
ipcMain.handle("playlist:choose-artwork", async (event): Promise<string | undefined> => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = {
    title: "Selecciona una portada para la playlist",
    properties: ["openFile"],
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg"] }]
  };
  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  const imagePath = selection.filePaths[0];
  if (selection.canceled || !imagePath) return undefined;
  const source = nativeImage.createFromPath(imagePath);
  if (source.isEmpty()) throw new Error("No se pudo leer la imagen seleccionada");
  const size = source.getSize();
  const side = Math.min(size.width, size.height);
  const square = source.crop({
    x: Math.floor((size.width - side) / 2),
    y: Math.floor((size.height - side) / 2),
    width: side,
    height: side
  });
  return square.resize({ width: 512, height: 512, quality: "good" }).toDataURL();
});
ipcMain.handle("playlist:delete", async (_event, id: string) => {
  await preferences.deletePlaylist(id);
  return preferences.getPlaylists();
});
ipcMain.handle("playlist:add-track", async (_event, playlistId: string, trackId: string) => {
  await preferences.addTrackToPlaylist(playlistId, trackId);
  return preferences.getPlaylists();
});
ipcMain.handle("playlist:remove-track", async (_event, playlistId: string, trackId: string) => {
  await preferences.removeTrackFromPlaylist(playlistId, trackId);
  return preferences.getPlaylists();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  preferences = new PreferencesStore(app.getPath("userData"));
  await preferences.load();
  libraryManager = new LibraryManager(app.getPath("userData"), mediaServer);
  if (preferences.getLibraryFolders().length === 0) {
    const recoveredFolders = await libraryManager.getCachedFolders();
    if (recoveredFolders.length > 0) await preferences.setLibraryFolders(recoveredFolders);
  }
  libraryWatcher = new LibraryWatcher((folder) => {
    void refreshLibraries([folder]).then((result) => {
      if (!result.changed) return;
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send("library:updated", result);
    }).catch((error) => console.warn("No se pudo actualizar la biblioteca observada", error));
  });
  libraryWatcher.setFolders(preferences.getLibraryFolders());
  await createWindow();
});
app.on("window-all-closed", () => {
  mediaServer.stop();
  castController.destroy();
  libraryWatcher?.destroy();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => { isQuitting = true; });
app.on("activate", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) void createWindow();
  else {
    window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

async function getLibraryResult(): Promise<LibraryResult> {
  const folders = preferences.getLibraryFolders();
  return {
    folder: folders[0],
    folders,
    tracks: await libraryManager.loadCached(folders)
  };
}

async function refreshLibraries(foldersToRefresh: string[]): Promise<LibraryResult> {
  setLibraryActivity(true);
  const folders = preferences.getLibraryFolders();
  const unavailableFolders: string[] = [];
  let changed = false;
  try {
    for (const folder of foldersToRefresh.filter((item) => folders.some((folder) => sameFolder(folder, item)))) {
      try {
        const refresh = await libraryManager.refresh(folder);
        changed ||= refresh.changed;
      } catch (error) {
        if (error instanceof LibraryUnavailableError) unavailableFolders.push(folder);
        else throw error;
      }
    }
    return {
      folder: folders[0],
      folders,
      tracks: await libraryManager.loadCached(folders),
      cacheUsed: unavailableFolders.length > 0,
      unavailableFolders,
      changed,
      refreshWarning: unavailableFolders.length > 0 ? "Algunas bibliotecas no están disponibles; se muestra su índice guardado" : undefined
    };
  } finally {
    setLibraryActivity(false);
  }
}

function setLibraryActivity(active: boolean): void {
  libraryActivityCount = Math.max(0, libraryActivityCount + (active ? 1 : -1));
  const isActive = libraryActivityCount > 0;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("library:activity", isActive);
}

function sameFolder(a: string, b: string): boolean {
  return a.replace(/[\\/]+$/, "").localeCompare(b.replace(/[\\/]+$/, ""), undefined, { sensitivity: "accent" }) === 0;
}

function setTaskbarButtons(window: BrowserWindow, state: TaskbarPlaybackState): boolean {
  if (process.platform !== "win32" || window.isDestroyed()) return false;
  const signature = JSON.stringify(state);
  if (taskbarStateCache.get(window.id) === signature) return true;
  const assets = join(app.getAppPath(), "assets");
  const icon = (fileName: string) => {
    let image = taskbarIconCache.get(fileName);
    if (!image) {
      image = nativeImage.createFromPath(join(assets, fileName));
      taskbarIconCache.set(fileName, image);
    }
    return image;
  };
  const send = (command: PlaybackCommand) => {
    if (!window.isDestroyed()) window.webContents.send("playback:taskbar-command", command);
  };
  const applied = window.setThumbarButtons([
    {
      tooltip: "Canción anterior",
      icon: icon("thumbar-previous.png"),
      flags: state.canGoPrevious ? [] : ["disabled"],
      click: () => send("previous")
    },
    {
      tooltip: state.isPlaying ? "Pausar" : "Reproducir",
      icon: icon(state.isPlaying ? "thumbar-pause.png" : "thumbar-play.png"),
      flags: state.hasTrack ? [] : ["disabled"],
      click: () => send("toggle")
    },
    {
      tooltip: "Canción siguiente",
      icon: icon("thumbar-next.png"),
      flags: state.canGoNext ? [] : ["disabled"],
      click: () => send("next")
    }
  ]);
  if (applied) taskbarStateCache.set(window.id, signature);
  if (!applied) console.warn("Windows rechazó la actualización de los controles de la barra de tareas");
  return applied;
}

function createTray(window: BrowserWindow): void {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), "assets", "icon.png")));
  tray.setToolTip("Flac Cast");
  const showWindow = () => {
    if (window.isDestroyed()) return;
    window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Flac Cast", click: showWindow },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", showWindow);
}
