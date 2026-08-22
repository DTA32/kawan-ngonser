<script setup lang="ts">
/**
 * H-3 / TR-6 manual JSON upload — always available, fully offline.
 * Success → C25 toast; validation failure → C26 with the error list.
 *
 * B-14: sharing exported builds (§13) makes re-uploading a NEWER file for a
 * concert you already planned a normal event rather than an edge case, so the
 * version decides what happens. A newer file goes through the F-1 revalidation
 * path (with the C12 confirmation when there are local edits to lose) instead
 * of overwriting the cache row and leaving picks pointing at sets that may no
 * longer exist. An older or equal file is declined.
 */
import { classifyUpload } from '~/domain/sync'
import { parseConcertPayload } from '~/domain/normalize'
import { commitSync } from '~/services/syncService'
import { warmConcertImages } from '~/services/imageCache'
import { COPY, interpolate } from '~/utils/copy'
import { useAppConfigStore } from '~/stores/appConfig'
import { useConcertCacheStore } from '~/stores/concertCache'
import { usePlanStore } from '~/stores/plan'

const emit = defineEmits<{ uploaded: [eventId: string] }>()

const cache = useConcertCacheStore()
const planStore = usePlanStore()
const appConfig = useAppConfigStore()
const toast = useToast()
const { online } = useConnectivity()
const input = ref<HTMLInputElement>()

const confirmOpen = ref(false)
const pending = ref<{ eventId: string, payload: unknown } | null>(null)

function fail() {
  toast.add({ description: COPY.uploadFailure, icon: 'i-lucide-circle-alert', color: 'error' })
}

function saveFresh(json: unknown) {
  const result = cache.savePayload(json, 'json_upload', nowMs())
  if (!result.ok) {
    fail()
    console.warn('[kawan-ngonser] upload rejected:', result.errors)
    return
  }
  toast.add({
    description: interpolate(COPY.uploadSuccess, { concert: result.concert.name }),
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
  // Offline readiness: cache artist images now (or queue for reconnect)
  void warmConcertImages(result.concert, online.value)
  emit('uploaded', result.concert.eventId)
}

async function reimport(eventId: string, payload: unknown) {
  const outcome = await commitSync(eventId, payload, 'json_upload', nowMs())
  if (!outcome.ok) {
    toast.add({ description: COPY.syncFailure, icon: 'i-lucide-cloud-off', color: 'error' })
    return
  }
  toast.add({
    description: interpolate(COPY.toastReimportNewer, { n: outcome.version }),
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = '' // allow re-selecting the same file
  if (!file) return

  let json: unknown
  try {
    json = JSON.parse(await file.text())
  }
  catch {
    fail()
    return
  }

  const parsed = parseConcertPayload(json)
  if (!parsed.ok) {
    fail()
    console.warn('[kawan-ngonser] upload rejected:', parsed.errors)
    return
  }

  const eventId = parsed.concert.eventId
  const plan = planStore.getPlan(eventId)
  const decision = classifyUpload({
    planned: Boolean(plan),
    incomingVersion: parsed.concert.version,
    currentVersion: cache.getRow(eventId)?.version ?? null,
    hasLocalEdits: Object.keys(plan?.overrides ?? {}).length > 0,
  })

  if (decision.kind === 'fresh') {
    saveFresh(json)
    return
  }
  if (decision.kind === 'stale') {
    toast.add({
      description: interpolate(COPY.toastReimportStale, { n: decision.incoming, m: decision.current }),
      icon: 'i-lucide-info',
      color: 'warning',
    })
    return
  }
  if (decision.needsEditConfirm) {
    pending.value = { eventId, payload: json }
    confirmOpen.value = true
    return
  }
  await reimport(eventId, json)
}

/** The same 🛰 C12 copy the F-1 sync advisory uses — one source, one wording. */
const overwriteCopy = computed(() => {
  const raw = appConfig.copy('sync_overwrite_confirm')
  return typeof raw === 'string'
    ? { text: raw, confirm: 'Replace my edits', dismiss: 'Keep my edits' }
    : { text: raw.text, confirm: raw.confirm ?? 'Replace my edits', dismiss: raw.dismiss ?? 'Keep my edits' }
})

async function confirmReplace() {
  const p = pending.value
  pending.value = null
  if (p) await reimport(p.eventId, p.payload)
}
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-border p-3.5 text-left"
    @click="input?.click()"
  >
    <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info/12">
      <UIcon name="i-lucide-file-up" class="size-5 text-info" />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-sm font-semibold text-text">Upload concert JSON</span>
      <span class="text-xs text-text-secondary">Works fully offline</span>
    </div>
    <input
      ref="input"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="onFile"
    >
  </button>

  <!-- C12: the same warning F-1 sync shows before local edits are replaced -->
  <CommonConfirmDialog
    v-model:open="confirmOpen"
    danger
    title="Replace your edits?"
    :body="overwriteCopy.text"
    :confirm-label="overwriteCopy.confirm"
    :cancel-label="overwriteCopy.dismiss"
    @confirm="confirmReplace"
    @cancel="pending = null"
  />
</template>
