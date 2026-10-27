/**
 * Kept snags: the media a person has decided to hold on to, and the writes the
 * public API is allowed to make against a snag.
 *
 * In SnagChat the unit is a snag. A kept snag outlives the 24-hour sweep; the
 * storage rows that group them are an internal detail and are never named in
 * the product or the API.
 */

import { getEnv } from './db'
import { DM_SNAP_TTL_MS } from './schema'
import { setSavedState } from './snaps'

export type KeptSnag = {
  snagId: string
  caption: string | null
  mediaType: string
  createdAt: number
  keptAt: number
  palette: string[]
  tags: string[]
  note: string | null
  overlay: string | null
}

type Row = {
  id: string
  caption: string | null
  media_type: string
  created_at: number
  kept_at: number
  palette: string | null
  tags: string | null
  note: string | null
  layout: string | null
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toKeptSnag(row: Row): KeptSnag {
  return {
    snagId: row.id,
    caption: row.caption,
    mediaType: row.media_type,
    createdAt: row.created_at,
    keptAt: row.kept_at,
    palette: parseJson<string[]>(row.palette, []),
    tags: parseJson<string[]>(row.tags, []),
    note: row.note,
    overlay: parseJson<{ overlay?: string }>(row.layout, {}).overlay ?? null,
  }
}

/*
 * A snag is kept when it carries the per-viewer save flag, or when it sits in
 * one of the owner's collections. The collection tables (`vaults`,
 * `vault_entries`) are storage names only — they are joined here and never
 * surface as a resource in the product or the API.
 */
const KEPT_SELECT = `
  SELECT s.id, s.caption, s.media_type, s.created_at,
         COALESCE(e.kept_at, s.saved_at, s.created_at) AS kept_at,
         s.palette, s.tags, e.note, s.layout
    FROM snaps s
    LEFT JOIN (
      SELECT ve.snag_id, MIN(ve.added_at) AS kept_at, MIN(ve.note) AS note
        FROM vault_entries ve
        JOIN vaults v ON v.id = ve.vault_id
       WHERE v.owner_id = ?1
       GROUP BY ve.snag_id
    ) e ON e.snag_id = s.id
   WHERE s.deleted_at IS NULL
     AND (e.snag_id IS NOT NULL OR (s.saved = 1 AND (s.sender_id = ?1 OR s.recipient_id = ?1)))
`

/** Every snag this account has kept, newest first. */
export async function listKeptSnags(ownerId: string, limit = 200): Promise<KeptSnag[]> {
  const { DB } = await getEnv()
  const result = await DB.prepare(`${KEPT_SELECT} ORDER BY kept_at DESC LIMIT ?2`)
    .bind(ownerId, limit)
    .all<Row>()
  return (result.results ?? []).map(toKeptSnag)
}

/** One kept snag, or null if it belongs to somebody else. */
export async function getKeptSnag(ownerId: string, snagId: string): Promise<KeptSnag | null> {
  const { DB } = await getEnv()
  const row = await DB.prepare(`${KEPT_SELECT} AND s.id = ?2 LIMIT 1`)
    .bind(ownerId, snagId)
    .first<Row>()
  return row ? toKeptSnag(row) : null
}

export type SnagWriteResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; error: string }

/** Caption and tags, editable by the snagger who sent it. */
export async function updateSnagMeta(
  ownerId: string,
  snagId: string,
  patch: { caption?: string | null; tags?: string[] }
): Promise<SnagWriteResult<{ id: string; caption: string | null; tags: string[] }>> {
  const { DB } = await getEnv()
  const row = await DB.prepare(`SELECT id, sender_id, caption, tags, deleted_at FROM snaps WHERE id = ?`)
    .bind(snagId)
    .first<{ id: string; sender_id: string; caption: string | null; tags: string | null; deleted_at: number | null }>()

  // Someone else's snag answers the same 404 as a missing one, so ids cannot be probed.
  if (!row || row.sender_id !== ownerId) {
    return { ok: false, status: 404, code: 'not_found', error: 'No snag with that id.' }
  }
  if (row.deleted_at !== null) {
    return { ok: false, status: 410, code: 'gone', error: 'That snag was deleted.' }
  }

  const caption = patch.caption === undefined ? row.caption : patch.caption
  const tags = patch.tags === undefined ? parseJson<string[]>(row.tags, []) : patch.tags

  await DB.prepare(`UPDATE snaps SET caption = ?, tags = ? WHERE id = ?`)
    .bind(caption, JSON.stringify(tags), snagId)
    .run()

  return { ok: true, value: { id: snagId, caption, tags } }
}

/**
 * Removes a snag you sent from every surface. The row is tombstoned rather than
 * dropped, because chat messages and re-snags reference it; the media object is
 * left alone since a re-snag may share it.
 */
export async function deleteSnag(ownerId: string, snagId: string): Promise<SnagWriteResult<{ id: string }>> {
  const { DB } = await getEnv()
  const row = await DB.prepare(`SELECT id, sender_id, deleted_at FROM snaps WHERE id = ?`)
    .bind(snagId)
    .first<{ id: string; sender_id: string; deleted_at: number | null }>()

  if (!row || row.sender_id !== ownerId) {
    return { ok: false, status: 404, code: 'not_found', error: 'No snag with that id.' }
  }
  if (row.deleted_at !== null) {
    return { ok: false, status: 410, code: 'gone', error: 'That snag was already deleted.' }
  }

  const now = Date.now()
  await DB.batch([
    DB.prepare(`UPDATE snaps SET deleted_at = ? WHERE id = ?`).bind(now, snagId),
    DB.prepare(`UPDATE messages SET is_ephemeral = 1, expires_at = COALESCE(expires_at, ?) WHERE snap_id = ?`).bind(
      now,
      snagId
    ),
  ])

  return { ok: true, value: { id: snagId } }
}

/** Save-in-chat on, or off again. A kept snag stops counting down at 24 hours. */
export async function keepSnag(
  ownerId: string,
  snagId: string,
  keep: boolean
): Promise<SnagWriteResult<{ id: string; kept: boolean }>> {
  const result = await setSavedState(snagId, ownerId, keep)
  if (!result.ok) {
    return { ok: false, status: 404, code: 'not_found', error: 'No snag with that id.' }
  }
  return { ok: true, value: { id: snagId, kept: Boolean(result.saved) } }
}

export { DM_SNAP_TTL_MS }
