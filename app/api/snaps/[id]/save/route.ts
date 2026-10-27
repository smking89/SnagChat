import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { setSavedState } from '@/lib/snaps'

type Params = { params: Promise<{ id: string }> }

/** The deterministic persistence override behind a long-press on a snag. */
export async function POST(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params

  const body = (await request.json().catch(() => null)) as { saved?: unknown } | null
  const saved = body?.saved !== false

  const result = await setSavedState(id, user.id, saved)
  if (!result.ok) return json({ error: result.error }, result.error === 'Not your snag' ? 403 : 404)
  return json({ ok: true, saved: result.saved })
}
