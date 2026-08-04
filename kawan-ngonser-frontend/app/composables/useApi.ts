import type { $Fetch } from 'ofetch'
import { createApiClient } from '~/api/client'

let client: $Fetch | null = null

/** Shared API client bound to the build-time base URL. */
export function useApi(): $Fetch {
  if (!client) {
    const base = useRuntimeConfig().public.apiBase
    client = createApiClient(base || '/api')
  }
  return client
}
