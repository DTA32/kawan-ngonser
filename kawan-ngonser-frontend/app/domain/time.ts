/**
 * The Luxon boundary. Everything in domain/ stores epoch ms; this module owns
 * every conversion in and out of the concert's venue timezone.
 */
import { DateTime } from 'luxon'

/**
 * Parse a wire timestamp into epoch ms. Accepts every form the backend or an
 * uploaded JSON might contain:
 *  - Mongo Extended JSON: { $date: "..." } / { $date: 1650000000000 }
 *  - ISO with offset ("2026-08-07T15:30:00+07:00")
 *  - ISO UTC ("2026-08-07T08:30:00Z" / ".000Z")
 *  - naive venue-local ("2026-08-08T19:00:00" — interpreted in `tz`, per §3.1)
 *  - epoch milliseconds (number)
 * Returns null when unparseable.
 */
export function parseVenueTime(value: unknown, tz: string): number | null {
  if (value != null && typeof value === 'object' && '$date' in value)
    return parseVenueTime((value as { $date: unknown }).$date, tz)

  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value !== 'string' || value.length === 0)
    return null

  // setZone keeps an explicit offset/Z when present; a naive string gets the
  // venue zone — exactly the §3.1 "all times are venue-local" rule.
  const dt = DateTime.fromISO(value, { zone: tz, setZone: false })
  return dt.isValid ? dt.toMillis() : null
}

export function venueDateTime(ms: number, tz: string): DateTime {
  return DateTime.fromMillis(ms, { zone: tz })
}

/** "19:05" in venue time. */
export function formatTime(ms: number, tz: string): string {
  return venueDateTime(ms, tz).toFormat('HH:mm')
}

/** "19:05 – 20:00" in venue time. */
export function formatTimeRange(startMs: number, endMs: number, tz: string): string {
  return `${formatTime(startMs, tz)} – ${formatTime(endMs, tz)}`
}

/** "YYYY-MM-DD" of the venue-local calendar day containing `ms`. */
export function venueDateOf(ms: number, tz: string): string {
  return venueDateTime(ms, tz).toFormat('yyyy-MM-dd')
}

/** "SAT 8 AUG" style label for day headers. */
export function formatDayLabel(date: string, tz: string): string {
  const dt = DateTime.fromISO(date, { zone: tz })
  return dt.isValid ? dt.toFormat('ccc d LLL').toUpperCase() : date
}

/** Epoch ms of venue-local midnight starting the given YYYY-MM-DD. */
export function startOfVenueDay(date: string, tz: string): number {
  return DateTime.fromISO(date, { zone: tz }).startOf('day').toMillis()
}

export interface CountdownParts { days: number, hours: number, mins: number }

/** Countdown parts for C10 "{x}d {x}h {x}m" (floored at zero). */
export function countdownParts(deltaMs: number): CountdownParts {
  const total = Math.max(0, Math.floor(deltaMs / 60_000))
  return {
    days: Math.floor(total / (60 * 24)),
    hours: Math.floor((total % (60 * 24)) / 60),
    mins: total % 60,
  }
}

export function formatCountdown(deltaMs: number): string {
  const { days, hours, mins } = countdownParts(deltaMs)
  return `${days}d ${hours}h ${mins}m`
}

/**
 * Relative label for lists and sheets: "now", "in 1 min", "in 58 mins",
 * "in 2h 05m". Past deltas return "started" — for a set that has ENDED use
 * `formatElapsed`, or `formatSetStatus` to pick the right one automatically.
 */
export function formatRelative(deltaMs: number): string {
  if (deltaMs < -60_000) return 'started'
  const mins = Math.round(deltaMs / 60_000)
  if (mins <= 0) return 'now'
  if (mins === 1) return 'in 1 min'
  if (mins < 60) return `in ${mins} mins`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `in ${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * Countdown for a set that is CURRENTLY RUNNING: "1 min left", "15 mins left",
 * "1h 05m left". `formatRelative` only says "started" once a set is under way,
 * which is exactly the ambiguity the live treatment exists to remove.
 */
export function formatRemaining(endMs: number, nowMs: number): string {
  const mins = Math.round((endMs - nowMs) / 60_000)
  if (mins <= 0) return 'ending now'
  if (mins === 1) return '1 min left'
  if (mins < 60) return `${mins} mins left`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${String(m).padStart(2, '0')}m left`
}

/**
 * How long ago a set FINISHED (W-6 past performances): "just ended", "17m ago",
 * "1h 32m ago". The past counterpart to `formatRemaining` — `formatRelative`
 * collapses everything that already happened into "started", which is exactly
 * the ambiguity a recap has to remove. Compact by design: these sit in the same
 * narrow column as the stage chip.
 */
export function formatElapsed(endMs: number, nowMs: number): string {
  const mins = Math.round((nowMs - endMs) / 60_000)
  if (mins <= 0) return 'just ended'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${String(m).padStart(2, '0')}m ago`
}

/**
 * The one time-status label: counts down to a start, counts down to an end
 * while live, counts up once ended. Keeps the three-way choice in a single
 * place instead of re-deriving it in every card, sheet and widget.
 */
export function formatSetStatus(startMs: number, endMs: number, nowMs: number): string {
  if (isLive(startMs, endMs, nowMs)) return formatRemaining(endMs, nowMs)
  if (nowMs >= endMs) return formatElapsed(endMs, nowMs)
  return formatRelative(startMs - nowMs)
}

/** True while `nowMs` is inside [startMs, endMs) — the live window. */
export function isLive(startMs: number, endMs: number, nowMs: number): boolean {
  return nowMs >= startMs && nowMs < endMs
}

/** Whole minutes until a start, floored at zero — feeds the {x} in C15/C16. */
export function minutesUntil(startMs: number, nowMs: number): number {
  return Math.max(0, Math.round((startMs - nowMs) / 60_000))
}
