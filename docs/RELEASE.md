# Release guide

## Version policy

Flac Cast uses semantic versions. Keep the version identical in `package.json` and `package-lock.json`. Never move a tag that may already have been fetched; publish a patch release instead.

## Source validation

From a clean checkout:

```text
npm ci
npm run licenses:check
npm run check
npm run build
npm audit
```

If the release changes Cast receiver behavior, validate the change through the unpublished development receiver before copying it into `docs/receiver/`. The production receiver is served independently from the desktop binaries and can affect already installed versions as soon as GitHub Pages deploys it. Follow the [Cast receiver release process](CAST_RECEIVER_RELEASE.md).

The repository CI repeats dependency installation, license validation, TypeScript checking, and bundling on every push and pull request to `main`. `.github/workflows/release-artifacts.yml` builds all native artifacts on GitHub-hosted runners for version tags or manual verification. It uploads unsigned workflow artifacts but does not publish a GitHub release automatically.

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

### Linux x64

```bash
npm ci
npm run make:linux
```

Expected files:

- `out/make/appimage/Flac-Cast-Linux-x86_64.AppImage`
- `out/make/appimage/Flac-Cast-Linux-x86_64.AppImage.sha256`

The AppImage bundles Electron's Chromium sandbox helper without the setuid bit that AppImages cannot rely on after mounting, so `AppRun` launches the app with `--no-sandbox`. Building requires outbound network access once. The script downloads the pinned `appimagetool` 1.9.1 executable and pinned Type 2 runtime 20251108, verifies their committed SHA-256 digests, and caches the verified files under `out/tools`. It does not resolve a mutable `latest` release during the build.

The remote `linux-dev` branch predates macOS packaging entirely and contains no Linux packaging work despite its name; it must not be used as a release source.

## Signing status

The Windows installer is unsigned until a release explicitly identifies a valid signature, and the macOS application is neither Developer ID signed nor notarized. GitHub hashes provide integrity verification but do not replace operating-system code signing. Document these limitations prominently in each prerelease and link the [code signing policy](CODE_SIGNING_POLICY.md).

The project is preparing for SignPath Foundation. Follow [the open-source release checklist](OPEN_SOURCE_RELEASE.md) before applying or enabling the signing workflow. Never commit placeholder SignPath identifiers, API tokens, certificate files, or private keys.

## Git and GitHub sequence

1. Merge reviewed platform work into `main`.
2. Confirm the worktree is clean and CI is green.
3. Confirm `CHANGELOG.md` and both package versions match the intended tag.
4. Confirm that packaged builds select production Cast application `C56EBBCB`, and that development-only receiver changes have not been promoted accidentally.
5. Create an annotated tag from the exact release commit: `git tag -a vX.Y.Z -m "Flac Cast vX.Y.Z"`.
6. Push the tag: `git push origin vX.Y.Z`.
7. Create a GitHub release from that tag and paste the corresponding changelog section.
   Start from [the release-notes template](RELEASE_NOTES_TEMPLATE.md) so signing, privacy, license, and source links are not omitted.
8. Attach native artifacts and their SHA-256 checksum files.
9. Link the **Code signing policy**, privacy policy, license, trademark policy, source tag, third-party notices, and the exact FFmpeg source/build provenance for every packaged platform binary in the release description.
10. Mark unsigned builds as a prerelease until signing and platform reputation requirements are addressed.

Keep a release as a draft until all advertised native artifacts come from the tagged commit. Publish one release containing the Windows, macOS, and Linux downloads so visitors can choose their operating system from a single page.
