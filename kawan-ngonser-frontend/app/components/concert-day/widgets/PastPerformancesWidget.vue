<script setup lang="ts">
// W-6: sets of the shown day that have ENDED — everything that played, not
// just your picks (the timetable's "Earlier today" collapse already covers
// those). Just-ended first, and paginated by 5 like W-4 since a full day of
// sets is a long list.
import type { Concert, EffectivePerformance } from '~/domain/types'
import { DESIGN_COPY, interpolate } from '~/utils/copy'

const PAGE_SIZE = 5

const props = defineProps<{
  concert: Concert
  performances: EffectivePerformance[]
}>()

defineEmits<{ select: [performanceId: string] }>()

const now = useNow()
const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

const visibleCount = ref(PAGE_SIZE)
const visible = computed(() => props.performances.slice(0, visibleCount.value))
const remaining = computed(() => Math.max(0, props.performances.length - visibleCount.value))

// This list GROWS as sets end (and shrinks when the board switches days), so
// the offset still needs the same guard W-4 uses.
watch(() => props.performances.length, (len) => {
  if (visibleCount.value > len) visibleCount.value = Math.max(PAGE_SIZE, len)
})
</script>

<template>
  <CommonWidgetCard>
    <template #title>{{ DESIGN_COPY.widgetPastPerformances }}</template>
    <template v-if="performances.length">
      <CommonPerformanceCard
        v-for="perf in visible"
        :key="perf.performanceId"
        :performance="perf"
        :stage="stageOf.get(perf.stageId)"
        :timezone="concert.timezone"
        :now-ms="now"
        past
        @select="$emit('select', perf.performanceId)"
      />
      <button
        v-if="remaining > 0"
        type="button"
        class="flex w-full items-center justify-center gap-1.5 py-1"
        @click="visibleCount += PAGE_SIZE"
      >
        <span class="text-xs font-semibold text-primary">
          {{ interpolate(DESIGN_COPY.showMore, { n: Math.min(remaining, PAGE_SIZE), remaining }) }}
        </span>
        <UIcon name="i-lucide-chevron-down" class="size-3.5 text-primary" />
      </button>
    </template>
    <CommonEmptyState v-else icon="i-lucide-history" :main="DESIGN_COPY.emptyPastPerformances" />
  </CommonWidgetCard>
</template>
