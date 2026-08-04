<script setup lang="ts">
// G-2: globe grey when offline, success-colored when online; tap → C3/C4
import { COPY } from '~/utils/copy'

const { online } = useConnectivity()
</script>

<template>
  <UPopover :content="{ side: 'bottom', align: 'end', sideOffset: 8 }">
    <button type="button" aria-label="Connectivity status" class="flex items-center">
      <UIcon
        name="i-lucide-globe"
        class="size-5 transition-colors"
        :class="online ? 'text-success' : 'text-text-muted'"
      />
    </button>
    <template #content>
      <div class="w-56 rounded-[14px] border border-border bg-surface-raised p-3">
        <p class="text-sm font-semibold text-text">
          {{ online ? COPY.onlineTitle : COPY.offlineTitle }}
        </p>
        <p class="mt-1 text-[13px] leading-snug text-text-secondary">
          {{ online ? COPY.onlineBody : COPY.offlineBody }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
