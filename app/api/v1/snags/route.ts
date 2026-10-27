import { apiError, apiJson, authenticateApiRequest, checkWriteBudget } from '@/lib/apiKeys'
import { ensureSchema, findUserByUsername } from '@/lib/db'
import { dominantHue } from '@/lib/metadata'
import { DM_SNAP_TTL_MS } from '@/lib/schema'
import { listKeptSnags } from '@/lib/snags'
import { ALLOWED_MEDIA, MAX_SNAP_BYTES, createSnap, type SnagLayout } from '@/lib/snaps'
import { areFriends } from '@/lib/social'

export const dynamic = 'force-dynamic'

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

function parseOverlay(raw: FormDataEntryValue | null): SnagLayout | null {
  if (typeof raw !== 'string' || !raw) return null
  const overlay = raw.trim().slice(0, 16)
  if (!overlay) return null
  return { overlay, pins: [] }
}

function toPublicSnag(snag: Awaited<ReturnType<typeof listKeptSnags>>[number]) {
  return {
    id: snag.snagId,
    caption: snag.caption,
    mediaType: snag.mediaType,
    createdAt: new Date(snag.createdAt).toISOString(),
    keptAt: new Date(snag.keptAt).toISOString(),
    palette: snag.palette,
    tags: snag.tags,
    note: snag.note,
    overlay: snag.overlay,
  }
}

/** Kept snags for the account that owns the key. */
export async function GET(request: Request) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  return apiJson({ snags: (await listKeptSnags(auth.user.id)).map(toPublicSnag) })
}

/**
 * Uploads a snag. Multipart: `media` plus optional `caption`, `tags`, `palette`,
 * `duration`, `overlay`, and either `to` (handles) or `story=true`.
 */
export async function POST(request: Request) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const limited = await checkWriteBudget(auth.keyId)
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiError(400, 'bad_body', 'Send a multipart/form-data body with a `media` file.')
  }

  const file = form.get('media')
  if (!(file instanceof File)) return apiError(400, 'missing_media', 'No `media` file attached.')
  if (file.size === 0) return apiError(400, 'empty_media', 'That file is empty.')
  if (file.size > MAX_SNAP_BYTES) return apiError(413, 'media_too_large', 'Media must be under 8MB.')

  const mediaType = file.type || 'image/jpeg'
  if (!ALLOWED_MEDIA.includes(mediaType)) {
    return apiError(415, 'unsupported_media', 'Media must be JPEG, PNG, WebP or SVG.')
  }

  const isStory = form.get('story') === 'true'
  const handles = String(form.get('to') ?? '')
    .split(',')
    .map((handle) => handle.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 30)

  if (!isStory && handles.length === 0) {
    return apiError(400, 'missing_recipient', 'Set `to` with one or more handles, or `story=true` for the flash stream.')
  }

  const recipientIds: string[] = []
  const acceptedHandles: string[] = []
  for (const handle of new Set(handles)) {
    const recipient = await findUserByUsername(handle)
    if (!recipient) return apiError(404, 'unknown_recipient', `No account is using @${handle}.`)
    if (recipient.id === auth.user.id) continue
    if (!(await areFriends(auth.user.id, recipient.id))) {
      return apiError(403, 'not_friends', `You and @${handle} are not on each other's crew.`)
    }
    recipientIds.push(recipient.id)
    acceptedHandles.push(handle)
  }

  if (!isStory && recipientIds.length === 0) {
    return apiError(400, 'missing_recipient', 'None of those handles can receive a snag from this account.')
  }

  const captionRaw = form.get('caption')
  const caption = typeof captionRaw === 'string' ? captionRaw.trim().slice(0, 120) || null : null

  const durationRaw = Number(form.get('duration'))
  const duration = Number.isFinite(durationRaw) ? Math.min(10, Math.max(1, Math.round(durationRaw))) : 5

  const palette = parsePalette(form.get('palette'))
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const contentHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)

  const created = await createSnap({
    senderId: auth.user.id,
    recipientIds,
    isStory,
    bytes,
    mediaType,
    caption,
    duration,
    palette,
    dominantHue: dominantHue(palette),
    tags: parseTags(form.get('tags')),
    layout: parseOverlay(form.get('overlay')),
    contentHash,
  })

  const expiresAt = new Date(Date.now() + DM_SNAP_TTL_MS).toISOString()
  return apiJson(
    {
      snags: created.ids.map((id) => ({
        id,
        to: isStory ? 'flash' : `@${acceptedHandles.join(', @')}`,
        expiresAt,
      })),
    },
    201
  )
}
