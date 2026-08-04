<script setup lang="ts">
// W-3: upcoming conflict-losing picks, dimmed; tap opens the same sheet
import type { Concert, EffectivePerformance } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'

const props = defineProps<{
  concert: Concert
  performances: EffectivePerformance[]
}>()

defineEmits<{ select: [performanceId: string] }>()

const now = useNow()
const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))
</script>

<template>
  <CommonWidgetCard>
    <template #title>{{ DESIGN_COPY.widgetBackburner }}</template>
    <template v-if="performances.length">
      <CommonPerformanceCard
        v-for="perf in performances"
        :key="perf.performanceId"
        :performance="perf"
        :stage="stageOf.get(perf.stageId)"
        :timezone="concert.timezone"
        :now-ms="now"
        dimmed
        @select="$emit('select', perf.performanceId)"
      />
    </template>
    <CommonEmptyState v-else icon="i-lucide-check-check" :main="DESIGN_COPY.emptyBackburner" />
  </CommonWidgetCard>
</template>
