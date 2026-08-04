/**
 * Cached concert payloads (local_concert_cache) + the server "available to
 * plan" list. Pinia is the reactive truth; every mutation writes through to
 * Dexie (memory first, C31 on failure).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { $Fetch } from 'ofetch'
import type { CacheRow } from '~/db/schema'
import { concertCacheRepo } from '~/db/repos/concertCacheRepo'
import { parseConcertPayload, type ParseResult } from '~/domain/normalize'
import type { Concert, ConcertSummary } from '~/domain/types'
import { getConcerts, getConcertVersion } from '~/api/endpoints'
import { persist } from '~/utils/persist-feedback'

export type AvailableStatus = 'idle' | 'loading' | 'ok' | 'unavailable'

export const useConcertCacheStore = defineStore('concertCache', () => {
  const rows = ref(new Map<string, CacheRow>())
  const available = ref<ConcertSummary[]>([])
  const availableStatus = ref<AvailableStatus>('idle')
  const hydrated = ref(false)

  function hydrate(dbRows: CacheRow[]): void {
    rows.value = new Map(dbRows.map(r => [r.event_id, r]))
    hydrated.value = true
  }

  const cachedConcerts = computed<Concert[]>(() =>
    [...rows.value.values()].map(r => r.normalized))

  function getConcert(eventId: string): Concert | undefined {
    return rows.value.get(eventId)?.normalized
  }

  function getRow(eventId: string): CacheRow | undefined {
    return rows.value.get(eventId)
  }

  /**
   * Validate + store a payload (server sync or TR-6 upload). Returns the
   * ParseResult so callers drive C25/C26 toasts and the sync flow.
   */
  function savePayload(payload: unknown, source: CacheRow['source'], nowMs: number): ParseResult {
    const result = parseConcertPayload(payload)
    if (!result.ok) return result
    const row: CacheRow = {
      event_id: result.concert.eventId,
      version: result.concert.version,
      source,
      payload,
      normalized: result.concert,
      fetched_at: nowMs,
    }
    rows.value.set(row.event_id, row)
    rows.value = new Map(rows.value)
    persist(() => concertCacheRepo.put(row))
    return result
  }

  function removeConcert(eventId: string): void {
    rows.value.delete(eventId)
    rows.value = new Map(rows.value)
    persist(() => concertCacheRepo.delete(eventId))
  }

  /** H-2b: refresh the server list. Failure → 'unavailable' (offline state). */
  async function refreshAvailable(api: $Fetch): Promise<void> {
    availableStatus.value = 'loading'
    try {
      available.value = await getConcerts(api)
      availableStatus.value = 'ok'
    }
    catch {
      availableStatus.value = 'unavailable'
    }
  }

  /** Latest known server version per concert (F-1 lightweight check). */
  const serverVersions = ref(new Map<string, number>())

  async function checkVersion(api: $Fetch, eventId: string): Promise<number | null> {
    try {
      const version = await getConcertVersion(api, eventId)
      serverVersions.value.set(eventId, version)
      serverVersions.value = new Map(serverVersions.value)
      return version
    }
    catch {
      return null // offline / flaky — banner simply doesn't show (G-4)
    }
  }

  return {
    rows,
    available,
    availableStatus,
    hydrated,
    cachedConcerts,
    serverVersions,
    hydrate,
    getConcert,
    getRow,
    savePayload,
    removeConcert,
    refreshAvailable,
    checkVersion,
  }
})
