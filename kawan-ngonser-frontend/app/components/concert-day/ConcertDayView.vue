<script setup lang="ts">
/**
 * Concert-day home (§7): fixed sync advisory + F-2 banners on top, then the
 * rearrangeable widget board in the user's order.
 *
 * The same board renders any attending day. `dayPhase` says which side of now
 * it sits on: 'today' is live (now-marker, banners, forward window), 'future'
 * is the W-5/C22 preview (plan editing still active), 'past' is relive-only
 * (H-5) — no forward-looking widgets, dimmed timetable, no editing.
 */
import {
  type DayPhase,
  dayPhaseOf,
  pastAttendingDays,
  upcomingAttendingDays,
  visibleWidgetsFor,
} from '~/domain/dayState'
import { DEFAULT_WIDGET_ORDER, type EffectivePerformance, type WidgetId } from '~/domain/types'
import { useConcertCacheStore } from '~/stores/concertCache'

const props = defineProps<{
  eventId: string
  dayIndex: number
}>()

const cache = useConcertCacheStore()
const plan = usePlan(() => props.eventId)
const dayState = useDayState(() => props.eventId)
const now = useNow()

const concert = computed(() => cache.getConcert(props.eventId))

const dayPhase = computed<DayPhase>(() => {
  const schedule = plan.schedule.value
  if (!schedule) return 'future'
  return dayPhaseOf({
    schedule,
    dayIndex: props.dayIndex,
    todayDayIndex: dayState.value?.todayDayIndex ?? null,
    nowMs: now.value,
  })
})

// -- widget data -----------------------------------------------------------
const dayPerfs = computed<EffectivePerformance[]>(() =>
  (plan.schedule.value?.performances ?? []).filter(p => p.dayIndex === props.dayIndex))

/**
 * today → the time-filtered lists from dayState; future → the whole day grouped
 * by pick status (what you PLANNED); past → nothing, those widgets are hidden.
 */
const lists = computed(() => {
  if (dayPhase.value === 'today' && dayState.value) {
    return {
      upNext: dayState.value.upNext,
      backburner: dayState.value.upcomingBackburner,
      other: dayState.value.upcomingOther,
    }
  }
  if (dayPhase.value === 'past') {
    return { upNext: [], backburner: [], other: [] }
  }
  const picks = plan.picks.value
  return {
    upNext: dayPerfs.value.filter(p => picks[p.performanceId]?.status === 'preferred'),
    backburner: dayPerfs.value.filter(p => picks[p.performanceId]?.status === 'backburner'),
    other: dayPerfs.value.filter(p => !picks[p.performanceId] || picks[p.performanceId]!.status === 'skipped'),
  }
})

/** W-6. Purely time-relative, so a past day's list is simply the whole day. */
const pastPerformances = computed<EffectivePerformance[]>(() => {
  if (dayPhase.value === 'today') return dayState.value?.pastPerformances ?? []
  return dayPerfs.value
    .filter(p => p.endMs <= now.value)
    .sort((a, b) => b.endMs - a.endMs || b.startMs - a.startMs)
})

const dayArgs = computed(() => ({
  schedule: plan.schedule.value,
  attending: plan.settings.value?.attendingDayIndexes ?? [],
  dayIndex: props.dayIndex,
  nowMs: now.value,
}))

const nextDays = computed(() => {
  const { schedule, ...rest } = dayArgs.value
  return schedule ? upcomingAttendingDays({ schedule, ...rest }) : []
})

const pastDays = computed(() => {
  const { schedule, ...rest } = dayArgs.value
  return schedule ? pastAttendingDays({ schedule, ...rest }) : []
})

const widgetOrder = computed<WidgetId[]>(() =>
  plan.settings.value?.widgetOrder ?? DEFAULT_WIDGET_ORDER)

const visibleWidgets = computed<WidgetId[]>(() =>
  visibleWidgetsFor(widgetOrder.value, plan.settings.value?.hiddenWidgets ?? [], dayPhase.value))

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
      v-if="dayPhase !== 'today'"
      :day-index="dayIndex"
      :date="concert.days.find(d => d.dayIndex === dayIndex)?.date ?? ''"
      :timezone="concert.timezone"
      :phase="dayPhase"
    />

    <ConcertDayHeader :concert="concert" :day-index="dayIndex" :phase="dayPhase" />

    <!-- fixed, non-rearrangeable (F-1 / F-2) -->
    <template v-if="dayPhase === 'today'">
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

    <!-- rearrangeable board (S-1 order, minus hidden and phase-irrelevant) -->
    <template v-for="widget in visibleWidgets" :key="widget">
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
        :phase="dayPhase"
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
      <ConcertDayWidgetsPastPerformancesWidget
        v-else-if="widget === 'pastPerformances'"
        :concert="concert"
        :performances="pastPerformances"
        @select="openPerformance"
      />
      <ConcertDayWidgetsNextDaysWidget
        v-else-if="widget === 'nextDays'"
        :concert="concert"
        :day-indexes="nextDays"
        :picks="plan.picks.value"
      />
      <ConcertDayWidgetsPastDaysWidget
        v-else-if="widget === 'pastDays'"
        :concert="concert"
        :day-indexes="pastDays"
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
