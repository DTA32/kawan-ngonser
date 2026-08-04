<script setup lang="ts">
import { formatDayLabel, formatTime } from '~/domain/time'
import type { Concert } from '~/domain/types'

const props = defineProps<{
  concert: Concert
  dayIndex: number
  mode: 'today' | 'preview'
}>()

const now = useNow()

const label = computed(() => {
  const date = props.concert.days.find(d => d.dayIndex === props.dayIndex)?.date ?? ''
  const day = formatDayLabel(date, props.concert.timezone)
  return props.mode === 'today'
    ? `DAY ${props.dayIndex} · ${day} · ${formatTime(now.value, props.concert.timezone)}`
    : `DAY ${props.dayIndex} · ${day}`
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <p class="text-xs font-semibold tracking-[1px] text-primary">{{ label }}</p>
    <h1 class="font-heading text-[22px] font-bold leading-tight text-text">
      {{ concert.name }} - Day {{ dayIndex }}
    </h1>
  </div>
</template>
