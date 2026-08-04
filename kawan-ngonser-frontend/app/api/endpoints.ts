/**
 * Typed wrappers for the four backend endpoints. Responses are validated
 * leniently — a malformed server answer degrades to an error result, never an
 * uncaught throw into the UI (G-4).
 */
import type { $Fetch } from 'ofetch'
import { FetchError } from 'ofetch'
import { z } from 'zod'
import { parseConcertPayload, type ParseResult } from '~/domain/normalize'
import type { AppConfig, ConcertSummary, CopyValue, NotificationTemplate } from '~/domain/types'

// GET /concerts — §3.1 camelCase minus performances. The real backend omits
// `timezone` on summaries; it's only used for date-only labels, so UTC is a
// safe fallback (calendar dates don't shift without a time component).
const summarySchema = z.array(z.looseObject({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  name: z.string().min(1),
  logo: z.string().catch(''),
  place: z.string().catch(''),
  description: z.string().catch(''),
  timezone: z.string().min(1).optional(),
  days: z.array(z.looseObject({
    index: z.number().int().positive(),
    date: z.string(),
  })).catch([]),
}))

export async function getConcerts(api: $Fetch): Promise<ConcertSummary[]> {
  const data = await api('/concerts')
  const parsed = summarySchema.parse(data)
  return parsed.map(c => ({
    eventId: c.id,
    version: c.version,
    name: c.name,
    logo: c.logo,
    place: c.place,
    description: c.description,
    timezone: c.timezone ?? 'UTC',
    days: c.days.map(d => ({ dayIndex: d.index, date: d.date })),
  }))
}

export async function getConcert(api: $Fetch, eventId: string): Promise<{ payload: unknown, result: ParseResult }> {
  const payload = await api(`/concerts/${encodeURIComponent(eventId)}`)
  return { payload, result: parseConcertPayload(payload) }
}

// GET /concerts/:id/version — tolerate { version: n } or a bare number
export async function getConcertVersion(api: $Fetch, eventId: string): Promise<number> {
  const data = await api(`/concerts/${encodeURIComponent(eventId)}/version`)
  const version = typeof data === 'number' ? data : (data as { version?: unknown })?.version
  const parsed = z.number().int().nonnegative().safeParse(version)
  if (!parsed.success) throw new Error('version endpoint returned an unexpected shape')
  return parsed.data
}

// GET /config — the API serves camelCase (confirmed live); the snake_case
// seed shape is tolerated as a fallback. 404 when unseeded → built-in defaults.
const zTemplates = z.array(z.looseObject({
  type: z.enum(['performance', 'custom_event']),
  title: z.string(),
  body: z.string(),
}))

const zCopyStrings = z.record(z.string(), z.union([
  z.string(),
  z.looseObject({ text: z.string(), confirm: z.string().optional(), dismiss: z.string().optional() }),
]))

const configSchema = z.looseObject({
  defaultLeadTimeMin: z.number().int().positive().optional(),
  batteryLowThresholdPct: z.number().int().min(0).max(100).optional(),
  notificationTemplates: zTemplates.optional(),
  copyStrings: zCopyStrings.optional(),
  // seed-shape fallback
  default_lead_time_min: z.number().int().positive().optional(),
  battery_low_threshold_pct: z.number().int().min(0).max(100).optional(),
  notification_templates: zTemplates.optional(),
  copy_strings: zCopyStrings.optional(),
})

export async function getAppConfig(api: $Fetch): Promise<Partial<AppConfig> | null> {
  let data: unknown
  try {
    data = await api('/config')
  }
  catch (e) {
    if (e instanceof FetchError && e.statusCode === 404) return null // unseeded → built-in defaults
    throw e
  }
  // config may arrive as a one-element array (seed shape)
  if (Array.isArray(data)) data = data[0]
  const parsed = configSchema.safeParse(data)
  if (!parsed.success) return null
  const c = parsed.data
  const out: Partial<AppConfig> = {}
  const lead = c.defaultLeadTimeMin ?? c.default_lead_time_min
  const battery = c.batteryLowThresholdPct ?? c.battery_low_threshold_pct
  const templates = c.notificationTemplates ?? c.notification_templates
  const copy = c.copyStrings ?? c.copy_strings
  if (lead !== undefined) out.defaultLeadTimeMin = lead
  if (battery !== undefined) out.batteryLowThresholdPct = battery
  if (templates !== undefined) out.notificationTemplates = templates as NotificationTemplate[]
  if (copy !== undefined) out.copyStrings = copy as Record<string, CopyValue>
  return out
}
