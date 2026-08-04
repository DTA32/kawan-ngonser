<script setup lang="ts">
// C10 countdown — 1s tick, DAYS/HOURS/MINS tiles with primary digits
import { countdownParts } from '~/domain/time'

const props = defineProps<{ targetMs: number }>()

const now = useNow(1000)

const parts = computed(() => countdownParts(props.targetMs - now.value))

const tiles = computed(() => [
  { unit: 'DAYS', value: parts.value.days },
  { unit: 'HOURS', value: parts.value.hours },
  { unit: 'MINS', value: parts.value.mins },
])
</script>

<template>
  <div class="flex justify-center gap-2.5">
    <div
      v-for="tile in tiles"
      :key="tile.unit"
      class="flex w-[84px] flex-col items-center gap-0.5 rounded-[14px] bg-surface py-3 ring-1 ring-inset ring-border"
    >
      <span class="font-heading text-[26px] font-bold leading-none text-primary">{{ tile.value }}</span>
      <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">{{ tile.unit }}</span>
    </div>
  </div>
</template>
