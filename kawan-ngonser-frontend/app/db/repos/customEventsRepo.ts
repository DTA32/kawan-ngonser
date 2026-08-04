import type { CustomEventRow } from '../schema'
import { getDB } from '../schema'

export const customEventsRepo = {
  forEvent: (eventId: string): Promise<CustomEventRow[]> =>
    getDB().local_custom_events.where('event_id').equals(eventId).toArray(),
  put: (row: CustomEventRow): Promise<string> => getDB().local_custom_events.put(row),
  delete: (customEventId: string): Promise<void> => getDB().local_custom_events.delete(customEventId),
  deleteForEvent: (eventId: string): Promise<number> =>
    getDB().local_custom_events.where('event_id').equals(eventId).delete(),
}
