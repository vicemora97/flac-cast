# Flac Cast documentation

This directory documents the current implementation of Flac Cast. It is intended for users, contributors, and anyone reviewing the application's local-data and Google Cast behavior.

## Contents

| Document | Purpose |
| --- | --- |
| [User guide](USER_GUIDE.md) | Library setup, browsing, playback, queues, playlists, lyrics, file actions, and languages. |
| [Architecture](ARCHITECTURE.md) | Process boundaries, modules, IPC contracts, startup, playback state, and design decisions. |
| [Google Cast pipeline](CASTING.md) | Discovery, serving, compatibility fallbacks, quality reporting, prewarming, and receiver behavior. |
| [Development guide](DEVELOPMENT.md) | Repository layout, commands, build pipeline, coding workflow, packaging, and contribution notes. |
| [Data and security](DATA_AND_SECURITY.md) | Persistent files, caches, privacy, local HTTP security, deletion safety, and network exposure. |
| [Troubleshooting](TROUBLESHOOTING.md) | Common Windows, NAS, library, playback, Cast, lyrics, and packaging problems. |

## Documentation conventions

- Documentation and the project README are written in English.
- The application UI defaults to English and currently supports English and Spanish.
- Paths use Windows notation unless a code example is platform-neutral.
- Behavior described here reflects the source tree, not a previously installed build.
- An installed build changes only after a new installer is generated and installed.

## Scope

Flac Cast is a local-first FLAC player. It reads only user-selected libraries, stores its index locally, and serves explicitly registered media files through an ephemeral HTTP server. It is not a music catalog service, cloud locker, or general-purpose media server.
