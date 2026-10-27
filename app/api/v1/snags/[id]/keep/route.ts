import { apiError, apiJson, authenticateApiRequest, checkWriteBudget } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'
import { keepSnag } from '@/lib/snags'

export const dynamic = 'force-dynamic'

function respond(keep: boolean) {
  return async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await ensureSchema()
    const auth = await authenticateApiRequest(request)
    if (!auth.ok) return auth.response

    const limited = await checkWriteBudget(auth.keyId)
    if (limited) return limited

    const { id } = await params
    const result = await keepSnag(auth.user.id, id, keep)
    if (!result.ok) return apiError(result.status, result.code, result.error)

    return apiJson({ snag: result.value })
  }
}

/** Stop the 24-hour countdown on a snag you sent or received. */
export const POST = respond(true)

/** Release it back to the ephemeral lifecycle. */
export const DELETE = respond(false)
