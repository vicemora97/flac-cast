# Architecture

## Overview

Flac Cast is an Electron application written in TypeScript. It separates privileged desktop work from UI work using Electron's main process, a context-isolated preload bridge, and a sandboxed renderer.

```text
Selected FLAC libraries
        |
        v
  LibraryManager ----> persistent library index and artwork cache
        |
        v
    MediaServer ------> 127.0.0.1 URL ----> Chromium audio element
        |
        +-------------> LAN URL ----------> Google Cast receiver

Renderer UI <---- typed IPC ----> preload bridge <---- IPC ----> main process
```

## Process boundaries

### Main process

The main process owns all operating-system capabilities:

- native windows, tray, dialogs, and taskbar thumbnail buttons;
- library folder selection and file-system access;
- metadata scanning and persistent caches;
- local HTTP media serving;
- mDNS discovery and Cast v2 communication;
- FFmpeg-based lossless preparation and conversion;
- safe reveal and deletion operations;
- global multimedia-key registration.

The main entry point is `src/main/main.ts`.

### Preload bridge

`src/main/preload.ts` exposes the narrow `HiresApi` contract defined in `src/shared/contracts.ts`. The renderer does not receive Node.js primitives or direct file-system access. IPC methods return serializable tracks, playlists, Cast state, library state, and lyrics.

### Renderer

`src/renderer/app.ts` owns presentation and playback orchestration:

- library views and search;
- local audio controls;
- scheduled and manual queues;
- playlists and context menus;
- Cast panels and state polling;
- lyrics synchronization;
- session persistence in renderer local storage;
- English/Spanish localization.

The renderer is context-isolated, has Node integration disabled, and runs with Electron sandboxing enabled.

## Main modules

### LibraryManager

`LibraryManager` recursively scans `.flac` files, reads metadata with `music-metadata`, and stores a cache record containing path, file size, modification time, tags, technical format data, track/disc numbers, and artwork references.

On refresh, unchanged files reuse their previous records. Only new or modified files are reparsed. Records from multiple libraries are normalized, deduplicated by path, and materialized as temporary HTTP URLs.

### LibraryWatcher

`LibraryWatcher` combines recursive `fs.watch` notifications with a ten-minute consistency poll. The poll covers NAS devices that do not reliably publish SMB change events. Events are debounced; watcher activity is reduced while the window is hidden and pending work resumes when it becomes active.

### MediaServer

`MediaServer` binds an ephemeral port on all interfaces and creates a random token for each run. Only files explicitly registered in memory can be served. It supports `OPTIONS`, `HEAD`, full responses, byte ranges, CORS, FLAC/WAV MIME types, and artwork endpoints.

Local playback receives a `127.0.0.1` URL. Cast receives a LAN IPv4 URL. The source path is never exposed to the renderer.

### CastController

`CastController` discovers `_googlecast._tcp` services through mDNS, starts the Default Media Receiver, loads media, tracks receiver state, and controls volume, seek, pause, and resume. It maintains a short-lived device list and refreshes receiver volume separately from media status.

### LosslessTranscoder

`LosslessTranscoder` inspects FLAC headers, copies compatible files into the Cast cache, strips oversized non-audio payloads by stream-copying the FLAC audio when necessary, and creates WAV PCM fallback files. Its cache is bounded by file count and total size.

### PreferencesStore

`PreferencesStore` persists library folders, playlists, playlist artwork, and window geometry. Writes use a temporary file followed by rename to reduce the chance of a partially written settings file.

### LyricsService

`LyricsService` queries LRCLIB for synchronized lyrics, parses timestamped lines, respects temporary rate limits, and keeps a local result cache. The lyrics button remains unavailable when no synchronized match exists.

## Startup sequence

1. Electron initializes the historical user-data path.
2. Preferences are loaded, with temporary-file recovery if needed.
3. Cached library folders can recover an older missing folder preference.
4. The library watcher is configured.
5. The media server starts and chooses an ephemeral port.
6. The browser window loads the compiled renderer.
7. The renderer applies automatic scale and the saved language.
8. Cached tracks render immediately.
9. A delayed background refresh validates every configured library.
10. The previous playback session, queue, volume, view, and scroll positions are restored when possible.

## Playback model

The renderer maintains two upcoming queues:

- `playbackQueue`: the scheduled context created by the selected album, artist, playlist, search results, or track list;
- `manualQueue`: a FIFO priority queue populated by **Add to queue**.

Manual entries play before the next scheduled item. Playback history records both source and scheduled index so Previous can return across queue boundaries. Shuffle affects the scheduled context but does not reorder manually queued items.

## Local and Cast state

Local playback uses the hidden HTML audio element. Cast playback pauses local audio and uses receiver state as the authoritative clock, duration, play/pause state, and volume. The UI renders one transport at a time while keeping a single selected-track model.

## Localization

`src/renderer/i18n.ts` contains typed English and Spanish catalogs. English is the fallback and default. The selected language is stored in renderer local storage and forwarded to the main process so native dialogs, tray items, and taskbar controls use the same language.

## Security decisions

- No direct Node access in the renderer.
- No arbitrary path IPC for playback; media URLs resolve through a registration table.
- File reveal and deletion validate that the resolved source is inside a configured library root.
- Deletion prefers the Windows Recycle Bin and requires a second explicit confirmation before permanent deletion on NAS locations without trash support.
- Media URLs use a new random token and random IDs on every application run.
- No Internet upload is involved in playback or Cast delivery.

See [Data and security](DATA_AND_SECURITY.md) for the complete data model and threat boundaries.
