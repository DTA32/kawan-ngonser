/**
 * Overlay state for every bottom sheet / dialog — sheets are state, not
 * routes. One stack so a sheet can open on top of another (e.g. W-4
 * "Watch this" → conflict sheet).
 */
import type { ConflictPrompt } from '~/domain/types'

export type SheetState
  = | { kind: 'concertDetail', eventId: string }
    | { kind: 'performance', eventId: string, performanceId: string }
    | { kind: 'editPerformance', eventId: string, performanceId: string }
    | { kind: 'customEvent', eventId: string, customEventId: string | null, prefillStartMs?: number }
    | { kind: 'conflict', eventId: string, prompts: ConflictPrompt[] }
    | { kind: 'leadTime', eventId: string }
    | { kind: 'conflictDisplay', eventId: string }

export function useSheets() {
  const stack = useState<SheetState[]>('kn-sheets', () => [])

  return {
    stack,
    top: computed(() => stack.value[stack.value.length - 1] ?? null),
    open(sheet: SheetState): void {
      stack.value = [...stack.value, sheet]
    },
    close(): void {
      stack.value = stack.value.slice(0, -1)
    },
    closeAll(): void {
      stack.value = []
    },
    replace(sheet: SheetState): void {
      stack.value = [...stack.value.slice(0, -1), sheet]
    },
  }
}
