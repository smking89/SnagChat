import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { finishView } from '@/lib/snaps'

type Params = { params: Promise<{ id: string }> }

/** Called when the viewer closes a snag: unsaved copies die once everyone has looked. */
export async function POST(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params
  const result = await finishView(id, user.id)
  return json({ ok: true, ...result })
}
