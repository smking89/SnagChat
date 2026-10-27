import { cookies } from 'next/headers'

import { DEMO_COOKIE, isSameOrigin, json } from '@/lib/api'
import { clearedSessionCookie, destroySession, SESSION_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)

  const store = await cookies()
  await destroySession(store.get(SESSION_COOKIE)?.value)

  const clear = `${clearedSessionCookie()}, ${DEMO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Set-Cookie': clear },
  })
}
