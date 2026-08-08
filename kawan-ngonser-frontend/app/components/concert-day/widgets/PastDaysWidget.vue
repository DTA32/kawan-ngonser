<script setup lang="ts">
// W-7: attending days that are already over → relive that day's board.
// The mirror of W-5; self-hides when there is nothing behind you.
import { formatDayTitle } from '~/utils/time-format'
import type { Concert, PickMap } from '~/domain/types'
import { DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{
  concert: Concert
  /** Attending days before the one being shown, nearest first */
  dayIndexes: number[]
  picks: PickMap
}>()

function dateOf(dayIndex: number): string {
  return props.concert.days.find(d => d.dayIndex === dayIndex)?.date ?? ''
}

function pickCount(dayIndex: number): number {
  const dayPerfIds = new Set(
    props.concert.performances.filter(p => p.dayIndex === dayIndex).map(p => p.performanceId))
  return Object.values(props.picks)
    .filter(p => p.status === 'preferred' && dayPerfIds.has(p.performanceId))
    .length
}

function title(dayIndex: number): string {
  return formatDayTitle(dayIndex, dateOf(dayIndex), props.concert.timezone)
}
</script>

<template>
  <CommonWidgetCard v-if="dayIndexes.length">
    <template #title>{{ DESIGN_COPY.widgetPastDays }}</template>
    <NuxtLink
      v-for="day in dayIndexes"
      :key="day"
      :to="`/concerts/${concert.eventId}/day/${day}`"
      class="flex items-center gap-3 rounded-xl bg-surface-raised p-3.5"
    >
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
        <UIcon name="i-lucide-calendar-check" class="size-5 text-text-secondary" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[15px] font-semibold text-text">{{ title(day) }}</span>
        <span class="text-xs text-text-secondary">
          {{ interpolate(DESIGN_COPY.dayRelivedSub, { n: pickCount(day) }) }}
        </span>
      </span>
      <UIcon name="i-lucide-chevron-right" class="size-[18px] shrink-0 text-text-muted" />
    </NuxtLink>
  </CommonWidgetCard>
</template>
