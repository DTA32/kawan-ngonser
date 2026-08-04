/**
 * The single app clock. Every time-reactive computation (relative labels, the
 * day-context switch, banners, the notification scheduler) reads one of these
 * ticking refs, so behavior is consistent and the dev-only time-travel
 * override (festival dates are fixed!) affects the whole app at once.
 */

const OFFSET_KEY = 'kn:dev-time-offset-ms'

/** Dev-only clock offset (real now + offset = app now). 0 in production. */
const devOffsetMs = ref(0)

if (import.meta.dev && typeof window !== 'undefined') {
  const stored = Number(window.localStorage.getItem(OFFSET_KEY))
  if (Number.isFinite(stored) && stored !== 0) devOffsetMs.value = stored
}

export function nowMs(): number {
  return Date.now() + devOffsetMs.value
}

/** Dev tool: freeze "now" at a target instant (keeps ticking from there). */
export function setDevTimeTarget(targetMs: number | null): void {
  if (!import.meta.dev) return
  devOffsetMs.value = targetMs === null ? 0 : targetMs - Date.now()
  if (typeof window !== 'undefined') {
    if (devOffsetMs.value === 0) window.localStorage.removeItem(OFFSET_KEY)
    else window.localStorage.setItem(OFFSET_KEY, String(devOffsetMs.value))
  }
}

export function getDevTimeOffset(): Ref<number> {
  return devOffsetMs
}

const tickers = new Map<number, Ref<number>>()

/**
 * Shared ticking epoch-ms ref at the given granularity (default 30s — fine
 * for "in xx mins" lists). Use 1000 only for the visible countdown.
 */
export function useNow(intervalMs = 30_000): Readonly<Ref<number>> {
  let tick = tickers.get(intervalMs)
  if (!tick) {
    const created = ref(nowMs())
    tick = created
    tickers.set(intervalMs, created)
    if (typeof window !== 'undefined') {
      window.setInterval(() => { created.value = nowMs() }, intervalMs)
    }
    // Dev override changes must propagate immediately, not on the next tick.
    // Registered once per ticker (module scope), so no watcher leak.
    if (import.meta.dev) {
      watch(devOffsetMs, () => { created.value = nowMs() }, { flush: 'sync' })
    }
  }
  return tick
}
