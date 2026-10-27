import { Shell } from '@/components/Shell'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession()
  return <Shell user={user}>{children}</Shell>
}
