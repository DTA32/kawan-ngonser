<script setup lang="ts">
// O-2: how the conflict runner-up renders in the timetable (equal / hidden),
// plus the backburner-notify default (N-1c opt-in flipped to opt-out).
import type { ConflictDisplayPref } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'

defineEmits<{ proceed: [] }>()

const pref = defineModel<ConflictDisplayPref>({ required: true })
const notifyBackburner = defineModel<boolean>('notifyBackburner', { required: true })

const options = [
  {
    value: 'equal' as const,
    title: 'Both equal size',
    desc: 'Split the slot 50/50, no favorites',
  },
  {
    value: 'hidden' as const,
    title: 'Hide it entirely',
    desc: 'Only show the set you chose',
  },
]
</script>

<template>
  <div class="flex flex-1 flex-col gap-6 px-5 pb-7 pt-5">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">
        When sets clash, how should the runner-up look?
      </h1>
      <p class="text-sm leading-relaxed text-text-secondary">
        You'll pick a winner for every clash — this sets how the other one shows up in your timetable.
      </p>
    </div>

    <div class="flex flex-col gap-3" role="radiogroup" aria-label="Conflict display">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        role="radio"
        :aria-checked="pref === opt.value"
        class="flex w-full items-center gap-3 rounded-2xl p-3.5 text-left"
        :class="pref === opt.value
          ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary'
          : 'bg-surface'"
        @click="pref = opt.value"
      >
        <UIcon
          :name="pref === opt.value ? 'i-lucide-circle-check' : 'i-lucide-circle'"
          class="size-[22px] shrink-0"
          :class="pref === opt.value ? 'text-primary' : 'text-text-muted'"
        />
        <!-- mini preview: two stage-colored bars vs one bar -->
        <div class="flex w-16 shrink-0 gap-[3px]">
          <div class="h-[22px] flex-1 rounded" style="background: #E85D75" />
          <div v-if="opt.value === 'equal'" class="h-[22px] flex-1 rounded" style="background: #4CC3FF" />
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-sm font-semibold text-text">{{ opt.title }}</span>
          <span class="text-xs leading-snug text-text-secondary">{{ opt.desc }}</span>
        </div>
      </button>
    </div>

    <button
      type="button"
      role="checkbox"
      :aria-checked="notifyBackburner"
      class="flex w-full items-center gap-3 rounded-2xl p-3.5 text-left"
      :class="notifyBackburner ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary' : 'bg-surface'"
      @click="notifyBackburner = !notifyBackburner"
    >
      <div
        class="flex size-[22px] shrink-0 items-center justify-center rounded-[7px]"
        :class="notifyBackburner ? 'bg-primary' : 'bg-surface-raised ring-[1.5px] ring-inset ring-border'"
      >
        <UIcon v-if="notifyBackburner" name="i-lucide-check" class="size-3.5 text-white" />
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-sm font-semibold text-text">{{ DESIGN_COPY.backburnerNotifyLabel }}</span>
        <span class="text-xs leading-snug text-text-secondary">{{ DESIGN_COPY.backburnerNotifySub }}</span>
      </div>
    </button>

    <button
      type="button"
      class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
      @click="$emit('proceed')"
    >
      {{ DESIGN_COPY.continueCta }}
    </button>
  </div>
</template>
