/**
 * H-5: a planned day that has ended is relive-only — look back, don't rewrite.
 *
 * Derived from the day itself rather than passed down as a flag, so it can't be
 * lost by a sheet opened from somewhere nobody remembered to gate. Board chrome
 * and sheet actions read the same `isPastDay` predicate `dayPhaseOf` uses, so
 * they can never disagree.
 */
import { isPastDay } from '~/domain/dayState'

export function useDayEditable(
  eventId: MaybeRefOrGetter<string>,
  dayIndex: MaybeRefOrGetter<number | null | undefined>,
): ComputedRef<boolean> {
  const plan = usePlan(() => toValue(eventId))
  const now = useNow()

  return computed(() => {
    const schedule = plan.schedule.value
    const day = toValue(dayIndex)
    if (!schedule || day === null || day === undefined) return true
    return !isPastDay(schedule, day, now.value)
  })
}
