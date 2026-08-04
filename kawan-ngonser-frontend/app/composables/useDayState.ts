import { deriveDayState, type DayState } from '~/domain/dayState'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

/** Reactive day-state for a planned concert (ticks with the app clock). */
export function useDayState(eventId: MaybeRefOrGetter<string>): ComputedRef<DayState | null> {
  const cache = useConcertCacheStore()
  const planStore = usePlanStore()
  const schedule = useEffectiveSchedule(eventId)
  const now = useNow()

  return computed(() => {
    const id = toValue(eventId)
    const concert = cache.getConcert(id)
    const plan = planStore.getPlan(id)
    if (!concert || !plan || !schedule.value) return null
    return deriveDayState({
      concert,
      settings: plan.settings,
      picks: plan.picks,
      schedule: schedule.value,
      nowMs: now.value,
    })
  })
}
