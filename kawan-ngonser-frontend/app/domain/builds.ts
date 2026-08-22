/**
 * Concert Builder domain (§13). Pure — no Vue, no Dexie — so every rule here
 * is unit-testable and the store stays a thin persistence shell.
 *
 * A build is a concert document the user owns. It mirrors the Mongo `concerts`
 * shape (§3.5) and, unlike a cached `Concert`, it is allowed to be INCOMPLETE:
 * half a lineup, no stages yet, a set with no artist. Readiness (B-10) is what
 * gates planning and export, not the type system.
 *
 * Times are naive venue-local strings ("2026-08-08T19:00:00"), not epoch ms.
 * That is deliberate: a day can be re-dated (B-5) and every set on it has to
 * follow, so the wall time is the durable part and the calendar date is the
 * movable part. `parseConcertPayload` still owns the ms conversion on the way
 * out (B-12 / B-13), so a build and an uploaded file normalize identically.
 */
import { parseConcertPayload, type ParseResult } from './normalize'
import { addDays, parseVenueTime } from './time'
import type { Concert } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildDay {
  dayIndex: number
  /** YYYY-MM-DD */
  date: string
}

export interface BuildStage {
  stageId: string
  name: string
  /** Untrusted hex — clamped via utils/stage-color before rendering (§12.4) */
  color: string
}

export interface BuildPerformance {
  performanceId: string
  artistName: string
  artistImage: string
  dayIndex: number
  stageId: string
  /** Naive venue-local "YYYY-MM-DDTHH:mm:ss" */
  start: string
  end: string
}

export type BuildOrigin = 'scratch' | 'forked'

export interface ConcertBuild {
  /** Local PK — survives eventId edits and forks (§3.5) */
  buildId: string
  eventId: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  timezone: string
  days: BuildDay[]
  stages: BuildStage[]
  performances: BuildPerformance[]
  origin: BuildOrigin
  forkedFromEventId: string | null
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Ids (B-11)
// ---------------------------------------------------------------------------

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export type Rand = () => number

export function randomToken(len: number, rand: Rand = Math.random): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)]
  return out
}

/**
 * Slug for the event id: lowercase, ascii-ish, single dashes, no edge dashes.
 * Diacritics are stripped rather than dropped so "Bandung Berisík" still reads.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

/**
 * B-11: `{slug}-{4 chars}`, unique against every id already on the device —
 * builds AND cached concerts, since the export has to be plannable alongside
 * whatever the recipient already has.
 */
