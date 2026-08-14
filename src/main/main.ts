import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import squirrelStartup = require("electron-squirrel-startup");
import { unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { LibraryManager, LibraryUnavailableError } from "./library.js";
import { LibraryWatcher } from "./library-watcher.js";
import { MediaServer } from "./media-server.js";
import { CastController } from "./cast-controller.js";
import { LosslessTranscoder } from "./lossless-transcoder.js";
import { LyricsService } from "./lyrics.js";
import { PreferencesStore } from "./preferences.js";
import type { CastTrack, LibraryResult, PlaybackCommand, TaskbarPlaybackState } from "../shared/contracts.js";

if (squirrelStartup) app.quit();
app.setName("Flac Cast");
// Conserva la ubicación histórica para no perder bibliotecas ni caché al renombrar la app.
app.setPath("userData", join(app.getPath("appData"), "Hires Local"));
app.setAppUserModelId("com.squirrel.FlacCast.FlacCast");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const mediaServer = new MediaServer();
const transcoder = new LosslessTranscoder();
const lyricsService = new LyricsService(app.getPath("userData"), app.getVersion());
let preferences: PreferencesStore;
let libraryManager: LibraryManager;
let libraryWatcher: LibraryWatcher;
let libraryActivityCount = 0;
let castPrewarmGeneration = 0;
let tray: Tray | undefined;
let isQuitting = false;
let mediaShortcutsRegistered = false;
let appLanguage: "en" | "es" = "en";
const taskbarStateCache = new Map<number, string>();
const taskbarPlaybackStates = new Map<number, TaskbarPlaybackState>();
const taskbarIconCache = new Map<string, Electron.NativeImage>();
const castController = new CastController(
  async (track) => {
    if (!track.castUrl) throw new Error("La pista no tiene una URL local para Chromecast");
    const sourcePath = mediaServer.resolveFile(track.castUrl);
    if (!sourcePath) throw new Error("No se encontró el archivo original para preparar el FLAC");
    const prepared = await transcoder.prepareFlac(sourcePath);
    transcoder.setActiveFile(prepared.filePath);
    const endpoint = mediaServer.register(prepared.filePath, castController.getReceiverHost());
    if (!endpoint.castUrl) throw new Error("No hay una dirección LAN para transmitir el FLAC preparado");
    return { url: endpoint.castUrl, repacked: prepared.repacked };
  },
  async (track, targetBits) => {
    if (!track.castUrl) throw new Error("La pista no tiene una URL local para Chromecast");
    const sourcePath = mediaServer.resolveFile(track.castUrl);
    if (!sourcePath) throw new Error("No se encontró el archivo local para convertirlo");
    const wavPath = await transcoder.toWav(sourcePath, targetBits, track.sampleRate);
    transcoder.setActiveFile(wavPath);
    const endpoint = mediaServer.register(wavPath, castController.getReceiverHost());
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
  window.on("closed", () => {
    taskbarStateCache.delete(window.id);
    taskbarPlaybackStates.delete(window.id);
  });

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
      const trackContextMenu = !document.querySelector('#context-menu')?.hidden && document.querySelector('#context-menu')?.textContent?.includes('Add to queue');
      document.querySelector('#queue-panel-button')?.click();
      const queuePanelVisible = !document.querySelector('#queue-panel')?.hidden;
      const languageSelect = document.querySelector('#language');
      const initialLanguage = document.documentElement.lang;
      languageSelect.value = 'es';
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const spanishSwitch = document.documentElement.lang === 'es' && document.querySelector('#tracks-tab')?.textContent === 'Pistas';
      languageSelect.value = 'en';
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const search = document.querySelector('#library-search');
      search.value = 'Mirror';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const searchResults = document.querySelectorAll('.search-results .track-row').length;
      return JSON.stringify({
        api: typeof window.hires,
        chooseLibrary: typeof window.hires?.chooseLibrary,
        button: Boolean(document.querySelector('#choose-folder')),
        buttonDisabled: document.querySelector('#choose-folder')?.disabled,
        languageSelector: Boolean(document.querySelector('#language')),
        documentLanguage: initialLanguage,
        spanishSwitch,
        ffmpeg: ${transcoder.isAvailable()},
        folder: document.querySelector('#folder')?.textContent,
        count: document.querySelector('#count')?.textContent,
        renderedTracks: document.querySelectorAll('.track').length,
        libraryFolders: document.querySelectorAll('.library-folder').length,
        playlistsTab: Boolean(document.querySelector('#playlists-tab')),
        trackMenuButtons: document.querySelectorAll('.track-row .more-button').length,
        trackContextMenu,
        queuePanelVisible,
        lyricsButton: Boolean(document.querySelector('#lyrics-button')),
        lyricsPanel: Boolean(document.querySelector('#lyrics-panel')),
        playlistEditDialog: Boolean(document.querySelector('#playlist-edit-dialog')),
        searchResults,
        activityIndicator: Boolean(document.querySelector('#library-activity')),
        customTransport: Boolean(document.querySelector('#local-player .timeline')),
        transportAligned: Math.max(...centers) - Math.min(...centers) < 1,
        tabIndicatorWidth: getComputedStyle(document.querySelector('.view-tabs')).getPropertyValue('--tab-pill-width'),
        taskbarControls: ${taskbarControls},
        mediaShortcuts: ${mediaShortcutsRegistered}
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
    title: nativeText("selectMusicFolder"),
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

ipcMain.handle("app:version", (): string => app.getVersion());

ipcMain.handle("app:open-repository", async (): Promise<boolean> => {
  await shell.openExternal("https://github.com/vicemora97/flac-cast");
  return true;
});

ipcMain.handle("app:set-language", (_event, language: "en" | "es"): "en" | "es" => {
  appLanguage = language === "es" ? "es" : "en";
  for (const window of BrowserWindow.getAllWindows()) {
    updateTrayMenu(window);
    taskbarStateCache.delete(window.id);
    const state = taskbarPlaybackStates.get(window.id);
    if (state) setTaskbarButtons(window, state);
  }
  return appLanguage;
});

ipcMain.handle("track:reveal", (_event, localUrl: string): boolean => {
  const source = resolveLibraryTrack(localUrl);
  if (!source) throw new Error("La pista ya no pertenece a una biblioteca registrada");
  shell.showItemInFolder(source.filePath);
  return true;
});

ipcMain.handle("track:trash", async (event, localUrl: string, title: string, trackId: string): Promise<LibraryResult | undefined> => {
  const source = resolveLibraryTrack(localUrl);
  if (!source) throw new Error("La pista ya no pertenece a una biblioteca registrada");
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const confirmation: Electron.MessageBoxOptions = {
    type: "warning",
    title: nativeText("deleteMusicFile"),
    message: nativeText("moveTrackToTrash", { title: title || nativeText("thisTrack") }),
    detail: `${nativeText("deleteOriginalDetail")}\n\n${source.filePath}`,
    buttons: [nativeText("cancel"), nativeText("moveToTrash")],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  };
  const firstChoice = parentWindow
    ? await dialog.showMessageBox(parentWindow, confirmation)
    : await dialog.showMessageBox(confirmation);
  if (firstChoice.response !== 1) return undefined;

  try {
    await shell.trashItem(source.filePath);
  } catch (trashError) {
    const permanentConfirmation: Electron.MessageBoxOptions = {
      type: "warning",
      title: nativeText("trashUnavailable"),
      message: nativeText("locationNoTrash"),
      detail: `${nativeText("nasPermanentDetail")}\n\n${source.filePath}\n\n${formatError(trashError)}`,
      buttons: [nativeText("cancel"), nativeText("deletePermanently")],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    };
    const secondChoice = parentWindow
      ? await dialog.showMessageBox(parentWindow, permanentConfirmation)
      : await dialog.showMessageBox(permanentConfirmation);
    if (secondChoice.response !== 1) return undefined;
    await unlink(source.filePath);
  }

  if (typeof trackId === "string") await preferences.removeTrackFromAllPlaylists(trackId);
  return refreshLibraries([source.libraryFolder]);
});

ipcMain.handle("ui:set-scale", (event, scale: number) => {
  const safeScale = Math.max(0.8, Math.min(1.5, Number.isFinite(scale) ? scale : 1));
  event.sender.setZoomFactor(safeScale);
  return safeScale;
});

ipcMain.handle("cast:devices", () => castController.listDevices());
ipcMain.handle("cast:state", (_event, refreshVolume = true) => refreshVolume ? castController.getFreshState() : castController.getState());
ipcMain.handle("cast:connect", (_event, deviceId: string) => castController.connect(deviceId));
ipcMain.handle("cast:track", (_event, track: CastTrack, startTimeSeconds?: number) => {
  const receiverHost = castController.getReceiverHost();
  const routedTrack: CastTrack = {
    ...track,
    castUrl: mediaServer.routeForReceiver(track.castUrl, receiverHost),
    castArtworkUrl: mediaServer.routeForReceiver(track.castArtworkUrl, receiverHost)
  };
  return castController.castTrack(routedTrack, startTimeSeconds);
});
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
ipcMain.handle("lyrics:get", (_event, track) => lyricsService.getSyncedLyrics(track));
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
    title: nativeText("selectPlaylistArtwork"),
    properties: ["openFile"],
    filters: [{ name: nativeText("images"), extensions: ["png", "jpg", "jpeg"] }]
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

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
  if (!window) return;
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
});

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerMediaShortcuts();
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
app.on("will-quit", () => { globalShortcut.unregisterAll(); });
app.on("activate", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) void createWindow();
  else {
    window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

function registerMediaShortcuts(): void {
  const shortcuts: Array<[string, PlaybackCommand]> = [
    ["MediaPlayPause", "toggle"],
    ["MediaNextTrack", "next"],
    ["MediaPreviousTrack", "previous"]
  ];
  const results = shortcuts.map(([accelerator, command]) => globalShortcut.register(accelerator, () => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    window?.webContents.send("playback:taskbar-command", command);
  }));
  mediaShortcutsRegistered = results.every(Boolean);
  if (!mediaShortcutsRegistered) {
    console.warn("Windows no entregó todas las teclas multimedia a Flac Cast; otra aplicación puede tenerlas registradas.");
  }
}

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

function resolveLibraryTrack(localUrl: string): { filePath: string; libraryFolder: string } | undefined {
  if (typeof localUrl !== "string") return undefined;
  const registeredFile = mediaServer.resolveFile(localUrl);
  if (!registeredFile) return undefined;
  const filePath = resolve(registeredFile);
  for (const libraryFolder of preferences.getLibraryFolders()) {
    const folderPath = resolve(libraryFolder);
    const pathWithinFolder = relative(folderPath, filePath);
    if (pathWithinFolder && pathWithinFolder !== ".." && !pathWithinFolder.startsWith(`..${sep}`) && !isAbsolute(pathWithinFolder)) {
      return { filePath, libraryFolder };
    }
  }
  return undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setTaskbarButtons(window: BrowserWindow, state: TaskbarPlaybackState): boolean {
  if (process.platform !== "win32" || window.isDestroyed()) return false;
  taskbarPlaybackStates.set(window.id, state);
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
      tooltip: nativeText("previousTrack"),
      icon: icon("thumbar-previous.png"),
      flags: state.canGoPrevious ? [] : ["disabled"],
      click: () => send("previous")
    },
    {
      tooltip: state.isPlaying ? nativeText("pause") : nativeText("play"),
      icon: icon(state.isPlaying ? "thumbar-pause.png" : "thumbar-play.png"),
      flags: state.hasTrack ? [] : ["disabled"],
      click: () => send("toggle")
    },
    {
      tooltip: nativeText("nextTrack"),
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
  if (tray) {
    updateTrayMenu(window);
    return;
  }
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), "assets", "icon.png")));
  tray.setToolTip("Flac Cast");
  updateTrayMenu(window);
}

