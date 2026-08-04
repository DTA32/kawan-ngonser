/**
 * The effective schedule: override-applied performances merged with custom
 * events into one sorted per-day structure — the single source every widget,
 * the timetable, day-state, and the notification builder read from.
 *
 * Day windows extend PAST MIDNIGHT: a 23:15→00:15 set belongs to its
 * dayIndex (confirmed in the real payload), so a day's window is
 * [venue midnight of its date, max(end of its entries, next venue midnight)].
 */
import { startOfVenueDay } from './time'
import { applyOverrides } from './overrides'
import type {
  Concert,
  CustomEvent,
  EffectivePerformance,
  EffectiveSchedule,
  OverrideMap,
  ScheduleEntry,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function buildEffectiveSchedule(
  concert: Concert,
  overrides: OverrideMap,
  customEvents: CustomEvent[],
): EffectiveSchedule {
  const performances = applyOverrides(concert.performances, overrides)

  // Calendar starts per day (windows finalized after entries are placed)
  const dayStarts = new Map<number, number>()
  for (const d of concert.days)
    dayStarts.set(d.dayIndex, startOfVenueDay(d.date, concert.timezone))

  const byDay = new Map<number, ScheduleEntry[]>()
  for (const d of concert.days) byDay.set(d.dayIndex, [])

  for (const p of performances) {
    byDay.get(p.dayIndex)?.push({
      kind: 'performance',
      startMs: p.startMs,
      endMs: p.endMs,
      dayIndex: p.dayIndex,
      performance: p,
    })
  }

  // Provisional windows from performances (custom events assigned next)
  const windowEnd = new Map<number, number>()
  for (const [dayIndex, entries] of byDay) {
    const start = dayStarts.get(dayIndex) ?? 0
    const maxEnd = entries.reduce((m, e) => Math.max(m, e.endMs), start)
    windowEnd.set(dayIndex, Math.max(maxEnd, start + DAY_MS))
  }

  // A custom event lands on the LAST day whose window contains its start —
  // 23:50 during a spilling day 1 stays on day 1; 00:30 lands on day 2.
  for (const e of customEvents) {
    let target: number | null = null
    for (const d of concert.days) {
      const start = dayStarts.get(d.dayIndex)!
      if (e.startMs >= start && e.startMs < windowEnd.get(d.dayIndex)!)
        target = d.dayIndex
    }
    target ??= concert.days[0]?.dayIndex ?? 1
    byDay.get(target)?.push({
      kind: 'custom',
      startMs: e.startMs,
      endMs: e.endMs ?? e.startMs + 30 * 60_000, // default 30-min block for layout
      dayIndex: target,
      event: e,
    })
  }

  const dayWindows = new Map<number, [number, number]>()
  for (const [dayIndex, entries] of byDay) {
    entries.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
    const start = dayStarts.get(dayIndex) ?? 0
    const maxEnd = entries.reduce((m, e) => Math.max(m, e.endMs), start)
    dayWindows.set(dayIndex, [start, Math.max(maxEnd, start + DAY_MS)])
  }

  return { byDay, performances, dayWindows }
}
