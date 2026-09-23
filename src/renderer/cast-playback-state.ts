import type { CastState } from "../shared/contracts.js";

/**
 * A disconnected Cast state can retain its last track so an interrupted
 * session can be recovered. That stale identity must never replace the track
 * currently playing through the local HTML audio element.
 */
export function remoteTrackIdForAdoption(
  state: Pick<CastState, "connected" | "currentTrackId">
): string | undefined {
  return state.connected ? state.currentTrackId : undefined;
}

export function castPlaybackReachedEnd(
  state: Pick<CastState, "currentTime" | "idleReason">,
  duration: number | undefined,
  toleranceSeconds = 0.25
): boolean {
  if (state.idleReason === "FINISHED") return true;
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return false;
  if (state.currentTime == null || !Number.isFinite(state.currentTime)) return false;
  return state.currentTime >= duration - toleranceSeconds;
}
