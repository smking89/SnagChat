import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { maybeSweep } from '@/lib/invalidation'
import { getThread, sendTextMessage } from '@/lib/social'

type Params = { params: Promise<{ peerId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const user = await getSession()
  if (!user) return unauthorized()
  const { peerId } = await params
  await maybeSweep()
  const thread = await getThread(user.id, peerId)
  if (!thread) return json({ error: 'Conversation not found' }, 404)
  return json({ thread })
}

export async function POST(request: Request, { params }: Params) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()
  const { peerId } = await params
  const thread = await getThread(user.id, peerId)
  if (!thread) return json({ error: 'Conversation not found' }, 404)

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 1000) : ''
  if (!text) return json({ error: 'Type something first' }, 400)

  const message = await sendTextMessage(user.id, peerId, text)
  return json({ ok: true, message: { id: message.id, text, createdAt: message.createdAt } })
}
