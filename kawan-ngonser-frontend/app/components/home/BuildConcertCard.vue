<script setup lang="ts">
/**
 * H-6 / B-1 entry card, sitting beside the H-3 upload card. Creating a build
 * is instant and offline — there is nothing to fetch.
 */
import { COPY } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'

const builds = useBuildsStore()
const toast = useToast()

function start() {
  // B-4: the device zone is the sane default — most people build for where
  // they are, and it is the one value we can guess correctly.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const build = builds.create(nowMs(), tz)
  toast.add({ description: COPY.toastBuildCreated, icon: 'i-lucide-circle-check', color: 'success' })
  navigateTo(`/builds/${build.buildId}?step=details`)
}
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-border p-3.5 text-left"
    @click="start"
  >
    <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12">
      <UIcon name="i-lucide-pencil-ruler" class="size-5 text-primary" />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-sm font-semibold text-text">{{ COPY.buildCardTitle }}</span>
      <span class="text-xs text-text-secondary">{{ COPY.buildCardSub }}</span>
    </div>
  </button>
</template>
