<script setup lang="ts">
/**
 * O-4 "Schedule clash! Who gets you?" — non-dismissible duel sheet, reused by
 * W-4 "Watch this". Shows the head of the prompt queue; each answer pops it.
 */
import { DateTime } from 'luxon'
import { formatTimeRange } from '~/domain/time'
import type { Concert, ConflictPrompt, EffectivePerformance } from '~/domain/types'
import { COPY, DESIGN_COPY } from '~/utils/copy'
import { clampStageColor } from '~/utils/stage-color'

const props = defineProps<{
  concert: Concert
  performances: EffectivePerformance[]
  prompts: ConflictPrompt[]
}>()

const emit = defineEmits<{ resolve: [groupIds: string[], winnerId: string] }>()

const open = computed(() => props.prompts.length > 0)
const current = computed(() => props.prompts[0] ?? null)

const duel = computed<EffectivePerformance[]>(() => {
  if (!current.value) return []
  const map = new Map(props.performances.map(p => [p.performanceId, p]))
  return current.value.performanceIds
    .map(id => map.get(id))
    .filter((p): p is EffectivePerformance => p !== undefined)
    .sort((a, b) => a.startMs - b.startMs)
})

const subLine = computed(() => {
  const group = duel.value
  if (group.length === 0) return ''
  const start = Math.min(...group.map(p => p.startMs))
  const end = Math.max(...group.map(p => p.endMs))
  const weekday = DateTime.fromMillis(start, { zone: props.concert.timezone }).toFormat('cccc')
  const overlapMin = Math.round(
    (Math.min(...group.map(p => p.endMs)) - Math.max(...group.map(p => p.startMs))) / 60_000,
  )
  const range = formatTimeRange(start, end, props.concert.timezone)
  return overlapMin > 0
    ? `${weekday} · ${range} · sets overlap by ${overlapMin} min`
    : `${weekday} · ${range} · sets overlap`
})

const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

function stageColor(stageId: string): string {
  return clampStageColor(stageOf.value.get(stageId)?.color ?? '')
}

const imgFailed = reactive(new Set<string>())

function choose(winnerId: string) {
  if (!current.value) return
  emit('resolve', [...current.value.performanceIds], winnerId)
}
</script>

<template>
  <CommonBottomSheet :open="open" :dismissible="false" @update:open="() => {}">
    <h2 class="text-center font-heading text-[21px] font-bold leading-tight text-text">
      {{ COPY.conflictSheetTitle }}
    </h2>
    <p class="text-center text-[13px] leading-snug text-text-secondary">{{ subLine }}</p>

    <div class="grid grid-cols-2 gap-3">
      <button
        v-for="(perf, i) in duel"
        :key="perf.performanceId"
        type="button"
        class="flex flex-col overflow-hidden rounded-2xl bg-surface text-left ring-1 ring-inset ring-border"
        :class="duel.length === 3 && i === 2 ? 'col-span-2' : ''"
        @click="choose(perf.performanceId)"
      >
        <div class="h-[110px] w-full bg-surface-raised">
          <img
            v-if="perf.artistImage && !imgFailed.has(perf.performanceId)"
            :src="perf.artistImage"
            alt=""
            class="size-full object-cover"
            @error="imgFailed.add(perf.performanceId)"
          >
          <div v-else class="flex size-full items-center justify-center">
            <span class="font-heading text-2xl font-bold text-text-secondary">
              {{ perf.artistName.charAt(0).toUpperCase() }}
            </span>
          </div>
        </div>
        <div class="flex flex-col gap-1 p-3">
          <span class="truncate text-[15px] font-semibold text-text">{{ perf.artistName }}</span>
          <span class="flex items-center gap-1.5 text-xs font-medium" :style="{ color: stageColor(perf.stageId) }">
            <span class="size-1.5 rounded-full" :style="{ background: stageColor(perf.stageId) }" />
            {{ stageOf.get(perf.stageId)?.name ?? perf.stageId }}
          </span>
          <span class="text-xs text-text-secondary">
            {{ formatTimeRange(perf.startMs, perf.endMs, concert.timezone) }}
          </span>
        </div>
      </button>
    </div>

    <p class="text-center text-xs leading-snug text-text-muted">
      {{ DESIGN_COPY.conflictHint }}
    </p>
  </CommonBottomSheet>
</template>
