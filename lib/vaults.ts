import { getEnv, slugifyTitle, toPublicUser, type UserRow } from './db'
import { DM_SNAP_TTL_MS } from './schema'
import { canSeeSnag, parseMeta, type SnapRow } from './snaps'
import type { PublicUser, VaultDetail, VaultItem, VaultSummary } from './types'

export type { VaultDetail, VaultItem, VaultSummary } from './types'

export async function listVaults(ownerId: string): Promise<VaultSummary[]> {
  const { DB } = await getEnv()
  const rows = await DB.prepare(
    `SELECT v.*, (SELECT COUNT(*) FROM vault_entries e WHERE e.vault_id = v.id) AS n
       FROM vaults v WHERE v.owner_id = ? ORDER BY v.updated_at DESC`
  )
    .bind(ownerId)
    .all<{
      id: string
      title: string
      slug: string
      cover_snag_id: string | null
      updated_at: number
      n: number
    }>()

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    count: row.n,
    cover: row.cover_snag_id,
    updatedAt: row.updated_at,
  }))
}

export async function createVault(ownerId: string, title: string): Promise<VaultSummary> {
  const { DB } = await getEnv()
  const id = crypto.randomUUID()
  const now = Date.now()
  const trimmed = title.trim().slice(0, 40) || 'Untitled board'
  let slug = slugifyTitle(trimmed)

  const clash = await DB.prepare(`SELECT 1 AS ok FROM vaults WHERE owner_id = ? AND slug = ?`)
    .bind(ownerId, slug)
    .first<{ ok: number }>()
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

  await DB.prepare(
    `INSERT INTO vaults (id, owner_id, title, slug, cover_snag_id, created_at, updated_at, is_public)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`
  )
    .bind(id, ownerId, trimmed, slug, now, now)
    .run()

  return { id, title: trimmed, slug, count: 0, cover: null, updatedAt: now }
}

async function assertVaultOwner(vaultId: string, userId: string): Promise<{ id: string; title: string } | null> {
  const { DB } = await getEnv()
  const row = await DB.prepare(`SELECT id, title FROM vaults WHERE id = ? AND owner_id = ?`)
    .bind(vaultId, userId)
    .first<{ id: string; title: string }>()
  return row ?? null
}

async function recountAnchor(snagId: string): Promise<void> {
  const { DB } = await getEnv()
  await DB.prepare(
    `UPDATE snaps SET vault_count = (SELECT COUNT(*) FROM vault_entries ve WHERE ve.snag_id = snaps.id) WHERE id = ?`
  )
    .bind(snagId)
    .run()
  // Removing the last anchor hands the snag back to the ephemeral lifecycle:
  // it keeps its original deadline, so an old unanchored snag expires right away.
  await DB.prepare(
    `UPDATE snaps
        SET is_ephemeral = CASE WHEN saved = 1 OR vault_count > 0 THEN 0 ELSE 1 END,
            expires_at = CASE WHEN saved = 1 OR vault_count > 0 THEN NULL
                              ELSE COALESCE(expires_at, created_at + ?) END
      WHERE id = ?`
  )
    .bind(DM_SNAP_TTL_MS, snagId)
    .run()
}

export async function addToVault(
  userId: string,
  vaultId: string,
  snagId: string,
  note?: string | null
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { DB } = await getEnv()
  const vault = await assertVaultOwner(vaultId, userId)
  if (!vault) return { ok: false, error: 'Board not found', status: 404 }

  const snap = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(snagId).first<SnapRow>()
  if (!snap || snap.deleted_at) return { ok: false, error: 'That snag is gone', status: 410 }
  if (!(await canSeeSnag(snap, userId))) return { ok: false, error: 'Not your snag', status: 403 }

  const now = Date.now()
  await DB.prepare(`INSERT OR IGNORE INTO vault_entries (vault_id, snag_id, added_at, position, note) VALUES (?, ?, ?, 0, ?)`)
    .bind(vaultId, snagId, now, note ?? null)
    .run()
  await DB.prepare(`UPDATE vaults SET updated_at = ?, cover_snag_id = COALESCE(cover_snag_id, ?) WHERE id = ?`)
    .bind(now, snagId, vaultId)
    .run()
  await recountAnchor(snagId)
  return { ok: true }
}

export async function removeFromVault(
  userId: string,
  vaultId: string,
  snagId: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { DB } = await getEnv()
  const vault = await assertVaultOwner(vaultId, userId)
  if (!vault) return { ok: false, error: 'Board not found', status: 404 }

  await DB.prepare(`DELETE FROM vault_entries WHERE vault_id = ? AND snag_id = ?`).bind(vaultId, snagId).run()
  await DB.prepare(`UPDATE vaults SET updated_at = ? WHERE id = ?`).bind(Date.now(), vaultId).run()
  await DB.prepare(
    `UPDATE vaults SET cover_snag_id = (SELECT snag_id FROM vault_entries WHERE vault_id = ? ORDER BY added_at LIMIT 1)
      WHERE id = ? AND cover_snag_id = ?`
  )
    .bind(vaultId, vaultId, snagId)
    .run()
  await recountAnchor(snagId)
  return { ok: true }
}

export async function getVault(userId: string, vaultId: string): Promise<VaultDetail | null> {
  const { DB } = await getEnv()
  const vault = await DB.prepare(`SELECT * FROM vaults WHERE id = ? AND owner_id = ?`)
    .bind(vaultId, userId)
    .first<{ id: string; title: string; slug: string; cover_snag_id: string | null; updated_at: number }>()
  if (!vault) return null

  const rows = await DB.prepare(
    `SELECT e.note, e.added_at, s.*, u.id AS u_id, u.username, u.display_name, u.emoji, u.hue, u.is_demo, u.created_at AS u_created
       FROM vault_entries e
       JOIN snaps s ON s.id = e.snag_id
       LEFT JOIN users u ON u.id = s.sender_id
      WHERE e.vault_id = ?
      ORDER BY e.added_at DESC`
  )
    .bind(vaultId)
    .all<
      Record<string, unknown> & {
        note: string | null
        added_at: number
        palette: string | null
        dominant_hue: number | null
        tags: string | null
        layout: string | null
      }
    >()

  const items: VaultItem[] = (rows.results ?? []).map((row) => {
    const meta = parseMeta({
      palette: row.palette as string | null,
      dominant_hue: row.dominant_hue as number | null,
      tags: row.tags as string | null,
      layout: row.layout as string | null,
    })
    const sender =
      row.u_id != null
        ? toPublicUser({
            id: String(row.u_id),
            username: String(row.username),
            display_name: String(row.display_name),
            hue: Number(row.hue),
            is_demo: Number(row.is_demo),
            created_at: Number(row.u_created),
          } as UserRow)
        : null

    return {
      snagId: String(row.id),
      caption: (row.caption as string | null) ?? null,
      mediaType: String(row.media_type),
      createdAt: Number(row.created_at),
      palette: meta.palette,
      layout: meta.layout,
      sender,
      note: row.note,
    }
  })

  return {
    vault: {
      id: vault.id,
      title: vault.title,
      slug: vault.slug,
      count: items.length,
      cover: vault.cover_snag_id,
      updatedAt: vault.updated_at,
    },
    items,
  }
}
