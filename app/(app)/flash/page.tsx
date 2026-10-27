import { FlashScreen } from '@/components/FlashScreen'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function FlashPage() {
  const user = await requireSession()
  return <FlashScreen me={user} />
}
