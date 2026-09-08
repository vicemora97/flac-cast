# Google Cast pipeline

## Network model

Flac Cast is both a Cast controller and a temporary HTTP origin. The receiver does not receive audio through the Cast control socket. Instead:

1. the app discovers receivers over mDNS;
2. it launches the registered Flac Cast Custom Web Receiver over Cast v2, with Google's Default Media Receiver as a compatibility fallback;
3. it sends a LAN URL and media metadata;
4. the receiver opens that URL directly from the PC;
5. the PC streams the selected audio file over HTTP.

The PC and receiver must be mutually reachable on the same local network. Guest Wi-Fi, client isolation, VPN routes, virtual adapters, and public-network firewall rules can prevent discovery or streaming.

## Receiver identity and music metadata

Packaged releases launch the published Flac Cast receiver (`C56EBBCB`) from `https://vicemora97.github.io/flac-cast/receiver/`. Source development runs launch the unpublished Flac Cast Development receiver (`843A0FF9`) from `https://vicemora97.github.io/flac-cast/receiver-dev/`. The development receiver is available only to Cast devices registered in the project's Developer Console account and must remain unpublished.

Set `FLAC_CAST_RECEIVER_APP_ID` before starting the app to override this automatic selection for an explicit test. If the selected Custom Web Receiver cannot launch, Flac Cast falls back to Google's Default Media Receiver so basic playback remains available; remote branding and queue behavior can then be more limited.

The Cast panel reports the launch error when this fallback is active. Seeing **Default Media Receiver** on Google Home means the registered Flac Cast receiver did not launch; track metadata cannot rename Google's fallback. An unpublished production application launches only on devices registered for testing. Public installations require the production application to show **Published** in the Google Cast SDK Developer Console and to have audio-only device support enabled. If a published receiver still falls back on one model, collect that PC's local diagnostics—the `receiver-launch-fallback` event distinguishes device rejection, timeout, and session-identity problems.

Each load request uses Cast's music-track metadata type and sends title, track artist, album, album artist, track number, disc number, duration, and album artwork when available. Older cached library records may not contain a distinct album-artist tag, so Flac Cast safely uses the track artist as the album artist until that file is rescanned. The fields shown by Google Home, a soundbar application, or a device display remain receiver-dependent.

Receiver changes are developed and validated under `docs/receiver-dev/`. After validation, the development receiver file is promoted deliberately to `docs/receiver/`; production releases must never point at the unpublished development application ID.

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

