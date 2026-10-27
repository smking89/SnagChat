'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { timeAgo } from '@/lib/format'
import type { ChatPreview, PublicUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { BookmarkIcon, ChatIcon, FlameIcon, PlusIcon, SearchIcon, SendIcon } from './icons'

function statusLine(chat: ChatPreview): { text: string; tone: 'snap' | 'muted' | 'mine' } {
  if (chat.unread > 0) return { text: 'New Snap', tone: 'snap' }
  const last = chat.last
  if (!last) return { text: 'Say hi', tone: 'muted' }
  if (last.kind === 'snap') {
    if (last.fromMe) return { text: last.opened ? 'Opened' : 'Delivered', tone: 'muted' }
    return { text: 'Opened', tone: 'muted' }
  }
  return { text: `${last.fromMe ? 'You: ' : ''}${last.body ?? ''}`, tone: last.fromMe ? 'mine' : 'muted' }
}

export function ChatListScreen({ me }: { me: PublicUser }) {
  const [chats, setChats] = useState<ChatPreview[] | null>(null)
  const [query, setQuery] = useState('')
  const [newFriend, setNewFriend] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function load() {
    try {
      const response = await fetch('/api/chats', { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as { chats: ChatPreview[] }
      setChats(data.chats)
    } catch {
      // Keep the last snapshot on a network blip.
    }
  }

  useEffect(() => {
    void load()
    const interval = setInterval(load, 6000)
    return () => clearInterval(interval)
  }, [])

  async function addFriend(event: React.FormEvent) {
    event.preventDefault()
    if (!newFriend.trim() || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newFriend }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not add that snagger')
      setNewFriend('')
      await load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add that snagger')
    } finally {
      setAdding(false)
    }
  }

  const visible = (chats ?? []).filter((chat) => {
    if (!query.trim()) return true
    const needle = query.trim().toLowerCase()
    return (
      chat.peer.displayName.toLowerCase().includes(needle) || chat.peer.username.toLowerCase().includes(needle)
    )
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-hair px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">Chat</h1>
            <p className="text-xs text-muted">
              {chats?.length ?? 0} {chats?.length === 1 ? 'friend' : 'friends'} · snaps vanish after one look
            </p>
          </div>
          <Avatar user={me} size={38} />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-hair bg-panel px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search friends"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
      </header>

      <div className="scroll-area no-scrollbar">
        {chats === null ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <div className="h-12 w-12 animate-pulse rounded-[30%] bg-panel-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-panel-2" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-panel-2" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-hair bg-panel text-ink">
              <ChatIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-lg font-semibold text-ink">
              {query ? 'Nobody by that name' : 'Your chat list is empty'}
            </h2>
            <p className="mx-auto mt-1 max-w-[260px] text-sm text-muted">
              {query
                ? 'Try another name.'
                : 'Add a snagger by username. When they snap you back, a streak starts counting.'}
            </p>
            {!query ? (
              <form onSubmit={addFriend} className="mx-auto mt-5 flex max-w-[320px] gap-2">
                <input
                  value={newFriend}
                  onChange={(event) => setNewFriend(event.target.value)}
                  placeholder="@username"
                  className="flex-1 rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
                />
                <button
                  type="submit"
                  disabled={adding}
                  className="grid place-items-center rounded-xl bg-ink px-3 text-white disabled:opacity-60"
                  aria-label="Add friend"
                >
                  {adding ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <PlusIcon className="h-5 w-5" strokeWidth={2.2} />
                  )}
                </button>
              </form>
            ) : null}
            {addError ? <p className="mt-2 text-xs text-snap-pink">{addError}</p> : null}
            <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-muted">your handle</p>
            <p className="text-sm font-semibold text-ink">@{me.username}</p>
          </div>
        ) : (
          <ul className="pb-4">
            {visible.map((chat) => {
              const status = statusLine(chat)
              return (
                <li key={chat.peer.id}>
                  <Link
                    href={`/chat/${chat.peer.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-panel active:bg-panel-2"
                  >
                    <Avatar user={chat.peer} size={50} ring={chat.unread > 0 ? 'unseen' : 'none'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[15px] font-semibold text-ink">{chat.peer.displayName}</p>
                        {chat.savedCount > 0 ? (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-ink">
                            <BookmarkIcon className="h-3 w-3" />
                            {chat.savedCount}
                          </span>
                        ) : null}
                        {chat.streak > 1 ? (
                          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-ink">
                            <FlameIcon className="h-3 w-3" />
                            {chat.streak}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[11px] text-muted">
                          {chat.last ? timeAgo(chat.last.createdAt) : ''}
                        </span>
                      </div>
                      <p
                        className={`truncate text-[13px] ${
                          status.tone === 'snap'
                            ? 'font-semibold text-ink'
                            : status.tone === 'mine'
                              ? 'text-muted'
                              : 'text-muted'
                        }`}
                      >
                        {status.tone === 'snap' ? (
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ink align-middle" />
                        ) : null}
                        {status.text}
                      </p>
                    </div>
                    {chat.unread > 0 ? (
                      <span className="grid h-6 min-w-6 place-items-center rounded-md bg-ink px-1 text-[11px] font-black text-white">
                        {chat.unread}
                      </span>
                    ) : chat.last?.kind === 'text' && chat.last.fromMe ? (
                      <SendIcon className="h-4 w-4 text-muted" />
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
