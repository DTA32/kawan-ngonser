/**
 * N-4 delivery shell around the pure scheduling math. Framework-free —
 * dependencies (snapshot source, ledger persistence, delivery, clock,
 * randomness) are injected, so plugins/scheduler.client.ts wires Nuxt in and
 * tests wire fakes in.
 *
 * Strategy (the web cannot fire with the app fully closed — see plan):
 * one setTimeout armed for the next fireAt, a 30s safety-net interval, and
 * catch-up checks on init/visibility. The fired ledger persists so reloads
 * never double-fire; expired entries (start already passed) are recorded,
 * never fired.
 */
import {
  dueNotifications,
  nextFireAt,
  renderNotification,
  type ScheduledNotification,
} from '~/domain/notifications'
import type { NotificationTemplate } from '~/domain/types'

export interface SchedulerSnapshot {
  scheduled: ScheduledNotification[]
  templates: NotificationTemplate[]
}

export interface SchedulerDeps {
  getSnapshot: () => SchedulerSnapshot
  loadLedger: () => Promise<string[]>
  saveLedger: (ids: string[]) => void
  deliver: (n: ScheduledNotification, rendered: { title: string, body: string }) => void | Promise<void>
  now: () => number
  random: () => number
  safetyIntervalMs?: number
}

const LEDGER_RETENTION_MS = 24 * 60 * 60 * 1000
const MAX_TIMEOUT_MS = 2 ** 31 - 1

export interface NotificationScheduler {
  init: () => Promise<void>
  /** Re-run after any plan/config change or on visibility/reconnect events */
  check: () => void
  stop: () => void
}

export function createNotificationScheduler(deps: SchedulerDeps): NotificationScheduler {
  let ledger = new Set<string>()
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function startMsOf(id: string): number {
    return Number(id.split(':').pop()) || 0
  }

  function pruneLedger(now: number): void {
    for (const id of ledger) {
      if (startMsOf(id) < now - LEDGER_RETENTION_MS) ledger.delete(id)
    }
  }

  function check(): void {
    const now = deps.now()
    const { scheduled, templates } = deps.getSnapshot()
    const { fire, expired } = dueNotifications(scheduled, ledger, now)

    for (const n of fire) {
      ledger.add(n.id)
      void deps.deliver(n, renderNotification(templates, n, now, deps.random()))
    }
    for (const n of expired) ledger.add(n.id)

    if (fire.length > 0 || expired.length > 0) {
      pruneLedger(now)
      deps.saveLedger([...ledger])
    }
    armNext(scheduled, now)
  }

  function armNext(scheduled: ScheduledNotification[], now: number): void {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = null
    const next = nextFireAt(scheduled, ledger, now)
    if (next !== null) {
      const delay = Math.min(Math.max(0, next - now) + 250, MAX_TIMEOUT_MS)
      timeoutId = setTimeout(check, delay)
    }
  }

  return {
    async init() {
      ledger = new Set(await deps.loadLedger())
      check()
      intervalId = setInterval(check, deps.safetyIntervalMs ?? 30_000)
    },
    check,
    stop() {
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (intervalId !== null) clearInterval(intervalId)
      timeoutId = null
      intervalId = null
    },
  }
}
