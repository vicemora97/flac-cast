import { contextBridge, ipcRenderer } from "electron";
import type { HiresApi } from "../shared/contracts.js";

const api: HiresApi = {
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  openRepository: () => ipcRenderer.invoke("app:open-repository"),
  openProjectPage: (page) => ipcRenderer.invoke("app:open-project-page", page),
  setLanguage: (language) => ipcRenderer.invoke("app:set-language", language),
  setUiScale: (scale) => ipcRenderer.invoke("ui:set-scale", scale),
  loadSavedLibrary: () => ipcRenderer.invoke("library:saved"),
  refreshLibrary: () => ipcRenderer.invoke("library:refresh"),
  chooseLibrary: () => ipcRenderer.invoke("library:choose"),
  removeLibrary: (folder) => ipcRenderer.invoke("library:remove", folder),
  revealTrack: (localUrl) => ipcRenderer.invoke("track:reveal", localUrl),
  trashTrack: (localUrl, title, trackId) => ipcRenderer.invoke("track:trash", localUrl, title, trackId),
  onLibraryUpdated: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, result: Parameters<typeof listener>[0]) => listener(result);
    ipcRenderer.on("library:updated", handler);
    return () => ipcRenderer.removeListener("library:updated", handler);
  },
  onLibraryActivity: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, active: boolean) => listener(active);
    ipcRenderer.on("library:activity", handler);
    return () => ipcRenderer.removeListener("library:activity", handler);
  },
  getCastDevices: () => ipcRenderer.invoke("cast:devices"),
  getCastState: (refreshVolume) => ipcRenderer.invoke("cast:state", refreshVolume),
  connectCast: (deviceId) => ipcRenderer.invoke("cast:connect", deviceId),
  castTrack: (track, startTimeSeconds) => ipcRenderer.invoke("cast:track", track, startTimeSeconds),
  castCommand: (command) => ipcRenderer.invoke("cast:command", command),
  castSeek: (seconds) => ipcRenderer.invoke("cast:seek", seconds),
  castVolume: (level) => ipcRenderer.invoke("cast:volume", level),
  prewarmCastTracks: (tracks) => ipcRenderer.invoke("cast:prewarm", tracks),
  disconnectCast: () => ipcRenderer.invoke("cast:disconnect"),
  getMediaAccess: () => ipcRenderer.invoke("media:last-access"),
  getLyrics: (track) => ipcRenderer.invoke("lyrics:get", track),
  setTaskbarPlaybackState: (state) => ipcRenderer.send("playback:taskbar-state", state),
  onTaskbarPlaybackCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: Parameters<typeof listener>[0]) => listener(command);
    ipcRenderer.on("playback:taskbar-command", handler);
    return () => ipcRenderer.removeListener("playback:taskbar-command", handler);
  },
  getPlaylists: () => ipcRenderer.invoke("playlist:list"),
  createPlaylist: (name) => ipcRenderer.invoke("playlist:create", name),
  updatePlaylist: (id, changes) => ipcRenderer.invoke("playlist:update", id, changes),
  choosePlaylistArtwork: () => ipcRenderer.invoke("playlist:choose-artwork"),
  deletePlaylist: (id) => ipcRenderer.invoke("playlist:delete", id),
  addTrackToPlaylist: (playlistId, trackId) => ipcRenderer.invoke("playlist:add-track", playlistId, trackId),
  removeTrackFromPlaylist: (playlistId, trackId) => ipcRenderer.invoke("playlist:remove-track", playlistId, trackId)
};

contextBridge.exposeInMainWorld("hires", api);
