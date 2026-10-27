import { ChatListScreen } from '@/components/ChatListScreen'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function ChatListPage() {
  const user = await requireSession()
  return <ChatListScreen me={user} />
}
