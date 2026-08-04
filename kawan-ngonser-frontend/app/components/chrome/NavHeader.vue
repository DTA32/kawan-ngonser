<script setup lang="ts">
// Flow screens (onboarding / settings): back chevron + title
const props = defineProps<{
  title: string
  backTo?: string
}>()

const router = useRouter()

function goBack() {
  if (props.backTo) router.push(props.backTo)
  else router.back()
}
</script>

<template>
  <div class="flex items-center gap-3 px-5 py-3">
    <button type="button" aria-label="Back" class="-ml-1 flex items-center p-1" @click="goBack">
      <UIcon name="i-lucide-chevron-left" class="size-6 text-text" />
    </button>
    <span class="font-heading text-[17px] font-bold text-text">{{ title }}</span>
  </div>
</template>
