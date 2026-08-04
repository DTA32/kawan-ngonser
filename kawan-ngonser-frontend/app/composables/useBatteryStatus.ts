/**
 * G-3 battery state. Battery Status API is Chromium-only — when unsupported
 * (iOS Safari, Firefox) `supported` stays false and no indicator or toast
 * ever renders. Toast edge-triggering (with hysteresis) is decided here;
 * the app shell owns showing C5/C6.
 */
import { useBattery } from '@vueuse/core'
import { useAppConfigStore } from '~/stores/appConfig'

const HYSTERESIS_PCT = 3

const lastToastedAt = ref<number | null>(null)
const rearmed = ref(true)

export function useBatteryStatus() {
  const { isSupported, level, charging } = useBattery()
  const appConfig = useAppConfigStore()

  const thresholdPct = computed(() => appConfig.config.batteryLowThresholdPct)
  const levelPct = computed(() => Math.round(level.value * 100))

  const low = computed(() =>
    isSupported.value && !charging.value && levelPct.value <= thresholdPct.value)

  // Re-arm the toast once the level climbs clearly above the threshold
  watch(levelPct, (pct) => {
    if (pct >= thresholdPct.value + HYSTERESIS_PCT) rearmed.value = true
  })

  /**
   * True exactly once per downward threshold crossing — the shell watches
   * this to fire C5/C6 and then calls `markToasted()`.
   */
  const shouldToast = computed(() => low.value && rearmed.value)

  function markToasted(): void {
    rearmed.value = false
    lastToastedAt.value = Date.now()
  }

  return {
    supported: isSupported,
    levelPct,
    charging,
    low,
    shouldToast,
    markToasted,
  }
}
