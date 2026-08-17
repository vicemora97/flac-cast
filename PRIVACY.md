# Privacy policy

Last updated: August 17, 2026

Flac Cast is a local-first desktop application. It has no account system, advertising, telemetry, analytics, crash-reporting service, or automatic update service. The project does not operate a server that receives a user's music library or listening history.

## Data stored on the computer

Flac Cast stores the following data in Electron's application-data directory, currently named `Hires Local` for compatibility with early releases:

- selected local, mapped-drive, UNC, and NAS library paths;
- indexed file metadata, including file paths, tags, duration, sample rate, and bit depth;
- deduplicated album artwork;
- playlists and optional playlist artwork;
- playback state, queue, volume, interface language, and window placement;
- synchronized lyrics and negative lookup results returned by LRCLIB.

On Windows this directory is `%APPDATA%\Hires Local`; on macOS it is `~/Library/Application Support/Hires Local`; on Linux it is `~/.config/Hires Local`. Temporary Cast-ready audio files are kept in the operating-system temporary directory and bounded by the cache policy documented in [Data and security](docs/DATA_AND_SECURITY.md).

Flac Cast does not store NAS credentials. Network-drive authentication is handled by the operating system or SMB client.

## Network transfers

Flac Cast makes no Internet request merely because the application or a track starts.

### Synchronized lyrics

When the user presses **Lyrics** for a track that is not already cached, Flac Cast sends the track title, artist, album, and rounded duration to the public LRCLIB API over HTTPS. The request also includes the application name, version, and project URL in its user-agent, as required by the LRCLIB API. Audio files, local file paths, playlist contents, and album artwork are not sent.

LRCLIB is an independent service. Its operator can receive normal connection information such as the user's IP address and controls its own server logs and retention. Review the [LRCLIB API documentation](https://lrclib.net/docs) and [LRCLIB source repository](https://github.com/tranxuanthang/lrclib) before using this feature. Flac Cast does not control LRCLIB's practices.

If no synchronized lyrics are found, the lyrics panel offers a **Contribute lyrics** button. It opens the official [LRCGET](https://github.com/tranxuanthang/lrcget) download page in the operating system's browser. Flac Cast does not pass track metadata, local paths, audio, or lyrics to that page; any later contribution is made separately by the user through LRCGET and is subject to that project's and LRCLIB's terms and privacy practices.

### Google Cast

When the user opens or uses Cast controls, Flac Cast discovers compatible receivers on the local network and receives device names, models, and addresses. After the user selects a receiver, the receiver downloads the selected audio and artwork directly from a temporary tokenized HTTP endpoint on the computer. Track title, artist, album, and artwork may be displayed by the receiver and by remote controls connected to it.

Flac Cast does not upload audio to a project-operated cloud service. Google Cast devices and Google services are independent products subject to [Google's privacy policy](https://policies.google.com/privacy).

### External project pages

The **About** view opens GitHub pages only after the user presses the corresponding button. The operating system's default browser handles those pages, which are subject to [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

## File deletion

Flac Cast can reveal or delete a music file only after a direct user action. It attempts to use the operating system's trash first. If a NAS or other location does not support trash, the app requires an additional confirmation before permanent deletion.

## Clearing data

Quit Flac Cast completely, then remove the `Hires Local` application-data directory and the temporary Flac Cast cache. This clears application state but does not delete music files. Uninstalling the app may leave this data so a later installation can restore the library.

## Questions and private reports

General privacy questions may be opened in the [GitHub issue tracker](https://github.com/vicemora97/flac-cast/issues) without including personal paths or music-library details. Sensitive reports should use the repository's private vulnerability-reporting feature described in [SECURITY.md](SECURITY.md).

Material changes to this policy will be committed to the public repository and noted in the release documentation.
