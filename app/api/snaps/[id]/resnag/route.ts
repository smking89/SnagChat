import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { getEnv } from '@/lib/db'
import { canSeeSnag, resnag, type SnapRow } from '@/lib/snaps'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params

  const { DB } = await getEnv()
  const snap = await DB.prepare(`SELECT * FROM snaps WHERE id = ?`).bind(id).first<SnapRow>()
  if (!snap) return json({ error: 'Snag not found' }, 404)
  if (!(await canSeeSnag(snap, user.id))) return json({ error: 'Not your snag' }, 403)

  const result = await resnag(id, user.id)
  if (!result.ok) return json({ error: result.error }, 410)
  return json({ ok: true, id: result.id })
}
