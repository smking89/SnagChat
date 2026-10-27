import { cookies } from 'next/headers'

import { DEMO_COOKIE, isSameOrigin, json } from '@/lib/api'
import { findUserById, toPublicUser } from '@/lib/db'
import { createDemoAccount } from '@/lib/demo'

const THIRTY_DAYS = 60 * 60 * 24 * 30

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)

  const store = await cookies()
  const existingId = store.get(DEMO_COOKIE)?.value
  if (existingId) {
    const existing = await findUserById(existingId)
    if (existing && existing.is_demo === 1) {
      return json({ ok: true, user: toPublicUser(existing) })
    }
  }

  const demo = await createDemoAccount()
  store.set(DEMO_COOKIE, demo.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
    secure: new URL(request.url).protocol === 'https:',
  })
  return json({ ok: true, user: toPublicUser(demo) })
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const store = await cookies()
  store.delete(DEMO_COOKIE)
  return json({ ok: true })
}
