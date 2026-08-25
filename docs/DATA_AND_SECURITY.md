# Data, cache, privacy, and security

## Local-first behavior

Flac Cast reads music only from folders explicitly selected by the user. It does not crawl unrelated drives, upload audio, create an account, or send playback analytics.

Internet access is used only after the user presses **Lyrics** for an uncached synchronized-lyrics lookup through LRCLIB, opens the official LRCGET contribution page after a missing match, or opens an external project page from **About**. Google Cast discovery and media transfer occur on the local network after the user opens or uses Cast controls. See the complete [privacy policy](../PRIVACY.md).

## Persistent data

The application intentionally retains the historical early-build data directory:

```text
%APPDATA%\Hires Local
```

### `settings.json`

Contains:

- configured library roots;
- playlist names and track IDs;
- optional playlist artwork as a data URL;
- window position, size, and maximized state.

Settings writes are serialized and use temporary-file replacement. A temporary settings file can be used for recovery if the main file cannot be parsed.

### `library-cache.json`

Contains the per-library metadata index, including full source paths, file size, modification time, first-discovered time, tags, duration, technical audio data, track/disc numbers, and artwork-cache references.

This file is local and can reveal music filenames and NAS paths to anyone who can access the Windows profile.

### `artwork-cache`

Contains deduplicated artwork blobs keyed by content hash. Identical artwork is stored once.

### Lyrics cache

LRCLIB results, instrumental markers, and negative lookups may be cached to avoid repeated network requests. This data contains track lookup information and synchronized lyric text, not audio. Flac Cast does not query LRCLIB automatically when a track starts; the lookup is initiated by pressing **Lyrics**. If the user chooses **Contribute lyrics** after a missing match, the app opens the official LRCGET download page without adding track metadata to the URL.

### Renderer local storage

Electron renderer storage retains:

- selected UI language;
- playback session and queue IDs;
- playback position and volume;
- shuffle and repeat state;
- current view and scroll positions;
- track-sort criterion and direction preferences.

The interface scale is automatic and no longer has a user preference.

## Temporary Cast cache

Prepared FLAC and WAV files are stored under the OS temporary directory in a Flac Cast cache folder. The cache is bounded to approximately 1 GiB and eight files, excluding protected active/in-progress items. It is performance data and can be removed while the application is fully stopped.

## Ephemeral media server

The HTTP server uses:

- a random port selected at startup;
- a new 192-bit random route token on every run;
- random media IDs and hash-based artwork IDs;
- an in-memory allowlist mapping IDs to registered files;
- only recognized, explicitly registered audio-format endpoints;
- no directory listing or arbitrary path query.

The server binds to all interfaces because Cast receivers must reach it. A valid tokenized URL is still required. URLs become invalid after the application exits because the token and registration map are discarded.

## Renderer boundary

The BrowserWindow uses:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- a restrictive Content Security Policy;
- a typed context bridge.

The renderer receives temporary HTTP URLs instead of source paths.

## File-operation validation

Reveal and delete requests submit a registered local media URL. The main process resolves it through the media-server registration map, canonicalizes the source path, and verifies that it is below one of the configured library roots.

This prevents the UI from requesting arbitrary file deletion through a fabricated path.

## Deletion policy

1. The user selects **Delete file**.
2. A native warning shows the original path.
3. The app requests Windows Recycle Bin deletion.
4. If the location does not support trash—common for SMB/NAS shares—a separate warning explains permanent deletion.
5. Permanent unlink occurs only after the second confirmation.
6. The library is rescanned and stale playlist/queue references are removed.

Users should test permanent deletion against disposable files before relying on it with a new NAS or permission configuration.

## Firewall guidance

Cast requires inbound access to Electron's ephemeral local HTTP port. If Windows Firewall prompts, allow access on private networks only. Public-network access is unnecessary and should remain disabled.

## Credentials

Flac Cast does not store NAS usernames or passwords. Windows, the mapped drive, or the SMB client owns network authentication. A library path may reveal a server/share name in settings and cache files.

## Clearing application data

To reset the application completely:

1. Quit Flac Cast from the tray.
2. Back up playlists or settings if required.
3. Remove `%APPDATA%\Hires Local`.
4. Optionally remove the temporary Cast cache.
5. Start Flac Cast and add libraries again.

Removing application data does not delete music files.

## Distribution security

The current development installer is unsigned. Windows reputation systems can block or warn about it. Do not instruct users to weaken Smart App Control globally. For broader distribution, sign binaries and installers with a trusted Windows code-signing certificate and publish checksums for release artifacts. See the public [code signing policy](CODE_SIGNING_POLICY.md).
