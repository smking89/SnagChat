/**
 * Feature gates. Calls are scaffolded but intentionally off: there is no
 * signalling, no TURN/STUN, and no media path yet, so every entry point must
 * say "coming soon" rather than pretend to dial.
 */
export const CALL_FEATURE = {
  audio: false,
  video: false,
  label: 'Coming soon',
  eta: 'v1.1',
} as const

export type CallKind = 'audio' | 'video'

export function isCallEnabled(kind: CallKind): boolean {
  return CALL_FEATURE[kind]
}

export function isAnyCallEnabled(): boolean {
  return CALL_FEATURE.audio || CALL_FEATURE.video
}

export const CALL_COMING_SOON_COPY: Record<CallKind, { title: string; body: string }> = {
  audio: {
    title: 'Audio calls are coming soon',
    body: 'Voice calls over the SnagChat signalling layer are in progress. Until then, send a 10-second snag — it disappears exactly like a call would.',
  },
  video: {
    title: 'Video calls are coming soon',
    body: 'Live video needs a signalling channel and a media relay that are not wired up yet. We would rather show nothing than a call button that never connects.',
  },
}
