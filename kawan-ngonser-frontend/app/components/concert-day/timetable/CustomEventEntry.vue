<script setup lang="ts">
// §12.4: custom events are a neutral slate chip with an icon — visually
// distinct from stage-colored performances.
import { formatTime, formatTimeRange } from '~/domain/time'
import type { CustomEvent } from '~/domain/types'

const props = defineProps<{
  event: CustomEvent
  timezone: string
  past?: boolean
}>()

defineEmits<{ select: [] }>()

const timeLabel = computed(() =>
  props.event.endMs !== null
    ? formatTimeRange(props.event.startMs, props.event.endMs, props.timezone)
    : formatTime(props.event.startMs, props.timezone))
</script>

<template>
  <button
    type="button"
    class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-raised px-3 py-2.5 text-left"
    :class="past ? 'opacity-60' : ''"
    @click="$emit('select')"
  >
    <UIcon name="i-lucide-utensils" class="size-3.5 shrink-0 text-text-secondary" />
    <span class="flex min-w-0 flex-col gap-0.5">
      <span class="truncate text-sm font-semibold text-text">{{ event.name }}</span>
      <span class="truncate text-[11px] text-text-secondary">{{ timeLabel }}</span>
    </span>
  </button>
</template>
