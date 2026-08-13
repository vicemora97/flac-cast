import type { CastDevice, CastState, LibraryResult, Playlist, Track } from "../shared/contracts.js";

type Album = {
  key: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  tracks: Track[];
};

type Artist = {
  name: string;
  artworkUrl?: string;
  tracks: Track[];
  albums: Album[];
};

type IconName = "play" | "pause" | "cast" | "music" | "folder" | "trash" | "playlist" | "plus" | "queue" | "more" | "edit" | "x";
type UiScalePreference = "auto" | "0.9" | "1" | "1.1" | "1.25";
type RepeatMode = "off" | "album" | "track";
type LibraryView = "tracks" | "albums" | "artists" | "playlists";
type PlaybackSource = "scheduled" | "manual";
type PlaybackHistoryEntry = { track: Track; source: PlaybackSource; scheduledIndex: number };

const uiScaleSelect = document.querySelector<HTMLSelectElement>("#ui-scale")!;
const chooseButton = document.querySelector<HTMLButtonElement>("#choose-folder")!;
const libraryPanel = document.querySelector<HTMLElement>("#library-panel")!;
const libraryClose = document.querySelector<HTMLButtonElement>("#library-close")!;
const libraryFoldersElement = document.querySelector<HTMLElement>("#library-folders")!;
const addLibraryButton = document.querySelector<HTMLButtonElement>("#add-library")!;
const tracksTab = document.querySelector<HTMLButtonElement>("#tracks-tab")!;
const albumsTab = document.querySelector<HTMLButtonElement>("#albums-tab")!;
const artistsTab = document.querySelector<HTMLButtonElement>("#artists-tab")!;
const playlistsTab = document.querySelector<HTMLButtonElement>("#playlists-tab")!;
const viewTabs = document.querySelector<HTMLElement>(".view-tabs")!;
const folderLabel = document.querySelector<HTMLElement>("#folder")!;
const countLabel = document.querySelector<HTMLElement>("#count")!;
const librarySearch = document.querySelector<HTMLInputElement>("#library-search")!;
const libraryActivity = document.querySelector<HTMLElement>("#library-activity")!;
const trackList = document.querySelector<HTMLElement>("#tracks")!;
const player = document.querySelector<HTMLAudioElement>("#player")!;
const localPlayer = document.querySelector<HTMLElement>("#local-player")!;
const localToggle = document.querySelector<HTMLButtonElement>("#local-toggle")!;
const localTime = document.querySelector<HTMLElement>("#local-time")!;
const localProgress = document.querySelector<HTMLInputElement>("#local-progress")!;
const localVolume = document.querySelector<HTMLInputElement>("#local-volume")!;
const remotePlayer = document.querySelector<HTMLElement>("#remote-player")!;
const remoteToggle = document.querySelector<HTMLButtonElement>("#remote-toggle")!;
const remoteTime = document.querySelector<HTMLElement>("#remote-time")!;
const remoteProgress = document.querySelector<HTMLInputElement>("#remote-progress")!;
const remoteVolume = document.querySelector<HTMLInputElement>("#remote-volume")!;
const previousTrackButton = document.querySelector<HTMLButtonElement>("#previous-track")!;
const nextTrackButton = document.querySelector<HTMLButtonElement>("#next-track")!;
const shuffleButton = document.querySelector<HTMLButtonElement>("#shuffle-button")!;
const repeatButton = document.querySelector<HTMLButtonElement>("#repeat-button")!;
const repeatModeLabel = document.querySelector<HTMLElement>("#repeat-mode")!;
const nowTitle = document.querySelector<HTMLElement>("#now-title")!;
const nowDetail = document.querySelector<HTMLElement>("#now-detail")!;
let nowArtwork = document.querySelector<HTMLElement>("#now-art")!;
const castButton = document.querySelector<HTMLButtonElement>("#cast-button")!;
const castButtonLabel = document.querySelector<HTMLElement>("#cast-button-label")!;
const castPanel = document.querySelector<HTMLElement>("#cast-panel")!;
const castClose = document.querySelector<HTMLButtonElement>("#cast-close")!;
const castStatus = document.querySelector<HTMLElement>("#cast-status")!;
const castDevices = document.querySelector<HTMLElement>("#cast-devices")!;
const castControls = document.querySelector<HTMLElement>("#cast-controls")!;
const castToggle = document.querySelector<HTMLButtonElement>("#cast-toggle")!;
const castDisconnect = document.querySelector<HTMLButtonElement>("#cast-disconnect")!;
const castQuality = document.querySelector<HTMLElement>("#cast-quality")!;
const nowPlaylistButton = document.querySelector<HTMLButtonElement>("#now-playlist-button")!;
const playlistPicker = document.querySelector<HTMLElement>("#playlist-picker")!;
const playlistPickerClose = document.querySelector<HTMLButtonElement>("#playlist-picker-close")!;
const playlistPickerTitle = document.querySelector<HTMLElement>("#playlist-picker-title")!;
const playlistOptions = document.querySelector<HTMLElement>("#playlist-options")!;
const playlistPickerCreate = document.querySelector<HTMLButtonElement>("#playlist-picker-create")!;
const playlistDialog = document.querySelector<HTMLDialogElement>("#playlist-dialog")!;
const playlistForm = document.querySelector<HTMLFormElement>("#playlist-form")!;
const playlistName = document.querySelector<HTMLInputElement>("#playlist-name")!;
const playlistCancel = document.querySelector<HTMLButtonElement>("#playlist-cancel")!;
const queuePanelButton = document.querySelector<HTMLButtonElement>("#queue-panel-button")!;
const queuePanel = document.querySelector<HTMLElement>("#queue-panel")!;
const queueClose = document.querySelector<HTMLButtonElement>("#queue-close")!;
const queueItems = document.querySelector<HTMLElement>("#queue-items")!;
const queueClear = document.querySelector<HTMLButtonElement>("#queue-clear")!;
const queueCount = document.querySelector<HTMLElement>("#queue-count")!;
const contextMenu = document.querySelector<HTMLElement>("#context-menu")!;
const playlistEditDialog = document.querySelector<HTMLDialogElement>("#playlist-edit-dialog")!;
const playlistEditForm = document.querySelector<HTMLFormElement>("#playlist-edit-form")!;
const playlistEditName = document.querySelector<HTMLInputElement>("#playlist-edit-name")!;
const playlistEditArtwork = document.querySelector<HTMLElement>("#playlist-edit-artwork")!;
const playlistArtworkChoose = document.querySelector<HTMLButtonElement>("#playlist-artwork-choose")!;
const playlistArtworkRemove = document.querySelector<HTMLButtonElement>("#playlist-artwork-remove")!;
const playlistEditCancel = document.querySelector<HTMLButtonElement>("#playlist-edit-cancel")!;
let libraryTracks: Track[] = [];
let libraryFolders: string[] = [];
let playlists: Playlist[] = [];
let selectedTrack: Track | undefined;
let currentCastState: CastState = { connected: false };
let draggingRemoteProgress = false;
let draggingLocalProgress = false;
let changingRemoteVolume = false;
let playbackContext: Track[] = [];
let playbackQueue: Track[] = [];
let manualQueue: Track[] = [];
let queueIndex = -1;
let currentPlaybackSource: PlaybackSource = "scheduled";
let playbackHistory: PlaybackHistoryEntry[] = [];
let shuffleEnabled = false;
let repeatMode: RepeatMode = "off";
let autoAdvancedTrackId: string | undefined;
let trackChangeInProgress = false;
let appliedUiScale = 0;
let libraryOperation = 0;
let addSelectedTrackAfterCreate = false;
let playlistPickerTrack: Track | undefined;
let editingPlaylistId: string | undefined;
let editingPlaylistArtwork: string | undefined;
let castPrewarmTimer: ReturnType<typeof setTimeout> | undefined;
let lastCastPrewarmSignature = "";
let castRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let castRefreshInFlight = false;
let lastDeviceRefreshAt = 0;
let lastTaskbarSignature = "";
let searchQuery = "";
let sessionRestored = false;
const viewScrollPositions: Partial<Record<LibraryView, number>> = {};
const artworkAccentCache = new Map<string, Promise<string>>();

