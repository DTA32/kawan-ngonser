import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_ORDER, reconcileWidgetOrder, type WidgetId } from '~/domain/types'

/** What every plan written before the past-* widgets existed holds in Dexie. */
const LEGACY: WidgetId[] = ['upNext', 'timetable', 'backburner', 'other', 'nextDays']

describe('reconcileWidgetOrder', () => {
  it('upgrades a legacy order to the full registry', () => {
    // The regression test for the whole migration: without this, a widget
    // added today is invisible to every existing user, forever.
    expect(reconcileWidgetOrder(LEGACY)).toEqual(DEFAULT_WIDGET_ORDER)
  })

  it('keeps a customised order and slots new ids beside their canonical neighbour', () => {
    const reversed: WidgetId[] = ['nextDays', 'other', 'backburner', 'timetable', 'upNext']
    expect(reconcileWidgetOrder(reversed)).toEqual([
      'nextDays',
      'pastDays', // follows nextDays
      'other',
      'pastPerformances', // follows other
      'backburner',
      'timetable',
      'upNext',
    ])
  })

  it('leaves a complete order untouched', () => {
    const custom: WidgetId[] = [...DEFAULT_WIDGET_ORDER].reverse()
    expect(reconcileWidgetOrder(custom)).toEqual(custom)
  })

  it('drops unknown and duplicate ids', () => {
    const result = reconcileWidgetOrder(['other', 'ghost', 'other', 'upNext'])
    expect(result).toHaveLength(DEFAULT_WIDGET_ORDER.length)
    expect(result).not.toContain('ghost')
    expect(result.filter(id => id === 'other')).toHaveLength(1)
    expect([...result].sort()).toEqual([...DEFAULT_WIDGET_ORDER].sort())
  })

  it('falls back to the default order for empty, missing, or garbage input', () => {
    expect(reconcileWidgetOrder([])).toEqual(DEFAULT_WIDGET_ORDER)
    expect(reconcileWidgetOrder(null)).toEqual(DEFAULT_WIDGET_ORDER)
    expect(reconcileWidgetOrder(undefined)).toEqual(DEFAULT_WIDGET_ORDER)
    expect(reconcileWidgetOrder([42, {}, 'nope'])).toEqual(DEFAULT_WIDGET_ORDER)
  })

  it('is idempotent — it runs on every boot', () => {
    const once = reconcileWidgetOrder(['nextDays', 'upNext'])
    expect(reconcileWidgetOrder(once)).toEqual(once)
  })
})
