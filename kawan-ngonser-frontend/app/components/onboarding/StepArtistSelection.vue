<script setup lang="ts">
// O-3: per-day artist checkbox list. Selected rows that overlap another
// selected row get a warning "Clash" chip — sorted out on proceed (O-4).
import { overlaps } from '~/domain/conflicts'
import { formatDayLabel, formatTimeRange } from '~/domain/time'
import type { Concert, EffectivePerformance, PickMap } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'
import { clampStageColor } from '~/utils/stage-color'

const props = defineProps<{
  concert: Concert
  dayIndex: number
  performances: EffectivePerformance[]
  picks: PickMap
  /** Label for the proceed button: "Next: Day 2" or "Finish" */
  nextLabel: string
}>()

defineEmits<{ toggle: [performanceId: string], proceed: [] }>()

const dayPerfs = computed(() =>
  props.performances.filter(p => p.dayIndex === props.dayIndex))

const dayDate = computed(() =>
  props.concert.days.find(d => d.dayIndex === props.dayIndex)?.date ?? '')

const stageOf = computed(() => new Map(props.concert.stages.map(s => [s.stageId, s])))

function isSelected(id: string): boolean {
  const status = props.picks[id]?.status
  return status === 'preferred' || status === 'backburner'
}

/** Selected rows overlapping another selected row show the clash chip. */
function hasClash(perf: EffectivePerformance): boolean {
  if (!isSelected(perf.performanceId)) return false
  return dayPerfs.value.some(other =>
    other.performanceId !== perf.performanceId
    && isSelected(other.performanceId)
    && overlaps(other, perf))
}

function stageColor(stageId: string): string {
  return clampStageColor(stageOf.value.get(stageId)?.color ?? '')
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-5 px-5 pb-7 pt-5">
    <div class="flex flex-col gap-2">
      <p class="text-xs font-semibold tracking-[1px] text-primary">
        DAY {{ dayIndex }} · {{ formatDayLabel(dayDate, concert.timezone) }}
      </p>
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">
        {{ DESIGN_COPY.artistSelectTitle }}
      </h1>
      <p class="text-sm leading-relaxed text-text-secondary">
        {{ DESIGN_COPY.artistSelectSub }}
      </p>
    </div>

    <div class="flex flex-col gap-2.5" role="group" aria-label="Artists">
      <button
        v-for="perf in dayPerfs"
        :key="perf.performanceId"
        type="button"
        role="checkbox"
        :aria-checked="isSelected(perf.performanceId)"
        class="flex w-full items-center gap-3 rounded-[14px] p-3 text-left"
        :class="isSelected(perf.performanceId)
          ? 'bg-primary/8 ring-[1.5px] ring-inset ring-primary'
          : 'bg-surface'"
        @click="$emit('toggle', perf.performanceId)"
      >
        <OnboardingArtistAvatar :name="perf.artistName" :image="perf.artistImage" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex items-center gap-2">
            <span class="truncate text-[15px] font-semibold text-text">{{ perf.artistName }}</span>
            <span
              v-if="hasClash(perf)"
              class="flex shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2 py-[3px]"
            >
              <UIcon name="i-lucide-zap" class="size-2.5 text-warning" />
              <span class="text-[10px] font-semibold text-warning">Clash</span>
            </span>
          </span>
          <span class="flex items-center gap-1.5 text-xs text-text-secondary">
            {{ formatTimeRange(perf.startMs, perf.endMs, concert.timezone) }}
            <span class="size-1.5 rounded-full" :style="{ background: stageColor(perf.stageId) }" />
            <span class="font-medium" :style="{ color: stageColor(perf.stageId) }">
              {{ stageOf.get(perf.stageId)?.name ?? perf.stageId }}
            </span>
          </span>
        </div>
        <div
          class="flex size-[22px] shrink-0 items-center justify-center rounded-[7px]"
          :class="isSelected(perf.performanceId)
            ? 'bg-primary'
            : 'bg-surface-raised ring-[1.5px] ring-inset ring-border'"
        >
          <UIcon
            v-if="isSelected(perf.performanceId)"
            name="i-lucide-check"
            class="size-3.5 text-white"
          />
        </div>
      </button>
    </div>

    <div class="mt-auto pt-2">
      <button
        type="button"
        class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
        @click="$emit('proceed')"
      >
        {{ nextLabel }}
      </button>
    </div>
  </div>
</template>