initializeUiScale();
uiScaleSelect.addEventListener("change", () => {
  const preference = normalizeUiScalePreference(uiScaleSelect.value);
  localStorage.setItem("hires-ui-scale", preference);
  void applyUiScale(preference);
});
tracksTab.addEventListener("click", () => openLibraryView("tracks"));
albumsTab.addEventListener("click", () => openLibraryView("albums"));
artistsTab.addEventListener("click", () => openLibraryView("artists"));
playlistsTab.addEventListener("click", () => openLibraryView("playlists"));
librarySearch.addEventListener("input", () => {
  searchQuery = librarySearch.value.trim().toLocaleLowerCase();
  if (searchQuery) showSearchResults();
  else renderCurrentView();
});
previousTrackButton.addEventListener("click", () => void playPrevious());
nextTrackButton.addEventListener("click", () => void playNext());
shuffleButton.addEventListener("click", toggleShuffle);
repeatButton.addEventListener("click", toggleRepeat);
player.addEventListener("ended", () => void playNext(true));
player.addEventListener("play", updateTaskbarControls);
player.addEventListener("pause", updateTaskbarControls);
player.addEventListener("pause", savePlaybackSession);
player.addEventListener("play", renderLocalTransport);
player.addEventListener("pause", renderLocalTransport);
player.addEventListener("timeupdate", renderLocalTransport);
player.addEventListener("durationchange", renderLocalTransport);
player.addEventListener("loadedmetadata", renderLocalTransport);
localToggle.addEventListener("click", () => void togglePlayback());
localProgress.addEventListener("input", () => {
  draggingLocalProgress = true;
  localTime.textContent = `${formatDuration(Number(localProgress.value))} / ${formatDuration(Number(localProgress.max))}`;
  updateRangeProgress(localProgress, Number(localProgress.value), Number(localProgress.max));
});
localProgress.addEventListener("change", () => {
  player.currentTime = Number(localProgress.value);
  draggingLocalProgress = false;
  renderLocalTransport();
});
localVolume.addEventListener("input", () => {
  player.volume = Number(localVolume.value);
  updateRangeProgress(localVolume, player.volume, 1);
});
window.hires.onTaskbarPlaybackCommand((command) => {
  if (command === "previous") void playPrevious();
  else if (command === "next") void playNext();
  else void togglePlayback();
});
updateQueueButtons();
updateRangeProgress(localVolume, 1, 1);
castButton.addEventListener("click", () => {
  libraryPanel.hidden = true;
  queuePanel.hidden = true;
  renderQueue();
  castPanel.hidden = !castPanel.hidden;
  if (!castPanel.hidden) void refreshCastDevices();
});
castClose.addEventListener("click", () => { castPanel.hidden = true; });
castToggle.addEventListener("click", () => void toggleCastPlayback());
remoteToggle.addEventListener("click", () => void toggleCastPlayback());
remoteProgress.addEventListener("input", () => {
  draggingRemoteProgress = true;
  remoteTime.textContent = `${formatDuration(Number(remoteProgress.value))} / ${formatDuration(Number(remoteProgress.max))}`;
  updateRangeProgress(remoteProgress, Number(remoteProgress.value), Number(remoteProgress.max));
});
remoteProgress.addEventListener("change", async () => {
  try {
    currentCastState = await window.hires.castSeek(Number(remoteProgress.value));
    renderCastState();
  } catch (error) {
    showCastError(error);
  } finally {
    draggingRemoteProgress = false;
  }
});
remoteVolume.addEventListener("input", () => {
  changingRemoteVolume = true;
  updateRangeProgress(remoteVolume, Number(remoteVolume.value), 1);
});
remoteVolume.addEventListener("change", async () => {
  try {
    currentCastState = await window.hires.castVolume(Number(remoteVolume.value));
    renderCastState();
  } catch (error) {
    showCastError(error);
  } finally {
    changingRemoteVolume = false;
  }
});
castDisconnect.addEventListener("click", async () => {
  try {
    currentCastState = await window.hires.disconnectCast();
    renderCastState();
    await refreshCastDevices();
  } catch (error) {
    showCastError(error);
  }
});
nowPlaylistButton.addEventListener("click", () => openPlaylistPicker(selectedTrack));
playlistPickerClose.addEventListener("click", () => { playlistPicker.hidden = true; });
playlistPickerCreate.addEventListener("click", () => openPlaylistDialog(true));
playlistCancel.addEventListener("click", closePlaylistDialog);
playlistForm.addEventListener("submit", (event) => void createPlaylist(event));
queuePanelButton.addEventListener("click", () => {
  castPanel.hidden = true;
  libraryPanel.hidden = true;
  queuePanel.hidden = !queuePanel.hidden;
  if (!queuePanel.hidden) renderQueue();
});
queueClose.addEventListener("click", () => {
  queuePanel.hidden = true;
  renderQueue();
});
queueClear.addEventListener("click", clearUpcomingQueue);
playlistEditCancel.addEventListener("click", closePlaylistEditDialog);
playlistEditForm.addEventListener("submit", (event) => void savePlaylistEdits(event));
playlistArtworkChoose.addEventListener("click", () => void choosePlaylistArtwork());
playlistArtworkRemove.addEventListener("click", () => {
  editingPlaylistArtwork = undefined;
  renderPlaylistEditArtwork();
});
document.addEventListener("pointerdown", (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target as Node)) hideContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideContextMenu();
  handleKeyboardShortcut(event);
});
window.addEventListener("resize", positionActiveTabIndicator);
window.addEventListener("scroll", () => {
  viewScrollPositions[getCurrentView()] = window.scrollY;
}, { passive: true });
window.addEventListener("beforeunload", savePlaybackSession);
document.addEventListener("visibilitychange", handleVisibilityChange);
window.hires.onLibraryActivity((active) => { libraryActivity.hidden = !active; });
scheduleCastRefresh(0);
void initializeLibrary();
void initializePlaylists();
window.hires.onLibraryUpdated((result) => {
  const detailOpen = trackList.classList.contains("album-detail") || trackList.classList.contains("artist-detail") || trackList.classList.contains("playlist-detail");
  if (detailOpen) updateLibraryState(result);
  else applyLibraryResult(result, getCurrentView());
  countLabel.textContent = result.cacheUsed
    ? `${formatTrackCount(result.tracks.length)} · NAS sin conexión`
    : `${formatTrackCount(result.tracks.length)} · actualizado`;
});

chooseButton.addEventListener("click", () => {
  castPanel.hidden = true;
  libraryPanel.hidden = !libraryPanel.hidden;
});
libraryClose.addEventListener("click", () => { libraryPanel.hidden = true; });
addLibraryButton.addEventListener("click", () => void addLibrary());

async function addLibrary(): Promise<void> {
  const operation = ++libraryOperation;
  addLibraryButton.disabled = true;
  const label = addLibraryButton.querySelector("span");
  if (label) label.textContent = "Leyendo carpeta…";
  try {
    const result = await window.hires.chooseLibrary();
    if (operation !== libraryOperation) return;
    applyLibraryResult(result, "tracks");
  } catch (error) {
    folderLabel.textContent = `No se pudo abrir la carpeta: ${error instanceof Error ? error.message : "error desconocido"}`;
    countLabel.textContent = "Error";
  } finally {
    addLibraryButton.disabled = false;
    if (label) label.textContent = "Agregar carpeta";
  }
}

