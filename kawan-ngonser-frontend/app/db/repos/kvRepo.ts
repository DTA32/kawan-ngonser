import { getDB } from '../schema'

export const kvRepo = {
  get: async <T>(key: string): Promise<T | undefined> => {
    const row = await getDB().local_kv.get(key)
    return row?.value as T | undefined
  },
  set: (key: string, value: unknown): Promise<string> =>
    getDB().local_kv.put({ key, value }),
  delete: (key: string): Promise<void> => getDB().local_kv.delete(key),
}
