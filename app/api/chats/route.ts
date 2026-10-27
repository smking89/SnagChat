import { getSession, json, unauthorized } from '@/lib/api'
import { maybeSweep } from '@/lib/invalidation'
import { listChats } from '@/lib/social'

export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  await maybeSweep()
  return json({ user, chats: await listChats(user.id) })
}
