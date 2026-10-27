import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { getEnv } from '@/lib/db'

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  return json({ user })
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => null)) as
    | { displayName?: unknown; hue?: unknown }
    | null
  if (!body) return json({ error: 'Invalid body' }, 400)

  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ').slice(0, 28) : null
  const hue = typeof body.hue === 'number' && Number.isFinite(body.hue) ? Math.round(body.hue) % 360 : null

  if (displayName !== null && displayName.length < 2) {
    return json({ error: 'Pick a name with at least 2 characters' }, 400)
  }

  const { DB } = await getEnv()
  await DB.prepare(
    `UPDATE users SET display_name = COALESCE(?, display_name), hue = COALESCE(?, hue)
      WHERE id = ?`
  )
    .bind(displayName, hue, user.id)
    .run()

  const updated = await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.id).first<Record<string, unknown>>()
  return json({
    ok: true,
    user: updated
      ? {
          id: updated.id,
          username: updated.username,
          displayName: updated.display_name,
          hue: updated.hue,
          isDemo: updated.is_demo === 1,
        }
      : user,
  })
}
