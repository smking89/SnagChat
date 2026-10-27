'use client'

import type { SnagLayout, SnagPin } from '@/lib/types'

export type OverlayId = 'none' | 'crt' | 'hud' | 'grain'

export const OVERLAYS: Array<{ id: OverlayId; label: string; glyph: string }> = [
  { id: 'none', label: 'Raw', glyph: '◻' },
  { id: 'crt', label: 'CRT', glyph: '▤' },
  { id: 'hud', label: 'HUD', glyph: '◎' },
  { id: 'grain', label: 'Grain', glyph: '▒' },
]

// Typographic geometry only: no system emoji anywhere a snag is composed.
export const STICKERS = ['◆', '◎', '⌁', '◈', '★', '◇', '▲', '◉', '⟡', '⌘', '◐', '◒']

/** Bakes the selected overlay into the captured frame (HUD, scanlines, grain). */
export function applyOverlay(canvas: HTMLCanvasElement, overlay: OverlayId): void {
  const context = canvas.getContext('2d')
  if (!context || overlay === 'none') return
  const { width, height } = canvas

  if (overlay === 'crt') {
    context.save()
    context.globalAlpha = 0.22
    context.fillStyle = '#000000'
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2)
    context.globalAlpha = 0.35
    const sweep = context.createLinearGradient(0, 0, 0, height)
    sweep.addColorStop(0, 'rgba(120,255,240,0.20)')
    sweep.addColorStop(0.5, 'rgba(0,0,0,0)')
    sweep.addColorStop(1, 'rgba(255,60,200,0.18)')
    context.fillStyle = sweep
    context.fillRect(0, 0, width, height)
    context.restore()
    return
  }

  if (overlay === 'hud') {
    const pad = Math.round(width * 0.06)
    const arm = Math.round(width * 0.1)
    context.save()
    context.strokeStyle = 'rgba(255,255,255,0.95)'
    context.lineWidth = Math.max(2, width * 0.006)
    const corners = [
      [pad, pad, 1, 1],
      [width - pad, pad, -1, 1],
      [pad, height - pad, 1, -1],
      [width - pad, height - pad, -1, -1],
    ]
    for (const [x, y, dx, dy] of corners) {
      context.beginPath()
      context.moveTo(x + arm * dx, y)
      context.lineTo(x, y)
      context.lineTo(x, y + arm * dy)
      context.stroke()
    }
    context.beginPath()
    context.arc(width / 2, height / 2, width * 0.055, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.moveTo(width / 2 - width * 0.13, height / 2)
    context.lineTo(width / 2 - width * 0.08, height / 2)
    context.moveTo(width / 2 + width * 0.08, height / 2)
    context.lineTo(width / 2 + width * 0.13, height / 2)
    context.stroke()
    context.font = `${Math.round(width * 0.026)}px ui-monospace, monospace`
    context.fillStyle = 'rgba(255,255,255,0.95)'
    context.fillText('REC ● 00:24:18', pad, pad + Math.round(width * 0.055))
    context.fillText('ISO 800  1/60  f2.0', pad, height - pad - Math.round(width * 0.02))
    context.restore()
    return
  }

  if (overlay === 'grain') {
    const image = context.getImageData(0, 0, width, height)
    const data = image.data
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 42
      data[i] = Math.min(255, Math.max(0, data[i] + noise))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
    }
    context.putImageData(image, 0, 0)
    const vignette = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
    context.fillStyle = vignette
    context.fillRect(0, 0, width, height)
  }
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

/** Color signature for the discovery matrix: the three strongest buckets. */
export function samplePalette(canvas: HTMLCanvasElement): string[] {
  const scratch = document.createElement('canvas')
  scratch.width = 40
  scratch.height = 40
  const context = scratch.getContext('2d')
  if (!context) return []
  context.drawImage(canvas, 0, 0, 40, 40)
  const { data } = context.getImageData(0, 0, 40, 40)

  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = `${r >> 4}:${g >> 4}:${b >> 4}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n += 1
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((bucket) => toHex(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n))
}

export function buildLayout(overlay: OverlayId, pins: SnagPin[]): SnagLayout {
  return { overlay, pins }
}
