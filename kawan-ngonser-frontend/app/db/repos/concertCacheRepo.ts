import type { CacheRow } from '../schema'
import { getDB } from '../schema'

export const concertCacheRepo = {
  all: (): Promise<CacheRow[]> => getDB().local_concert_cache.toArray(),
  get: (eventId: string): Promise<CacheRow | undefined> => getDB().local_concert_cache.get(eventId),
  put: (row: CacheRow): Promise<string> => getDB().local_concert_cache.put(row),
  delete: (eventId: string): Promise<void> => getDB().local_concert_cache.delete(eventId),
}
