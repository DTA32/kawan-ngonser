/**
 * G-1 install state. Chromium exposes `beforeinstallprompt` (captured so the
 * reminder card can trigger the native prompt); iOS Safari has no prompt —
 * the card shows Share → Add to Home Screen instructions instead.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
let wired = false

function computeInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true
}

export function useInstallPrompt() {
  if (!wired && typeof window !== 'undefined') {
    wired = true
    installed.value = computeInstalled()
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt.value = e as BeforeInstallPromptEvent
    })
    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferredPrompt.value = null
    })
    window.matchMedia('(display-mode: standalone)')
      .addEventListener('change', () => { installed.value = computeInstalled() })
  }

  const isIOS = typeof navigator !== 'undefined'
    && /iphone|ipad|ipod/i.test(navigator.userAgent)

  return {
    /** Hide the G-1 reminder when true */
    installed,
    /** Chromium: native prompt available */
    canPrompt: computed(() => deferredPrompt.value !== null),
    isIOS,
    async prompt(): Promise<boolean> {
      const evt = deferredPrompt.value
      if (!evt) return false
      await evt.prompt()
      const choice = await evt.userChoice
      if (choice.outcome === 'accepted') deferredPrompt.value = null
      return choice.outcome === 'accepted'
    },
  }
}
