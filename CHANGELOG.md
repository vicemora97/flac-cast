# Changelog

All notable changes to Flac Cast are documented in this file.

## [Unreleased]

## [1.0.7] - 2026-08-25

### Added

- Added recently-added sorting based on the first time Flac Cast discovers each file, with newest-first and oldest-first order options.

### Changed

- Audio-quality groups now use track title A–Z as their stable secondary order.

### Fixed

- Retried Cast queue synchronization after a track transition so FIFO tracks added while the receiver was loading cannot be skipped by the scheduled queue.
- Inserted new Cast FIFO entries directly before the scheduled queue, kept a valid next item during receiver updates, and prevented concurrent advances from consuming a queued track without starting it.

## [1.0.6] - 2026-08-21

### Added

- Added a trademark policy that distinguishes the GPL-licensed source from the official Flac Cast name, icon, and release identity.

### Fixed

- Corrected the Windows installer product metadata so `ProductName` is consistently reported as `Flac Cast`, as required by the published code-signing policy.

## [1.0.5] - 2026-08-21

### Added

- Added track context-menu shortcuts for opening the corresponding artist or album.
- Added browser-style Back and Forward library navigation with search and scroll restoration.
- Added a delayed, state-verified Cast queue watchdog that advances only when the receiver remains stuck on the same completed track.

### Changed

- Active Cast queues now update in place when shuffle, repeat, or upcoming tracks change, avoiding a reload of the song currently playing.
- List repeat is now contextual and loops the playlist, album, artist, or track list that started playback.
- Clean uncached FLAC files start directly while the bounded upcoming window is prepared in the background, reducing first-play latency for NAS libraries.
- Prepared files are routed into the receiver queue, and only changed future items are replaced instead of rebuilding the complete queue.
- Successful delivery profiles are learned per receiver and technical FLAC profile so future prewarming can prepare the proven compatible variant.
- Immutable prepared media is reused through HTTP keep-alive, cache validators, and asynchronous file metadata reads with response timing for diagnostics.
- Receiver volume polling is less frequent without delaying playback-state updates.
- Cast discovery performs a short bounded mDNS refresh burst when its panel opens.
- Local builds inside OneDrive folders can overwrite generated artifacts when OneDrive temporarily denies deleting the `dist` directory.

### Fixed

- Preserved the repeat selection across Cast track changes instead of allowing a transient receiver `REPEAT_OFF` loading status to clear it.
- Preserved the active track and position when the Cast control socket closes unexpectedly, with one bounded automatic session reconstruction.
- Isolated reconstructed Cast sessions from stale queue synchronization, prewarming, and end-of-track watchdog callbacks.
- Kept physical receiver volume separate from Cast media-session volume so queue and playback changes no longer make the soundbar slider flash an incorrect value.

## [1.0.4] - 2026-08-20

### Added

- Added WAV, MP3, M4A/ALAC, AAC, Ogg Vorbis, Opus, AIFF, and AIF library indexing and playback alongside FLAC.
- Added album sorting and an independent ascending/descending order selector for text and quality sorts.
- Added a real bounded Google Cast queue so compatible Google Home surfaces can expose receiver-side Previous, Next, and repeat controls.
- Added automatic local WAV preparation when Chromium cannot decode a supported source container directly.

### Changed

- Long now-playing track titles scroll independently using the same slow marquee behavior as long artist lists.
- Cast queues preserve the manual FIFO priority layer and include recent history for receiver-side Previous.
- Search-index sorting now follows both the selected criterion and direction.
- Cast compatibility fallback now tries FLAC at up to 24-bit/48 kHz before universal dithered WAV PCM at up to 16-bit/48 kHz, and reports the effective output rate.

### Fixed

- Added one-shot Cast session recovery and cache-busted direct-audio retry before WAV fallback when a stale receiver session rejects an otherwise valid file.
- Added one-shot receiver-session recovery and a cache-busted `QUEUE_LOAD` retry before disabling remote queue controls for the connection.
- Prevented delayed events from an abandoned Cast socket from disconnecting its replacement session, limited each track change to one soft receiver reconnection, and verified WAV stability before reporting playback.
- Prevented the desktop auto-advance timer from reloading a track that an active receiver-side queue had already started.
- Added automatic recovery when a queued item fails after a receiver-side transition, while preventing retry loops.
- Restored verified single-track playback when a receiver rejects `QUEUE_LOAD`, preventing optional remote queue support from breaking Cast startup.
- Removed the successful `LOAD` followed by `QUEUE_LOAD` sequence that audibly restarted every Cast track after roughly one second.

## [1.0.3] - 2026-08-18

### Added

- Added a manual library refresh button that immediately runs an incremental scan across every configured local or NAS folder.

## [1.0.2] - 2026-08-18

### Added

- Licensed the project under GNU GPL v3.0 or later and added privacy, security, contribution, governance, conduct, code-signing, and third-party policies.
- Added dependency-license validation to CI and public GitHub issue/pull-request templates.
- Added Linux x64 AppImage packaging and documented a unified Windows, macOS, and Linux release.
- Added a green active-track state and an animated three-bar playback indicator to track lists.

### Changed

- LRCLIB is queried only after an explicit Lyrics action instead of automatically on every track start.
- The About view now exposes the license, privacy policy, and code signing policy.
- Replaced remaining personal-name package metadata with project handles or contributor attribution.

### Fixed

- Refined the auto-hiding library toolbar and queue panel state.
- Improved synchronized-lyrics matching, instrumental detection, and timestamp seeking.

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

[Unreleased]: https://github.com/vicemora97/flac-cast/compare/v1.0.7...HEAD
[1.0.7]: https://github.com/vicemora97/flac-cast/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/vicemora97/flac-cast/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/vicemora97/flac-cast/compare/2de1eb9...v1.0.5
[1.0.4]: https://github.com/vicemora97/flac-cast/compare/v1.0.3...2de1eb9
[1.0.3]: https://github.com/vicemora97/flac-cast/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/vicemora97/flac-cast/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/vicemora97/flac-cast/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/vicemora97/flac-cast/releases/tag/v1.0.0
