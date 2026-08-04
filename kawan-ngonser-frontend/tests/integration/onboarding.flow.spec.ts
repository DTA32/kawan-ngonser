// @vitest-environment node
/**
 * Full onboarding walk with the REAL wire fixture (exactly what
 * GET /concerts/:id serves): upload → plan → O-1 day selection → O-2 pref →
 * O-3 picks per day → O-4 clash resolution → O-5/day-state → notification
 * schedule → persistence. Drives the same store + domain paths the UI calls.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { KawanDB, setDB } from '~/db/schema'
import { detectUnresolvedConflicts, findConflictGroups } from '~/domain/conflicts'
import { deriveDayState } from '~/domain/dayState'
import { buildNotificationSchedule } from '~/domain/notifications'
import { addPick, resolveConflict } from '~/domain/picks'
import { buildEffectiveSchedule } from '~/domain/schedule'
import { parseVenueTime } from '~/domain/time'
import type { Concert } from '~/domain/types'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

const wireFixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('../fixtures/sounds-project-2026.wire.json', import.meta.url)),
  'utf-8',
))

const EVENT_ID = 'sounds-project-2026'
const TZ = 'Asia/Jakarta'

function t(iso: string): number {
  return parseVenueTime(iso, TZ)!
}

/** Wait for the store's fire-and-forget persistence to settle. */
async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 25))
}

describe('full onboarding flow — wire fixture', () => {
  let db: KawanDB
  let concert: Concert

  beforeEach(() => {
    setActivePinia(createPinia())
    db = new KawanDB(`flow-${Math.random().toString(36).slice(2)}`)
    setDB(db)
    useConcertCacheStore().hydrate([])
    usePlanStore().hydrate([], [], [], [])
  })

  it('walks upload → days → picks → clash → all-set → concert day', async () => {
    // -- H-3 upload (same path as the UploadJsonCard) ----------------------
    const cache = useConcertCacheStore()
    const result = cache.savePayload(wireFixture, 'json_upload', t('2026-08-04T12:00:00'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    concert = result.concert
    expect(concert.performances).toHaveLength(128)
    expect(concert.days.map(d => d.dayIndex)).toEqual([1, 2, 3])

    // -- O-1: attend all three days ----------------------------------------
    const planStore = usePlanStore()
    planStore.ensurePlan(EVENT_ID)
    planStore.selectDays(EVENT_ID, [1, 2, 3])
    // O-2
    planStore.setConflictDisplayPref(EVENT_ID, 'equal')

    // -- O-3 (day 1): pick a REAL overlapping pair + one free set ----------
    const schedule = buildEffectiveSchedule(concert, {}, [])
    const day1 = schedule.performances.filter(p => p.dayIndex === 1)
    const clashGroup = findConflictGroups(day1)[0]
    expect(clashGroup, 'fixture must contain a day-1 clash').toBeDefined()
    const [first, second] = clashGroup!
    const free = day1.find(p => clashGroup!.every(c => c.performanceId !== p.performanceId))!

    let picks = planStore.getPlan(EVENT_ID)!.picks
    for (const id of [first!.performanceId, second!.performanceId, free.performanceId])
      ({ picks } = addPick(picks, schedule.performances, id))
    planStore.setPicks(EVENT_ID, picks)

    // -- O-4: the proceed step surfaces the clash, user answers ------------
    const prompts = detectUnresolvedConflicts(picks, day1)
    expect(prompts.length).toBeGreaterThanOrEqual(1)
    const prompt = prompts[0]!
    expect(prompt.performanceIds).toContain(first!.performanceId)

    const resolved = resolveConflict(picks, prompt.performanceIds, first!.performanceId)
    planStore.setPicks(EVENT_ID, resolved.picks)
    expect(resolved.picks[first!.performanceId]!.status).toBe('preferred')
    expect(resolved.picks[second!.performanceId]!.status).toBe('backburner')
    expect(detectUnresolvedConflicts(resolved.picks, day1)).toEqual([])

    // -- O-5: before the festival → countdown to the first day-1 set -------
    const plan = planStore.getPlan(EVENT_ID)!
    const pre = deriveDayState({
      concert,
      settings: plan.settings,
      picks: plan.picks,
      schedule,
      nowMs: t('2026-08-05T12:00:00'),
    })
    expect(pre.mode).toBe('pre')
    expect(pre.kickoffMs).toBe(day1[0]!.startMs)

    // -- concert day (dev-time-travel preset "Day 1 · 19:02") --------------
    const live = deriveDayState({
      concert,
      settings: plan.settings,
      picks: plan.picks,
      schedule,
      nowMs: t('2026-08-07T19:02:00'),
    })
    expect(live.mode).toBe('concert-day')
    expect(live.todayDayIndex).toBe(1)
    expect(live.nextAttendingDayIndex).toBe(2)
    // upcoming preferred picks appear soonest-first
    const upcoming = live.upNext.map(p => p.performanceId)
    for (const id of upcoming)
      expect(plan.picks[id]!.status).toBe('preferred')

    // -- N-1: notification schedule covers preferred picks -----------------
    const notifs = buildNotificationSchedule({
      concert,
      schedule,
      picks: plan.picks,
      leadTimeMin: 15,
    })
    const preferredCount = Object.values(plan.picks).filter(p => p.status === 'preferred').length
    expect(notifs).toHaveLength(preferredCount)
    for (const n of notifs) expect(n.fireAtMs).toBe(n.startMs - 15 * 60_000)

    // -- TR-4 persistence: everything survives in IndexedDB ----------------
    await settle()
    expect((await db.local_concert_cache.get(EVENT_ID))!.normalized.performances).toHaveLength(128)
    const planRow = await db.local_plans.get(EVENT_ID)
    expect(planRow!.attending_day_indexes).toEqual([1, 2, 3])
    const pickRows = await db.local_picks.where('event_id').equals(EVENT_ID).toArray()
    expect(pickRows).toHaveLength(3)
    expect(pickRows.find(r => r.performance_id === second!.performanceId)!.status).toBe('backburner')
  })

  it('midnight-spill sets stay on their day through the whole pipeline', () => {
    const result = useConcertCacheStore().savePayload(wireFixture, 'json_upload', 0)
    if (!result.ok) throw new Error('parse failed')
    const schedule = buildEffectiveSchedule(result.concert, {}, [])
    const adams = schedule.performances.find(p => p.performanceId === 'tsp-d1-the-adams')!
    expect(adams.dayIndex).toBe(1)
    const [, day1End] = schedule.dayWindows.get(1)!
    expect(day1End).toBeGreaterThanOrEqual(adams.endMs) // 00:15 next calendar day
  })
})
