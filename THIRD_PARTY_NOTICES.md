# Third-party notices

Flac Cast is distributed under `GPL-3.0-or-later`, but it includes and depends on third-party software whose copyright and license terms remain with their respective authors. The exact resolved package graph and integrity hashes are recorded in `package-lock.json`.

## Runtime components

| Component | Resolved version | License | Project |
| --- | ---: | --- | --- |
| `bonjour-service` | 1.4.4 | MIT | <https://github.com/onlxltd/bonjour-service> |
| `castv2-client` | 1.2.0 | MIT | <https://github.com/thibauts/node-castv2-client> |
| `electron-squirrel-startup` | 1.0.1 | Apache-2.0 | <https://github.com/mongodb-js/electron-squirrel-startup> |
| `ffmpeg-static` | 5.3.0 | GPL-3.0-or-later | <https://github.com/eugeneware/ffmpeg-static> |
| `music-metadata` | 11.14.0 | MIT | <https://github.com/Borewit/music-metadata> |
| Electron | 43.4.0 | MIT, with separately licensed Chromium/Node.js components | <https://github.com/electron/electron> |

Transitive npm packages currently use MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, or GPL-3.0-or-later licenses. `parse-cache-control@1.0.1` declares a legacy BSD license object and ships a three-clause BSD license file even though its lockfile metadata has no SPDX value. CI runs `npm run licenses:check` and rejects an unreviewed license.

Production dependency packages retain their license files in the packaged application. Electron distributions also include Electron and Chromium license/notice material.

## FFmpeg binary and source

`ffmpeg-static@5.3.0` installs an FFmpeg 6.1.1 executable from the upstream `b6.1.1` binary release. The executable is a separate upstream program invoked as a child process; it is not signed as Flac Cast source. The npm package and binary-source information are available at:

- <https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1>
- <https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1>
- <https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz>
- <https://github.com/FFmpeg/FFmpeg/tree/n6.1.1>

The `ffmpeg-static` project documents the platform-specific binary providers and their build/source information. Anyone publishing a Flac Cast binary must keep the exact `package-lock.json`, this notice, the GPL license text, and equivalent network access to the corresponding Flac Cast and FFmpeg source for as long as that binary is offered.

The upstream FFmpeg archive alone may not describe every optional codec or library enabled by a platform binary. A distributor must identify the exact binary shipped for each operating system, retain its `ffmpeg -version` configuration, and make the complete corresponding source and build information for FFmpeg and its covered linked components available. The binary-provider references used by `ffmpeg-static` are listed in its [`b6.1.1` source tree](https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1#sources-of-the-binaries).

## Build-only components

Development and packaging use `@electron/packager` (BSD-2-Clause), `electron-winstaller` (MIT), esbuild (MIT), TypeScript (Apache-2.0), and their transitive dependencies. Linux AppImage creation uses the open-source `appimagetool` 1.9.1 project and Type 2 runtime 20251108, both downloaded from pinned release URLs and checked against committed SHA-256 digests. These tools are not re-licensed by Flac Cast.

## Services and protocols

Flac Cast can interact with Google Cast receivers and, only after the user requests lyrics, the independent LRCLIB service. Google, Google Cast, LRCLIB, and their names are not affiliated with or endorsed by the Flac Cast project. See [PRIVACY.md](PRIVACY.md) for the data sent during those interactions.

If a required notice is missing or inaccurate, please open an issue before redistributing a binary.
