<script setup lang="ts">
// F-2 banners on the hero gradient: day-complete (C13 + C22 peek button) or
// concert-complete (C14). Copy is 🛰 app-config with built-in fallbacks.
import { COPY, interpolate } from '~/utils/copy'
import { useAppConfigStore } from '~/stores/appConfig'

const props = defineProps<{
  variant: 'day' | 'concert'
  /** Next attending day (day variant) */
  nextDayIndex?: number | null
  eventId: string
}>()

const appConfig = useAppConfigStore()

const message = computed(() => {
  const key = props.variant === 'day' ? 'day_complete_banner' : 'concert_complete_banner'
  const raw = appConfig.copy(key)
  const text = typeof raw === 'string' ? raw : raw.text
  return interpolate(text, { x: props.nextDayIndex ?? '' })
})
</script>

<template>
  <div class="hero-gradient flex flex-col gap-3 rounded-2xl p-4">
    <p class="text-sm font-semibold leading-relaxed text-white">{{ message }}</p>
    <NuxtLink
      v-if="variant === 'day' && nextDayIndex"
      :to="`/concerts/${eventId}/day/${nextDayIndex}`"
      class="self-start rounded-[20px] bg-white px-4 py-[9px] text-[13px] font-semibold text-primary-pressed"
    >
      {{ interpolate(COPY.peekDayAction, { x: nextDayIndex }) }}
    </NuxtLink>
  </div>
</template>
