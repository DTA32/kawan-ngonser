<script setup lang="ts">
/**
 * S-1 widget rearrange: Sortable drag (touch-safe delay so scrolling isn't
 * hijacked) + keyboard/Move-up-down fallback for accessibility. Order writes
 * live; "Done" navigates back with the C30 toast.
 */
import { useSortable } from '@vueuse/integrations/useSortable'
import type { WidgetId } from '~/domain/types'
import { COPY, DESIGN_COPY } from '~/utils/copy'

definePageMeta({ layout: 'flow' })

const route = useRoute()
const router = useRouter()
const eventId = computed(() => route.params.id as string)

const plan = usePlan(eventId)
const toast = useToast()

const TITLES: Record<WidgetId, string> = {
  upNext: DESIGN_COPY.widgetUpNext,
  timetable: DESIGN_COPY.widgetTimetable,
  backburner: DESIGN_COPY.widgetBackburner,
  other: DESIGN_COPY.widgetOther,
  nextDays: DESIGN_COPY.widgetNextDays,
}

const order = ref<WidgetId[]>([...(plan.settings.value?.widgetOrder ?? ['upNext', 'timetable', 'backburner', 'other', 'nextDays'])])
const listEl = ref<HTMLElement | null>(null)
const dirty = ref(false)

onMounted(() => {
  if (!plan.exists.value) router.replace('/')
})

// Whole row is draggable (an 18px grip-only target fails silently too often);
// the touch delay keeps page scrolling from being hijacked.
useSortable(listEl, order, {
  animation: 150,
  delay: 150,
  delayOnTouchOnly: true,
})

watch(order, (next) => {
  plan.setWidgetOrder([...next])
  dirty.value = true
}, { deep: true })

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= order.value.length) return
  const next = [...order.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  order.value = next
}

function done() {
  if (dirty.value) {
    toast.add({ description: COPY.toastWidgetOrderSaved, icon: 'i-lucide-circle-check', color: 'success' })
  }
  router.back()
}
</script>

<template>
  <div class="flex flex-1 flex-col">
    <ChromeNavHeader title="Rearrange widgets" />

    <div class="flex flex-1 flex-col gap-4 px-5 pb-7 pt-4">
      <p class="text-sm leading-relaxed text-text-secondary">
        Drag to reorder — this is how your concert-day home stacks up.
      </p>

      <div class="flex items-center gap-3 rounded-[14px] bg-surface p-3.5 opacity-55">
        <UIcon name="i-lucide-lock" class="size-4 shrink-0 text-text-muted" />
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold text-text">Sync advisory & day banners</span>
          <span class="text-xs text-text-secondary">Pinned to the top — not rearrangeable</span>
        </div>
      </div>

      <div ref="listEl" class="flex flex-col gap-2.5">
        <div
          v-for="(widget, i) in order"
          :key="widget"
          class="flex cursor-grab items-center gap-3 rounded-[14px] bg-surface p-3.5"
          tabindex="0"
          role="listitem"
          :aria-label="`${TITLES[widget]}, position ${i + 1} of ${order.length}`"
          @keydown.arrow-up.prevent="move(i, -1)"
          @keydown.arrow-down.prevent="move(i, 1)"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-[18px] shrink-0 text-text-muted" />
          <span class="flex-1 text-[15px] font-semibold text-text">{{ TITLES[widget] }}</span>
          <!-- always-visible fallback: drag isn't discoverable for everyone -->
          <span class="flex gap-1">
            <button
              type="button"
              aria-label="Move up"
              class="rounded-lg p-1.5 text-text-secondary disabled:opacity-30"
              :disabled="i === 0"
              @click="move(i, -1)"
            >
              <UIcon name="i-lucide-chevron-up" class="size-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              class="rounded-lg p-1.5 text-text-secondary disabled:opacity-30"
              :disabled="i === order.length - 1"
              @click="move(i, 1)"
            >
              <UIcon name="i-lucide-chevron-down" class="size-4" />
            </button>
          </span>
        </div>
      </div>

      <div class="mt-auto">
        <button
          type="button"
          class="w-full rounded-[28px] bg-primary px-6 py-3.5 text-[15px] font-semibold text-on-primary"
          @click="done"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
