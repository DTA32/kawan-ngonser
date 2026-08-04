<script setup lang="ts">
import { DateTime } from 'luxon'
import { DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{
  dayIndex: number
  date: string
  timezone: string
}>()

const label = computed(() => interpolate(DESIGN_COPY.previewingDay, {
  x: props.dayIndex,
  date: DateTime.fromISO(props.date, { zone: props.timezone }).toFormat('ccc d LLL'),
}))
</script>

<template>
  <div class="flex items-center gap-2.5 rounded-xl bg-info/8 px-3.5 py-2.5">
    <UIcon name="i-lucide-eye" class="size-4 shrink-0 text-info" />
    <span class="flex-1 text-[13px] font-medium text-text-secondary">{{ label }}</span>
    <NuxtLink to="/" class="text-[13px] font-semibold text-info">Back to today</NuxtLink>
  </div>
</template>
