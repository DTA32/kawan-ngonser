/**
 * Wire-payload normalizer (TR-6 + GET /concerts/:id).
 *
 * The REAL wire contract (confirmed with the backend, 2026-08-04) is the §3.1
 * camelCase shape with naive venue-local wall-time strings
 * ("2026-08-07T15:30:00", no offset) — `apiConcertSchema`. The snake_case
 * migrations/seed shape (with Mongo {$date} wrappers) is tolerated as a
 * fallback so the seed files remain directly uploadable. Every timestamp form
 * is accepted either way (naive local, offset ISO, Z-UTC, {$date}, epoch ms).
 *
 * Produces one canonical `Concert` or a friendly error list (C26 path).
 */
import { z } from 'zod'
import { parseVenueTime } from './time'
import type { Concert } from './types'

const zTimeRaw = z.union([
  z.string().min(1),
  z.number(),
  z.object({ $date: z.union([z.string(), z.number()]) }).transform(o => o.$date),
])

const zDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

/** The wire contract — what GET /concerts/:id serves (§3.1, camelCase). */
export const apiConcertSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  name: z.string().min(1),
  logo: z.string().catch(''),
  place: z.string().catch(''),
  description: z.string().catch(''),
  timezone: z.string().min(1),
  days: z.array(z.object({
    index: z.number().int().positive(),
    date: zDateStr,
  })).min(1),
  stages: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    color: z.string().catch(''),
  })).min(1),
  performances: z.array(z.object({
    id: z.string().min(1),
    artistName: z.string().min(1),
    artistImage: z.string().catch(''),
    dayIndex: z.number().int().positive(),
    stageId: z.string().min(1),
    start: zTimeRaw,
    end: zTimeRaw,
  })),
}).loose()

/** Fallback: the Mongo seed shape (migrations/*.json), snake_case. */
export const seedConcertSchema = z.object({
  event_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  name: z.string().min(1),
  logo: z.string().catch(''),
  place: z.string().catch(''),
  description: z.string().catch(''),
  timezone: z.string().min(1),
  days: z.array(z.object({
    day_index: z.number().int().positive(),
    date: zDateStr,
  })).min(1),
  stages: z.array(z.object({
    stage_id: z.string().min(1),
    name: z.string().min(1),
    color: z.string().catch(''),
  })).min(1),
  performances: z.array(z.object({
    performance_id: z.string().min(1),
    artist_name: z.string().min(1),
    artist_image: z.string().catch(''),
    day_index: z.number().int().positive(),
    stage_id: z.string().min(1),
    start_time: zTimeRaw,
    end_time: zTimeRaw,
  })),
}).loose()

export type ParseResult
  = | { ok: true, concert: Concert, warnings: string[] }
    | { ok: false, errors: string[] }

function zodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
}

interface RawConcert {
  eventId: string
  version: number
  name: string
  logo: string
  place: string
  description: string
  timezone: string
  days: { dayIndex: number, date: string }[]
  stages: { stageId: string, name: string, color: string }[]
  performances: {
    performanceId: string
    artistName: string
    artistImage: string
    dayIndex: number
    stageId: string
    start: unknown
    end: unknown
  }[]
}

export function parseConcertPayload(json: unknown): ParseResult {
  const warnings: string[] = []

  // Tolerate a one-element array (e.g. the migrations seed file pasted as-is)
  if (Array.isArray(json)) {
    if (json.length !== 1)
      return { ok: false, errors: [`expected one concert object, got an array of ${json.length}`] }
    warnings.push('payload was a one-element array — unwrapped it')
    json = json[0]
  }

  if (json === null || typeof json !== 'object')
    return { ok: false, errors: ['payload is not a JSON object'] }

  const api = apiConcertSchema.safeParse(json)
  const seed = api.success ? null : seedConcertSchema.safeParse(json)

  let raw: RawConcert
  if (api.success) {
    const d = api.data
    raw = {
      eventId: d.id,
      version: d.version,
      name: d.name,
      logo: d.logo,
      place: d.place,
      description: d.description,
      timezone: d.timezone,
      days: d.days.map(x => ({ dayIndex: x.index, date: x.date })),
      stages: d.stages.map(x => ({ stageId: x.id, name: x.name, color: x.color })),
      performances: d.performances.map(p => ({
        performanceId: p.id,
        artistName: p.artistName,
        artistImage: p.artistImage,
        dayIndex: p.dayIndex,
        stageId: p.stageId,
        start: p.start,
        end: p.end,
      })),
    }
  }
  else if (seed!.success) {
    const d = seed!.data
    warnings.push('payload uses the snake_case seed shape')
    raw = {
      eventId: d.event_id,
      version: d.version,
      name: d.name,
      logo: d.logo,
      place: d.place,
      description: d.description,
      timezone: d.timezone,
      days: d.days.map(x => ({ dayIndex: x.day_index, date: x.date })),
      stages: d.stages.map(x => ({ stageId: x.stage_id, name: x.name, color: x.color })),
      performances: d.performances.map(p => ({
        performanceId: p.performance_id,
        artistName: p.artist_name,
        artistImage: p.artist_image,
        dayIndex: p.day_index,
        stageId: p.stage_id,
        start: p.start_time,
        end: p.end_time,
      })),
    }
  }
  else {
    // Neither shape: report against the real wire contract
    return { ok: false, errors: zodIssues(api.error) }
  }

  const errors: string[] = []
  const tz = raw.timezone
  try {
    void new Intl.DateTimeFormat('en-US', { timeZone: tz })
  }
  catch {
    return { ok: false, errors: [`timezone: "${tz}" is not a valid IANA zone`] }
  }

  const dayIndexes = new Set(raw.days.map(d => d.dayIndex))
  if (dayIndexes.size !== raw.days.length)
    errors.push('days: duplicate day index values')

  const stageIds = new Set(raw.stages.map(s => s.stageId))
  if (stageIds.size !== raw.stages.length)
    errors.push('stages: duplicate stage id values')

  const seenPerf = new Set<string>()
  const performances = raw.performances.map((p, i) => {
    const at = `performances[${i}] (${p.artistName})`
    if (seenPerf.has(p.performanceId))
      errors.push(`${at}: duplicate performance id "${p.performanceId}"`)
    seenPerf.add(p.performanceId)
    if (!dayIndexes.has(p.dayIndex))
      errors.push(`${at}: unknown day index ${p.dayIndex}`)
    if (!stageIds.has(p.stageId))
      errors.push(`${at}: unknown stage id "${p.stageId}"`)
    const startMs = parseVenueTime(p.start, tz)
    const endMs = parseVenueTime(p.end, tz)
    if (startMs === null) errors.push(`${at}: unparseable start time`)
    if (endMs === null) errors.push(`${at}: unparseable end time`)
    if (startMs !== null && endMs !== null && endMs <= startMs)
      errors.push(`${at}: end is not after start`)
    return {
      performanceId: p.performanceId,
      artistName: p.artistName,
      artistImage: p.artistImage,
      dayIndex: p.dayIndex,
      stageId: p.stageId,
      startMs: startMs ?? 0,
      endMs: endMs ?? 0,
    }
  })

  if (errors.length > 0)
    return { ok: false, errors: errors.slice(0, 12) }

  return {
    ok: true,
    warnings,
    concert: {
      eventId: raw.eventId,
      version: raw.version,
      name: raw.name,
      logo: raw.logo,
      place: raw.place,
      description: raw.description,
      timezone: tz,
      days: [...raw.days].sort((a, b) => a.dayIndex - b.dayIndex),
      stages: raw.stages,
      performances: performances.sort((a, b) => a.startMs - b.startMs),
    },
  }
}
