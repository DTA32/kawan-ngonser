/**
 * N-1..N-3 scheduling math — pure. One entry per preferred pick, opted-in
 * backburner, and custom event, firing [lead time] minutes before start.
 * Ids embed the start time, so a time edit naturally invalidates the fired
 * ledger for that entry. Delivery (timers, SW, permissions) lives in
 * services/notificationScheduler.
 */
import { minutesUntil } from './time'
import { interpolate } from '~/utils/copy'
import type {
  Concert,
  EffectiveSchedule,
  NotificationTemplate,
  PickMap,
} from './types'

export interface ScheduledNotification {
  /** `${eventId}:${entryId}:${startMs}` — stable per (entry, time) */
  id: string
  eventId: string
  kind: 'performance' | 'custom_event'
  fireAtMs: number
  startMs: number
  /** {artist}/{stage} or {event} template context */
  artist?: string
  stage?: string
  event?: string
}

export function buildNotificationSchedule(input: {
  concert: Concert
  schedule: EffectiveSchedule
  picks: PickMap
  leadTimeMin: number
}): ScheduledNotification[] {
  const { concert, schedule, picks, leadTimeMin } = input
  const leadMs = leadTimeMin * 60_000
  const stageName = new Map(concert.stages.map(s => [s.stageId, s.name]))
  const out: ScheduledNotification[] = []

  for (const entries of schedule.byDay.values()) {
    for (const e of entries) {
      if (e.kind === 'performance') {
        const pick = picks[e.performance.performanceId]
        const wanted = pick?.status === 'preferred'
          || (pick?.status === 'backburner' && pick.notifyOptIn)
        if (!wanted) continue
        out.push({
          id: `${concert.eventId}:${e.performance.performanceId}:${e.startMs}`,
          eventId: concert.eventId,
          kind: 'performance',
          fireAtMs: e.startMs - leadMs,
          startMs: e.startMs,
          artist: e.performance.artistName,
          stage: stageName.get(e.performance.stageId) ?? e.performance.stageId,
        })
      }
      else {
        out.push({
          id: `${concert.eventId}:${e.event.customEventId}:${e.startMs}`,
          eventId: concert.eventId,
          kind: 'custom_event',
          fireAtMs: e.startMs - leadMs,
          startMs: e.startMs,
          event: e.event.name,
        })
      }
    }
  }
  return out.sort((a, b) => a.fireAtMs - b.fireAtMs)
}

/**
 * Which notifications should fire now? Fire while fireAt ≤ now < start
 * (late fires recompute the real {x} minutes); entries whose start passed
 * are expired — recorded, never fired.
 */
export function dueNotifications(
  scheduled: ScheduledNotification[],
  firedIds: ReadonlySet<string>,
  nowMs: number,
): { fire: ScheduledNotification[], expired: ScheduledNotification[] } {
  const fire: ScheduledNotification[] = []
  const expired: ScheduledNotification[] = []
  for (const n of scheduled) {
    if (firedIds.has(n.id)) continue
    if (n.startMs <= nowMs) expired.push(n)
    else if (n.fireAtMs <= nowMs) fire.push(n)
  }
  return { fire, expired }
}

/** Next arm target: earliest unfired fireAt in the future. */
export function nextFireAt(
  scheduled: ScheduledNotification[],
  firedIds: ReadonlySet<string>,
  nowMs: number,
): number | null {
  let next: number | null = null
  for (const n of scheduled) {
    if (firedIds.has(n.id) || n.fireAtMs <= nowMs) continue
    if (next === null || n.fireAtMs < next) next = n.fireAtMs
  }
  return next
}

/**
 * C15/C16: pick one template from the matching pool (randomness injected for
 * testability) and fill {artist}/{stage}/{event}/{x} with the REAL minutes
 * remaining at fire time.
 */
export function renderNotification(
  templates: NotificationTemplate[],
  n: ScheduledNotification,
  nowMs: number,
  random: number,
): { title: string, body: string } {
  const pool = templates.filter(t => t.type === n.kind)
  const fallback: NotificationTemplate = n.kind === 'performance'
    ? { type: 'performance', title: '{artist} is performing in {x} mins', body: 'Head to {stage} and prepare to enjoy' }
    : { type: 'custom_event', title: '{event} in {x} mins', body: 'You planned this — don\'t bail on yourself.' }
  const template = pool.length > 0
    ? pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]!
    : fallback
  const vars = {
    artist: n.artist ?? '',
    stage: n.stage ?? '',
    event: n.event ?? '',
    x: minutesUntil(n.startMs, nowMs),
  }
  return {
    title: interpolate(template.title, vars),
    body: interpolate(template.body, vars),
  }
}