async function initializeLibrary(): Promise<void> {
  const operation = ++libraryOperation;
  try {
    const saved = await window.hires.loadSavedLibrary();
    if (operation !== libraryOperation) return;
    if (saved.folders.length === 0) {
      updateLibraryState(saved);
      return;
    }

    applyLibraryResult(saved, "tracks");
    restorePlaybackSession();
    countLabel.textContent = saved.tracks.length > 0
      ? `${formatTrackCount(saved.tracks.length)} · guardada`
      : "Reconectando biblioteca…";

    await delay(2_000);
    if (operation !== libraryOperation) return;
    const refreshed = await window.hires.refreshLibrary();
    if (operation !== libraryOperation) return;
    if (refreshed.cacheUsed) {
      const unavailable = refreshed.unavailableFolders?.length ?? 0;
      countLabel.textContent = `${formatTrackCount(refreshed.tracks.length)} · ${unavailable === 1 ? "1 carpeta sin conexión" : `${unavailable} carpetas sin conexión`}`;
      folderLabel.title = refreshed.refreshWarning ?? "Se está mostrando el índice guardado";
      return;
    }
    if (sameLibrary(libraryTracks, refreshed.tracks)) {
      updateLibraryState(refreshed);
      countLabel.textContent = formatTrackCount(refreshed.tracks.length);
      return;
    }
    applyLibraryResult(refreshed, getCurrentView());
  } catch (error) {
    if (libraryTracks.length > 0) {
      countLabel.textContent = `${formatTrackCount(libraryTracks.length)} · no se pudo actualizar`;
    } else {
      folderLabel.textContent = `No se pudo restaurar la biblioteca: ${error instanceof Error ? error.message : "error desconocido"}`;
      countLabel.textContent = "Error";
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function applyLibraryResult(result: LibraryResult, view: LibraryView): void {
  updateLibraryState(result);
  if (view === "albums") showAlbums();
  else if (view === "artists") showArtists();
  else if (view === "playlists") showPlaylists();
  else showTracks();
}

function renderCurrentView(): void {
  const view = getCurrentView();
  if (view === "albums") showAlbums();
  else if (view === "artists") showArtists();
  else if (view === "playlists") showPlaylists();
  else showTracks();
}

function openLibraryView(view: LibraryView): void {
  searchQuery = "";
  librarySearch.value = "";
  if (view === "albums") showAlbums();
  else if (view === "artists") showArtists();
  else if (view === "playlists") showPlaylists();
  else showTracks();
}

function showSearchResults(): void {
  trackList.className = "tracks search-results";
  trackList.replaceChildren();
  const matches = libraryTracks.filter((track) => `${track.title}\n${track.artist}\n${track.album}`.toLocaleLowerCase().includes(searchQuery));
  if (matches.length === 0) {
    trackList.append(createTextElement("div", "empty", "No se encontraron coincidencias."));
  } else {
    matches.forEach((track) => trackList.append(createTrackRow(track, matches)));
  }
  countLabel.textContent = `${matches.length} resultados`;
}

function updateLibraryState(result: LibraryResult): void {
  libraryTracks = result.tracks;
  libraryFolders = result.folders;
  folderLabel.textContent = result.folders.length === 0
    ? "Aún no has agregado carpetas"
    : result.folders.length === 1 ? result.folders[0]! : `${result.folders.length} carpetas de música`;
  folderLabel.title = result.folders.join("\n");
  countLabel.textContent = formatTrackCount(result.tracks.length);
  renderLibraryFolders();
}

function renderLibraryFolders(): void {
  libraryFoldersElement.replaceChildren();
  if (libraryFolders.length === 0) {
    libraryFoldersElement.append(createTextElement("p", "cast-empty", "Agrega una o más carpetas locales o de tu NAS."));
    return;
  }
  for (const folder of libraryFolders) {
    const row = document.createElement("div");
    row.className = "library-folder";
    const path = createTextElement("span", "library-folder-path", folder);
    path.title = folder;
    const remove = document.createElement("button");
    remove.className = "remove-library";
    remove.title = "Quitar de la biblioteca";
    remove.setAttribute("aria-label", `Quitar ${folder}`);
    remove.append(createIcon("trash"));
    remove.addEventListener("click", () => void removeLibrary(folder, remove));
    row.append(createIcon("folder"), path, remove);
    libraryFoldersElement.append(row);
  }
}

async function removeLibrary(folder: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const result = await window.hires.removeLibrary(folder);
    applyLibraryResult(result, getCurrentView());
  } catch (error) {
    folderLabel.textContent = `No se pudo quitar la carpeta: ${error instanceof Error ? error.message : String(error)}`;
    button.disabled = false;
  }
}

function getCurrentView(): LibraryView {
  if (albumsTab.classList.contains("active")) return "albums";
  if (artistsTab.classList.contains("active")) return "artists";
  if (playlistsTab.classList.contains("active")) return "playlists";
  return "tracks";
}

function formatTrackCount(count: number): string {
  return `${count} ${count === 1 ? "pista" : "pistas"}`;
}

function sameLibrary(a: Track[], b: Track[]): boolean {
  return a.length === b.length && a.every((track, index) => {
    const other = b[index];
    return other != null
      && track.id === other.id
      && track.title === other.title
      && track.artist === other.artist
      && track.album === other.album
      && track.durationSeconds === other.durationSeconds
      && track.sampleRate === other.sampleRate
      && track.bitsPerSample === other.bitsPerSample
      && track.trackNumber === other.trackNumber
      && track.discNumber === other.discNumber;
  });
}

async function initializePlaylists(): Promise<void> {
  try {
    playlists = await window.hires.getPlaylists();
    if (getCurrentView() === "playlists") showPlaylists();
  } catch (error) {
    console.warn("No se pudieron cargar las playlists", error);
  }
}

function openPlaylistDialog(addCurrentTrack = false): void {
  addSelectedTrackAfterCreate = addCurrentTrack;
  playlistName.value = "";
  if (!playlistDialog.open) playlistDialog.showModal();
  requestAnimationFrame(() => playlistName.focus());
}

function closePlaylistDialog(): void {
  if (playlistDialog.open) playlistDialog.close();
}

async function createPlaylist(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const name = playlistName.value.trim();
  if (!name) return;
  const previousIds = new Set(playlists.map((playlist) => playlist.id));
  playlists = await window.hires.createPlaylist(name);
  const created = playlists.find((playlist) => !previousIds.has(playlist.id));
  const trackToAdd = playlistPickerTrack ?? selectedTrack;
  if (addSelectedTrackAfterCreate && trackToAdd && created) {
    playlists = await window.hires.addTrackToPlaylist(created.id, trackToAdd.id);
    playlistPicker.hidden = true;
  }
  addSelectedTrackAfterCreate = false;
  closePlaylistDialog();
  if (getCurrentView() === "playlists") showPlaylists();
  if (!playlistPicker.hidden) renderPlaylistOptions();
}

function openPlaylistPicker(track?: Track): void {
  if (!track) return;
  playlistPickerTrack = track;
  playlistPickerTitle.textContent = `Agregar “${track.title}”`;
  renderPlaylistOptions();
  playlistPicker.hidden = false;
}

function renderPlaylistOptions(): void {
  playlistOptions.replaceChildren();
  if (playlists.length === 0) {
    playlistOptions.append(createTextElement("p", "cast-empty", "Aún no tienes playlists. Crea la primera para guardar esta canción."));
    return;
  }
  for (const playlist of playlists) {
    const button = document.createElement("button");
    button.className = "playlist-option";
    const alreadyAdded = Boolean(playlistPickerTrack && playlist.trackIds.includes(playlistPickerTrack.id));
    button.append(
      createTextElement("strong", "", playlist.name),
      createTextElement("span", "", alreadyAdded ? "Ya agregada" : formatTrackCount(playlist.trackIds.length))
    );
    button.disabled = alreadyAdded;
    button.addEventListener("click", () => void addSelectedTrackToPlaylist(playlist.id));
    playlistOptions.append(button);
  }
}

async function addSelectedTrackToPlaylist(playlistId: string): Promise<void> {
  if (!playlistPickerTrack) return;
  playlists = await window.hires.addTrackToPlaylist(playlistId, playlistPickerTrack.id);
  playlistPicker.hidden = true;
  if (getCurrentView() === "playlists") showPlaylists();
}

function showPlaylists(): void {
  setActiveTab("playlists");
  trackList.className = "playlist-grid";
  trackList.replaceChildren();

  const create = document.createElement("button");
  create.className = "playlist-create-card";
  const createIconElement = document.createElement("span");
  createIconElement.className = "playlist-create-icon";
  createIconElement.append(createIcon("plus"));
  create.append(createIconElement, createTextElement("strong", "", "Nueva playlist"));
  create.addEventListener("click", () => openPlaylistDialog(false));
  trackList.append(create);

  for (const playlist of playlists) {
    const wrapper = document.createElement("div");
    wrapper.className = "playlist-card-wrapper";
    const button = document.createElement("button");
    button.className = "playlist-card";
    const icon = playlist.artworkDataUrl
      ? createArtwork(playlist.artworkDataUrl, "playlist-card-artwork")
      : document.createElement("span");
    if (!playlist.artworkDataUrl) {
      icon.className = "playlist-card-icon";
      icon.append(createIcon("playlist"));
    }
    button.append(
      icon,
      createTextElement("strong", "", playlist.name),
      createTextElement("span", "", formatTrackCount(playlist.trackIds.length))
    );
    button.addEventListener("click", () => showPlaylistDetail(playlist.id));
    const menuButton = createMoreButton(`Opciones de ${playlist.name}`);
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openPlaylistContextMenu(playlist, menuButton);
    });
    wrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openPlaylistContextMenu(playlist, { x: event.clientX, y: event.clientY });
    });
    wrapper.append(button, menuButton);
    trackList.append(wrapper);
  }
}

function showPlaylistDetail(playlistId: string): void {
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) {
    showPlaylists();
    return;
  }
  setActiveTab("playlists");
  trackList.className = "playlist-detail";
  trackList.replaceChildren();
  const tracksById = new Map(libraryTracks.map((track) => [track.id, track]));
  const playlistTracks = playlist.trackIds.flatMap((id) => tracksById.get(id) ?? []);

  const backButton = createTextElement("button", "back-button", "← Todas las playlists") as HTMLButtonElement;
  backButton.addEventListener("click", showPlaylists);
  const hero = document.createElement("div");
  hero.className = "album-hero";
  const details = document.createElement("div");
  details.className = "album-hero-copy";
  const actions = document.createElement("div");
  actions.className = "playlist-detail-actions";
  const editPlaylist = createTextElement("button", "secondary-button", "Editar información") as HTMLButtonElement;
  editPlaylist.addEventListener("click", () => openPlaylistEditDialog(playlist.id));
  actions.append(editPlaylist);
  details.append(
    createTextElement("span", "eyebrow", "PLAYLIST"),
    createTextElement("h2", "", playlist.name),
    createTextElement("p", "album-artist", formatTrackCount(playlistTracks.length)),
    actions
  );
  hero.append(createArtwork(playlist.artworkDataUrl ?? playlistTracks.find((track) => track.artworkUrl)?.artworkUrl, "artwork-hero"), details);

  const songs = document.createElement("div");
  songs.className = "album-songs";
  if (playlistTracks.length === 0) {
    songs.append(createTextElement("div", "empty", "Reproduce una canción y usa el botón + para agregarla aquí."));
  } else {
    for (const track of playlistTracks) {
      songs.append(createTrackRow(track, playlistTracks, { playlistId: playlist.id }));
    }
  }
  trackList.append(backButton, hero, songs);
}