A clean current FLAC with no prepared entry is served directly from its source. For files containing embedded pictures or padding, the HTTP server can construct a small metadata prefix and stream the original encoded audio frames immediately, without waiting for a complete NAS-to-cache copy or FFmpeg repack. It preserves STREAMINFO, seek tables, comments, and other retained metadata; byte ranges are translated into the source file. Audio samples, bit depth, and sample rate are unchanged. This follows the [FLAC container layout](https://www.rfc-editor.org/rfc/rfc9639.html).

The virtual prefix is bounded to 128 KiB. Current-track preflight failures fall back to the existing full preparation path. Upcoming source routes attempt the same sanitization on demand, falling back to the original representation if necessary. Background prewarming still prepares disk copies for the next five tracks. No software or configuration change is required on the NAS; audio still travels through the PC.

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

Flac Cast sends up to 40 queue items to the active Cast media receiver: up to five recent history items, the current track, manually added FIFO entries, and then the scheduled context. The bound keeps Cast protocol messages and receiver memory predictable even when the desktop queue contains thousands of tracks.

The receiver assigns queue item IDs and can process Previous, Next, and repeat commands without waiting for the renderer to load each track. Status messages include the active track ID, allowing Flac Cast to follow transitions initiated from Google Home. Shuffle is materialized as the already shuffled scheduled order; manual FIFO entries remain first. Queue synchronization compares track IDs and media URLs, preserves matching entries, removes only obsolete entries, inserts only missing entries, and reorders the future portion when necessary.

When this receiver-side queue is active, the receiver is the sole owner of automatic track transitions and Flac Cast adopts the reported `currentTrackId`. Desktop auto-advance remains enabled only for the single-item compatibility pipeline. This prevents both sides from starting the same next item roughly one second apart.

Some third-party receivers occasionally report a completed queue item but do not start the assigned successor. Flac Cast gives the receiver a 2.5-second grace period, requests fresh status, and advances through the desktop queue only if the same item is still at its end. A normal or slightly delayed native transition cancels the watchdog, preventing the earlier double-start behavior.

Google Home chooses which controls and queue details to render for each receiver and firmware version. Supplying a valid queue makes the controls available to compatible surfaces but does not guarantee every UI will display all of them.

Flac Cast now starts with a single `QUEUE_LOAD`; it does not play the current item through `LOAD` first. This avoids an audible start, interruption, and restart at zero. The app validates that queued playback reaches and remains in `PLAYING`. If the receiver rejects the first queue request, Flac Cast closes only the stale sender transport, attaches a fresh session once, and retries the same queue with a cache-busted current-media URL. Delayed status or error events from the abandoned transport are ignored. Only if that bounded retry also fails does it switch to the single-item compatibility pipeline without starting another recovery, disable further queue synchronization for that connection, and report that remote queue controls are unavailable. A later manual reconnect permits one fresh queue capability test.

If a receiver-side transition ends in `IDLE/ERROR`, the renderer makes one recovery attempt for that receiver/track pair. The controller rebuilds the active media receiver session, preserves the intended track position and queue, retries original audio, and then uses WAV if required. The retry key is cleared only after playback succeeds, preventing an infinite reconnect loop.

The Cast control socket is separate from the HTTP audio transfer. If that socket closes unexpectedly, the controller retains the device, active track, effective delivery mode, and extrapolated playback position. The renderer can then reconstruct the session and queue once from that position. Explicit user disconnection has no error marker and never triggers this recovery path.

Every reconstructed session receives a new local generation. Queue synchronization, prewarming, and end-of-track callbacks capture that generation and are discarded if they belong to the interrupted session. This prevents a delayed callback from corrupting the successor queue or disabling its automatic-advance watchdog.

## Cache policy

Prepared FLAC and WAV files are stored under the operating-system temporary directory. Cleanup targets eight files and approximately 1 GiB, protecting the current preparation, active track, next five prepared tracks, in-progress conversions, and files being served over HTTP. Protected work can temporarily exceed those targets; complete tracks are not retained in JavaScript RAM. Older unprotected files are deleted opportunistically.

Cleanup runs serially, skips temporary conversion outputs, and invalidates in-memory prepared entries when it removes files. Manual selections verify cached files before reuse. The HTTP server opens files before sending successful audio headers and holds them during transfers. Receiver queue entries outside the protected look-ahead window use source URLs rather than disposable cache URLs.

Electron and V8 handle JavaScript garbage collection, but audio conversion files are explicit disk resources and are governed by this cache policy.

## HTTP behavior

The media server supports full responses, `HEAD`, suffix and normal byte ranges, CORS, identity content encoding, validators, keep-alive, and correct `206`/`304`/`416` responses. Prepared files are immutable and may be reused by the receiver; original library files are revalidated. File metadata reads are asynchronous so a slow NAS response does not block Electron's main event loop.

The Cast panel can display the most recent receiver HTTP status and expected response byte count while buffering. This is not confirmation that the receiver downloaded or played those bytes. Internal diagnostics also record whether the response was cacheable and the time needed to produce its headers.

Valid requests containing multiple byte ranges fall back to a full `200` response; the server does not implement multipart responses. Single ranges retain `206` support. The server explicitly disables the socket inactivity timeout during responses, which is also the default in modern Node.js. Its keep-alive timeout applies between completed responses.

Local `cast-diagnostics.log` entries correlate `media-request` and `media-transfer` events with a request ID. Terminal outcomes distinguish `response-finished`, `interrupted`, and `error`, with HTTP status, expected length, bytes read from disk, elapsed time, and error codes. Response completion means Node finished writing to the underlying system, not proof of receiver playback. Logs exclude file paths and tokenized media URLs and use the existing bounded diagnostic file. Disconnected clients cause their file streams to be destroyed.

## Queue acknowledgement and reconciliation

Queue mutations are serialized and allow 10 seconds for acknowledgement; status reads allow 8 seconds. A timeout does not cancel the receiver command. After a mutation fails, the controller reads receiver status and permits one recalculated attempt. An outstanding mutation must acknowledge before another is sent; each wait is bounded to 10 seconds. If acknowledgement never arrives, queue edits fail rather than blindly replaying insertions. Playback is not explicitly stopped or reloaded by this recovery path.

Retries use fresh item IDs and track multiplicities to avoid duplicate inserts after a partially successful operation. Each queued request captures the playback generation, and fresh status must still identify the requested current track. New loads, disconnections, or receiver-side track transitions prevent obsolete work from continuing. The `IDLE`/`FINISHED` handling remains in place to prevent double advancement.

Run `npm run test:cast-stability` for simulated receiver delays/failures and real local HTTP transfer tests. These tests do not connect to a physical Cast device; hardware testing is still necessary for firmware-specific behavior.

## Local playback handoff

When a receiver is selected while a local track is active, the renderer captures the local playback position at the moment local playback pauses. That position is sent as the initial `currentTime` in the Cast media load request and is preserved across the direct-FLAC and WAV fallback attempts. New tracks and automatic queue advances continue to start at zero.

## Measuring startup latency

Local diagnostics separate the existing renderer `play-track` event from preparation, command dispatch, HTTP requests, and receiver `PLAYING` status. `cast-stage-start`/`cast-stage-end` events use a preparation ID and track ID. Nested stages measure source stat, FLAC header inspection, cache lookup, file copy/repacking, and waits for existing preparation. Durations are nested and must not be added together. Missing-cache `ENOENT` events are expected cache misses, not playback failures.

`cast-source-selected` reports `original-source`, `streamed-source`, `prewarm-map-hit`, `hit`, `created`, or `joined`. A prewarm-map hit verifies the prepared file on disk before reuse; a stale entry is discarded. `streamed-source` means a sanitized metadata prefix followed by unchanged source audio, without a full preparation copy. `cast-flac-inspection` records file and metadata sizes and whether sanitization is required. Fallback preparation is timed separately. For virtual FLAC transfers, the byte-read counter includes generated prefix bytes as well as source audio bytes.

`cast-load-sent` is recorded immediately before `LOAD`/`QUEUE_LOAD`; `cast-load-ack` records the callback delay with a unique load ID, including late callbacks. A media ID correlates the file with HTTP request/transfer events without logging its tokenized URL or filesystem path. Repeated loads can reuse a media ID, so correlate by dispatch time and track as well. The reported `PLAYING` state is not an acoustic measurement.

For comparison, select a track, wait for audible playback, select another track, then select the first again. Check the cache outcome on both attempts rather than assuming the first was cold or the second was cached: prewarming and eviction can affect either attempt. No cache purge or NAS configuration is required.

## Optional player colors and music reaction

The header's Player colors dialog offers neutral controls, a static artwork color (default), or a repeating transition between three dominant artwork colors. Intensity and full-cycle duration (6–60 seconds) are saved locally. Artwork is sampled at 32×32 pixels; palettes are bounded to 32 cached covers. Visual updates are capped at 20 per second and scoped to the transport controls and quality badge. Animation stops while paused or hidden and respects the system reduced-motion preference.

Music reaction is a separate opt-in setting, off by default. It measures actual audio energy, not the output volume setting. After playback settles for 2.5 seconds, a single lower-priority FFmpeg process analyzes a prepared disk copy when available, otherwise the original source. This is an extra read and decode pass, including extra NAS traffic when no prepared copy exists. Disable music reaction on resource-constrained PCs or busy networks; color cycling does not need audio analysis.

Only a 10 Hz RMS envelope is retained (up to two hours per track and eight cached envelopes, approximately 2.3 MB of typed-array payload at the maximum duration). Decoding uses one codec/filter thread, a 120-second deadline, and small streamed PCM chunks. No audio is sent to an external service or inserted into the playback path. Analysis cancels when the track changes, the feature is disabled, or the window is hidden/minimized. Until analysis is ready, colors cycle without music reaction. Seeks follow the same envelope by playback timestamp. Unavailable/long analyses fall back to non-reactive colors; they never block playback. Settings do not change delivered bit depth, sample rate, or Cast formats.

## Troubleshooting Cast quality

A published Cast codec table describes platform capabilities, not a guarantee for every third-party receiver implementation. Receiver firmware, Web Receiver support, accepted MIME aliases, FLAC metadata layout, channel configuration, and the downstream audio path can all affect playback.

Use the delivery label to distinguish direct FLAC, sanitized FLAC, and WAV fallback. See [Troubleshooting](TROUBLESHOOTING.md) for network and receiver diagnostics.
