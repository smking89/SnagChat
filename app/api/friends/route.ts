import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { findUserByUsername, linkFriends, toPublicUser } from '@/lib/db'
import { listFriends } from '@/lib/social'

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  return json({ friends: await listFriends(user.id) })
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => null)) as { username?: unknown } | null
  const username = typeof body?.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : ''
  if (!username) return json({ error: 'Enter a username' }, 400)
  if (username === user.username) return json({ error: 'That is you' }, 400)

  const target = await findUserByUsername(username)
  if (!target) return json({ error: `No snagger called @${username}` }, 404)

  await linkFriends(user.id, target.id)
  return json({ ok: true, friend: toPublicUser(target) })
}