async function deletePlaylist(id: string): Promise<void> {
  playlists = await window.hires.deletePlaylist(id);
  showPlaylists();
}

async function removePlaylistTrack(playlistId: string, trackId: string): Promise<void> {
  playlists = await window.hires.removeTrackFromPlaylist(playlistId, trackId);
  showPlaylistDetail(playlistId);
}

function openPlaylistEditDialog(playlistId: string): void {
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) return;
  hideContextMenu();
  editingPlaylistId = playlist.id;
  editingPlaylistArtwork = playlist.artworkDataUrl;
  playlistEditName.value = playlist.name;
  renderPlaylistEditArtwork();
  if (!playlistEditDialog.open) playlistEditDialog.showModal();
  requestAnimationFrame(() => playlistEditName.focus());
}

function closePlaylistEditDialog(): void {
  editingPlaylistId = undefined;
  editingPlaylistArtwork = undefined;
  if (playlistEditDialog.open) playlistEditDialog.close();
}

async function choosePlaylistArtwork(): Promise<void> {
  const chosen = await window.hires.choosePlaylistArtwork();
  if (!chosen) return;
  editingPlaylistArtwork = chosen;
  renderPlaylistEditArtwork();
}

function renderPlaylistEditArtwork(): void {
  playlistEditArtwork.replaceChildren(
    editingPlaylistArtwork
      ? createArtwork(editingPlaylistArtwork, "artwork-edit-preview")
      : createIcon("playlist", "placeholder-icon")
  );
  playlistEditArtwork.classList.toggle("artwork-placeholder", !editingPlaylistArtwork);
  playlistArtworkRemove.disabled = !editingPlaylistArtwork;
}

async function savePlaylistEdits(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!editingPlaylistId) return;
  const id = editingPlaylistId;
  playlists = await window.hires.updatePlaylist(id, {
    name: playlistEditName.value,
    artworkDataUrl: editingPlaylistArtwork ?? null
  });
  closePlaylistEditDialog();
  if (trackList.classList.contains("playlist-detail")) showPlaylistDetail(id);
  else showPlaylists();
}

function showTracks(): void {
  setActiveTab("tracks");
  trackList.className = "tracks";
  trackList.replaceChildren();
  if (libraryTracks.length === 0) {
    trackList.innerHTML = '<div class="empty">No se encontraron archivos FLAC en esta carpeta.</div>';
    return;
  }

  libraryTracks.forEach((track) => {
    trackList.append(createTrackRow(track, libraryTracks));
  });
}

function showAlbums(): void {
  setActiveTab("albums");
  trackList.className = "album-grid";
  trackList.replaceChildren();

  const albums = groupAlbums(libraryTracks);
  if (albums.length === 0) {
    trackList.innerHTML = '<div class="empty">Selecciona una carpeta para ver tus álbumes.</div>';
    return;
  }

  albums.forEach((album) => {
    const button = document.createElement("button");
    button.className = "album-card";
    button.append(
      createArtwork(album.artworkUrl, "artwork-album"),
      createTextElement("strong", "album-title", album.title),
      createTextElement("span", "album-artist", album.artist)
    );
    button.addEventListener("click", () => showAlbumDetail(album));
    trackList.append(button);
  });
}

function showAlbumDetail(album: Album): void {
  setActiveTab("albums");
  trackList.className = "album-detail";
  trackList.replaceChildren();

  const backButton = createTextElement("button", "back-button", "← Todos los álbumes") as HTMLButtonElement;
  backButton.addEventListener("click", showAlbums);

  const hero = document.createElement("div");
  hero.className = "album-hero";
  const details = document.createElement("div");
  details.className = "album-hero-copy";
  details.append(
    createTextElement("span", "eyebrow", "ÁLBUM"),
    createTextElement("h2", "", album.title),
    createTextElement("p", "album-artist", `${album.artist} · ${album.tracks.length} ${album.tracks.length === 1 ? "pista" : "pistas"}`)
  );
  hero.append(createArtwork(album.artworkUrl, "artwork-hero"), details);

  const songs = document.createElement("div");
  songs.className = "album-songs";
  album.tracks.forEach((track, index) => {
    songs.append(createTrackRow(track, album.tracks, {
      albumTrack: true,
      trackNumber: track.trackNumber ?? index + 1,
      includeAlbum: false
    }));
  });

  trackList.append(backButton, hero, songs);
}

function showArtists(): void {
  setActiveTab("artists");
  trackList.className = "artist-grid";
  trackList.replaceChildren();

  const artists = groupArtists(libraryTracks);
  if (artists.length === 0) {
    trackList.innerHTML = '<div class="empty">Selecciona una carpeta para ver tus artistas.</div>';
    return;
  }

  artists.forEach((artist) => {
    const button = document.createElement("button");
    button.className = "artist-card";
    button.append(
      createArtwork(artist.artworkUrl, "artwork-artist"),
      createTextElement("strong", "artist-title", artist.name),
      createTextElement("span", "artist-summary", `${artist.albums.length} ${artist.albums.length === 1 ? "álbum" : "álbumes"} · ${artist.tracks.length} pistas`)
    );
    button.addEventListener("click", () => showArtistDetail(artist));
    trackList.append(button);
  });
}

function showArtistDetail(artist: Artist): void {
  setActiveTab("artists");
  trackList.className = "artist-detail";
  trackList.replaceChildren();

  const backButton = createTextElement("button", "back-button", "← Todos los artistas") as HTMLButtonElement;
  backButton.addEventListener("click", showArtists);

  const hero = document.createElement("div");
  hero.className = "album-hero";
  const details = document.createElement("div");
  details.className = "album-hero-copy";
  details.append(
    createTextElement("span", "eyebrow", "ARTISTA"),
    createTextElement("h2", "", artist.name),
    createTextElement("p", "album-artist", `${artist.albums.length} ${artist.albums.length === 1 ? "álbum" : "álbumes"} · ${artist.tracks.length} pistas`)
  );
  hero.append(createArtwork(artist.artworkUrl, "artwork-hero artwork-artist-hero"), details);

  const albumsHeading = createTextElement("h3", "section-title", "Álbumes");
  const albumGrid = document.createElement("div");
  albumGrid.className = "album-grid compact-albums";
  artist.albums.forEach((album) => {
    const button = document.createElement("button");
    button.className = "album-card";
    button.append(
      createArtwork(album.artworkUrl, "artwork-album"),
      createTextElement("strong", "album-title", album.title),
      createTextElement("span", "album-artist", `${album.tracks.length} pistas`)
    );
    button.addEventListener("click", () => showAlbumDetail(album));
    albumGrid.append(button);
  });

  const tracksHeading = createTextElement("h3", "section-title", "Canciones");
  const songs = document.createElement("div");
  songs.className = "album-songs";
  artist.tracks.forEach((track) => {
    songs.append(createTrackRow(track, artist.tracks));
  });

  trackList.append(backButton, hero, albumsHeading, albumGrid, tracksHeading, songs);
}

type TrackRowOptions = {
  albumTrack?: boolean;
  trackNumber?: number;
  includeAlbum?: boolean;
  playlistId?: string;
};

type ContextMenuItem = {
  label: string;
  icon: IconName;
  action: () => void;
  danger?: boolean;
  divider?: boolean;
};

function createTrackRow(track: Track, context: Track[], options: TrackRowOptions = {}): HTMLElement {
  const row = document.createElement("div");
  row.className = "track-row";
  const play = document.createElement("button");
  play.className = options.albumTrack ? "track album-track" : "track";
  play.append(
    options.albumTrack
      ? createTextElement("span", "number", String(options.trackNumber ?? track.trackNumber ?? 1).padStart(2, "0"))
      : createArtwork(track.artworkUrl, "artwork-track"),
    createTrackDescription(track, options.includeAlbum ?? true),
    createTextElement("span", "quality", formatQuality(track)),
    createTextElement("span", "duration", formatDuration(track.durationSeconds))
  );
  play.addEventListener("click", () => void playTrack(track, context));

  const more = createMoreButton(`Opciones de ${track.title}`);
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    openTrackContextMenu(track, more, options.playlistId);
  });
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openTrackContextMenu(track, { x: event.clientX, y: event.clientY }, options.playlistId);
  });
  row.append(play, more);
  return row;
}

function createMoreButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "more-button";
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createIcon("more"));
  return button;
}

function openTrackContextMenu(track: Track, anchor: HTMLElement | { x: number; y: number }, playlistId?: string): void {
  const items: ContextMenuItem[] = [
    { label: "Reproducir ahora", icon: "play", action: () => void playTrack(track, playbackContext.some((item) => item.id === track.id) ? playbackContext : libraryTracks) },
    { label: "Agregar a la cola", icon: "queue", action: () => void enqueueTrack(track) },
    { label: "Agregar a una playlist", icon: "playlist", action: () => openPlaylistPicker(track) }
  ];
  if (playlistId) {
    items.push({
      label: "Quitar de esta playlist",
      icon: "trash",
      danger: true,
      divider: true,
      action: () => void removePlaylistTrack(playlistId, track.id)
    });
  }
  showContextMenu(items, anchor);
}

