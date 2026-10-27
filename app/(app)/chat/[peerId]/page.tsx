import { notFound } from 'next/navigation'

import { ChatScreen } from '@/components/ChatScreen'
import { requireSession } from '@/lib/api'
import { getThread } from '@/lib/social'

export const dynamic = 'force-dynamic'

export default async function ChatPage({ params }: { params: Promise<{ peerId: string }> }) {
  const user = await requireSession()
  const { peerId } = await params
  const thread = await getThread(user.id, peerId)
  if (!thread) notFound()
  return <ChatScreen me={user} peer={thread.peer} />
}
