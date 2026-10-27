import { getSession, json, unauthorized } from '@/lib/api'
import { maybeSweep } from '@/lib/invalidation'
import { listFlash, type FlashScope } from '@/lib/social'

export async function GET(request: Request) {
  const user = await getSession()
  if (!user) return unauthorized()
  await maybeSweep()

  const url = new URL(request.url)
  const scope: FlashScope = url.searchParams.get('scope') === 'discover' ? 'discover' : 'crew'
  const hueParam = Number(url.searchParams.get('hue'))
  const hue = Number.isFinite(hueParam) && url.searchParams.get('hue') !== null ? Math.round(hueParam) % 360 : null

  return json({ scope, hue, items: await listFlash(user.id, scope, hue) })
}
