<script setup lang="ts">
// W-1: next preferred performance large, the two after it small
import { formatRelative, formatTimeRange } from '~/domain/time'
import type { Concert, EffectivePerformance } from '~/domain/types'
import { DESIGN_COPY, interpolate } from '~/utils/copy'
import { stageStyleVars } from '~/utils/stage-color'

const props = defineProps<{
  concert: Concert
  upNext: EffectivePerformance[]
  /** For the day-done empty state sub line */
  nextDayIndex: number | null
}>()

defineEmits<{ select: [performanceId: string] }>()

const now = useNow()
const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

const first = computed(() => props.upNext[0] ?? null)
const rest = computed(() => props.upNext.slice(1, 3))

const firstVars = computed(() => stageStyleVars(
  first.value ? stageOf.value.get(first.value.stageId)?.color ?? '' : ''))
</script>

<template>
  <CommonWidgetCard>
    <template #title>{{ DESIGN_COPY.widgetUpNext }}</template>

    <template v-if="first">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl bg-surface-raised p-3.5 text-left"
        :style="firstVars"
        @click="$emit('select', first.performanceId)"
      >
        <span class="h-12 w-1 shrink-0 rounded-sm bg-(--stage)" />
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate font-heading text-lg font-bold text-text">{{ first.artistName }}</span>
          <span class="truncate text-[13px] text-text-secondary">
            {{ formatTimeRange(first.startMs, first.endMs, concert.timezone) }}
            · {{ stageOf.get(first.stageId)?.name ?? first.stageId }}
          </span>
        </span>
        <span class="shrink-0 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary">
          {{ formatRelative(first.startMs - now) }}
        </span>
      </button>

      <CommonPerformanceCard
        v-for="perf in rest"
        :key="perf.performanceId"
        :performance="perf"
        :stage="stageOf.get(perf.stageId)"
        :timezone="concert.timezone"
        :now-ms="now"
        @select="$emit('select', perf.performanceId)"
      />
    </template>

    <CommonEmptyState
      v-else
      icon="i-lucide-moon-star"
      :main="DESIGN_COPY.emptyUpNext"
      :sub="nextDayIndex ? interpolate(DESIGN_COPY.emptyUpNextSub, { x: nextDayIndex }) : undefined"
    />
  </CommonWidgetCard>
</template>
