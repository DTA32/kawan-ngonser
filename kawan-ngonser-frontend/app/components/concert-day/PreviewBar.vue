<script setup lang="ts">
import { DateTime } from 'luxon'
import type { DayPhase } from '~/domain/dayState'
import { DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{
  dayIndex: number
  date: string
  timezone: string
  phase: DayPhase
}>()

// A day you can still change is a preview; one that's over you only relive.
const label = computed(() => interpolate(
  props.phase === 'past' ? DESIGN_COPY.relivingDay : DESIGN_COPY.previewingDay,
  {
    x: props.dayIndex,
    date: DateTime.fromISO(props.date, { zone: props.timezone }).toFormat('ccc d LLL'),
  },
))

const icon = computed(() => props.phase === 'past' ? 'i-lucide-history' : 'i-lucide-eye')
</script>

<template>
  <div class="flex items-center gap-2.5 rounded-xl bg-info/8 px-3.5 py-2.5">
    <UIcon :name="icon" class="size-4 shrink-0 text-info" />
    <span class="flex-1 text-[13px] font-medium text-text-secondary">{{ label }}</span>
    <NuxtLink to="/" class="text-[13px] font-semibold text-info">Back to today</NuxtLink>
  </div>
</template>