export function generateEventId(name: string, taken: ReadonlySet<string>, rand: Rand = Math.random): string {
  const base = slugify(name) || 'my-concert'
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${base}-${randomToken(4, rand)}`
    if (!taken.has(id)) return id
  }
  return `${base}-${randomToken(10, rand)}`
}

/** A free id near what the user typed — powers the C40 collision suggestion. */
export function suggestEventId(desired: string, taken: ReadonlySet<string>, rand: Rand = Math.random): string {
  const base = slugify(desired) || 'my-concert'
  if (!taken.has(base)) return base
  return generateEventId(base, taken, rand)
}

/**
 * A build is created before it is named (B-1 opens an empty one), so its first
 * event id is `my-concert-xxxx`. Left alone, that meaningless id is what ends
 * up in the export filename and on the recipient's home screen. So while the
 * id is still the one WE derived from the previous name, re-derive it from the
 * new name — keeping the original suffix, so the id stays stable in shape.
 *
 * The moment the user hand-edits the id (B-11 Advanced), its base stops
 * matching the name's slug and this returns it untouched forever after.
 */
export function deriveEventIdOnRename(
  current: string,
  oldName: string,
  newName: string,
  taken: ReadonlySet<string>,
  rand: Rand = Math.random,
): string {
  const suffix = current.slice(-4)
  const expectedBase = slugify(oldName) || 'my-concert'
  if (current !== `${expectedBase}-${suffix}`) return current

  const nextBase = slugify(newName) || 'my-concert'
  if (nextBase === expectedBase) return current

  const candidate = `${nextBase}-${suffix}`
  return taken.has(candidate) ? generateEventId(newName, taken, rand) : candidate
}

export const newBuildId = (rand: Rand = Math.random) => `build-${randomToken(12, rand)}`
export const newPerformanceId = (rand: Rand = Math.random) => `perf-${randomToken(8, rand)}`

/** Stage ids are slugged from the name and de-duplicated within the build. */
export function stageIdFor(name: string, taken: ReadonlySet<string>, rand: Rand = Math.random): string {
  const base = slugify(name) || 'stage'
  if (!taken.has(base)) return base
  for (let n = 2; n <= 20; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  }
  return `${base}-${randomToken(4, rand)}`
}

// ---------------------------------------------------------------------------
// Wall-time helpers (B-8)
// ---------------------------------------------------------------------------

const LOCAL_ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

/** "2026-08-08T19:00:00" → "2026-08-08". Empty string when unparseable. */
export function dateOfIso(iso: string): string {
  return LOCAL_ISO.exec(iso)?.[1] ?? ''
}

/** "2026-08-08T19:00:00" → "19:00". Empty string when unparseable. */
export function timeOfIso(iso: string): string {
  return LOCAL_ISO.exec(iso)?.[2] ?? ''
}

export function makeLocalIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00`
}

/**
 * B-8: an end at or before the start is a PAST-MIDNIGHT SPILL, not an error —
 * the set keeps its dayIndex and the end lands on the next calendar date
 * (§3.1: "sets may spill past midnight and stay on their dayIndex").
 */
export function resolveSetTimes(dayDate: string, startHHmm: string, endHHmm: string): { start: string, end: string } {
  return {
    start: makeLocalIso(dayDate, startHHmm),
    end: endHHmm <= startHHmm
      ? makeLocalIso(addDays(dayDate, 1), endHHmm)
      : makeLocalIso(dayDate, endHHmm),
  }
}

export function spillsPastMidnight(p: BuildPerformance): boolean {
  const s = dateOfIso(p.start)
  const e = dateOfIso(p.end)
  return s !== '' && e !== '' && s !== e
}

/**
 * Re-stamp every set on a day onto a new date, preserving wall times and any
 * midnight spill. This is what makes B-5 re-dating safe: the lineup does not
 * have to be re-entered when the festival moves a weekend.
 */
export function restampDay(performances: BuildPerformance[], dayIndex: number, newDate: string): BuildPerformance[] {
  return performances.map((p) => {
    if (p.dayIndex !== dayIndex) return p
    const { start, end } = resolveSetTimes(newDate, timeOfIso(p.start), timeOfIso(p.end))
    return { ...p, start, end }
  })
}

// ---------------------------------------------------------------------------
// Days (B-5)
// ---------------------------------------------------------------------------

/**
 * B-5: dayIndex is DERIVED from date order, never entered. Sorting and
 * renumbering happen on every day mutation, and performances are remapped in
 * the same pass so a set never points at an index that moved out from under it.
 */
export function normalizeDays(build: ConcertBuild): ConcertBuild {
  const ordered = [...build.days].sort((a, b) =>
    a.date === b.date ? a.dayIndex - b.dayIndex : a.date.localeCompare(b.date))

  const remap = new Map<number, number>()
  const days = ordered.map((d, i) => {
    remap.set(d.dayIndex, i + 1)
    return { dayIndex: i + 1, date: d.date }
  })

  const performances = build.performances.map(p => ({
    ...p,
    dayIndex: remap.get(p.dayIndex) ?? p.dayIndex,
  }))

  return { ...build, days, performances }
}

// ---------------------------------------------------------------------------
// Readiness (B-10)
// ---------------------------------------------------------------------------

export type BuildGap = 'name' | 'timezone' | 'days' | 'stages' | 'performances' | 'incompleteSets'

