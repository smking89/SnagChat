import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { maybeSweep } from '@/lib/invalidation'
import { dominantHue } from '@/lib/metadata'
import { areFriends } from '@/lib/social'
import { ALLOWED_MEDIA, MAX_SNAP_BYTES, createSnap, type SnagLayout } from '@/lib/snaps'

function parsePalette(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && /^#[0-9a-f]{6}$/i.test(entry))
      .slice(0, 5)
  } catch {
    return []
  }
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw) return []
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
    .slice(0, 8)
}

function parseLayout(raw: FormDataEntryValue | null): SnagLayout | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw) as SnagLayout
    if (!parsed || typeof parsed !== 'object') return null
    const pins = Array.isArray(parsed.pins)
      ? parsed.pins
          .filter(
            (pin) =>
              pin &&
              typeof pin.emoji === 'string' &&
              typeof pin.x === 'number' &&
              typeof pin.y === 'number' &&
              pin.x >= 0 &&
              pin.x <= 1 &&
              pin.y >= 0 &&
              pin.y <= 1
          )
          .slice(0, 12)
          .map((pin) => ({
            emoji: pin.emoji.slice(0, 4),
            x: pin.x,
            y: pin.y,
            scale: typeof pin.scale === 'number' ? Math.min(2, Math.max(0.5, pin.scale)) : 1,
          }))
      : []
    return {
      overlay: typeof parsed.overlay === 'string' ? parsed.overlay.slice(0, 16) : 'none',
      pins,
    }
  } catch {
    return null
  }
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'Expected a multipart form' }, 400)
  }

  const file = form.get('media')
  if (!(file instanceof File)) return json({ error: 'No photo attached' }, 400)
  if (file.size === 0) return json({ error: 'That photo is empty' }, 400)
  if (file.size > MAX_SNAP_BYTES) return json({ error: 'Photos must be under 8MB' }, 413)

  const mediaType = file.type || 'image/jpeg'
  if (!ALLOWED_MEDIA.includes(mediaType)) return json({ error: 'Photos must be JPEG, PNG, WebP or SVG' }, 415)

  const captionRaw = form.get('caption')
  const caption = typeof captionRaw === 'string' ? captionRaw.trim().slice(0, 120) || null : null

  const durationRaw = Number(form.get('duration'))
  const duration = Number.isFinite(durationRaw) ? Math.min(10, Math.max(1, Math.round(durationRaw))) : 5

  const isStory = form.get('story') === 'true'
  const recipientIds = String(form.get('recipients') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30)

  if (!isStory && recipientIds.length === 0) {
    return json({ error: 'Pick at least one friend, or add it to the flash stream' }, 400)
  }

  const accepted: string[] = []
  for (const recipientId of new Set(recipientIds)) {
    if (recipientId === user.id) continue
    if (await areFriends(user.id, recipientId)) accepted.push(recipientId)
  }
  if (!isStory && accepted.length === 0) {
    return json({ error: 'Pick at least one friend, or add it to your story' }, 400)
  }

  const palette = parsePalette(form.get('palette'))
  const tags = parseTags(form.get('tags'))
  const layout = parseLayout(form.get('layout'))
  const bytes = await file.arrayBuffer()
  const contentHash = await sha256(bytes)

  const created = await createSnap({
    senderId: user.id,
    recipientIds: accepted,
    isStory,
    bytes,
    mediaType,
    caption,
    duration,
    palette,
    dominantHue: dominantHue(palette),
    tags,
    layout,
    contentHash,
  })

  await maybeSweep()
  return json({ ok: true, ids: created.ids, sent: accepted.length, story: isStory })
}
