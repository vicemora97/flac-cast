# Development guide

## Technology

- Electron 43
- TypeScript 5
- esbuild
- Node.js 24 development/runtime baseline, with conservative bundle targets
- `music-metadata`
- `bonjour-service`
- `castv2-client`
- `ffmpeg-static`
- Squirrel.Windows packaging, macOS DMG packaging, and Linux AppImage packaging

## Repository layout

```text
assets/                 Application and taskbar icons
docs/                   Project documentation
docs/receiver/          Published production Cast Web Receiver
docs/receiver-dev/      Unpublished development Cast Web Receiver
scripts/                Build, icon, package, and installer scripts
src/main/               Privileged Electron services
src/renderer/           UI, player orchestration, styles, localization
src/shared/             IPC data contracts
src/types/              Third-party type declarations
dist/                   Generated development build
out/                    Generated packaged app and installer
```

Do not edit `dist` directly. `npm run build` recreates it from `src`.

## Install dependencies

```text
npm install
```

On PowerShell configurations that block `npm.ps1`, replace `npm` with `npm.cmd` in these commands.

## Run in development

```text
npm run dev
```

The command builds the project and launches Electron. The window close button hides the app to the tray; quit from the tray before testing a fresh process.

Development runs automatically use Cast application `843A0FF9` and `docs/receiver-dev/`. That receiver is intentionally unpublished and works only on devices authorized in the Google Cast SDK Developer Console. Packaged applications use production application `C56EBBCB` and `docs/receiver/`.

An explicit local test can override the automatic choice:

```powershell
$env:FLAC_CAST_RECEIVER_APP_ID = "C56EBBCB"
npm.cmd run dev
```

Do not commit credentials or console access data. Cast application IDs are public routing identifiers, not secrets.

See [Cast receiver release process](CAST_RECEIVER_RELEASE.md) before changing the production receiver.

## Validation

```text
npm run check
npm run build
```

`check` runs TypeScript without emitting files. `build` bundles main, preload, and renderer entry points and copies renderer HTML/CSS to `dist`.

## Packaging

Create an unpacked Windows application:

```powershell
npm.cmd run package:win
```

Create the Squirrel.Windows installer:

```powershell
npm.cmd run make:win
```

Generated output belongs under `out`. The installer is not automatically signed.

On macOS Apple silicon, create the application bundle or DMG with:

```bash
npm run package:mac
npm run make:mac
```

The DMG is not Developer ID signed or notarized.

On Linux x64, create the application bundle or AppImage with:

```bash
npm run package:linux
npm run make:linux
```

`make:linux` downloads `appimagetool` from its upstream GitHub release the first time (verifying it against the SHA-256 digest GitHub publishes for that asset) and caches it under `out/tools`. The AppImage runs Electron with `--no-sandbox`, since the packaged Chromium sandbox helper cannot carry a setuid bit inside an AppImage.

See [Release guide](RELEASE.md) for the complete checklist.

## Source responsibilities

- `main.ts`: app lifecycle, IPC, native UI, window/tray/taskbar integration.
- `library.ts`: scanning, metadata, artwork, incremental persistent index.
- `library-watcher.ts`: event and polling-based refresh scheduling.
- `media-server.ts`: authorized local/LAN media endpoints.
- `cast-controller.ts`: discovery, session, receiver control, media loading.
- `lossless-transcoder.ts`: FLAC preparation, WAV fallback, disk-cache pruning.
- `lyrics.ts`: LRCLIB lookup, parsing, rate limits, cache.
- `preferences.ts`: settings, playlists, window state.
- `preload.ts`: context bridge implementation.
- `contracts.ts`: shared IPC types.
- `app.ts`: renderer state and interaction logic.
- `i18n.ts`: English and Spanish renderer catalogs.

## Adding UI text

Do not hard-code new visible strings in renderer functions.

1. Add the English key to `src/renderer/i18n.ts`.
2. Add the matching Spanish value.
3. Use `t("key")` for dynamic text.
4. Use `data-i18n`, `data-i18n-title`, `data-i18n-aria`, or `data-i18n-placeholder` for static HTML.
5. If the text belongs to a native Electron dialog, add it to the main-process native catalog.
6. Test both languages without restarting the app.

English is the source language and fallback. Documentation, code-facing names, and new project files should be written in English.

## Adding an IPC method

1. Add the method signature to `HiresApi` in `src/shared/contracts.ts`.
2. Map it in `src/main/preload.ts`.
3. Register the IPC handler in the main process.
4. Validate all renderer-provided values in the main process.
5. Return only serializable data.

## Working with local paths

The renderer must not receive or construct source paths. File operations should resolve an already registered media URL in the main process and confirm that the resolved path remains within a configured library root.

## Generated and persistent state

- `dist` and `out` are generated and should not be treated as source.
- `%APPDATA%\Hires Local` is user state and must never be committed.
- Temporary transcoder output is outside the repository.
- Music files and NAS credentials are never repository assets.

## Release checklist

1. Run TypeScript validation.
2. Build from a clean `dist` directory.
3. Test English and Spanish.
4. Test local playback and media keys.
5. Test Cast discovery, direct FLAC, and fallback behavior.
6. Test startup with the NAS online and offline.
7. Verify deletion prompts against a disposable test file.
8. Generate the installer.
9. Install on a separate Windows user or VM.
10. Sign the executable and installer before broad distribution.
