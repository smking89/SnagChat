import { apiError, apiJson, authenticateApiRequest, checkWriteBudget } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'
import { deleteSnag, getKeptSnag, updateSnagMeta } from '@/lib/snags'

export const dynamic = 'force-dynamic'

function parseTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
    .slice(0, 8)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const snag = await getKeptSnag(auth.user.id, id)
  if (!snag) return apiError(404, 'not_found', 'No kept snag with that id.')

  return apiJson({
    snag: {
      id: snag.snagId,
      caption: snag.caption,
      mediaType: snag.mediaType,
      createdAt: new Date(snag.createdAt).toISOString(),
      keptAt: new Date(snag.keptAt).toISOString(),
      palette: snag.palette,
      tags: snag.tags,
      note: snag.note,
      overlay: snag.overlay,
    },
  })
}

/** Edit the caption and tags of a snag you sent. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const limited = await checkWriteBudget(auth.keyId)
  if (limited) return limited

  let body: { caption?: unknown; tags?: unknown }
  try {
    body = (await request.json()) as { caption?: unknown; tags?: unknown }
  } catch {
    return apiError(400, 'bad_body', 'Send a JSON body: { "caption": "…", "tags": ["…"] }.')
  }

  if (body.caption === undefined && body.tags === undefined) {
    return apiError(400, 'nothing_to_change', 'Send `caption` and/or `tags`.')
  }
  if (body.caption !== undefined && body.caption !== null && typeof body.caption !== 'string') {
    return apiError(400, 'bad_caption', '`caption` must be a string or null.')
  }
  const tags = body.tags === undefined ? undefined : parseTags(body.tags)
  if (body.tags !== undefined && tags === null) {
    return apiError(400, 'bad_tags', '`tags` must be an array of strings.')
  }

  const { id } = await params
  const result = await updateSnagMeta(auth.user.id, id, {
    caption:
      body.caption === undefined ? undefined : typeof body.caption === 'string' ? body.caption.trim().slice(0, 120) || null : null,
    tags: tags ?? undefined,
  })
  if (!result.ok) return apiError(result.status, result.code, result.error)

  return apiJson({ snag: result.value })
}

/** Delete a snag you sent. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSchema()
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const limited = await checkWriteBudget(auth.keyId)
  if (limited) return limited

  const { id } = await params
  const result = await deleteSnag(auth.user.id, id)
  if (!result.ok) return apiError(result.status, result.code, result.error)

  return apiJson({ ok: true, id: result.value.id })
}
