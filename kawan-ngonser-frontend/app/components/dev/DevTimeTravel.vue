<script setup lang="ts">
/**
 * Dev-only clock override — the festival dates are fixed (2026-08-07…09), so
 * every time-dependent state needs simulation. Honors ?t=<ISO> on load,
 * persists across reloads via localStorage.
 */
const open = ref(false)

const offset = getDevTimeOffset()
const now = useNow(1000)

// Manual entry — interpreted as venue time (WIB, +07:00), like the presets
const manual = ref('')

watch(open, (isOpen) => {
  if (isOpen) {
    // Prefill with the current app clock in WIB ("2026-08-07T19:02")
    manual.value = new Date(now.value + 7 * 3600_000).toISOString().slice(0, 16)
  }
})

function applyManual() {
  if (!manual.value) return
  const parsed = Date.parse(`${manual.value}:00+07:00`)
  if (Number.isFinite(parsed)) {
    setDevTimeTarget(parsed)
    open.value = false
  }
}

const presets = [
  { label: 'Real time', value: null },
  { label: 'Before festival', value: '2026-08-05T12:00:00+07:00' },
  { label: 'Day 1 · 19:02', value: '2026-08-07T19:02:00+07:00' },
  { label: 'Day 1 · 23:59 (day done)', value: '2026-08-07T23:59:00+07:00' },
  { label: 'Day 2 · 16:00', value: '2026-08-08T16:00:00+07:00' },
  { label: 'After festival', value: '2026-08-10T12:00:00+07:00' },
] as const

function apply(value: string | null) {
  setDevTimeTarget(value === null ? null : Date.parse(value))
}

onMounted(() => {
  const t = new URLSearchParams(window.location.search).get('t')
  if (t) {
    const parsed = Date.parse(t)
    if (Number.isFinite(parsed)) setDevTimeTarget(parsed)
  }
})
</script>

<template>
  <div class="fixed bottom-3 right-3 z-50">
    <button
      type="button"
      class="flex size-10 items-center justify-center rounded-full border border-border bg-surface-raised shadow-lg"
      :class="offset !== 0 ? 'text-warning' : 'text-text-muted'"
      aria-label="Time travel (dev)"
      @click="open = !open"
    >
      <UIcon name="i-lucide-clock" class="size-5" />
    </button>
    <div
      v-if="open"
      class="absolute bottom-12 right-0 w-60 rounded-[14px] border border-border bg-surface-raised p-2 shadow-xl"
    >
      <p class="px-2 py-1 text-xs font-semibold tracking-wide text-text-muted">
        APP CLOCK · {{ new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false }) }} WIB
      </p>
      <button
        v-for="p in presets"
        :key="p.label"
        type="button"
        class="block w-full rounded-[10px] px-2 py-1.5 text-left text-sm text-text hover:bg-primary/10"
        @click="apply(p.value); open = false"
      >
        {{ p.label }}
      </button>

      <div class="mt-1 border-t border-border pt-2">
        <p class="px-2 pb-1 text-[10px] font-semibold tracking-wide text-text-muted">CUSTOM · WIB</p>
        <div class="flex items-center gap-1.5 px-1">
          <input
            v-model="manual"
            type="datetime-local"
            class="min-w-0 flex-1 rounded-lg bg-surface px-2 py-1.5 text-xs text-text outline-none ring-1 ring-inset ring-border"
            @keydown.enter="applyManual"
          >
          <button
            type="button"
            class="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary"
            @click="applyManual"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
