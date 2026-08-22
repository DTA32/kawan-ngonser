/** B-3 step registry — shared by the rail, the page router and the titles. */
export const BUILD_STEPS = [
  { id: 'details', short: 'Details' },
  { id: 'days', short: 'Days' },
  { id: 'stages', short: 'Stages' },
  { id: 'sets', short: 'Sets' },
] as const

export type BuildStep = typeof BUILD_STEPS[number]['id']

export const BUILD_STEP_IDS: BuildStep[] = BUILD_STEPS.map(s => s.id)

export function isBuildStep(value: unknown): value is BuildStep {
  return typeof value === 'string' && (BUILD_STEP_IDS as string[]).includes(value)
}
