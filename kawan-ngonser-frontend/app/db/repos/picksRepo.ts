import type { PickRow } from '../schema'
import { getDB } from '../schema'

export const picksRepo = {
  forEvent: (eventId: string): Promise<PickRow[]> =>
    getDB().local_picks.where('event_id').equals(eventId).toArray(),
  put: (row: PickRow): Promise<[string, string]> => getDB().local_picks.put(row),
  bulkPut: (rows: PickRow[]): Promise<[string, string]> => getDB().local_picks.bulkPut(rows),
  delete: (eventId: string, performanceId: string): Promise<void> =>
    getDB().local_picks.delete([eventId, performanceId]),
  deleteForEvent: (eventId: string): Promise<number> =>
    getDB().local_picks.where('event_id').equals(eventId).delete(),
  /** Replace an event's pick set atomically. */
  replaceForEvent: (eventId: string, rows: PickRow[]): Promise<void> =>
    getDB().transaction('rw', getDB().local_picks, async () => {
      await getDB().local_picks.where('event_id').equals(eventId).delete()
      await getDB().local_picks.bulkPut(rows)
    }),
}
