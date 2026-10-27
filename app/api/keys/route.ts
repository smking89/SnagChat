import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { createApiKey, listApiKeys } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_KEYS = 10

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  await ensureSchema()
  return json({ keys: await listApiKeys(user.id) })
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 40) : ''
  if (name.length < 2) return json({ error: 'Give the key a name so you can recognise it later' }, 400)

  const existing = await listApiKeys(user.id)
  if (existing.filter((key) => !key.revokedAt).length >= MAX_KEYS) {
    return json({ error: `That is ${MAX_KEYS} active keys. Revoke one first.` }, 409)
  }

  const created = await createApiKey(user.id, name)
  // The only time the plaintext key is ever returned.
  return json({ key: created.key, meta: created.summary }, 201)
}
