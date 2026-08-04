<script setup lang="ts">
/**
 * Concert-day home (§7): fixed sync advisory + F-2 banners on top, then the
 * rearrangeable widget board in the user's order. Also renders the W-5/C22
 * `preview` mode for another day (no now-marker/banners, absolute times,
 * plan editing still active).
 */
import type { EffectivePerformance, WidgetId } from '~/domain/types'
import { useConcertCacheStore } from '~/stores/concertCache'

const props = defineProps<{
  eventId: string
  dayIndex: number
  mode: 'today' | 'preview'
}>()

const cache = useConcertCacheStore()
const plan = usePlan(() => props.eventId)
const dayState = useDayState(() => props.eventId)
const now = useNow()

const concert = computed(() => cache.getConcert(props.eventId))

// -- widget data -----------------------------------------------------------
const dayPerfs = computed<EffectivePerformance[]>(() =>
  (plan.schedule.value?.performances ?? []).filter(p => p.dayIndex === props.dayIndex))

/** today → upcoming lists from dayState; preview → the whole viewed day */
const lists = computed(() => {
  if (props.mode === 'today' && dayState.value) {
    return {
      upNext: dayState.value.upNext,
      backburner: dayState.value.upcomingBackburner,
      other: dayState.value.upcomingOther,
    }
  }
  const picks = plan.picks.value
  return {
    upNext: dayPerfs.value.filter(p => picks[p.performanceId]?.status === 'preferred'),
    backburner: dayPerfs.value.filter(p => picks[p.performanceId]?.status === 'backburner'),
    other: dayPerfs.value.filter(p => !picks[p.performanceId] || picks[p.performanceId]!.status === 'skipped'),
  }
})

const nextDays = computed(() => {
  const attending = plan.settings.value?.attendingDayIndexes ?? []
  return attending.filter(d => d > props.dayIndex)
})

const widgetOrder = computed<WidgetId[]>(() =>
  plan.settings.value?.widgetOrder ?? ['upNext', 'timetable', 'backburner', 'other', 'nextDays'])

// -- conflict prompts (sync revalidation + W-4 watch-this + sheet actions) --
const conflicts = useConflictQueue()

function onResolve(groupIds: string[], winnerId: string) {
  plan.resolveConflict(groupIds, winnerId)
  conflicts.shift()
}

// -- sheets ----------------------------------------------------------------
const sheets = useSheets()

function openPerformance(performanceId: string) {
  sheets.open({ kind: 'performance', eventId: props.eventId, performanceId })
}

function openCustomEvent(customEventId: string) {
  sheets.open({ kind: 'customEvent', eventId: props.eventId, customEventId })
}

function addCustomEvent(prefillMs: number) {
  sheets.open({ kind: 'customEvent', eventId: props.eventId, customEventId: null, prefillStartMs: prefillMs })
}
</script>

<template>
  <main v-if="concert" class="flex flex-1 flex-col gap-4 px-5 pb-7 pt-2">
    <ConcertDayPreviewBar
      v-if="mode === 'preview'"
      :day-index="dayIndex"
      :date="concert.days.find(d => d.dayIndex === dayIndex)?.date ?? ''"
      :timezone="concert.timezone"
    />

    <ConcertDayHeader :concert="concert" :day-index="dayIndex" :mode="mode" />

    <!-- fixed, non-rearrangeable (F-1 / F-2) -->
    <template v-if="mode === 'today'">
      <ConcertDaySyncAdvisory
        :event-id="eventId"
        @conflicts="prompts => conflicts.push(prompts)"
      />
      <ConcertDayWrapBanner
        v-if="dayState?.concertComplete"
        variant="concert"
        :event-id="eventId"
      />
      <ConcertDayWrapBanner
        v-else-if="dayState?.dayComplete"
        variant="day"
        :next-day-index="dayState?.nextAttendingDayIndex"
        :event-id="eventId"
      />
    </template>

    <!-- rearrangeable board (S-1 order) -->
    <template v-for="widget in widgetOrder" :key="widget">
      <ConcertDayWidgetsUpNextWidget
        v-if="widget === 'upNext'"
        :concert="concert"
        :up-next="lists.upNext"
        :next-day-index="dayState?.nextAttendingDayIndex ?? null"
        @select="openPerformance"
      />
      <ConcertDayWidgetsTimetableWidget
        v-else-if="widget === 'timetable'"
        :concert="concert"
        :day-index="dayIndex"
        :mode="mode"
        @select-performance="openPerformance"
        @select-custom="openCustomEvent"
        @add-event="addCustomEvent"
      />
      <ConcertDayWidgetsBackburnerWidget
        v-else-if="widget === 'backburner'"
        :concert="concert"
        :performances="lists.backburner"
        @select="openPerformance"
      />
      <ConcertDayWidgetsOtherPerformancesWidget
        v-else-if="widget === 'other'"
        :concert="concert"
        :performances="lists.other"
        @select="openPerformance"
      />
      <ConcertDayWidgetsNextDaysWidget
        v-else-if="widget === 'nextDays'"
        :concert="concert"
        :day-indexes="nextDays"
        :picks="plan.picks.value"
      />
    </template>

    <ChromeInstallReminder />

    <ConcertDaySheetHost />

    <OnboardingConflictSheet
      :concert="concert"
      :performances="plan.schedule.value?.performances ?? []"
      :prompts="conflicts.queue.value"
      @resolve="onResolve"
    />
  </main>
</template>
