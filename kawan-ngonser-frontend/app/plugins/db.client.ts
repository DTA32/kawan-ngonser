/**
 * Opens Dexie and hydrates every store before the app renders, so local reads
 * are synchronous everywhere else (no per-view loading states for IndexedDB).
 */
import { getDB } from '~/db/schema'
import { kvRepo } from '~/db/repos/kvRepo'
import type { AppConfig } from '~/domain/types'
import { useAppConfigStore } from '~/stores/appConfig'
import { useBuildsStore } from '~/stores/builds'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

export default defineNuxtPlugin(async () => {
  const db = getDB()
  const concertCache = useConcertCacheStore()
  const builds = useBuildsStore()
  const plan = usePlanStore()
  const appConfig = useAppConfigStore()

  try {
    const [cacheRows, planRows, pickRows, eventRows, overrideRows, buildRows, cachedConfig] = await Promise.all([
      db.local_concert_cache.toArray(),
      db.local_plans.toArray(),
      db.local_picks.toArray(),
      db.local_custom_events.toArray(),
      db.local_performance_overrides.toArray(),
      db.local_concert_builds.toArray(),
      kvRepo.get<Partial<AppConfig>>('app-config'),
    ])
    concertCache.hydrate(cacheRows)
    plan.hydrate(planRows, pickRows, eventRows, overrideRows)
    builds.hydrate(buildRows)
    appConfig.hydrate(cachedConfig)
  }
  catch (e) {
    // A broken IndexedDB (private mode edge cases) must not brick the app —
    // stores stay empty and the UI behaves like a fresh install.
    console.error('[kawan-ngonser] IndexedDB hydration failed', e)
    concertCache.hydrate([])
    plan.hydrate([], [], [], [])
    builds.hydrate([])
  }
})
