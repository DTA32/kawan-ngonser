/**
 * Concert Builder store (§13) — `local_concert_builds`, one row per authored
 * concert. Memory-first mutations with write-through persistence (C31 on
 * failure), exactly like the plan store; every rule lives in domain/builds.
 *
 * Two invariants this store owns:
 *  - B-9 autosave: every mutation bumps `version` + `updated_at` and writes.
 *  - B-5: day mutations run through `normalizeDays`, so dayIndex always
 *    reflects date order and performances follow their day.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuildRow } from '~/db/schema'
import { buildsRepo } from '~/db/repos/buildsRepo'
import {
  type BuildPerformance,
  type BuildStage,
  type ConcertBuild,
  createEmptyBuild,
  deriveEventIdOnRename,
  forkConcertToBuild,
  newPerformanceId,
  normalizeDays,
  restampDay,
  stageIdFor,
} from '~/domain/builds'
import { formatVenueIso } from '~/domain/time'
import type { Concert } from '~/domain/types'
import { persist } from '~/utils/persist-feedback'
import { useConcertCacheStore } from '~/stores/concertCache'

function rowToBuild(r: BuildRow): ConcertBuild {
  return {
    buildId: r.build_id,
    eventId: r.event_id,
    version: r.version,
    name: r.name,
    logo: r.logo,
    place: r.place,
    description: r.description,
    timezone: r.timezone,
    days: r.days.map(d => ({ dayIndex: d.day_index, date: d.date })),
    stages: r.stages.map(s => ({ stageId: s.stage_id, name: s.name, color: s.color })),
    performances: r.performances.map(p => ({
      performanceId: p.performance_id,
      artistName: p.artist_name,
      artistImage: p.artist_image,
      dayIndex: p.day_index,
      stageId: p.stage_id,
      start: p.start_time,
      end: p.end_time,
    })),
    origin: r.origin,
    forkedFromEventId: r.forked_from_event_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function buildToRow(b: ConcertBuild): BuildRow {
  return {
    build_id: b.buildId,
    event_id: b.eventId,
    version: b.version,
    name: b.name,
    logo: b.logo,
    place: b.place,
    description: b.description,
    timezone: b.timezone,
    days: b.days.map(d => ({ day_index: d.dayIndex, date: d.date })),
    stages: b.stages.map(s => ({ stage_id: s.stageId, name: s.name, color: s.color })),
    performances: b.performances.map(p => ({
      performance_id: p.performanceId,
      artist_name: p.artistName,
      artist_image: p.artistImage,
      day_index: p.dayIndex,
      stage_id: p.stageId,
      start_time: p.start,
      end_time: p.end,
    })),
    origin: b.origin,
    forked_from_event_id: b.forkedFromEventId,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  }
}

export const useBuildsStore = defineStore('builds', () => {
  const builds = ref(new Map<string, ConcertBuild>())
  const hydrated = ref(false)

  function hydrate(rows: BuildRow[]): void {
    builds.value = new Map(rows.map(r => [r.build_id, rowToBuild(r)]))
    hydrated.value = true
  }

  /** B-2 list order: most recently edited first. */
  const allBuilds = computed<ConcertBuild[]>(() =>
    [...builds.value.values()].sort((a, b) => b.updatedAt - a.updatedAt))

  function getBuild(buildId: string): ConcertBuild | undefined {
    return builds.value.get(buildId)
  }

  /**
   * B-11: an event id must be unique across builds AND cached concerts — the
   * export has to be plannable next to whatever the recipient already holds.
   */
  function takenEventIds(exceptBuildId?: string): Set<string> {
    const taken = new Set<string>()
    for (const b of builds.value.values()) {
      if (b.buildId !== exceptBuildId) taken.add(b.eventId)
    }
    for (const c of useConcertCacheStore().cachedConcerts) taken.add(c.eventId)
    return taken
  }

  function commit(build: ConcertBuild, nowMs: number): ConcertBuild {
    const next: ConcertBuild = { ...build, version: build.version + 1, updatedAt: nowMs }
    builds.value.set(next.buildId, next)
    builds.value = new Map(builds.value)
    const row = buildToRow(next)
    persist(() => buildsRepo.put(row))
    return next
  }

  /** Apply a pure transform to a build and persist the result (B-9). */
  function mutate(buildId: string, nowMs: number, fn: (b: ConcertBuild) => ConcertBuild): ConcertBuild | undefined {
    const current = builds.value.get(buildId)
    if (!current) return undefined
    return commit(fn(current), nowMs)
  }

  // -- lifecycle -----------------------------------------------------------

  function create(nowMs: number, timezone: string): ConcertBuild {
    const build = createEmptyBuild({ nowMs, timezone, taken: takenEventIds() })
    builds.value.set(build.buildId, build)
    builds.value = new Map(builds.value)
    const row = buildToRow(build)
    persist(() => buildsRepo.put(row))
    return build
  }

  /** B-15 "Edit a copy" — always a fresh eventId; the source is untouched. */
  function forkFromConcert(concert: Concert, nowMs: number): ConcertBuild {
    const build = forkConcertToBuild(concert, {
      nowMs,
      taken: takenEventIds(),
      toIso: formatVenueIso,
    })
    builds.value.set(build.buildId, build)
    builds.value = new Map(builds.value)
    const row = buildToRow(build)
    persist(() => buildsRepo.put(row))
    return build
  }

  function remove(buildId: string): void {
    builds.value.delete(buildId)
    builds.value = new Map(builds.value)
    persist(() => buildsRepo.delete(buildId))
  }

  // -- step 1: concert details (B-4, B-11) ---------------------------------

  type Meta = Pick<ConcertBuild, 'name' | 'logo' | 'place' | 'description' | 'timezone' | 'eventId'>

  function updateMeta(buildId: string, patch: Partial<Meta>, nowMs: number): void {
    mutate(buildId, nowMs, (b) => {
      const next = { ...b, ...patch }
      // Keep an auto-generated id in step with the name until the user takes
      // it over (B-11) — otherwise the export ships as `my-concert-xxxx`.
      if (patch.name !== undefined && patch.eventId === undefined) {
        next.eventId = deriveEventIdOnRename(b.eventId, b.name, patch.name, takenEventIds(buildId))
      }
      return next
    })
  }

  // -- step 2: days (B-5) ---------------------------------------------------

  function addDay(buildId: string, date: string, nowMs: number): void {
    mutate(buildId, nowMs, b => normalizeDays({
      ...b,
      // A provisional index at the end; normalizeDays assigns the real one.
      days: [...b.days, { dayIndex: b.days.length + 1, date }],
    }))
  }

  function setDayDate(buildId: string, dayIndex: number, date: string, nowMs: number): void {
    mutate(buildId, nowMs, (b) => {
      // Re-stamp BEFORE renumbering: the sets still carry the old index here.
      const performances = restampDay(b.performances, dayIndex, date)
      const days = b.days.map(d => (d.dayIndex === dayIndex ? { ...d, date } : d))
      return normalizeDays({ ...b, days, performances })
    })
  }

  /** B-5: removing a day takes its sets with it (the UI confirms the count). */
  function removeDay(buildId: string, dayIndex: number, nowMs: number): void {
    mutate(buildId, nowMs, b => normalizeDays({
      ...b,
      days: b.days.filter(d => d.dayIndex !== dayIndex),
      performances: b.performances.filter(p => p.dayIndex !== dayIndex),
    }))
  }

  // -- step 3: stages (B-6) -------------------------------------------------

  function addStage(buildId: string, name: string, color: string, nowMs: number): string {
    let stageId = ''
    mutate(buildId, nowMs, (b) => {
      stageId = stageIdFor(name, new Set(b.stages.map(s => s.stageId)))
      return { ...b, stages: [...b.stages, { stageId, name, color }] }
    })
    return stageId
  }

  function updateStage(buildId: string, stageId: string, patch: Partial<Omit<BuildStage, 'stageId'>>, nowMs: number): void {
    mutate(buildId, nowMs, b => ({
      ...b,
      stages: b.stages.map(s => (s.stageId === stageId ? { ...s, ...patch } : s)),
    }))
  }

  /**
   * B-6: a stage holding sets can't just vanish — the caller either hands over
   * a `reassignTo` stage or accepts that those sets go with it.
   */
  function removeStage(buildId: string, stageId: string, nowMs: number, reassignTo?: string): void {
    mutate(buildId, nowMs, b => ({
      ...b,
      stages: b.stages.filter(s => s.stageId !== stageId),
      performances: reassignTo
        ? b.performances.map(p => (p.stageId === stageId ? { ...p, stageId: reassignTo } : p))
        : b.performances.filter(p => p.stageId !== stageId),
    }))
  }

  // -- step 4: performances (B-7, B-8) --------------------------------------

  function addPerformance(buildId: string, perf: Omit<BuildPerformance, 'performanceId'>, nowMs: number): void {
    mutate(buildId, nowMs, b => ({
      ...b,
      performances: [...b.performances, { ...perf, performanceId: newPerformanceId() }],
    }))
  }

  function updatePerformance(buildId: string, performanceId: string, patch: Partial<Omit<BuildPerformance, 'performanceId'>>, nowMs: number): void {
    mutate(buildId, nowMs, b => ({
      ...b,
      performances: b.performances.map(p => (p.performanceId === performanceId ? { ...p, ...patch } : p)),
    }))
  }

  function removePerformance(buildId: string, performanceId: string, nowMs: number): void {
    mutate(buildId, nowMs, b => ({
      ...b,
      performances: b.performances.filter(p => p.performanceId !== performanceId),
    }))
  }

  return {
    builds,
    hydrated,
    allBuilds,
    hydrate,
    getBuild,
    takenEventIds,
    create,
    forkFromConcert,
    remove,
    updateMeta,
    addDay,
    setDayDate,
    removeDay,
    addStage,
    updateStage,
    removeStage,
    addPerformance,
    updatePerformance,
    removePerformance,
  }
})
