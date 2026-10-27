import { apiError, apiJson, authenticateApiRequest } from '@/lib/apiKeys'
import { ensureSchema, findUserByUsername } from '@/lib/db'
import { maybeSweep } from '@/lib/invalidation'
import { getThread } from '@/lib/social'

export const dynamic = 'force-dynamic'

/** One conversation with a person on your crew, oldest message first. */
export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const { handle } = await params
  const peer = await findUserByUsername(handle.replace(/^@/, '').toLowerCase())

  // A handle that is unknown, not a friend, or is the key's own account answers
  // the same 404: the API never confirms whether an account exists.
  if (!peer || peer.id === auth.user.id) return apiError(404, 'not_found', 'No conversation with that handle.')

  await maybeSweep()
  const thread = await getThread(auth.user.id, peer.id)
  if (!thread) return apiError(404, 'not_found', 'No conversation with that handle.')

  return apiJson({
    peer: {
      id: thread.peer.id,
      username: thread.peer.username,
      displayName: thread.peer.displayName,
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      from: message.fromMe ? 'me' : 'them',
      kind: message.kind,
      text: message.body,
      snagId: message.snapId,
      kept: message.saved,
      createdAt: new Date(message.createdAt).toISOString(),
      expiresAt: message.expiresAt === null ? null : new Date(message.expiresAt).toISOString(),
    })),
  })
}
