// @vitest-environment node
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { KawanDB, getDB, setDB } from '~/db/schema'
import { commitSync } from '~/services/syncService'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'
import { miniConcert, miniDraftPayload } from '../fixtures/mini'

/** Draft-shape payload matching miniConcert but with performance `a` gone. */
const nextPayload = {
  ...miniDraftPayload,
  version: 2,
  days: miniConcert.days.map(d => ({ index: d.dayIndex, date: d.date })),
  stages: miniConcert.stages.map(s => ({ id: s.stageId, name: s.name, color: s.color })),
  performances: miniConcert.performances
    .filter(p => p.performanceId !== 'a')
    .map(p => ({
      id: p.performanceId,
      artistName: p.artistName,
      artistImage: p.artistImage,
      dayIndex: p.dayIndex,
      stageId: p.stageId,
      start: p.startMs,
      end: p.endMs,
    })),
}

describe('commitSync — atomic Dexie commit + rehydration', () => {
  let db: KawanDB

  beforeEach(async () => {
    setActivePinia(createPinia())
    db = new KawanDB(`test-${Math.random().toString(36).slice(2)}`)
    setDB(db)

    // Seed: cached concert v1 + a plan with picks and an override
    await db.local_concert_cache.put({
      event_id: miniConcert.eventId,
      version: 1,
      source: 'server',
      payload: {},
      normalized: miniConcert,
      fetched_at: 0,
    })
    await db.local_plans.put({
      event_id: miniConcert.eventId,
      attending_day_indexes: [1, 2],
      conflict_display_pref: 'equal',
      widget_order: ['upNext', 'timetable', 'backburner', 'other', 'nextDays'],
      lead_time_override_min: 10,
    })
    await db.local_picks.bulkPut([
      { event_id: miniConcert.eventId, performance_id: 'a', status: 'preferred', notify_opt_in: false },
      { event_id: miniConcert.eventId, performance_id: 'b', status: 'backburner', notify_opt_in: true },
    ])
    await db.local_performance_overrides.put({
      event_id: miniConcert.eventId,
      performance_id: 'c',
      new_start_time: 1,
      new_end_time: 2,
      removed: false,
    })
    await db.local_custom_events.put({
      custom_event_id: 'ce1',
      event_id: miniConcert.eventId,
      name: 'Lunch',
      start_time: 100,
      end_time: null,
    })

    // Hydrate stores from the seeded DB
    const [cacheRows, planRows, pickRows, eventRows, overrideRows] = await Promise.all([
      db.local_concert_cache.toArray(),
      db.local_plans.toArray(),
      db.local_picks.toArray(),
      db.local_custom_events.toArray(),
      db.local_performance_overrides.toArray(),
    ])
    useConcertCacheStore().hydrate(cacheRows)
    usePlanStore().hydrate(planRows, pickRows, eventRows, overrideRows)
  })

  it('replaces cache, revalidates picks, wipes overrides, keeps custom events', async () => {
    const outcome = await commitSync(miniConcert.eventId, nextPayload, 'server', 999)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.version).toBe(2)
    expect(outcome.report.droppedPerformanceIds).toEqual(['a'])
    expect(outcome.report.promotedPerformanceIds).toEqual(['b'])

    // DB state
    const cacheRow = await db.local_concert_cache.get(miniConcert.eventId)
    expect(cacheRow!.version).toBe(2)
    const picks = await db.local_picks.where('event_id').equals(miniConcert.eventId).toArray()
    expect(picks.map(p => [p.performance_id, p.status]).sort()).toEqual([['b', 'preferred']])
    expect(await db.local_performance_overrides.count()).toBe(0)
    expect(await db.local_custom_events.count()).toBe(1) // custom events survive

    // Settings preserved
    const planRow = await db.local_plans.get(miniConcert.eventId)
    expect(planRow!.lead_time_override_min).toBe(10)
    expect(planRow!.conflict_display_pref).toBe('equal')

    // Stores rehydrated
    const planStore = usePlanStore()
    expect(planStore.getPlan(miniConcert.eventId)!.picks.b!.status).toBe('preferred')
    expect(planStore.hasLocalEdits(miniConcert.eventId)).toBe(false)
    expect(useConcertCacheStore().getRow(miniConcert.eventId)!.version).toBe(2)
  })

  it('rejects a payload whose id does not match', async () => {
    const outcome = await commitSync(miniConcert.eventId, { ...nextPayload, id: 'other-fest' }, 'server', 999)
    expect(outcome).toEqual({ ok: false, reason: 'invalid' })
    expect((await db.local_concert_cache.get(miniConcert.eventId))!.version).toBe(1)
  })

  it('leaves everything untouched on an invalid payload', async () => {
    const outcome = await commitSync(miniConcert.eventId, { junk: true }, 'server', 999)
    expect(outcome).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.local_picks.count()).toBe(2)
    expect(await db.local_performance_overrides.count()).toBe(1)
  })
})
