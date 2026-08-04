<script setup lang="ts">
// Home – Other Concerts (S-4): "Day {x} is happening now" + Open → back to /
import { DESIGN_COPY, interpolate } from '~/utils/copy'

defineProps<{ dayIndex: number }>()
defineEmits<{ open: [] }>()
</script>

<template>
  <div class="flex items-center gap-3 rounded-2xl bg-success/8 p-3.5">
    <span class="size-2 shrink-0 rounded-full bg-success" />
    <span class="flex-1 text-[13px] font-semibold text-text">
      {{ interpolate(DESIGN_COPY.liveBanner, { x: dayIndex }) }}
    </span>
    <button
      type="button"
      class="rounded-[18px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-on-primary"
      @click="$emit('open')"
    >
      {{ DESIGN_COPY.liveBannerOpen }}
    </button>
  </div>
</template>
