<script setup lang="ts">
/**
 * Every bottom sheet: UDrawer (drag-to-dismiss + overlay) restyled to the
 * design — 20px top radius, $surface-raised, our own 36×4 grabber.
 */
// NOTE: an absent Boolean prop is cast to `false` by Vue — the default must
// be declared explicitly or every sheet becomes non-dismissible.
const props = withDefaults(defineProps<{
  /** Set false for the O-4 conflict sheet ("repeats until resolved") */
  dismissible?: boolean
}>(), { dismissible: true })

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <UDrawer
    v-model:open="open"
    direction="bottom"
    :handle="false"
    :dismissible="props.dismissible"
    :ui="{
      content: 'rounded-t-[20px] bg-surface-raised ring-0 max-w-[430px] mx-auto',
    }"
  >
    <template #content>
      <div class="flex flex-col gap-4 px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
        <div class="flex justify-center">
          <div class="h-1 w-9 rounded-sm bg-text-muted" />
        </div>
        <slot />
      </div>
    </template>
  </UDrawer>
</template>
