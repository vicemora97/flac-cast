export type Track = {
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
  artworkUrl?: string;
  castArtworkUrl?: string;
  localUrl: string;
  castUrl?: string;
};

export type CastDevice = {
  id: string;
  name: string;
  model?: string;
};

export type CastState = {
  connected: boolean;
  deviceId?: string;
  deviceName?: string;
  deviceModel?: string;
  playerState?: "IDLE" | "PLAYING" | "PAUSED" | "BUFFERING";
  currentTime?: number;
  duration?: number;
  volumeLevel?: number;
  muted?: boolean;
  error?: string;
  idleReason?: string;
  deliveryMode?: CastDeliveryMode;
  deliveryBits?: number;
  deliverySampleRate?: number;
  deliveryPhase?: "preparing" | "loading" | "converting" | "playing" | "failed";
  currentTrackId?: string;
  repeatMode?: "off" | "all" | "single";
  queueActive?: boolean;
};

export type CastDeliveryMode = "original" | "flac-original" | "flac-cached" | "flac-repacked" | "flac-compatible" | "wav-lossless";

export type CastTrack = Pick<Track, "id" | "title" | "artist" | "album" | "albumArtist" | "trackNumber" | "discNumber" | "durationSeconds" | "sampleRate" | "bitsPerSample" | "bitrate" | "fileExtension" | "contentType" | "localUrl" | "castUrl" | "castArtworkUrl"> & {
  castDeliveryMode?: CastDeliveryMode;
  castDeliveryBits?: number;
  castDeliverySampleRate?: number;
};

export type CastQueueRequest = {
  tracks: CastTrack[];
  currentIndex: number;
  startTimeSeconds?: number;
  repeatMode: "off" | "all" | "single";
};

export type LyricsTrack = Pick<Track, "title" | "artist" | "album" | "durationSeconds">;

export type LyricsLine = {
  startTime: number;
  text: string;
};

export type SyncedLyrics = {
  source: "LRCLIB";
  trackName: string;
  artistName: string;
  lines: LyricsLine[];
};

export type LyricsLookupResult =
  | { status: "found"; lyrics: SyncedLyrics }
  | { status: "instrumental" }
  | { status: "missing" };

export type MediaAccess = {
  timestamp: number;
  clientAddress?: string;
  method?: string;
  range?: string;
  status: number;
  bytes?: number;
  cacheable?: boolean;
  responseMilliseconds?: number;
};

export type PlaybackCommand = "previous" | "toggle" | "next";

export type TaskbarPlaybackState = {
  hasTrack: boolean;
  isPlaying: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
};

export type Playlist = {
  id: string;
  name: string;
  artworkDataUrl?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type LibraryResult = {
  folder?: string;
  folders: string[];
  tracks: Track[];
  cacheUsed?: boolean;
  refreshWarning?: string;
  unavailableFolders?: string[];
  changed?: boolean;
};

export type HiresApi = {
  getAppVersion(): Promise<string>;
  openRepository(): Promise<boolean>;
  openProjectPage(page: "license" | "privacy" | "code-signing"): Promise<boolean>;
  openLyricsContribution(): Promise<boolean>;
  setLanguage(language: "en" | "es"): Promise<"en" | "es">;
  setUiScale(scale: number): Promise<number>;
  loadSavedLibrary(): Promise<LibraryResult>;
  refreshLibrary(): Promise<LibraryResult>;
  chooseLibrary(): Promise<LibraryResult>;
  removeLibrary(folder: string): Promise<LibraryResult>;
  revealTrack(localUrl: string): Promise<boolean>;
  trashTrack(localUrl: string, title: string, trackId: string): Promise<LibraryResult | undefined>;
  onLibraryUpdated(listener: (result: LibraryResult) => void): () => void;
  onLibraryActivity(listener: (active: boolean) => void): () => void;
  getCastDevices(): Promise<CastDevice[]>;
  getCastState(refreshVolume?: boolean): Promise<CastState>;
  connectCast(deviceId: string): Promise<CastState>;
  castTrack(track: CastTrack, startTimeSeconds?: number): Promise<CastState>;
  castQueue(request: CastQueueRequest): Promise<CastState>;
  updateCastQueue(request: CastQueueRequest): Promise<CastState>;
  updateCastQueueModes(request: CastQueueRequest): Promise<CastState>;
  castCommand(command: "play" | "pause"): Promise<CastState>;
  castSeek(seconds: number): Promise<CastState>;
  castVolume(level: number): Promise<CastState>;
  prewarmCastTracks(tracks: CastTrack[]): Promise<number>;
  prepareLocalTrack(track: CastTrack): Promise<string>;
  disconnectCast(): Promise<CastState>;
  getMediaAccess(): Promise<MediaAccess | undefined>;
  getLyrics(track: LyricsTrack): Promise<LyricsLookupResult>;
  setTaskbarPlaybackState(state: TaskbarPlaybackState): void;
  onTaskbarPlaybackCommand(listener: (command: PlaybackCommand) => void): () => void;
  getPlaylists(): Promise<Playlist[]>;
  createPlaylist(name: string): Promise<Playlist[]>;
  updatePlaylist(id: string, changes: { name?: string; artworkDataUrl?: string | null }): Promise<Playlist[]>;
  choosePlaylistArtwork(): Promise<string | undefined>;
  deletePlaylist(id: string): Promise<Playlist[]>;
  addTrackToPlaylist(playlistId: string, trackId: string): Promise<Playlist[]>;
  removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<Playlist[]>;
};
