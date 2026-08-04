import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledNotification } from '~/domain/notifications'
import { createNotificationScheduler, type SchedulerDeps } from '~/services/notificationScheduler'

const T0 = Date.UTC(2026, 7, 7, 11, 0) // arbitrary anchor

function notif(id: string, fireAtMs: number, startMs: number): ScheduledNotification {
  return {
    id: `fest:${id}:${startMs}`,
    eventId: 'fest',
    kind: 'performance',
    fireAtMs,
    startMs,
    artist: id.toUpperCase(),
    stage: 'Main',
  }
}

describe('createNotificationScheduler', () => {
  let delivered: string[]
  let savedLedgers: string[][]
  let scheduled: ScheduledNotification[]
  let initialLedger: string[]

  function makeDeps(overrides: Partial<SchedulerDeps> = {}): SchedulerDeps {
    return {
      getSnapshot: () => ({ scheduled, templates: [] }),
      loadLedger: async () => initialLedger,
      saveLedger: (ids) => { savedLedgers.push(ids) },
      deliver: (n, rendered) => { delivered.push(`${n.id}|${rendered.title}`) },
      now: () => Date.now(),
      random: () => 0,
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] })
    vi.setSystemTime(T0)
    delivered = []
    savedLedgers = []
    initialLedger = []
    scheduled = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('arms a timeout and fires exactly at fireAt', async () => {
    scheduled = [notif('a', T0 + 10 * 60_000, T0 + 25 * 60_000)]
    const s = createNotificationScheduler(makeDeps())
    await s.init()
    expect(delivered).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(10 * 60_000 + 500)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toContain('fest:a:')
    // real minutes remaining rendered at fire time (fallback template)
    expect(delivered[0]).toContain('15 mins')
    s.stop()
  })

  it('never fires the same id twice across checks', async () => {
    scheduled = [notif('a', T0 + 60_000, T0 + 20 * 60_000)]
    const s = createNotificationScheduler(makeDeps())
    await s.init()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    s.check()
    s.check()
    expect(delivered).toHaveLength(1)
    s.stop()
  })

  it('catches up late (start not yet passed) and expires missed ones', async () => {
    scheduled = [
      notif('late', T0 - 5 * 60_000, T0 + 3 * 60_000), // fireAt passed, start ahead → fire now
      notif('gone', T0 - 60 * 60_000, T0 - 30 * 60_000), // start passed → expire silently
    ]
    const s = createNotificationScheduler(makeDeps())
    await s.init()
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toContain('fest:late:')
    expect(savedLedgers.at(-1)).toContain(`fest:gone:${T0 - 30 * 60_000}`)
    s.stop()
  })

  it('respects a persisted ledger on init', async () => {
    const n = notif('a', T0 - 60_000, T0 + 10 * 60_000)
    scheduled = [n]
    initialLedger = [n.id]
    const s = createNotificationScheduler(makeDeps())
    await s.init()
    expect(delivered).toHaveLength(0)
    s.stop()
  })

  it('re-arms when the snapshot changes (lead-time edit moves fireAt)', async () => {
    scheduled = [notif('a', T0 + 30 * 60_000, T0 + 45 * 60_000)]
    const s = createNotificationScheduler(makeDeps())
    await s.init()

    // S-2 change: lead time grows → fires earlier
    scheduled = [notif('a', T0 + 5 * 60_000, T0 + 45 * 60_000)]
    s.check()
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 500)
    expect(delivered).toHaveLength(1)
    s.stop()
  })

  it('the safety-net interval catches drift', async () => {
    const s = createNotificationScheduler(makeDeps({ safetyIntervalMs: 30_000 }))
    await s.init()
    scheduled = [notif('a', T0 + 15_000, T0 + 20 * 60_000)]
    // no check() call — only the interval sees the new snapshot
    await vi.advanceTimersByTimeAsync(31_000)
    expect(delivered).toHaveLength(1)
    s.stop()
  })
})
