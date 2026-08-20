# Troubleshooting

## The installed app does not contain recent changes

`npm.cmd run build` updates the repository's `dist` directory, not an already installed copy. Quit the running process from the tray and use the development launcher, or generate and install a new installer with `npm.cmd run make:win`.

## Windows blocks the application

Development and private builds are unsigned. Smart App Control may block them without offering a per-app exception. Continue development through the repository launcher or `npm.cmd run dev`. The proper distribution fix is code signing; publishing to Microsoft Store is not required for private development.

## The music library is missing after restart

1. Quit fully from the tray and reopen the current build.
2. Confirm `%APPDATA%\Hires Local\settings.json` exists.
3. Confirm the NAS path or mapped drive is available under the same Windows account.
4. Prefer a UNC path if a mapped drive exists only in an elevated or different login session.
5. Check whether security software or OneDrive redirected/blocked the settings file.

The cached index should remain visible when a configured NAS is offline.

## New tracks do not appear

Flac Cast watches every supported audio extension and artwork changes recursively and also scans every ten minutes. Some NAS devices do not emit reliable change notifications. Bring the app to the foreground, wait for the consistency refresh, or restart the current development build.

Supported extensions are FLAC, WAV/WAVE, MP3, M4A/ALAC, AAC, OGG/OGA, Opus, AIF, and AIFF.

## Library refresh is slow

The first scan reads metadata and artwork for every supported audio file. Later scans compare path, size, and modification time and reuse cached records. NAS latency, antivirus inspection, very large artwork, and directories containing many files can increase scan time.

## Local playback works but Cast devices do not appear

- Confirm both devices are on the same LAN.
- Disable guest/client isolation.
- Check that mDNS is not blocked.
- Allow Electron on private networks in Windows Firewall.
- Temporarily disconnect VPNs or virtual adapters that change the preferred LAN address.
- Reopen the Cast panel to trigger discovery refresh.

## A receiver appears in other apps but not Flac Cast

Other apps may use cloud-assisted discovery or maintain a longer-lived device cache. Flac Cast uses local mDNS. Verify `_googlecast._tcp` visibility, multicast routing, Wi-Fi isolation, and Windows network profile.

## Cast remains on Buffering

The Cast panel may show whether the receiver reached the PC and whether it requested byte ranges.

- No HTTP request usually indicates routing or firewall failure.
- HTTP 200/206 followed by rejection indicates a receiver format/container issue.
- Confirm the PC does not sleep during playback.
- Test a simple 16-bit/44.1 kHz stereo FLAC to separate network and format problems.

## Direct FLAC is rejected

Flac Cast retries with an alternate FLAC MIME type, a sanitized FLAC container, a fresh receiver session and URL, compatible FLAC capped at 24-bit/48 kHz, and finally dithered WAV PCM capped at 16-bit/48 kHz. Published Google Cast codec capabilities do not guarantee identical support in every third-party receiver implementation.

## A track sometimes fails but works after reconnecting

Version 1.0.4 automatically treats the first rejection as potentially transient. It records the failed MIME attempt, replaces the stale sender connection once without explicitly stopping the receiver, retries the original audio with a cache-busting URL while preserving position and queue, and only then converts to WAV. Initial `QUEUE_LOAD` startup and a queued item that fails during a receiver-side transition each receive one bounded session-recovery attempt. The single-item fallback cannot initiate a second recovery for the same track change, and delayed events from the abandoned socket cannot invalidate the replacement session. Retries are keyed or locally bounded so a persistently incompatible file cannot create an infinite loop.

Inspect the footer quality badge and Cast panel to identify the selected delivery mode.

## Track changes take too long on Cast

The PC performs any required preparation or WAV conversion. Up to five upcoming tracks are prewarmed on disk. Delays can still occur when:

- the queue changes unexpectedly;
- the next item was not prewarmed;
- NAS reads are slow;
- antivirus scans generated files;
- the receiver requires the WAV fallback;
- the receiver takes time to create a new media pipeline.

## Cast volume changes externally but the slider is stale

Flac Cast periodically requests receiver volume and applies Cast status updates. A lost request is ignored to avoid interrupting playback. Bring the window to the foreground; foreground polling is more frequent.

The mouse wheel adjusts volume only while the pointer is over the active local or Cast volume slider.

## Media keys do not work

Another application may already own the global multimedia shortcuts. Quit competing media apps and restart Flac Cast. Taskbar thumbnail controls use a separate Windows mechanism and may still work.

## Taskbar thumbnail buttons open the window instead of controlling playback

Ensure the current development build is running and fully restart from the tray. Windows can retain stale taskbar state from a previous executable or AppUserModelID session.

## Lyrics are unavailable

- Press **Lyrics** to start the lookup; playback does not query LRCLIB automatically.
- A synchronized LRCLIB match must exist to show timed lines. Instrumental tracks display a dedicated message; missing matches offer a link to the official LRCGET contribution client.
- Track title, artist, album, and approximate duration influence matching.
- Internet access is required for uncached lookups.
- LRCLIB may temporarily rate-limit requests.
- Instrumental tracks or uncommon metadata often have no result.

If LRCLIB returns no match, reopen **Lyrics** to view the contribution option. The external LRCGET page does not receive track metadata from Flac Cast.

## File deletion fails on a NAS

Windows Recycle Bin support is usually unavailable for network shares. Flac Cast then offers permanent deletion after a second confirmation. If permanent deletion fails, verify SMB write/delete permissions and whether the file is read-only or locked by another process.

## Git reports dubious ownership

When the repository was created by a sandbox or another Windows identity, Git may require an explicit safe-directory entry:

```powershell
git config --global --add safe.directory C:/path/to/flac-cast
```

Add only the exact trusted repository path.

## GitHub reports Repository not found

For a private repository, confirm the remote URL, authenticated GitHub account, and collaborator permissions. GitHub password authentication is not supported; use Git Credential Manager, a personal access token, SSH, or GitHub CLI.

## Collecting useful diagnostics

When reporting a problem, include:

- Flac Cast version and whether it is installed or launched from source;
- Windows version;
- local, mapped-drive, or UNC library path type;
- receiver name/model;
- source bit depth, sample rate, channels, and duration;
- delivery mode shown in the Cast panel;
- exact visible error;
- whether the receiver made an HTTP 200/206 request;
- steps that reproduce the issue with a disposable file when deletion is involved.
