/**
 * Artist images must work offline (§3.1 note) but live on arbitrary remote
 * origins, usually without CORS. Strategy: proactive warm-up at sync/upload
 * time — fetch no-cors, cache.put the opaque responses into kn-images-v1
 * (served cache-first by the SW image route). Offline uploads register a
 * pending warm-up that runs on reconnect.
 */
import { kvRepo } from '~/db/repos/kvRepo'
import type { Concert } from '~/domain/types'
import { persist } from '~/utils/persist-feedback'

const CACHE_NAME = 'kn-images-v1'
const PENDING_KEY = 'pending-image-warmup'

export function collectImageUrls(concert: Concert): string[] {
  const urls = new Set<string>()
  if (/^https?:\/\//.test(concert.logo)) urls.add(concert.logo)
  for (const p of concert.performances) {
    if (/^https?:\/\//.test(p.artistImage)) urls.add(p.artistImage)
  }
  return [...urls]
}

/**
 * Opaque responses are padded heavily in Chromium's quota accounting (~7MB
 * each) — never let image warm-up eat the quota the PLAN needs. Keep at
 * least 15% of quota (or 300MB) free; stop warming when the headroom is gone.
 */
const HEADROOM_FRACTION = 0.15
const HEADROOM_MIN_BYTES = 300 * 1024 * 1024
const QUOTA_CHECK_EVERY = 10

async function hasQuotaHeadroom(): Promise<boolean> {
  try {
    const est = await navigator.storage?.estimate?.()
    if (!est?.quota) return true
    const headroom = est.quota - (est.usage ?? 0)
    return headroom > Math.max(est.quota * HEADROOM_FRACTION, HEADROOM_MIN_BYTES)
  }
  catch {
    return true
  }
}

export async function warmImageCache(urls: string[]): Promise<{ cached: number, failed: number, stopped: boolean }> {
  if (typeof caches === 'undefined') return { cached: 0, failed: urls.length, stopped: false }
  if (!(await hasQuotaHeadroom())) {
    console.warn('[kawan-ngonser] skipping image warm-up — origin storage headroom too low')
    return { cached: 0, failed: urls.length, stopped: true }
  }
  const cache = await caches.open(CACHE_NAME)
  let cached = 0
  let failed = 0
  let fetched = 0
  let stopped = false
  // Small batches — 128 artist photos shouldn't saturate the connection
  const queue = [...urls]
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length > 0 && !stopped) {
      const url = queue.shift()!
      try {
        if (await cache.match(url, { ignoreVary: true })) {
          cached++
          continue
        }
        if (fetched > 0 && fetched % QUOTA_CHECK_EVERY === 0 && !(await hasQuotaHeadroom())) {
          stopped = true
          break
        }
        const res = await fetch(url, { mode: 'no-cors', cache: 'no-store' })
        await cache.put(url, res)
        fetched++
        cached++
      }
      catch {
        failed++ // placeholder avatar covers it offline
      }
    }
  })
  await Promise.all(workers)
  if (stopped)
    console.warn(`[kawan-ngonser] image warm-up stopped early to protect storage quota (${cached} cached)`)
  return { cached, failed: failed + queue.length, stopped }
}

/** Warm a concert's images now, or queue it for the next reconnect. */
export async function warmConcertImages(concert: Concert, online: boolean): Promise<void> {
  if (!online) {
    await markPending(concert.eventId)
    return
  }
  const { failed } = await warmImageCache(collectImageUrls(concert))
  if (failed > 0) await markPending(concert.eventId)
  else await clearPending(concert.eventId)
}

async function markPending(eventId: string): Promise<void> {
  const pending = new Set((await kvRepo.get<string[]>(PENDING_KEY)) ?? [])
  pending.add(eventId)
  persist(() => kvRepo.set(PENDING_KEY, [...pending]))
}

async function clearPending(eventId: string): Promise<void> {
  const pending = new Set((await kvRepo.get<string[]>(PENDING_KEY)) ?? [])
  if (pending.delete(eventId)) persist(() => kvRepo.set(PENDING_KEY, [...pending]))
}

/** Run queued warm-ups (called on reconnect). */
export async function processPendingWarmups(getConcert: (eventId: string) => Concert | undefined): Promise<void> {
  const pending = (await kvRepo.get<string[]>(PENDING_KEY)) ?? []
  for (const eventId of pending) {
    const concert = getConcert(eventId)
    if (concert) await warmConcertImages(concert, true)
  }
}

/** Chromium counts opaque responses generously against quota — ask to keep it. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  }
  catch {
    // best effort
  }
}
