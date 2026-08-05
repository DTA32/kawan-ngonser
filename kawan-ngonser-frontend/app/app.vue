<script setup lang="ts">
import { processPendingWarmups } from '~/services/imageCache'
import { useConcertCacheStore } from '~/stores/concertCache'
import { useAppConfigStore } from '~/stores/appConfig'
import { COPY, interpolate } from '~/utils/copy'
import { onPersistError } from '~/utils/persist-feedback'

useAppTheme()

const toast = useToast()

// C31: any failed local write surfaces a danger toast (deduped — a burst of
// failing writes must not stack identical toasts over the page)
let lastSaveFailureToast = 0
onPersistError(() => {
  if (Date.now() - lastSaveFailureToast < 5000) return
  lastSaveFailureToast = Date.now()
  toast.add({
    description: COPY.toastSaveFailure,
    icon: 'i-lucide-triangle-alert',
    color: 'error',
  })
})

// G-3: battery toast on downward threshold crossing — C5 online / C6 offline
const battery = useBatteryStatus()
const { online } = useConnectivity()
watch(() => battery.shouldToast.value, (fire) => {
  if (!fire) return
  battery.markToasted()
  toast.add({
    description: interpolate(online.value ? COPY.batteryToastOnline : COPY.batteryToastOffline, {
      n: battery.levelPct.value,
    }),
    icon: 'i-lucide-battery-warning',
    color: 'warning',
  })
})

// On reconnect: retry queued image warm-ups + refresh the app config
const cache = useConcertCacheStore()
const appConfig = useAppConfigStore()
const connectivity = useConnectivity()
connectivity.onReconnect(() => {
  void processPendingWarmups(id => cache.getConcert(id))
  void appConfig.refresh(useApi())
})
onMounted(() => {
  if (online.value) void appConfig.refresh(useApi())
})

// App-BUILD updates (vite-pwa) — distinct from the F-1 concert-data sync
const { $pwa } = useNuxtApp()
watch(() => $pwa?.needRefresh, (needs) => {
  if (!needs) return
  toast.add({
    description: 'A new version of Kawan Ngonser is ready.',
    icon: 'i-lucide-sparkles',
    color: 'primary',
    duration: 0,
    actions: [{
      label: 'Update now',
      onClick: () => { void $pwa?.updateServiceWorker() },
    }],
  })
})

const isDev = import.meta.dev
</script>

<template>
  <UApp :toaster="{ position: 'top-center', duration: 6000 }">
    <!-- injects <link rel="manifest"> — without this vite-pwa adds no head tags -->
    <NuxtPwaManifest />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <DevTimeTravel v-if="isDev" />
  </UApp>
</template>
