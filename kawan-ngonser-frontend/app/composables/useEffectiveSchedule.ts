import { buildEffectiveSchedule } from '~/domain/schedule'
import type { EffectiveSchedule } from '~/domain/types'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

/**
 * The single derived schedule (payload + overrides + custom events) every
 * widget, the timetable, and the scheduler read from.
 */
export function useEffectiveSchedule(eventId: MaybeRefOrGetter<string>): ComputedRef<EffectiveSchedule | null> {
  const cache = useConcertCacheStore()
  const planStore = usePlanStore()

  return computed(() => {
    const id = toValue(eventId)
    const concert = cache.getConcert(id)
    if (!concert) return null
    const plan = planStore.getPlan(id)
    return buildEffectiveSchedule(concert, plan?.overrides ?? {}, plan?.customEvents ?? [])
  })
}
