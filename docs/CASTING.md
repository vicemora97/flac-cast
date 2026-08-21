# Google Cast pipeline

## Network model

Flac Cast is both a Cast controller and a temporary HTTP origin. The receiver does not receive audio through the Cast control socket. Instead:

1. the app discovers receivers over mDNS;
2. it launches Google's Default Media Receiver over Cast v2;
3. it sends a LAN URL and media metadata;
4. the receiver opens that URL directly from the PC;
5. the PC streams the selected audio file over HTTP.

The PC and receiver must be mutually reachable on the same local network. Guest Wi-Fi, client isolation, VPN routes, virtual adapters, and public-network firewall rules can prevent discovery or streaming.

## Receiver identity and music metadata

Flac Cast currently launches Google's free Default Media Receiver. Consequently, Google Home and other remote-control surfaces may identify the session as **Default Media Receiver**; that application name is owned by Google and cannot be changed through track metadata.

Each load request uses Cast's music-track metadata type and sends title, track artist, album, album artist, track number, disc number, duration, and album artwork when available. Older cached library records may not contain a distinct album-artist tag, so Flac Cast safely uses the track artist as the album artist until that file is rescanned. The fields shown by Google Home, a soundbar application, or a device display remain receiver-dependent.

Using a branded application name would require a registered Styled or Custom Media Receiver and its Cast application ID. It is not required for audio playback.

## Discovery

The controller browses `_googlecast._tcp` services with `bonjour-service`. It remembers receiver name, model, host, ID, and last-seen time. Cached mDNS services are synchronized before stale entries expire, and active searches are refreshed so newly powered receivers appear.

## Delivery sequence

For FLAC tracks, Flac Cast uses this compatibility order:

1. inspect the FLAC container and reuse a prepared cache entry when one exists;
2. try `audio/flac`;
3. try `audio/x-flac`;
4. if direct playback fails, rebuild the receiver session once and retry the original media with a cache-busting URL;
5. create a compatible FLAC capped at 24-bit/48 kHz and try both FLAC MIME types;
6. create a universal dithered WAV PCM fallback capped at 16-bit/48 kHz;
7. try `audio/wav` and `audio/x-wav`.

Other supported containers are first sent with their registered MIME type. If the receiver rejects them after the same one-shot session recovery, the PC prepares the universal WAV fallback. Converting a lossy MP3, AAC, or Ogg source to WAV does not restore information that was absent from the source; it is a compatibility conversion, not an increase in fidelity.

### Prepared FLAC

A clean current FLAC with no prepared entry is served directly from its source, so playback does not wait for a complete NAS-to-cache copy. Upcoming files are copied by the background prewarmer. FLAC files with unusually large metadata, embedded images, or padding are prepared before playback and can be repacked with FFmpeg using audio stream copy. This changes the container layout but does not re-encode FLAC audio.

### Compatible fallbacks

If the receiver rejects original FLAC, the PC first re-encodes a metadata-light FLAC at the source bit depth up to 24-bit and source sample rate up to 48 kHz. Sources above 48 kHz are resampled; FLAC compression remains lossless relative to that resampled PCM signal.

If compatible FLAC is also rejected, Flac Cast creates PCM WAV at 16-bit and no more than 48 kHz. FFmpeg applies high-pass triangular dithering when reducing a higher-bit-depth source. This final format was selected because some third-party Cast receivers download 24-bit PCM successfully but never leave `IDLE` or produce reliable audio.

## Effective quality display

The footer badge and Cast panel report effective delivery information:

- original bit depth/sample rate for local playback;
- original values for direct or cached FLAC;
- effective values for compatible FLAC;
- effective 16-bit/sample-rate values for the universal WAV fallback.

This describes what Flac Cast sends. It cannot guarantee that a TV, soundbar, HDMI link, DSP stage, or DAC does not resample internally.

Receiver volume and media-session volume are separate Cast protocol fields. Flac Cast drives the soundbar slider only from receiver status events, explicit `getVolume` refreshes, and acknowledged receiver-volume commands; media playback and queue responses cannot overwrite it.

## Prewarming

After a Cast session starts, the renderer schedules preparation for up to five upcoming tracks. Preparation is staggered and uses the disk cache instead of retaining complete tracks in RAM. Prepared LAN URLs are then inserted into the existing receiver queue without reloading the current item. This reduces the pause between tracks without loading the entire queue.

The controller remembers the successful delivery family for each receiver and exact FLAC bit-depth/sample-rate profile during the running app session. Original FLAC remains the first quality choice. Only after that profile has required compatible FLAC or WAV does later prewarming prepare the proven fallback in advance.

