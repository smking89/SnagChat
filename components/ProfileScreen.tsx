'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import type { PublicUser } from '@/lib/types'
import { Avatar, BrandMark } from './Avatar'
import { CheckIcon, ChevronRightIcon, PlusIcon } from './icons'

export function ProfileScreen({ me }: { me: PublicUser }) {
  const router = useRouter()
  const [user, setUser] = useState<PublicUser>(me)
  const [displayName, setDisplayName] = useState(me.displayName)
  const [friends, setFriends] = useState<PublicUser[]>([])
  const [newFriend, setNewFriend] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/friends', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { friends: [] }))
      .then((data: { friends?: PublicUser[] }) => setFriends(data.friends ?? []))
      .catch(() => {})
  }, [])

  const dirty = displayName.trim() !== user.displayName

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const data = (await response.json().catch(() => ({}))) as { user?: PublicUser; error?: string }
      if (!response.ok || !data.user) throw new Error(data.error ?? 'Could not save that')
      setUser(data.user)
      setDisplayName(data.user.displayName)
      setMessage({ tone: 'ok', text: 'Saved' })
      router.refresh()
    } catch (err) {
      setMessage({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save that' })
    } finally {
      setBusy(false)
    }
  }

  async function addFriend(event: React.FormEvent) {
    event.preventDefault()
    if (!newFriend.trim() || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newFriend }),
      })
      const data = (await response.json().catch(() => ({}))) as { friend?: PublicUser; error?: string }
      if (!response.ok || !data.friend) throw new Error(data.error ?? 'Could not add that snagger')
      setFriends((current) =>
        current.some((entry) => entry.id === data.friend!.id) ? current : [...current, data.friend!]
      )
      setNewFriend('')
      setMessage({ tone: 'ok', text: `Added ${data.friend.displayName}` })
    } catch (err) {
      setMessage({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not add that snagger' })
    } finally {
      setBusy(false)
    }
  }

  async function leaveDemo() {
    setBusy(true)
    await fetch('/api/demo', { method: 'DELETE' }).catch(() => {})
    router.push('/welcome')
    router.refresh()
  }

  async function signOut() {
    setBusy(true)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    router.push('/auth/sign-in')
    router.refresh()
  }

  return (
    <div className="scroll-area no-scrollbar">
      <header className="px-4 pb-4 pt-5">
        <h1 className="text-2xl font-black tracking-tight text-ink">You</h1>
        <p className="text-xs text-muted">your handle, your crew, your snaps</p>
      </header>

      <section className="mx-4 flex items-center gap-4 rounded-3xl border border-hair bg-panel p-4">
        <Avatar user={user} size={72} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-ink">{user.displayName}</p>
          <p className="truncate text-sm text-muted">@{user.username}</p>
          <p className="mt-1 text-[11px] text-muted">
            {user.isDemo ? 'temporary demo account' : 'signed in with Freebuff'}
          </p>
        </div>
        <BrandMark size={28} />
      </section>

      <section className="mx-4 mt-4 rounded-3xl border border-hair bg-panel p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Profile</h2>

        <label className="mt-3 block text-[11px] text-muted" htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value.slice(0, 28))}
          className="mt-1 w-full rounded-xl border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-ink"
        />
        <p className="mt-2 text-[11px] text-muted">
          Your avatar is your initials. No emoji, no colour noise.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            <CheckIcon className="h-4 w-4" strokeWidth={2.6} /> Save
          </button>
          {message ? (
            <span className={`text-xs ${message.tone === 'ok' ? 'text-muted' : 'text-snap-pink'}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      </section>

      <Link
        href="/developers"
        className="mx-4 mt-4 flex items-center justify-between rounded-3xl border border-hair bg-panel p-4 transition hover:bg-panel-2"
      >
        <span>
          <span className="block text-sm font-semibold text-ink">Developer portal</span>
          <span className="block text-[11px] text-muted">API keys and the read API</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
      </Link>

      <section className="mx-4 mt-4 rounded-3xl border border-hair bg-panel p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Friends · {friends.length}
        </h2>
        <form onSubmit={addFriend} className="mt-3 flex gap-2">
          <input
            value={newFriend}
            onChange={(event) => setNewFriend(event.target.value)}
            placeholder="@username"
            className="flex-1 rounded-xl border border-hair bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || !newFriend.trim()}
            className="grid w-11 place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
            aria-label="Add friend"
          >
            <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </form>
        <p className="mt-2 text-[11px] text-muted">Share your handle: @{user.username}</p>

        <ul className="mt-3 divide-y divide-hair">
          {friends.length === 0 ? (
            <li className="py-3 text-xs text-muted">No friends yet. Add one above.</li>
          ) : (
            friends.map((friend) => (
              <li key={friend.id} className="flex items-center gap-3 py-2.5">
                <Avatar user={friend} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{friend.displayName}</p>
                  <p className="truncate text-[11px] text-muted">@{friend.username}</p>
                </div>
                <Link
                  href={`/chat/${friend.id}`}
                  className="rounded-full border border-hair bg-white px-3 py-1 text-[11px] font-semibold text-ink transition hover:border-ink"
                >
                  Chat
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mx-4 mt-4 rounded-3xl border border-hair bg-panel p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Ephemeral by design</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Every snag is born ephemeral. Direct snags are wiped once the last recipient looks; flash entries leave the
          stream after 24 hours; unsaved chat text expires on its own. Long-press a snag to pin it in the chat, or
          anchor it to a vault board to make it permanent. Nothing is resurfaced by a refresh.
        </p>
        <div className="mt-4">
          {user.isDemo ? (
            <button
              type="button"
              onClick={leaveDemo}
              className="w-full rounded-xl border border-hair bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Leave demo
            </button>
          ) : (
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="w-full rounded-xl border border-hair bg-white px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
            >
              Sign out
            </button>
          )}
        </div>
      </section>

      <p className="py-6 text-center text-[11px] text-muted">
        SnagChat ·{' '}
        <Link href="/about" className="text-ink underline underline-offset-2">
          about
        </Link>
      </p>
    </div>
  )
}
