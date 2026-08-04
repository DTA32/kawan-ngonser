<script setup lang="ts">
/**
 * The W-2/W-3/W-4 performance sheet — role-aware action matrix (§7.2):
 *   preferred   → Skip (C17) · Edit (C20)
 *   backburner  → Make my pick (C18) · Notify toggle (C19/C23) · Edit · Skip
 *   other/skipped → Watch this (C21)
 * Every action confirms with its verbatim C29 toast; promotions surface too.
 */
import { formatRelative, formatTimeRange } from '~/domain/time'
import type { PickEffect } from '~/domain/picks'
import { COPY, interpolate } from '~/utils/copy'
import { stageStyleVars } from '~/utils/stage-color'
import { useConcertCacheStore } from '~/stores/concertCache'

const props = defineProps<{
  eventId: string
  performanceId: string
}>()

const emit = defineEmits<{ close: [], edit: [] }>()

const cache = useConcertCacheStore()
const plan = usePlan(() => props.eventId)
const conflicts = useConflictQueue()
const toast = useToast()
const now = useNow()

const concert = computed(() => cache.getConcert(props.eventId))
const performance = computed(() =>
  plan.schedule.value?.performances.find(p => p.performanceId === props.performanceId))
const pick = computed(() => plan.picks.value[props.performanceId])
const role = computed<'preferred' | 'backburner' | 'other'>(() =>
  pick.value?.status === 'preferred'
    ? 'preferred'
    : pick.value?.status === 'backburner' ? 'backburner' : 'other')

const stage = computed(() =>
  concert.value?.stages.find(s => s.stageId === performance.value?.stageId))
const vars = computed(() => stageStyleVars(stage.value?.color ?? ''))

const timeLine = computed(() => {
  if (!performance.value || !concert.value) return ''
  const rel = formatRelative(performance.value.startMs - now.value)
  const range = formatTimeRange(performance.value.startMs, performance.value.endMs, concert.value.timezone)
  return `${rel} · ${range}`
})

const imgFailed = ref(false)
const artist = computed(() => performance.value?.artistName ?? '')

function success(description: string) {
  toast.add({ description, icon: 'i-lucide-circle-check', color: 'success' })
}

function surfacePromotions(effects: PickEffect[]) {
  for (const e of effects) {
    if (e.type === 'promoted') {
      const name = plan.schedule.value?.performances
        .find(p => p.performanceId === e.performanceId)?.artistName ?? ''
      success(interpolate(COPY.toastPromoted, { artist: name }))
    }
  }
  conflicts.pushFromEffects(effects)
}

function onSkip() {
  const effects = plan.skip(props.performanceId)
  success(interpolate(COPY.toastSkipped, { artist: artist.value }))
  surfacePromotions(effects)
  emit('close')
}

function onMakePick() {
  const { effects, demoted } = plan.swapPreferred(props.performanceId)
  const other = demoted
    .map(id => plan.schedule.value?.performances.find(p => p.performanceId === id)?.artistName)
    .filter(Boolean)
    .join(', ')
  success(interpolate(COPY.toastPickSwap, { artist: artist.value, other }))
  surfacePromotions(effects)
  emit('close')
}

function onNotifyToggle() {
  const next = !pick.value?.notifyOptIn
  plan.setNotifyOptIn(props.performanceId, next)
  success(interpolate(next ? COPY.toastNotifyOptIn : COPY.toastNotifyOptOut, { artist: artist.value }))
}

function onWatchThis() {
  const effects = plan.addPick(props.performanceId)
  success(interpolate(COPY.toastWatchThis, { artist: artist.value }))
  surfacePromotions(effects)
  emit('close')
}
</script>

<template>
  <template v-if="performance && concert">
    <div class="flex items-center gap-3">
      <div class="size-14 shrink-0 overflow-hidden rounded-[14px] bg-surface">
        <img
          v-if="performance.artistImage && !imgFailed"
          :src="performance.artistImage"
          alt=""
          class="size-full object-cover"
          @error="imgFailed = true"
        >
        <div v-else class="flex size-full items-center justify-center">
          <span class="font-heading text-xl font-bold text-text-secondary">
            {{ artist.charAt(0).toUpperCase() }}
          </span>
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-1.5">
        <h2 class="truncate font-heading text-[22px] font-bold text-text">{{ artist }}</h2>
        <div class="flex items-center gap-2">
          <span
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            :style="{ background: vars['--stage-chip'], color: vars['--stage'] }"
          >
            <span class="size-1.5 rounded-full" :style="{ background: vars['--stage'] }" />
            {{ stage?.name ?? performance.stageId }}
          </span>
          <span
            v-if="role === 'backburner'"
            class="flex items-center gap-1 rounded-full bg-warning/12 px-2.5 py-1 text-[11px] font-medium text-warning"
          >
            <UIcon name="i-lucide-flame" class="size-3" />
            Backburner
          </span>
        </div>
      </div>
    </div>

    <p class="text-sm text-text-secondary">{{ timeLine }}</p>

    <div class="flex flex-col gap-2.5">
      <!-- backburner: make my pick + notify toggle -->
      <template v-if="role === 'backburner'">
        <button
          type="button"
          class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
          @click="onMakePick"
        >
          {{ COPY.makePickAction }}
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-[28px] bg-surface px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border"
          @click="onNotifyToggle"
        >
          <UIcon :name="pick?.notifyOptIn ? 'i-lucide-bell-off' : 'i-lucide-bell-plus'" class="size-[17px]" />
          {{ pick?.notifyOptIn ? COPY.notifyOptOutAction : COPY.notifyOptInAction }}
        </button>
      </template>

      <!-- other / skipped: watch this -->
      <button
        v-if="role === 'other'"
        type="button"
        class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
        @click="onWatchThis"
      >
        {{ COPY.watchThisAction }}
      </button>

      <!-- picked roles: edit + skip -->
      <template v-if="role !== 'other'">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-[28px] bg-surface px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border"
          @click="emit('edit')"
        >
          <UIcon name="i-lucide-pencil" class="size-4" />
          {{ COPY.editAction }}
        </button>
        <button
          type="button"
          class="w-full px-6 py-3 text-[15px] font-semibold text-danger"
          @click="onSkip"
        >
          {{ COPY.skipAction }}
        </button>
      </template>
    </div>
  </template>
</template>
