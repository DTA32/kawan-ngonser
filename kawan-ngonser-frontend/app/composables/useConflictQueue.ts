/**
 * Shared O-4 prompt queue for the concert-day board: sync revalidation,
 * W-4 "Watch this", and sheet actions can all enqueue clashes; the board's
 * ConflictSheet consumes the head.
 */
import type { PickEffect } from '~/domain/picks'
import type { ConflictPrompt } from '~/domain/types'

export function useConflictQueue() {
  const queue = useState<ConflictPrompt[]>('kn-conflict-queue', () => [])

  return {
    queue,
    push(prompts: ConflictPrompt[]): void {
      if (prompts.length) queue.value = [...queue.value, ...prompts]
    },
    pushFromEffects(effects: PickEffect[]): void {
      const prompts = effects
        .filter(e => e.type === 'conflict')
        .map(e => (e as { prompt: ConflictPrompt }).prompt)
      if (prompts.length) queue.value = [...queue.value, ...prompts]
    },
    shift(): void {
      queue.value = queue.value.slice(1)
    },
    clear(): void {
      queue.value = []
    },
  }
}
