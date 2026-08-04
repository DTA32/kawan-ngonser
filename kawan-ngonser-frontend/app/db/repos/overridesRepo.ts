import type { OverrideRow } from '../schema'
import { getDB } from '../schema'

export const overridesRepo = {
  forEvent: (eventId: string): Promise<OverrideRow[]> =>
    getDB().local_performance_overrides.where('event_id').equals(eventId).toArray(),
  put: (row: OverrideRow): Promise<[string, string]> => getDB().local_performance_overrides.put(row),
  delete: (eventId: string, performanceId: string): Promise<void> =>
    getDB().local_performance_overrides.delete([eventId, performanceId]),
  deleteForEvent: (eventId: string): Promise<number> =>
    getDB().local_performance_overrides.where('event_id').equals(eventId).delete(),
}
