/**
 * Stage-color rules (REQUIREMENTS §12.4). Stage colors are untrusted input:
 * clamp lightness into a readable band, auto-pick black/white text for solid
 * fills, and derive alpha tints for chips/timetable entries.
 * Pure module — no Vue imports — so it stays unit-testable.
 */

const HEX_RE = /^#?([0-9a-f]{6})$/i

interface Hsl { h: number, s: number, l: number }

function hexToRgb(hex: string): [number, number, number] | null {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ]
}

const FALLBACK_STAGE_COLOR = '#7C5CFF'
const LIGHTNESS_MIN = 0.38
const LIGHTNESS_MAX = 0.68

/**
 * Clamp an untrusted stage color's HSL lightness into a band readable on both
 * themes. Invalid input falls back to the brand violet.
 */
export function clampStageColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return FALLBACK_STAGE_COLOR
  const hsl = rgbToHsl(...rgb)
  const l = Math.min(LIGHTNESS_MAX, Math.max(LIGHTNESS_MIN, hsl.l))
  if (l === hsl.l) return rgbToHex(...rgb)
  return rgbToHex(...hslToRgb({ ...hsl, l }))
}

/**
 * Black or white text for content sitting ON a solid stage fill, by WCAG
 * relative luminance.
 */
export function stageTextOn(hex: string): '#000000' | '#FFFFFF' {
  const rgb = hexToRgb(hex) ?? hexToRgb(FALLBACK_STAGE_COLOR)!
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.4 ? '#000000' : '#FFFFFF'
}

/**
 * Alpha tint of a stage color for chip/entry backgrounds (§12.4 tinted fills).
 * Returned as a CSS color-mix() expression so it works over both themes.
 */
export function stageTint(hex: string, alpha: number): string {
  const safe = hexToRgb(hex) ? hex.startsWith('#') ? hex : `#${hex}` : FALLBACK_STAGE_COLOR
  const pct = Math.round(Math.min(1, Math.max(0, alpha)) * 100)
  return `color-mix(in srgb, ${safe.toUpperCase()} ${pct}%, transparent)`
}

/** Inline CSS custom properties a component sets once per stage. */
export function stageStyleVars(rawHex: string): Record<string, string> {
  const clamped = clampStageColor(rawHex)
  return {
    '--stage': clamped,
    '--stage-text-on': stageTextOn(clamped),
    '--stage-tint': stageTint(clamped, 0.12),
    '--stage-chip': stageTint(clamped, 0.15),
  }
}
