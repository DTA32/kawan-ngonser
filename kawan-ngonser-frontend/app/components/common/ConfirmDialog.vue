<script setup lang="ts">
// Centered confirm dialog (design "Dialog – Sync Overwrite (C12)"); also S-5.
defineProps<{
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ confirm: [], cancel: [] }>()

function onConfirm() {
  open.value = false
  emit('confirm')
}
function onCancel() {
  open.value = false
  emit('cancel')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'rounded-[20px] bg-surface-raised ring-1 ring-border max-w-[340px]' }"
  >
    <template #content>
      <div class="flex flex-col gap-3.5 p-5">
        <h2 class="font-heading text-[17px] font-bold leading-snug text-text">{{ title }}</h2>
        <p class="text-sm leading-relaxed text-text-secondary">{{ body }}</p>
        <div class="mt-1 flex flex-col gap-2">
          <button
            type="button"
            class="w-full rounded-[24px] px-5 py-3 text-sm font-semibold text-on-primary"
            :class="danger ? 'bg-danger' : 'bg-primary'"
            @click="onConfirm"
          >
            {{ confirmLabel }}
          </button>
          <button
            type="button"
            class="w-full rounded-[24px] px-5 py-3 text-sm font-semibold text-text ring-1 ring-inset ring-border"
            @click="onCancel"
          >
            {{ cancelLabel }}
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
