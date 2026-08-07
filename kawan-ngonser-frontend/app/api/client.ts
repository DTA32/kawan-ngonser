import { type $Fetch, ofetch } from 'ofetch'

/** What the caller learns about a completed request (G-2 connection quality). */
export interface RequestTiming {
  /** Round-trip in ms; null when the request never completed */
  rttMs: number | null
  ok: boolean
}

/** Stamped onto ofetch's per-call options so the response hook can read it. */
interface TimedOptions { _startedAt?: number }

export function createApiClient(
  baseURL: string,
  onTiming?: (timing: RequestTiming) => void,
): $Fetch {
  return ofetch.create({
    baseURL,
    timeout: 5_000,
    retry: 0,

    // Every real call doubles as a connection-quality sample, so an active
    // app never needs to probe /health at all.
    onRequest({ options }) {
      (options as TimedOptions)._startedAt = performance.now()
    },
    // ofetch fires onResponse for 4xx/5xx as well, so this covers every
    // completed round trip. A status code says nothing about the network —
    // /config 404s on an unseeded server by design (§3.2) — so any response at
    // all counts as `ok`; only a transport failure does not.
    onResponse({ options }) {
      onTiming?.({ rttMs: elapsed(options), ok: true })
    },
    onRequestError({ options }) {
      onTiming?.({ rttMs: elapsed(options), ok: false })
    },
  })
}

function elapsed(options: unknown): number | null {
  const startedAt = (options as TimedOptions)._startedAt
  return startedAt === undefined ? null : performance.now() - startedAt
}
