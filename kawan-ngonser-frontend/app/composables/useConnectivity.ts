/**
 * G-2 connectivity state. `navigator.onLine` lies at venues (captive portals),
 * so any API failure while nominally online temporarily degrades
 * `effectivelyOnline`; a successful call or a fresh 'online' event restores it.
 */
import { useOnline } from '@vueuse/core'

const DEGRADE_MS = 30_000

const degradedUntil = ref(0)
const reconnectCallbacks = new Set<() => void>()
let wired = false

export function useConnectivity() {
  const online = useOnline()
  const now = useNow()

  if (!wired && typeof window !== 'undefined') {
    wired = true
    watch(online, (isOnline, wasOnline) => {
      if (isOnline && !wasOnline) {
        degradedUntil.value = 0
        for (const cb of reconnectCallbacks) cb()
      }
    })
  }

  const effectivelyOnline = computed(() =>
    online.value && now.value >= degradedUntil.value)

  return {
    /** Browser-reported (drives the G-2 globe) */
    online,
    /** Refined signal for fetch decisions */
    effectivelyOnline,
    /** Call after an API failure while nominally online */
    reportApiFailure(): void {
      degradedUntil.value = Date.now() + DEGRADE_MS
    },
    /** Call after any API success */
    reportApiSuccess(): void {
      degradedUntil.value = 0
    },
    /** Register work to run when connectivity returns (image warm-up, etc.) */
    onReconnect(cb: () => void): () => void {
      reconnectCallbacks.add(cb)
      return () => reconnectCallbacks.delete(cb)
    },
  }
}
