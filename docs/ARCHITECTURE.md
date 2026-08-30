# Architecture

## Overview

Flac Cast is an Electron application written in TypeScript. It separates privileged desktop work from UI work using Electron's main process, a context-isolated preload bridge, and a sandboxed renderer.

```text
Selected audio libraries
        |
        v
  LibraryManager ----> persistent library index and artwork cache
        |
        v
    MediaServer ------> 127.0.0.1 URL ----> Chromium audio element
        |
        +-------------> LAN URL ----------> Google Cast receiver

Renderer UI <---- typed IPC ----> preload bridge <---- IPC ----> main process
    |
    +----> search Web Worker ----> normalized in-memory search index
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

### Background search index

`src/renderer/search-worker.ts` owns a compact, in-memory index containing only each track ID, title, artist, album, bit depth, sample rate, bitrate, and first-discovered timestamp. Text is normalized once when a track is added or changed: Unicode accents are removed, case is folded, and punctuation becomes spaces. Searches therefore avoid repeatedly normalizing the full library on the renderer thread.

The renderer sends incremental synchronization messages to the worker. Unchanged records are identified by lightweight signatures and are not resent; removed tracks are deleted explicitly. The worker filters and sorts matches away from the UI thread, then returns stable track IDs. A 90 ms input debounce avoids obsolete work while typing.

Search keeps every matching ID as the playback context, but creates at most 200 track-row DOM nodes. This bounds layout and rendering cost for very large libraries without shortening the playable result queue. The status inside the search field reports the brief initial indexing phase. If Web Workers are unavailable, the renderer falls back to the previous synchronous search path so the feature remains usable.

The search index is intentionally not another disk database. At launch it is rebuilt from the already persisted metadata cache, so it does not read audio files or reconnect to the NAS. Its memory cost grows with short textual metadata rather than audio-file size.

## Main modules

### LibraryManager

`LibraryManager` recursively scans supported FLAC, WAV, MP3, MP4-audio, AAC, Ogg, Opus, and AIFF extensions, reads metadata with `music-metadata`, and stores a cache record containing path, file size, modification time, first-discovered time, container MIME type, tags, technical format data, track/disc numbers, and artwork references.

On refresh, unchanged files reuse their previous records. Only new or modified files are reparsed. The first-discovered time remains stable across metadata edits; legacy records are seeded once from available file-system timestamps. Records from multiple libraries are normalized, deduplicated by path, and materialized as temporary HTTP URLs.

### LibraryWatcher

`LibraryWatcher` combines recursive `fs.watch` notifications with a ten-minute consistency poll. The poll covers NAS devices that do not reliably publish SMB change events. Events are debounced; watcher activity is reduced while the window is hidden and pending work resumes when it becomes active.

### MediaServer

`MediaServer` binds an ephemeral port on all interfaces and creates a random token for each run. Only files explicitly registered in memory can be served. It supports `OPTIONS`, `HEAD`, full responses, byte ranges, CORS, validators, persistent HTTP connections, every indexed audio MIME type, and artwork endpoints. Prepared immutable files cache their metadata; original library files are revalidated with asynchronous file-system operations.

Local playback receives a `127.0.0.1` URL. Cast receives a LAN IPv4 URL. The source path is never exposed to the renderer.

### CastController

`CastController` discovers `_googlecast._tcp` services through mDNS and launches a registered Flac Cast Custom Web Receiver. Source development runs select the unpublished development application ID, while packaged applications select the published production ID. If the selected custom receiver cannot launch, the controller falls back to Google's Default Media Receiver. It loads media and bounded receiver queues, tracks receiver state, and controls volume, seek, pause, and resume. It maintains a short-lived device list and refreshes receiver volume separately from media status. Active queues are synchronized differentially so unchanged receiver items retain their IDs and prepared URLs. When direct playback fails, it can rebuild the receiver session once, retry the original media with a fresh URL, and only then use compatible FLAC and universal WAV fallbacks. Successful fallback families are remembered per receiver and exact technical profile to guide later prewarming without lowering the first quality attempt.

### LosslessTranscoder

`LosslessTranscoder` inspects FLAC headers, reuses prepared entries when available, copies upcoming compatible files into the Cast cache, strips oversized non-audio payloads by stream-copying the FLAC audio when necessary, and creates compatible FLAC or WAV PCM fallback files. A clean uncached current FLAC can be streamed from the source immediately while future preparation continues. The disk cache is bounded by file count and total size.

### PreferencesStore

`PreferencesStore` persists library folders, playlists, playlist artwork, and window geometry. Writes use a temporary file followed by rename to reduce the chance of a partially written settings file.

### LyricsService

`LyricsService` queries LRCLIB only after the user presses **Lyrics**, parses timestamped lines, respects temporary rate limits, and keeps a local result cache. It first tries LRCLIB's exact metadata endpoint, then scores search candidates by normalized title, artist, album, and duration when the exact record has no synchronized text. A synchronized candidate is preferred over incomplete or contradictory instrumental records. Cached lookup results distinguish synchronized lyrics, tracks explicitly marked as instrumental, and missing matches. The renderer resets lyric state on track changes without making a network request. Missing matches expose a user-initiated link to the official LRCGET client; Flac Cast does not publish lyrics itself or pass track metadata to the external page.

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

Local playback uses the hidden HTML audio element. If Chromium rejects an indexed container, the main process prepares a WAV fallback on demand and the renderer resumes through its loopback URL. Cast playback pauses local audio and uses receiver state as the authoritative clock, duration, play/pause state, volume, current queue item, and repeat state. The UI renders one transport at a time while keeping a single selected-track model.

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
