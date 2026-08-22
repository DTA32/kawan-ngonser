import type { BuildRow } from '../schema'
import { getDB } from '../schema'

export const buildsRepo = {
  all: (): Promise<BuildRow[]> => getDB().local_concert_builds.toArray(),
  get: (buildId: string): Promise<BuildRow | undefined> => getDB().local_concert_builds.get(buildId),
  put: (row: BuildRow): Promise<string> => getDB().local_concert_builds.put(row),
  delete: (buildId: string): Promise<void> => getDB().local_concert_builds.delete(buildId),
}
