# Google Cast pipeline

## Network model

Flac Cast is both a Cast controller and a temporary HTTP origin. The receiver does not receive audio through the Cast control socket. Instead:

1. the app discovers receivers over mDNS;
2. it launches Google's Default Media Receiver over Cast v2;
3. it sends a LAN URL and media metadata;
4. the receiver opens that URL directly from the PC;
5. the PC streams the selected lossless file over HTTP.

The PC and receiver must be mutually reachable on the same local network. Guest Wi-Fi, client isolation, VPN routes, virtual adapters, and public-network firewall rules can prevent discovery or streaming.

## Discovery

The controller browses `_googlecast._tcp` services with `bonjour-service`. It remembers receiver name, model, host, ID, and last-seen time. Cached mDNS services are synchronized before stale entries expire, and active searches are refreshed so newly powered receivers appear.

## Delivery sequence

For every track, Flac Cast uses this compatibility order:

1. inspect and prepare a cached FLAC;
2. try `audio/flac`;
3. try `audio/x-flac`;
4. create a lossless WAV PCM fallback;
5. try `audio/wav`;
6. try `audio/x-wav`.

### Prepared FLAC

Most files are copied to a bounded temporary cache. FLAC files with unusually large metadata, embedded images, or padding can be repacked with FFmpeg using audio stream copy. This changes the container layout but does not re-encode FLAC audio.

### WAV fallback

If the receiver rejects FLAC, the PC performs the conversion. It uses 16-bit PCM for source files at 16-bit or below and 24-bit PCM for higher bit-depth sources. Conversion remains lossless relative to the selected PCM target. When reducing from greater bit depth to 16-bit, FFmpeg applies high-pass triangular dithering.

Sample rates above 96 kHz are reduced to 96 kHz only in the WAV fallback. Direct and sanitized FLAC preserve the source sample rate and bit depth; actual receiver decoding capability still depends on the hardware and firmware.

## Effective quality display

The footer badge and Cast panel report effective delivery information:

- original bit depth/sample rate for local playback;
- original values for direct or cached FLAC;
- fallback PCM bit depth for WAV;
- 96 kHz when a greater source rate is reduced for WAV compatibility.

This describes what Flac Cast sends. It cannot guarantee that a TV, soundbar, HDMI link, DSP stage, or DAC does not resample internally.

## Prewarming

After a Cast session starts, the renderer schedules preparation for up to five upcoming tracks. Preparation is staggered and uses the disk cache instead of retaining complete tracks in RAM. This reduces the pause between tracks without loading the entire queue.

Prewarming is canceled when the Cast generation changes or the receiver disconnects.

## Cache policy

Prepared FLAC and WAV files are stored under the operating-system temporary directory. The cache keeps at most eight files and approximately 1 GiB, while protecting the active file and in-progress conversions. Older unprotected files are deleted opportunistically.

Electron and V8 handle JavaScript garbage collection, but audio conversion files are explicit disk resources and are governed by this cache policy.

## HTTP behavior

The media server supports full responses, `HEAD`, suffix and normal byte ranges, CORS, identity content encoding, and correct `206`/`416` responses. This is important because receivers may probe headers or request ranges before playback.

The Cast panel can display the most recent receiver HTTP status and transferred byte count while buffering.

## Local playback handoff

When a receiver is selected while a local track is active, the renderer captures the local playback position at the moment local playback pauses. That position is sent as the initial `currentTime` in the Cast media load request and is preserved across the direct-FLAC and WAV fallback attempts. New tracks and automatic queue advances continue to start at zero.

## Troubleshooting Cast quality

A published Cast codec table describes platform capabilities, not a guarantee for every third-party receiver implementation. Receiver firmware, Default Media Receiver support, accepted MIME aliases, FLAC metadata layout, channel configuration, and the downstream audio path can all affect playback.

Use the delivery label to distinguish direct FLAC, sanitized FLAC, and WAV fallback. See [Troubleshooting](TROUBLESHOOTING.md) for network and receiver diagnostics.
