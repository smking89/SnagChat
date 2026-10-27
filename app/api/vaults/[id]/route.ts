import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { getEnv } from '@/lib/db'
import { getVault } from '@/lib/vaults'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params
  const detail = await getVault(user.id, id)
  if (!detail) return json({ error: 'Board not found' }, 404)
  return json(detail)
}

/** Deleting a board releases its anchor: snags with no other home become ephemeral again. */
export async function DELETE(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params

  const { DB } = await getEnv()
  const vault = await DB.prepare(`SELECT id FROM vaults WHERE id = ? AND owner_id = ?`)
    .bind(id, user.id)
    .first<{ id: string }>()
  if (!vault) return json({ error: 'Board not found' }, 404)

  const snags = await DB.prepare(`SELECT snag_id FROM vault_entries WHERE vault_id = ?`).bind(id).all<{ snag_id: string }>()
  await DB.prepare(`DELETE FROM vault_entries WHERE vault_id = ?`).bind(id).run()
  await DB.prepare(`DELETE FROM vaults WHERE id = ?`).bind(id).run()

  for (const row of snags.results ?? []) {
    await DB.prepare(
      `UPDATE snaps SET vault_count = (SELECT COUNT(*) FROM vault_entries ve WHERE ve.snag_id = snaps.id) WHERE id = ?`
    )
      .bind(row.snag_id)
      .run()
  }

  return json({ ok: true })
}
