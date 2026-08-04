<script setup lang="ts">
/**
 * §7.3 settings — frequent/harmless first, destructive last (S-1…S-5).
 * Lead-time + conflict-display open sheets; cancel sits behind a confirm.
 */
import { COPY, DESIGN_COPY, interpolate } from '~/utils/copy'
import { useAppConfigStore } from '~/stores/appConfig'
import { useConcertCacheStore } from '~/stores/concertCache'

definePageMeta({ layout: 'flow' })

const route = useRoute()
const router = useRouter()
const eventId = computed(() => route.params.id as string)

const cache = useConcertCacheStore()
const appConfig = useAppConfigStore()
const plan = usePlan(eventId)
const toast = useToast()

const concert = computed(() => cache.getConcert(eventId.value))

onMounted(() => {
  if (!plan.exists.value) router.replace('/')
})

const leadTimeSheetOpen = ref(false)
const conflictSheetOpen = ref(false)
const cancelConfirmOpen = ref(false)

const leadTimeLabel = computed(() =>
  `${plan.settings.value?.leadTimeOverrideMin ?? appConfig.config.defaultLeadTimeMin} min`)

const conflictLabel = computed(() =>
  plan.settings.value?.conflictDisplayPref === 'hidden' ? 'Hidden' : 'Equal')

function onCancelPlan() {
  plan.cancelPlan()
  router.replace('/')
}

function savedToast(description: string) {
  toast.add({ description, icon: 'i-lucide-circle-check', color: 'success' })
}

function onLeadTimeSaved(min: number) {
  savedToast(interpolate(COPY.toastLeadTimeSaved, { n: min }))
}

function onConflictSaved() {
  savedToast(COPY.toastConflictDisplaySaved)
}
</script>

<template>
  <div v-if="concert" class="flex flex-1 flex-col">
    <ChromeNavHeader :title="`Settings · ${concert.name}`" />

    <div class="flex flex-1 flex-col gap-6 px-5 pb-7 pt-4">
      <!-- PERSONALIZE -->
      <section class="flex flex-col gap-2.5">
        <CommonSectionLabel>Personalize</CommonSectionLabel>
        <div class="overflow-hidden rounded-2xl bg-surface">
          <NuxtLink
            :to="`/concerts/${eventId}/settings/widgets`"
            class="flex w-full items-center gap-3 p-3.5"
          >
            <UIcon name="i-lucide-layout-grid" class="size-[18px] text-text-secondary" />
            <span class="flex-1 text-sm font-medium text-text">Rearrange widgets</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-text-muted" />
          </NuxtLink>
          <div class="h-px bg-border" />
          <button type="button" class="flex w-full items-center gap-3 p-3.5 text-left" @click="leadTimeSheetOpen = true">
            <UIcon name="i-lucide-bell" class="size-[18px] text-text-secondary" />
            <span class="flex-1 text-sm font-medium text-text">Notification lead time</span>
            <span class="text-[13px] text-text-secondary">{{ leadTimeLabel }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-text-muted" />
          </button>
          <div class="h-px bg-border" />
          <button type="button" class="flex w-full items-center gap-3 p-3.5 text-left" @click="conflictSheetOpen = true">
            <UIcon name="i-lucide-rows-3" class="size-[18px] text-text-secondary" />
            <span class="flex-1 text-sm font-medium text-text">Conflict display</span>
            <span class="text-[13px] text-text-secondary">{{ conflictLabel }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-text-muted" />
          </button>
        </div>
      </section>

      <!-- CONCERTS -->
      <section class="flex flex-col gap-2.5">
        <CommonSectionLabel>Concerts</CommonSectionLabel>
        <div class="overflow-hidden rounded-2xl bg-surface">
          <NuxtLink to="/?browse=1" class="flex w-full items-center gap-3 p-3.5">
            <UIcon name="i-lucide-repeat" class="size-[18px] text-text-secondary" />
            <span class="flex-1 text-sm font-medium text-text">See other concerts</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-text-muted" />
          </NuxtLink>
        </div>
      </section>

      <!-- Danger zone (S-5: last, visually distinct, behind a confirm) -->
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-2xl bg-danger/8 p-3.5 text-left ring-1 ring-inset ring-danger/20"
        @click="cancelConfirmOpen = true"
      >
        <UIcon name="i-lucide-trash-2" class="size-[18px] text-danger" />
        <span class="flex-1 text-sm font-semibold text-danger">Cancel this concert plan</span>
      </button>
    </div>

    <SettingsLeadTimeSheet
      v-model:open="leadTimeSheetOpen"
      :event-id="eventId"
      @saved="onLeadTimeSaved"
    />
    <SettingsConflictDisplaySheet
      v-model:open="conflictSheetOpen"
      :event-id="eventId"
      @saved="onConflictSaved"
    />
    <CommonConfirmDialog
      v-model:open="cancelConfirmOpen"
      :title="DESIGN_COPY.cancelPlanTitle"
      :body="interpolate(DESIGN_COPY.cancelPlanBody, { concert: concert.name })"
      :confirm-label="DESIGN_COPY.cancelPlanConfirm"
      :cancel-label="DESIGN_COPY.cancelPlanKeep"
      danger
      @confirm="onCancelPlan"
    />
  </div>
</template>
