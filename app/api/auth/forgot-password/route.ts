import { clientKey, isSameOrigin, json } from '@/lib/api'
import { createAuthToken, hitThrottle, looksLikeEmail, normalizeEmail } from '@/lib/auth'
import { ensureSchema, findUserByEmail } from '@/lib/db'
import { passwordResetEmail, sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'

const GENERIC = 'If that email has a SnagChat account, a reset link is on its way.'

/** Same body whether or not the address exists: no account enumeration. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!looksLikeEmail(email)) return json({ error: 'That email address does not look right' }, 400)

  const byEmail = await hitThrottle(`forgot:${email}`, 5, 60 * 60 * 1000)
  const byIp = await hitThrottle(`forgot-ip:${clientKey(request)}`, 15, 60 * 60 * 1000)
  if (!byEmail.allowed || !byIp.allowed) {
    return json({ error: 'Too many reset requests. Try again later.' }, 429)
  }

  const user = await findUserByEmail(email)
  let devLink: string | undefined

  if (user && user.password_hash) {
    const token = await createAuthToken(user.id, 'reset_password')
    const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin
    const link = `${origin}/auth/reset?token=${encodeURIComponent(token)}`
    const mail = passwordResetEmail(user.display_name, link)
    const result = await sendMail({ to: email, ...mail })
    if (!result.delivered && result.reason === 'failed') {
      console.error('[snagchat] password reset email failed:', result.detail)
    }
    // Outside production only: lets the flow be exercised without a mail key.
    if (!result.delivered && process.env.NODE_ENV !== 'production') devLink = link
  }

  return json({ ok: true, message: GENERIC, ...(devLink ? { devLink } : {}) })
}
