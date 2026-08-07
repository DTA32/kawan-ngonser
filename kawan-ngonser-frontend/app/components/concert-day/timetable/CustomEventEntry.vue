<script setup lang="ts">
// §12.4: custom events are a neutral slate chip with an icon — visually
// distinct from stage-colored performances.
//
// `variant: 'block'` is the detailed view; `density` gates the time line,
// since a 20-minute break is only tall enough for its name.
import { formatTime, formatTimeRange } from '~/domain/time'
import type { CustomEvent } from '~/domain/types'
import type { BlockDensity } from '~/utils/timetable-detailed'

const props = withDefaults(defineProps<{
  event: CustomEvent
  timezone: string
  past?: boolean
  variant?: 'row' | 'block'
  density?: BlockDensity
}>(), { variant: 'row', density: 'full' })

defineEmits<{ select: [] }>()

const timeLabel = computed(() =>
  props.event.endMs !== null
    ? formatTimeRange(props.event.startMs, props.event.endMs, props.timezone)
    : formatTime(props.event.startMs, props.timezone))

const showTime = computed(() => props.variant === 'row' || props.density !== 'tight')
</script>

<template>
  <button
    type="button"
    class="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg bg-surface-raised text-left"
    :class="[
      variant === 'row' ? 'h-full flex-1 px-3 py-2.5' : 'size-full ring-1 ring-inset ring-border',
      variant === 'block' && density === 'tight' ? 'px-2.5 py-1' : '',
      variant === 'block' && density !== 'tight' ? 'px-3 py-2' : '',
      past ? 'opacity-60' : '',
    ]"
    :aria-label="`${event.name}, ${timeLabel}`"
    @click="$emit('select')"
  >
    <UIcon name="i-lucide-utensils" class="size-3 shrink-0 text-text-secondary" />
    <span class="flex min-w-0 flex-col gap-0.5">
      <span
        class="truncate font-semibold text-text"
        :class="variant === 'block' && density === 'tight' ? 'text-[11px]' : 'text-sm'"
      >{{ event.name }}</span>
      <span v-if="showTime" class="truncate text-[11px] text-text-secondary">{{ timeLabel }}</span>
    </span>
  </button>
</template>
