# Changelog

All notable changes to Flac Cast are documented in this file.

## [1.0.1] - 2026-08-14

### Changed

- Added a localized About view with creator and macOS packaging credits, the running app version, and a repository shortcut.
- Standardized Windows and macOS release artifact names for a shared GitHub release.
- Updated Electron from 37.4.0 to 43.4.0 to include current security fixes.
- Made Windows and macOS packagers infer the Electron version from the locked project dependency.
- Synchronized the package manifest and lockfile version.
- Added reproducible GitHub Actions validation for pushes and pull requests.
- Expanded release and cross-platform documentation.

### Fixed

- Selected the LAN address that shares a subnet with the connected Cast receiver, preventing WSL, Hyper-V, Docker, VPN, and other virtual adapters from publishing unreachable media URLs.
- Prevented multiple Flac Cast instances from starting competing Cast sessions and media servers.
- Added complete Cast music metadata for album artist, track number, and disc number.
- Moved library searching and sorting to a background index and bounded visible result rendering for large libraries.
- Prioritized manually queued tracks within the bounded Cast preparation cache.

## [1.0.0] - 2026-08-14

### Added

- Local and NAS-hosted FLAC library indexing with persistent metadata and artwork caches.
- Track, album, artist, playlist, queue, search, sorting, and synchronized lyrics views.
- Local playback, shuffle, repeat, session restoration, media keys, tray controls, and Windows taskbar controls.
- Google Cast discovery, lossless FLAC delivery, WAV PCM fallback, seeking, volume synchronization, and queue prewarming.
- English and Spanish interfaces.
- Windows x64 packaging and an unsigned Squirrel installer.
- macOS Apple silicon packaging and an unsigned DMG installer.

[1.0.1]: https://github.com/vicemora97/flac-cast/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/vicemora97/flac-cast/releases/tag/v1.0.0
