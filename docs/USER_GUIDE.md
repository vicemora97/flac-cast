# User guide

## About and credits

Open **About**, the final library tab, to see the installed version, project credits, core technologies, and a shortcut to the GitHub repository. The view is available in English and Spanish and does not modify the music library.

## First launch

Flac Cast opens in English by default. Use the language selector in the header to switch between English and Spanish. The choice is saved for future launches.

Select **Libraries**, then **Add folder**, and choose a folder containing supported audio files. Repeat this process to combine multiple local, mapped-drive, UNC, or NAS locations into one library.

The application first displays its saved index and then verifies each folder in the background. A temporarily unavailable NAS does not erase its cached tracks.

## Library management

The Libraries side panel lists every configured root. Removing a root removes it from Flac Cast and its metadata index; it does not delete music files.

The refresh button in the library toolbar starts an immediate incremental scan of every configured folder. Use it when a NAS or file-system watcher has not reported a newly added, changed, or removed track yet. Unchanged files keep their cached metadata, so a manual refresh does not reread every audio file.

Flac Cast scans recursively. It indexes `.flac`, `.wav`, `.wave`, `.mp3`, `.m4a`, `.alac`, `.aac`, `.ogg`, `.oga`, `.opus`, `.aif`, and `.aiff` files and reads:

- title, artist, and album;
- duration;
- sample rate and bit depth;
- track and disc numbers;
- embedded artwork.

If embedded artwork is absent, it looks for `cover`, `folder`, `front`, or `album` images in JPG, PNG, or WebP format beside the audio files.

## Library views

### Tracks

The Tracks tab displays every track with artwork, title, artist, album, technical quality, and duration. The first selector chooses artist, track title, album, technical quality, or when the file was recently added. The independent Order selector chooses A–Z/Z–A for textual fields, low-to-high/high-to-low for quality, or oldest/newest first for recently added tracks.

Quality sorting compares bit depth first, then sample rate. Tracks with the same technical quality are ordered by track title A–Z; the compressed bitrate does not split a FLAC quality group. For example, every 24-bit/192 kHz track is grouped and alphabetized before the next lower quality group when using high-to-low order.

Recently-added sorting records when Flac Cast first discovers a new path during a library scan. Editing tags or audio metadata does not make an existing track new. For cache records created by older Flac Cast versions, the first refresh seeds this value from the file-system creation time when available, falling back to another file timestamp. File systems do not expose a universal “copied into this folder” timestamp, so this migration is an approximation; future additions use the stable first-discovered time.

### Albums

The Albums tab shows an artwork grid. Opening an album displays its metadata and numbered track list. Selecting a track creates a scheduled queue from that album.

### Artists

The Artists tab groups the library by artist and lists both albums and tracks in the detail view.

### Playlists

Playlists are stored locally. A playlist can have a custom name and square artwork. Open its context menu to edit its information or delete the playlist. Deleting a playlist never deletes music files.

### Search

Search matches track title, artist, and album. Press `Ctrl+F` to focus the search field. Selecting a search result uses the current result set as its scheduled playback context.

The search index is prepared in the background from cached metadata. It does not open or decode audio files, and it does not need to reread a NAS library. An **Indexing…** indicator may appear briefly after launch or after a library update. New, changed, and removed tracks are synchronized incrementally.

Search is case-insensitive and accent-insensitive, so `beyonce` can match `Beyoncé`. Multiple words may match across title, artist, and album. Sorting is performed by the background index using the current Tracks sort option.

For large result sets, Flac Cast displays the first 200 rows and reports the full number of matches. The complete result set is still retained as the scheduled playback context, so Next, Previous, Shuffle, and queue behavior are not limited to those 200 visible rows.

### Navigation history

Use the Back and Forward buttons beside the library tabs to move between track lists, searches, albums, artists, and playlists. Each history entry restores its scroll position. Opening a different library tab creates a new entry, while rescans and metadata updates refresh the current entry without discarding the navigation history.

## Playback controls

The footer provides Previous, Play/Pause, Next, Shuffle, Repeat, time, seek, and volume controls.

