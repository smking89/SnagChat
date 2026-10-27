import { getEnv } from './db'
import { DM_SNAP_TTL_MS } from './schema'
import { areFriends } from './social'
import type { SnagLayout, SnagMeta } from './types'

export type { SnagLayout, SnagMeta, SnagPin } from './types'

export const MAX_SNAP_BYTES = 8 * 1024 * 1024
export const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

export type CreateSnapInput = SnagMeta & {
  senderId: string
  recipientIds: string[]
  isStory: boolean
  bytes: ArrayBuffer
  mediaType: string
  caption: string | null
  duration: number
  parentSnagId?: string | null
  contentHash?: string | null
}

export type CreatedSnap = { ids: string[]; key: string }

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function parseMeta(row: {
  palette?: string | null
  dominant_hue?: number | null
  tags?: string | null
  layout?: string | null
}): SnagMeta {
  return {
    palette: safeJson<string[]>(row.palette, []),
    dominantHue: row.dominant_hue ?? null,
    tags: safeJson<string[]>(row.tags, []),
    layout: safeJson<SnagLayout | null>(row.layout, null),
  }
}

export async function createSnap(input: CreateSnapInput): Promise<CreatedSnap> {
  const { DB, FILES } = await getEnv()
  const now = Date.now()
  const key = `snags/${input.senderId}/${crypto.randomUUID()}`
  const duration = Math.min(10, Math.max(1, Math.round(input.duration || 3)))
  const expiresAt = now + DM_SNAP_TTL_MS

  await FILES.put(key, input.bytes, { httpMetadata: { contentType: input.mediaType } })

  const ids: string[] = []
  const statements: D1PreparedStatement[] = []
  const palette = JSON.stringify(input.palette.slice(0, 5))
  const tags = JSON.stringify(input.tags.slice(0, 8))
  const layout = input.layout ? JSON.stringify(input.layout) : null

  if (input.isStory) {
    const id = crypto.randomUUID()
    ids.push(id)
    statements.push(
      DB.prepare(
        `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                            created_at, expires_at, palette, dominant_hue, tags, layout, parent_snag_id, content_hash)
         VALUES (?, ?, NULL, 1, 'flash', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        input.senderId,
        key,
        input.mediaType,
        input.caption,
        duration,
        now,
        expiresAt,
        palette,
        input.dominantHue,
        tags,
        layout,
        input.parentSnagId ?? null,
        input.contentHash ?? null
      )
    )
  }

  for (const recipientId of input.recipientIds) {
    const id = crypto.randomUUID()
    ids.push(id)
    statements.push(
      DB.prepare(
        `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                            created_at, expires_at, palette, dominant_hue, tags, layout, parent_snag_id, content_hash)
         VALUES (?, ?, ?, 0, 'dm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        input.senderId,
        recipientId,
        key,
        input.mediaType,
        input.caption,
        duration,
        now,
        expiresAt,
        palette,
        input.dominantHue,
        tags,
        layout,
        input.parentSnagId ?? null,
        input.contentHash ?? null
      )
    )
    statements.push(
      DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, kind, body, snap_id, created_at, is_ephemeral, expires_at)
         VALUES (?, ?, ?, ?, 'snap', ?, ?, ?, 1, ?)`
      ).bind(
        crypto.randomUUID(),
        input.senderId < recipientId ? `${input.senderId}:${recipientId}` : `${recipientId}:${input.senderId}`,
        input.senderId,
        recipientId,
        input.caption,
        id,
        now,
        expiresAt
      )
    )
  }

  if (statements.length > 0) await DB.batch(statements)
  return { ids, key }
}

export type SnapRow = {
  id: string
  sender_id: string
  recipient_id: string | null
  is_story: number
  stream: string
  r2_key: string
  media_type: string
  caption: string | null
  duration: number
  created_at: number
  viewed_at: number | null
  deleted_at: number | null
  is_ephemeral: number
  saved: number
  saved_at: number | null
  expires_at: number | null
  palette: string | null
  dominant_hue: number | null
  tags: string | null
  layout: string | null
  parent_snag_id: string | null
  content_hash: string | null
  vault_count: number
}

export function isAnchored(snap: Pick<SnapRow, 'saved' | 'vault_count' | 'is_ephemeral'>): boolean {
  return snap.saved === 1 || snap.vault_count > 0 || snap.is_ephemeral === 0
}

export type SnapOpenResult =
  | {
      ok: true
      key: string
      mediaType: string
      duration: number
      caption: string | null
      firstView: boolean
      isAnchored: boolean
    }
  | { ok: false; status: number; error: string }

const REOPEN_WINDOW = 60_000

export async function openSnap(snapId: string, viewerId: string, peek = false): Promise<SnapOpenResult> {
  const { DB } = await getEnv()
  const snap = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(snapId).first<SnapRow>()
  if (!snap) return { ok: false, status: 404, error: 'Snap not found' }
  if (snap.deleted_at) return { ok: false, status: 410, error: 'This snag is gone' }
  if (snap.expires_at !== null && snap.expires_at <= Date.now() && !isAnchored(snap)) {
    return { ok: false, status: 410, error: 'This snag expired' }
  }

  const base = {
    key: snap.r2_key,
    mediaType: snap.media_type,
    duration: snap.duration,
    caption: snap.caption,
    isAnchored: isAnchored(snap),
  }

  if (snap.stream === 'flash' || snap.is_story === 1) {
    // Flash is public discovery: any signed-in snagger may watch it.
    if (!peek) {
      await DB.prepare(`INSERT OR IGNORE INTO snap_views (snap_id, viewer_id, viewed_at) VALUES (?, ?, ?)`)
        .bind(snap.id, viewerId, Date.now())
        .run()
    }
    return { ok: true, ...base, firstView: !peek }
  }

  if (snap.sender_id === viewerId) return { ok: true, ...base, firstView: false }
  if (snap.recipient_id !== viewerId) return { ok: false, status: 403, error: 'Not your snag' }

  const now = Date.now()
  // A pinned or vaulted snag is permanent, so the one-look window no longer applies.
  if (isAnchored(snap)) return { ok: true, ...base, firstView: false }
  if (peek) return { ok: true, ...base, firstView: false }
  if (snap.viewed_at === null) {
    await DB.prepare(`UPDATE snaps SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL`).bind(now, snap.id).run()
    return { ok: true, ...base, firstView: true }
  }
  if (now - snap.viewed_at < REOPEN_WINDOW) return { ok: true, ...base, firstView: false }
  return { ok: false, status: 410, error: 'This snag is gone' }
}

/**
 * Called when the viewer finishes watching. Unsaved sibling copies die
 * immediately; the object itself survives if any saved or vaulted row still
 * points at it (that is the dual state, enforced at the storage layer).
 */
export async function finishView(
  snapId: string,
  viewerId: string
): Promise<{ deletedRows: number; keptBytes: boolean }> {
  const { DB, FILES } = await getEnv()
  const snap = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(snapId).first<SnapRow>()
  if (!snap) return { deletedRows: 0, keptBytes: false }

  if (snap.stream === 'flash' || snap.is_story === 1) {
    await DB.prepare(`INSERT OR IGNORE INTO snap_views (snap_id, viewer_id, viewed_at) VALUES (?, ?, ?)`)
      .bind(snap.id, viewerId, Date.now())
      .run()
    return { deletedRows: 0, keptBytes: true }
  }

  if (snap.recipient_id === viewerId && snap.viewed_at === null) {
    await DB.prepare(`UPDATE snaps SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL`)
      .bind(Date.now(), snap.id)
      .run()
  }

  const pending = await DB.prepare(
    `SELECT COUNT(*) AS n FROM snaps
      WHERE r2_key = ? AND deleted_at IS NULL AND viewed_at IS NULL
        AND is_ephemeral = 1 AND saved = 0 AND vault_count = 0`
  )
    .bind(snap.r2_key)
    .first<{ n: number }>()

  const kept = await DB.prepare(
    `SELECT COUNT(*) AS n FROM snaps
      WHERE r2_key = ? AND deleted_at IS NULL AND (is_ephemeral = 0 OR saved = 1 OR vault_count > 0)`
  )
    .bind(snap.r2_key)
    .first<{ n: number }>()

  const keptBytes = (kept?.n ?? 0) > 0
  if ((pending?.n ?? 0) > 0) return { deletedRows: 0, keptBytes }

  const now = Date.now()
  const marked = await DB.prepare(
    `UPDATE snaps SET deleted_at = ?1
      WHERE r2_key = ?2 AND deleted_at IS NULL AND is_ephemeral = 1 AND saved = 0 AND vault_count = 0`
  )
    .bind(now, snap.r2_key)
    .run()

  if (!keptBytes) {
    try {
      await FILES.delete(snap.r2_key)
    } catch {
      // Already gone.
    }
  }

  return { deletedRows: marked.meta?.changes ? Number(marked.meta.changes) : 0, keptBytes }
}

export async function readSnapBytes(key: string): Promise<R2ObjectBody | null> {
  const { FILES } = await getEnv()
  return FILES.get(key)
}

/** Save-in-chat persistence override: pins the snag and its message permanently. */
export async function setSavedState(
  snapId: string,
  viewerId: string,
  saved: boolean
): Promise<{ ok: boolean; error?: string; saved?: boolean }> {
  const { DB } = await getEnv()
  const snap = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(snapId).first<SnapRow>()
  if (!snap) return { ok: false, error: 'Snag not found' }
  const allowed = snap.sender_id === viewerId || snap.recipient_id === viewerId
  if (!allowed) return { ok: false, error: 'Not your snag' }

  const now = Date.now()
  if (saved) {
    await DB.batch([
      DB.prepare(`UPDATE snaps SET saved = 1, saved_at = ?, is_ephemeral = 0, expires_at = NULL WHERE id = ?`).bind(
        now,
        snapId
      ),
      DB.prepare(
        `UPDATE messages SET saved = 1, saved_at = ?, is_ephemeral = 0, expires_at = NULL WHERE snap_id = ?`
      ).bind(now, snapId),
    ])
  } else {
    await DB.batch([
      DB.prepare(
        `UPDATE snaps SET saved = 0, saved_at = NULL, is_ephemeral = ?, expires_at = COALESCE(expires_at, created_at + ?)
          WHERE id = ?`
      ).bind(snap.vault_count > 0 ? 0 : 1, DM_SNAP_TTL_MS, snapId),
      DB.prepare(
        `UPDATE messages SET saved = 0, saved_at = NULL, is_ephemeral = 1, expires_at = COALESCE(expires_at, created_at + ?)
          WHERE snap_id = ?`
      ).bind(DM_SNAP_TTL_MS, snapId),
    ])
  }
  return { ok: true, saved }
}

/** Re-snag: a new flash entry that keeps lineage to the original media. */
export async function resnag(snapId: string, userId: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { DB } = await getEnv()
  const parent = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(snapId).first<SnapRow>()
  if (!parent) return { ok: false, error: 'Snag not found' }
  if (parent.deleted_at) return { ok: false, error: 'That snag is gone' }

  const id = crypto.randomUUID()
  const now = Date.now()
  await DB.prepare(
    `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                        created_at, expires_at, palette, dominant_hue, tags, layout, parent_snag_id, content_hash)
     VALUES (?, ?, NULL, 1, 'flash', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      parent.r2_key,
      parent.media_type,
      parent.caption,
      parent.duration,
      now,
      now + DM_SNAP_TTL_MS,
      parent.palette,
      parent.dominant_hue,
      parent.tags,
      parent.layout,
      parent.id,
      parent.content_hash
    )
    .run()

  return { ok: true, id }
}

export async function canSeeSnag(snap: SnapRow, viewerId: string): Promise<boolean> {
  if (snap.sender_id === viewerId) return true
  if (snap.stream === 'flash' || snap.is_story === 1) return true
  if (snap.recipient_id === viewerId) return true
  return false
}

export { areFriends }
