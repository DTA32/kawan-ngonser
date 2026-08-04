/**
 * Thin HTTP layer for the TR-3 backend. Nuxt-free factory — the composable
 * layer supplies the base URL from runtime config. Short timeout: flaky venue
 * signal must never hang the UI (§5.3 of the plan).
 */
import { type $Fetch, ofetch } from 'ofetch'

export function createApiClient(baseURL: string): $Fetch {
  return ofetch.create({
    baseURL,
    timeout: 5_000,
    retry: 0,
  })
}
