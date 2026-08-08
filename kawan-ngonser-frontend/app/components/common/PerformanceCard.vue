<script setup lang="ts">
// The small performance card (design "Performance Card"): 4px stage bar,
// name + "20:00 – 21:00 · in 58 mins", stage chip @15% tint. `dimmed` for
// backburner rows (W-3).
//
// A set that is already under way stays in these lists until it ends, so it
// gets a LIVE dot and counts DOWN to its end instead of up from its start.
// `past` (W-6) is the other end of that: dimmer, and counting up from the end.
import { formatSetStatus, formatTimeRange, isLive } from '~/domain/time'
import type { EffectivePerformance, Stage } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'
import { stageStyleVars } from '~/utils/stage-color'

const props = defineProps<{
  performance: EffectivePerformance
  stage: Stage | undefined
  timezone: string
  nowMs: number
  dimmed?: boolean
  /** W-6: the set has ended — dimmer than `dimmed`, time line counts up */
  past?: boolean
}>()

defineEmits<{ select: [] }>()

const vars = computed(() => stageStyleVars(props.stage?.color ?? ''))

const live = computed(() =>
  isLive(props.performance.startMs, props.performance.endMs, props.nowMs))

const timeLine = computed(() => {
  const range = formatTimeRange(props.performance.startMs, props.performance.endMs, props.timezone)
  const rel = formatSetStatus(props.performance.startMs, props.performance.endMs, props.nowMs)
  return `${range} · ${rel}`
})
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl bg-surface-raised p-3.5 text-left"
    :class="past ? 'opacity-60' : dimmed ? 'opacity-80' : ''"
    :style="vars"
    @click="$emit('select')"
  >
    <span class="h-10 w-1 shrink-0 rounded-sm bg-(--stage)" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="flex min-w-0 items-center gap-1.5">
        <span v-if="live" class="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5">
          <span class="size-1.5 animate-pulse rounded-full bg-primary" />
          <span class="text-[10px] font-bold leading-none tracking-wide text-primary">{{ DESIGN_COPY.liveBadge }}</span>
        </span>
        <span class="truncate text-[15px] font-semibold text-text">{{ performance.artistName }}</span>
      </span>
      <span class="truncate text-xs text-text-secondary">{{ timeLine }}</span>
    </span>
    <span class="shrink-0 rounded-full px-2.5 py-[5px] text-[11px] font-medium" :style="{ background: vars['--stage-chip'], color: vars['--stage'] }">
      {{ stage?.name ?? performance.stageId }}
    </span>
  </button>
</template>
