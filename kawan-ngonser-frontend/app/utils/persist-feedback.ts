/**
 * C31 error path: stores update memory first (offline UX must keep working),
 * then persist to Dexie; a failed write lands here. The app shell registers a
 * handler that raises the C31 toast — this module stays UI-free so stores and
 * services can import it without pulling in Vue.
 */
type PersistErrorHandler = (error: unknown) => void

let handler: PersistErrorHandler | null = null

export function onPersistError(h: PersistErrorHandler): void {
  handler = h
}

export function reportPersistError(error: unknown): void {
  console.error('[kawan-ngonser] local save failed', error)
  handler?.(error)
}

/**
 * The image warm-up cache is the evictable tier: opaque responses carry heavy
 * quota padding, and a full origin makes EVERY IndexedDB write fail. When a
 * write hits quota, drop the image cache and retry once — degraded artist
 * photos beat losing the user's plan.
 */
const IMAGE_CACHE_NAME = 'kn-images-v1'

function isQuotaError(error: unknown): boolean {
  const e = error as { name?: string, message?: string, inner?: { name?: string } } | null
  return [e?.name, e?.inner?.name, e?.message].some(v => v?.includes('QuotaExceeded'))
    || (e?.name === 'AbortError' && String(error).includes('Quota'))
}

/** Fire-and-forget persistence wrapper used by every write-through mutation. */
export function persist(write: () => Promise<unknown>): void {
  void (async () => {
    try {
      await write()
    }
    catch (error) {
      if (isQuotaError(error) && typeof caches !== 'undefined') {
        try {
          await caches.delete(IMAGE_CACHE_NAME)
          await write()
          console.warn('[kawan-ngonser] origin quota full — dropped the image cache to save the plan')
          return
        }
        catch (retryError) {
          reportPersistError(retryError)
          return
        }
      }
      reportPersistError(error)
    }
  })()
}
