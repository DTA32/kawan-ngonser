<script setup lang="ts">
// W-4: upcoming sets with no active pick (incl. skipped — re-addable).
// The list can span a whole day (start of day / preview) → paginated by 5.
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

// A shrinking list (sets passing, picks added) must not leave a stale offset
watch(() => props.performances.length, (len) => {
  if (visibleCount.value > len) visibleCount.value = Math.max(PAGE_SIZE, len)
})
</script>

<template>
  <CommonWidgetCard>
    <template #title>{{ DESIGN_COPY.widgetOther }}</template>
    <template v-if="performances.length">
      <CommonPerformanceCard
        v-for="perf in visible"
        :key="perf.performanceId"
        :performance="perf"
        :stage="stageOf.get(perf.stageId)"
        :timezone="concert.timezone"
        :now-ms="now"
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
    <CommonEmptyState v-else icon="i-lucide-list-checks" :main="DESIGN_COPY.emptyOther" />
  </CommonWidgetCard>
</template>
