import { clientKey, isSameOrigin, json, jsonWithCookie } from '@/lib/api'
import {
  consumeAuthToken,
  createSession,
  destroyUserSessions,
  hashPassword,
  hitThrottle,
  sessionCookie,
} from '@/lib/auth'
import { ensureSchema, findUserById, getEnv, toPublicUser } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD = 10

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as { token?: unknown; password?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!token) return json({ error: 'That reset link is incomplete' }, 400)
  if (password.length < MIN_PASSWORD) {
    return json({ error: `Use at least ${MIN_PASSWORD} characters for your password` }, 400)
  }
  if (password.length > 200) return json({ error: 'That password is too long' }, 400)

  const limit = await hitThrottle(`reset:${clientKey(request)}`, 20, 60 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many attempts. Try again later.' }, 429)

  const userId = await consumeAuthToken(token, 'reset_password')
  if (!userId) return json({ error: 'That link has expired. Request a new one.' }, 400)

  const user = await findUserById(userId)
  if (!user) return json({ error: 'That account is gone' }, 400)

  const { DB } = await getEnv()
  await DB.prepare(`UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(password), Date.now(), userId)
    .run()

  // A reset means "sign out everywhere else", then sign this browser in.
  await destroyUserSessions(userId)
  const session = await createSession(userId)
  return jsonWithCookie({ ok: true, user: toPublicUser(user) }, sessionCookie(session.token))
}
