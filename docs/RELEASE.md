# Release guide

## Version policy

Flac Cast uses semantic versions. Keep the version identical in `package.json` and `package-lock.json`. Never move a tag that may already have been fetched; publish a patch release instead.

## Source validation

From a clean checkout:

```text
npm ci
npm run check
npm run build
npm audit
```

The repository CI repeats dependency installation, TypeScript validation, and bundling on every push and pull request to `main`.

## Platform artifacts

Artifacts must be produced on their native operating system so `ffmpeg-static` and Electron contain the correct platform binary.

### Windows x64

```powershell
npm.cmd ci
npm.cmd run make:win
```

Expected files:

- `out/make/squirrel.windows/x64/Flac-Cast-Windows-x64-Setup.exe`
- `out/make/squirrel.windows/x64/Flac-Cast-Windows-x64-Setup.exe.sha256`

### macOS Apple silicon

```bash
npm ci
npm run make:mac
```

Expected files:

- `out/make/dmg/Flac-Cast-macOS-arm64.dmg`
- `out/make/dmg/Flac-Cast-macOS-arm64.dmg.sha256`

The current macOS build targets `arm64`. Do not build it on an Intel dependency installation because the bundled `ffmpeg-static` binary follows the host platform and architecture.

### Linux

Linux packaging is not present on `main` yet. Add and validate the pending Linux build before advertising a Linux download. Do not use the current stale `linux-dev` branch as a release source without rebasing and reviewing it.

## Signing status

The Windows installer is unsigned, and the macOS application is neither Developer ID signed nor notarized. GitHub hashes provide integrity verification but do not replace operating-system code signing. Document these limitations prominently in each prerelease.

## Git and GitHub sequence

1. Merge reviewed platform work into `main`.
2. Confirm the worktree is clean and CI is green.
3. Confirm `CHANGELOG.md` and both package versions match the intended tag.
4. Create an annotated tag from the exact release commit: `git tag -a vX.Y.Z -m "Flac Cast vX.Y.Z"`.
5. Push the tag: `git push origin vX.Y.Z`.
6. Create a GitHub release from that tag and paste the corresponding changelog section.
7. Attach native artifacts and their SHA-256 checksum files.
8. Mark unsigned builds as a prerelease until signing and platform reputation requirements are addressed.

Keep a release as a draft until both native artifacts come from the tagged commit. Publish one release containing the Windows and macOS installers so visitors can choose their operating system from a single download page.