function openPlaylistContextMenu(playlist: Playlist, anchor: HTMLElement | { x: number; y: number }): void {
  showContextMenu([
    { label: "Editar información", icon: "edit", action: () => openPlaylistEditDialog(playlist.id) },
    { label: "Eliminar playlist", icon: "trash", danger: true, divider: true, action: () => void deletePlaylist(playlist.id) }
  ], anchor);
}

function showContextMenu(items: ContextMenuItem[], anchor: HTMLElement | { x: number; y: number }): void {
  contextMenu.replaceChildren();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `context-menu-item${item.danger ? " danger" : ""}${item.divider ? " divider" : ""}`;
    button.setAttribute("role", "menuitem");
    button.append(createIcon(item.icon), createTextElement("span", "", item.label));
    button.addEventListener("click", () => {
      hideContextMenu();
      item.action();
    });
    contextMenu.append(button);
  }
  contextMenu.hidden = false;
  const point = anchor instanceof HTMLElement
    ? (() => { const rect = anchor.getBoundingClientRect(); return { x: rect.right, y: rect.bottom + 5 }; })()
    : anchor;
  const bounds = contextMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(point.x - (anchor instanceof HTMLElement ? bounds.width : 0), window.innerWidth - bounds.width - 8));
  const top = Math.max(8, Math.min(point.y, window.innerHeight - bounds.height - 8));
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
}

function hideContextMenu(): void {
  contextMenu.hidden = true;
}

async function enqueueTrack(track: Track): Promise<void> {
  manualQueue.push(track);
  queuePanel.hidden = false;
  updateQueueButtons();
  if (!selectedTrack) await playNext();
}

function renderQueue(): void {
  queueItems.replaceChildren();
  const scheduledStart = Math.max(0, queueIndex + 1);
  const scheduled = playbackQueue.slice(scheduledStart);
  const upcomingCount = manualQueue.length + scheduled.length;
  queueCount.textContent = String(upcomingCount);
  queuePanelButton.classList.toggle("active", !queuePanel.hidden);
  queueClear.disabled = manualQueue.length === 0;

  if (selectedTrack) {
    queueItems.append(createTextElement("span", "queue-section-label", "SONANDO"));
    queueItems.append(createQueueItem(selectedTrack, "current", -1));
  }

  if (manualQueue.length > 0) {
    queueItems.append(createTextElement("span", "queue-section-label manual", "AGREGADAS A LA COLA · FIFO"));
    manualQueue.forEach((track, index) => queueItems.append(createQueueItem(track, "manual", index)));
  }

  if (scheduled.length > 0) {
    queueItems.append(createTextElement("span", "queue-section-label", "PROGRAMADAS"));
    scheduled.forEach((track, offset) => queueItems.append(createQueueItem(track, "scheduled", scheduledStart + offset)));
  }

  if (!selectedTrack && upcomingCount === 0) {
    queueItems.append(createTextElement("p", "cast-empty", "No hay más canciones en la cola."));
  } else if (upcomingCount === 0) {
    queueItems.append(createTextElement("p", "cast-empty", "No hay canciones después de la actual."));
  }
}

function createQueueItem(track: Track, source: "current" | PlaybackSource, index: number): HTMLElement {
  const current = source === "current";
  const row = document.createElement("div");
  row.className = `queue-item${current ? " current" : ""}${source === "manual" ? " manual" : ""}`;
  const play = document.createElement("button");
  play.className = "queue-item-play";
  play.disabled = current;
  play.append(
    createArtwork(track.artworkUrl, "queue-artwork"),
    createTrackDescription(track, false)
  );
  play.addEventListener("click", () => {
    if (source === "current") return;
    playbackHistory = [];
    if (source === "manual") manualQueue.splice(index, 1);
    else queueIndex = index;
    void playTrack(track, playbackContext, true, source);
  });
  row.append(play);
  if (!current) {
    const remove = document.createElement("button");
    remove.className = "queue-item-remove";
    remove.title = "Quitar de la cola";
    remove.setAttribute("aria-label", `Quitar ${track.title} de la cola`);
    remove.append(createIcon("x"));
    remove.addEventListener("click", () => {
      if (source === "manual") manualQueue.splice(index, 1);
      else playbackQueue.splice(index, 1);
      updateQueueButtons();
    });
    row.append(remove);
  }
  return row;
}

function clearUpcomingQueue(): void {
  manualQueue = [];
  updateQueueButtons();
}

async function playTrack(track: Track, context?: Track[], preserveQueue = false, source: PlaybackSource = "scheduled"): Promise<void> {
  if (trackChangeInProgress) return;
  trackChangeInProgress = true;
  try {
    if (!preserveQueue) {
      setPlaybackContext(track, context ?? libraryTracks);
      playbackHistory = [];
      currentPlaybackSource = "scheduled";
    } else {
      currentPlaybackSource = source;
    }
    selectedTrack = track;
    autoAdvancedTrackId = undefined;
    updateQueueButtons();
    nowTitle.textContent = track.title;
    nowDetail.textContent = `${track.artist} · ${formatQuality(track)}`;
    replaceArtwork(nowArtwork, track.artworkUrl);
    nowPlaylistButton.disabled = false;
    void applyPlayerAccent(track.artworkUrl);
    if (currentCastState.connected) {
      player.pause();
      if (!track.castUrl) {
        showCastError(new Error("El PC no tiene una dirección IPv4 de red local disponible"));
        return;
      }
      try {
        castStatus.textContent = `Enviando ${track.title}…`;
        currentCastState = await window.hires.castTrack(track);
        renderDeliveryQuality(track);
        renderCastState();
      } catch (error) {
        showCastError(error);
      }
      return;
    }

    player.src = track.localUrl;
    player.dataset.trackId = track.id;
    renderLocalTransport();
    await player.play();
  } finally {
    trackChangeInProgress = false;
  }
}

async function refreshCastDevices(): Promise<void> {
  try {
    const devices = await window.hires.getCastDevices();
    renderCastDevices(devices);
  } catch (error) {
    showCastError(error);
  }
}

async function refreshCastState(render = true): Promise<void> {
  try {
    currentCastState = await window.hires.getCastState(render);
    if (render) renderCastState();
    const duration = currentCastState.duration ?? selectedTrack?.durationSeconds;
    const finished = currentCastState.idleReason === "FINISHED"
      || (currentCastState.playerState === "PLAYING" && duration != null && (currentCastState.currentTime ?? 0) >= duration - 0.25);
    if (finished && selectedTrack && !trackChangeInProgress && autoAdvancedTrackId !== selectedTrack.id) {
      autoAdvancedTrackId = selectedTrack.id;
      void playNext(true);
    }
    if (currentCastState.playerState === "BUFFERING") {
      const access = await window.hires.getMediaAccess();
      if (access && Date.now() - access.timestamp < 15_000) {
        castQuality.textContent = access.status === 206
          ? `La barra está recibiendo el FLAC · HTTP 206 · ${formatBytes(access.bytes)}`
          : `Solicitud de la barra · HTTP ${access.status}`;
      }
    }
  } catch {
    // La ventana puede estar cerrándose.
  }
}

function scheduleCastRefresh(delay?: number): void {
  if (castRefreshTimer) clearTimeout(castRefreshTimer);
  const nextDelay = delay ?? (document.hidden
    ? currentCastState.connected ? 2_500 : 15_000
    : currentCastState.connected ? 1_000 : 5_000);
  castRefreshTimer = setTimeout(async () => {
    castRefreshTimer = undefined;
    if (!castRefreshInFlight) {
      castRefreshInFlight = true;
      try {
        await refreshCastState(!document.hidden);
        if (!document.hidden && !castPanel.hidden && Date.now() - lastDeviceRefreshAt >= 3_000) {
          lastDeviceRefreshAt = Date.now();
          await refreshCastDevices();
        }
      } finally {
        castRefreshInFlight = false;
      }
    }
    scheduleCastRefresh();
  }, nextDelay);
}

function handleVisibilityChange(): void {
  if (document.hidden) {
    savePlaybackSession();
    scheduleCastRefresh();
    return;
  }
  renderCastState();
  renderLocalTransport();
  renderQueue();
  positionActiveTabIndicator();
  scheduleCastRefresh(0);
  requestAnimationFrame(() => document.body.classList.add("window-ready"));
}

