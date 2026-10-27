'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CallKind } from '@/lib/features'
import { clockTime } from '@/lib/format'
import type { DrawerItem, PublicUser, Thread, ThreadMessage } from '@/lib/types'
import { Avatar } from './Avatar'
import { CallSheet } from './CallSheet'
import {
  BackIcon,
  BookmarkIcon,
  CameraIcon,
  EyeIcon,
  GridIcon,
  PhoneIcon,
  SendIcon,
  VideoIcon,
} from './icons'
import { SnapViewer } from './SnapViewer'
import { VaultPicker } from './VaultPicker'

export function ChatScreen({ me, peer }: { me: PublicUser; peer: PublicUser }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ThreadMessage | null>(null)
  const [sheetFor, setSheetFor] = useState<ThreadMessage | null>(null)
  const [vaultFor, setVaultFor] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [callKind, setCallKind] = useState<CallKind | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastCount = useRef(0)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats/${peer.id}`, { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as { thread: Thread }
      setThread(data.thread)
    } catch {
      // transient; next poll retries
    }
  }, [peer.id])

  useEffect(() => {
    void load()
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const count = thread?.messages.length ?? 0
    if (count !== lastCount.current) {
      lastCount.current = count
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: count > 0 ? 'smooth' : 'auto' })
    }
  }, [thread?.messages.length])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(timeout)
  }, [toast])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setText('')
    setError(null)
    try {
      const response = await fetch(`/api/chats/${peer.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Message did not send')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message did not send')
      setText(value)
    } finally {
      setSending(false)
    }
  }

  async function toggleSave(message: ThreadMessage) {
    if (!message.snapId) return
    const next = !message.saved
    setSheetFor(null)
    const response = await fetch(`/api/snaps/${message.snapId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved: next }),
    }).catch(() => null)
    if (!response || !response.ok) {
      setToast('Could not change that')
      return
    }
    setToast(next ? 'Saved in chat' : 'Back to ephemeral')
    await load()
  }

  function startPress(message: ThreadMessage) {
    longPressed.current = false
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
      setSheetFor(message)
    }, 460)
  }

  function endPress() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function tapSnap(message: ThreadMessage) {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (message.snapId && !message.snapDeleted) setViewing(message)
  }

  const drawer: DrawerItem[] = thread?.drawer ?? []
  let lastDay = ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-hair bg-white/95 px-3 py-2.5 backdrop-blur">
        <Link href="/chat" aria-label="Back to chats" className="rounded-full p-1.5 text-muted hover:bg-panel hover:text-ink">
          <BackIcon className="h-5 w-5" />
        </Link>
        <Avatar user={peer} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{peer.displayName}</p>
          <p className="truncate text-[11px] text-muted">
            @{peer.username} · {thread?.messages.filter((m) => m.expiresAt && !m.saved).length ?? 0} ephemeral
          </p>
        </div>
        <div className="flex items-center">
          {(['audio', 'video'] as const).map((kind) => {
            const Icon = kind === 'video' ? VideoIcon : PhoneIcon
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setCallKind(kind)}
                aria-label={`${kind === 'video' ? 'Video' : 'Audio'} call — coming soon`}
                title={`${kind === 'video' ? 'Video' : 'Audio'} call — coming soon`}
                className="relative rounded-full p-1.5 text-muted transition hover:bg-panel hover:text-ink"
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-muted" />
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open shared media board"
          className={`relative rounded-full p-2 ${drawer.length ? 'bg-ink text-white' : 'bg-panel text-ink'}`}
        >
          <GridIcon className="h-[18px] w-[18px]" />
          {drawer.length ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-white bg-ink px-1 text-[9px] font-bold text-white">
              {drawer.length}
            </span>
          ) : null}
        </button>
        <Link href={`/?to=${peer.id}`} aria-label={`Snag ${peer.displayName}`} className="rounded-full bg-panel p-2 text-ink">
          <CameraIcon className="h-5 w-5" />
        </Link>
      </header>

      <div className="scroll-area no-scrollbar px-3 py-4">
        {thread === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : thread.messages.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Avatar user={peer} size={64} className="mx-auto" />
            <p className="mt-3 text-lg font-semibold text-ink">{peer.displayName}</p>
            <p className="mt-1 text-sm text-muted">No snags yet. Send the first one — it expires once they look.</p>
            <Link
              href={`/?to=${peer.id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white"
            >
              <CameraIcon className="h-4 w-4" /> Take a snag
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {thread.messages.map((message) => {
              const day = new Date(message.createdAt).toDateString()
              const showDay = day !== lastDay
              lastDay = day
              return (
                <div key={message.id}>
                  {showDay ? (
                    <p className="my-3 text-center text-[10px] uppercase tracking-[0.18em] text-muted">
                      {day === new Date().toDateString()
                        ? 'Today'
                        : new Date(message.createdAt).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                    </p>
                  ) : null}

                  {message.kind === 'snap' ? (
                    <div className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                      <button
                        type="button"
                        onPointerDown={() => startPress(message)}
                        onPointerUp={endPress}
                        onPointerLeave={endPress}
                        onContextMenu={(event) => event.preventDefault()}
                        onClick={() => tapSnap(message)}
                        className={`relative flex w-[190px] flex-col gap-1 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98] ${
                          message.snapDeleted
                            ? 'cursor-default border border-hair bg-panel text-muted'
                            : message.saved
                              ? 'border-2 border-ink bg-white text-ink'
                              : message.snapOpened
                                ? 'border border-hair bg-panel text-muted'
                                : 'bg-ink text-white'
                        }`}
                      >
                        {message.palette.length ? (
                          <span className="absolute inset-x-3 top-1 flex gap-1">
                            {message.palette.slice(0, 3).map((hex) => (
                              <span key={hex} className="h-1 w-4 rounded-full" style={{ backgroundColor: hex }} />
                            ))}
                          </span>
                        ) : null}
                        <span className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] opacity-70">
                          <span>{message.fromMe ? 'you sent' : 'snag'}</span>
                          <span className="flex items-center gap-1">
                            {message.saved ? <BookmarkIcon className="h-3 w-3" /> : null}
                            {message.snapOpened || message.snapDeleted ? '' : `${message.snapDuration}s`}
                          </span>
                        </span>
                        <span className="text-[15px] font-bold">
                          {message.snapDeleted
                            ? 'Expired'
                            : message.snapOpened
                              ? 'Opened'
                              : message.saved
                                ? 'Saved'
                                : 'Tap to view'}
                        </span>
                        {message.body ? <span className="truncate text-[11px] opacity-80">{message.body}</span> : null}
                      </button>
                    </div>
                  ) : (
                    <div className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
                          message.fromMe
                            ? 'rounded-br-md bg-ink text-white'
                            : 'rounded-bl-md border border-hair bg-panel text-ink'
                        }`}
                      >
                        {message.body}
                        <span
                          className={`ml-2 inline-flex items-baseline gap-1 align-baseline text-[10px] ${
                            message.fromMe ? 'text-white/60' : 'text-muted'
                          }`}
                        >
                          {message.saved ? <BookmarkIcon className="h-2.5 w-2.5 self-center" /> : null}
                          {clockTime(message.createdAt)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {toast ? (
        <div className="mx-auto mb-1 w-fit rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white pop">{toast}</div>
      ) : null}
      {error ? <p className="px-4 pb-1 text-center text-[11px] text-snap-pink">{error}</p> : null}

      <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-hair px-3 py-2.5">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Chat — clears in 6h unless pinned"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-full border border-hair bg-panel px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition active:scale-95 disabled:opacity-40"
        >
          <SendIcon className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </form>

      {viewing && viewing.snapId ? (
        <SnapViewer
          items={[
            {
              id: viewing.snapId,
              duration: viewing.snapDuration,
              caption: viewing.body,
              kind: 'snap',
              layout: viewing.layout,
              palette: viewing.palette,
              saved: viewing.saved,
            },
          ]}
          title={`Snag from ${viewing.fromMe ? me.displayName : peer.displayName}`}
          subtitle={`${clockTime(viewing.createdAt)} · ${viewing.snapDuration}s`}
          onClose={() => {
            setViewing(null)
            void load()
          }}
          onFinished={() => void load()}
          onToggleSave={(item) => {
            const message = thread?.messages.find((entry) => entry.snapId === item.id)
            if (message) void toggleSave(message)
          }}
          onAddToVault={(item) => setVaultFor(item.id)}
        />
      ) : null}

      {/* long-press action sheet */}
      {sheetFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={() => setSheetFor(null)}>
          <div
            className="w-full max-w-[420px] rounded-t-3xl border border-hair bg-white p-3 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-1 pb-2 text-[11px] uppercase tracking-[0.16em] text-muted">
              {sheetFor.saved ? 'Pinned snag' : 'Ephemeral snag'}
            </p>
            <button
              type="button"
              onClick={() => {
                const message = sheetFor
                setSheetFor(null)
                if (!message.snapDeleted) setViewing(message)
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm text-ink hover:bg-panel"
            >
              <EyeIcon className="h-4 w-4" /> Open
            </button>
            <button
              type="button"
              onClick={() => void toggleSave(sheetFor)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm text-ink hover:bg-panel"
            >
              <BookmarkIcon className="h-4 w-4" />
              {sheetFor.saved ? 'Remove from chat board' : 'Save in chat'}
            </button>
            <button
              type="button"
              onClick={() => {
                const snagId = sheetFor.snapId
                setSheetFor(null)
                if (snagId) setVaultFor(snagId)
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm text-ink hover:bg-panel"
            >
              <GridIcon className="h-4 w-4" /> Anchor to a vault
            </button>
            <button
              type="button"
              onClick={() => setSheetFor(null)}
              className="mt-1 w-full rounded-xl px-3 py-3 text-left text-sm text-muted hover:bg-panel"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* shared media board drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={() => setDrawerOpen(false)}>
          <div
            className="max-h-[70vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl border border-hair bg-white p-4 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Shared media board</h3>
                <p className="text-[11px] text-muted">Pinned snags from this conversation</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full border border-hair px-2.5 py-1 text-xs text-ink"
              >
                Close
              </button>
            </div>
            {drawer.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">
                Nothing pinned yet. Long-press a snag and choose “Save in chat”.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {drawer.map((item) => (
                  <button
                    key={item.snagId}
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false)
                      const message = thread?.messages.find((entry) => entry.snapId === item.snagId)
                      if (message) setViewing(message)
                    }}
                    className="overflow-hidden rounded-lg border border-hair"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/snaps/${item.snagId}/media?peek=1`}
                      alt={item.caption ?? 'Pinned snag'}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {callKind ? <CallSheet kind={callKind} peer={peer} onClose={() => setCallKind(null)} /> : null}

      {vaultFor ? (
        <VaultPicker
          snagId={vaultFor}
          onClose={() => setVaultFor(null)}
          onAdded={(title) => {
            setToast(`Anchored in ${title}`)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}