export interface BuildReadiness {
  ready: boolean
  gaps: BuildGap[]
  /** Sets failing `isPerformanceComplete` — feeds "Finish {n} incomplete sets" */
  incompleteCount: number
}

export function isPerformanceComplete(p: BuildPerformance, build: ConcertBuild): boolean {
  if (!p.artistName.trim()) return false
  if (!build.days.some(d => d.dayIndex === p.dayIndex)) return false
  if (!build.stages.some(s => s.stageId === p.stageId)) return false
  const startMs = parseVenueTime(p.start, build.timezone)
  const endMs = parseVenueTime(p.end, build.timezone)
  return startMs !== null && endMs !== null && endMs > startMs
}

export function readiness(build: ConcertBuild): BuildReadiness {
  const gaps: BuildGap[] = []
  if (!build.name.trim()) gaps.push('name')
  if (!build.timezone.trim()) gaps.push('timezone')
  if (build.days.length === 0) gaps.push('days')
  if (build.stages.length === 0) gaps.push('stages')
  if (build.performances.length === 0) gaps.push('performances')

  const incompleteCount = build.performances.filter(p => !isPerformanceComplete(p, build)).length
  if (incompleteCount > 0) gaps.push('incompleteSets')

  return { ready: gaps.length === 0, gaps, incompleteCount }
}

// ---------------------------------------------------------------------------
// Same-stage overlap (B-7)
// ---------------------------------------------------------------------------

export interface StageClash {
  stageId: string
  performanceIds: string[]
}

/**
 * B-7: one stage cannot host two acts at once, so a same-stage overlap is a
 * DATA ERROR. Cross-stage overlaps are deliberately not reported — those are
 * the clashes the rest of the app exists to help the user resolve.
 */
export function sameStageClashes(build: ConcertBuild): StageClash[] {
  const byStage = new Map<string, { id: string, start: number, end: number }[]>()

  for (const p of build.performances) {
    const start = parseVenueTime(p.start, build.timezone)
    const end = parseVenueTime(p.end, build.timezone)
    if (start === null || end === null || end <= start) continue
    const list = byStage.get(p.stageId) ?? []
    list.push({ id: p.performanceId, start, end })
    byStage.set(p.stageId, list)
  }

  const out: StageClash[] = []
  for (const [stageId, sets] of byStage) {
    sets.sort((a, b) => a.start - b.start)
    const hit = new Set<string>()
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        // Sorted by start: once a later set begins at/after this one ends,
        // nothing further can overlap it either.
        if (sets[j]!.start >= sets[i]!.end) break
        hit.add(sets[i]!.id)
        hit.add(sets[j]!.id)
      }
    }
    if (hit.size > 0) out.push({ stageId, performanceIds: [...hit] })
  }
  return out
}

/** Flat lookup for per-row rendering. */
export function clashingPerformanceIds(build: ConcertBuild): Set<string> {
  return new Set(sameStageClashes(build).flatMap(c => c.performanceIds))
}

// ---------------------------------------------------------------------------
// Export / hand-off (B-12, B-13, B-15)
// ---------------------------------------------------------------------------

export interface WireConcert {
  id: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  timezone: string
  days: { index: number, date: string }[]
  stages: { id: string, name: string, color: string }[]
  performances: {
    id: string
    artistName: string
    artistImage: string
    dayIndex: number
    stageId: string
    start: string
    end: string
  }[]
}

/**
 * B-13: the §3.1 camelCase wire shape — structurally what `GET /concerts/:id`
 * serves, so a recipient's H-3 upload needs no Builder-specific path. Nothing
 * local leaks: buildId, origin and the fork pointer stay on this device.
 */
