# Flac Cast

Flac Cast is a desktop music player for local and network-hosted FLAC libraries. It plays music locally, browses metadata and artwork, manages playlists and queues, and streams lossless audio to Google Cast receivers over the local network.

The application does not upload music to a cloud service. Local playback uses a loopback HTTP endpoint, while Cast receivers read an ephemeral LAN URL served directly by the PC.

## Highlights

- Multiple local, mapped-drive, UNC, and NAS library folders.
- Recursive FLAC indexing with an incremental metadata cache.
- Embedded artwork plus `cover`, `folder`, `front`, and `album` sidecar artwork.
- Track, album, artist, playlist, and search views.
- Artist, title, and audio-quality sorting.
- Local playback with previous, next, shuffle, album repeat, and track repeat.
- A FIFO manually-added queue layered above the scheduled playback queue.
- Synced lyrics through LRCLIB when a match exists.
- English default interface and an English/Spanish language selector.
- Google Cast discovery, playback, seeking, pause/resume, and synchronized volume.
- Direct FLAC delivery with lossless FLAC repacking and WAV PCM fallback.
- Disk prewarming for the next five Cast tracks.
- Global media keys and a notification-area/menu-bar tray, plus Windows taskbar thumbnail controls.
- Automatic library watching with a periodic NAS-safe consistency scan.
- Persistent libraries, playlists, window placement, and playback session.
- No accounts, telemetry, or cloud music upload.

## Requirements

- Windows 10 or Windows 11, x64; or macOS 12 or later on Apple silicon for the current macOS package.
- Node.js and npm for development.
- A local or network-accessible FLAC library.
- Computer and Cast receiver on the same LAN for casting.
- Private-network firewall access for Electron when using Cast.

## Development

```text
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

Useful commands:

```text
npm run check
npm run build
npm run package:win   # Windows only
npm run make:win      # Windows only
npm run package:mac   # macOS only
npm run make:mac      # macOS only
```

Release artifacts are created under:

```text
out/make/squirrel.windows/x64/Flac Cast Setup.exe
out/make/dmg/Flac Cast.dmg
```

The current Windows installer is unsigned, and the macOS build is not Developer ID signed or notarized. Smart App Control, SmartScreen, or Gatekeeper may block these artifacts. Development can continue from a source checkout; public distribution should use trusted platform signing.

Linux source compatibility is being prepared, but no Linux artifact should be advertised until the pending native package is merged and validated.

## Data location

For compatibility with early builds, application state remains under:

On Windows this is `%APPDATA%\Hires Local`; on macOS it is `~/Library/Application Support/Hires Local`.

This directory contains settings, the library index, deduplicated artwork, and the lyrics cache. Temporary Cast conversions use the operating-system temporary directory.

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Google Cast pipeline](docs/CASTING.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Release guide](docs/RELEASE.md)
- [Data, cache, privacy, and security](docs/DATA_AND_SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Changelog](CHANGELOG.md)

## Current audio limitations

Local playback uses Chromium's normal operating-system audio path, so it is not currently exclusive-mode or guaranteed bit-perfect. On Windows, it does not use WASAPI exclusive mode. Cast delivery is lossless, but the effective format depends on receiver support: direct FLAC is preferred, sanitized FLAC is attempted when needed, and WAV PCM is the final compatibility fallback. Sample rates above 96 kHz are reduced to 96 kHz only for the WAV fallback.

## Project status

Flac Cast is under active development. Versioned prereleases are suitable for private testing and collaboration, but the project does not yet provide automatic updates, signed/notarized artifacts, or a stable public API.
