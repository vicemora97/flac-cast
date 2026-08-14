# Development guide

## Technology

- Electron 37
- TypeScript 5
- esbuild
- Node.js 22 target
- `music-metadata`
- `bonjour-service`
- `castv2-client`
- `ffmpeg-static`
- Squirrel.Windows packaging

## Repository layout

```text
assets/                 Application and taskbar icons
docs/                   Project documentation
scripts/                Build, icon, package, and installer scripts
src/main/               Privileged Electron services
src/renderer/           UI, player orchestration, styles, localization
src/shared/             IPC data contracts
src/types/              Third-party type declarations
dist/                   Generated development build
out/                    Generated packaged app and installer
```

Do not edit `dist` directly. `npm.cmd run build` recreates it from `src`.

## Install dependencies

```powershell
npm.cmd install
```

On PowerShell configurations that block `npm.ps1`, use `npm.cmd` as shown throughout this documentation.

## Run in development

```powershell
npm.cmd run dev
```

The command builds the project and launches Electron. The window close button hides the app to the tray; quit from the tray before testing a fresh process.

## Validation

```powershell
npm.cmd run check
npm.cmd run build
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
