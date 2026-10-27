import { clientKey, isSameOrigin, json, jsonWithCookie } from '@/lib/api'
import { createSession, hashPassword, hitThrottle, looksLikeEmail, normalizeEmail, sessionCookie } from '@/lib/auth'
import { createUser, ensureSchema, findUserByEmail, toPublicUser } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD = 10

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; displayName?: unknown }
    | null
  if (!body) return json({ error: 'Invalid request' }, 400)

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ').slice(0, 28) : ''

  if (!looksLikeEmail(email)) return json({ error: 'That email address does not look right' }, 400)
  if (displayName.length < 2) return json({ error: 'Pick a name with at least 2 characters' }, 400)
  if (password.length < MIN_PASSWORD) {
    return json({ error: `Use at least ${MIN_PASSWORD} characters for your password` }, 400)
  }
  if (password.length > 200) return json({ error: 'That password is too long' }, 400)

  const limit = await hitThrottle(`register:${clientKey(request)}`, 10, 60 * 60 * 1000)
  if (!limit.allowed) {
    return json({ error: `Too many sign-ups from here. Try again in ${limit.retryAfterSeconds}s.` }, 429)
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    return json({ error: 'That email already has an account. Sign in instead.' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const user = await createUser({
    id: `usr_${crypto.randomUUID()}`,
    displayName,
    email,
    passwordHash,
    usernameSeed: displayName,
  })

  const session = await createSession(user.id)
  return jsonWithCookie({ ok: true, user: toPublicUser(user) }, sessionCookie(session.token), 201)
}