function updateTrayMenu(window: BrowserWindow): void {
  if (!tray) return;
  const showWindow = () => {
    if (window.isDestroyed()) return;
    window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nativeText("openFlacCast"), click: showWindow },
    { type: "separator" },
    {
      label: nativeText("quit"),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.removeAllListeners("click");
  tray.on("click", showWindow);
}

type NativeTextKey = "selectMusicFolder" | "deleteMusicFile" | "moveTrackToTrash" | "thisTrack" | "deleteOriginalDetail"
  | "cancel" | "moveToTrash" | "trashUnavailable" | "locationNoTrash" | "nasPermanentDetail" | "deletePermanently"
  | "selectPlaylistArtwork" | "images" | "previousTrack" | "nextTrack" | "pause" | "play" | "openFlacCast" | "quit";

function nativeText(key: NativeTextKey, variables: Record<string, string> = {}): string {
  const english: Record<NativeTextKey, string> = {
    selectMusicFolder: "Select a music folder", deleteMusicFile: "Delete music file", moveTrackToTrash: "Move “{title}” to the Recycle Bin?",
    thisTrack: "this track", deleteOriginalDetail: "This deletes the original file, not only its Flac Cast entry.", cancel: "Cancel",
    moveToTrash: "Move to Recycle Bin", trashUnavailable: "The Recycle Bin is unavailable",
    locationNoTrash: "This location cannot move the file to the Recycle Bin.",
    nasPermanentDetail: "This commonly occurs with network or NAS folders. If you continue, the file will be deleted permanently.",
    deletePermanently: "Delete permanently", selectPlaylistArtwork: "Select playlist artwork", images: "Images",
    previousTrack: "Previous track", nextTrack: "Next track", pause: "Pause", play: "Play", openFlacCast: "Open Flac Cast", quit: "Quit"
  };
  const spanish: Record<NativeTextKey, string> = {
    selectMusicFolder: "Selecciona tu carpeta de música", deleteMusicFile: "Eliminar archivo de música", moveTrackToTrash: "¿Mover “{title}” a la Papelera?",
    thisTrack: "esta canción", deleteOriginalDetail: "Se eliminará el archivo original, no solo su entrada en Flac Cast.", cancel: "Cancelar",
    moveToTrash: "Mover a la Papelera", trashUnavailable: "La Papelera no está disponible",
    locationNoTrash: "Esta ubicación no permite mover el archivo a la Papelera.",
    nasPermanentDetail: "Esto suele ocurrir con carpetas de red o NAS. Si continúas, el archivo se eliminará permanentemente.",
    deletePermanently: "Eliminar permanentemente", selectPlaylistArtwork: "Selecciona una portada para la playlist", images: "Imágenes",
    previousTrack: "Canción anterior", nextTrack: "Canción siguiente", pause: "Pausar", play: "Reproducir", openFlacCast: "Abrir Flac Cast", quit: "Salir"
  };
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    (appLanguage === "es" ? spanish : english)[key]
  );
}
