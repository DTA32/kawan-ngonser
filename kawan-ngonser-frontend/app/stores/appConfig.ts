/**
 * App config (§3.2): server values merged over built-in defaults, cached in
 * local_kv so a previously synced config works offline. GET /config 404s when
 * unseeded — that's "use defaults", not an error (N-2).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { $Fetch } from 'ofetch'
import { getAppConfig } from '~/api/endpoints'
import { kvRepo } from '~/db/repos/kvRepo'
import { DEFAULT_APP_CONFIG } from '~/domain/config/defaults'
import type { AppConfig, CopyValue } from '~/domain/types'
import { persist } from '~/utils/persist-feedback'

const KV_KEY = 'app-config'

export const useAppConfigStore = defineStore('appConfig', () => {
  const serverConfig = ref<Partial<AppConfig> | null>(null)

  const config = computed<AppConfig>(() => ({
    ...DEFAULT_APP_CONFIG,
    ...serverConfig.value,
    copyStrings: {
      ...DEFAULT_APP_CONFIG.copyStrings,
      ...serverConfig.value?.copyStrings,
    },
  }))

  function hydrate(cached: Partial<AppConfig> | undefined): void {
    if (cached) serverConfig.value = cached
  }

  /** Refresh from the server when online; silently keep cache on failure. */
  async function refresh(api: $Fetch): Promise<void> {
    try {
      const fetched = await getAppConfig(api)
      if (fetched) {
        serverConfig.value = fetched
        persist(() => kvRepo.set(KV_KEY, JSON.parse(JSON.stringify(fetched))))
      }
    }
    catch {
      // offline / flaky — cached or default config stays in effect (G-4)
    }
  }

  /** 🛰 copy accessor with C11–C14 fallbacks. */
  function copy(key: string): CopyValue {
    return config.value.copyStrings[key] ?? ''
  }

  return { config, serverConfig, hydrate, refresh, copy }
})
