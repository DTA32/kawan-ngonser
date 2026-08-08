import { describe, expect, it } from 'vitest'
import {
  countdownParts,
  formatCountdown,
  formatElapsed,
  formatRelative,
  formatRemaining,
  formatSetStatus,
  formatTime,
  isLive,
  minutesUntil,
  parseVenueTime,
  startOfVenueDay,
  venueDateOf,
} from '~/domain/time'

const TZ = 'Asia/Jakarta' // UTC+7, no DST

describe('parseVenueTime', () => {
  const expected = Date.UTC(2026, 7, 7, 8, 30) // 15:30 Jakarta == 08:30 UTC

  it('parses offset ISO', () => {
    expect(parseVenueTime('2026-08-07T15:30:00+07:00', TZ)).toBe(expected)
  })

  it('parses Z-suffixed UTC ISO', () => {
    expect(parseVenueTime('2026-08-07T08:30:00Z', TZ)).toBe(expected)
    expect(parseVenueTime('2026-08-07T08:30:00.000Z', TZ)).toBe(expected)
  })

  it('interprets naive strings in the venue zone (§3.1)', () => {
    expect(parseVenueTime('2026-08-07T15:30:00', TZ)).toBe(expected)
  })

  it('unwraps Mongo Extended JSON', () => {
    expect(parseVenueTime({ $date: '2026-08-07T15:30:00+07:00' }, TZ)).toBe(expected)
    expect(parseVenueTime({ $date: expected }, TZ)).toBe(expected)
  })

  it('passes through epoch numbers', () => {
    expect(parseVenueTime(expected, TZ)).toBe(expected)
  })

  it('returns null on garbage', () => {
    expect(parseVenueTime('yesterday', TZ)).toBeNull()
    expect(parseVenueTime('', TZ)).toBeNull()
    expect(parseVenueTime(undefined, TZ)).toBeNull()
    expect(parseVenueTime(Number.NaN, TZ)).toBeNull()
  })
})

describe('venue formatting (device TZ independent)', () => {
  const ms = Date.UTC(2026, 7, 7, 8, 30)

  it('formats wall-clock time in the venue zone', () => {
    expect(formatTime(ms, TZ)).toBe('15:30')
    expect(formatTime(ms, 'UTC')).toBe('08:30')
  })

  it('assigns the venue calendar date', () => {
    // 00:15 Jakarta on the 8th is still the 7th in UTC
    const lateMs = Date.UTC(2026, 7, 7, 17, 15)
    expect(venueDateOf(lateMs, TZ)).toBe('2026-08-08')
    expect(venueDateOf(lateMs, 'UTC')).toBe('2026-08-07')
  })

  it('computes venue midnight', () => {
    expect(startOfVenueDay('2026-08-07', TZ)).toBe(Date.UTC(2026, 7, 6, 17, 0))
  })
})

describe('countdown + relative labels', () => {
  it('splits countdown parts', () => {
    const delta = ((2 * 24 + 3) * 60 + 41) * 60_000
    expect(countdownParts(delta)).toEqual({ days: 2, hours: 3, mins: 41 })
    expect(formatCountdown(delta)).toBe('2d 3h 41m')
  })

  it('floors negative countdowns to zero', () => {
    expect(formatCountdown(-5_000)).toBe('0d 0h 0m')
  })

  it('formats relative labels', () => {
    expect(formatRelative(10_000)).toBe('now')
    expect(formatRelative(60_000)).toBe('in 1 min')
    expect(formatRelative(58 * 60_000)).toBe('in 58 mins')
    expect(formatRelative(148 * 60_000)).toBe('in 2h 28m')
    expect(formatRelative(-2 * 60_000)).toBe('started')
  })

  it('counts up from the end of a finished set', () => {
    const end = 10_000_000
    expect(formatElapsed(end, end + 17 * 60_000)).toBe('17m ago')
    expect(formatElapsed(end, end + 47 * 60_000)).toBe('47m ago')
    expect(formatElapsed(end, end + 92 * 60_000)).toBe('1h 32m ago')
  })

  it('zero-pads the minute remainder, like formatRemaining', () => {
    const end = 10_000_000
    expect(formatElapsed(end, end + 182 * 60_000)).toBe('3h 02m ago')
    expect(formatElapsed(end, end + 60 * 60_000)).toBe('1h 00m ago')
  })

  it('reads "just ended" at and before the boundary', () => {
    const end = 10_000_000
    expect(formatElapsed(end, end)).toBe('just ended')
    expect(formatElapsed(end, end - 60_000)).toBe('just ended')
  })

  it('formatSetStatus picks the right label for each side of now', () => {
    const start = 10_000_000
    const end = start + 60 * 60_000
    expect(formatSetStatus(start, end, start - 58 * 60_000)).toBe('in 58 mins')
    expect(formatSetStatus(start, end, start + 45 * 60_000)).toBe('15 mins left')
    expect(formatSetStatus(start, end, end + 17 * 60_000)).toBe('17m ago')
  })

  it('formatSetStatus never says "started" for a set that has ended', () => {
    const start = 10_000_000
    const end = start + 60 * 60_000
    for (const after of [0, 1, 30, 120, 600]) {
      expect(formatSetStatus(start, end, end + after * 60_000)).not.toBe('started')
    }
  })

  it('computes minutes until', () => {
    expect(minutesUntil(1_000_000, 1_000_000 - 13 * 60_000)).toBe(13)
    expect(minutesUntil(0, 60_000)).toBe(0)
  })

  it('counts down to the end of a running set', () => {
    const end = 10_000_000
    expect(formatRemaining(end, end - 15 * 60_000)).toBe('15 mins left')
    expect(formatRemaining(end, end - 60_000)).toBe('1 min left')
    expect(formatRemaining(end, end - 65 * 60_000)).toBe('1h 05m left')
    expect(formatRemaining(end, end)).toBe('ending now')
    expect(formatRemaining(end, end + 60_000)).toBe('ending now')
  })

  it('brackets the live window as [start, end)', () => {
    expect(isLive(100, 200, 99)).toBe(false)
    expect(isLive(100, 200, 100)).toBe(true)
    expect(isLive(100, 200, 199)).toBe(true)
    expect(isLive(100, 200, 200)).toBe(false)
  })
})
