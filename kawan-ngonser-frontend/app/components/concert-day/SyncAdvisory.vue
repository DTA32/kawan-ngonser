<script setup lang="ts">
/**
 * F-1 sync advisory: shows when online ∧ server has a newer version ∧ that
 * version wasn't dismissed. "Yes please" → C12 confirm first when local edits
 * exist → sync → C27/C28 toast; conflicts re-open the O-4 sheet via emit.
 */
import { kvRepo } from '~/db/repos/kvRepo'
import type { ConflictPrompt } from '~/domain/types'
import { syncFromServer } from '~/services/syncService'
import { useAppConfigStore } from '~/stores/appConfig'
import { useConcertCacheStore } from '~/stores/concertCache'
import { COPY, interpolate } from '~/utils/copy'
import { persist } from '~/utils/persist-feedback'

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ conflicts: [prompts: ConflictPrompt[]] }>()

const cache = useConcertCacheStore()
const appConfig = useAppConfigStore()
const plan = usePlan(() => props.eventId)
const { online } = useConnectivity()
const toast = useToast()

const dismissedVersion = ref<number>(0)
const syncing = ref(false)
const confirmOpen = ref(false)

const DISMISS_KEY = computed(() => `sync-dismissed:${props.eventId}`)

onMounted(async () => {
  dismissedVersion.value = (await kvRepo.get<number>(DISMISS_KEY.value)) ?? 0
  void check()
  window.addEventListener('focus', check)
})
onUnmounted(() => window.removeEventListener('focus', check))
watch(online, isOn => isOn && check())

async function check() {
  if (online.value) await cache.checkVersion(useApi(), props.eventId)
}

const localVersion = computed(() => cache.getRow(props.eventId)?.version ?? 0)
const serverVersion = computed(() => cache.serverVersions.get(props.eventId) ?? 0)

const visible = computed(() =>
  online.value
  && serverVersion.value > localVersion.value
  && serverVersion.value > dismissedVersion.value)

const bannerCopy = computed(() => {
  const raw = appConfig.copy('sync_banner')
  return typeof raw === 'string'
    ? { text: raw, confirm: 'Yes please', dismiss: 'I\'ll handle it myself' }
    : { text: raw.text, confirm: raw.confirm ?? 'Yes please', dismiss: raw.dismiss ?? 'I\'ll handle it myself' }
})

const overwriteCopy = computed(() => {
  const raw = appConfig.copy('sync_overwrite_confirm')
  return typeof raw === 'string'
    ? { text: raw, confirm: 'Replace my edits', dismiss: 'Keep my edits' }
    : { text: raw.text, confirm: raw.confirm ?? 'Replace my edits', dismiss: raw.dismiss ?? 'Keep my edits' }
})

function onYes() {
  if (plan.hasLocalEdits.value) confirmOpen.value = true
  else void runSync()
}

function onDismiss() {
  dismissedVersion.value = serverVersion.value
  persist(() => kvRepo.set(DISMISS_KEY.value, serverVersion.value))
}

async function runSync() {
  if (syncing.value) return
  syncing.value = true
  const outcome = await syncFromServer(useApi(), props.eventId, nowMs())
  syncing.value = false
  if (outcome.ok) {
    toast.add({
      description: interpolate(COPY.syncSuccess, { n: outcome.version }),
      icon: 'i-lucide-circle-check',
      color: 'success',
    })
    if (outcome.pendingConflicts.length > 0) emit('conflicts', outcome.pendingConflicts)
  }
  else {
    toast.add({
      description: COPY.syncFailure,
      icon: 'i-lucide-cloud-off',
      color: 'error',
    })
  }
}
</script>

<template>
  <div v-if="visible" class="flex flex-col gap-3 rounded-2xl bg-warning/9 p-3.5">
    <div class="flex items-start gap-2.5">
      <UIcon name="i-lucide-refresh-cw" class="mt-0.5 size-[18px] shrink-0 text-warning" :class="syncing ? 'animate-spin' : ''" />
      <p class="text-sm font-semibold leading-relaxed text-text">{{ bannerCopy.text }}</p>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-[20px] bg-primary px-4 py-[9px] text-[13px] font-semibold text-on-primary disabled:opacity-50"
        :disabled="syncing"
        @click="onYes"
      >
        {{ bannerCopy.confirm }}
      </button>
      <button
        type="button"
        class="rounded-[20px] px-4 py-[9px] text-[13px] font-semibold text-text-secondary ring-1 ring-inset ring-border"
        @click="onDismiss"
      >
        {{ bannerCopy.dismiss }}
      </button>
    </div>

    <CommonConfirmDialog
      v-model:open="confirmOpen"
      title="Replace your edits?"
      :body="overwriteCopy.text"
      :confirm-label="overwriteCopy.confirm"
      :cancel-label="overwriteCopy.dismiss"
      danger
      @confirm="runSync"
    />
  </div>
</template>
