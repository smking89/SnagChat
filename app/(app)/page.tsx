import { CameraScreen } from '@/components/CameraScreen'
import { requireSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function CameraPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; story?: string }>
}) {
  const user = await requireSession()
  const params = await searchParams
  return <CameraScreen me={user} initialRecipient={params.to} initialStory={params.story === '1'} />
}