Manually added FIFO tracks take priority over the scheduled queue. When that priority window changes, new uncached FLAC files reserve cache capacity before they are copied; older unprotected preparations are removed first when the eight-file or 1 GiB limit would be exceeded.

Prewarming is canceled when the Cast generation changes or the receiver disconnects.

## Receiver queue and remote controls

Flac Cast sends up to 40 queue items to the Default Media Receiver: up to five recent history items, the current track, manually added FIFO entries, and then the scheduled context. The bound keeps Cast protocol messages and receiver memory predictable even when the desktop queue contains thousands of tracks.

The receiver assigns queue item IDs and can process Previous, Next, and repeat commands without waiting for the renderer to load each track. Status messages include the active track ID, allowing Flac Cast to follow transitions initiated from Google Home. Shuffle is materialized as the already shuffled scheduled order; manual FIFO entries remain first. Queue synchronization compares track IDs and media URLs, preserves matching entries, removes only obsolete entries, inserts only missing entries, and reorders the future portion when necessary.

When this receiver-side queue is active, the receiver is the sole owner of automatic track transitions and Flac Cast adopts the reported `currentTrackId`. Desktop auto-advance remains enabled only for the single-item compatibility pipeline. This prevents both sides from starting the same next item roughly one second apart.

Some third-party receivers occasionally report a completed queue item but do not start the assigned successor. Flac Cast gives the receiver a 2.5-second grace period, requests fresh status, and advances through the desktop queue only if the same item is still at its end. A normal or slightly delayed native transition cancels the watchdog, preventing the earlier double-start behavior.

Google Home chooses which controls and queue details to render for each receiver and firmware version. Supplying a valid queue makes the controls available to compatible surfaces but does not guarantee every UI will display all of them.

Flac Cast now starts with a single `QUEUE_LOAD`; it does not play the current item through `LOAD` first. This avoids an audible start, interruption, and restart at zero. The app validates that queued playback reaches and remains in `PLAYING`. If the receiver rejects the first queue request, Flac Cast closes only the stale sender transport, attaches a fresh session once, and retries the same queue with a cache-busted current-media URL. Delayed status or error events from the abandoned transport are ignored. Only if that bounded retry also fails does it switch to the single-item compatibility pipeline without starting another recovery, disable further queue synchronization for that connection, and report that remote queue controls are unavailable. A later manual reconnect permits one fresh queue capability test.

If a receiver-side transition ends in `IDLE/ERROR`, the renderer makes one recovery attempt for that receiver/track pair. The controller rebuilds the Default Media Receiver session, preserves the intended track position and queue, retries original audio, and then uses WAV if required. The retry key is cleared only after playback succeeds, preventing an infinite reconnect loop.

The Cast control socket is separate from the HTTP audio transfer. If that socket closes unexpectedly, the controller retains the device, active track, effective delivery mode, and extrapolated playback position. The renderer can then reconstruct the session and queue once from that position. Explicit user disconnection has no error marker and never triggers this recovery path.

Every reconstructed session receives a new local generation. Queue synchronization, prewarming, and end-of-track callbacks capture that generation and are discarded if they belong to the interrupted session. This prevents a delayed callback from corrupting the successor queue or disabling its automatic-advance watchdog.

## Cache policy

Prepared FLAC and WAV files are stored under the operating-system temporary directory. The cache keeps at most eight files and approximately 1 GiB, while protecting the active file and in-progress conversions. Older unprotected files are deleted opportunistically.

Electron and V8 handle JavaScript garbage collection, but audio conversion files are explicit disk resources and are governed by this cache policy.

## HTTP behavior

The media server supports full responses, `HEAD`, suffix and normal byte ranges, CORS, identity content encoding, validators, keep-alive, and correct `206`/`304`/`416` responses. Prepared files are immutable and may be reused by the receiver; original library files are revalidated. File metadata reads are asynchronous so a slow NAS response does not block Electron's main event loop.

The Cast panel can display the most recent receiver HTTP status and transferred byte count while buffering. Internal diagnostics also record whether the response was cacheable and the time needed to produce its headers.

## Local playback handoff

When a receiver is selected while a local track is active, the renderer captures the local playback position at the moment local playback pauses. That position is sent as the initial `currentTime` in the Cast media load request and is preserved across the direct-FLAC and WAV fallback attempts. New tracks and automatic queue advances continue to start at zero.

## Troubleshooting Cast quality

A published Cast codec table describes platform capabilities, not a guarantee for every third-party receiver implementation. Receiver firmware, Default Media Receiver support, accepted MIME aliases, FLAC metadata layout, channel configuration, and the downstream audio path can all affect playback.

Use the delivery label to distinguish direct FLAC, sanitized FLAC, and WAV fallback. See [Troubleshooting](TROUBLESHOOTING.md) for network and receiver diagnostics.
