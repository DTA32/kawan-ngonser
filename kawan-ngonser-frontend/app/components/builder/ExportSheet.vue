<script setup lang="ts">
/**
 * B-13 export. The file is the §3.1 camelCase wire shape — structurally what
 * GET /concerts/:id serves — so the recipient's H-3 upload needs no
 * Builder-specific path. Download and Share both work offline; Share is only
 * offered where the platform actually supports sharing a file.
 */
import { type ConcertBuild, exportFilename, exportJson } from '~/domain/builds'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{ build: ConcertBuild }>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()

const json = computed(() => exportJson(props.build))
const filename = computed(() => exportFilename(props.build))

const sizeLabel = computed(() => {
  const bytes = new TextEncoder().encode(json.value).length
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`
})

const meta = computed(() => {
  const d = props.build.days.length
  const s = props.build.stages.length
  const n = props.build.performances.length
  return interpolate(DESIGN_COPY.exportFileMeta, {
    size: sizeLabel.value,
    d: d === 1 ? '1 day' : `${d} days`,
    s: s === 1 ? '1 stage' : `${s} stages`,
    n: n === 1 ? '1 set' : `${n} sets`,
  })
})

function blob(): Blob {
  return new Blob([json.value], { type: 'application/json' })
}

function exported() {
  toast.add({
    description: interpolate(COPY.toastExported, { concert: props.build.name, n: props.build.version }),
    icon: 'i-lucide-circle-check',
    color: 'success',
  })
  open.value = false
}

function download() {
  const url = URL.createObjectURL(blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename.value
  a.click()
  // Revoke on the next frame — revoking synchronously races the download in
  // WebKit and the file arrives empty.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
  exported()
}

const file = computed(() => new File([json.value], filename.value, { type: 'application/json' }))

const canShare = computed(() =>
  typeof navigator !== 'undefined'
  && typeof navigator.canShare === 'function'
  && navigator.canShare({ files: [file.value] }))

async function share() {
  try {
    await navigator.share({ files: [file.value], title: props.build.name })
    exported()
  }
  catch {
    // User dismissed the share sheet — not an error worth a toast.
  }
}
</script>

<template>
  <CommonBottomSheet v-model:open="open">
    <div class="flex items-center gap-3.5">
      <span class="hero-gradient flex size-14 shrink-0 items-center justify-center rounded-[18px]">
        <UIcon name="i-lucide-share-2" class="size-[26px] text-white" />
      </span>
      <span class="flex min-w-0 flex-col gap-1">
        <h2 class="font-heading text-[19px] font-bold text-text">{{ COPY.exportTitle }}</h2>
        <p class="truncate text-[13px] text-text-secondary">{{ build.name }} · v{{ build.version }}</p>
      </span>
    </div>

    <p class="text-[13px] leading-relaxed text-text-secondary">{{ COPY.exportBody }}</p>

    <div class="flex items-center gap-3 rounded-[14px] bg-surface p-3.5 ring-1 ring-inset ring-border">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12">
        <UIcon name="i-lucide-file-code" class="size-5 text-primary" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="break-all text-[13px] font-semibold text-text">{{ filename }}</span>
        <span class="text-xs text-text-secondary">{{ meta }}</span>
      </span>
    </div>

    <ul class="flex flex-col gap-2.5">
      <li class="flex items-center gap-2.5">
        <UIcon name="i-lucide-check" class="size-[15px] shrink-0 text-success" />
        <span class="text-[13px] text-text-secondary">{{ DESIGN_COPY.exportIncludesLineup }}</span>
      </li>
      <li class="flex items-center gap-2.5">
        <UIcon name="i-lucide-check" class="size-[15px] shrink-0 text-success" />
        <span class="text-[13px] text-text-secondary">{{ DESIGN_COPY.exportIncludesMeta }}</span>
      </li>
      <li class="flex items-center gap-2.5">
        <UIcon name="i-lucide-x" class="size-[15px] shrink-0 text-text-muted" />
        <span class="text-[13px] text-text-muted">{{ DESIGN_COPY.exportExcludesPlan }}</span>
      </li>
    </ul>

    <div class="flex gap-2.5">
      <button
        type="button"
        class="flex-1 rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary active:bg-primary-pressed"
        @click="download"
      >
        {{ COPY.exportDownload }}
      </button>
      <button
        v-if="canShare"
        type="button"
        class="flex-1 rounded-[28px] bg-surface px-6 py-3.5 text-[15px] font-semibold text-text ring-1 ring-inset ring-border"
        @click="share"
      >
        {{ COPY.exportShare }}
      </button>
    </div>

    <p class="text-xs leading-relaxed text-text-muted">{{ DESIGN_COPY.exportFooter }}</p>
  </CommonBottomSheet>
</template>
