# User guide

## First launch

Flac Cast opens in English by default. Use the language selector in the header to switch between English and Spanish. The choice is saved for future launches.

Select **Libraries**, then **Add folder**, and choose a folder containing FLAC files. Repeat this process to combine multiple local, mapped-drive, UNC, or NAS locations into one library.

The application first displays its saved index and then verifies each folder in the background. A temporarily unavailable NAS does not erase its cached tracks.

## Library management

The Libraries side panel lists every configured root. Removing a root removes it from Flac Cast and its metadata index; it does not delete music files.

Flac Cast scans recursively. It indexes `.flac` files and reads:

- title, artist, and album;
- duration;
- sample rate and bit depth;
- track and disc numbers;
- embedded artwork.

If embedded artwork is absent, it looks for `cover`, `folder`, `front`, or `album` images in JPG, PNG, or WebP format beside the audio files.

## Library views

### Tracks

The Tracks tab displays every track with artwork, title, artist, album, technical quality, and duration. Use the sort selector for:

- artist A–Z;
- track title A–Z;
- highest technical quality.

Quality sorting compares bit depth first, then sample rate. For example, 24-bit/44.1 kHz appears before 16-bit/96 kHz because bit depth is the primary key.

### Albums

The Albums tab shows an artwork grid. Opening an album displays its metadata and numbered track list. Selecting a track creates a scheduled queue from that album.

### Artists

The Artists tab groups the library by artist and lists both albums and tracks in the detail view.

### Playlists

Playlists are stored locally. A playlist can have a custom name and square artwork. Open its context menu to edit its information or delete the playlist. Deleting a playlist never deletes music files.

### Search

Search matches track title, artist, and album. Press `Ctrl+F` to focus the search field. Selecting a search result uses the current result set as its scheduled playback context.

The search index is prepared in the background from cached metadata. It does not open or decode FLAC files, and it does not need to reread a NAS library. An **Indexing…** indicator may appear briefly after launch or after a library update. New, changed, and removed tracks are synchronized incrementally.

Search is case-insensitive and accent-insensitive, so `beyonce` can match `Beyoncé`. Multiple words may match across title, artist, and album. Sorting is performed by the background index using the current Tracks sort option.

For large result sets, Flac Cast displays the first 200 rows and reports the full number of matches. The complete result set is still retained as the scheduled playback context, so Next, Previous, Shuffle, and queue behavior are not limited to those 200 visible rows.

## Playback controls

The footer provides Previous, Play/Pause, Next, Shuffle, Repeat, time, seek, and volume controls.

- **Previous** restarts the current track when playback is beyond five seconds; otherwise it returns to the previous track.
- **Next** consumes the manual FIFO queue first, then resumes the scheduled queue.
- **Shuffle** randomizes only the scheduled context.
- **Repeat** cycles through off, album repeat, and track repeat.
- The quality badge shows the current local file quality or effective Cast delivery quality.

The now-playing artist line has a compact width and automatically scrolls when the artist list is longer than the available area.

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
- open file location;
- remove from the current playlist, when applicable;
- delete the source file.

**Delete file** affects the original file. Flac Cast first asks for confirmation and attempts to use the Windows Recycle Bin. Network shares often do not support the Recycle Bin; in that case, a second warning is required before permanent deletion. A deleted track is removed from playlists, queues, history, and the refreshed library index.

## Google Cast

Open **Cast**, choose a receiver, and select a track. The PC must remain awake and reachable because it serves the media directly to the receiver. The Cast panel reports preparation, conversion, buffering, playback, receiver requests, and effective format.

When Cast is started during local playback, the receiver begins at the local player's current position instead of restarting the track.

See [Google Cast pipeline](CASTING.md) for detailed compatibility behavior.

## Synced lyrics

When a track starts, Flac Cast checks LRCLIB for timestamped lyrics. The Lyrics button is enabled only when synchronized lyrics are available. The active line follows local or Cast playback time.

Lyrics lookup requires Internet access; music playback and casting do not.

## Windows integration

- Media Play/Pause, Previous, and Next keys are registered globally while the app runs.
- Hovering the taskbar icon exposes thumbnail playback controls.
- Closing the main window hides it to the notification area instead of terminating it.
- Use the tray menu's **Quit** command for a complete restart.

## Session restoration

Flac Cast restores the last selected track, playback position, volume, view, scroll positions, shuffle/repeat state, scheduled queue, and manual queue when matching tracks remain in the library. Playback does not automatically resume after launch.
