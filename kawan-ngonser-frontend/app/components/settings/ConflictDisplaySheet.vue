<script setup lang="ts">
// S-3: sheet variant of the O-2 choice (design "Sheet – Conflict Display")
import type { ConflictDisplayPref } from '~/domain/types'
import { DESIGN_COPY } from '~/utils/copy'

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { required: true })

const plan = usePlan(() => props.eventId)

const pref = computed(() => plan.settings.value?.conflictDisplayPref ?? 'equal')

const options = [
  { value: 'equal' as ConflictDisplayPref, title: 'Both equal size', desc: 'Split the slot 50/50, no favorites' },
  { value: 'hidden' as ConflictDisplayPref, title: 'Hide it entirely', desc: 'Only show the set you chose' },
]

function choose(value: ConflictDisplayPref) {
  if (value !== pref.value) {
    plan.setConflictDisplayPref(value)
    emit('saved')
  }
  open.value = false
}

const notifyBackburner = computed(() => plan.settings.value?.backburnerNotifyDefault ?? false)

function toggleNotifyBackburner() {
  plan.setBackburnerNotifyDefault(!notifyBackburner.value)
  emit('saved')
}
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <div class="flex flex-col gap-1.5">
      <h2 class="font-heading text-[19px] font-bold text-text">Conflict display</h2>
      <p class="text-[13px] text-text-secondary">
        This sets how the runner-up of a clash shows up in your timetable.
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
        :class="pref === opt.value ? 'bg-primary/10 ring-[1.5px] ring-inset ring-primary' : 'bg-surface'"
        @click="choose(opt.value)"
      >
        <UIcon
          :name="pref === opt.value ? 'i-lucide-circle-check' : 'i-lucide-circle'"
          class="size-[22px] shrink-0"
          :class="pref === opt.value ? 'text-primary' : 'text-text-muted'"
        />
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
      @click="toggleNotifyBackburner"
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
  </CommonBottomSheet>
</template>
