<script setup lang="ts">
// One timetable column: stage@12% fill, 3px stage-colored left border.
// Backburner renders at 50% opacity (§12.4); local edits get a pencil mark.
//
// `variant: 'block'` is the detailed view — the parent positions and sizes it
// absolutely, and `density` says how many lines actually fit at that height.
import { formatTimeRange } from '~/domain/time'
import type { EffectivePerformance, Stage } from '~/domain/types'
import type { BlockDensity } from '~/utils/timetable-detailed'
import { stageStyleVars } from '~/utils/stage-color'

const props = withDefaults(defineProps<{
  performance: EffectivePerformance
  stage: Stage | undefined
  timezone: string
  backburner?: boolean
  past?: boolean
  variant?: 'row' | 'block'
  density?: BlockDensity
}>(), { variant: 'row', density: 'full' })

defineEmits<{ select: [] }>()

const vars = computed(() => stageStyleVars(props.stage?.color ?? ''))

const stageName = computed(() => props.stage?.name ?? props.performance.stageId)
const timeLabel = computed(() =>
  formatTimeRange(props.performance.startMs, props.performance.endMs, props.timezone))

/** Rows always show everything; blocks degrade with height. */
const showTime = computed(() => props.variant === 'row' || props.density !== 'tight')
const showStage = computed(() => props.variant === 'row' || props.density === 'full')
</script>

<template>
  <button
    type="button"
    class="flex min-w-0 flex-col overflow-hidden rounded-lg border-l-[3px] text-left"
    :class="[
      variant === 'row' ? 'h-full flex-1 gap-0.5 px-3 py-2.5' : 'size-full',
      variant === 'block' && density === 'full' ? 'gap-0.5 px-3 py-2' : '',
      variant === 'block' && density === 'medium' ? 'gap-0.5 px-3 py-1.5' : '',
      variant === 'block' && density === 'tight' ? 'justify-center px-2.5 py-1' : '',
      backburner ? 'opacity-50' : '',
      past ? 'opacity-60' : '',
    ]"
    :style="{ ...vars, background: vars['--stage-tint'], borderColor: vars['--stage'] }"
    :aria-label="`${performance.artistName}, ${timeLabel}, ${stageName}`"
    @click="$emit('select')"
  >
    <!-- names wrap in narrow conflict columns instead of truncating -->
    <span class="flex items-start gap-1.5">
      <span
        class="break-words font-semibold leading-snug text-text"
        :class="density === 'tight' && variant === 'block'
          ? 'truncate text-[11px]'
          : `line-clamp-2 ${density === 'medium' && variant === 'block' ? 'text-[13px]' : 'text-sm'}`"
      >{{ performance.artistName }}</span>
      <UIcon v-if="performance.overridden" name="i-lucide-pencil" class="mt-0.5 size-3 shrink-0 text-text-muted" />
    </span>

    <!-- full stacks time over stage; medium folds them onto one line -->
    <template v-if="variant === 'block' && density === 'medium'">
      <span class="flex min-w-0 items-center gap-1 text-[11px]">
        <span class="shrink-0 text-text-secondary">{{ timeLabel }}</span>
        <span class="shrink-0 text-text-muted">·</span>
        <span class="truncate font-medium" :style="{ color: vars['--stage'] }">{{ stageName }}</span>
      </span>
    </template>
    <template v-else>
      <span v-if="showTime" class="truncate text-[11px] text-text-secondary">{{ timeLabel }}</span>
      <span
        v-if="showStage"
        class="line-clamp-2 break-words text-[11px] font-medium leading-snug"
        :style="{ color: vars['--stage'] }"
      >{{ stageName }}</span>
    </template>
  </button>
</template>
