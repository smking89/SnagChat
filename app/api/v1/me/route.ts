import { apiJson, authenticateApiRequest } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  return apiJson({
    account: {
      id: auth.user.id,
      username: auth.user.username,
      displayName: auth.user.displayName,
      isDemo: auth.user.isDemo,
    },
  })
}
