<script setup lang="ts">
// One timetable column: stage@12% fill, 3px stage-colored left border.
// Backburner renders at 50% opacity (§12.4); local edits get a pencil mark.
import { formatTimeRange } from '~/domain/time'
import type { EffectivePerformance, Stage } from '~/domain/types'
import { stageStyleVars } from '~/utils/stage-color'

const props = defineProps<{
  performance: EffectivePerformance
  stage: Stage | undefined
  timezone: string
  backburner?: boolean
  past?: boolean
}>()

defineEmits<{ select: [] }>()

const vars = computed(() => stageStyleVars(props.stage?.color ?? ''))
</script>

<template>
  <button
    type="button"
    class="flex h-full min-w-0 flex-1 flex-col gap-0.5 rounded-lg border-l-[3px] px-3 py-2.5 text-left"
    :class="[backburner ? 'opacity-50' : '', past ? 'opacity-60' : '']"
    :style="{ ...vars, background: vars['--stage-tint'], borderColor: vars['--stage'] }"
    @click="$emit('select')"
  >
    <!-- names wrap in narrow conflict columns instead of truncating -->
    <span class="flex items-start gap-1.5">
      <span class="line-clamp-2 break-words text-sm font-semibold leading-snug text-text">{{ performance.artistName }}</span>
      <UIcon v-if="performance.overridden" name="i-lucide-pencil" class="mt-0.5 size-3 shrink-0 text-text-muted" />
    </span>
    <span class="truncate text-[11px] text-text-secondary">
      {{ formatTimeRange(performance.startMs, performance.endMs, timezone) }}
    </span>
    <span class="line-clamp-2 break-words text-[11px] font-medium leading-snug" :style="{ color: vars['--stage'] }">
      {{ stage?.name ?? performance.stageId }}
    </span>
  </button>
</template>