function renderCastDevices(devices: CastDevice[]): void {
  castDevices.replaceChildren();
  if (currentCastState.connected) return;
  if (devices.length === 0) {
    castDevices.append(createTextElement("p", "cast-empty", "No se encontraron dispositivos. Deben estar en la misma red Wi-Fi."));
    castStatus.textContent = "Buscando dispositivos…";
    return;
  }

  castStatus.textContent = "Selecciona un dispositivo";
  devices.forEach((device) => {
    const button = document.createElement("button");
    button.className = "cast-device";
    const copy = document.createElement("span");
    copy.append(
      createTextElement("strong", "", device.name),
      createTextElement("small", "", device.model ?? "Google Cast")
    );
    const deviceIcon = document.createElement("span");
    deviceIcon.className = "cast-device-icon";
    deviceIcon.append(createIcon("cast"));
    button.append(deviceIcon, copy);
    button.addEventListener("click", () => void connectCast(device, button));
    castDevices.append(button);
  });
}

async function connectCast(device: CastDevice, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  castStatus.textContent = `Conectando con ${device.name}…`;
  try {
    currentCastState = await window.hires.connectCast(device.id);
    player.pause();
    if (selectedTrack) {
      currentCastState = await window.hires.castTrack(selectedTrack);
      renderDeliveryQuality(selectedTrack);
    }
    renderCastState();
  } catch (error) {
    button.disabled = false;
    showCastError(error);
  }
}

function renderCastState(): void {
  const connected = currentCastState.connected;
  castControls.hidden = !connected;
  localPlayer.hidden = connected;
  remotePlayer.hidden = !connected;
  castButton.classList.toggle("connected", connected);
  castButtonLabel.textContent = connected ? (currentCastState.deviceName ?? "Conectado") : "Cast";
  if (!connected) {
    castQuality.textContent = "Se envía el FLAC original, sin transcodificar.";
    renderLocalTransport();
    updateTaskbarControls();
    scheduleCastPrewarm();
    return;
  }
  renderRemoteTransport();
  castDevices.replaceChildren();
  if (currentCastState.deliveryPhase === "preparing") {
    castStatus.textContent = "Preparando FLAC en el caché local…";
    if (selectedTrack) renderDeliveryQuality(selectedTrack);
    updateTaskbarControls();
    return;
  }
  if (currentCastState.deliveryPhase === "converting") {
    castStatus.textContent = "Convirtiendo a WAV PCM lossless…";
    if (selectedTrack) renderDeliveryQuality(selectedTrack);
    updateTaskbarControls();
    return;
  }
  const stateLabel = currentCastState.playerState === "PLAYING" ? "Reproduciendo"
    : currentCastState.playerState === "PAUSED" ? "En pausa"
      : currentCastState.playerState === "BUFFERING" ? "Cargando" : "Conectado";
  castStatus.textContent = `${stateLabel} en ${currentCastState.deviceName}`;
  if (currentCastState.deliveryPhase === "failed" || (currentCastState.playerState === "IDLE" && currentCastState.idleReason === "ERROR")) {
    castStatus.textContent = "La barra rechazó o no pudo leer este archivo";
  }
  castToggle.textContent = currentCastState.playerState === "PAUSED" ? "Reanudar" : "Pausar";
  if (currentCastState.error) castStatus.textContent = currentCastState.error;
  updateTaskbarControls();
  scheduleCastPrewarm();
}

async function toggleCastPlayback(): Promise<void> {
  try {
    currentCastState = await window.hires.castCommand(currentCastState.playerState === "PAUSED" ? "play" : "pause");
    renderCastState();
  } catch (error) {
    showCastError(error);
  }
}

async function togglePlayback(): Promise<void> {
  if (!selectedTrack) return;
  if (currentCastState.connected) {
    await toggleCastPlayback();
    return;
  }
  if (player.dataset.trackId !== selectedTrack.id) {
    player.src = selectedTrack.localUrl;
    player.dataset.trackId = selectedTrack.id;
    renderLocalTransport();
  }
  if (player.paused) await player.play();
  else player.pause();
}

function renderRemoteTransport(): void {
  const duration = currentCastState.duration ?? selectedTrack?.durationSeconds ?? 0;
  const currentTime = Math.min(duration || Number.POSITIVE_INFINITY, currentCastState.currentTime ?? 0);
  const playable = currentCastState.playerState === "PLAYING" || currentCastState.playerState === "PAUSED";
  remoteToggle.disabled = !playable;
  setButtonIcon(remoteToggle, currentCastState.playerState === "PLAYING" ? "pause" : "play");
  remoteProgress.disabled = duration <= 0;
  remoteProgress.max = String(Math.max(1, duration));
  if (!draggingRemoteProgress) remoteProgress.value = String(currentTime);
  updateRangeProgress(remoteProgress, currentTime, duration);
  remoteTime.textContent = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;
  remoteVolume.disabled = currentCastState.volumeLevel == null;
  if (!changingRemoteVolume && currentCastState.volumeLevel != null) {
    remoteVolume.value = String(currentCastState.volumeLevel);
  }
  updateRangeProgress(remoteVolume, Number(remoteVolume.value), 1);
}

function renderLocalTransport(): void {
  const duration = Number.isFinite(player.duration) ? player.duration : (selectedTrack?.durationSeconds ?? 0);
  const currentTime = Math.min(duration || Number.POSITIVE_INFINITY, player.currentTime || 0);
  localToggle.disabled = !selectedTrack;
  setButtonIcon(localToggle, selectedTrack && !player.paused ? "pause" : "play");
  localProgress.disabled = !selectedTrack || duration <= 0;
  localProgress.max = String(Math.max(1, duration));
  if (!draggingLocalProgress) localProgress.value = String(currentTime);
  localTime.textContent = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;
  updateRangeProgress(localProgress, currentTime, duration);
}

function updateRangeProgress(input: HTMLInputElement, value: number, maximum: number): void {
  const progress = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  input.style.setProperty("--range-progress", `${progress}%`);
}

function showCastError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  castStatus.textContent = message.replace(/^Error invoking remote method '[^']+': Error: /, "");
  castPanel.hidden = false;
}

