<script setup lang="ts">
// One row in the home lists. Planned rows get the gradient logo tile, server
// rows the raised tile, past rows shrink to 44px at 55% opacity.
defineProps<{
  name: string
  dateLabel: string
  logo?: string
  variant: 'planned' | 'available' | 'past'
  chips?: string[]
}>()

defineEmits<{ select: [] }>()

const imgFailed = ref(false)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left"
    :class="variant === 'past' ? 'opacity-55' : ''"
    @click="$emit('select')"
  >
    <div
      class="flex shrink-0 items-center justify-center overflow-hidden"
      :class="[
        variant === 'past' ? 'size-11 rounded-xl' : 'size-14 rounded-[14px]',
        variant === 'planned' && (!logo || imgFailed) ? 'hero-gradient' : 'bg-surface-raised',
      ]"
    >
      <img
        v-if="logo && !imgFailed"
        :src="logo"
        alt=""
        class="size-full object-cover"
        @error="imgFailed = true"
      >
      <UIcon
        v-else
        :name="variant === 'planned' ? 'i-lucide-music-4' : 'i-lucide-music-2'"
        :class="[
          variant === 'planned' ? 'text-white size-[26px]' : 'text-text-secondary',
          variant === 'past' ? 'size-5' : 'size-6',
        ]"
      />
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[15px] font-semibold text-text" :class="variant === 'past' ? 'text-sm' : ''">
        {{ name }}
      </span>
      <span class="truncate text-[13px] text-text-secondary" :class="variant === 'past' ? 'text-xs' : ''">
        {{ dateLabel }}
      </span>
      <div v-if="chips?.length" class="mt-0.5 flex gap-1.5">
        <span
          v-for="chip in chips"
          :key="chip"
          class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
        >{{ chip }}</span>
      </div>
    </div>
    <UIcon v-if="variant !== 'past'" name="i-lucide-chevron-right" class="size-[18px] shrink-0 text-text-muted" />
  </button>
</template>
