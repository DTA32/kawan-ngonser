/**
 * The "concert-day home replaces default home" rule (§7): exactly one planned
 * concert with today among its attending days → that concert's day board.
 * Two concerts live on the same date → null (default home, user picks).
 */
import { deriveDayState, type DayState } from '~/domain/dayState'
import { buildEffectiveSchedule } from '~/domain/schedule'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

export interface ActiveConcertDay {
  eventId: string
  dayState: DayState
}

export function useActiveConcertDay(): ComputedRef<ActiveConcertDay | null> {
  const cache = useConcertCacheStore()
  const planStore = usePlanStore()
  const now = useNow()

  return computed(() => {
    const active: ActiveConcertDay[] = []
    for (const eventId of planStore.plannedEventIds) {
      const concert = cache.getConcert(eventId)
      const plan = planStore.getPlan(eventId)
      if (!concert || !plan) continue
      const schedule = buildEffectiveSchedule(concert, plan.overrides, plan.customEvents)
      const dayState = deriveDayState({
        concert,
        settings: plan.settings,
        picks: plan.picks,
        schedule,
        nowMs: now.value,
      })
      if (dayState.mode === 'concert-day') active.push({ eventId, dayState })
    }
    return active.length === 1 ? active[0]! : null
  })
}
