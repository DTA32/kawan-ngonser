<script setup lang="ts">
/**
 * C20 "Schedule changed? Edit this set" — dedicated sheet (design frame
 * `Sheet – Edit Performance`): time change or full removal, stored as flagged
 * local overrides (F-1 C12 warns before sync replaces them).
 */
import { DateTime } from 'luxon'
import { venueDateOf, venueDateTime } from '~/domain/time'
import { COPY, interpolate } from '~/utils/copy'
import { useConcertCacheStore } from '~/stores/concertCache'
import type { PickEffect } from '~/domain/picks'

const props = defineProps<{
  eventId: string
  performanceId: string
}>()

const emit = defineEmits<{ close: [] }>()

const cache = useConcertCacheStore()
const plan = usePlan(() => props.eventId)
const conflicts = useConflictQueue()
const toast = useToast()

const concert = computed(() => cache.getConcert(props.eventId))
const performance = computed(() =>
  plan.schedule.value?.performances.find(p => p.performanceId === props.performanceId))

const tz = computed(() => concert.value?.timezone ?? 'UTC')
const startInput = ref('')
const endInput = ref('')

watch(performance, (p) => {
  if (p) {
    startInput.value = venueDateTime(p.startMs, tz.value).toFormat('HH:mm')
    endInput.value = venueDateTime(p.endMs, tz.value).toFormat('HH:mm')
  }
}, { immediate: true })

const subLine = computed(() => {
  if (!performance.value || !concert.value) return ''
  const stage = concert.value.stages.find(s => s.stageId === performance.value!.stageId)
  const date = venueDateOf(performance.value.startMs, tz.value)
  const day = DateTime.fromISO(date, { zone: tz.value }).toFormat('ccc d LLL')
  return `${performance.value.artistName} · ${stage?.name ?? ''} · ${day}`
})

/** "HH:mm" on the performance's own venue date; end < start rolls past midnight. */
function toMs(hhmm: string, baseMs: number): number | null {
  const date = venueDateOf(baseMs, tz.value)
  const dt = DateTime.fromISO(`${date}T${hhmm}`, { zone: tz.value })
  return dt.isValid ? dt.toMillis() : null
}

function onSave() {
  const p = performance.value
  if (!p) return
  const startMs = toMs(startInput.value, p.startMs)
  let endMs = toMs(endInput.value, p.startMs)
  if (startMs === null || endMs === null) return
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000 // crosses midnight
  plan.overrideTime(props.performanceId, startMs, endMs)
  toast.add({ description: COPY.toastEditSaved, icon: 'i-lucide-circle-check', color: 'success' })
  emit('close')
}

function surfacePromotions(effects: PickEffect[]) {
  for (const e of effects) {
    if (e.type === 'promoted') {
      const name = plan.schedule.value?.performances
        .find(x => x.performanceId === e.performanceId)?.artistName ?? ''
      toast.add({
        description: interpolate(COPY.toastPromoted, { artist: name }),
        icon: 'i-lucide-circle-check',
        color: 'success',
      })
    }
  }
  conflicts.pushFromEffects(effects)
}

function onRemove() {
  const name = performance.value?.artistName ?? ''
  const effects = plan.removePerformance(props.performanceId)
  toast.add({
    description: interpolate(COPY.toastRemoved, { artist: name }),
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
  surfacePromotions(effects)
  emit('close')
}
</script>

<template>
  <template v-if="performance && concert">
    <div class="flex flex-col gap-1.5">
      <h2 class="font-heading text-[19px] font-bold text-text">Edit this set</h2>
      <p class="text-[13px] text-text-secondary">{{ subLine }}</p>
    </div>

    <div class="flex gap-2.5">
      <label class="flex flex-1 flex-col gap-1.5">
        <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">STARTS</span>
        <span class="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-border">
          <UIcon name="i-lucide-clock-4" class="size-4 shrink-0 text-text-secondary" />
          <input
            v-model="startInput"
            type="time"
            class="w-full bg-transparent text-[15px] font-semibold text-text outline-none"
          >
        </span>
      </label>
      <label class="flex flex-1 flex-col gap-1.5">
        <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">ENDS</span>
        <span class="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-border">
          <UIcon name="i-lucide-clock-4" class="size-4 shrink-0 text-text-secondary" />
          <input
            v-model="endInput"
            type="time"
            class="w-full bg-transparent text-[15px] font-semibold text-text outline-none"
          >
        </span>
      </label>
    </div>

    <p class="text-xs leading-relaxed text-text-muted">
      Edits stay on your device — if the server has fresh data, sync will ask before replacing them.
    </p>

    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
        @click="onSave"
      >
        Save changes
      </button>
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 px-6 py-3 text-[15px] font-semibold text-danger"
        @click="onRemove"
      >
        <UIcon name="i-lucide-trash-2" class="size-4" />
        Remove this set
      </button>
    </div>
  </template>
</template>
