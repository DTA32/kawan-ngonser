<script setup lang="ts">
// O-1: pick any subset of the concert's days
import { DateTime } from 'luxon'
import type { Concert } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'

const props = defineProps<{ concert: Concert }>()
defineEmits<{ proceed: [] }>()

const selected = defineModel<number[]>({ required: true })

function dateLabel(date: string): string {
  return DateTime.fromISO(date, { zone: props.concert.timezone }).toFormat('cccc · d LLL yyyy')
}

function toggle(dayIndex: number) {
  selected.value = selected.value.includes(dayIndex)
    ? selected.value.filter(d => d !== dayIndex)
    : [...selected.value, dayIndex].sort((a, b) => a - b)
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-6 px-5 pb-7 pt-5">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">
        {{ DESIGN_COPY.daySelectTitle }}
      </h1>
      <p class="text-sm leading-relaxed text-text-secondary">
        {{ DESIGN_COPY.daySelectSub }}
      </p>
    </div>

    <div class="flex flex-col gap-3" role="group" aria-label="Attendance days">
      <button
        v-for="day in concert.days"
        :key="day.dayIndex"
        type="button"
        role="checkbox"
        :aria-checked="selected.includes(day.dayIndex)"
        class="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
        :class="selected.includes(day.dayIndex)
          ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary'
          : 'bg-surface'"
        @click="toggle(day.dayIndex)"
      >
        <div class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-semibold text-text">Day {{ day.dayIndex }}</span>
          <span class="text-[13px] text-text-secondary">{{ dateLabel(day.date) }}</span>
        </div>
        <div
          class="flex size-6 items-center justify-center rounded-lg"
          :class="selected.includes(day.dayIndex)
            ? 'bg-primary'
            : 'bg-surface-raised ring-[1.5px] ring-inset ring-border'"
        >
          <UIcon
            v-if="selected.includes(day.dayIndex)"
            name="i-lucide-check"
            class="size-[15px] text-white"
          />
        </div>
      </button>
    </div>

    <button
      type="button"
      class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary disabled:opacity-40"
      :disabled="selected.length === 0"
      @click="$emit('proceed')"
    >
      {{ DESIGN_COPY.continueCta }}
    </button>
  </div>
</template>
