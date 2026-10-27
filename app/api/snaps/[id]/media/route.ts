import { getSession, json, unauthorized } from '@/lib/api'
import { openSnap, readSnapBytes } from '@/lib/snaps'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const user = await getSession()
  if (!user) return unauthorized()
  const { id } = await params
  // ?peek=1 serves a thumbnail without consuming the view-once lifecycle.
  const peek = new URL(request.url).searchParams.get('peek') === '1'

  const access = await openSnap(id, user.id, peek)
  if (!access.ok) return json({ error: access.error }, access.status)

  const object = await readSnapBytes(access.key)
  if (!object) {
    return json({ error: 'This snap is gone' }, 410)
  }

  const headers = new Headers({
    'Content-Type': access.mediaType,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    // Media served from our origin must never run script.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    'X-Snap-Duration': String(access.duration),
    'X-Snap-First-View': access.firstView ? '1' : '0',
  })

  return new Response(object.body, { headers })
}
