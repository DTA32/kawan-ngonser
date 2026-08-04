/**
 * G-5: wraps the color-mode module (System/Light/Dark, dark fallback, class
 * applied pre-paint by the module) and keeps the PWA theme-color meta in sync
 * with the active theme (G-5d).
 */
export function useAppTheme() {
  const colorMode = useColorMode()

  const resolved = computed<'light' | 'dark'>(() =>
    colorMode.value === 'light' ? 'light' : 'dark',
  )

  useHead({
    meta: [
      {
        name: 'theme-color',
        content: () => (resolved.value === 'light' ? '#FAFAFC' : '#0F1017'),
      },
    ],
  })

  return {
    /** 'system' | 'light' | 'dark' — the user's stored choice */
    preference: computed({
      get: () => colorMode.preference as 'system' | 'light' | 'dark',
      set: (v) => { colorMode.preference = v },
    }),
    /** 'light' | 'dark' — what is actually applied */
    resolved,
  }
}
