import type { PlanRow } from '../schema'
import { getDB } from '../schema'

export const planRepo = {
  all: (): Promise<PlanRow[]> => getDB().local_plans.toArray(),
  get: (eventId: string): Promise<PlanRow | undefined> => getDB().local_plans.get(eventId),
  put: (row: PlanRow): Promise<string> => getDB().local_plans.put(row),
  delete: (eventId: string): Promise<void> => getDB().local_plans.delete(eventId),
}