export function buildToWirePayload(build: ConcertBuild): WireConcert {
  return {
    id: build.eventId,
    version: build.version,
    name: build.name,
    logo: build.logo,
    place: build.place,
    description: build.description,
    timezone: build.timezone,
    days: build.days.map(d => ({ index: d.dayIndex, date: d.date })),
    stages: build.stages.map(s => ({ id: s.stageId, name: s.name, color: s.color })),
    performances: [...build.performances]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(p => ({
        id: p.performanceId,
        artistName: p.artistName,
        artistImage: p.artistImage,
        dayIndex: p.dayIndex,
        stageId: p.stageId,
        start: p.start,
        end: p.end,
      })),
  }
}

/** B-12: normalize through the same parser an upload uses — no second path. */
export function buildToConcert(build: ConcertBuild): ParseResult {
  return parseConcertPayload(buildToWirePayload(build))
}

/** `{event_id}-v{version}.json` (B-13). */
export function exportFilename(build: ConcertBuild): string {
  return `${build.eventId}-v${build.version}.json`
}

export function exportJson(build: ConcertBuild): string {
  return `${JSON.stringify(buildToWirePayload(build), null, 2)}\n`
}

// ---------------------------------------------------------------------------
// Creation (B-1, B-15)
// ---------------------------------------------------------------------------

export interface CreateBuildInput {
  nowMs: number
  timezone: string
  taken: ReadonlySet<string>
  name?: string
  rand?: Rand
}

export function createEmptyBuild(input: CreateBuildInput): ConcertBuild {
  const rand = input.rand ?? Math.random
  const name = input.name ?? ''
  return {
    buildId: newBuildId(rand),
    eventId: generateEventId(name, input.taken, rand),
    version: 1,
    name,
    logo: '',
    place: '',
    description: '',
    timezone: input.timezone,
    days: [],
    stages: [],
    performances: [],
    origin: 'scratch',
    forkedFromEventId: null,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
  }
}

/**
 * B-15 "Edit a copy": fork a cached concert into a new build. Always a fresh
 * eventId and version 1, so the fork can coexist with the original on the same
 * device and nothing diverges silently. Plan data is not part of `Concert` and
 * therefore cannot be copied by construction.
 */
export function forkConcertToBuild(
  concert: Concert,
  input: { nowMs: number, taken: ReadonlySet<string>, rand?: Rand, toIso: (ms: number, tz: string) => string },
): ConcertBuild {
  const rand = input.rand ?? Math.random
  const tz = concert.timezone
  return {
    buildId: newBuildId(rand),
    eventId: generateEventId(concert.name, input.taken, rand),
    version: 1,
    name: concert.name,
    logo: concert.logo,
    place: concert.place,
    description: concert.description,
    timezone: tz,
    days: concert.days.map(d => ({ dayIndex: d.dayIndex, date: d.date })),
    stages: concert.stages.map(s => ({ stageId: s.stageId, name: s.name, color: s.color })),
    performances: concert.performances.map(p => ({
      performanceId: p.performanceId,
      artistName: p.artistName,
      artistImage: p.artistImage,
      dayIndex: p.dayIndex,
      stageId: p.stageId,
      start: input.toIso(p.startMs, tz),
      end: input.toIso(p.endMs, tz),
    })),
    origin: 'forked',
    forkedFromEventId: concert.eventId,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Sets of a day, in start order — the B-7 list grouping. */
export function performancesOfDay(build: ConcertBuild, dayIndex: number): BuildPerformance[] {
  return build.performances
    .filter(p => p.dayIndex === dayIndex)
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function stageOf(build: ConcertBuild, stageId: string): BuildStage | undefined {
  return build.stages.find(s => s.stageId === stageId)
}

export function countSetsOnDay(build: ConcertBuild, dayIndex: number): number {
  return build.performances.reduce((n, p) => n + (p.dayIndex === dayIndex ? 1 : 0), 0)
}

export function countSetsOnStage(build: ConcertBuild, stageId: string): number {
  return build.performances.reduce((n, p) => n + (p.stageId === stageId ? 1 : 0), 0)
}
