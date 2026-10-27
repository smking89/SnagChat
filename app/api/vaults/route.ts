import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { createVault, listVaults } from '@/lib/vaults'

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  return json({ vaults: await listVaults(user.id) })
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (title.length < 2) return json({ error: 'Give the board a name' }, 400)

  return json({ ok: true, vault: await createVault(user.id, title) }, 201)
}
