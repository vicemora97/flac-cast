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

/**
 * MEDIA_STATUS commonly omits the queue while a receiver moves to the next
 * item. Prefer a current marker only when it belongs to the selected track;
 * otherwise locate that track explicitly instead of treating a stale marker
 * as the start of the future queue.
 */
export function castQueueCurrentIndex(
  items: NonNullable<CastState["queueItems"]>,
  selectedTrackId: string
): number {
  const marked = items.findIndex((item) => item.current && item.trackId === selectedTrackId);
  return marked >= 0 ? marked : items.findIndex((item) => item.trackId === selectedTrackId);
}

/** Keep receiver history useful for Previous without duplicating an active item. */
export function distinctCastHistory<T extends { id: string }>(
  history: T[],
  active: T[],
  limit = 5
): T[] {
  const seen = new Set(active.map((item) => item.id));
  const result: T[] = [];
  for (let index = history.length - 1; index >= 0 && result.length < limit; index -= 1) {
    const item = history[index]!;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.unshift(item);
  }
  return result;
}

/** Reorder only future items; the played prefix must never cross the current item. */
export function reconcileCastScheduledFuture<T extends { id: string }>(
  queue: T[],
  currentIndex: number,
  remoteFutureIds: string[]
): T[] {
  const split = Math.max(0, Math.min(queue.length, currentIndex + 1));
  const prefix = queue.slice(0, split);
  const remaining = queue.slice(split);
  const ordered: T[] = [];
  for (const trackId of remoteFutureIds) {
    const index = remaining.findIndex((item) => item.id === trackId);
    if (index >= 0) ordered.push(...remaining.splice(index, 1));
  }
  return [...prefix, ...ordered, ...remaining];
}
