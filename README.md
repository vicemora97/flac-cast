# Flac Cast

[![License: GPL v3 or later](https://img.shields.io/badge/License-GPL_v3_or_later-blue.svg)](LICENSE)
[![CI](https://github.com/vicemora97/flac-cast/actions/workflows/ci.yml/badge.svg)](https://github.com/vicemora97/flac-cast/actions/workflows/ci.yml)

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

- Windows 10 or Windows 11, x64; macOS 12 or later on Apple silicon for the current macOS package; or a modern x64 Linux desktop for the AppImage.
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
npm run package:linux # Linux only
npm run make:linux    # Linux only
```

Release artifacts are created under:

```text
out/make/squirrel.windows/x64/Flac-Cast-Windows-x64-Setup.exe
out/make/dmg/Flac-Cast-macOS-arm64.dmg
out/make/appimage/Flac-Cast-Linux-x86_64.AppImage
```

The current Windows installer is unsigned, and the macOS build is not Developer ID signed or notarized. Smart App Control, SmartScreen, or Gatekeeper may block these artifacts. Development can continue from a source checkout; public distribution should use trusted platform signing. The Linux AppImage is likewise unsigned and runs with `--no-sandbox`, since Electron's setuid sandbox helper cannot work once packaged inside an AppImage.

## Data location

For compatibility with early builds, application state remains under:

On Windows this is `%APPDATA%\Hires Local`; on macOS it is `~/Library/Application Support/Hires Local`; on Linux it is `~/.config/Hires Local`.

This directory contains settings, the library index, deduplicated artwork, and the lyrics cache. Temporary Cast conversions use the operating-system temporary directory.

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Google Cast pipeline](docs/CASTING.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Release guide](docs/RELEASE.md)
- [Data, cache, privacy, and security](docs/DATA_AND_SECURITY.md)
- [Privacy policy](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Project governance](GOVERNANCE.md)
- [Code signing policy](docs/CODE_SIGNING_POLICY.md)
- [Open-source release checklist](docs/OPEN_SOURCE_RELEASE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Asset provenance](ASSETS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Changelog](CHANGELOG.md)

## License

Copyright (C) 2026 Flac Cast contributors.

Flac Cast is free software licensed under the [GNU General Public License version 3 or later](LICENSE). You may use, study, modify, and redistribute it under that license. Distributed builds are provided without warranty. Third-party components remain under their respective terms; see [third-party notices](THIRD_PARTY_NOTICES.md).

The `"private": true` package-manifest field only prevents accidental publication to the npm registry. It does not make this GPL-licensed repository proprietary.

## Code signing policy

The current downloads are unsigned unless a release explicitly says otherwise. The project is preparing an application to SignPath Foundation and publishes the complete [code signing policy](docs/CODE_SIGNING_POLICY.md), including roles, release controls, and privacy links.

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Current audio limitations

Local playback uses Chromium's normal operating-system audio path, so it is not currently exclusive-mode or guaranteed bit-perfect. On Windows, it does not use WASAPI exclusive mode. Cast delivery is lossless, but the effective format depends on receiver support: direct FLAC is preferred, sanitized FLAC is attempted when needed, and WAV PCM is the final compatibility fallback. Sample rates above 96 kHz are reduced to 96 kHz only for the WAV fallback.

## Project status

Flac Cast is under active development. Versioned prereleases are suitable for private testing and collaboration, but the project does not yet provide automatic updates, signed/notarized artifacts, or a stable public API.
