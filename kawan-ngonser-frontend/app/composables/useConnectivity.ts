/**
 * G-2 connectivity state. `navigator.onLine` lies at venues (captive portals,
 * saturated cells), so the globe is driven by measured round trips instead:
 * every real API call is timed, and a tiny /health probe fills the gaps only
 * when the app has gone quiet. See domain/connectionQuality for the verdict.
 */
import { useOnline } from '@vueuse/core'
import {
  classify,
  type ConnectionQuality,
  type Sample,
  STALE_AFTER_MS,
  WINDOW,
} from '~/domain/connectionQuality'

const DEGRADE_MS = 30_000

/** How often the probe *considers* firing (it usually declines — see below). */
const PROBE_TICK_MS = 15_000
/** A sample older than this leaves the globe stale enough to be worth a probe. */
const PROBE_AFTER_QUIET_MS = 60_000
/** A ~30-byte response that takes longer than this is not a working connection. */
const PROBE_TIMEOUT_MS = 5_000

/** What the G-2 globe shows, folding quality and `navigator.onLine` together. */
export type ConnectivityStatus = 'online' | 'slow' | 'offline'

const degradedUntil = ref(0)
const reconnectCallbacks = new Set<() => void>()
let wired = false

const samples = ref<Sample[]>([])
const quality = ref<ConnectionQuality>('good')
const lastSampleAtMs = ref(0)
const hintSlow = ref(false)

/** Captured at wire time: `useRuntimeConfig()` needs a Nuxt instance, and the
 *  probe runs from a timer where there isn't one. */
let apiBase = '/api'

/** Feed a completed round trip in. Called by the API client and by the probe. */
function recordSample(rttMs: number | null, ok: boolean): void {
  const at = Date.now()
  lastSampleAtMs.value = at
  // Keep a little more than the classifier's window so its staleness pruning
  // has something to work with, but never let this grow unbounded.
  samples.value = [...samples.value, { atMs: at, rttMs, ok }].slice(-(WINDOW * 2))
  quality.value = classify(samples.value, quality.value, at)
  degradedUntil.value = ok ? 0 : at + DEGRADE_MS
}

async function probe(): Promise<void> {
  const startedAt = performance.now()
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    // A misconfigured build (no NUXT_PUBLIC_API_BASE, and no /api proxy in
    // nginx) would get index.html here — fast, 200, and completely wrong.
    // Demand real JSON so a broken deploy can't read as a healthy connection.
    const isJson = res.headers.get('content-type')?.includes('application/json') ?? false
    recordSample(performance.now() - startedAt, res.ok && isJson)
  }
  catch {
    recordSample(null, false)
  }
}

/**
 * Chromium-only hint (absent on iOS, exactly like the Battery API in G-3), so
 * it's a free extra signal and never the primary one — the probe still decides.
 */
function readConnectionHint(): void {
  const conn = (navigator as { connection?: { effectiveType?: string } }).connection
  hintSlow.value = conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g'
}

export function useConnectivity() {
  const online = useOnline()
  const now = useNow()

  if (!wired && typeof window !== 'undefined') {
    wired = true
    apiBase = useRuntimeConfig().public.apiBase || '/api'

    watch(online, (isOnline, wasOnline) => {
      if (isOnline && !wasOnline) {
        degradedUntil.value = 0
        // The old verdict describes a network that no longer exists.
        samples.value = []
        quality.value = 'good'
        for (const cb of reconnectCallbacks) cb()
        void probe()
      }
    })

    const maybeProbe = () => {
      if (document.visibilityState !== 'visible') return
      if (!online.value) return
      if (Date.now() - lastSampleAtMs.value < PROBE_AFTER_QUIET_MS) return
      void probe()
    }

    // A busy app never probes (its own calls are the samples); an idle visible
    // app probes at most once a minute; a pocketed phone never probes at all.
    window.setInterval(maybeProbe, PROBE_TICK_MS)
    document.addEventListener('visibilitychange', maybeProbe)
    maybeProbe()

    readConnectionHint()
    const conn = (navigator as { connection?: EventTarget }).connection
    conn?.addEventListener('change', readConnectionHint)
  }

  /** A verdict drawn from stale samples must not outlive them. */
  const freshQuality = computed<ConnectionQuality>(() =>
    now.value - lastSampleAtMs.value >= STALE_AFTER_MS ? 'good' : quality.value)

  const status = computed<ConnectivityStatus>(() => {
    if (!online.value) return 'offline'
    if (freshQuality.value === 'unreachable') return 'offline'
    if (freshQuality.value === 'slow' || hintSlow.value) return 'slow'
    return 'online'
  })

  const effectivelyOnline = computed(() =>
    online.value && now.value >= degradedUntil.value)

  return {
    /** Browser-reported — the raw signal */
    online,
    /** Measured, three-state — what the G-2 globe shows */
    status,
    /** Refined signal for fetch decisions (degrades on a failed round trip) */
    effectivelyOnline,
    /** Called by the API client for every completed request */
    recordSample,
    /** Register work to run when connectivity returns (image warm-up, etc.) */
    onReconnect(cb: () => void): () => void {
      reconnectCallbacks.add(cb)
      return () => reconnectCallbacks.delete(cb)
    },
  }
}
