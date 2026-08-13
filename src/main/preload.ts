import { contextBridge, ipcRenderer } from "electron";
import type { HiresApi } from "../shared/contracts.js";

const api: HiresApi = {
  setUiScale: (scale) => ipcRenderer.invoke("ui:set-scale", scale),
  loadSavedLibrary: () => ipcRenderer.invoke("library:saved"),
  refreshLibrary: () => ipcRenderer.invoke("library:refresh"),
  chooseLibrary: () => ipcRenderer.invoke("library:choose"),
  removeLibrary: (folder) => ipcRenderer.invoke("library:remove", folder),
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
  castTrack: (track) => ipcRenderer.invoke("cast:track", track),
  castCommand: (command) => ipcRenderer.invoke("cast:command", command),
  castSeek: (seconds) => ipcRenderer.invoke("cast:seek", seconds),
  castVolume: (level) => ipcRenderer.invoke("cast:volume", level),
  prewarmCastTracks: (tracks) => ipcRenderer.invoke("cast:prewarm", tracks),
  disconnectCast: () => ipcRenderer.invoke("cast:disconnect"),
  getMediaAccess: () => ipcRenderer.invoke("media:last-access"),
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
