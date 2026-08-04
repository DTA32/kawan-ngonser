import { describe, expect, it } from 'vitest'
import { clampStageColor, stageStyleVars, stageTextOn, stageTint } from '~/utils/stage-color'

describe('clampStageColor', () => {
  it('keeps colors already inside the readable band', () => {
    expect(clampStageColor('#E85D75')).toBe('#E85D75')
  })

  it('darkens neon yellow into the band', () => {
    const clamped = clampStageColor('#FFFF00') // l = 0.5 + fully saturated? l is 0.5 → inside band
    expect(clamped).toBe('#FFFF00')
  })

  it('lifts near-black into the band', () => {
    const clamped = clampStageColor('#050505')
    expect(clamped).not.toBe('#050505')
    // lightness should now be at the minimum bound (grey stays grey)
    expect(clamped).toBe('#616161')
  })

  it('darkens near-white into the band', () => {
    const clamped = clampStageColor('#FDFDFD')
    expect(clamped).toBe('#ADADAD')
  })

  it('falls back to brand violet on garbage input', () => {
    expect(clampStageColor('not-a-color')).toBe('#7C5CFF')
    expect(clampStageColor('#12345')).toBe('#7C5CFF')
  })

  it('accepts hex without leading #', () => {
    expect(clampStageColor('E85D75')).toBe('#E85D75')
  })
})

describe('stageTextOn', () => {
  it('picks black on bright fills', () => {
    expect(stageTextOn('#FFB020')).toBe('#000000')
    expect(stageTextOn('#3DDC97')).toBe('#000000')
  })

  it('picks white on dark fills', () => {
    expect(stageTextOn('#7C5CFF')).toBe('#FFFFFF')
    expect(stageTextOn('#0F1017')).toBe('#FFFFFF')
  })
})

describe('stageTint', () => {
  it('produces a color-mix with the rounded percentage', () => {
    expect(stageTint('#E85D75', 0.12)).toBe('color-mix(in srgb, #E85D75 12%, transparent)')
  })

  it('clamps alpha into [0,1]', () => {
    expect(stageTint('#E85D75', 4)).toBe('color-mix(in srgb, #E85D75 100%, transparent)')
    expect(stageTint('#E85D75', -1)).toBe('color-mix(in srgb, #E85D75 0%, transparent)')
  })
})

describe('stageStyleVars', () => {
  it('returns the full var set from one raw color', () => {
    const vars = stageStyleVars('#E85D75')
    expect(vars['--stage']).toBe('#E85D75')
    expect(vars['--stage-text-on']).toBe('#FFFFFF')
    expect(vars['--stage-tint']).toContain('12%')
    expect(vars['--stage-chip']).toContain('15%')
  })
})
