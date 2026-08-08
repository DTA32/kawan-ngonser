<script setup lang="ts">
/**
 * W-2 custom events (lunch, toilet break …): create from an empty slot /
 * add-a-break, edit or delete after creation via the same sheet.
 */
import { DateTime } from 'luxon'
import { dayIndexOfCustomEvent } from '~/domain/schedule'
import { venueDateOf, venueDateTime } from '~/domain/time'
import { DESIGN_COPY } from '~/utils/copy'
import { useConcertCacheStore } from '~/stores/concertCache'

const props = defineProps<{
  eventId: string
  /** null → create mode */
  customEventId: string | null
  prefillStartMs?: number
}>()

const emit = defineEmits<{ close: [] }>()

const cache = useConcertCacheStore()
const plan = usePlan(() => props.eventId)

const concert = computed(() => cache.getConcert(props.eventId))
const tz = computed(() => concert.value?.timezone ?? 'UTC')

const existing = computed(() =>
  plan.customEvents.value.find(e => e.customEventId === props.customEventId) ?? null)

const name = ref('')
const startInput = ref('')
const endInput = ref('')

watchEffect(() => {
  if (existing.value) {
    name.value = existing.value.name
    startInput.value = venueDateTime(existing.value.startMs, tz.value).toFormat('HH:mm')
    endInput.value = existing.value.endMs !== null
      ? venueDateTime(existing.value.endMs, tz.value).toFormat('HH:mm')
      : ''
  }
  else if (props.prefillStartMs) {
    startInput.value = venueDateTime(props.prefillStartMs, tz.value).toFormat('HH:mm')
  }
})

const canSave = computed(() => name.value.trim().length > 0 && startInput.value.length > 0)

/**
 * H-5. Create mode is always editable — its only entrances are the board's own
 * add buttons, which are already gated on the shown day.
 */
const eventDayIndex = computed(() => {
  const schedule = plan.schedule.value
  if (!schedule || !props.customEventId) return null
  return dayIndexOfCustomEvent(schedule, props.customEventId)
})
const editable = useDayEditable(() => props.eventId, eventDayIndex)

function toMs(hhmm: string, baseMs: number): number | null {
  const date = venueDateOf(baseMs, tz.value)
  const dt = DateTime.fromISO(`${date}T${hhmm}`, { zone: tz.value })
  return dt.isValid ? dt.toMillis() : null
}

function onSave() {
  const baseMs = existing.value?.startMs ?? props.prefillStartMs ?? nowMs()
  const startMs = toMs(startInput.value, baseMs)
  if (startMs === null || !canSave.value) return
  let endMs = endInput.value ? toMs(endInput.value, baseMs) : null
  if (endMs !== null && endMs <= startMs) endMs += 24 * 60 * 60 * 1000

  if (existing.value) {
    plan.updateCustomEvent({ ...existing.value, name: name.value.trim(), startMs, endMs })
  }
  else {
    plan.addCustomEvent({ name: name.value.trim(), startMs, endMs })
  }
  emit('close')
}

function onDelete() {
  if (existing.value) plan.removeCustomEvent(existing.value.customEventId)
  emit('close')
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <h2 class="font-heading text-[19px] font-bold text-text">
      {{ existing ? 'Edit your break' : 'Add a break' }}
    </h2>
    <p class="text-[13px] text-text-secondary">
      Lunch, merch run, toilet break — it shows up on your timetable and nudges you too.
    </p>
  </div>

  <label class="flex flex-col gap-1.5">
    <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">WHAT</span>
    <input
      v-model="name"
      type="text"
      placeholder="e.g. Dinner at the food court"
      class="rounded-xl bg-surface px-3.5 py-3 text-[15px] font-semibold text-text outline-none ring-1 ring-inset ring-border placeholder:font-normal placeholder:text-text-muted"
    >
  </label>

  <div class="flex gap-2.5">
    <label class="flex flex-1 flex-col gap-1.5">
      <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">STARTS</span>
      <span class="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-border">
        <UIcon name="i-lucide-clock-4" class="size-4 shrink-0 text-text-secondary" />
        <input v-model="startInput" type="time" class="w-full bg-transparent text-[15px] font-semibold text-text outline-none">
      </span>
    </label>
    <label class="flex flex-1 flex-col gap-1.5">
      <span class="text-[11px] font-semibold tracking-[1px] text-text-muted">ENDS · OPTIONAL</span>
      <span class="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-inset ring-border">
        <UIcon name="i-lucide-clock-4" class="size-4 shrink-0 text-text-secondary" />
        <input v-model="endInput" type="time" class="w-full bg-transparent text-[15px] font-semibold text-text outline-none">
      </span>
    </label>
  </div>

  <!-- H-5: a day that's over is relive-only -->
  <p v-if="!editable" class="text-sm text-text-muted">{{ DESIGN_COPY.pastDayReadOnly }}</p>

  <div v-else class="flex flex-col gap-2">
    <button
      type="button"
      class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary disabled:opacity-40"
      :disabled="!canSave"
      @click="onSave"
    >
      {{ existing ? 'Save changes' : 'Add it' }}
    </button>
    <button
      v-if="existing"
      type="button"
      class="flex w-full items-center justify-center gap-2 px-6 py-3 text-[15px] font-semibold text-danger"
      @click="onDelete"
    >
      <UIcon name="i-lucide-trash-2" class="size-4" />
      Delete
    </button>
  </div>
</template>
