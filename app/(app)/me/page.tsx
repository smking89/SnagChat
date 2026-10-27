import { ProfileScreen } from '@/components/ProfileScreen'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await requireSession()
  return <ProfileScreen me={user} />
}
