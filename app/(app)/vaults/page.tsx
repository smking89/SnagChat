import { VaultsScreen } from '@/components/VaultsScreen'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function VaultsPage() {
  const user = await requireSession()
  return <VaultsScreen me={user} />
}
