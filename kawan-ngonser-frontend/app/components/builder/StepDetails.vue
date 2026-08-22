<script setup lang="ts">
/**
 * B-4 concert details + B-11 event id under Advanced. Every field writes
 * through on input (B-9 autosave) — there is no save button anywhere in the
 * Builder.
 */
import type { ConcertBuild } from '~/domain/builds'
import { slugify, suggestEventId } from '~/domain/builds'
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { useBuildsStore } from '~/stores/builds'

const props = defineProps<{ build: ConcertBuild }>()

const builds = useBuildsStore()
const toast = useToast()

const advancedOpen = ref(false)
const eventIdDraft = ref(props.build.eventId)
watch(() => props.build.eventId, id => { eventIdDraft.value = id })

/**
 * Free text is edited locally and written through on a short debounce rather
 * than per keystroke. B-9 autosave still holds — a blur flushes immediately,
 * and so does leaving the step — but a 20-character name is one write and one
 * version bump instead of twenty, which keeps `version` meaningful for the
 * B-14 re-import comparison and off the IndexedDB hot path.
 */
const name = ref(props.build.name)
const place = ref(props.build.place)
const description = ref(props.build.description)
const logo = ref(props.build.logo)

// Re-seed if the underlying build swaps out from under us (route change).
watch(() => props.build.buildId, () => {
  name.value = props.build.name
  place.value = props.build.place
  description.value = props.build.description
  logo.value = props.build.logo
})

function set(patch: Partial<Pick<ConcertBuild, 'name' | 'place' | 'description' | 'timezone' | 'logo'>>) {
  builds.updateMeta(props.build.buildId, patch, nowMs())
}

function flush() {
  const patch: Partial<ConcertBuild> = {}
  if (name.value !== props.build.name) patch.name = name.value
  if (place.value !== props.build.place) patch.place = place.value
  if (description.value !== props.build.description) patch.description = description.value
  if (logo.value !== props.build.logo) patch.logo = logo.value
  if (Object.keys(patch).length > 0) set(patch)
}

watchDebounced([name, place, description, logo], flush, { debounce: 400 })
onBeforeUnmount(flush)

/**
 * B-11: refuse a collision rather than silently renaming — the id is what a
 * recipient's device keys the concert on, so a surprise change is a surprise
 * duplicate on their home screen.
 */
function commitEventId() {
  const desired = slugify(eventIdDraft.value)
  if (!desired || desired === props.build.eventId) {
    eventIdDraft.value = props.build.eventId
    return
  }
  const taken = builds.takenEventIds(props.build.buildId)
  if (taken.has(desired)) {
    const suggestion = suggestEventId(desired, taken)
    toast.add({
      description: interpolate(COPY.toastEventIdTaken, { suggestion }),
      icon: 'i-lucide-triangle-alert',
      color: 'warning',
    })
    eventIdDraft.value = props.build.eventId
    return
  }
  builds.updateMeta(props.build.buildId, { eventId: desired }, nowMs())
}

const inputClass = 'min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted'
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <h1 class="font-heading text-2xl font-bold leading-tight text-text">{{ COPY.stepDetails }}</h1>
      <p class="text-sm leading-relaxed text-text-secondary">{{ DESIGN_COPY.detailsSub }}</p>
    </div>

    <div class="flex flex-col gap-3.5">
      <BuilderField :label="DESIGN_COPY.fieldName" icon="i-lucide-type">
        <input v-model="name" :class="inputClass" placeholder="Bandung Berisik 2026" @blur="flush">
      </BuilderField>

      <BuilderField :label="DESIGN_COPY.fieldPlace" icon="i-lucide-map-pin">
        <input v-model="place" :class="inputClass" placeholder="Lapangan Gasibu, Bandung" @blur="flush">
      </BuilderField>

      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-[1px] text-text-muted">
          {{ DESIGN_COPY.fieldDescription }}
        </span>
        <textarea
          v-model="description"
          rows="3"
          class="resize-none rounded-xl bg-surface px-3.5 py-3 text-sm leading-relaxed text-text outline-none ring-1 ring-inset ring-border placeholder:text-text-muted focus:ring-primary"
          placeholder="What is this concert about?"
          @blur="flush"
        />
      </label>

      <BuilderField :label="DESIGN_COPY.fieldTimezone" icon="i-lucide-globe">
        <input
          :value="build.timezone"
          :class="inputClass"
          placeholder="Asia/Jakarta"
          @change="set({ timezone: ($event.target as HTMLInputElement).value.trim() })"
        >
      </BuilderField>

      <BuilderField :label="DESIGN_COPY.fieldLogo" icon="i-lucide-link">
        <input v-model="logo" :class="inputClass" :placeholder="DESIGN_COPY.fieldOptional" @blur="flush">
      </BuilderField>
    </div>

    <!-- B-11 -->
    <div class="flex flex-col gap-3 rounded-2xl bg-surface p-3.5">
      <button
        type="button"
        class="flex w-full items-center gap-2 text-left"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 text-text-secondary transition-transform"
          :class="advancedOpen ? '' : '-rotate-90'"
        />
        <span class="flex-1 text-[13px] font-semibold text-text">{{ DESIGN_COPY.advancedLabel }}</span>
      </button>
      <template v-if="advancedOpen">
        <div class="flex items-center gap-2 rounded-[10px] bg-surface-raised px-3 py-2.5">
          <UIcon name="i-lucide-hash" class="size-[15px] shrink-0 text-text-muted" />
          <input
            v-model="eventIdDraft"
            class="min-w-0 flex-1 bg-transparent text-[13px] font-semibold tracking-[0.2px] text-text outline-none"
            spellcheck="false"
            autocapitalize="off"
            @blur="commitEventId"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          >
          <UIcon name="i-lucide-pencil" class="size-[15px] shrink-0 text-text-muted" />
        </div>
        <p class="text-xs leading-relaxed text-text-muted">{{ DESIGN_COPY.eventIdNote }}</p>
      </template>
    </div>

    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-check" class="size-3.5 text-success" />
      <span class="text-xs text-text-muted">{{ DESIGN_COPY.autosaveNote }}</span>
    </div>
  </div>
</template>
