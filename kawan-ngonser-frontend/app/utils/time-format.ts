/**
 * UI-layer date/label formatting on top of domain/time (which owns epoch⇄zone
 * conversion). Venue timezone in, display strings out.
 */
import { DateTime } from 'luxon'
import type { ConcertDay } from '~/domain/types'

/** "Sat · 8 Aug 2026" / "Sat & Sun · 8–9 Aug 2026" / "Fri–Sun · 7–9 Aug 2026" */
export function formatDaysLabel(days: ConcertDay[], tz: string): string {
  if (days.length === 0) return ''
  const dts = [...days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map(d => DateTime.fromISO(d.date, { zone: tz }))
  const first = dts[0]!
  const last = dts[dts.length - 1]!

  if (dts.length === 1)
    return `${first.toFormat('ccc')} · ${first.toFormat('d LLL yyyy')}`

  const sameMonth = first.month === last.month && first.year === last.year
  const weekdays = dts.length === 2
    ? `${first.toFormat('ccc')} & ${last.toFormat('ccc')}`
    : `${first.toFormat('ccc')}–${last.toFormat('ccc')}`
  const dates = sameMonth
    ? `${first.toFormat('d')}–${last.toFormat('d LLL yyyy')}`
    : `${first.toFormat('d LLL')} – ${last.toFormat('d LLL yyyy')}`
  return `${weekdays} · ${dates}`
}

/** "Day 2 · Sun 9 Aug" — proper title case (no blunt lowercasing). */
export function formatDayTitle(dayIndex: number, date: string, tz: string): string {
  const dt = DateTime.fromISO(date, { zone: tz })
  return dt.isValid ? `Day ${dayIndex} · ${dt.toFormat('ccc d LLL')}` : `Day ${dayIndex}`
}

/** "Music festival · 3 days · 7 stages" */
export function formatTagline(dayCount: number, stageCount: number): string {
  const days = dayCount === 1 ? '1 day' : `${dayCount} days`
  const stages = stageCount === 1 ? '1 stage' : `${stageCount} stages`
  return `Music festival · ${days} · ${stages}`
}
