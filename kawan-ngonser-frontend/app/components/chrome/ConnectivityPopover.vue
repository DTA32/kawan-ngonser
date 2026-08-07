<script setup lang="ts">
// G-2: globe grey when offline, amber when reachable-but-slow, success-colored
// when healthy; tap → C3/C4 (or the new slow copy). "Slow" comes from measured
// round trips, not navigator.onLine — see composables/useConnectivity.
import { COPY, DESIGN_COPY } from '~/utils/copy'

const { status } = useConnectivity()

const PRESENTATION = {
  online: { color: 'text-success', title: COPY.onlineTitle, body: COPY.onlineBody },
  slow: { color: 'text-warning', title: DESIGN_COPY.onlineSlowTitle, body: DESIGN_COPY.onlineSlowBody },
  offline: { color: 'text-text-muted', title: COPY.offlineTitle, body: COPY.offlineBody },
} as const

const view = computed(() => PRESENTATION[status.value])
</script>

<template>
  <UPopover :content="{ side: 'bottom', align: 'end', sideOffset: 8 }">
    <button type="button" :aria-label="`Connectivity status: ${view.title}`" class="flex items-center">
      <UIcon name="i-lucide-globe" class="size-5 transition-colors" :class="view.color" />
    </button>
    <template #content>
      <div class="w-56 rounded-[14px] border border-border bg-surface-raised p-3">
        <p class="text-sm font-semibold text-text">{{ view.title }}</p>
        <p class="mt-1 text-[13px] leading-snug text-text-secondary">{{ view.body }}</p>
      </div>
    </template>
  </UPopover>
</template>
