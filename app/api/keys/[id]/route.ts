import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { revokeApiKey } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  await ensureSchema()

  const { id } = await params
  const revoked = await revokeApiKey(user.id, id)
  if (!revoked) return json({ error: 'No active key with that id' }, 404)
  return json({ ok: true })
}
