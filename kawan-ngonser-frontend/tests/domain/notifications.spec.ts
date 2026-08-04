import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_CONFIG } from '~/domain/config/defaults'
import {
  buildNotificationSchedule,
  dueNotifications,
  nextFireAt,
  renderNotification,
  type ScheduledNotification,
} from '~/domain/notifications'
import { buildEffectiveSchedule } from '~/domain/schedule'
import type { CustomEvent, PickMap } from '~/domain/types'
import { miniConcert, P, t } from '../fixtures/mini'

function picksOf(entries: Array<[string, 'preferred' | 'backburner' | 'skipped', boolean?]>): PickMap {
  return Object.fromEntries(entries.map(([id, status, opt]) => [
    id,
    { performanceId: id, status, notifyOptIn: opt ?? false },
  ]))
}

const customEvents: CustomEvent[] = [
  { customEventId: 'lunch', name: 'Lunch', startMs: t('2026-08-07T12:30:00'), endMs: null },
]

function build(picks: PickMap, leadTimeMin = 15) {
  return buildNotificationSchedule({
    concert: miniConcert,
    schedule: buildEffectiveSchedule(miniConcert, {}, customEvents),
    picks,
    leadTimeMin,
  })
}

describe('buildNotificationSchedule', () => {
  it('covers preferred picks, opted-in backburners, and custom events only', () => {
    const schedule = build(picksOf([
      ['a', 'preferred'],
      ['b', 'backburner', true], // opted in → included
      ['c', 'backburner'], // silent by default → excluded
      ['d', 'skipped'], // excluded
    ]))
    const ids = schedule.map(n => n.id)
    expect(ids).toContain(`mini-fest-2026:a:${P.a.startMs}`)
    expect(ids).toContain(`mini-fest-2026:b:${P.b.startMs}`)
    expect(ids).toContain(`mini-fest-2026:lunch:${t('2026-08-07T12:30:00')}`)
    expect(ids).toHaveLength(3)
  })

  it('fires [lead time] minutes before start and sorts by fireAt', () => {
    const schedule = build(picksOf([['a', 'preferred']]), 20)
    const a = schedule.find(n => n.artist === 'A')!
    expect(a.fireAtMs).toBe(P.a.startMs - 20 * 60_000)
    const fireAts = schedule.map(n => n.fireAtMs)
    expect([...fireAts].sort((x, y) => x - y)).toEqual(fireAts)
  })

  it('changes the id when a time edit moves the start (ledger invalidation)', () => {
    const moved = buildNotificationSchedule({
      concert: miniConcert,
      schedule: buildEffectiveSchedule(miniConcert, {
        a: { performanceId: 'a', newStartMs: t('2026-08-07T19:30:00'), newEndMs: t('2026-08-07T20:30:00'), removed: false },
      }, []),
      picks: picksOf([['a', 'preferred']]),
      leadTimeMin: 15,
    })
    expect(moved.find(n => n.artist === 'A')!.id)
      .toBe(`mini-fest-2026:a:${t('2026-08-07T19:30:00')}`)
  })
})

describe('dueNotifications / nextFireAt', () => {
  const schedule = build(picksOf([['a', 'preferred'], ['c', 'preferred']]))
  // a fires 18:45 (19:00 start), c fires 20:45 (21:00 start), lunch fires 12:15

  it('fires inside the [fireAt, start) window, late fire included', () => {
    const { fire } = dueNotifications(schedule, new Set(), t('2026-08-07T18:50:00'))
    expect(fire.map(n => n.artist)).toEqual(['A'])
  })

  it('expires entries whose start already passed', () => {
    const { fire, expired } = dueNotifications(schedule, new Set(), t('2026-08-07T19:10:00'))
    expect(fire).toHaveLength(0)
    expect(expired.map(n => n.id)).toContain(`mini-fest-2026:a:${P.a.startMs}`)
    expect(expired.map(n => n.id)).toContain(`mini-fest-2026:lunch:${t('2026-08-07T12:30:00')}`)
  })

  it('never fires the same id twice', () => {
    const fired = new Set([`mini-fest-2026:a:${P.a.startMs}`])
    const { fire } = dueNotifications(schedule, fired, t('2026-08-07T18:50:00'))
    expect(fire).toHaveLength(0)
  })

  it('arms for the earliest unfired future fireAt', () => {
    expect(nextFireAt(schedule, new Set(), t('2026-08-07T13:00:00')))
      .toBe(P.a.startMs - 15 * 60_000)
    expect(nextFireAt(schedule, new Set(), t('2026-08-07T23:00:00'))).toBeNull()
  })
})

describe('renderNotification (C15/C16)', () => {
  const n: ScheduledNotification = {
    id: 'x:a:1',
    eventId: 'x',
    kind: 'performance',
    fireAtMs: 0,
    startMs: 13 * 60_000,
    artist: 'Tulus',
    stage: 'Sounds Stage',
  }

  it('fills the template with real minutes remaining at fire time', () => {
    const { title, body } = renderNotification(
      DEFAULT_APP_CONFIG.notificationTemplates,
      n,
      0, // now → 13 minutes before start
      0, // first template in the pool
    )
    expect(title).toBe('Tulus in 13 mins')
    expect(body).toBe('Head to Sounds Stage and grab your spot 🙌')
  })

  it('selects deterministically from the pool via injected randomness', () => {
    const last = renderNotification(DEFAULT_APP_CONFIG.notificationTemplates, n, 0, 0.999)
    expect(last.title).toBe('Incoming: Tulus 🎤')
  })

  it('renders custom events from the C16 pool', () => {
    const custom: ScheduledNotification = {
      id: 'x:e:1',
      eventId: 'x',
      kind: 'custom_event',
      fireAtMs: 0,
      startMs: 10 * 60_000,
      event: 'Lunch',
    }
    const { title } = renderNotification(DEFAULT_APP_CONFIG.notificationTemplates, custom, 0, 0)
    expect(title).toBe('Lunch in 10 mins')
  })

  it('falls back to built-in copy when the pool is empty', () => {
    const { title } = renderNotification([], n, 0, 0.5)
    expect(title).toBe('Tulus is performing in 13 mins')
  })
})
