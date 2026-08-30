# Cast receiver release process

## Environments

Flac Cast maintains two registered Custom Web Receivers:

| Environment | Cast application ID | Hosted URL | Console status | Used by |
| --- | --- | --- | --- | --- |
| Production | `C56EBBCB` | `https://vicemora97.github.io/flac-cast/receiver/` | Published | Packaged desktop releases |
| Development | `843A0FF9` | `https://vicemora97.github.io/flac-cast/receiver-dev/` | Unpublished | Source development runs |

The development receiver must remain unpublished. Only Cast devices registered in the project's Google Cast SDK Developer Console account can launch it. The production receiver is available to end users after publication.

Application IDs are public routing identifiers and may be committed to source control. Google account credentials, console session data, and signing credentials must never be committed.

## Runtime selection

`src/main/main.ts` selects the receiver at runtime:

- `app.isPackaged === false`: development receiver;
- `app.isPackaged === true`: production receiver;
- `FLAC_CAST_RECEIVER_APP_ID`: explicit override for a controlled test.

The override is intended for maintainers and diagnostics. Public packages must not set it to the development ID.

## GitHub Pages deployment

`.github/workflows/cast-receiver-pages.yml` deploys the complete `docs` directory to GitHub Pages whenever either receiver directory changes on `main`. The stable and development URLs therefore exist in one Pages deployment but contain independent files.

Changes under `docs/receiver-dev/` affect only the development Cast application. Changes under `docs/receiver/` affect the published application and can reach existing users without a new desktop release. Treat the production receiver directory as release-critical code.

## Development workflow

1. Make receiver changes only under `docs/receiver-dev/`.
2. Run `npm run check`, `npm run build`, and `npm run licenses:check`.
3. Push the change to `main` and wait for the **Deploy Cast receiver** workflow to finish.
4. Open `https://vicemora97.github.io/flac-cast/receiver-dev/` and confirm that it returns the expected receiver document over HTTPS.
5. Run Flac Cast from source and test the authorized Cast device.
6. Verify initial load, pause/resume, seek, volume, Previous/Next, queue transitions, manual FIFO priority, shuffle, repeat, remote stop, session recovery, and FLAC/WAV fallback.
7. Inspect Cast diagnostics for unexpected receiver fallback or repeated reconnection.

Do not test production behavior by publishing the development receiver.

## Promotion to production

After the development receiver passes validation:

1. Review the exact difference between `docs/receiver-dev/index.html` and `docs/receiver/index.html`.
2. Copy the validated implementation into `docs/receiver/index.html` while retaining the production title and `statusText`.
3. Run repository validation again.
4. Commit the promotion separately so it is easy to audit and revert.
5. Push to `main` and monitor the Pages deployment.
6. Test one packaged build against the published production receiver.

Receiver promotion does not require changing either Cast application ID. A desktop release is required only when sender-side code also changed.

## Rollback

If production receiver behavior regresses, revert the receiver promotion commit and push the new revert commit to `main`. Wait for the Pages workflow to complete, then reconnect the Cast session so the device reloads the receiver page. Never move an existing Git tag or rewrite published history to perform a receiver rollback.

If the custom receiver cannot launch, the desktop controller attempts Google's Default Media Receiver as a compatibility fallback. That fallback preserves basic playback but is not a substitute for rolling back a broken production receiver because branding and queue features can differ.
