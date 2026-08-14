# Flac Cast

Flac Cast is a Windows desktop music player for local and network-hosted FLAC libraries. It plays music locally, browses metadata and artwork, manages playlists and queues, and streams lossless audio to Google Cast receivers over the local network.

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
- Windows taskbar thumbnail controls, global media keys, and a notification-area tray.
- Automatic library watching with a periodic NAS-safe consistency scan.
- Persistent libraries, playlists, window placement, and playback session.
- No accounts, telemetry, or cloud music upload.

## Requirements

- Windows 10 or Windows 11, x64.
- Node.js and npm for development.
- A local or network-accessible FLAC library.
- PC and Cast receiver on the same LAN for casting.
- Private-network firewall access for Electron when using Cast.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

Useful commands:

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run package:win
npm.cmd run make:win
```

`make:win` creates the Squirrel installer at:

```text
out\make\squirrel.windows\x64\Flac Cast Setup.exe
```

The current installer is unsigned. Windows Smart App Control or SmartScreen may block an unsigned build. Development can continue with the repository launcher or `npm.cmd run dev`; public distribution should use a trusted code-signing certificate.

## Data location

For compatibility with early builds, application state remains under:

```text
%APPDATA%\Hires Local
```

This directory contains settings, the library index, deduplicated artwork, and the lyrics cache. Temporary Cast conversions use the operating-system temporary directory.

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Google Cast pipeline](docs/CASTING.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Data, cache, privacy, and security](docs/DATA_AND_SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Current audio limitations

Local playback uses Chromium's normal Windows audio path, so it is not currently WASAPI-exclusive or guaranteed bit-perfect. Cast delivery is lossless, but the effective format depends on receiver support: direct FLAC is preferred, sanitized FLAC is attempted when needed, and WAV PCM is the final compatibility fallback. Sample rates above 96 kHz are reduced to 96 kHz only for the WAV fallback.

## Project status

Flac Cast is under active development. The repository is suitable for private testing and collaboration, but it does not yet provide automatic updates, signed releases, a formal migration policy, or a stable public API.