function groupAlbums(tracks: Track[]): Album[] {
  const albums = new Map<string, Album>();
  for (const track of tracks) {
    const key = `${track.artist}\u0000${track.album}`;
    const album = albums.get(key) ?? {
      key,
      title: track.album,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      tracks: []
    };
    album.artworkUrl ??= track.artworkUrl;
    album.tracks.push(track);
    albums.set(key, album);
  }
  return [...albums.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

function groupArtists(tracks: Track[]): Artist[] {
  const artists = new Map<string, Track[]>();
  tracks.forEach((track) => {
    const name = track.artist || "Artista desconocido";
    const artistTracks = artists.get(name) ?? [];
    artistTracks.push(track);
    artists.set(name, artistTracks);
  });
  return [...artists.entries()]
    .map(([name, artistTracks]) => ({
      name,
      artworkUrl: artistTracks.find((track) => track.artworkUrl)?.artworkUrl,
      tracks: artistTracks,
      albums: groupAlbums(artistTracks)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function setActiveTab(tab: LibraryView): void {
  const changed = getCurrentView() !== tab;
  tracksTab.classList.toggle("active", tab === "tracks");
  albumsTab.classList.toggle("active", tab === "albums");
  artistsTab.classList.toggle("active", tab === "artists");
  playlistsTab.classList.toggle("active", tab === "playlists");
  positionActiveTabIndicator();
  if (changed) requestAnimationFrame(() => window.scrollTo({ top: viewScrollPositions[tab] ?? 0 }));
}

function positionActiveTabIndicator(): void {
  const active = viewTabs.querySelector<HTMLElement>(".view-tab.active");
  if (!active) return;
  viewTabs.style.setProperty("--tab-pill-x", `${active.offsetLeft}px`);
  viewTabs.style.setProperty("--tab-pill-width", `${active.offsetWidth}px`);
}

function setPlaybackContext(track: Track, context: Track[]): void {
  playbackContext = [...context];
  if (shuffleEnabled) {
    playbackQueue = [track, ...shuffle(context.filter((item) => item.id !== track.id))];
    queueIndex = 0;
  } else {
    playbackQueue = [...context];
    queueIndex = Math.max(0, playbackQueue.findIndex((item) => item.id === track.id));
  }
}

async function playNext(automatic = false): Promise<void> {
  if (automatic && repeatMode === "track" && selectedTrack) {
    await replayCurrentTrack();
    return;
  }

  if (!selectedTrack) {
    const firstManual = manualQueue.shift();
    if (firstManual) await playTrack(firstManual, [], true, "manual");
    else updateQueueButtons();
    return;
  }

  if (manualQueue.length > 0) {
    rememberCurrentForPrevious();
    const nextManual = manualQueue.shift();
    if (nextManual) await playTrack(nextManual, playbackContext, true, "manual");
    return;
  }

  if (currentPlaybackSource === "manual") {
    const resumedIndex = queueIndex + 1;
    const resumed = playbackQueue[resumedIndex];
    if (!resumed) {
      updateQueueButtons();
      return;
    }
    rememberCurrentForPrevious();
    queueIndex = resumedIndex;
    await playTrack(resumed, playbackContext, true, "scheduled");
    return;
  }

  if (repeatMode === "album") {
    const albumQueue = getCurrentAlbumQueue();
    const albumIndex = albumQueue.findIndex((track) => track.id === selectedTrack!.id);
    const next = albumQueue[(Math.max(0, albumIndex) + 1) % albumQueue.length];
    if (next) {
      rememberCurrentForPrevious();
      const nextQueueIndex = playbackQueue.findIndex((track) => track.id === next.id);
      if (nextQueueIndex >= 0) queueIndex = nextQueueIndex;
      if (!automatic) autoAdvancedTrackId = selectedTrack.id;
      await playTrack(next, playbackContext, true, "scheduled");
    }
    return;
  }
  if (!selectedTrack || queueIndex < 0 || queueIndex >= playbackQueue.length - 1) {
    updateQueueButtons();
    return;
  }
  rememberCurrentForPrevious();
  queueIndex += 1;
  const next = playbackQueue[queueIndex];
  if (!next) return;
  if (!automatic) autoAdvancedTrackId = selectedTrack.id;
  await playTrack(next, playbackContext, true, "scheduled");
}

async function playPrevious(): Promise<void> {
  if (!selectedTrack) return;
  const currentSeconds = currentCastState.connected ? (currentCastState.currentTime ?? 0) : player.currentTime;
  if (currentSeconds > 5) {
    if (currentCastState.connected) {
      try {
        currentCastState = await window.hires.castSeek(0);
        renderCastState();
      } catch (error) {
        showCastError(error);
      }
    } else {
      player.currentTime = 0;
      void player.play();
    }
    return;
  }

  const historyEntry = playbackHistory.pop();
  if (historyEntry) {
    if (currentPlaybackSource === "manual" && selectedTrack) manualQueue.unshift(selectedTrack);
    queueIndex = historyEntry.scheduledIndex;
    await playTrack(historyEntry.track, playbackContext, true, historyEntry.source);
    return;
  }

  if (currentPlaybackSource === "manual") {
    const scheduledAnchor = playbackQueue[queueIndex];
    if (scheduledAnchor) {
      manualQueue.unshift(selectedTrack);
      await playTrack(scheduledAnchor, playbackContext, true, "scheduled");
    }
    return;
  }

  if (repeatMode === "album") {
    const albumQueue = getCurrentAlbumQueue();
    const albumIndex = albumQueue.findIndex((track) => track.id === selectedTrack!.id);
    const previous = albumQueue[(albumIndex - 1 + albumQueue.length) % albumQueue.length];
    if (previous) {
      const previousQueueIndex = playbackQueue.findIndex((track) => track.id === previous.id);
      if (previousQueueIndex >= 0) queueIndex = previousQueueIndex;
      await playTrack(previous, playbackContext, true, "scheduled");
    }
    return;
  }
  if (queueIndex <= 0) {
    if (!currentCastState.connected) player.currentTime = 0;
    return;
  }
  queueIndex -= 1;
  const previous = playbackQueue[queueIndex];
  if (previous) await playTrack(previous, playbackContext, true, "scheduled");
}

function rememberCurrentForPrevious(): void {
  if (!selectedTrack) return;
  playbackHistory.push({ track: selectedTrack, source: currentPlaybackSource, scheduledIndex: queueIndex });
  if (playbackHistory.length > 50) playbackHistory.shift();
}

function toggleShuffle(): void {
  shuffleEnabled = !shuffleEnabled;
  shuffleButton.classList.toggle("active", shuffleEnabled);
  shuffleButton.setAttribute("aria-pressed", String(shuffleEnabled));
  shuffleButton.title = shuffleEnabled ? "Aleatorio activado" : "Aleatorio";

  if (selectedTrack) {
    const scheduledAnchor = playbackQueue[queueIndex];
    if (shuffleEnabled) {
      const historyEnd = Math.max(0, queueIndex + (currentPlaybackSource === "scheduled" ? 0 : 1));
      const history = playbackQueue.slice(0, historyEnd);
      const historyIds = new Set(history.map((track) => track.id));
      const currentScheduled = currentPlaybackSource === "scheduled" ? selectedTrack : undefined;
      const remaining = playbackContext.filter((track) => track.id !== currentScheduled?.id && !historyIds.has(track.id));
      playbackQueue = currentScheduled
        ? [...history, currentScheduled, ...shuffle(remaining)]
        : [...history, ...shuffle(remaining)];
      queueIndex = currentScheduled ? history.length : history.length - 1;
    } else {
      playbackQueue = [...playbackContext];
      queueIndex = playbackQueue.findIndex((track) => track.id === (scheduledAnchor ?? selectedTrack!).id);
    }
  }
  updateQueueButtons();
}

function toggleRepeat(): void {
  repeatMode = repeatMode === "off" ? "album" : repeatMode === "album" ? "track" : "off";
  repeatButton.classList.toggle("active", repeatMode !== "off");
  repeatButton.setAttribute("aria-pressed", String(repeatMode !== "off"));
  repeatModeLabel.hidden = repeatMode === "off";
  repeatModeLabel.textContent = repeatMode === "album" ? "A" : repeatMode === "track" ? "1" : "";
  repeatButton.title = repeatMode === "album" ? "Repetir álbum" : repeatMode === "track" ? "Repetir canción" : "Repetir";
  repeatButton.setAttribute("aria-label", repeatMode === "album"
    ? "Cambiar a repetición de canción"
    : repeatMode === "track" ? "Desactivar repetición" : "Activar repetición de álbum");
  updateQueueButtons();
}

async function replayCurrentTrack(): Promise<void> {
  if (!selectedTrack) return;
  if (currentCastState.connected) {
    await playTrack(selectedTrack, playbackContext, true, currentPlaybackSource);
    return;
  }
  player.currentTime = 0;
  await player.play();
}

function getCurrentAlbumQueue(): Track[] {
  if (!selectedTrack) return [];
  const sameAlbum = (track: Track) => track.artist === selectedTrack!.artist && track.album === selectedTrack!.album;
  const queuedAlbum = playbackQueue.filter(sameAlbum);
  return queuedAlbum.length > 0 ? queuedAlbum : libraryTracks.filter(sameAlbum);
}

function updateQueueButtons(): void {
  const hasTrack = Boolean(selectedTrack);
  previousTrackButton.disabled = !hasTrack;
  const albumCanLoop = currentPlaybackSource === "scheduled" && repeatMode === "album" && getCurrentAlbumQueue().length > 0;
  const hasManualNext = manualQueue.length > 0;
  const hasScheduledNext = queueIndex >= -1 && queueIndex < playbackQueue.length - 1;
  nextTrackButton.disabled = !hasTrack || (!hasManualNext && !albumCanLoop && !hasScheduledNext);
  renderQueue();
  scheduleCastPrewarm();
  updateTaskbarControls();
  savePlaybackSession();
}

type SavedPlaybackSession = {
  version: 1;
  selectedTrackId?: string;
  contextIds: string[];
  scheduledIds: string[];
  manualIds: string[];
  queueIndex: number;
  source: PlaybackSource;
  shuffle: boolean;
  repeat: RepeatMode;
  currentTime: number;
  volume: number;
  view: LibraryView;
  scroll: Partial<Record<LibraryView, number>>;
};

function savePlaybackSession(): void {
  if (!sessionRestored && libraryTracks.length === 0) return;
  const session: SavedPlaybackSession = {
    version: 1,
    selectedTrackId: selectedTrack?.id,
    contextIds: playbackContext.map((track) => track.id),
    scheduledIds: playbackQueue.map((track) => track.id),
    manualIds: manualQueue.map((track) => track.id),
    queueIndex,
    source: currentPlaybackSource,
    shuffle: shuffleEnabled,
    repeat: repeatMode,
    currentTime: currentCastState.connected ? (currentCastState.currentTime ?? 0) : (player.currentTime || 0),
    volume: player.volume,
    view: getCurrentView(),
    scroll: viewScrollPositions
  };
  localStorage.setItem("flac-cast-playback-session", JSON.stringify(session));
}

function restorePlaybackSession(): void {
  if (sessionRestored) return;
  sessionRestored = true;
  let session: SavedPlaybackSession | undefined;
  try {
    session = JSON.parse(localStorage.getItem("flac-cast-playback-session") ?? "") as SavedPlaybackSession;
  } catch { return; }
  if (session.version !== 1) return;
  Object.assign(viewScrollPositions, session.scroll ?? {});
  const byId = new Map(libraryTracks.map((track) => [track.id, track]));
  const materialize = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  playbackContext = materialize(session.contextIds ?? []);
  playbackQueue = materialize(session.scheduledIds ?? []);
  manualQueue = materialize(session.manualIds ?? []);
  queueIndex = Math.max(-1, Math.min(session.queueIndex ?? -1, playbackQueue.length - 1));
  currentPlaybackSource = session.source === "manual" ? "manual" : "scheduled";
  shuffleEnabled = Boolean(session.shuffle);
  shuffleButton.classList.toggle("active", shuffleEnabled);
  shuffleButton.setAttribute("aria-pressed", String(shuffleEnabled));
  repeatMode = session.repeat === "album" || session.repeat === "track" ? session.repeat : "off";
  repeatButton.classList.toggle("active", repeatMode !== "off");
  repeatModeLabel.hidden = repeatMode === "off";
  repeatModeLabel.textContent = repeatMode === "album" ? "A" : repeatMode === "track" ? "1" : "";
  const track = session.selectedTrackId ? byId.get(session.selectedTrackId) : undefined;
  if (track) {
    selectedTrack = track;
    player.src = track.localUrl;
    player.dataset.trackId = track.id;
    player.volume = Math.max(0, Math.min(1, session.volume ?? 1));
    localVolume.value = String(player.volume);
    player.addEventListener("loadedmetadata", () => {
      player.currentTime = Math.min(session!.currentTime ?? 0, player.duration || Number.POSITIVE_INFINITY);
      renderLocalTransport();
    }, { once: true });
    nowTitle.textContent = track.title;
    nowDetail.textContent = `${track.artist} · ${formatQuality(track)}`;
    replaceArtwork(nowArtwork, track.artworkUrl);
    nowPlaylistButton.disabled = false;
    void applyPlayerAccent(track.artworkUrl);
  }
  openLibraryView(session.view ?? "tracks");
  updateRangeProgress(localVolume, player.volume, 1);
  updateQueueButtons();
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select") || playlistDialog.open || playlistEditDialog.open) return;
  if (event.ctrlKey && event.key.toLocaleLowerCase() === "f") {
    event.preventDefault();
    librarySearch.focus();
    librarySearch.select();
  } else if (event.code === "Space") {
    event.preventDefault();
    void togglePlayback();
  } else if (event.ctrlKey && event.key === "ArrowRight") {
    event.preventDefault();
    void playNext();
  } else if (event.ctrlKey && event.key === "ArrowLeft") {
    event.preventDefault();
    void playPrevious();
  } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 5 : -5;
    if (currentCastState.connected) void window.hires.castSeek(Math.max(0, (currentCastState.currentTime ?? 0) + delta));
    else player.currentTime = Math.max(0, Math.min(player.duration || Number.POSITIVE_INFINITY, player.currentTime + delta));
  } else if (event.key.toLocaleLowerCase() === "s") {
    toggleShuffle();
  } else if (event.key.toLocaleLowerCase() === "r") {
    toggleRepeat();
  }
}

function scheduleCastPrewarm(): void {
  if (castPrewarmTimer) clearTimeout(castPrewarmTimer);
  castPrewarmTimer = undefined;
  if (!currentCastState.connected || currentCastState.deliveryPhase !== "playing") {
    if (!currentCastState.connected) lastCastPrewarmSignature = "";
    return;
  }
  const upcoming = [
    ...manualQueue,
    ...playbackQueue.slice(Math.max(0, queueIndex + 1))
  ].slice(0, 5);
  if (upcoming.length === 0) return;
  const signature = `${currentCastState.deviceId ?? "cast"}:${upcoming.map((track) => track.id).join("|")}`;
  if (signature === lastCastPrewarmSignature) return;
  lastCastPrewarmSignature = signature;
  castPrewarmTimer = setTimeout(() => {
    castPrewarmTimer = undefined;
    void window.hires.prewarmCastTracks(upcoming).catch((error) => {
      console.warn("No se pudo preparar la cola de Cast", error);
      if (lastCastPrewarmSignature === signature) lastCastPrewarmSignature = "";
    });
  }, 350);
}

function updateTaskbarControls(): void {
  const hasTrack = Boolean(selectedTrack);
  const state = {
    hasTrack,
    isPlaying: currentCastState.connected ? currentCastState.playerState === "PLAYING" : hasTrack && !player.paused && !player.ended,
    canGoPrevious: hasTrack,
    canGoNext: hasTrack && !nextTrackButton.disabled
  };
  const signature = JSON.stringify(state);
  if (signature === lastTaskbarSignature) return;
  lastTaskbarSignature = signature;
  window.hires.setTaskbarPlaybackState(state);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex]!, result[index]!];
  }
  return result;
}

function createArtwork(url: string | undefined, className: string): HTMLElement {
  if (!url) return createArtworkPlaceholder(className);
  const image = document.createElement("img");
  image.className = `artwork ${className}`;
  image.src = url;
  image.alt = "Carátula del álbum";
  image.loading = "lazy";
  image.addEventListener("error", () => image.replaceWith(createArtworkPlaceholder(className)));
  return image;
}

function createArtworkPlaceholder(className: string): HTMLElement {
  const placeholder = document.createElement("div");
  placeholder.className = `artwork artwork-placeholder ${className}`;
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.append(createIcon("music", "placeholder-icon"));
  return placeholder;
}

function createIcon(name: IconName, className = "control-icon"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

function setButtonIcon(button: HTMLButtonElement, name: "play" | "pause"): void {
  button.replaceChildren(createIcon(name));
}

function initializeUiScale(): void {
  const preference = normalizeUiScalePreference(localStorage.getItem("hires-ui-scale"));
  uiScaleSelect.value = preference;
  void applyUiScale(preference);
}

function normalizeUiScalePreference(value: string | null): UiScalePreference {
  return value === "0.9" || value === "1" || value === "1.1" || value === "1.25" ? value : "auto";
}

async function applyUiScale(preference: UiScalePreference): Promise<void> {
  const screenWidth = window.screen.availWidth;
  const scale = preference === "auto"
    ? screenWidth >= 3000 ? 1.25 : screenWidth >= 2200 ? 1.15 : screenWidth >= 1700 ? 1.08 : 1
    : Number(preference);
  if (scale === appliedUiScale) return;
  appliedUiScale = await window.hires.setUiScale(scale);
}

function replaceArtwork(container: HTMLElement, url?: string): void {
  const replacement = createArtwork(url, "artwork-player");
  replacement.id = "now-art";
  container.replaceWith(replacement);
  nowArtwork = replacement;
}

async function applyPlayerAccent(artworkUrl?: string): Promise<void> {
  const fallback = "rgb(199 243 107)";
  if (!artworkUrl) {
    document.documentElement.style.setProperty("--player-accent", fallback);
    return;
  }
  const pending = artworkAccentCache.get(artworkUrl) ?? extractArtworkAccent(artworkUrl);
  artworkAccentCache.set(artworkUrl, pending);
  const accent = await pending.catch(() => fallback);
  if (selectedTrack?.artworkUrl === artworkUrl) document.documentElement.style.setProperty("--player-accent", accent);
}

function extractArtworkAccent(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas no disponible");
        context.drawImage(image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let totalWeight = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3]!;
          if (alpha < 180) continue;
          const r = pixels[index]!;
          const g = pixels[index + 1]!;
          const b = pixels[index + 2]!;
          const brightness = (r + g + b) / 3;
          if (brightness < 22 || brightness > 248) continue;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          const weight = 1 + chroma / 42;
          red += r * weight;
          green += g * weight;
          blue += b * weight;
          totalWeight += weight;
        }
        if (totalWeight === 0) throw new Error("La carátula no contiene color utilizable");
        let r = red / totalWeight;
        let g = green / totalWeight;
        let b = blue / totalWeight;
        const brightest = Math.max(r, g, b);
        const whiteMix = brightest < 115 ? .38 : brightest < 165 ? .2 : .08;
        r = r * (1 - whiteMix) + 255 * whiteMix;
        g = g * (1 - whiteMix) + 255 * whiteMix;
        b = b * (1 - whiteMix) + 255 * whiteMix;
        resolve(`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("No se pudo leer la carátula"));
    image.src = url;
  });
}

function createTrackDescription(track: Track, includeAlbum = true): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "track-copy";
  wrapper.append(
    createTextElement("strong", "", track.title),
    createTextElement("small", "", includeAlbum ? `${track.artist} · ${track.album}` : track.artist)
  );
  return wrapper;
}

function createTextElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function formatQuality(track: Track): string {
  const bitDepth = track.bitsPerSample ? `${track.bitsPerSample}-bit` : "— bit";
  const sampleRate = track.sampleRate ? `${track.sampleRate / 1000} kHz` : "— kHz";
  return `${bitDepth} / ${sampleRate}`;
}

function renderDeliveryQuality(track: Track): void {
  const format = currentCastState.deliveryMode === "wav-lossless"
    ? "WAV PCM lossless"
    : currentCastState.deliveryMode === "flac-repacked"
      ? "FLAC original · contenedor saneado"
      : currentCastState.deliveryMode === "flac-cached"
        ? "FLAC original · caché local"
        : "FLAC original";
  const bits = currentCastState.deliveryBits ?? track.bitsPerSample;
  const rate = track.sampleRate
    ? currentCastState.deliveryMode === "wav-lossless" ? Math.min(track.sampleRate, 96_000) : track.sampleRate
    : undefined;
  const quality = `${bits ? `${bits}-bit` : "— bit"} / ${rate ? `${rate / 1000} kHz` : "— kHz"}`;
  castQuality.textContent = `${format} · ${quality}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—:—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
