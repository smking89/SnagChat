/**
 * Metadata parser: turns the palette the client sampled from a capture into a
 * queryable colorway signature, and normalises user tags.
 * Pure functions only — mirrored by services/metadata_parser.py.
 */

export type Rgb = { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

/** Hue in degrees, 0–359. Returns null for greys, where hue is meaningless. */
export function hexToHue(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta < 0.04) return null

  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4

  const degrees = Math.round(hue * 60)
  return (degrees + 360) % 360
}

/** The first palette entry with real chroma is the snag's colourway. */
export function dominantHue(palette: string[]): number | null {
  for (const hex of palette) {
    const hue = hexToHue(hex)
    if (hue !== null) return hue
  }
  return null
}

export function hueBucket(hue: number | null): number | null {
  if (hue === null) return null
  return (Math.round(hue / 18) * 18) % 360
}

const COLOR_NAMES: Array<{ name: string; hue: number }> = [
  { name: 'ember', hue: 12 },
  { name: 'citrus', hue: 44 },
  { name: 'acid', hue: 84 },
  { name: 'mint', hue: 150 },
  { name: 'ocean', hue: 205 },
  { name: 'ultraviolet', hue: 265 },
  { name: 'magenta', hue: 320 },
]

export function colorwayName(hue: number | null): string {
  if (hue === null) return 'mono'
  let best = COLOR_NAMES[0]
  let bestDistance = 360
  for (const entry of COLOR_NAMES) {
    const distance = Math.min(Math.abs(entry.hue - hue), 360 - Math.abs(entry.hue - hue))
    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
    }
  }
  return best.name
}

export function normalizeTags(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(',')
  const seen = new Set<string>()
  for (const entry of list) {
    const tag = entry
      .trim()
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20)
    if (tag) seen.add(tag)
  }
  return Array.from(seen).slice(0, 8)
}
