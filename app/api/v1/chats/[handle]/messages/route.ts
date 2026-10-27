import { apiError, apiJson, authenticateApiRequest, checkWriteBudget } from '@/lib/apiKeys'
import { ensureSchema, findUserByUsername } from '@/lib/db'
import { areFriends } from '@/lib/social'
import { sendTextMessage } from '@/lib/social'

export const dynamic = 'force-dynamic'

/** Sends a text message into a conversation with someone on your crew. */
export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const limited = await checkWriteBudget(auth.keyId)
  if (limited) return limited

  const { handle } = await params
  const peer = await findUserByUsername(handle.replace(/^@/, '').toLowerCase())
  if (!peer || peer.id === auth.user.id) return apiError(404, 'not_found', 'No conversation with that handle.')
  if (!(await areFriends(auth.user.id, peer.id))) {
    return apiError(404, 'not_found', 'No conversation with that handle.')
  }

  let body: { text?: unknown } | null
  try {
    body = (await request.json()) as { text?: unknown } | null
  } catch {
    return apiError(400, 'bad_body', 'Send a JSON body: { "text": "…" }.')
  }

  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 1000) : ''
  if (!text) return apiError(400, 'missing_text', '`text` must be a non-empty string, up to 1000 characters.')

  const message = await sendTextMessage(auth.user.id, peer.id, text)

  return apiJson(
    {
      message: {
        id: message.id,
        to: `@${peer.username}`,
        text,
        createdAt: new Date(message.createdAt).toISOString(),
        expiresAt: new Date(message.expiresAt).toISOString(),
      },
    },
    201
  )
}
