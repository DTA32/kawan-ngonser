<script setup lang="ts">
/**
 * B-2 build row: name, counts, last-edited, and the Draft / Ready chip that
 * tells the user at a glance whether this one can be planned or shared yet.
 */
import { type ConcertBuild, readiness } from '~/domain/builds'
import { formatEditedAgo } from '~/domain/time'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'

const props = defineProps<{ build: ConcertBuild }>()

const now = useNow()

const ready = computed(() => readiness(props.build).ready)

const sub = computed(() => {
  const d = props.build.days.length
  const n = props.build.performances.length
  return interpolate(COPY.buildRowSub, {
    d: d === 1 ? '1 day' : `${d} days`,
    n: n === 1 ? '1 set' : `${n} sets`,
    when: formatEditedAgo(props.build.updatedAt, now.value, props.build.timezone),
  })
})
</script>

<template>
  <NuxtLink
    :to="`/builds/${build.buildId}`"
    class="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left"
  >
    <span class="flex size-12 shrink-0 items-center justify-center rounded-[13px] bg-primary/12">
      <UIcon name="i-lucide-pencil-ruler" class="size-[22px] text-primary" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[15px] font-semibold text-text">
        {{ build.name || DESIGN_COPY.builderNewTitle }}
      </span>
      <span class="truncate text-xs text-text-secondary">{{ sub }}</span>
    </span>
    <span
      class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
      :class="ready ? 'bg-success/15 text-success' : 'bg-surface-raised text-text-secondary'"
    >{{ ready ? COPY.buildChipReady : COPY.buildChipDraft }}</span>
  </NuxtLink>
</template>
