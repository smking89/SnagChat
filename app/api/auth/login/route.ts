import { clientKey, isSameOrigin, json, jsonWithCookie } from '@/lib/api'
import {
  clearThrottle,
  createSession,
  hitThrottle,
  normalizeEmail,
  pruneAuthRows,
  sessionCookie,
  verifyPassword,
} from '@/lib/auth'
import { ensureSchema, findUserByEmail, toPublicUser } from '@/lib/db'

export const dynamic = 'force-dynamic'

// One message for every failure: a stranger cannot use sign-in to discover
// which addresses have accounts.
const REJECTED = 'Email or password is not right.'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
  if (!body) return json({ error: 'Invalid request' }, 400)

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return json({ error: REJECTED }, 401)

  const byEmail = await hitThrottle(`login:${email}`, 10, 15 * 60 * 1000)
  const byIp = await hitThrottle(`login-ip:${clientKey(request)}`, 30, 15 * 60 * 1000)
  if (!byEmail.allowed || !byIp.allowed) {
    const retry = Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds)
    return json({ error: `Too many attempts. Try again in ${Math.ceil(retry / 60)} minutes.` }, 429)
  }

  const user = await findUserByEmail(email)
  // Demo accounts have no password; verifyPassword returns false for a null hash.
  const ok = user ? await verifyPassword(password, user.password_hash) : false
  if (!user || !ok || user.is_demo === 1) {
    return json({ error: REJECTED }, 401)
  }

  await clearThrottle(`login:${email}`)
  void pruneAuthRows().catch(() => {})
  const session = await createSession(user.id)
  return jsonWithCookie({ ok: true, user: toPublicUser(user) }, sessionCookie(session.token))
}
