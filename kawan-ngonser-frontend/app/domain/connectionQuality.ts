/**
 * G-2 refinement: `navigator.onLine` only knows whether a network interface
 * exists, which at a venue is nearly useless — a phone on a saturated cell or
 * behind a captive portal reports "online" while nothing gets through.
 *
 * This classifies round-trip samples (taken from the API calls the app already
 * makes, plus an occasional /health probe) into the three states the globe
 * shows. Pure — `nowMs` is always a parameter, per the domain/ convention.
 */

export type ConnectionQuality = 'good' | 'slow' | 'unreachable'

export interface Sample {
  atMs: number
  /** Round-trip in ms; null when the request never completed */
  rttMs: number | null
  ok: boolean
}

/** Above this round-trip, the connection reads as "slow". */
export const SLOW_RTT_MS = 1200

/** Samples older than this say nothing about the connection right now. */
export const STALE_AFTER_MS = 5 * 60_000

/** How many recent samples the verdict is drawn from. */
export const WINDOW = 3

/**
 * Consecutive samples needed to change the verdict. Without this the globe
 * flickers on every sample whenever the round-trip sits near the threshold.
 */
export const FLIP_STREAK = 2

/** Newest-last. Keeps the freshest `WINDOW` samples that aren't stale. */
export function retain(samples: Sample[], nowMs: number): Sample[] {
  return samples
    .filter(s => nowMs - s.atMs < STALE_AFTER_MS)
    .slice(-WINDOW)
}

/**
 * `previous` carries the hysteresis — pass the last verdict back in. A single
 * off-side sample never flips the state; it takes `FLIP_STREAK` in a row.
 */
export function classify(
  samples: Sample[],
  previous: ConnectionQuality,
  nowMs: number,
): ConnectionQuality {
  const recent = retain(samples, nowMs)

  // Nothing fresh to go on — never invent a warning the user can't act on.
  if (recent.length === 0) return 'good'

  const tail = recent.slice(-FLIP_STREAK)
  const streak = (fn: (s: Sample) => boolean) =>
    tail.length >= FLIP_STREAK && tail.every(fn)

  const isFast = (s: Sample) => s.ok && s.rttMs !== null && s.rttMs <= SLOW_RTT_MS
  const isSlow = (s: Sample) => s.ok && s.rttMs !== null && s.rttMs > SLOW_RTT_MS

  // The server is up but unreachable — captive portal, or a connection so bad
  // that a ~30-byte response times out. Either way, not usable.
  if (streak(s => !s.ok)) return 'unreachable'

  if (previous === 'unreachable') {
    // Recovering takes a streak of successes, not one lucky response.
    if (!streak(s => s.ok)) return 'unreachable'
    return streak(isSlow) ? 'slow' : 'good'
  }

  if (previous === 'slow') return streak(isFast) ? 'good' : 'slow'

  return streak(isSlow) ? 'slow' : 'good'
}
