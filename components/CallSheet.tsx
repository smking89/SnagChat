'use client'

import { CALL_COMING_SOON_COPY, type CallKind } from '@/lib/features'
import type { PublicUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { PhoneIcon, VideoIcon } from './icons'

export function CallSheet({ kind, peer, onClose }: { kind: CallKind; peer: PublicUser; onClose: () => void }) {
  const copy = CALL_COMING_SOON_COPY[kind]
  const Icon = kind === 'video' ? VideoIcon : PhoneIcon

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-t-3xl border border-hair bg-white p-5 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar user={peer} size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{peer.displayName}</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
              {kind === 'video' ? 'video call' : 'audio call'}
            </p>
          </div>
          <span className="ml-auto rounded-full border border-hair bg-panel px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            soon
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-hair bg-panel p-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-ink" />
            <p className="text-sm font-bold text-ink">{copy.title}</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{copy.body}</p>
          <ul className="mt-3 space-y-1 text-[11px] text-muted">
            <li>· no call is placed and nobody is notified</li>
            <li>· nothing is recorded</li>
            <li>· snaps and chat keep working as they do now</li>
          </ul>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-hair bg-white px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Got it
          </button>
          <button
            type="button"
            disabled
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-hair bg-panel px-4 py-2.5 text-sm font-bold text-muted"
          >
            <Icon className="h-4 w-4" />
            Call disabled
          </button>
        </div>
      </div>
    </div>
  )
}
