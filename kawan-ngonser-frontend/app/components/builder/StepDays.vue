<script setup lang="ts">
/**
 * B-5 days. dayIndex is derived from date order, never entered — re-dating a
 * day re-sorts the list, renumbers everything and re-stamps that day's sets
 * onto the new date (store: setDayDate → restampDay → normalizeDays).
 */
import { type ConcertBuild, countSetsOnDay } from '~/domain/builds'
import { addDays, formatDayDateLong, todayInZone } from '~/domain/time'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'

const props = defineProps<{ build: ConcertBuild }>()

const builds = useBuildsStore()

const rows = computed(() => props.build.days.map(d => ({
  ...d,
  setCount: countSetsOnDay(props.build, d.dayIndex),
  label: formatDayDateLong(d.date, props.build.timezone),
})))

function addDay() {
  const last = props.build.days.at(-1)
  const date = last ? addDays(last.date, 1) : todayInZone(props.build.timezone, nowMs())
  builds.addDay(props.build.buildId, date, nowMs())
}

function onDateChange(dayIndex: number, value: string) {
  if (value) builds.setDayDate(props.build.buildId, dayIndex, value, nowMs())
}

const pendingRemoval = ref<{ dayIndex: number, date: string, setCount: number } | null>(null)
const confirmOpen = ref(false)

function askRemove(row: { dayIndex: number, date: string, setCount: number }) {
  // Nothing to lose — skip the dialog rather than nag.
  if (row.setCount === 0) {
    builds.removeDay(props.build.buildId, row.dayIndex, nowMs())
    return
  }
  pendingRemoval.value = row
  confirmOpen.value = true
}

function confirmRemove() {
  if (pendingRemoval.value) builds.removeDay(props.build.buildId, pendingRemoval.value.dayIndex, nowMs())
  pendingRemoval.value = null
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">{{ COPY.stepDays }}</h1>
      <p class="text-sm leading-relaxed text-text-secondary">{{ DESIGN_COPY.daysSub }}</p>
    </div>

    <div class="flex flex-col gap-2.5">
      <div
        v-for="row in rows"
        :key="row.dayIndex"
        class="flex items-center gap-3 rounded-[14px] bg-surface p-3"
      >
        <span class="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-surface-raised text-[15px] font-bold text-text">
          {{ row.dayIndex }}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="relative text-sm font-semibold text-text">
            {{ row.label }}
            <!-- The native picker is the control; the formatted label is the face -->
            <input
              type="date"
              :value="row.date"
              :aria-label="`Date of day ${row.dayIndex}`"
              class="absolute inset-0 size-full cursor-pointer opacity-0"
              @change="onDateChange(row.dayIndex, ($event.target as HTMLInputElement).value)"
            >
          </span>
          <span class="text-xs text-text-secondary">
            {{ row.setCount === 1 ? '1 set' : `${row.setCount} sets` }}
          </span>
        </span>
        <button
          type="button"
          :aria-label="`Remove day ${row.dayIndex}`"
          class="-m-1 p-1"
          @click="askRemove(row)"
        >
          <UIcon name="i-lucide-x" class="size-[18px] text-text-muted" />
        </button>
      </div>

      <BuilderAddRow :label="DESIGN_COPY.addDayCta" @click="addDay" />
    </div>

    <div class="flex items-start gap-2.5 rounded-xl bg-info/[0.08] px-3 py-2.5">
      <UIcon name="i-lucide-info" class="mt-px size-4 shrink-0 text-info" />
      <p class="text-xs leading-relaxed text-text-secondary">{{ DESIGN_COPY.daysNote }}</p>
    </div>

    <CommonConfirmDialog
      v-model:open="confirmOpen"
      danger
      :title="DESIGN_COPY.removeDayTitle"
      :body="interpolate(DESIGN_COPY.removeDayBody, {
        n: pendingRemoval?.setCount ?? 0,
        date: formatDayDateLong(pendingRemoval?.date ?? '', build.timezone),
      })"
      :confirm-label="DESIGN_COPY.removeDayConfirm"
      :cancel-label="COPY.deleteBuildKeep"
      @confirm="confirmRemove"
      @cancel="pendingRemoval = null"
    />
  </div>
</template>
