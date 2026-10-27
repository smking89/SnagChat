import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { addToVault, removeFromVault } from '@/lib/vaults'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params

  const body = (await request.json().catch(() => null)) as { snagId?: unknown; note?: unknown } | null
  const snagId = typeof body?.snagId === 'string' ? body.snagId : ''
  if (!snagId) return json({ error: 'Which snag?' }, 400)

  const result = await addToVault(user.id, id, snagId, typeof body?.note === 'string' ? body.note.slice(0, 180) : null)
  if (!result.ok) return json({ error: result.error }, result.status ?? 400)
  return json({ ok: true })
}

export async function DELETE(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params

  const url = new URL(request.url)
  const snagId = url.searchParams.get('snagId') ?? ''
  if (!snagId) return json({ error: 'Which snag?' }, 400)

  const result = await removeFromVault(user.id, id, snagId)
  if (!result.ok) return json({ error: result.error }, result.status ?? 400)
  return json({ ok: true })
}
