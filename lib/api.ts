import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { SESSION_COOKIE, findSession } from './auth'
import { ensureSchema, findUserById, toPublicUser } from './db'
import type { PublicUser } from './types'

export const DEMO_COOKIE = 'snag_demo'

/**
 * The signed-in SnagChat user, resolved from our own session cookie.
 *
 * Precedence: an email/password session, then the demo cookie — and the demo
 * cookie is only honoured for rows created as demo accounts, so a forged value
 * can never reach a real person's data.
 */
export async function getSession(): Promise<PublicUser | null> {
  await ensureSchema()
  const store = await cookies()

  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    const userId = await findSession(token)
    if (userId) {
      const row = await findUserById(userId)
      if (row && row.is_demo !== 1) return toPublicUser(row)
    }
  }

  const demoId = store.get(DEMO_COOKIE)?.value
  if (!demoId) return null
  const row = await findUserById(demoId)
  if (!row || row.is_demo !== 1) return null
  return toPublicUser(row)
}

/** Pages: send signed-out visitors to the sign-in screen. */
export async function requireSession(): Promise<PublicUser> {
  const user = await getSession()
  if (!user) redirect('/auth/sign-in')
  return user
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function unauthorized(): Response {
  return json({ error: 'Sign in required' }, 401)
}

/** JSON response that also sets (or clears) the session cookie. */
export function jsonWithCookie(data: unknown, cookie: string, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      'Set-Cookie': cookie,
    },
  })
}

/**
 * CSRF guard for state-changing requests. The Origin header is set by the
 * browser and cannot be forged by page script, so matching it against the
 * canonical origin (or the host actually addressed) is enough. Requests with
 * no Origin at all fall back to Sec-Fetch-Site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')

  if (!origin) {
    const site = request.headers.get('sec-fetch-site')
    return site === 'same-origin' || site === 'none'
  }
  if (origin === 'null') return request.headers.get('sec-fetch-site') === 'same-origin'

  try {
    const originUrl = new URL(origin)
    const canonical = process.env.APP_ORIGIN
    if (canonical) {
      try {
        if (new URL(canonical).host === originUrl.host) return true
      } catch {
        // malformed APP_ORIGIN: fall through to the request host
      }
    }
    if (originUrl.host === new URL(request.url).host) return true
    const host = request.headers.get('host')
    if (host && originUrl.host === host) return true
    const forwarded = request.headers.get('x-forwarded-host')
    return Boolean(forwarded && originUrl.host === forwarded.split(',')[0].trim())
  } catch {
    return false
  }
}

/** Client IP as seen by the platform, for throttling buckets only. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
