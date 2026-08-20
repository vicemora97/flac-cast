# Flac Cast documentation

This directory documents the current implementation of Flac Cast. It is intended for users, contributors, and anyone reviewing the application's local-data and Google Cast behavior.

## Contents

| Document | Purpose |
| --- | --- |
| [User guide](USER_GUIDE.md) | Library setup, browsing, playback, queues, playlists, lyrics, file actions, and languages. |
| [Architecture](ARCHITECTURE.md) | Process boundaries, modules, IPC contracts, startup, playback state, and design decisions. |
| [Google Cast pipeline](CASTING.md) | Discovery, serving, compatibility fallbacks, quality reporting, prewarming, and receiver behavior. |
| [Development guide](DEVELOPMENT.md) | Repository layout, commands, build pipeline, coding workflow, packaging, and contribution notes. |
| [Release guide](RELEASE.md) | Versioning, native artifacts, validation, signing limitations, checksums, tags, and GitHub releases. |
| [Release-notes template](RELEASE_NOTES_TEMPLATE.md) | Required download, signing, privacy, license, and source links for GitHub releases. |
| [Code signing policy](CODE_SIGNING_POLICY.md) | Signing scope, team roles, origin controls, approval, and incident response. |
| [Open-source release checklist](OPEN_SOURCE_RELEASE.md) | Public-release, repository-security, and SignPath application steps. |
| [Data and security](DATA_AND_SECURITY.md) | Persistent files, caches, privacy, local HTTP security, deletion safety, and network exposure. |
| [Troubleshooting](TROUBLESHOOTING.md) | Common desktop, NAS, library, playback, Cast, lyrics, and packaging problems. |

## Documentation conventions

- Documentation and the project README are written in English.
- The application UI defaults to English and currently supports English and Spanish.
- Platform-specific paths and commands identify their target operating system.
- Behavior described here reflects the source tree, not a previously installed build.
- An installed build changes only after a new installer is generated and installed.

## Scope

Flac Cast is a local-first audio player. It reads only user-selected libraries, stores its index locally, and serves explicitly registered media files through an ephemeral HTTP server. It is not a music catalog service, cloud locker, or general-purpose media server.

Repository-level policies live at the project root: [license](../LICENSE), [privacy](../PRIVACY.md), [security](../SECURITY.md), [contributing](../CONTRIBUTING.md), [governance](../GOVERNANCE.md), [code of conduct](../CODE_OF_CONDUCT.md), [third-party notices](../THIRD_PARTY_NOTICES.md), and [asset provenance](../ASSETS.md).