- **Previous** restarts the current track when playback is beyond five seconds; otherwise it returns to the previous track.
- **Next** consumes the manual FIFO queue first, then resumes the scheduled queue.
- **Shuffle** randomizes only the scheduled context.
- **Repeat** cycles through off, current-list repeat, and track repeat. The current list is the playback context that started the session, such as a playlist, album, artist, or the visible track list.
- The quality badge shows the current local file quality or effective Cast delivery quality.

The now-playing title and artist lines have a compact width and scroll independently when their text is longer than the available area.

The active track is highlighted in green anywhere it appears in a track list. A decorative three-bar equalizer beside its artwork animates while playback is active and remains still while paused. The animation is disabled when the operating system requests reduced motion.

## Queue model

Open **Queue** to inspect playback order. Flac Cast deliberately separates:

1. the current track;
2. manually added FIFO tracks;
3. the remaining scheduled context.

Right-click a track or use its three-dot button and select **Add to queue**. Added tracks play in insertion order before the scheduled queue. **Clear added queue** removes only manual entries.

The Queue button badge counts manual FIFO entries only. The badge is hidden when the footer switches to its compact, icon-only layout.

## Track context menu

The track menu offers:

- play now;
- add to queue;
- add to a playlist;
- go directly to the track's artist;
- go directly to the track's album;
- open file location;
- remove from the current playlist, when applicable;
- delete the source file.

**Delete file** affects the original file. Flac Cast first asks for confirmation and attempts to use the Windows Recycle Bin. Network shares often do not support the Recycle Bin; in that case, a second warning is required before permanent deletion. A deleted track is removed from playlists, queues, history, and the refreshed library index.

## Google Cast

Open **Cast**, choose a receiver, and select a track. The PC must remain awake and reachable because it serves the media directly to the receiver. The Cast panel reports preparation, conversion, buffering, playback, receiver requests, and effective format.

Normal packaged releases use the branded Flac Cast Custom Web Receiver. If that receiver is temporarily unavailable, the app can fall back to Google's Default Media Receiver so playback remains possible, although Google Home may then display generic branding or fewer queue controls.

When Cast is started during local playback, the receiver begins at the local player's current position instead of restarting the track.

Flac Cast sends a bounded receiver queue containing recent history, the current track, manually added FIFO entries, and upcoming scheduled tracks. Compatible Google Home and receiver surfaces can therefore expose Previous, Next, and repeat controls. Google decides which controls and how much queue detail each device UI displays; Flac Cast cannot force unsupported controls to appear. Shuffle is represented by the already shuffled scheduled order.

See [Google Cast pipeline](CASTING.md) for detailed compatibility behavior.

## Synced lyrics

Press **Lyrics** to request timestamped lyrics from LRCLIB. The lookup is not sent automatically when a track starts. If a synchronized match exists, the active line follows local or Cast playback time; click any line to jump local or Cast playback to its timestamp. A track consistently marked as instrumental displays an instrumental message. If LRCLIB contains conflicting records, Flac Cast prefers a closely matching synchronized result and does not treat a track as instrumental when another closely matching record contains vocal lyrics. If no synchronized match exists, the panel offers **Contribute lyrics**, which opens the official LRCGET client download page so the user can edit and publish lyrics separately. Flac Cast does not send track metadata to that page.

The lookup sends title, artist, album, and rounded duration to LRCLIB. See [PRIVACY.md](../PRIVACY.md) for details.

Lyrics lookup requires Internet access; music playback and casting do not.

## Windows integration

- Media Play/Pause, Previous, and Next keys are registered globally while the app runs.
- Hovering the taskbar icon exposes thumbnail playback controls.
- Closing the main window hides it to the notification area instead of terminating it.
- Use the tray menu's **Quit** command for a complete restart.

## Session restoration

Flac Cast restores the last selected track, playback position, volume, view, scroll positions, shuffle/repeat state, scheduled queue, and manual queue when matching tracks remain in the library. Playback does not automatically resume after launch.
