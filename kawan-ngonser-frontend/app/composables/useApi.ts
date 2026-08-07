import type { $Fetch } from 'ofetch'
import { createApiClient } from '~/api/client'

let client: $Fetch | null = null

/** Shared API client bound to the build-time base URL. */
export function useApi(): $Fetch {
  if (!client) {
    const base = useRuntimeConfig().public.apiBase
    // Every call doubles as a G-2 connection-quality sample, which is why an
    // active app almost never has to probe /health.
    const { recordSample } = useConnectivity()
    client = createApiClient(base || '/api', t => recordSample(t.rttMs, t.ok))
  }
  return client
}
