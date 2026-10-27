import { clientKey, isSameOrigin, json } from '@/lib/api'
import { hitThrottle } from '@/lib/auth'
import { ensureSchema, findUserByUsername } from '@/lib/db'
import { emailReminderEmail, sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'

const GENERIC = 'If that handle exists, the email address on the account has a reminder waiting.'

/**
 * "I forgot which email I used": look the account up by handle and mail the
 * address on file. The address is never returned to the requester, so this
 * cannot be used to enumerate handles.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  await ensureSchema()

  const body = (await request.json().catch(() => null)) as { handle?: unknown } | null
  const handle =
    typeof body?.handle === 'string' ? body.handle.trim().replace(/^@/, '').toLowerCase().slice(0, 32) : ''
  if (handle.length < 3) return json({ error: 'Enter the handle you signed up with' }, 400)

  const byHandle = await hitThrottle(`forgot-email:${handle}`, 5, 60 * 60 * 1000)
  const byIp = await hitThrottle(`forgot-email-ip:${clientKey(request)}`, 15, 60 * 60 * 1000)
  if (!byHandle.allowed || !byIp.allowed) {
    return json({ error: 'Too many requests. Try again later.' }, 429)
  }

  const user = await findUserByUsername(handle)
  let devAddress: string | undefined

  if (user && user.email && user.password_hash) {
    const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin
    const mail = emailReminderEmail(user.display_name, user.email, `${origin}/auth/sign-in`)
    const result = await sendMail({ to: user.email, ...mail })
    if (!result.delivered && result.reason === 'failed') {
      console.error('[snagchat] email reminder failed:', result.detail)
    }
    if (!result.delivered && process.env.NODE_ENV !== 'production') devAddress = user.email
  }

  return json({ ok: true, message: GENERIC, ...(devAddress ? { devAddress } : {}) })
}
