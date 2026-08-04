/**
 * F-1 orchestration: fetch → normalize → revalidate → ONE atomic Dexie
 * transaction across all five tables → re-hydrate stores from disk.
 * Returns the report + pending conflicts; the caller drives C27/C28 toasts
 * and re-opens the O-4 sheet. Manual re-upload of a planned concert reuses
 * `commitSync` with the uploaded payload.
 */
import type { $Fetch } from 'ofetch'
import { getConcert } from '~/api/endpoints'
import { getDB } from '~/db/schema'
import { kvRepo } from '~/db/repos/kvRepo'
import { parseConcertPayload } from '~/domain/normalize'
import { revalidatePlan, type SyncReport } from '~/domain/sync'
import type { Concert, ConflictPrompt } from '~/domain/types'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'
import type { AppConfig } from '~/domain/types'
import { useAppConfigStore } from '~/stores/appConfig'

export type SyncOutcome
  = | { ok: true, version: number, report: SyncReport, pendingConflicts: ConflictPrompt[] }
    | { ok: false, reason: 'fetch' | 'invalid' | 'no-plan' | 'commit' }

export async function syncFromServer(api: $Fetch, eventId: string, nowMs: number): Promise<SyncOutcome> {
  let payload: unknown
  try {
    ({ payload } = await getConcert(api, eventId))
  }
  catch {
    return { ok: false, reason: 'fetch' }
  }
  return commitSync(eventId, payload, 'server', nowMs)
}

export async function commitSync(
  eventId: string,
  payload: unknown,
  source: 'server' | 'json_upload',
  nowMs: number,
): Promise<SyncOutcome> {
  const result = parseConcertPayload(payload)
  if (!result.ok) return { ok: false, reason: 'invalid' }
  const concert: Concert = result.concert
  if (concert.eventId !== eventId) return { ok: false, reason: 'invalid' }

  const planStore = usePlanStore()
  const plan = planStore.getPlan(eventId)
  if (!plan) return { ok: false, reason: 'no-plan' }

  const revalidated = revalidatePlan({
    newConcert: concert,
    attendingDayIndexes: plan.settings.attendingDayIndexes,
    picks: plan.picks,
  })

  const db = getDB()
  try {
    await db.transaction(
      'rw',
      [db.local_concert_cache, db.local_plans, db.local_picks, db.local_performance_overrides],
      async () => {
        await db.local_concert_cache.put({
          event_id: eventId,
          version: concert.version,
          source,
          payload,
          normalized: concert,
          fetched_at: nowMs,
        })
        await db.local_plans.put({
          event_id: eventId,
          attending_day_indexes: revalidated.attendingDayIndexes,
          conflict_display_pref: plan.settings.conflictDisplayPref,
          widget_order: [...plan.settings.widgetOrder],
          lead_time_override_min: plan.settings.leadTimeOverrideMin,
        })
        await db.local_picks.where('event_id').equals(eventId).delete()
        await db.local_picks.bulkPut(Object.values(revalidated.picks).map(p => ({
          event_id: eventId,
          performance_id: p.performanceId,
          status: p.status,
          notify_opt_in: p.notifyOptIn,
        })))
        // Sync replaces the concert data INCLUDING local edits (F-1)
        await db.local_performance_overrides.where('event_id').equals(eventId).delete()
      },
    )
  }
  catch (e) {
    console.error('[kawan-ngonser] sync commit failed', e)
    return { ok: false, reason: 'commit' }
  }

  await rehydrateStores()

  // Offline readiness: warm the (possibly new) artist images — fire and forget
  if (typeof window !== 'undefined') {
    void import('./imageCache').then(m => m.warmConcertImages(concert, navigator.onLine))
  }

  return {
    ok: true,
    version: concert.version,
    report: revalidated.report,
    pendingConflicts: revalidated.pendingConflicts,
  }
}

/** Re-read every table into the stores (post-transaction consistency). */
export async function rehydrateStores(): Promise<void> {
  const db = getDB()
  const [cacheRows, planRows, pickRows, eventRows, overrideRows, cachedConfig] = await Promise.all([
    db.local_concert_cache.toArray(),
    db.local_plans.toArray(),
    db.local_picks.toArray(),
    db.local_custom_events.toArray(),
    db.local_performance_overrides.toArray(),
    kvRepo.get<Partial<AppConfig>>('app-config'),
  ])
  useConcertCacheStore().hydrate(cacheRows)
  usePlanStore().hydrate(planRows, pickRows, eventRows, overrideRows)
  useAppConfigStore().hydrate(cachedConfig)
}
