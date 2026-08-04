<script setup lang="ts">
// H-3 / TR-6: manual JSON upload — always available, fully offline.
// Success → C25 toast; validation failure → C26 with the error list.
import { warmConcertImages } from '~/services/imageCache'
import { COPY, interpolate } from '~/utils/copy'
import { useConcertCacheStore } from '~/stores/concertCache'

const emit = defineEmits<{ uploaded: [eventId: string] }>()

const cache = useConcertCacheStore()
const toast = useToast()
const { online } = useConnectivity()
const input = ref<HTMLInputElement>()

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = '' // allow re-selecting the same file
  if (!file) return

  let json: unknown
  try {
    json = JSON.parse(await file.text())
  }
  catch {
    toast.add({ description: COPY.uploadFailure, icon: 'i-lucide-circle-alert', color: 'error' })
    return
  }

  const result = cache.savePayload(json, 'json_upload', nowMs())
  if (result.ok) {
    toast.add({
      description: interpolate(COPY.uploadSuccess, { concert: result.concert.name }),
      icon: 'i-lucide-circle-check',
      color: 'success',
    })
    // Offline readiness: cache artist images now (or queue for reconnect)
    void warmConcertImages(result.concert, online.value)
    emit('uploaded', result.concert.eventId)
  }
  else {
    toast.add({ description: COPY.uploadFailure, icon: 'i-lucide-circle-alert', color: 'error' })
    console.warn('[kawan-ngonser] upload rejected:', result.errors)
  }
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
</template>
