// @vitest-environment node
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { KawanDB, setDB } from '~/db/schema'
import { readiness } from '~/domain/builds'
import { useBuildsStore } from '~/stores/builds'
import { useConcertCacheStore } from '~/stores/concertCache'
import { miniConcert } from '../fixtures/mini'

const TZ = 'Asia/Jakarta'

/** Dexie writes are fire-and-forget through `persist` — let them land. */
const flush = () => new Promise(r => setTimeout(r, 0))

describe('builds store ↔ local_concert_builds', () => {
  let db: KawanDB

  beforeEach(() => {
    setActivePinia(createPinia())
    db = new KawanDB(`test-${Math.random().toString(36).slice(2)}`)
    setDB(db)
    useBuildsStore().hydrate([])
    useConcertCacheStore().hydrate([])
  })

  it('opens at version 2 with the builds table available', async () => {
    await db.open()
    expect(db.verno).toBe(2)
    expect(await db.local_concert_builds.count()).toBe(0)
  })

  it('persists a build and reads it back through hydrate', async () => {
    const builds = useBuildsStore()
    const created = builds.create(1000, TZ)
    builds.updateMeta(created.buildId, { name: 'Bandung Berisik' }, 2000)
    builds.addDay(created.buildId, '2026-08-08', 3000)
    const stageId = builds.addStage(created.buildId, 'Main Stage', '#E85D75', 4000)
    builds.addPerformance(created.buildId, {
      artistName: 'Feast',
      artistImage: '',
      dayIndex: 1,
      stageId,
      start: '2026-08-08T19:00:00',
      end: '2026-08-08T20:00:00',
    }, 5000)
    await flush()

    const rows = await db.local_concert_builds.toArray()
    expect(rows).toHaveLength(1)
    // rows are the snake_case Mongo shape (§3.5)
    expect(rows[0]!.performances[0]).toMatchObject({
      artist_name: 'Feast',
      day_index: 1,
      start_time: '2026-08-08T19:00:00',
    })

    // a cold boot reconstructs the same canonical build
    const fresh = useBuildsStore()
    fresh.hydrate(rows)
    const reloaded = fresh.getBuild(created.buildId)!
    expect(reloaded.name).toBe('Bandung Berisik')
    expect(reloaded.performances[0]!.artistName).toBe('Feast')
    expect(readiness(reloaded).ready).toBe(true)
  })

  it('bumps version and updatedAt on every edit (B-9 autosave)', () => {
    const builds = useBuildsStore()
    const created = builds.create(1000, TZ)
    expect(created.version).toBe(1)

    builds.updateMeta(created.buildId, { name: 'One' }, 2000)
    expect(builds.getBuild(created.buildId)!.version).toBe(2)

    builds.updateMeta(created.buildId, { name: 'Two' }, 3000)
    const after = builds.getBuild(created.buildId)!
    expect(after.version).toBe(3)
    expect(after.updatedAt).toBe(3000)
  })

  it('re-dates a day and drags its sets with it (B-5)', () => {
    const builds = useBuildsStore()
    const b = builds.create(1000, TZ)
    builds.addDay(b.buildId, '2026-08-08', 1000)
    const stageId = builds.addStage(b.buildId, 'Main', '#E85D75', 1000)
    builds.addPerformance(b.buildId, {
      artistName: 'Late', artistImage: '', dayIndex: 1, stageId,
      start: '2026-08-08T23:15:00', end: '2026-08-09T00:15:00',
    }, 1000)

    builds.setDayDate(b.buildId, 1, '2026-09-05', 2000)

    const out = builds.getBuild(b.buildId)!
    expect(out.days).toEqual([{ dayIndex: 1, date: '2026-09-05' }])
    expect(out.performances[0]!.start).toBe('2026-09-05T23:15:00')
    expect(out.performances[0]!.end).toBe('2026-09-06T00:15:00')
  })

  it('reassigns orphaned sets when a stage is removed (B-6)', () => {
    const builds = useBuildsStore()
    const b = builds.create(1000, TZ)
    builds.addDay(b.buildId, '2026-08-08', 1000)
    const main = builds.addStage(b.buildId, 'Main', '#E85D75', 1000)
    const bay = builds.addStage(b.buildId, 'Bay', '#2FBF9B', 1000)
    builds.addPerformance(b.buildId, {
      artistName: 'Feast', artistImage: '', dayIndex: 1, stageId: main,
      start: '2026-08-08T19:00:00', end: '2026-08-08T20:00:00',
    }, 1000)

    builds.removeStage(b.buildId, main, 2000, bay)

    const out = builds.getBuild(b.buildId)!
    expect(out.stages.map(s => s.stageId)).toEqual([bay])
    expect(out.performances[0]!.stageId).toBe(bay)
  })

  it('drops a stage\'s sets when there is nowhere to move them (B-6)', () => {
    const builds = useBuildsStore()
    const b = builds.create(1000, TZ)
    builds.addDay(b.buildId, '2026-08-08', 1000)
    const only = builds.addStage(b.buildId, 'Main', '#E85D75', 1000)
    builds.addPerformance(b.buildId, {
      artistName: 'Feast', artistImage: '', dayIndex: 1, stageId: only,
      start: '2026-08-08T19:00:00', end: '2026-08-08T20:00:00',
    }, 1000)

    builds.removeStage(b.buildId, only, 2000)

    const out = builds.getBuild(b.buildId)!
    expect(out.stages).toEqual([])
    expect(out.performances).toEqual([])
  })

  it('keeps generated event ids unique against builds AND cached concerts (B-11)', () => {
    const cache = useConcertCacheStore()
    cache.hydrate([{
      event_id: miniConcert.eventId,
      version: 1,
      source: 'server',
      payload: {},
      normalized: miniConcert,
      fetched_at: 0,
    }])

    const builds = useBuildsStore()
    const a = builds.create(1000, TZ)
    const b = builds.create(1000, TZ)

    expect(builds.takenEventIds()).toContain(miniConcert.eventId)
    expect(a.eventId).not.toBe(b.eventId)
    expect(a.eventId).not.toBe(miniConcert.eventId)
    // an id is not "taken" by the build that already owns it
    expect(builds.takenEventIds(a.buildId)).not.toContain(a.eventId)
  })

  it('forks a cached concert without touching it (B-15)', async () => {
    const builds = useBuildsStore()
    const fork = builds.forkFromConcert(miniConcert, 9000)
    await flush()

    expect(fork.origin).toBe('forked')
    expect(fork.forkedFromEventId).toBe(miniConcert.eventId)
    expect(fork.eventId).not.toBe(miniConcert.eventId)
    expect(await db.local_concert_builds.count()).toBe(1)
    // the fork is a build, never a cache row
    expect(await db.local_concert_cache.count()).toBe(0)
  })

  it('deletes a build from memory and disk (B-16)', async () => {
    const builds = useBuildsStore()
    const b = builds.create(1000, TZ)
    await flush()
    expect(await db.local_concert_builds.count()).toBe(1)

    builds.remove(b.buildId)
    await flush()
    expect(builds.getBuild(b.buildId)).toBeUndefined()
    expect(await db.local_concert_builds.count()).toBe(0)
  })
})
