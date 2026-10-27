import { getSession, isSameOrigin, json, unauthorized } from '@/lib/api'
import { CALL_FEATURE, isCallEnabled, type CallKind } from '@/lib/features'

/**
 * Calls are scaffolded, not implemented. This endpoint reports the capability
 * honestly and refuses to start anything: no signalling, no media, no records.
 */
export async function GET() {
  const user = await getSession()
  if (!user) return unauthorized()
  return json({ audio: CALL_FEATURE.audio, video: CALL_FEATURE.video, label: CALL_FEATURE.label, eta: CALL_FEATURE.eta })
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const user = await getSession()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null
  const kind = body?.kind === 'video' ? 'video' : body?.kind === 'audio' ? 'audio' : null

  if (!kind) return json({ error: 'Specify audio or video' }, 400)
  if (isCallEnabled(kind as CallKind)) {
    return json({ error: 'Call signalling is not implemented' }, 501)
  }

  // Nothing is dialled, queued or recorded: there is no signalling layer yet.
  return json({ error: `${kind} calls are coming soon`, kind, enabled: false, eta: CALL_FEATURE.eta }, 501)
}
