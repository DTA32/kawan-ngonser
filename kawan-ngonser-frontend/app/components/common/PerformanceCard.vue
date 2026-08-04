<script setup lang="ts">
// The small performance card (design "Performance Card"): 4px stage bar,
// name + "20:00 – 21:00 · in 58 mins", stage chip @15% tint. `dimmed` for
// backburner rows (W-3).
import { formatRelative, formatTimeRange } from '~/domain/time'
import type { EffectivePerformance, Stage } from '~/domain/types'
import { stageStyleVars } from '~/utils/stage-color'

const props = defineProps<{
  performance: EffectivePerformance
  stage: Stage | undefined
  timezone: string
  nowMs: number
  dimmed?: boolean
}>()

defineEmits<{ select: [] }>()

const vars = computed(() => stageStyleVars(props.stage?.color ?? ''))
const timeLine = computed(() => {
  const range = formatTimeRange(props.performance.startMs, props.performance.endMs, props.timezone)
  const rel = formatRelative(props.performance.startMs - props.nowMs)
  return `${range} · ${rel}`
})
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl bg-surface-raised p-3.5 text-left"
    :class="dimmed ? 'opacity-80' : ''"
    :style="vars"
    @click="$emit('select')"
  >
    <span class="h-10 w-1 shrink-0 rounded-sm bg-(--stage)" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[15px] font-semibold text-text">{{ performance.artistName }}</span>
      <span class="truncate text-xs text-text-secondary">{{ timeLine }}</span>
    </span>
    <span class="shrink-0 rounded-full px-2.5 py-[5px] text-[11px] font-medium" :style="{ background: vars['--stage-chip'], color: vars['--stage'] }">
      {{ stage?.name ?? performance.stageId }}
    </span>
  </button>
</template>
